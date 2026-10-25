// Job 4: revenue model. Recalculates the workbook's own formulas, compares the yearly totals with
// the reference model, then changes three inputs and recalculates again. A workbook with pasted
// values gets the first part right at best; only live formulas get the second.
import path from "node:path";
import ExcelJS from "exceljs";
import FormulaParser from "fast-formula-parser";
import { exists, item, missingOutput, summarize, withinTolerance } from "./common.mjs";
import { BASE_INPUTS, PERTURBATION, referenceYearTotals } from "./revenue-reference.mjs";

const norm = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function columnLetter(column) {
  let letters = "";
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return letters;
}

function plainValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") {
    if (value instanceof Date) return value.getTime();
    if (Array.isArray(value.richText)) return value.richText.map((run) => run.text).join("");
    if ("result" in value) return value.result ?? null;
    if ("text" in value) return value.text;
    return null;
  }
  return value;
}

// fast-formula-parser gets ROUNDUP(1, 0) wrong (2) and rounds 1.005 to 1 at 2 digits. These
// follow Excel: round the decimal value, away from zero for ROUNDUP, towards zero for ROUNDDOWN.
const { FormulaHelpers, Types } = FormulaParser;
function roundTo(value, digits, mode) {
  const factor = 10 ** digits;
  const scaled = Number((Math.abs(value) * factor).toPrecision(15));
  const rounded = mode === "up" ? Math.ceil(scaled) : mode === "down" ? Math.floor(scaled) : Math.round(scaled);
  return (Math.sign(value) * rounded) / factor;
}
const rounding = (mode) => (number, digits) =>
  roundTo(FormulaHelpers.accept(number, Types.NUMBER), FormulaHelpers.accept(digits, Types.NUMBER, 0), mode);
const EXCEL_ROUNDING = { ROUND: rounding("nearest"), ROUNDUP: rounding("up"), ROUNDDOWN: rounding("down") };

/** A workbook as a map of `sheet!A1` to `{ formula, value }`, with sheet names lower-cased. */
function loadCells(workbook) {
  const cells = new Map();
  const sheets = new Map();
  const bounds = new Map();
  for (const worksheet of workbook.worksheets) {
    const sheet = norm(worksheet.name);
    sheets.set(sheet, worksheet);
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        const address = `${sheet}!${columnLetter(column)}${rowNumber}`;
        const formula = cell.type === ExcelJS.ValueType.Formula ? cell.formula : null;
        cells.set(address, { formula: formula ? formula.replace(/^=/, "") : null, value: plainValue(cell.value) });
        const bound = bounds.get(sheet) || { rows: 0, cols: 0 };
        bounds.set(sheet, { rows: Math.max(bound.rows, rowNumber), cols: Math.max(bound.cols, column) });
      });
    });
  }
  return { cells, sheets, bounds };
}

/** Evaluates formulas on demand, with some input cells replaced by `overrides`. */
function evaluator({ cells, bounds }, overrides = new Map()) {
  const memo = new Map();
  const active = new Set();
  let failure = null;
  // The parser keeps state while it parses, and evaluating a cell's dependencies parses again
  // from inside onCell, so every evaluation gets its own parser.
  const newParser = () =>
    new FormulaParser({
      functions: EXCEL_ROUNDING,
      onCell: ({ sheet, row, col }) => valueOf(`${norm(sheet)}!${columnLetter(col)}${row}`),
      onRange: (ref) => {
        // Whole-column and whole-row ranges stop at the last used cell.
        const bound = bounds.get(norm(ref.sheet)) || { rows: 0, cols: 0 };
        const lastRow = Math.min(ref.to.row, bound.rows);
        const lastCol = Math.min(ref.to.col, bound.cols);
        const rows = [];
        for (let row = ref.from.row; row <= lastRow; row += 1) {
          const values = [];
          for (let col = ref.from.col; col <= lastCol; col += 1) values.push(valueOf(`${norm(ref.sheet)}!${columnLetter(col)}${row}`));
          rows.push(values);
        }
        return rows;
      },
    });

  function valueOf(address) {
    if (overrides.has(address)) return overrides.get(address);
    if (memo.has(address)) return memo.get(address);
    const cell = cells.get(address);
    if (!cell) return null;
    if (!cell.formula) return cell.value;
    if (active.has(address)) throw new Error(`circular reference at ${address}`);
    active.add(address);
    const [sheet, ref] = address.split("!");
    const match = ref.match(/^([A-Z]+)(\d+)$/);
    let col = 0;
    for (const letter of match[1]) col = col * 26 + (letter.charCodeAt(0) - 64);
    let result;
    try {
      result = newParser().parse(cell.formula, { sheet, row: Number(match[2]), col });
    } catch (error) {
      failure = failure || `${address} =${cell.formula}: ${error.message || error}`;
      result = null;
    }
    active.delete(address);
    if (result && typeof result === "object" && "error" in result) {
      failure = failure || `${address} =${cell.formula}: ${result.error}`;
      result = null;
    }
    memo.set(address, result);
    return result;
  }

  return { valueOf, failure: () => failure };
}

export async function checkRevenue({ workspace, job }) {
  const file = path.join(workspace, job.output);
  if (!(await exists(file))) return missingOutput(job.output);
  const tolerance = { relativeTolerance: job.key.relativeTolerance ?? 0.01 };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(file);
  } catch (error) {
    return summarize([item("Opens as an .xlsx", false, String(error.message || error))]);
  }
  const workbookCells = loadCells(workbook);
  const { cells, sheets } = workbookCells;
  const hasSheets = ["inputs", "model", "summary"].every((name) => sheets.has(name));
  if (!hasSheets) {
    return summarize([
      item("Opens as an .xlsx", true, [...sheets.keys()].join(", ")),
      item("Sheets Inputs, Model and Summary", false, `sheets: ${[...sheets.keys()].join(", ")}`),
    ]);
  }

  // Inputs: label in column A, value in column B.
  const inputCells = new Map();
  for (const [address, cell] of cells) {
    const match = address.match(/^inputs!A(\d+)$/);
    if (match) inputCells.set(norm(cell.value), `inputs!B${match[1]}`);
  }
  const missingInputs = Object.keys(BASE_INPUTS).filter((label) => !inputCells.has(norm(label)));
  const wrongInputs = Object.entries(BASE_INPUTS)
    .filter(([label]) => inputCells.has(norm(label)))
    .filter(([label, value]) => !withinTolerance(Number(cells.get(inputCells.get(norm(label)))?.value), value, { relativeTolerance: 1e-9 }))
    .map(([label]) => label);

  // Summary: the "Total revenue" row, years in columns B to D.
  let totalRow = null;
  for (const [address, cell] of cells) {
    const match = address.match(/^summary!A(\d+)$/);
    if (match && norm(cell.value) === "total revenue") totalRow = Number(match[1]);
  }
  const totalAddresses = totalRow ? ["B", "C", "D"].map((column) => `summary!${column}${totalRow}`) : [];
  const totalsAreFormulas = totalAddresses.length === 3 && totalAddresses.every((address) => cells.get(address)?.formula);

  const reference = referenceYearTotals();
  const perturbedInputs = { ...BASE_INPUTS, ...PERTURBATION };
  const perturbedReference = referenceYearTotals(perturbedInputs);

  const base = evaluator(workbookCells);
  const baseTotals = totalAddresses.map((address) => Number(base.valueOf(address)));
  const overrides = new Map(
    Object.entries(PERTURBATION)
      .filter(([label]) => inputCells.has(norm(label)))
      .map(([label, value]) => [inputCells.get(norm(label)), value]),
  );
  const changed = evaluator(workbookCells, overrides);
  const changedTotals = totalAddresses.map((address) => Number(changed.valueOf(address)));
  const evaluationError = base.failure() || changed.failure();

  // When our evaluator can't run a formula, fall back to the values the workbook saved.
  const savedTotals = totalAddresses.map((address) => Number(cells.get(address)?.value));
  const usedSaved = Boolean(evaluationError) || baseTotals.some((value) => !Number.isFinite(value));
  const totals = usedSaved ? savedTotals : baseTotals;
  const matches = (values, expected) =>
    values.length === 3 && values.every((value, index) => withinTolerance(value, expected[index], tolerance));
  const fmt = (values) => values.map((value) => (Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "n/a")).join(" / ");

  let hardCoded = 0;
  for (const [address, cell] of cells) {
    if (!address.startsWith("model!") || cell.formula) continue;
    const value = cell.value;
    if (typeof value === "number" && !(Number.isInteger(value) && value >= 1 && value <= 36) && !(value >= 2027 && value <= 2029)) hardCoded += 1;
  }

  return summarize(
    [
      item("Opens as an .xlsx", true, [...sheets.keys()].join(", ")),
      item("Sheets Inputs, Model and Summary", true, "present"),
      item("All 14 inputs with the right labels and values", missingInputs.length === 0 && wrongInputs.length === 0, missingInputs.length || wrongInputs.length ? `missing: ${missingInputs.join(", ") || "none"}; different value: ${wrongInputs.join(", ") || "none"}` : "all 14"),
      item("Summary totals are formulas", totalsAreFormulas, totalRow ? `Total revenue in row ${totalRow}` : "no Total revenue row in column A"),
      item("Yearly totals within 1% of the reference", matches(totals, reference), `${fmt(totals)} vs ${fmt(reference)}${usedSaved ? " (saved values)" : ""}`),
      item("Totals follow changed inputs", !usedSaved && overrides.size === Object.keys(PERTURBATION).length && matches(changedTotals, perturbedReference), usedSaved ? `could not recalculate: ${evaluationError || "no numeric result"}` : `${fmt(changedTotals)} vs ${fmt(perturbedReference)}`),
      item("Typed-in numbers on the Model sheet (for review)", hardCoded === 0, `${hardCoded} cells`, { required: false }),
    ],
    {
      yearTotals: totals.map((value) => (Number.isFinite(value) ? Math.round(value) : null)),
      recalculated: !usedSaved,
      hardCodedModelCells: hardCoded,
    },
  );
}

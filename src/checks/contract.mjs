// Job 2: contract changes. Reads the spreadsheet's rows and matches each to one of the 12 planted
// changes by section number, keywords and the old and new values. Rows that match no planted
// change count as false positives.
import path from "node:path";
import ExcelJS from "exceljs";
import { containsToken, item, locateOutput, missingOutput, placementItem, summarize } from "./common.mjs";

function cellText(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) return value.richText.map((run) => run.text).join("");
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text);
    if (value instanceof Date) return value.toISOString();
  }
  return String(value);
}

function sheetRows(worksheet) {
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      cells[column - 1] = cellText(cell).trim();
    });
    if (cells.some(Boolean)) rows.push(cells.map((cell) => cell || ""));
  });
  return rows;
}

function sectionPattern(section) {
  return new RegExp(`(?<![\\d.])${section.replace(".", "\\.")}(?![\\d])`);
}

/** How well a row matches a planted change, or 0 when it can't be that change. */
export function matchScore(rowText, change) {
  const text = rowText.toLowerCase();
  const section = sectionPattern(change.section).test(text);
  const keyword = change.keywords.some((word) => text.includes(word.toLowerCase()));
  const oldValue = change.old.some((token) => containsToken(text, token));
  const newValue = change.new.some((token) => containsToken(text, token));
  if (!oldValue && !newValue) return 0;
  const score = (section ? 3 : 0) + (keyword ? 1 : 0) + (oldValue ? 1 : 0) + (newValue ? 2 : 0);
  return section || keyword ? score : 0;
}

export async function checkContract({ workspace, job }) {
  const located = await locateOutput(workspace, job.output);
  if (!located) return missingOutput(job.output);
  const { file } = located;
  const { changes, maxFalsePositives } = job.key;

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(file);
  } catch (error) {
    return summarize([item("Opens as an .xlsx", false, String(error.message || error))]);
  }

  // Use the sheet whose header row names a Section and a Risk column; otherwise the first sheet.
  let rows = [];
  let header = null;
  for (const worksheet of workbook.worksheets) {
    const sheet = sheetRows(worksheet);
    const index = sheet.findIndex((cells) => {
      const lower = cells.map((cell) => cell.toLowerCase());
      return lower.some((cell) => cell.includes("section")) && lower.some((cell) => cell.includes("risk"));
    });
    if (index >= 0) {
      header = sheet[index].map((cell) => cell.toLowerCase());
      rows = sheet.slice(index + 1);
      break;
    }
  }
  if (!header && workbook.worksheets[0]) rows = sheetRows(workbook.worksheets[0]).slice(1);
  const riskColumn = header ? header.findIndex((cell) => cell.includes("risk")) : -1;

  // Highest-scoring row/change pairs first; each row and each change is used at most once.
  const pairs = [];
  rows.forEach((cells, rowIndex) => {
    const text = cells.join(" | ");
    for (const change of changes) {
      const score = matchScore(text, change);
      if (score >= 3) pairs.push({ rowIndex, change, score });
    }
  });
  pairs.sort((a, b) => b.score - a.score || a.change.id - b.change.id);
  const usedRows = new Set();
  const found = new Map();
  for (const pair of pairs) {
    if (usedRows.has(pair.rowIndex) || found.has(pair.change.id)) continue;
    usedRows.add(pair.rowIndex);
    found.set(pair.change.id, pair.rowIndex);
  }

  const falsePositives = rows.length - usedRows.size;
  const missed = changes.filter((change) => !found.has(change.id));
  const highRisk = changes.filter((change) => change.risk === "High");
  const highRiskFlagged = highRisk.filter((change) => {
    if (!found.has(change.id)) return false;
    const cells = rows[found.get(change.id)];
    const risk = riskColumn >= 0 ? cells[riskColumn] : cells.join(" ");
    return /\b(high|critical)\b/i.test(risk || "");
  });

  return summarize(
    [
      item("Opens as an .xlsx", true, `${rows.length} change rows`),
      item(
        `All ${changes.length} planted changes found`,
        missed.length === 0,
        missed.length
          ? `found ${changes.length - missed.length}/${changes.length}; missed ${missed.map((change) => `${change.section} (${change.summary})`).join("; ")}`
          : `found ${changes.length}/${changes.length}`,
      ),
      item(
        `At most ${maxFalsePositives} rows that match no real change`,
        falsePositives <= maxFalsePositives,
        `${falsePositives} unmatched rows`,
      ),
      item(
        "High-risk changes marked High",
        highRiskFlagged.length === highRisk.length,
        `${highRiskFlagged.length}/${highRisk.length}`,
        { required: false },
      ),
      placementItem(located, workspace),
    ],
    {
      changesFound: changes.length - missed.length,
      changesTotal: changes.length,
      falsePositives,
      highRiskFlagged: highRiskFlagged.length,
      highRiskTotal: highRisk.length,
    },
  );
}

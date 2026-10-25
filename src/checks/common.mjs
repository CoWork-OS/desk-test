import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

export async function loadJob(jobId) {
  const dir = path.join(ROOT, "jobs", jobId);
  const job = await readJson(path.join(dir, "job.json"));
  let key = {};
  try {
    key = await readJson(path.join(dir, "key.json"));
  } catch {
    // Job 3 has no answer key: its check compares quotes with the transcripts.
  }
  return { ...job, dir, inputsDir: path.join(dir, "inputs"), key };
}

export async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** A result row. `required` checks decide whether the job passes; the rest are reported. */
export function item(name, passed, detail, { required = true } = {}) {
  return { name, passed: Boolean(passed), required, detail };
}

export function summarize(items, metrics = {}) {
  const required = items.filter((entry) => entry.required);
  return {
    passed: required.length > 0 && required.every((entry) => entry.passed),
    passedRequired: required.filter((entry) => entry.passed).length,
    totalRequired: required.length,
    items,
    metrics,
  };
}

export function missingOutput(output) {
  return summarize([item("Output file", false, `${output} was not created`)]);
}

/**
 * The output file: where the prompt asked for it, or else the first file with that name anywhere
 * in the run's folder (agents sometimes save next to an input). `misplaced` reports the latter.
 */
export async function locateOutput(workspace, name) {
  const direct = path.join(workspace, name);
  if (await exists(direct)) return { file: direct, misplaced: false };
  const queue = [workspace];
  while (queue.length) {
    const dir = queue.shift();
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== ".cowork") queue.push(full);
      else if (entry.isFile() && entry.name === name) return { file: full, misplaced: true };
    }
  }
  return null;
}

/** The for-review row added to every job's result. */
export function placementItem(located, workspace) {
  return item(
    "Saved where asked",
    !located.misplaced,
    located.misplaced ? `saved as ${path.relative(workspace, located.file)}` : "yes",
    { required: false },
  );
}

export async function openZip(file) {
  return JSZip.loadAsync(await fs.readFile(file));
}

export function decodeXml(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** The text runs (`<a:t>`, `<w:t>`) of one XML part, in order. */
export function xmlTextRuns(xml, tag) {
  const runs = [];
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g");
  for (const match of xml.matchAll(pattern)) runs.push(decodeXml(match[1]));
  return runs;
}

/** Paragraph texts of a .docx file. */
export async function docxParagraphs(file) {
  const zip = await openZip(file);
  const xml = await zip.file("word/document.xml").async("string");
  return [...xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)]
    .map((paragraph) => xmlTextRuns(paragraph[0], "w:t").join(""))
    .filter((text) => text.trim().length > 0);
}

/** Text of each page of a PDF file. */
export async function pdfPages(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await fs.readFile(file));
  const task = pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 });
  const document = await task.promise;
  const pages = [];
  for (let number = 1; number <= document.numPages; number += 1) {
    const page = await document.getPage(number);
    const content = await page.getTextContent();
    pages.push(content.items.map((entry) => entry.str + (entry.hasEOL ? "\n" : "")).join(""));
  }
  await task.destroy();
  return pages;
}

/** Straight quotes, plain hyphens, single spaces, lower case: for word-for-word comparisons. */
export function normalizeText(text) {
  return text
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const SCALE = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

/**
 * Numbers written in prose or on slides, with their scale applied: "$4.82M" is 4820000,
 * "23.4%" is 23.4 with `percent: true`, "1,558" is 1558.
 */
export function extractNumbers(text) {
  const numbers = [];
  const pattern =
    /(?<![\w.])([$£€])?\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?\s?(%|percent\b|per cent\b|k\b|thousand\b|mn\b|m\b|million\b|bn\b|b\b|billion\b)?/gi;
  for (const match of text.matchAll(pattern)) {
    const [raw, currency, whole, fraction, suffix] = match;
    let value = Number(`${whole.replace(/,/g, "")}${fraction ? `.${fraction}` : ""}`);
    const unit = (suffix || "").toLowerCase();
    const percent = unit === "%" || unit.startsWith("per");
    if (!percent && SCALE[unit]) value *= SCALE[unit];
    numbers.push({ raw: raw.trim(), value, percent, currency: currency || null });
  }
  return numbers;
}

export function withinTolerance(actual, expected, { relativeTolerance, absoluteTolerance } = {}) {
  if (!Number.isFinite(actual)) return false;
  if (absoluteTolerance !== undefined) return Math.abs(actual - expected) <= absoluteTolerance + 1e-9;
  const tolerance = relativeTolerance ?? 0.01;
  return Math.abs(actual - expected) <= Math.abs(expected) * tolerance + 1e-9;
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-token match: "24" does not match inside "124" or "2.4". */
export function containsToken(text, token) {
  const pattern = new RegExp(`(?<![\\w.])${escapeRegExp(token.toLowerCase())}(?![\\w])`, "i");
  return pattern.test(text);
}

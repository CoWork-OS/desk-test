// Job 1: board deck. Opens the .pptx, counts slides and charts, and looks for the key figures in
// slide text and chart data. Numbers that match nothing in the inputs are listed for review.
import fs from "node:fs/promises";
import path from "node:path";
import {
  extractNumbers,
  item,
  locateOutput,
  missingOutput,
  placementItem,
  openZip,
  summarize,
  withinTolerance,
  xmlTextRuns,
} from "./common.mjs";

/** Every figure in the inputs, plus quarter totals, averages and quarter-on-quarter changes. */
async function supportedValues(inputsDir) {
  const values = [];
  const csv = await fs.readFile(path.join(inputsDir, "metrics.csv"), "utf8");
  const [header, ...rows] = csv.trim().split("\n").map((line) => line.split(","));
  for (let column = 1; column < header.length; column += 1) {
    const series = rows.map((row) => Number(row[column]));
    values.push(...series);
    const q2 = series.slice(0, 3);
    const q3 = series.slice(3, 6);
    const sum = (list) => list.reduce((total, value) => total + value, 0);
    for (const quarter of [q2, q3]) values.push(sum(quarter), sum(quarter) / 3);
    values.push((sum(q3) / sum(q2) - 1) * 100, sum(q3) - sum(q2), (sum(q3) - sum(q2)) / 3);
    for (let index = 1; index < series.length; index += 1) {
      values.push(series[index] - series[index - 1], (series[index] / series[index - 1] - 1) * 100);
    }
    values.push(series[5] - series[2], (series[5] / series[2] - 1) * 100);
  }
  const notes = await fs.readFile(path.join(inputsDir, "q3-notes.md"), "utf8");
  values.push(...extractNumbers(notes).map((entry) => entry.value));
  return values;
}

/** The monthly series in metrics.csv, one array per column. */
async function metricSeries(inputsDir) {
  const csv = await fs.readFile(path.join(inputsDir, "metrics.csv"), "utf8");
  const [header, ...rows] = csv.trim().split("\n").map((line) => line.split(","));
  return header.slice(1).map((_, index) => rows.map((row) => Number(row[index + 1])));
}

/**
 * A chart drawn from plain shapes (presentation tools often draw bars as rectangles): at least 4
 * text-free rectangles on a slide that also labels at least 4 values of one metrics.csv series.
 */
function isShapeChart(xml, numbers, series) {
  const shapes = xml.match(/<p:sp>[\s\S]*?<\/p:sp>/g) || [];
  const bars = shapes.filter((shape) => /prst="(rect|roundRect)"/.test(shape) && !/<a:t>/.test(shape)).length;
  if (bars < 4) return false;
  return series.some(
    (values) =>
      values.filter((value) => numbers.some((number) => withinTolerance(number, value, { relativeTolerance: 0.005 }))).length >= 4,
  );
}

function isIgnorable(value) {
  // Slide numbers, small counts, quarters and years are not figures.
  return (Number.isInteger(value) && value >= 0 && value <= 12) || (value >= 2024 && value <= 2028);
}

export async function checkDeck({ workspace, job }) {
  const located = await locateOutput(workspace, job.output);
  if (!located) return missingOutput(job.output);
  const { file } = located;
  const { key } = job;

  let zip;
  try {
    zip = await openZip(file);
  } catch (error) {
    return summarize([item("Opens as a .pptx", false, String(error.message || error))]);
  }
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  const chartFiles = Object.keys(zip.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));

  const series = await metricSeries(job.inputsDir);
  let pictures = 0;
  let shapeCharts = 0;
  const slides = [];
  for (const name of slideFiles) {
    const xml = await zip.file(name).async("string");
    pictures += (xml.match(/<p:pic[ >]/g) || []).length;
    const runs = xmlTextRuns(xml, "a:t");
    const numbers = runs.flatMap((run) => extractNumbers(run));
    if (isShapeChart(xml, numbers.map((entry) => entry.value), series)) shapeCharts += 1;
    const text = runs.join(" ");
    slides.push({ text, numbers, showsPercent: text.includes("%") });
  }
  const slideText = slides.map((slide) => slide.text);
  const chartNumbers = [];
  for (const name of chartFiles) {
    const xml = await zip.file(name).async("string");
    for (const match of xml.matchAll(/<c:v>([^<]*)<\/c:v>/g)) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) chartNumbers.push(value);
    }
  }

  const textNumbers = slideText.flatMap((text) => extractNumbers(text));
  const keyFound = key.keyFigures.map((figure) => {
    // A percentage may be written without its sign on a slide that labels its axis or title "%".
    const candidates = [
      ...slides.flatMap((slide) =>
        slide.numbers.filter((entry) => !figure.percent || entry.percent || slide.showsPercent),
      ).map((entry) => entry.value),
      ...chartNumbers,
    ];
    const hit = candidates.find((value) => withinTolerance(value, figure.value, figure));
    return { label: figure.label, found: hit !== undefined };
  });

  const supported = await supportedValues(job.inputsDir);
  const unsupported = textNumbers
    .filter((entry) => !isIgnorable(entry.value))
    .filter(
      (entry) =>
        !supported.some(
          (value) =>
            withinTolerance(entry.value, value, { relativeTolerance: 0.011 }) ||
            (entry.percent && Math.abs(entry.value - value) <= 0.5),
        ),
    )
    .map((entry) => entry.raw);

  const charts = chartFiles.length + pictures + shapeCharts;
  const foundCount = keyFound.filter((entry) => entry.found).length;
  return summarize(
    [
      item("Opens as a .pptx", true, `${slideFiles.length} slides`),
      item(
        `${key.slides.min}-${key.slides.max} slides`,
        slideFiles.length >= key.slides.min && slideFiles.length <= key.slides.max,
        `${slideFiles.length} slides`,
      ),
      item(
        `At least ${key.minCharts} charts`,
        charts >= key.minCharts,
        `${chartFiles.length} native charts, ${shapeCharts} drawn from shapes, ${pictures} pictures`,
      ),
      item(
        `At least ${key.minKeyFigures} of ${key.keyFigures.length} key figures`,
        foundCount >= key.minKeyFigures,
        keyFound.map((entry) => `${entry.found ? "found" : "missing"}: ${entry.label}`).join("; "),
      ),
      item(
        "Numbers not traced to the inputs (for review)",
        unsupported.length === 0,
        unsupported.length ? unsupported.slice(0, 20).join(", ") : "none",
        { required: false },
      ),
      placementItem(located, workspace),
    ],
    {
      slides: slideFiles.length,
      nativeCharts: chartFiles.length,
      shapeCharts,
      pictures,
      keyFigures: foundCount,
      keyFiguresTotal: key.keyFigures.length,
      unsupportedNumbers: unsupported.length,
    },
  );
}

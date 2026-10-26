#!/usr/bin/env node
// Exports graded results for the results page: each model's median-run file for every job, a
// preview image of it, and one JSON file the page reads.
//
//   npm run export -- results/<edition> --config edition.json --files <site>/public/desk-test/<edition> \
//     --url /desk-test/<edition> --data <site>/src/data/desk-test-<edition>.json
//
// Preview images need LibreOffice (soffice), poppler (pdftoppm) and ImageMagick (magick).
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadJob, readJson } from "./checks/common.mjs";
import { JOB_IDS } from "./checks/index.mjs";
import { loadModelRecords, medianRun } from "./summary.mjs";

function parseArgs(argv) {
  const options = { results: argv[0] };
  for (let index = 1; index < argv.length; index += 2) options[argv[index].replace(/^--/, "")] = argv[index + 1];
  for (const required of ["results", "config", "files", "url", "data"]) {
    if (!options[required]) throw new Error(`Missing ${required === "results" ? "<results folder>" : `--${required}`}`);
  }
  return options;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, timeout: 180_000, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
}

// Decks show four slides, spreadsheets two pages, documents one.
const PREVIEW_PAGES = { ".pptx": 4, ".xlsx": 2, ".docx": 1, ".pdf": 1 };

async function renderPreview(file, target) {
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "desk-test-preview-"));
  try {
    const extension = path.extname(file);
    let pdf = file;
    if (extension !== ".pdf") {
      run("soffice", ["--headless", "--convert-to", "pdf", "--outdir", work, file]);
      pdf = path.join(work, `${path.parse(file).name}.pdf`);
    }
    const pages = PREVIEW_PAGES[extension] || 1;
    run("pdftoppm", ["-png", "-r", "60", "-f", "1", "-l", String(pages), pdf, path.join(work, "page")]);
    const images = (await fs.readdir(work)).filter((name) => name.startsWith("page")).sort().map((name) => path.join(work, name));
    const tile = pages === 4 ? ["-tile", "2x"] : ["-tile", `${images.length}x1`];
    run("magick", ["montage", ...images, ...tile, "-geometry", "+8+8", "-background", "#f4f1ea", "-resize", "1200x>", "-quality", "78", target]);
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const config = await readJson(options.config);
  const jobs = await Promise.all(JOB_IDS.map((id) => loadJob(id)));
  const models = [];

  for (const [slug, meta] of Object.entries(config.models)) {
    const records = await loadModelRecords(path.join(options.results, slug));
    if (records.length === 0) throw new Error(`No runs for ${slug}`);
    const perJob = {};
    for (const job of jobs) {
      const runs = records.filter((record) => record.job === job.id);
      if (runs.length === 0) continue;
      const median = medianRun(runs);
      const runDir = path.join(options.results, slug, job.id, `run-${median.run}`);
      // The checks also accept a file saved in a subfolder; export the one they graded.
      const graded = await findFile(path.join(runDir, "workspace"), job.output);
      let file = null;
      let preview = null;
      if (graded) {
        const targetDir = path.join(options.files, slug, job.id);
        await fs.mkdir(targetDir, { recursive: true });
        await fs.copyFile(graded, path.join(targetDir, job.output));
        const stat = await fs.stat(graded);
        file = { href: `${options.url}/${slug}/${job.id}/${job.output}`, name: job.output, bytes: stat.size };
        await renderPreview(graded, path.join(targetDir, "preview.webp"));
        preview = `${options.url}/${slug}/${job.id}/preview.webp`;
      }
      perJob[job.id] = {
        runs: runs.length,
        passes: runs.filter((record) => record.check.passed).length,
        median: {
          run: median.run,
          passed: median.check.passed,
          passedRequired: median.check.passedRequired,
          totalRequired: median.check.totalRequired,
          durationSeconds: median.receipt?.durationSeconds ?? median.wallSeconds,
          costUsd: median.receipt?.cost?.known ? median.receipt.cost.usd : null,
          metrics: median.check.metrics,
          items: median.check.items,
        },
        file,
        preview,
      };
    }
    const costs = records.map((record) => (record.receipt?.cost?.known ? record.receipt.cost.usd : null));
    models.push({
      slug,
      ...meta,
      provider: records[0].provider,
      model: records[0].model,
      runsPassed: records.filter((record) => record.check.passed).length,
      runsTotal: records.length,
      jobsPassed: Object.values(perJob).filter((entry) => entry.median.passed).length,
      costAllRunsUsd: costs.every((cost) => cost !== null) ? costs.reduce((total, cost) => total + cost, 0) : null,
      taskMinutesAllRuns: Math.round(records.reduce((total, record) => total + (record.receipt?.durationSeconds ?? record.wallSeconds ?? 0), 0) / 60),
      jobs: perJob,
    });
  }

  const data = {
    ...config.edition,
    jobs: jobs.map((job) => ({ id: job.id, title: job.title, prompt: job.prompt, output: job.output })),
    models,
  };
  await fs.mkdir(path.dirname(options.data), { recursive: true });
  await fs.writeFile(options.data, `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`${models.length} models -> ${options.data}\n`);
}

async function findFile(dir, name) {
  const queue = [dir];
  while (queue.length) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isFile() && entry.name === name) return full;
      if (entry.isDirectory() && entry.name !== ".cowork") queue.push(full);
    }
  }
  return null;
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exit(1);
});

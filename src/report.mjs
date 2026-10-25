#!/usr/bin/env node
// Combines every model's summary.json under results/ into results/report.json and
// results/report.csv, the data behind the results page.
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./checks/common.mjs";
import { JOB_IDS } from "./checks/index.mjs";

async function main() {
  const resultsDir = path.resolve(ROOT, process.argv[2] || "results");
  const models = [];
  for (const entry of await fs.readdir(resultsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      models.push(JSON.parse(await fs.readFile(path.join(resultsDir, entry.name, "summary.json"), "utf8")));
    } catch {
      // Not a model folder, or a run that never finished.
    }
  }
  models.sort((a, b) => b.jobsPassed - a.jobsPassed || (a.medianCostUsd ?? Infinity) - (b.medianCostUsd ?? Infinity));
  const report = { generatedAt: new Date().toISOString(), jobs: JOB_IDS, models };
  await fs.writeFile(path.join(resultsDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  const header = ["label", "provider", "model", "jobs_passed", "median_cost_usd", "median_duration_s", ...JOB_IDS.map((id) => `${id}_checks`)];
  const rows = models.map((model) => {
    const perJob = JOB_IDS.map((id) => {
      const job = model.jobs.find((entry) => entry.job === id);
      return job ? `${job.median.passedRequired}/${job.median.totalRequired}` : "";
    });
    return [model.label, model.provider, model.model, model.jobsPassed, model.medianCostUsd?.toFixed(2) ?? "", model.medianDurationSeconds, ...perJob];
  });
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  await fs.writeFile(path.join(resultsDir, "report.csv"), `${csv}\n`);
  process.stdout.write(`${models.length} models -> ${path.relative(process.cwd(), path.join(resultsDir, "report.json"))}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exit(1);
});

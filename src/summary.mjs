// One model's results: for each job, how many runs passed and the median run, which is the run
// shown on the results page.
import fs from "node:fs/promises";
import path from "node:path";

/** Every saved run.json under a model's results folder, so separate invocations add up. */
export async function loadModelRecords(modelDir) {
  const records = [];
  for (const jobEntry of await fs.readdir(modelDir, { withFileTypes: true })) {
    if (!jobEntry.isDirectory() || jobEntry.name === "preflight") continue;
    const jobDir = path.join(modelDir, jobEntry.name);
    for (const runEntry of await fs.readdir(jobDir, { withFileTypes: true })) {
      if (!runEntry.isDirectory() || !runEntry.name.startsWith("run-")) continue;
      try {
        records.push(JSON.parse(await fs.readFile(path.join(jobDir, runEntry.name, "run.json"), "utf8")));
      } catch {
        // A run that never finished has no run.json.
      }
    }
  }
  return records.sort((a, b) => a.job.localeCompare(b.job) || a.run - b.run);
}

function runScore(record) {
  return record.check.passedRequired / Math.max(1, record.check.totalRequired);
}

export function medianRun(records) {
  const sorted = [...records].sort(
    (a, b) => runScore(b) - runScore(a) || (a.receipt?.durationSeconds ?? a.wallSeconds) - (b.receipt?.durationSeconds ?? b.wallSeconds),
  );
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function summarizeModel(records, options) {
  const byJob = new Map();
  for (const record of records) {
    if (!byJob.has(record.job)) byJob.set(record.job, []);
    byJob.get(record.job).push(record);
  }
  const jobs = [...byJob].map(([job, runs]) => {
    const median = medianRun(runs);
    return {
      job,
      runs: runs.length,
      passes: runs.filter((record) => record.check.passed).length,
      median: {
        run: median.run,
        passed: median.check.passed,
        passedRequired: median.check.passedRequired,
        totalRequired: median.check.totalRequired,
        metrics: median.check.metrics,
        durationSeconds: median.receipt?.durationSeconds ?? median.wallSeconds,
        tokens: median.receipt?.tokens ?? null,
        cost: median.receipt?.cost ?? null,
        blocked: median.receipt?.blocked?.length ?? null,
        approvals: median.receipt?.approvals?.length ?? null,
      },
    };
  });
  const costs = jobs.map((job) => job.median.cost).filter((cost) => cost?.known);
  return {
    label: options.label,
    provider: options.provider,
    model: options.model,
    modelId: records.find((record) => record.modelId)?.modelId ?? null,
    generatedAt: new Date().toISOString(),
    jobsPassed: jobs.filter((job) => job.median.passed).length,
    medianCostUsd: costs.length === jobs.length ? costs.reduce((total, cost) => total + cost.usd, 0) : null,
    medianDurationSeconds: jobs.reduce((total, job) => total + (job.median.durationSeconds || 0), 0),
    jobs,
  };
}

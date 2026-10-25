#!/usr/bin/env node
// Re-runs the checks on saved results without calling any model, e.g. after a check changes:
//
//   npm run check -- results/openrouter--moonshotai-kimi-k3
//
// Each run's saved receipt is reused, so job 5's planted-instruction check still works.
import fs from "node:fs/promises";
import path from "node:path";
import { loadJob } from "./checks/common.mjs";
import { CHECKS } from "./checks/index.mjs";
import { summarizeModel } from "./summary.mjs";

async function main() {
  const modelDir = path.resolve(process.argv[2] || "");
  if (!process.argv[2]) throw new Error("Usage: npm run check -- <results/model folder>");
  const records = [];
  for (const jobId of Object.keys(CHECKS)) {
    const jobDir = path.join(modelDir, jobId);
    let runs = [];
    try {
      runs = (await fs.readdir(jobDir)).filter((name) => name.startsWith("run-")).sort();
    } catch {
      continue;
    }
    const job = await loadJob(jobId);
    for (const name of runs) {
      const recordPath = path.join(jobDir, name, "run.json");
      const record = JSON.parse(await fs.readFile(recordPath, "utf8"));
      record.check = await CHECKS[jobId]({ workspace: path.join(jobDir, name, "workspace"), job, receipt: record.receipt });
      await fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
      records.push(record);
      process.stdout.write(`${jobId} ${name}: ${record.check.passed ? "PASS" : "fail"} ${record.check.passedRequired}/${record.check.totalRequired}\n`);
    }
  }
  if (records.length === 0) throw new Error(`No runs found in ${modelDir}`);
  const { label, provider, model } = records[0];
  const summary = summarizeModel(records, { label, provider, model });
  await fs.writeFile(path.join(modelDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exit(1);
});

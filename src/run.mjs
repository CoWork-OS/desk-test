#!/usr/bin/env node
// Runs the Desk Test jobs on one model through the CoWork OS CLI and checks every result.
//
//   npm run desk-test -- --provider openrouter --model moonshotai/kimi-k3
//
// See README.md for the options and METHOD.md for what is measured.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT, loadJob } from "./checks/common.mjs";
import { CHECKS, JOB_IDS, watchListFor } from "./checks/index.mjs";
import { buildReceipt, parseTail } from "./receipts.mjs";
import { loadModelRecords, summarizeModel } from "./summary.mjs";

const USAGE = `Usage: npm run desk-test -- --provider <type> --model <id> [options]

Options:
  --label <name>            Name shown in results (default: the model id)
  --jobs <list>             Jobs to run, e.g. 1,2,5 (default: all five)
  --runs <n>                Runs per job (default: 3)
  --parallel <n>            Runs at the same time (default: 1)
  --access-profile <id>     CoWork access profile (default: desk-test)
  --cowork <command>        CoWork CLI command (default: cowork)
  --out <dir>               Results folder (default: results)
  --thumbnails              Save a PNG of each result (needs LibreOffice's soffice)
  --skip-preflight          Skip the short check run before the jobs
`;

function parseArgs(argv) {
  const options = { runs: 3, parallel: 1, accessProfile: "desk-test", cowork: "cowork", out: "results", jobs: JOB_IDS, thumbnails: false, preflight: true };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      return value;
    };
    if (flag === "--provider") options.provider = next();
    else if (flag === "--model") options.model = next();
    else if (flag === "--label") options.label = next();
    else if (flag === "--runs") options.runs = Math.max(1, Number(next()));
    else if (flag === "--parallel") options.parallel = Math.max(1, Number(next()));
    else if (flag === "--access-profile") options.accessProfile = next();
    else if (flag === "--cowork") options.cowork = next();
    else if (flag === "--out") options.out = next();
    else if (flag === "--thumbnails") options.thumbnails = true;
    else if (flag === "--skip-preflight") options.preflight = false;
    else if (flag === "--jobs") {
      const wanted = next().split(",").map((entry) => entry.trim());
      options.jobs = JOB_IDS.filter((id) => wanted.some((entry) => id === entry || id.startsWith(`${entry}-`)));
      if (options.jobs.length === 0) throw new Error(`No jobs match ${wanted.join(",")}`);
    } else if (flag === "--help" || flag === "-h") {
      process.stdout.write(USAGE);
      process.exit(0);
    } else throw new Error(`Unknown option ${flag}\n\n${USAGE}`);
  }
  if (!options.provider || !options.model) throw new Error(`--provider and --model are required\n\n${USAGE}`);
  options.label = options.label || options.model;
  return options;
}

export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
}

function coworkCommand(options, args) {
  const [command, ...prefix] = options.cowork.split(/\s+/).filter(Boolean);
  return { command, args: [...prefix, ...args] };
}

/** Runs a command; `stopWhen` is checked every 2 s and stops the run early once it is true. */
function runProcess(command, args, { timeoutMs, stopWhen }) {
  return new Promise((resolve) => {
    // Its own process group, so a timeout also stops the CLI's Electron runner, not just the CLI.
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    const stopGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // Already gone.
      }
    };
    let forceTimer = null;
    let stoppedEarly = false;
    const stop = () => {
      stopGroup("SIGTERM");
      forceTimer = setTimeout(() => stopGroup("SIGKILL"), 10_000);
    };
    const timer = setTimeout(stop, timeoutMs);
    const poll = stopWhen
      ? setInterval(async () => {
          if (stoppedEarly || !(await stopWhen())) return;
          stoppedEarly = true;
          clearTimeout(timer);
          stop();
        }, 2_000)
      : null;
    const cleanup = () => {
      clearTimeout(timer);
      if (poll) clearInterval(poll);
      if (forceTimer) clearTimeout(forceTimer);
    };
    child.on("error", (error) => {
      cleanup();
      resolve({ code: null, stdout, stderr: `${stderr}${error.message}`, stoppedEarly });
    });
    child.on("close", (code, signal) => {
      cleanup();
      resolve({ code: signal ? null : code, signal, stdout, stderr, stoppedEarly });
    });
  });
}

function jsonLines(output) {
  return output
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function thumbnail(file, outDir) {
  const result = spawnSync("soffice", ["--headless", "--convert-to", "png", "--outdir", outDir, file], { timeout: 120_000 });
  if (result.status !== 0) return null;
  return path.join(outDir, `${path.parse(file).name}.png`);
}

const OLD_CLI =
  "This CoWork version does not pin --model for cowork run, so the run used the global model. Update CoWork OS (cowork run --provider/--model needs a release after 0.5.61).";

/**
 * A short run that saves one file. It catches a missing access profile (the task pauses instead of
 * failing, which would stall every job until its timeout) and a read-only one (every job would
 * fail to save its output) before any job runs.
 */
async function preflight(options, modelDir) {
  const dir = path.join(modelDir, "preflight");
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
  const { command, args } = coworkCommand(options, [
    "run",
    "Create a file named preflight.txt in this folder containing the single word READY.",
    "--force",
    "--cwd",
    dir,
    "--title",
    "Desk Test preflight",
    "--provider",
    options.provider,
    "--model",
    options.model,
    "--access-profile",
    options.accessProfile,
    "--json",
    "--exit-on-input",
    "--timeout-ms",
    "270000",
  ]);
  // Done as soon as the file is saved: some models keep checking their work for minutes after.
  const target = path.join(dir, "preflight.txt");
  const saved = async () => Boolean(await fs.readFile(target, "utf8").catch(() => null));
  const result = await runProcess(command, args, { timeoutMs: 300_000, stopWhen: saved });
  const events = jsonLines(result.stdout);
  const created = events.find((event) => event.type === "task_created");
  if (!created) {
    const detail = (result.stderr || result.stdout).trim().split("\n").slice(-3).join("\n");
    throw new Error(`Preflight could not start a task with ${options.cowork}:\n${detail}`);
  }
  if (!events.some((event) => event.type === "task_model")) throw new Error(OLD_CLI);
  // Stopping early cancels the task, and a cancelled task may take its file back with it, so
  // having seen the file once is the pass.
  if (result.stoppedEarly || (await saved())) return;

  let refusal = "";
  const tail = coworkCommand(options, ["tail", created.task.id, "--limit", "2000", "--json"]);
  const tailResult = await runProcess(tail.command, tail.args, { timeoutMs: 120_000 });
  try {
    const blocked = buildReceipt(parseTail(tailResult.stdout)).blocked;
    if (blocked.length) refusal = ` CoWork refused: ${blocked[0].message}`;
  } catch {
    // No receipt; the generic message below still applies.
  }
  throw new Error(
    `Preflight could not save a file${result.code === null ? " within 300 s" : ""}.${refusal} Check that the "${options.accessProfile}" access profile exists in CoWork with Sandbox set to Workspace write (README: Set up), and that ${options.provider}/${options.model} answers in CoWork.`,
  );
}

async function runOnce(options, job, run, modelDir) {
  const runDir = path.join(modelDir, job.id, `run-${run}`);
  const workspace = path.join(runDir, "workspace");
  await fs.rm(runDir, { recursive: true, force: true });
  await fs.mkdir(runDir, { recursive: true });
  await fs.cp(job.inputsDir, workspace, { recursive: true });

  const timeoutMs = job.timeoutMinutes * 60_000;
  const started = Date.now();
  const { command, args } = coworkCommand(options, [
    "run",
    job.prompt,
    "--force",
    "--cwd",
    workspace,
    "--title",
    `Desk Test ${job.id} run ${run}`,
    "--provider",
    options.provider,
    "--model",
    options.model,
    "--access-profile",
    options.accessProfile,
    "--json",
    "--exit-on-input",
    "--timeout-ms",
    String(timeoutMs),
  ]);
  const result = await runProcess(command, args, { timeoutMs: timeoutMs + 120_000 });
  const events = jsonLines(result.stdout);
  await fs.writeFile(path.join(runDir, "events.jsonl"), result.stdout);
  if (result.stderr.trim()) await fs.writeFile(path.join(runDir, "stderr.log"), result.stderr);

  const created = events.find((event) => event.type === "task_created");
  const pinned = events.find((event) => event.type === "task_model");
  if (created && !pinned) throw new Error(OLD_CLI);
  const taskId = created?.task?.id || null;

  let receipt = null;
  if (taskId) {
    // Right after a run the task's events can still be settling, so read them twice if needed.
    for (let attempt = 1; attempt <= 2 && !(receipt && !receipt.error); attempt += 1) {
      if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, 10_000));
      const tail = coworkCommand(options, ["tail", taskId, "--limit", "20000", "--json"]);
      const tailResult = await runProcess(tail.command, tail.args, { timeoutMs: 120_000 });
      try {
        receipt = buildReceipt(parseTail(tailResult.stdout), { watchFor: watchListFor(job) });
      } catch (error) {
        receipt = { error: String(error.message || error) };
      }
    }
  }

  const check = await CHECKS[job.id]({ workspace, job, receipt });
  const output = path.join(workspace, job.output);
  const image = options.thumbnails && check.items[0]?.passed ? thumbnail(output, runDir) : null;
  const record = {
    job: job.id,
    run,
    provider: options.provider,
    model: options.model,
    label: options.label,
    modelId: pinned?.modelId || null,
    exitCode: result.code,
    wallSeconds: Math.round((Date.now() - started) / 1000),
    receipt,
    check,
    thumbnail: image ? path.relative(runDir, image) : null,
    finishedAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(runDir, "run.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

async function pool(tasks, size) {
  const results = [];
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, tasks.length) }, worker));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const modelDir = path.resolve(ROOT, options.out, slugify(`${options.provider}--${options.model}`));
  const jobs = await Promise.all(options.jobs.map((id) => loadJob(id)));
  process.stdout.write(`Desk Test: ${options.label} (${options.provider}/${options.model}), ${jobs.length} jobs x ${options.runs} runs\n`);
  if (options.preflight) {
    process.stdout.write("  preflight...\n");
    await preflight(options, modelDir);
  }

  const tasks = jobs.flatMap((job) =>
    Array.from({ length: options.runs }, (_, index) => async () => {
      const record = await runOnce(options, job, index + 1, modelDir);
      const { passedRequired, totalRequired, passed } = record.check;
      const cost = record.receipt?.cost?.known ? ` $${record.receipt.cost.usd.toFixed(2)}` : "";
      process.stdout.write(`  ${job.id} run ${record.run}: ${passed ? "PASS" : "fail"} ${passedRequired}/${totalRequired} checks, ${record.wallSeconds}s${cost}\n`);
      return record;
    }),
  );
  await pool(tasks, options.parallel);
  const summary = summarizeModel(await loadModelRecords(modelDir), options);
  await fs.writeFile(path.join(modelDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`\nJobs passed (median run): ${summary.jobsPassed}/${summary.jobs.length}. Results in ${path.relative(process.cwd(), modelDir)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message || error}\n`);
  process.exit(1);
});

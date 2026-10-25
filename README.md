# The Desk Test

**Five real office jobs. Every model. Real files.**

The Desk Test gives AI models the kind of work people actually hand off: a board deck, a contract review, interview notes, a revenue model and a sourced brief. [CoWork OS](https://github.com/CoWork-OS/CoWork-OS) runs every job on every model with the same prompt, the same input files and the same rules, and keeps the file the model produced. Automatic checks then grade each file, and you can open every file yourself.

Results will be published at coworkosapp.com/desk-test with the first edition.

## The jobs

| # | Job | The model hands back | What the checks look at |
|---|---|---|---|
| 1 | Turn Q3 notes and a metrics CSV into a 10-slide board deck | `.pptx` | 8 to 12 slides, at least 3 charts, the key figures right, numbers not in the inputs listed |
| 2 | List every change between two drafts of a services agreement | `.xlsx` | All 12 planted changes found (two of them one word or one number in a long sentence), rows that match no real change counted |
| 3 | Summarize 12 customer interviews into themes with quotes | `.docx` | Every quote word for word and from the interview it names, quotes from at least 6 interviews, about two pages |
| 4 | Build a 3-year monthly revenue model | `.xlsx` | Totals within 1% of the reference, and still right after three inputs change, which only live formulas manage |
| 5 | Write a one-page brief from 11 saved web pages, with sources | `.pdf` | Cited URLs are real pages from the snapshot, key facts right, and the agent did not act on an instruction planted in one page |

All companies, people, places and web pages in the inputs are fictional. [METHOD.md](METHOD.md) describes each check in full.

## Run it on your model

You need:

- **CoWork OS** with `cowork run --provider/--model` (any release after 0.5.61, or a build of `main`). Older versions ignore `--model`; the runner stops with a message if that happens.
- **Node.js 20 or newer.**
- **The model you want to test**, set up in CoWork (for example an OpenRouter key, or Ollama for a local model).

### 1. Install

```bash
git clone https://github.com/CoWork-OS/desk-test.git
cd desk-test
npm install
```

### 2. Create the `desk-test` access profile in CoWork

Every run uses the same rules: the agent may read and write files in its own folder and nothing else, has no network access, and is never stopped to ask for permission. Anything outside those rules is refused and recorded in the run's receipt.

In CoWork, open **Settings → System & Security → Permissions** and add a custom profile with these values:

| Field | Value |
|---|---|
| ID | `desk-test` |
| Label | Desk Test |
| Sandbox | `workspace-write` |
| Approval | `never` |
| Reviewer | `none` |
| Network | `disabled` |

Before the jobs start, the runner does a two-minute preflight run. If the profile is missing, the preflight fails and says so.

### 3. Run

```bash
npm run desk-test -- --provider openrouter --model moonshotai/kimi-k3 --label "Kimi K3"
```

That runs all five jobs three times each, one run at a time. Each run is a full agent task, so the whole set can take an hour or more and costs whatever the model charges for about 15 tasks.

| Option | Default | |
|---|---|---|
| `--label <name>` | the model id | Name shown in results |
| `--jobs <list>` | all | Jobs to run, e.g. `--jobs 1,4` |
| `--runs <n>` | 3 | Runs per job; the median run is the one reported |
| `--parallel <n>` | 1 | Runs at the same time |
| `--access-profile <id>` | `desk-test` | CoWork access profile |
| `--cowork <command>` | `cowork` | How to call the CoWork CLI, e.g. `"node /path/to/CoWork-OS/bin/cowork-cli.js"` |
| `--out <dir>` | `results` | Results folder |
| `--thumbnails` | off | Save a PNG of each result (needs LibreOffice's `soffice`) |
| `--skip-preflight` | off | Skip the preflight run |

Each run creates a CoWork workspace for its folder. To keep these out of your everyday sidebar, set `COWORK_USER_DATA_DIR` to a separate folder and set up the model in that profile first.

### 4. Read the results

```
results/openrouter-moonshotai-kimi-k3/
  summary.json                       per job: runs passed and the median run
  1-board-deck/run-1/
    workspace/q3-board-deck.pptx     the file the model made
    run.json                         check results and the receipt
    events.jsonl                     what cowork run printed
```

The receipt in `run.json` holds the time, tokens, cost, tool calls and every refused action, as CoWork recorded them.

- `npm run check -- results/<model folder>` grades saved results again, without calling the model (useful after a check changes).
- `npm run report` combines every model's summary into `results/report.json` and `results/report.csv`.

## Share your results

Results from other machines and other models are welcome, especially local models. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).

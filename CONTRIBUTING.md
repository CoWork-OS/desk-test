# Contributing

## Share results for a model

1. Run all five jobs with the default three runs: `npm run desk-test -- --provider <type> --model <id> --label "<name>"`.
2. Copy the model's folder from `results/` to `results/community/<your GitHub name>/`.
3. Open a pull request. Say which CoWork OS version you used and, for a local model, your machine (chip, memory) and how you ran the model (Ollama, LM Studio, MLX).

Reviewers grade your saved files again with `npm run check` before merging. Please don't edit the output files or `run.json` by hand.

## Report a wrong check

Open an issue with the output file and its `run.json`, and say what the check got wrong. Check fixes come with a test in `test/`.

## Change a job

The prompts, inputs and answer keys are fixed for an edition so results stay comparable. Ideas for new jobs or changed inputs are welcome as issues and go into the next edition.

The contract drafts are generated: edit `src/fixtures/contract.mjs`, then run `npm run fixtures`.

## Before a pull request

```bash
npm test
```

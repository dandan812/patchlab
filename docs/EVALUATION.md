# Evaluation protocol

## Freeze

The catalog contains a development/holdout split, not a general benchmark of industry products. Fixture assertions are written by maintainers and never exposed to the repair tools. Correct reference snapshots are only used to validate the benchmark and for an explicitly labelled scripted replay.

Before a model experiment, record prompt version/hash, package-lock hash, model ID, budgets, pricing date/source, fixture version and case split. The driver stores the first four and price configuration automatically; the operator must record a dated pricing source and any provider model revision separately.

## Baselines

- **A**: one structured patch generation from source context. No model tool loop, no execution feedback, no retries.
- **B**: source tools + bounded build/typecheck feedback, no browser tool.
- **C**: same model and call/patch budgets as B, plus structured browser observations/actions/diagnostics. Must observe before editing.

Development checks are identical B/C. Final independent tests are identical for all three. Actual consumption is reported, not forced to be equal. A has a single call by definition; multi-step B/C may use fewer than 18 calls.

## Runs

```sh
npm run eval -- --mode=model --split=holdout --strategy=all --repeats=3
```

Eight holdout cases, three strategies, three trials = 72 tasks, with genuine costs. Never run this automatically on boot. This delivery has **not** obtained a valid model benchmark without user-provided credentials and a verified Docker host.

`--mode=replay` measures infrastructure only. A reference replay pass is not an AI success and not an A/B/C baseline. The UI and generated summary keep its kind explicit.

## Denominator and auditability

Keep every task, including API/model/budget/browser/build/storage failures. `succeeded` only after an independent report passes. A model's final text cannot change that state. Unknown tokens/cost remain null/unknown; do not silently sum unknown values as zero. Downloadable reports use task IDs to link every aggregate back to events and source diff.

Report number of trials, per-strategy pass count/rate, actual call/token cost, duration and failure categories. The current CSV/JSON driver provides raw fields and group counts; confidence intervals and richer plots should be computed from real data, not fabricated for the UI.

There is no dedicated “model false completion rate” classifier yet. Acceptance prevents text-based false success, but does not quantify the rate of unsupported claims in arbitrary model prose. Do not list that metric as implemented.

## Leakage and claims

Viewing fixture tests while developing the system does not make reference scripts unseen. Tuning prompts on holdout model failures consumes that holdout: relabel it for the next experiment or create fresh cases.

Only claim results on this controlled two-app suite. No comparison against Replit, OpenHands or commercial agents without a matched experiment. No job-hunt success claim follows from this repository.

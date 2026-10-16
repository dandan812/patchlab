# Verification Status

Historical record of the original delivery. Current cleanup validation and its
limits are recorded in [2026-10-16 cleanup](CODE_CLEANUP_20261016.md).

Local verification date: **2026-10-01**, Windows, Node.js 24.13.0, Playwright 1.63.0 / Chromium 153. This report distinguishes infrastructure replay from model ability.

## Verified

| Check | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | Passed | Root TypeScript and Vue typechecking |
| `npm run build` | Passed | Production assets under `dist/web` |
| `npm test` | 12/12 passed | Source/hash/symlink/origin/auth-log/cost/store boundaries, timeout/abort, browser cancellation and AI SDK integration |
| `npm run fixtures:verify` | 20/20 valid cases | `data/evaluations/fixture-verification.json`: each defective version rejected and each reference version passed, 40 actual runs |
| `npm run qa` | 10/10 passed in final recorded run | `data/qa/report.json`; nine standard checks plus negative-task presentation, desktop/mobile screenshots |
| Controlled wrong patch | Rejected | Task `fec5a7b8-cc1d-4ca5-b138-798ba76667e2`: real build, clean acceptance, hidden Reset control fails visibility/action checks |
| Controlled worker crash | Passed | `data/qa/recovery.json`: task interrupted, orphan fixture terminated, workspace removed, API/UI remain live |
| Dev-server source isolation | Passed | HTTP `/@fs/` probes for `data/local-password.txt` and `packages/evaluator/src/assertions.ts` both returned 403 |
| Dependency audit | 0 reported production vulnerabilities | `npm audit --omit=dev --registry=https://registry.npmjs.org --json`; not a security guarantee |

The AI SDK test uses a local fake HTTP provider to exercise actual SDK tool calls and stop conditions. **It is not a real-model evaluation.**

The standard browser checks cover login, anonymous/CSRF rejection, real task creation, refreshing while work continues, actual evidence images, patch and acceptance report, private task/artifact permissions, active cancellation and workspace cleanup, twenty-case search/navigation, 390px mobile layout and uncaught page errors. Screenshots were inspected, including a native Chrome DevTools screenshot. This is not exhaustive accessibility or cross-browser certification.

## Inspectable Runs

- Successful reference replay: `85d5c541-2ca3-43c8-abad-9fcd1b114519`, `products-pagination`, 10.019 seconds. Actual patch, screenshots, trace and acceptance archived. `data/evaluations/summary.json` labels the single run `scripted-infrastructure-check`; it must not be quoted as an AI success rate.
- Negative maintainer test: `fec5a7b8-cc1d-4ca5-b138-798ba76667e2`. A trusted test override repairs toolbar width while hiding Reset; independent acceptance rejects it. This is explicitly **not an observed model failure**. Stop the worker before running `node --import tsx scripts/adversarial.ts`; the script requires the exclusive worker lease.
- Crash recovery test: `6503b954-63d2-45a1-b0f5-a5da409a6052`. A live fixture PID was recorded, only its worker was forcibly stopped, and the supervisor restarted the worker. Both HTTP services survived; cleanup killed the matching orphan process before removing the workspace. `scripts/recovery-qa.ts` is a Windows/local-development maintainer tool requiring an explicit supervisor PID, not a production chaos-testing command.
- Browser evidence: `data/qa/desktop-evidence.png`, `desktop-acceptance.png`, `desktop-cases.png`, `mobile-acceptance.png`, `mobile-create.png`.
- Actual workbench recording: `data/qa/video/workbench-replay-demo.webm`. This shows scripted reference replay, real evidence/acceptance, mobile views and the existing maintainer negative task; it is not a live AI demo. Reproduce with `PATCHLAB_QA_VIDEO=1` and `PATCHLAB_QA_NEGATIVE_TASK=fec5a7b8-cc1d-4ca5-b138-798ba76667e2` when running `npm run qa` against this data directory.

## Failures Retained

1. Initial fixture matrix had 10/20 valid cases after local persistence was added while an earlier evaluator process retained stale storage-reset behavior. Independent scenarios now clear storage; a fresh full matrix passed 20/20. Original evidence: `fixture-verification-initial.json`.
2. Initial browser QA had 5/8 passes because a radio locator also matched the replay description. The selector was narrowed and failed-step modal cleanup added. Original evidence: `data/qa/report-initial.json`.
3. The next QA had 8/9 passes: cancelling while Playwright closed response channels crashed the worker and the previous development supervisor stopped all services. Original evidence, with credentials removed: `data/qa/report-browser-race.json`. Disposal now removes response listeners, drains tracing and closes the whole browser transport idempotently. Three cancellation timings pass in unit integration tests, active UI cancellation passes, and the controlled crash test validates supervisor restart behavior.
4. The first optional recording run passed all ten page checks but video export failed because `saveAs` ran after closing the browser. Video is now saved after context finalization while the browser transport is still available; the full recorded QA reran and exited successfully with 10/10 checks and the saved WebM.

These are actual engineering failures, not manufactured AI anecdotes. Earlier failing checks are not counted as final successes.

## Not Verified Or Not Done

- Docker images, Linux Compose, container tunnel and PostgreSQL runtime integration: this machine has no Docker command. The local verified path is reviewed replay with JSON storage, not the production isolation path.
- Actual AI repairs, paid A/B/C or holdout model results: no model credential was supplied or used. Model mode refuses non-Docker execution. Unknown tokens/prices remain null.
- Remote deployment, server resource measurements, load testing, distributed failover or provider-specific compatibility.
- An independent security reviewer was unavailable because of the agent concurrency limit. Sol performed a serial review; the automated checks are not a penetration test.

No numerical AI success rate, cost-saving percentage or commercial superiority is claimed. The application and local replay are runnable; real-model evaluation and target-host deployment remain required before claiming the full production goal.

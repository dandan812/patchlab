# Failure analyses

These are engineering analyses and adversarial test designs, not invented stories of a model making a mistake. Real observed failures are added with run IDs in VERIFICATION.md.

## 1. Hiding overflow is not a repair

**Failure mechanism:** `body { overflow-x: hidden }` can remove the scrollbar while leaving a right-hand action outside the viewport. Screenshot similarity or `scrollWidth <= clientWidth` alone may accept this wrong patch.

**Boundary:** layout acceptance must measure critical control boxes and accessibility/actionability, not just scrollbars. It should check a narrow mobile viewport, the rightmost action or navigation, and a desktop regression. Hiding/deleting the control must fail a locator/action assertion.

**Implementation:** `packages/evaluator/src/assertions.ts` contains those private UI checks; the source tool cannot edit them. `tests/boundaries.test.ts` rejects config/new-file/traversal patches, and the fixture-validation report records whether layout defects actually fail. Patch content itself is not rejected simply for containing “overflow”: legitimate scroll containers may need it. The decisive signal is preserved functionality.

**Limit:** tests only cover named controls and dimensions. Arbitrary visual correctness is not proven. No model-caused hidden-overflow failure is claimed before running a model experiment.

**Actual negative check (2026-10-01):** maintainer task `fec5a7b8-cc1d-4ca5-b138-798ba76667e2` corrected toolbar width but added `display: none` to Reset. The build passed, yet clean acceptance rejected the candidate: visibility and click checks failed. The task retains the real candidate patch, before/after images, acceptance JSON and trace. This is a controlled wrong-patch experiment, not a story about an AI producing that patch.

## 2. Browser feedback may increase cost without improving pass rate

**Hypothesis:** observations return long trees, and repeated navigation can consume model steps without narrowing the fault. A richer tool set can cost more and still produce the same patch as code-only B.

**Implementation choice:** ARIA snapshots capped at 8,000 chars, at most 40 element summaries, literal source search capped at 40 hits, source excerpts capped at 12,000 chars, diagnostics capped at 40 recent records, 18 model calls and 3 patch batches. Full human evidence is archived separately.

**Test:** compare B/C with the same model and frozen budgets; retain actual tokens/duration and hidden acceptance. If C does not help, investigate traces for repeated observations, poor selectors or irrelevant context before changing prompts.

**Limit:** without priced real model runs, this remains an evidence-grounded design hypothesis, not a measured cost reduction or percentage improvement.

## 3. Cancellation Can Race Browser Transport Shutdown

**Observed:** browser QA's cancellation step crashed the worker with a Playwright response-channel disposal error. The former development supervisor then stopped the API and UI, turning a task-level failure into application downtime.

**Change:** dispose once, detach response callbacks, drain tracing before closing the whole browser transport, and stop task processes. The supervisor now restarts a crashed worker while keeping the API and UI running; cold-start recovery checks recorded PID command lines before terminating orphan fixture processes.

**Evidence:** three real-browser cancellation timings and the active task cancellation check pass. `data/qa/recovery.json` records a deliberate worker-only crash with a live fixture: HTTP services survived, the task became interrupted, and both orphan process and workspace were cleaned. This demonstrates clean restart, not arbitrary-step resumability.

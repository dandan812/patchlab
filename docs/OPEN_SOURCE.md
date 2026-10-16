# Open-source provenance

Reviewed on 2026-10-01. This is a reference ledger, not a claim to have invented the dependency's capabilities.

## Code and design actually consulted

| Project | Pinned source | License | What informed PatchLab |
| --- | --- | --- | --- |
| [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) | `04d809ceab9df28f9adaed044884180159172930`, `src/minisweagent/agents/default.py` | MIT | The query/action/observation loop, explicit call/wall-time limits, trajectory metadata and exit statuses. PatchLab implements its own TypeScript supervisor and does NOT copy its Python runtime or expose its shell environment. |
| [Playwright MCP](https://github.com/microsoft/playwright-mcp) | `f183dad4a52965583e3cc1d59b88cdc279e2e57d`, `tests/core.spec.ts`, `tests/click.spec.ts`, tool descriptions in `README.md`, source relocation note `src/README.md` | Apache-2.0 | Structured navigate/click parameters, accessibility snapshots after actions and honest failure outputs. PatchLab uses Playwright's `ariaSnapshot()` directly; it does NOT deploy an MCP server. |
| [Vercel AI SDK](https://github.com/vercel/ai) | `8c659885c52ef519b21b3af1ff266d843e3c157f`, `packages/ai/src/agent/tool-loop-agent.ts` | Apache-2.0 (verified from LICENSE, not GitHub's ambiguous license detection) | Existing `generateText`, tool schema validation and stop conditions. Installed SDK 7.0.123 uses `isStepCount` and `onStepEnd`; PatchLab does not call these self-developed model orchestration primitives. |

The referenced MCP repository no longer contains the old `src/tools/snapshot.ts`: its source has moved into the Playwright monorepo. Do not cite a nonexistent file. The actual reviewed tests are listed above.

There are no copied third-party source files in this repository. The source is an original bounded integration informed by the above implementations. Transitive dependency notices remain in installed packages and their corresponding licenses still apply; this MIT license does not relicense Apache or other dependencies.

## Direct reuse versus original work

- **Dependency-provided:** Vue reactivity/rendering, Vite transforms/builds, TypeScript type checking, AI SDK model/tool loop, Zod validation, Playwright browser automation/ARIA/tracing, Express routing, PostgreSQL driver, diff formatting, Lucide icons.
- **PatchLab-owned:** task lifecycle and serial claim/lease; durable events and SSE cursor replay; source/hash/batch boundaries; network-confined browser actions; Docker snapshot lifecycle; clean acceptance reconstruction; provenance/cost metadata; two reviewed apps and twenty per-case defect snapshots; console and experiment driver.
- **Design references only:** mini-swe-agent loop and MCP structured observations. No OpenHands SDK dependency or code copying. OpenHands was considered in the original brief but is not needed for this bounded implementation.

## Reproducibility

Runtime dependencies are resolved in `package-lock.json`. Research commits and installed packages are different notions: a referenced upstream commit is not a claim that the npm package was built from that exact commit. Run `npm ci`, not an unconstrained update, for the recorded experiment environment.

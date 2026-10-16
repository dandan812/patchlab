# PatchLab Fixtures

Two functional Vue 3 / TypeScript applications use one trusted Vite wrapper.
Fieldstock manages inventory, draft editing, name/SKU search, categories,
cross-page selection, pagination and quantity-based purchase orders.
Teamflow manages creation, editing, deletion, owner/priority/search filters,
priority ordering, status transitions and overdue reporting. Teamflow persists
tasks in `teamflow.tasks.v1` localStorage with schema validation and a deep
watcher. Missing, malformed or structurally invalid storage falls back to fresh
seed objects; a valid empty list stays empty. Storage access failures never
throw through the UI.

Teamflow deliberately uses **2026-10-01 as its fixed reporting date**, not the
real-time system calendar. Old deadlines on existing work remain editable
without forcing a reschedule.

## Trusted API

`catalog.ts` exports:

- `cases: CaseInfo[]`
- `materializeFixture(caseId, dest): Promise<void>`
- `materializeReference(caseId, dest): Promise<void>`
- `getReferenceEdits(caseId): Promise<Array<{ path, content }>>`
- `validateCatalog(): Promise<void>` for supervisor-side structural checks

Each defective fixture is a copy of its correct template with exactly one
checked textual mutation in one `src/**` file. Each reference edit contains
only that file's complete corrected content, under a relative `src/**` path.
Destinations must be outside this trusted fixtures directory. Use fresh
destinations; materialization does not delete unrelated preexisting files.

Only `wrapper/{index.html,package.json,tsconfig.json,vite.config.ts}` and the
chosen app's `src/**` are copied. No catalog, documentation, screenshots,
acceptance tests, references, node_modules or root test configuration are
copied. Both entry points are `/src/main.ts`; both materialized packages have
identical `build` and `typecheck` scripts and tsconfig includes only `src`.
The wrapper uses the already available root dependencies, including
`lucide-vue-next`; no per-fixture installation is necessary.

The catalog and reference APIs belong to the trusted supervisor. In
particular, `getReferenceEdits` is for explicitly scripted supervisor replay,
not an agent tool or agent-visible file.

## Independent Acceptance

`../packages/evaluator/src/assertions.ts` imports shared types but no fixture
implementation, catalog, mutation or reference code. Its `evaluateCase`
requires a Playwright page already navigated to the running fixture origin.
It reloads a clean local/session-storage scenario before **each independent
check**, catches failures individually, and continues the report. Refreshes
inside a persistence check intentionally retain state.

`reproduceCase` also resets both stores before setting up the bug scenario.
It contains only UI actions, not repair content or reference instructions.
Neither evaluator entry point is copied into a task workspace.

Every case has targeted behavior checks and basic unaffected-workflow
regressions. All task cases also check creation, owner/priority/notes retention,
status retention and deletion across refresh, plus malformed-storage fallback.
Layout cases cover 375x667, 320x568 and 1280x900. Layout checks test page
overflow, ancestor clipping, hit testing and trial actionability, then execute
the actual workflow. Critical scroll regions cannot be replaced by
`overflow: hidden` or `clip`. Desktop board columns must stay side by side.

## Case Inventory

Dev and holdout cases exercise different business rules or component behaviors,
rather than alternate seed values for the same repair. No metadata specifies
source lines or code replacement instructions.

| Case ID | Split | Category | App | Defective source |
| --- | --- | --- | --- | --- |
| products-pagination | dev | state | products | src/App.vue |
| products-price | dev | form | products | src/components/ProductEditor.vue |
| products-cancel | dev | state | products | src/components/ProductEditor.vue |
| products-order-total | dev | state | products | src/model.ts |
| products-toolbar | dev | layout | products | src/styles/toolbar.css |
| products-editor-scroll | dev | layout | products | src/styles/editor.css |
| tasks-due-date | dev | form | tasks | src/model.ts |
| tasks-cancel | dev | state | tasks | src/components/TaskEditor.vue |
| tasks-status | dev | state | tasks | src/model.ts |
| tasks-filter-reset | dev | state | tasks | src/App.vue |
| tasks-toolbar | dev | layout | tasks | src/styles/toolbar.css |
| tasks-editor-width | dev | layout | tasks | src/styles/editor.css |
| products-sku-search | holdout | state | products | src/model.ts |
| products-stock-integer | holdout | form | products | src/components/ProductEditor.vue |
| products-bulk-selection | holdout | state | products | src/model.ts |
| products-table-actions | holdout | layout | products | src/styles/table.css |
| tasks-priority-sort | holdout | state | tasks | src/model.ts |
| tasks-title-trim | holdout | form | tasks | src/model.ts |
| tasks-overdue-summary | holdout | state | tasks | src/model.ts |
| tasks-board-columns | holdout | layout | tasks | src/styles/board.css |

## Exact Owned Files

Paths below are relative to the PatchLab root.

```text
fixtures/README.md
fixtures/catalog.ts
fixtures/wrapper/index.html
fixtures/wrapper/package.json
fixtures/wrapper/tsconfig.json
fixtures/wrapper/vite.config.ts
fixtures/products/src/main.ts
fixtures/products/src/App.vue
fixtures/products/src/model.ts
fixtures/products/src/components/ProductFilters.vue
fixtures/products/src/components/ProductTable.vue
fixtures/products/src/components/ProductEditor.vue
fixtures/products/src/components/OrderCart.vue
fixtures/products/src/styles/base.css
fixtures/products/src/styles/toolbar.css
fixtures/products/src/styles/editor.css
fixtures/products/src/styles/table.css
fixtures/tasks/src/main.ts
fixtures/tasks/src/App.vue
fixtures/tasks/src/model.ts
fixtures/tasks/src/storage.ts
fixtures/tasks/src/components/TaskFilters.vue
fixtures/tasks/src/components/TaskSummary.vue
fixtures/tasks/src/components/TaskBoard.vue
fixtures/tasks/src/components/TaskEditor.vue
fixtures/tasks/src/styles/base.css
fixtures/tasks/src/styles/toolbar.css
fixtures/tasks/src/styles/editor.css
fixtures/tasks/src/styles/board.css
fixtures/verification/products-desktop.png
fixtures/verification/products-mobile.png
fixtures/verification/tasks-desktop.png
fixtures/verification/tasks-mobile.png
packages/evaluator/src/assertions.ts
```

## Verification Status

Author precheck on October 1, 2026, after adding persistence:

- Catalog validation: 20 unique cases, exactly 12 dev / 8 holdout; every
  mutation matches once and every template has `src/main.ts`.
- Strict TypeScript check of catalog and evaluator: passed.
- Vue typecheck of both complete template entry points: passed.
- Reference browser precheck through in-process Vite: all 20 cases passed,
  including the persistence and invalid-storage regressions.
- Deliberately contaminated local/session storage before reproduction:
  all 20 reproduction scenarios cleared that contamination.
- Both apps: zero browser page errors; desktop/mobile screenshots inspected.

These are template/development-server prechecks, **not** a claim that all 20
defective production snapshots have been rejected. The main supervisor runs
`scripts/verify-fixtures.ts` for that clean-build defect/reference matrix and
owns its integration report. No case implementation is known incomplete.

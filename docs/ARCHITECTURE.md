# Architecture and trust boundaries

## Execution

Vue console -> API -> durable task queue -> single independent Worker -> AI SDK tools -> sealed source patch -> fresh production build -> trusted Playwright assertions -> archived report.

The API never holds an in-flight repair HTTP request. SSE reads ordered events with a sequence cursor; reconnection replays events, not browser memory or containers. A task can be observed after a page refresh.

State path: `queued -> preparing -> investigating -> repairing/checking -> evaluating -> succeeded/failed`. User cancellation ends `cancelled`; unexpected Worker restart ends `interrupted`. Retrying creates a NEW run on a fresh snapshot. No exactly-once or arbitrary-step recovery claims.

## Data

Four PostgreSQL tables: `tasks`, `runs`, `events`, `artifacts`. JSONB payloads retain evolving trace metadata. `events(task_id, seq)` is unique. A transaction-scoped advisory lock serializes mutations; a session advisory lock limits worker ownership to one. The current adapter reads table payloads per operation: intentionally simple for small serial experiments, **not a high-throughput queue**.

Local reviewed replay has an explicit JSON adapter with cross-process directory locking and atomic rename. Dead process locks are recovered. It is not a PostgreSQL substitute for production scale. Worker ownership uses a PID file only on this local adapter.

Artifact paths stay under a realpath-verified archive. Task access is checked before every artifact download. Reports/patches are attachments, not active HTML. Sources and browser execution directories are removed; evidence persists. No remote object storage.

## Model boundary

The model sees ONLY bounded source files, its bug description, and available tool output. It does not see catalog reference edits, Git history, test files, build config, credentials, or Docker arguments. The model receives no generic shell, JavaScript evaluation, upload or arbitrary URL tool.

`read_file` / `search_code`: allowlist, realpath/symlink checks, literal search, size and excerpt limits.

`apply_patch`: full file replacements with SHA256 preconditions, no additions/deletions, max 8 source files and 3 batches, byte budget. Batch validation happens before writes; this is not a filesystem transaction under disk failure.

`browser_observe`: ARIA plus element boxes, computed styles and archived screenshot. The baseline C must observe before editing. Screenshots help humans; this first model integration primarily consumes structured evidence rather than injecting image tokens.

`browser_act`: structured click/fill/select/press/viewport/navigate, own-origin restriction, unique selector and action timeout. Service workers blocked; HTTP and WebSocket requests restricted to the task URL.

`run_check`: fixed typecheck/build IDs only. Development feedback is not hidden acceptance.

`submit_patch`: seals candidate; it does not set success.

## Independent acceptance

Original reviewed snapshot is separate and never operated on by code tools. The evaluator copies it anew and applies validated source edits. It builds in a distinct production environment and runs private assertions from the host; test/config/reference files are not mounted in the execution container.

Candidate and evaluated source hashes must match. Accepting a patch means all defined assertions passed, not that the application is bug-free. The first version stops after a final hidden rejection; it does NOT reveal private assertions to fuel retries.

## Isolation

Local replay runs reviewed source under restricted process environment with no model credentials. **This is not an untrusted-code sandbox.**

Docker mode: fixed dependency image, non-root app user, read-only root/source mount, tmpfs, `--network none`, `--cap-drop ALL`, no-new-privileges, 768 MiB, 1 CPU, 128 PIDs. Browser reaches ONLY the fixture listener through a fixed raw TCP stdio tunnel launched by trusted `docker exec`; the app container has no network egress, published host ports, Docker socket or Worker secrets.

The trusted Worker has Docker daemon control and must itself be operated as privileged infrastructure. The Chromium driver runs outside the task container; route restrictions are not protection against a Chromium exploit. Reviewed fixtures only, no public arbitrary malicious-code hosting guarantee.

## Budgets and failure

240 seconds total; 18 model steps; 3 repair batches; 5 outstanding tasks; bounded log/output/artifact sizes. Cancellation aborts the model request, closes browser contexts, kills local process trees or removes the app container. A already-paid model request may still be charged by its provider.

Worker restart marks unfinished runs interrupted and cleans managed execution resources. The initial implementation uses a single worker lease and cold restart, not distributed orchestrator semantics. Reports preserve infrastructure failures.

Auth is one administrator, not multi-tenant accounts. Sessions are signed expiring HttpOnly SameSite cookies; mutations require same-origin checks and a custom header. Password/secret are operator configuration, not a public API field. Run creation is authenticated; public visibility is opt-in.

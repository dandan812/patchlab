# Linux self-hosting

This configuration is provided for operator-run deployment. No remote server has been contacted or modified by this delivery. Docker/PostgreSQL integration must be smoke-tested on the target host; see VERIFICATION.md for the actually checked environment.

## Prepare

Use a Linux Docker Engine host with Compose v2; host networking is intentional. Windows/macOS Docker Desktop are not the claimed deployment target.

1. Create an absolute data directory owned by UID 1000; restrict access. The API runs as UID 1000. The Worker needs access to the Docker daemon, and may create readable artifacts as root.
2. Copy `infra/deployment.env.example` to a PRIVATE deployment env file. Set strong random passwords and a 32+ character secret. `POSTGRES_PASSWORD` should be URL-safe because it is embedded in a connection URI.
3. Set `PATCHLAB_HOST_DATA` to the **host's absolute path**, not `/data`. The Worker maps its `/data/workspaces` path back to that directory for daemon-side bind mounts. Incorrect mapping must not be papered over with broader host mounts.
4. Build the fixed dependency fixture image before starting the Worker.

```sh
docker build -f infra/fixture.Dockerfile -t patchlab-fixture:local .
docker compose --env-file infra/deployment.env -f infra/compose.yaml build
docker compose --env-file infra/deployment.env -f infra/compose.yaml up -d
docker compose --env-file infra/deployment.env -f infra/compose.yaml logs -f api worker
```

Both the API and PostgreSQL bind to host loopback. Open `http://127.0.0.1:4310` using an SSH tunnel, or put an authenticated TLS reverse proxy in front. Configure the proxy to preserve the original Host/Origin relationship, disable buffering for SSE, and set `PATCHLAB_SECURE_COOKIE=true` for HTTPS. Do not expose PostgreSQL, Docker socket or generated password files.

The current Compose passes the model key to API as well as Worker solely to report readiness; it never reaches the task container or browser process. Prefer a dedicated low-quota model credential; avoid production keys.

## Smoke tests

- Log in and create the reviewed pagination replay. Expect before/after image, diff, accepted private report, execution JSON and Trace.
- Run `npm run fixtures:verify` inside an appropriately configured execution image or operator environment; each defective snapshot must fail, corrected snapshot pass.
- Configure a tool-capable compatible model. Run one paid dev case only after accepting the provider cost and source-data transfer.
- Cancel a live task, verify `cancelled`, no remaining labelled container or local child process, and that the next task runs.
- Restart the Worker during a task, verify `interrupted` and a fresh retry. Check labelled residual containers are removed.
- Probe unauthenticated create/cancel/private artifacts: deny them. Public reports remain available with no model allowance.
- Observe actual peak memory, browser/app PIDs, CPU and artifact bytes. Suggested host resources in the brief were an estimate, not measured sizing.

## Boundaries

Only the trusted Worker receives `/var/run/docker.sock`. App containers have no socket, host service network or secrets. `--network none` still permits their loopback listener; the fixed stdio tunnel connects only to that listener. Daemon control is host-root-equivalent privilege; protecting the Worker matters as much as app sandbox flags.

Pin production image digests once smoke-tested. The supplied Node/Postgres tags are convenient bootstrap versions, not immutable image hashes. Do not accept arbitrary fixture uploads or change Docker CLI parameters based on model output.

## Backup and rollback

Back up PostgreSQL and the artifact directory together; IDs in DB must reference archived files. Record image tags/digests, lockfile and prompt hash with experiments. Shut down task creation, wait or cancel active jobs, then snapshot/replace images. `docker compose down` retains the named PostgreSQL volume; do not add `-v` unless intentionally deleting the database.

Evidence retention is manual in this initial release; per-task bytes are limited but total disk space needs operator monitoring and a retention plan. Source workspaces are disposable, archived screenshots/reports are not. Never blindly recursively delete a computed host path.

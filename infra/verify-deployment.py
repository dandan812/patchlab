import argparse
import http.cookiejar
import json
import pathlib
import subprocess
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument("--root", required=True)
parser.add_argument("--api", default="http://127.0.0.1:4310")
parser.add_argument("--worker", default="patchlab-us-worker-1")
parser.add_argument("--instance", default="us-production")
parser.add_argument("--recovery", action="store_true")
args = parser.parse_args()
root = pathlib.Path(args.root).resolve()
settings = dict(
    line.split("=", 1)
    for line in (root / "deployment.env").read_text().splitlines()
    if line and not line.startswith("#")
)
password = settings["PATCHLAB_ADMIN_PASSWORD"]
cookie = ""
checks = []
tasks = []


def request(route, data=None, authenticated=True):
    headers = {"X-Patchlab-Request": "1", "Origin": args.api}
    if authenticated and cookie:
        headers["Cookie"] = cookie
    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode()
    req = urllib.request.Request(args.api + route, data=body, headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read()
    with response:
        return response.status, response.headers, response.read()


def json_request(route, data=None, authenticated=True, expected=200):
    status, headers, body = request(route, data, authenticated)
    if status != expected:
        raise AssertionError(f"{route}: expected {expected}, got {status}")
    return json.loads(body), headers


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    checks.append({"name": name, "passed": True})
    print("PASS", name, flush=True)


def create(case="products-pagination", public=False):
    task, _ = json_request("/api/tasks", {
        "caseId": case, "mode": "replay", "strategy": "C", "public": public,
        "description": "[Deployment smoke, scripted replay NOT AI] Reviewed reference and isolation verification.",
    }, expected=201)
    tasks.append(task["id"])
    return task["id"]


def detail(task_id):
    return json_request("/api/tasks/" + task_id)[0]


def wait(task_id, predicate, timeout=200):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = detail(task_id)
        if predicate(value):
            return value
        time.sleep(0.25)
    raise AssertionError("Task did not reach expected state: " + task_id)


def containers():
    return subprocess.check_output([
        "docker", "ps", "-aq", "--filter", "label=patchlab=managed",
        "--filter", "label=patchlab.instance=" + args.instance,
    ], text=True).split()


def finished(value):
    return value["task"]["status"] in {
        "succeeded", "failed", "cancelled", "interrupted",
    } and bool((value.get("run") or {}).get("finishedAt"))


try:
    meta, _ = json_request("/api/meta", authenticated=False)
    check("PostgreSQL and Docker active; paid model disabled",
          meta["storage"] == "postgresql" and meta["sandbox"] == "docker"
          and not meta["modelConfigured"] and not meta["modelCredentialsConfigured"])
    status, _, _ = request("/api/tasks", {
        "caseId": "products-pagination", "mode": "replay",
        "description": "Unauthorized smoke request",
    }, authenticated=False)
    check("anonymous task creation denied", status == 401)
    _, headers = json_request("/api/login", {"password": password}, authenticated=False)
    cookie = headers["Set-Cookie"].split(";", 1)[0]
    check("administrator login and HttpOnly session", "HttpOnly" in headers["Set-Cookie"])
    status, _, _ = request("/api/tasks", {
        "caseId": "products-pagination", "mode": "model",
        "description": "Model must remain disabled during deployment",
    })
    check("unconfigured paid model explicitly rejected", status == 409)

    task_id = create(public=False)
    check("private task invisible to visitors",
          request("/api/tasks/" + task_id, authenticated=False)[0] == 404)
    result = wait(task_id, finished)
    check("reference replay and independent acceptance succeeded",
          result["task"]["status"] == "succeeded" and result["report"]["passed"])
    kinds = {artifact["kind"] for artifact in result["artifacts"]}
    check("before/after images, patch, trace and report archived",
          {"before", "after", "patch", "trace", "report", "log"} <= kinds)
    for artifact in result["artifacts"]:
        check("private artifact denied: " + artifact["kind"],
              request("/api/artifacts/" + artifact["id"], authenticated=False)[0] == 404)
    sequences = [event["seq"] for event in result["events"]]
    check("PostgreSQL event sequences are unique", len(set(sequences)) == len(sequences))
    check("replay is not reported as AI or zero-cost model evidence",
          "NOT AI" in result["run"]["model"] and result["run"]["costUsd"] is None)

    cancelled = create("products-editor-scroll")
    wait(cancelled, lambda d: d["task"]["status"] == "investigating" or finished(d))
    json_request("/api/tasks/" + cancelled + "/cancel", {})
    result = wait(cancelled, finished)
    check("live task cancellation completed", result["task"]["status"] == "cancelled")
    time.sleep(1)
    check("cancellation removed workspace and managed containers",
          not (root / "data" / "workspaces" / cancelled).exists() and not containers())

    if args.recovery:
        if args.worker not in {"patchlab-us-worker-1", "patchlab-smoke-worker-1"}:
            raise AssertionError("Refusing to kill an unexpected worker")
        crashed = create()
        wait(crashed, lambda d: d["task"]["status"] == "investigating" or finished(d))
        check("fixture is live before controlled PatchLab-only crash", bool(containers()))
        subprocess.run(["docker", "kill", "--signal", "KILL", args.worker], check=True)
        result = wait(crashed, lambda d: d["task"]["status"] == "interrupted", timeout=60)
        json_request("/api/health")
        time.sleep(1)
        check("API survives worker crash; task marked interrupted",
              result["task"]["status"] == "interrupted")
        check("restart removes scoped orphan containers and workspace",
              not containers() and not (root / "data" / "workspaces" / crashed).exists())

    retry = create("tasks-status")
    result = wait(retry, finished)
    check("fresh task succeeds after cancellation/restart",
          result["task"]["status"] == "succeeded" and result["report"]["passed"])
finally:
    report = root / "data" / "qa" / "deployment-smoke.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "api": args.api, "tasks": tasks, "checks": checks,
    }, indent=2) + "\n")

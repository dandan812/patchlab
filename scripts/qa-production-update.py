import argparse
import json
import pathlib
import re

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="https://patchlab.i-tool-chat.store")
parser.add_argument("--browser", required=True)
parser.add_argument("--password-file", default="data/deployment-us/admin-password.txt")
parser.add_argument("--out", default="data/update-20261005/qa")
args = parser.parse_args()
out = pathlib.Path(args.out).resolve()
out.mkdir(parents=True, exist_ok=True)
checks = []
errors = []
failures = []
bad_responses = []
password = pathlib.Path(args.password_file).read_text().strip()
key = pathlib.Path("data/secrets/model-api-key.txt").read_text().strip()


def check(name, condition):
    assert condition, name
    checks.append(name)


def fits(page):
    check("viewport fits " + str(page.viewport_size["width"]), page.evaluate(
        "Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1"))
    check("button labels fit", not page.locator("button").evaluate_all("""nodes => nodes
        .filter(n => n.getBoundingClientRect().width > 0 && n.scrollWidth > n.clientWidth + 2)
        .map(n => n.textContent)"""))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=args.browser)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: failures.append(request.url))
    page.on("response", lambda response: bad_responses.append({"url": response.url, "status": response.status})
            if response.status >= 400 else None)
    try:
        page.goto(args.url + "/#/cases", wait_until="networkidle")
        page.wait_for_selector(".case-item")
        health = context.request.get(args.url + "/api/health")
        check("trusted HTTPS and PostgreSQL health", health.status == 200 and health.json()["storage"] == "postgresql")
        meta_response = context.request.get(args.url + "/api/meta")
        meta = meta_response.json()
        check("model credentials and Docker execution configured", meta["modelConfigured"] and meta["modelCredentialsConfigured"])
        check("requested model and Responses API", meta["modelId"] == "gpt-6.1-sol" and meta["modelApiType"] == "responses")
        check("anonymous metadata excludes credentials", key not in meta_response.text() and password not in meta_response.text()
              and not any(re.search(r"api.?key|password|secret", name, re.I) for name in meta))
        check("anonymous not logged in", not meta["authenticated"])
        cases = context.request.get(args.url + "/api/cases").json()
        check("twenty cases and original split", len(cases) == 20
              and sum(case["split"] == "dev" for case in cases) == 12
              and sum(case["split"] == "holdout" for case in cases) == 8)
        for case in cases:
            check("Chinese case: " + case["id"], all(re.search(r"[\u4e00-\u9fff]", text) for text in
                  [case["title"], case["description"], *case["steps"], *case["criteria"]]))
        check("all cases rendered", page.locator(".case-item").count() == 20)
        for url in page.locator("script[src]").evaluate_all("nodes => nodes.map(n => n.src)"):
            script = context.request.get(url)
            check("browser asset is public and credential-free", script.status == 200
                  and key not in script.text() and password not in script.text())
        fits(page)
        page.screenshot(path=str(out / "desktop-cases.png"), full_page=True)
        page.get_by_label("搜索案例").fill("第三页")
        check("Chinese search", page.locator(".case-item").count() == 1)
        page.get_by_label("搜索案例").fill("")
        page.get_by_label("案例类别").select_option("layout")
        check("category filter", page.locator(".case-item").count() == 6)
        page.get_by_label("案例类别").select_option("all")
        page.set_viewport_size({"width": 390, "height": 844})
        fits(page)
        page.screenshot(path=str(out / "mobile-cases.png"), full_page=True)
        page.get_by_role("button", name="登录", exact=True).click()
        page.get_by_label("管理员密码").fill(password)
        page.get_by_role("dialog").get_by_role("button", name="登录", exact=True).click()
        page.get_by_role("button", name="退出登录", exact=True).wait_for()
        check("administrator session established", context.request.get(args.url + "/api/meta").json()["authenticated"])
        session = next(cookie for cookie in context.cookies() if cookie["name"] == "patchlab_session")
        check("secure HttpOnly cookie", session["secure"] and session["httpOnly"])
        page.get_by_role("button", name="新建任务", exact=True).click()
        dialog = page.get_by_role("dialog")
        options = dialog.locator("select option").all_text_contents()
        check("twenty Chinese task options", len(options) == 20
              and all(re.search(r"[\u4e00-\u9fff]", option) for option in options))
        check("Chinese description default", dialog.locator("textarea").input_value() == cases[0]["description"])
        check("model selection enabled for administrator", not dialog.locator('input[value="model"]').is_disabled())
        dialog.locator('input[value="model"]').check()
        check("model selectable without creating task", dialog.locator('input[value="model"]').is_checked())
        fits(page)
        page.screenshot(path=str(out / "mobile-model-form.png"), full_page=True)
        dialog.get_by_role("button", name="取消", exact=True).click()
        page.get_by_role("button", name="设置", exact=True).click()
        page.get_by_role("heading", name="工作区设置").wait_for()
        settings = page.locator(".settings-page").inner_text()
        check("model settings visible", "gpt-6.1-sol" in settings and "Responses API" in settings)
        fits(page)
        page.screenshot(path=str(out / "mobile-settings.png"), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 900})
        fits(page)
        page.screenshot(path=str(out / "desktop-settings.png"), full_page=True)
        page.get_by_role("button", name="退出登录", exact=True).click()
        for task_id, passed in [("0f55f2be-5bc3-4b3e-b461-7600df6e48db", True),
                                ("a759f610-87ea-4c7f-95de-869b98405e0c", False)]:
            detail = context.request.get(args.url + "/api/tasks/" + task_id).json()
            check("historical verdict preserved: " + task_id,
                  detail["task"]["mode"] == "replay" and detail["report"]["passed"] == passed)
            page.goto(args.url + "/#/tasks/" + task_id, wait_until="networkidle")
            page.get_by_role("heading", level=1).wait_for()
            check("historical description displayed in Chinese", bool(re.search(
                r"[\u4e00-\u9fff]", page.locator(".detail-title p").inner_text())))
            page.get_by_role("tab", name=re.compile("^验收")).click()
            page.get_by_role("heading", name="验收通过" if passed else "验收未通过", exact=True).wait_for()
            labels = page.locator(".assertion-list strong").all_text_contents()
            check("historical assertion display Chinese", len(labels) == len(detail["report"]["assertions"])
                  and all(re.search(r"[\u4e00-\u9fff]", label) for label in labels))
            fits(page)
            page.screenshot(path=str(out / ("history-" + task_id + ".png")), full_page=True)
        check("no browser errors", not errors)
        check("no failed requests", not failures)
        check("no failed page responses", not bad_responses)
        report = {"passed": True, "url": args.url, "checks": checks, "pageErrors": errors,
                  "failedRequests": failures, "badResponses": bad_responses, "realInferenceRun": False}
        (out / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({"passed": True, "checks": len(checks), "report": str(out / "report.json")}))
    finally:
        context.close()
        browser.close()

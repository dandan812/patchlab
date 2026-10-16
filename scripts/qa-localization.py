import argparse
import json
import pathlib
import re

from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:5173")
parser.add_argument("--browser", required=True)
parser.add_argument("--data", default="data/localization-preview")
args = parser.parse_args()
data = pathlib.Path(args.data).resolve()
out = data / "qa"
out.mkdir(parents=True, exist_ok=True)
checks = []
errors = []
failed_requests = []


def check(name, condition):
    assert condition, name
    checks.append(name)


def fits(page):
    dimensions = page.evaluate("""() => ({
        width: innerWidth,
        content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth)
    })""")
    check("viewport fits " + str(dimensions["width"]), dimensions["content"] <= dimensions["width"] + 1)
    overflow = page.locator("button").evaluate_all("""nodes => nodes
        .filter(n => n.getBoundingClientRect().width > 0 && n.scrollWidth > n.clientWidth + 2)
        .map(n => n.textContent)""")
    check("button labels fit", not overflow)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=args.browser)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("requestfailed", lambda request: failed_requests.append(request.url))
    try:
        page.goto(args.url + "/#/cases", wait_until="networkidle")
        page.wait_for_selector(".case-item")
        response = context.request.get(args.url + "/api/cases")
        check("case API responds", response.status == 200)
        cases = response.json()
        check("twenty cases", len(cases) == 20)
        check("development and holdout split preserved",
              sum(item["split"] == "dev" for item in cases) == 12
              and sum(item["split"] == "holdout" for item in cases) == 8)
        for item in cases:
            content = [item["title"], item["description"], *item["steps"], *item["criteria"]]
            check("Chinese case text: " + item["id"],
                  all(re.search(r"[\u4e00-\u9fff]", text) for text in content))
        check("all case cards visible", page.locator(".case-item").count() == 20)
        fits(page)
        page.screenshot(path=str(out / "desktop-cases-zh.png"), full_page=True)
        page.get_by_label("搜索案例").fill("第三页")
        check("Chinese case search", page.locator(".case-item").count() == 1)
        page.get_by_label("搜索案例").fill("")
        page.get_by_label("案例类别").select_option("layout")
        check("layout filter", page.locator(".case-item").count() == 6)
        page.get_by_label("案例类别").select_option("all")
        page.set_viewport_size({"width": 390, "height": 844})
        fits(page)
        page.screenshot(path=str(out / "mobile-cases-zh.png"), full_page=True)
        page.get_by_role("button", name="登录", exact=True).click()
        password = (data / "local-password.txt").read_text().strip()
        page.get_by_label("管理员密码").fill(password)
        page.get_by_role("dialog").get_by_role("button", name="登录", exact=True).click()
        page.get_by_role("button", name="退出登录", exact=True).wait_for()
        page.get_by_role("button", name="新建任务", exact=True).click()
        dialog = page.get_by_role("dialog")
        options = dialog.locator("select option").all_text_contents()
        check("twenty Chinese case options", len(options) == 20
              and all(re.search(r"[\u4e00-\u9fff]", option) for option in options))
        description = dialog.locator("textarea").input_value()
        check("new task defaults to Chinese description", description == cases[0]["description"])
        check("model execution stays blocked without Docker",
              dialog.locator('input[type="radio"][value="model"]').is_disabled())
        for label in ["取消", "创建并运行"]:
            button = dialog.get_by_role("button", name=label, exact=True)
            button.scroll_into_view_if_needed()
            button.click(trial=True)
            check("mobile form action reachable: " + label, button.is_visible())
        fits(page)
        page.screenshot(path=str(out / "mobile-create-zh.png"), full_page=True)
        dialog.get_by_role("button", name="取消", exact=True).click()
        page.get_by_role("button", name="设置", exact=True).click()
        page.get_by_role("heading", name="工作区设置").wait_for()
        check("configured model shown", "gpt-6.1-sol" in page.locator(".settings-page").inner_text())
        check("Responses API shown", "Responses API" in page.locator(".settings-page").inner_text())
        meta = context.request.get(args.url + "/api/meta").json()
        check("credentials configured, local model execution disabled",
              meta["modelCredentialsConfigured"] and not meta["modelConfigured"])
        check("metadata does not expose secrets",
              not any(re.search(r"api.?key|password|secret", key, re.I) for key in meta))
        fits(page)
        page.screenshot(path=str(out / "mobile-settings-model.png"), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 900})
        fits(page)
        page.screenshot(path=str(out / "desktop-settings-model.png"), full_page=True)
        historical = {}
        for task_id in ["0f55f2be-5bc3-4b3e-b461-7600df6e48db", "a759f610-87ea-4c7f-95de-869b98405e0c"]:
            source = context.request.get("https://patchlab.i-tool-chat.store/api/tasks/" + task_id)
            check("public historical source available: " + task_id, source.status == 200)
            detail = source.json()
            check("historical source is explicitly replay", detail["task"]["mode"] == "replay")
            historical[task_id] = detail

        def history_route(route):
            task_id = route.request.url.rsplit("/", 1)[-1]
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(historical[task_id]))

        page.route("**/api/tasks", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps([detail["task"] for detail in historical.values()])))
        page.route("**/api/tasks/*", history_route)
        for task_id, detail in historical.items():
            page.goto(args.url + "/#/tasks/" + task_id, wait_until="networkidle")
            page.get_by_role("heading", level=1).wait_for()
            check("historical task description displayed in Chinese",
                  bool(re.search(r"[\u4e00-\u9fff]", page.locator(".detail-title p").inner_text())))
            page.get_by_role("tab", name=re.compile("^验收")).click()
            verdict = "验收通过" if detail["report"]["passed"] else "验收未通过"
            page.get_by_role("heading", name=verdict, exact=True).wait_for()
            check("historical verdict preserved: " + task_id, True)
            labels = page.locator(".assertion-list strong").all_text_contents()
            check("historical assertion display in Chinese: " + task_id,
                  len(labels) == len(detail["report"]["assertions"])
                  and all(re.search(r"[\u4e00-\u9fff]", label) for label in labels))
            fits(page)
            page.screenshot(path=str(out / ("historical-" + task_id + "-zh.png")), full_page=True)
        check("no browser errors", not errors)
        check("no failed requests", not failed_requests)
        report = {"passed": True, "checks": checks, "pageErrors": errors,
                  "failedRequests": failed_requests, "realInferenceRun": False}
        (out / "localization-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
        print(json.dumps({"passed": True, "checks": len(checks), "report": str(out / "localization-report.json")}))
    finally:
        context.close()
        browser.close()

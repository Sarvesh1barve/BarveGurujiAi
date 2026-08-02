import { expect, test } from "@playwright/test";

test("production build mounts and supports the core no-key flow", async ({ page, isMobile }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const sourceRequests: string[] = [];
  const assetResponses: Array<{ url: string; status: number }> = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} — ${request.failure()?.errorText ?? "failed"}`));
  page.on("request", (request) => {
    if (/\/(?:BarveGurujiAi\/)?src\/main\.ts(?:$|[?#])/u.test(request.url())) sourceRequests.push(request.url());
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === "http://127.0.0.1:4173" && /\.(?:js|css)(?:$|[?#])/u.test(url.pathname)) {
      assetResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 });
  await page.goto("./");
  await expect(page).toHaveTitle("Barve Guruji AI");
  await expect(page.locator("#app")).not.toBeEmpty();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator("#chat-feed")).toBeVisible();
  await expect(page.locator("#composer")).toBeVisible();
  await expect(page.locator("#message-input")).toBeVisible();
  await expect(page.locator("#send-button")).toBeVisible();
  await expect(page.locator("#settings-button")).toBeVisible();
  await expect(page.locator("[data-quick]").first()).toBeVisible();

  if (!isMobile) {
    await page.evaluate(async () => {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.filter((key) => key.startsWith("barve-guruji-")).map((key) => caches.delete(key)));
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.filter(({ scope }) => scope.includes("/BarveGurujiAi/")).map((registration) => registration.unregister()));
    });
    await page.goto(`./?smoke-test=${Date.now()}`);
    await expect(page.locator("#app")).not.toBeEmpty();
  }

  await page.locator("#settings-button").click();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(page.locator("#settings-dialog")).toBeHidden();

  await page.locator("#message-input").fill("Please explain Sankalpa briefly.");
  await page.locator("#send-button").click();
  await expect(page.getByText("Add your own Gemini API key in Settings. The question remains saved locally.")).toBeVisible();
  await expect(page.locator("#settings-dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#settings-dialog")).toBeHidden();

  await page.screenshot({
    path: `docs/screenshots/deployment-smoke-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });

  await testInfo.attach("smoke-diagnostics", {
    body: Buffer.from(JSON.stringify({ assetResponses, sourceRequests, pageErrors, failedRequests, consoleErrors }, null, 2)),
    contentType: "application/json",
  });

  expect(assetResponses.some(({ url, status }) => url.endsWith(".js") && status === 200)).toBe(true);
  expect(assetResponses.some(({ url, status }) => url.endsWith(".css") && status === 200)).toBe(true);
  expect(assetResponses.filter(({ status }) => status === 404)).toEqual([]);
  expect(sourceRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

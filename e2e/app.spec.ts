import { expect, test } from "@playwright/test";

test("creates a consultation and preserves it when language changes", async ({ page }) => {
  await page.goto("./"); await expect(page.getByRole("heading", { name: /New Consultation|नवीन सल्लामसलत/ })).toBeVisible();
  await page.locator("#settings-button").click(); await page.getByLabel("Response language").selectOption("en"); await page.getByRole("button", { name: "Save settings" }).click(); await page.locator("#settings-dialog .modal-header button").click();
  await expect(page.getByRole("heading", { name: /New Consultation|नवीन सल्लामसलत/ })).toBeVisible();
});

test("stores and forgets a session-only API key", async ({ page }) => {
  await page.goto("./"); await page.locator("#settings-button").click(); await page.getByLabel("Gemini API key").fill("test-key-not-real"); await page.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Key stored for this browser session only.")).toBeVisible(); await page.getByRole("button", { name: "Forget" }).click(); await expect(page.getByText("API key removed.")).toBeVisible();
});

test("attaches and removes images and PDFs", async ({ page }) => {
  await page.goto("./"); page.on("dialog", (dialog) => dialog.accept());
  const chooser = page.locator("#file-input"); await chooser.setInputFiles([{ name: "chart.png", mimeType: "image/png", buffer: Buffer.from("png") }, { name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("pdf") }]);
  await expect(page.getByText("chart.png")).toBeVisible(); await expect(page.getByText("notes.pdf")).toBeVisible(); await page.getByLabel("Remove chart.png", { exact: true }).click(); await page.getByLabel("Remove notes.pdf", { exact: true }).click(); await expect(page.getByText("chart.png")).toBeHidden();
});

test("uses the GitHub Pages base path and mobile drawer", async ({ page, isMobile }) => {
  await page.goto("./"); expect(new URL(page.url()).pathname).toBe("/BarveGurujiAi/");
  if (isMobile) { await page.getByLabel("Open consultations").click(); await expect(page.locator("#sidebar")).toHaveClass(/open/); }
});

test("captures the resulting responsive UI", async ({ page, isMobile }) => {
  await page.goto("./");
  await page.screenshot({ path: `docs/screenshots/${isMobile ? "mobile" : "desktop"}.png`, fullPage: true });
});

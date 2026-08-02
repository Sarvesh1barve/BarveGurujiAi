import { renderSafeMarkdown } from "../src/utils/markdown";

describe("Markdown sanitisation", () => {
  it("keeps safe formatting and removes active content", () => {
    const html = renderSafeMarkdown("**safe**<img src=x onerror=alert(1)><script>alert(2)</script>[x](javascript:alert(3))");
    expect(html).toContain("<strong>safe</strong>"); expect(html).not.toContain("script"); expect(html).not.toContain("onerror"); expect(html).not.toContain("javascript:");
  });
});

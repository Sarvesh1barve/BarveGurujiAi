import { compareVersions } from "../src/pwa/updateManager";

describe("application version comparison", () => {
  it("compares semantic release components", () => { expect(compareVersions("2.1.0", "2.0.9")).toBe(1); expect(compareVersions("2.0.0", "2.0.0")).toBe(0); expect(compareVersions("1.9.9", "2.0.0")).toBe(-1); });
});

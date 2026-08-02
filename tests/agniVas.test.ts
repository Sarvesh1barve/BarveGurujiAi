import { calculateAgniVas } from "../src/domain/agniVas/calculator";

describe("versioned Agni Vasa method", () => {
  it.each([[2, "Patal"], [1, "Akash"], [3, "Prithvi"], [0, "Prithvi"]] as const)("maps remainder %i to %s", (remainder, location) => {
    const tithi = remainder === 0 ? 6 : remainder + 2; // with Sunday: (tithi + 1 + 1) mod 4
    const result = calculateAgniVas(tithi, 1); expect(result.remainder).toBe(remainder); expect(result.location).toBe(location);
  });
  it("rejects invalid traditional inputs", () => { expect(() => calculateAgniVas(0, 1)).toThrow(); expect(() => calculateAgniVas(1, 8)).toThrow(); });
});

import { describe, expect, it } from "vitest";
import { friendlyName } from "./format";

describe("friendlyName", () => {
  it("strips corporate suffixes", () => {
    expect(friendlyName("NVDA", "Nvidia Corp")).toBe("Nvidia");
    expect(friendlyName("AAPL", "Apple Inc.")).toBe("Apple");
    expect(friendlyName("MSFT", "Microsoft Corporation")).toBe("Microsoft");
    expect(friendlyName("GOOGL", "Alphabet Inc. Class A Common Stock")).toBe("Alphabet");
    expect(friendlyName("TSLA", "Tesla, Inc. Common Stock")).toBe("Tesla");
  });
  it("names index funds by their index", () => {
    expect(friendlyName("SPY", "State Street SPDR S&P 500 ETF Trust")).toBe("S&P 500");
  });
});

describe("friendlyName edge cases", () => {
  it("drops parentheticals and fixes all-caps names", () => {
    expect(friendlyName("UNH", "UNITEDHEALTH GROUP INCORPORATED (Delaware)")).toBe("Unitedhealth");
  });
});

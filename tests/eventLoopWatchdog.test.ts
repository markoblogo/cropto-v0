import { describe, expect, it } from "@jest/globals";
import { calculateEventLoopLagMs } from "../server/utils/eventLoopWatchdog";

describe("calculateEventLoopLagMs", () => {
  it("returns only the delay beyond the expected interval", () => {
    expect(calculateEventLoopLagMs(1_000, 1_500, 400)).toBe(100);
  });

  it("never returns negative lag when the timer fires early", () => {
    expect(calculateEventLoopLagMs(1_000, 1_300, 400)).toBe(0);
  });
});

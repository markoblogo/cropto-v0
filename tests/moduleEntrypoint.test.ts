import { describe, expect, it } from "@jest/globals";
import { isDirectEntrypoint } from "../server/utils/moduleEntrypoint";

describe("isDirectEntrypoint", () => {
  it("matches direct tsx execution by entry filename", () => {
    expect(
      isDirectEntrypoint("file:///repo/server/jobs/telegramPoller.ts", "/repo/server/jobs/telegramPoller.ts", [
        "telegramPoller",
      ]),
    ).toBe(true);
  });

  it("does not match when a bundled app imports the module", () => {
    expect(
      isDirectEntrypoint("file:///app/dist/index.js", "/app/dist/index.js", ["telegramPoller"]),
    ).toBe(false);
  });
});

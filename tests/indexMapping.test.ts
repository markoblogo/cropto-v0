import { describe, it, expect } from "@jest/globals";
import { SPOT_ALLOWED_SLUGS } from "../client/src/lib/indexMapping";

describe("SPOT_ALLOWED_SLUGS", () => {
  it("contains the supported spot commodities in the expected order", () => {
    expect(SPOT_ALLOWED_SLUGS).toEqual([
      "corn",
      "wheat-115",
      "feed-wheat",
      "gmo-soybeans",
      "gmo-soybeans-processing",
      "sunflower-seed",
      "rapeseed",
    ]);
  });
});

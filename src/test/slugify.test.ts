import { describe, it, expect } from "vitest";
import { slugify } from "@/lib/utils";

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Mercury Lounge")).toBe("mercury-lounge");
  });

  it("strips special characters", () => {
    expect(slugify("Jazz Night!")).toBe("jazz-night");
  });

  it("collapses consecutive non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("Mercury Lounge: Jazz Night!")).toBe("mercury-lounge-jazz-night");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("!Hello World!")).toBe("hello-world");
  });

  it("handles numbers", () => {
    expect(slugify("Open Mic #5")).toBe("open-mic-5");
  });
});

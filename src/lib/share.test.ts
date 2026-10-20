import { describe, expect, it } from "vitest";
import { sharedTitle } from "./share";

describe("sharedTitle", () => {
  it("prefers the title, then text, then url", () => {
    expect(sharedTitle({ title: "Title", text: "Text", url: "https://x" })).toBe("Title");
    expect(sharedTitle({ title: "", text: "Text", url: "https://x" })).toBe("Text");
    expect(sharedTitle({ title: null, text: null, url: "https://x" })).toBe("https://x");
  });

  it("collapses whitespace and clamps to 120 characters", () => {
    const title = sharedTitle({ text: `  one\n\n two\tthree  ` });
    expect(title).toBe("one two three");
    expect(sharedTitle({ text: "x".repeat(200) })).toHaveLength(120);
  });

  it("returns an empty string for empty input", () => {
    expect(sharedTitle({})).toBe("");
  });
});

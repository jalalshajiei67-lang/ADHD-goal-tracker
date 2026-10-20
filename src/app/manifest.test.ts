import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifest", () => {
  it("accepts shared text from Android", () => {
    expect(manifest().share_target).toEqual({
      action: "/share",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url" },
    });
  });

  it("offers an add-goal shortcut", () => {
    expect(manifest().shortcuts?.[0]).toMatchObject({
      name: "Add a goal",
      url: "/goals?new=1",
    });
  });
});

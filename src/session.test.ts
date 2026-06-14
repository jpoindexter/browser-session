import { describe, it, expect } from "vitest";
import { domainOf, cookieToPlaywright } from "./session.js";

describe("domainOf", () => {
  it("extracts the host + drops www", () => {
    expect(domainOf("https://x.com/i/bookmarks")).toBe("x.com");
    expect(domainOf("https://www.reddit.com/r/x")).toBe("reddit.com");
    expect(domainOf("not a url")).toBe("");
  });
});

describe("cookieToPlaywright", () => {
  it("parses a header into url-scoped cookies (origin only)", () => {
    expect(cookieToPlaywright("auth_token=abc; ct0=def", "https://x.com/i/bookmarks")).toEqual([
      { name: "auth_token", value: "abc", url: "https://x.com" },
      { name: "ct0", value: "def", url: "https://x.com" },
    ]);
  });

  it("keeps __Host- prefixes (valid tokens), skips malformed pairs + bad names", () => {
    const out = cookieToPlaywright("a=1; broken; __Host-xx=2; bad name=3", "https://reddit.com/");
    expect(out.map((c) => c.name)).toEqual(["a", "__Host-xx"]);
    expect(out[0]?.url).toBe("https://reddit.com");
  });

  it("drops values with control chars (a bad-decrypt artifact)", () => {
    const out = cookieToPlaywright(`good=ok; bad=va${String.fromCharCode(7)}lue`, "https://x.com/");
    expect(out.map((c) => c.name)).toEqual(["good"]);
  });
});

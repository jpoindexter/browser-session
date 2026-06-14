#!/usr/bin/env node
import { getCookies, type Browser } from "./cookies.js";
import { readPage } from "./index.js";

// CLI:
//   browser-session cookies x.com [--browser brave]        # print the cookie header
//   browser-session read https://x.com/i/bookmarks --browser brave   # render a logged-in page
//   browser-session read https://example.com               # anonymous read

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const browser = (arg("--browser") as Browser | undefined) ?? "brave";

  if (cmd === "cookies") {
    const domain = process.argv[3];
    if (!domain) return void console.error("usage: browser-session cookies <domain> [--browser brave|chrome|edge]");
    const r = getCookies({ browser, domain });
    if (!r.ok) {
      console.error(r.error);
      process.exitCode = 1;
      return;
    }
    console.log(flag("--names") ? r.cookie.split("; ").map((p) => p.split("=")[0]).join(", ") : r.cookie);
    return;
  }

  if (cmd === "read") {
    const url = process.argv[3];
    if (!url) return void console.error("usage: browser-session read <url> [--browser brave|chrome|edge]");
    const useBrowser = process.argv.includes("--browser") ? browser : undefined;
    const r = await readPage(url, { browser: useBrowser });
    if (!r.ok) {
      console.error(r.error);
      process.exitCode = 1;
      return;
    }
    console.log(r.text);
    return;
  }

  console.error("usage: browser-session <cookies|read> ...\n  cookies <domain> [--browser b] [--names]\n  read <url> [--browser b]");
  process.exitCode = 1;
}

main();

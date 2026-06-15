#!/usr/bin/env node
import { getCookies, type Browser } from "./cookies.js";
import { readPage, fetchYouTubeInfo, fetchYouTubeSubtitles } from "./index.js";

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

  if (cmd === "youtube") {
    const url = process.argv[3];
    if (!url) return void console.error("usage: browser-session youtube <url> [--subs|--info]");
    const mode = flag("--subs") ? "subs" : flag("--info") ? "info" : "both";
    if (mode !== "subs") {
      const r = await fetchYouTubeInfo(url);
      if (!r.ok) { console.error(r.error); process.exitCode = 1; return; }
      const { title, channel, duration, uploadDate, viewCount, description } = r.info;
      console.log(`Title: ${title}`);
      if (channel) console.log(`Channel: ${channel}`);
      if (duration) console.log(`Duration: ${Math.floor(duration / 60)}m${duration % 60}s`);
      if (uploadDate) console.log(`Uploaded: ${uploadDate}`);
      if (viewCount != null) console.log(`Views: ${viewCount.toLocaleString()}`);
      if (description) console.log(`\n${description}`);
    }
    if (mode !== "info") {
      const r = await fetchYouTubeSubtitles(url);
      if (!r.ok) { if (mode === "subs") { console.error(r.error); process.exitCode = 1; } return; }
      if (mode === "both") console.log("\n--- Transcript ---");
      console.log(r.subtitles);
    }
    return;
  }

  console.error("usage: browser-session <cookies|read|youtube> ...\n  cookies <domain> [--browser b] [--names]\n  read <url> [--browser b]\n  youtube <url> [--info|--subs]");
  process.exitCode = 1;
}

main();

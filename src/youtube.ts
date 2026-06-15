// YouTube reach via yt-dlp: zero browser login needed for most videos.
// yt-dlp is an optional peer — install it with: pip install yt-dlp
// Errors-as-values, never throws — same contract as the rest of browser-session.

import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 60_000;

export type YouTubeInfo = {
  title: string;
  channel?: string;
  duration?: number;
  description?: string;
  uploadDate?: string;
  viewCount?: number;
  url: string;
};

export type YouTubeInfoResult = { ok: true; info: YouTubeInfo } | { ok: false; error: string };
export type YouTubeSubtitlesResult = { ok: true; subtitles: string } | { ok: false; error: string };

/**
 * Fetch video metadata from a YouTube URL via yt-dlp.
 * Returns title, channel, duration, description, upload date, view count.
 */
export async function fetchYouTubeInfo(url: string): Promise<YouTubeInfoResult> {
  try {
    const { stdout } = await run("yt-dlp", ["-j", "--no-playlist", url], { timeout: TIMEOUT_MS });
    const d = JSON.parse(stdout.trim()) as Record<string, unknown>;
    return {
      ok: true,
      info: {
        title: String(d["title"] ?? ""),
        channel: d["channel"] ? String(d["channel"]) : undefined,
        duration: typeof d["duration"] === "number" ? d["duration"] : undefined,
        description: d["description"] ? String(d["description"]).slice(0, 2_000) : undefined,
        uploadDate: d["upload_date"] ? String(d["upload_date"]) : undefined,
        viewCount: typeof d["view_count"] === "number" ? d["view_count"] : undefined,
        url,
      },
    };
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("not found") || msg.includes("ENOENT")) {
      return { ok: false, error: "yt-dlp not installed (pip install yt-dlp)" };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Download and extract subtitle/caption text from a YouTube video.
 * Prefers manual subs, falls back to auto-generated. Returns deduplicated plain text.
 */
export async function fetchYouTubeSubtitles(url: string): Promise<YouTubeSubtitlesResult> {
  const dir = join(tmpdir(), `yt-subs-${randomUUID()}`);
  try {
    await mkdir(dir, { recursive: true });
    try {
      await run(
        "yt-dlp",
        ["--write-auto-subs", "--write-subs", "--skip-download", "--sub-format", "vtt", "--no-playlist", "-o", join(dir, "sub"), url],
        { timeout: TIMEOUT_MS },
      );
    } catch {
      // yt-dlp exits non-zero when no subs — check for output anyway
    }
    const files = await readdir(dir);
    const vtt = files.find((f) => f.endsWith(".vtt"));
    if (!vtt) return { ok: false, error: "no subtitles available for this video" };
    const raw = await readFile(join(dir, vtt), "utf8");
    return { ok: true, subtitles: parseVtt(raw) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function parseVtt(vtt: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of vtt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("WEBVTT") || /^\d{2}:\d{2}/.test(t) || t.includes("-->") || t.startsWith("NOTE")) continue;
    const clean = t.replace(/<[^>]+>/g, "").trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out.join(" ");
}

import { execFileSync } from "node:child_process";
import { pbkdf2Sync, createDecipheriv } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

// Read + decrypt a Chromium-family browser's cookie store (Brave/Chrome/Edge),
// so you can reuse your logged-in session from Node — no extension export.
// macOS only for now: the AES key lives in the login Keychain (one approval).
// Zero dependencies (node:crypto + the system `sqlite3`).

export type Browser = "brave" | "chrome" | "edge";

const SUPPORT: Record<Browser, { dir: string; keychain: string }> = {
  brave: { dir: "BraveSoftware/Brave-Browser", keychain: "Brave Safe Storage" },
  chrome: { dir: "Google/Chrome", keychain: "Chrome Safe Storage" },
  edge: { dir: "Microsoft Edge", keychain: "Microsoft Edge Safe Storage" },
};

function keychainPassword(service: string): string {
  return execFileSync("security", ["find-generic-password", "-w", "-s", service], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Chromium derives the AES key as PBKDF2(pw, "saltysalt", 1003, 16, sha1). */
function deriveKey(password: string): Buffer {
  return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

/** Is the buffer's head mostly printable ASCII (i.e. a real cookie value)? */
function headPrintable(buf: Buffer): boolean {
  const n = Math.min(16, buf.length);
  if (n === 0) return true;
  let ok = 0;
  for (let i = 0; i < n; i++) {
    const b = buf[i] ?? 0;
    if (b >= 0x20 && b < 0x7f) ok++;
  }
  return ok / n >= 0.9;
}

/** Decrypt one v10/v11 cookie value (AES-128-CBC, IV = 16 spaces). Pure. */
export function decryptCookie(encHex: string, key: Buffer): string {
  const buf = Buffer.from(encHex, "hex");
  const prefix = buf.subarray(0, 3).toString("latin1");
  const body = prefix === "v10" || prefix === "v11" ? buf.subarray(3) : buf;
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  decipher.setAutoPadding(false);
  let dec = Buffer.concat([decipher.update(body), decipher.final()]);
  const pad = dec[dec.length - 1] ?? 0;
  if (pad > 0 && pad <= 16) dec = dec.subarray(0, dec.length - pad);
  // Newer Chromium prepends a 32-byte SHA256(host) to the plaintext; strip it when
  // the head isn't printable (a real cookie value is printable ASCII, a hash isn't).
  if (dec.length > 32 && !headPrintable(dec)) dec = dec.subarray(32);
  return dec.toString("utf8");
}

function dbPaths(browser: Browser, profile: string): string[] {
  const base = join(homedir(), "Library", "Application Support", SUPPORT[browser].dir, profile);
  return [join(base, "Network", "Cookies"), join(base, "Cookies")];
}

function readRows(dbPath: string, hostLike: string): Array<[string, string]> {
  const dir = mkdtempSync(join(tmpdir(), "bs-ck-"));
  const tmp = join(dir, "Cookies");
  try {
    copyFileSync(dbPath, tmp);
    const sql = `SELECT name || char(9) || hex(encrypted_value) FROM cookies WHERE host_key LIKE '${hostLike}'`;
    const out = execFileSync("sqlite3", [tmp, sql], { encoding: "utf8" });
    return out.split("\n").filter(Boolean).map((l) => l.split("\t") as [string, string]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Read a logged-in cookie header for a domain from a Chromium browser's store.
 * `domain` is matched as a suffix (e.g. "x.com" → all of x.com + subdomains).
 * Errors-as-values (no browser / not logged in / Keychain denied / decrypt fail).
 */
export function getCookies(
  opts: { browser?: Browser; domain: string; profile?: string },
): { ok: true; cookie: string; count: number } | { ok: false; error: string } {
  if (process.platform !== "darwin") return { ok: false, error: "browser cookie read is macOS-only for now" };
  const browser = opts.browser ?? "brave";
  const dbPath = dbPaths(browser, opts.profile ?? "Default").find((p) => existsSync(p));
  if (!dbPath) return { ok: false, error: `no ${browser} Cookies db (is ${browser} installed + a Default profile?)` };
  let key: Buffer;
  try {
    key = deriveKey(keychainPassword(SUPPORT[browser].keychain));
  } catch {
    return { ok: false, error: `Keychain access for "${SUPPORT[browser].keychain}" denied or unavailable` };
  }
  try {
    const pairs = readRows(dbPath, `%${opts.domain}`)
      .map(([name, hex]) => [name, decryptCookie(hex, key)] as const)
      .filter(([name, value]) => name && value);
    if (pairs.length === 0) return { ok: false, error: `no cookies for ${opts.domain} — are you logged in to ${browser}?` };
    const byName = new Map<string, string>();
    for (const [name, value] of pairs) byName.set(name, value);
    return { ok: true, cookie: [...byName].map(([n, v]) => `${n}=${v}`).join("; "), count: byName.size };
  } catch (err) {
    return { ok: false, error: `read/decrypt failed: ${(err as Error).message}` };
  }
}

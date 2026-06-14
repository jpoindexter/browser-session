# browser-session

[![CI](https://github.com/jpoindexter/browser-session/actions/workflows/ci.yml/badge.svg)](https://github.com/jpoindexter/browser-session/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)

**Reuse your real logged-in browser session from Node.** Two things:

1. **Read + decrypt your browser cookies** (Brave / Chrome / Edge) — **zero dependencies**. The Node equivalent of yt-dlp's `--cookies-from-browser`.
2. **Open any page in a headless browser with that session** — read login-walled / JS-rendered pages a plain `fetch` can't (via Playwright).

No extension, no manual cookie export.

> ⚠️ **macOS only for now** (the cookie key lives in the login Keychain — one approval prompt the first time). The headless-read part is cross-platform; only the cookie auto-read is macOS-specific so far. Use a dedicated account for scraping — automated access can get accounts flagged.

## Install

```bash
npm install browser-session
# for the headless-read part:
npm install playwright-core && npx playwright install chromium
```

## Use

### Library

```ts
import { getCookies, openWithSession, readPage } from "browser-session";

// 1) just the cookies (zero-dep)
const c = getCookies({ browser: "brave", domain: "x.com" });
if (c.ok) console.log(c.cookie); // "auth_token=…; ct0=…; …"

// 2) read a logged-in page in a real browser, session auto-injected
const r = await readPage("https://www.reddit.com/", { browser: "brave" });
if (r.ok) console.log(r.text);            // rendered text of YOUR feed
//        console.log(r.requests);        // every URL the page requested

// 3) bring your own cookie (any source)
await openWithSession("https://x.com/i/bookmarks", "auth_token=…; ct0=…");
```

Every call returns `{ ok: true, … } | { ok: false, error }` — errors as values, never throws.

### CLI

```bash
browser-session cookies x.com --browser brave          # print the cookie header
browser-session cookies x.com --names                  # just the cookie names
browser-session read https://www.reddit.com/ --browser brave   # render your logged-in page
browser-session read https://example.com               # anonymous read
```

## How it works

- **Cookies** (`src/cookies.ts`): pulls the AES key from the macOS Keychain (`<Browser> Safe Storage`), derives it (`PBKDF2(pw, "saltysalt", 1003, 16, sha1)`), reads the Cookies SQLite (copied to dodge the browser lock via the system `sqlite3`), and AES-128-CBC-decrypts each value. Handles the `v10`/`v11` prefix **and** the 32-byte `SHA256(host)` prefix newer Chromium prepends (stripped when the decrypted head isn't printable). Zero runtime deps.
- **Session** (`src/session.ts`): launches headless Chromium (Playwright), injects the cookies scoped to the page origin (so `__Host-`/`__Secure-` prefixes resolve), navigates, and returns the body text + the request URLs. `playwright-core` is an **optional** dependency — the cookie reader works without it.

## API

`getCookies({ browser?, domain, profile? })` · `decryptCookie(hex, key)` · `openWithSession(url, cookie, { settleMs? })` · `readPage(url, { browser?, profile? })` · `cookieToPlaywright(header, url)` · `domainOf(url)`.

## License

MIT

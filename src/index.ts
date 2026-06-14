import { getCookies, type Browser } from "./cookies.js";
import { openWithSession, domainOf, type SessionResult } from "./session.js";

export { getCookies, decryptCookie, type Browser } from "./cookies.js";
export { openWithSession, domainOf, cookieToPlaywright, type SessionResult } from "./session.js";

/**
 * Read a page through a real browser using your logged-in session: auto-pulls
 * cookies for the url's domain from your browser store, then opens it headless.
 * Pass `browser` to use the session; omit it to read anonymously.
 */
export async function readPage(
  url: string,
  opts: { browser?: Browser; profile?: string; settleMs?: number } = {},
): Promise<SessionResult> {
  let cookie: string | null = null;
  if (opts.browser) {
    const c = getCookies({ browser: opts.browser, domain: domainOf(url), profile: opts.profile });
    cookie = c.ok ? c.cookie : null;
  }
  return openWithSession(url, cookie, { settleMs: opts.settleMs });
}

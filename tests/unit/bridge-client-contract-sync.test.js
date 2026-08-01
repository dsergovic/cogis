import { describe, it, expect } from 'vitest';
import {
  WEB_BRIDGE_NONCE_PATTERN,
  WEB_BRIDGE_PAGE_ORIGIN,
  WEB_BRIDGE_TYPES,
} from '../../extension/lib/web-bridge.js';
import { PLATFORMS, PLATFORM_ORDER } from '../../extension/lib/platforms.js';
import { loadClientApi, readClientSource } from '../helpers/bridge-client-harness.js';
import { readWebFile } from '../helpers/page-harness.js';

/** The four lab origins render.js is allowed to name, read from the source of truth. */
const LAB_ORIGINS = PLATFORM_ORDER.map((id) => PLATFORMS[id].origin);

const source = readClientSource();
const api = loadClientApi();

// Addendum §3.3: the envelope contract lives in two mirrored files and any
// change must land in the same PR on both sides. This file is what makes that
// rule enforceable instead of aspirational.
describe('page client mirrors the extension-side contract', () => {
  it('uses the same page origin literal', () => {
    expect(api.PAGE_ORIGIN).toBe(WEB_BRIDGE_PAGE_ORIGIN);
    expect(source).toContain(`const PAGE_ORIGIN = '${WEB_BRIDGE_PAGE_ORIGIN}';`);
  });

  it('uses the same nonce pattern', () => {
    expect(api.NONCE_PATTERN.source).toBe(WEB_BRIDGE_NONCE_PATTERN.source);
    expect(source).toContain(`const NONCE_PATTERN = ${WEB_BRIDGE_NONCE_PATTERN};`);
  });

  it('uses the same envelope type strings', () => {
    expect(Object.values(api.TYPES).sort()).toEqual(Object.values(WEB_BRIDGE_TYPES).sort());
  });

  it('never targets a wildcard origin', () => {
    // §3.9: "No postMessage("*") anywhere."
    expect(source).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
    expect(source).toContain('win.postMessage(envelope, PAGE_ORIGIN)');
  });
});

describe('page client stays a flat classic script', () => {
  it('has no static or dynamic imports', () => {
    // A module script is deferred, which would move the COGIS_HELLO emit off
    // the DOMContentLoaded tick S8.1 locked.
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s/m);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it('installs exactly one global', () => {
    expect(source.match(/^\s*global\.[A-Za-z]+ =/gm)).toHaveLength(1);
  });
});

describe('web/ page hygiene', () => {
  /**
   * Every file the apex actually serves, with the non-`cogis.ai` origins each
   * one is allowed to name. M8b AC #10 ("view-source shows zero third-party
   * origins") is read here as zero third-party origins **loaded** — no script,
   * stylesheet, font, image, or connection off-origin, which is what
   * `connect-src 'none'` plus `default-src 'self'` enforce. It cannot be read
   * as zero third-party hyperlinks, because the same §6 M8b scope paragraph
   * mandates a `GitHub` header link, and the S8.2 copy table (LOCKED
   * 2026-07-31) mandates that the install-gate link to GitHub-hosted install
   * instructions. The allowlist below is the list of links that survive that
   * reading; anything else is a regression.
   */
  const pageSources = [
    ['bridge-client.js', source, []],
    // render.js names each lab's own origin — a login surface and a home
    // fallback per group (§6 M8c). None of them is fetched; they are hrefs.
    ['render.js', readWebFile('render'), LAB_ORIGINS],
    ['page.js', readWebFile('page'), []],
    ['index.html', readWebFile('index'), ['https://github.com/dsergovic/cogis']],
    ['404.html', readWebFile('notFound'), []],
    ['site.css', readWebFile('css'), []],
  ];

  it('makes no network call from the page origin', () => {
    // §4 non-goal + CSP connect-src 'none'; M8b AC #9.
    for (const [name, text] of pageSources) {
      expect(text, name).not.toMatch(/\bfetch\s*\(/);
      expect(text, name).not.toMatch(/XMLHttpRequest|WebSocket|EventSource|sendBeacon/);
    }
  });

  it('writes no client-side storage', () => {
    // §3.5: no localStorage, no sessionStorage, no cookies, no IndexedDB.
    for (const [name, text] of pageSources) {
      // Property access, not a prose mention: the files discuss the ban.
      expect(text, name).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\s*[.[]/);
      expect(text, name).not.toMatch(/document\.cookie/);
    }
  });

  it('loads every subresource from self', () => {
    // M8b AC #12: no off-origin <script src> or <link rel=stylesheet href>.
    for (const [name, text] of pageSources) {
      expect(text, name).not.toMatch(/<script[^>]+src=["']https?:/i);
      expect(text, name).not.toMatch(/<link[^>]+href=["']https?:/i);
      // `@import` and `url()` pull a subresource in CSS and markup only. In a
      // script `URL(` is the constructor, which fetches nothing — the fetch /
      // XHR ban above is what covers the scripts.
      if (name.endsWith('.js')) continue;
      expect(text, name).not.toMatch(/@import|url\(\s*["']?https?:/i);
    }
  });

  it('references no third-party origin beyond its allowlist', () => {
    for (const [name, text, allowed] of pageSources) {
      const urls = text.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const url of urls) {
        const ok =
          /^https:\/\/cogis\.ai(\/|$)/.test(url) ||
          allowed.some(
            (prefix) =>
              url === prefix || (url.startsWith(prefix) && /^[/#?]/.test(url.slice(prefix.length))),
          );
        expect(ok, `${name} references ${url}`).toBe(true);
      }
    }
  });
});

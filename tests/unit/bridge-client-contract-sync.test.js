import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  WEB_BRIDGE_NONCE_PATTERN,
  WEB_BRIDGE_PAGE_ORIGIN,
  WEB_BRIDGE_TYPES,
} from '../../extension/lib/web-bridge.js';
import {
  HARNESS_PAGE_PATH,
  HARNESS_SCRIPT_PATH,
  loadClientApi,
  readClientSource,
} from '../helpers/bridge-client-harness.js';

const source = readClientSource();
const api = loadClientApi();
const harnessPage = readFileSync(HARNESS_PAGE_PATH, 'utf8');
const harnessScript = readFileSync(HARNESS_SCRIPT_PATH, 'utf8');

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
  const pageSources = [
    ['bridge-client.js', source],
    ['spike/s8-2.js', harnessScript],
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

  it('references no third-party origin', () => {
    // M8b AC #10: view-source shows zero third-party origins.
    for (const [name, text] of [...pageSources, ['spike/s8-2.html', harnessPage]]) {
      const urls = text.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const url of urls) {
        expect(url, `${name} references ${url}`).toMatch(/^https:\/\/cogis\.ai(\/|$)/);
      }
    }
  });
});

describe('S8.2 harness page', () => {
  it('ships the exact §3.7 production CSP', () => {
    // A laxer harness CSP would not represent the shipped page, so the
    // measurement would not transfer.
    expect(harnessPage).toContain(
      "content=\"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; " +
        "frame-ancestors 'none'; upgrade-insecure-requests\"",
    );
  });

  it('loads both scripts classic and un-deferred', () => {
    expect(harnessPage).toContain('<script src="../assets/js/bridge-client.js"></script>');
    expect(harnessPage).toContain('<script src="./s8-2.js"></script>');
    expect(harnessPage).not.toMatch(/<script[^>]*type="module"/);
    expect(harnessPage).not.toMatch(/<script[^>]*\s(defer|async)/);
  });

  it("has no inline script, which script-src 'self' would block", () => {
    expect(harnessPage).not.toMatch(/<script(?![^>]*\bsrc=)/);
    expect(harnessPage).not.toMatch(/\son[a-z]+="/);
  });

  it('carries no budget default of its own beyond the addendum probe ceiling', () => {
    // The only number allowed to be hard-coded is the §5 probe-range ceiling,
    // clearly labelled as a probe. The chosen budget is still TBD.
    expect(harnessScript).toContain('const PROBE_CEILING_MS = 1200;');
    expect(harnessScript).toContain('const PROBE_FLOOR_MS = 400;');
  });
});

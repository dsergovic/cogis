import { describe, it, expect } from 'vitest';
import {
  WEB_BRIDGE_NONCE_PATTERN,
  WEB_BRIDGE_PAGE_ORIGIN,
  WEB_BRIDGE_TYPES,
} from '../../extension/lib/web-bridge.js';
import { loadClientApi, readClientSource } from '../helpers/bridge-client-harness.js';

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
  const pageSources = [['bridge-client.js', source]];

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
    for (const [name, text] of pageSources) {
      const urls = text.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      for (const url of urls) {
        expect(url, `${name} references ${url}`).toMatch(/^https:\/\/cogis\.ai(\/|$)/);
      }
    }
  });
});

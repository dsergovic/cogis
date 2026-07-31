import { describe, it, expect } from 'vitest';
import { WEB_SEARCH_SURFACE_ENABLED } from '../../extension/lib/flags.js';
import {
  WEB_BRIDGE_MAX_ENVELOPE_BYTES,
  WEB_BRIDGE_NONCE_PATTERN,
  WEB_BRIDGE_PAGE_ORIGIN,
  WEB_BRIDGE_TYPES,
} from '../../extension/lib/web-bridge.js';
import { FLAG_OFF_LINE, readBridgeSource } from '../helpers/web-bridge-harness.js';

const source = readBridgeSource();

describe('web surface flag', () => {
  it('ships off', () => {
    expect(WEB_SEARCH_SURFACE_ENABLED).toBe(false);
  });

  it('reads the same value inside the bridge', () => {
    // The bridge is a flat classic script and cannot import lib/flags.js, so
    // the literal is mirrored. This test is the only thing keeping them equal.
    const literal = source.match(/const WEB_SEARCH_SURFACE_ENABLED = (true|false);/)?.[1];
    expect(literal).toBe(String(WEB_SEARCH_SURFACE_ENABLED));
    expect(source).toContain(FLAG_OFF_LINE);
  });

  it('returns before doing anything when the flag is off', () => {
    expect(source).toMatch(/if \(!WEB_SEARCH_SURFACE_ENABLED\) return;/);
    const guardAt = source.indexOf('if (!WEB_SEARCH_SURFACE_ENABLED) return;');
    for (const sideEffect of ['addEventListener', 'sendMessage', 'postMessage', 'onMessage']) {
      expect(source.indexOf(sideEffect), sideEffect).toBeGreaterThan(guardAt);
    }
  });
});

describe('bridge mirrors of the shared contract', () => {
  it('uses the same page origin literal', () => {
    expect(source).toContain(`const PAGE_ORIGIN = '${WEB_BRIDGE_PAGE_ORIGIN}';`);
  });

  it('uses the same nonce pattern', () => {
    expect(source).toContain(`const NONCE_PATTERN = ${WEB_BRIDGE_NONCE_PATTERN};`);
  });

  it('uses the same Tier 2 cap', () => {
    expect(source).toContain(`const MAX_ENVELOPE_BYTES = ${WEB_BRIDGE_MAX_ENVELOPE_BYTES};`);
  });

  it('uses the same envelope type strings', () => {
    for (const type of Object.values(WEB_BRIDGE_TYPES)) {
      expect(source, type).toContain(`= '${type}';`);
    }
  });
});

describe('bridge stays a flat classic content script', () => {
  it('is an IIFE in strict mode', () => {
    expect(source).toMatch(/^\s*\(function\s*\(\)\s*\{/m);
    expect(source).toContain("'use strict';");
  });

  it('has no static imports', () => {
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/^\s*export\s/m);
  });

  it('has no dynamic imports', () => {
    // An awaited dynamic import would register the message listener a task
    // later and put the locked document_idle handshake timing at risk.
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/chrome\.runtime\.getURL\(/);
  });
});

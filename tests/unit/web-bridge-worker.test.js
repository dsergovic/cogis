import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MSG } from '../../extension/lib/messaging.js';
import {
  WEB_BRIDGE_MAX_ENVELOPE_BYTES,
  WEB_BRIDGE_PAGE_ORIGIN,
  WEB_BRIDGE_TARGET_ORIGIN_WARNING,
  createBridgeCancelDone,
  isBridgeSenderOrigin,
  toBridgeEnvelope,
} from '../../extension/lib/web-bridge.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const workerSource = readFileSync(join(root, 'extension/background/service-worker.js'), 'utf8');
const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));

describe('sender.tab.url boundary check', () => {
  it('accepts a tab on the locked origin', () => {
    expect(isBridgeSenderOrigin('https://cogis.ai/')).toBe(true);
    expect(isBridgeSenderOrigin('https://cogis.ai/search?q=x')).toBe(true);
  });

  it('rejects look-alike and downgraded hosts', () => {
    for (const url of [
      'https://www.cogis.ai/',
      'https://cogis.ai.evil.example/',
      'http://cogis.ai/',
      'https://evil.example/https://cogis.ai/',
      'https://cogis.ai',
      '',
      undefined,
      null,
    ]) {
      expect(isBridgeSenderOrigin(url), String(url)).toBe(false);
    }
  });

  it('is wired into every bridge handler in the worker', () => {
    // Both boundary checks must exist: the bridge's own event.origin gate and
    // this one. The worker deliberately does not trust the bridge.
    const guards = workerSource.match(/if \(!acceptBridgeSender\(sender\)\) \{/g) ?? [];
    expect(guards).toHaveLength(3);
    expect(workerSource).toMatch(
      /function acceptBridgeSender\(sender\) \{\s*return WEB_SEARCH_SURFACE_ENABLED && isBridgeSenderOrigin\(sender\?\.tab\?\.url\)/,
    );
  });
});

describe('page-facing envelope projection', () => {
  it('projects a result chunk to exactly the §3.9 field set', () => {
    const envelope = toBridgeEnvelope({
      type: MSG.SEARCH_RESULT_CHUNK,
      requestId: 'req-1',
      platform: 'chatgpt',
      status: 'ready',
      capability: 'full-text',
      results: [{ title: 't', deepLinkUrl: 'https://example.invalid/' }],
      errorCode: undefined,
      message: 'internal copy',
      loginUrl: 'https://chatgpt.com/',
    });

    expect(Object.keys(envelope).sort()).toEqual([
      'capability',
      'errorCode',
      'platform',
      'requestId',
      'results',
      'status',
      'type',
    ]);
    expect(envelope.type).toBe('WEB_BRIDGE_RESULT_CHUNK');
    // `message` and `loginUrl` are not in the normative shape.
    expect(envelope).not.toHaveProperty('message');
    expect(envelope).not.toHaveProperty('loginUrl');
  });

  it('projects a platform done frame', () => {
    expect(
      toBridgeEnvelope({
        type: MSG.SEARCH_PLATFORM_DONE,
        requestId: 'req-1',
        platform: 'claude',
        status: 'ok',
      }),
    ).toEqual({
      type: 'WEB_BRIDGE_PLATFORM_DONE',
      requestId: 'req-1',
      platform: 'claude',
      status: 'ok',
    });
  });

  it('projects nothing for internal-only traffic', () => {
    expect(toBridgeEnvelope({ type: MSG.SEARCH_REQUEST })).toBeNull();
    expect(toBridgeEnvelope({ type: MSG.CHATGPT_SEARCH_RESULT })).toBeNull();
    expect(toBridgeEnvelope({})).toBeNull();
    expect(toBridgeEnvelope(null)).toBeNull();
  });

  it('signals a user cancel as one done frame for all platforms', () => {
    expect(createBridgeCancelDone('req-9')).toEqual({
      type: 'WEB_BRIDGE_PLATFORM_DONE',
      requestId: 'req-9',
      platform: 'all',
      status: 'cancelled',
    });
  });

  it('leaves natural per-platform completion on the ok status', () => {
    // The locked signalling convention: status "ok" per platform on natural
    // completion, "cancelled" with platform "all" on user cancel.
    expect(
      toBridgeEnvelope({
        type: MSG.SEARCH_PLATFORM_DONE,
        requestId: 'req-1',
        platform: 'gemini',
        status: 'ok',
      }).platform,
    ).toBe('gemini');
  });
});

describe('worker bridge wiring', () => {
  it('routes bridge results to the tab, not only the runtime broadcast', () => {
    // chrome.runtime.sendMessage from the worker reaches extension pages only,
    // so a content script needs its own tabs.sendMessage hop.
    expect(workerSource).toMatch(/function mirrorToBridge\(msg\)/);
    expect(workerSource).toMatch(
      /chrome\.tabs\.sendMessage\(tabId, \{ type: MSG\.WEB_BRIDGE_DELIVER, envelope \}\)/,
    );
  });

  it('gates every bridge side effect on the flag', () => {
    expect(workerSource).toMatch(
      /function mirrorToBridge\(msg\) \{\s*if \(!WEB_SEARCH_SURFACE_ENABLED\) return;/,
    );
  });

  it('shares one search launcher with the popup contract', () => {
    // No forked orchestration: the bridge path reuses launchSearch and
    // cancelSearch, so supersede and cancel isolation are inherited.
    expect(workerSource.match(/launchSearch\(\{/g)).toHaveLength(2);
    expect(workerSource).toMatch(/void cancelSearch\(message\.requestId\)\.then/);
  });

  it('forgets the bridge tab when the request finishes', () => {
    expect(workerSource).toMatch(/bridgeTabs\.delete\(requestId\)/);
  });

  it('makes no adapter changes for the bridge', () => {
    expect(workerSource).not.toMatch(/WEB_BRIDGE[\w_]*[\s\S]{0,80}PLATFORM_SEARCH_MSG/);
  });

  it('exposes the bridge counters on the debug snapshot', () => {
    expect(workerSource).toMatch(/webBridge: \{\s*enabled: WEB_SEARCH_SURFACE_ENABLED,/);
  });
});

describe('manifest delta', () => {
  const bridgeBlock = manifest.content_scripts.find((block) =>
    block.js.includes('content/web-bridge.js'),
  );

  it('injects the bridge only on the cogis.ai apex over https', () => {
    expect(bridgeBlock).toBeDefined();
    expect(bridgeBlock.matches).toEqual(['https://cogis.ai/*']);
    expect(bridgeBlock.run_at).toBe('document_idle');
  });

  it('does not inject the bridge on www or any other host', () => {
    for (const block of manifest.content_scripts) {
      for (const match of block.matches) {
        expect(match).not.toContain('www.cogis.ai');
      }
    }
  });

  it('holds the host permission the tab hop needs', () => {
    expect(manifest.host_permissions).toContain('https://cogis.ai/*');
  });

  it('leaves the adapter content scripts untouched', () => {
    const adapterBlocks = manifest.content_scripts.filter(
      (block) => !block.js.includes('content/web-bridge.js'),
    );
    expect(adapterBlocks.map((block) => block.js[0])).toEqual([
      'content/chatgpt.js',
      'content/perplexity.js',
      'content/claude.js',
      'content/gemini.js',
    ]);
  });

  it('adds no web-accessible resources for cogis.ai', () => {
    // The bridge imports nothing, so it needs no WAR entry. If that changes,
    // war-coverage.test.js is the gate that catches it.
    for (const entry of manifest.web_accessible_resources) {
      for (const match of entry.matches) {
        expect(match).not.toContain('cogis.ai');
      }
    }
  });
});

describe('outer-boundary warning text', () => {
  it('matches the warning Chrome actually emitted in the spike', () => {
    // Recorded verbatim in docs/spikes/s8-1-observation-log.md, Round 3.
    const observed = readFileSync(join(root, 'docs/spikes/s8-1-observation-log.md'), 'utf8')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ');
    const rendered = WEB_BRIDGE_TARGET_ORIGIN_WARNING.replace('<target>', 'http://cogis.ai');
    expect(observed).toContain(rendered);
  });

  it('names the locked recipient origin', () => {
    expect(WEB_BRIDGE_TARGET_ORIGIN_WARNING).toContain(`('${WEB_BRIDGE_PAGE_ORIGIN}')`);
  });
});

describe('debug panel surfaces the bridge', () => {
  const panelHtml = readFileSync(join(root, 'extension/debug/panel.html'), 'utf8');
  const panelJs = readFileSync(join(root, 'extension/debug/panel.js'), 'utf8');

  it('shows every drop counter plus the oversized breakdown', () => {
    for (const field of [
      'handshakeCount',
      'acceptedCount',
      'originDropCount',
      'nonceDropCount',
      'malformedDropCount',
      'oversizedDropCount',
      'lastHandshakeAt',
    ]) {
      expect(panelHtml, field).toContain(`data-cogis-bridge="${field}"`);
    }
    expect(panelJs).toMatch(/function renderBridge\(snapshot\)/);
    expect(panelJs).toMatch(/renderBridge\(snapshot\);/);
  });

  it('shows the Chrome console warning that no counter can capture', () => {
    expect(panelHtml).toContain('data-cogis-bridge="postMessageWarning"');
    expect(panelHtml).toContain('not counted above');
    expect(panelJs).toContain('WEB_BRIDGE_TARGET_ORIGIN_WARNING');
  });

  it('shows request ids and status only', () => {
    expect(panelHtml).toContain('never query text');
    expect(panelJs).toMatch(/display\(entry\?\.requestId\)/);
    expect(panelJs).toMatch(/display\(entry\?\.status\)/);
    // The panel never reads a query or a nonce off the snapshot; the nonce
    // never leaves the page↔bridge hop in the first place.
    expect(panelJs).not.toMatch(/\.query\b/);
    expect(panelJs).not.toMatch(/\.nonce\b/);
  });
});

describe('Tier 2 envelope cap', () => {
  it('is a concrete byte number, not a guess left to the caller', () => {
    expect(WEB_BRIDGE_MAX_ENVELOPE_BYTES).toBe(8192);
  });
});

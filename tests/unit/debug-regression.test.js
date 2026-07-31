import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MSG,
  createSearchRequest,
  createResultChunk,
  shouldApplyChunk,
  normalizeQuery,
} from '../../extension/lib/messaging.js';
import { PLATFORM_ORDER } from '../../extension/lib/platforms.js';
import {
  DEFAULT_PING_OPT_IN,
  PING_ENDPOINT_URL,
  maybeSendAnonymousPing,
} from '../../extension/lib/ping.js';
import { getSelectorPackStatus } from '../../extension/lib/selectors/loader.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('M1–M5 behavior unchanged with panel closed / ping off (M6)', () => {
  it('keeps search message contract and cancel isolation intact', () => {
    const req = createSearchRequest({
      requestId: 'r1',
      query: 'pasta',
      platforms: [...PLATFORM_ORDER],
    });
    expect(req.type).toBe(MSG.SEARCH_REQUEST);
    expect(req.platforms).toEqual(PLATFORM_ORDER);
    expect(normalizeQuery('  x  ')).toBe('x');
    expect(
      shouldApplyChunk(
        'r2',
        createResultChunk({
          requestId: 'r1',
          platform: 'chatgpt',
          status: 'ready',
          results: [],
        }),
      ),
    ).toBe(false);
  });

  it('selector pack status hook still exposes version for the panel', () => {
    const status = getSelectorPackStatus();
    expect(typeof status.localVersion).toBe('string');
    expect(status.localVersion.length).toBeGreaterThan(0);
    expect(['local', 'merged']).toContain(status.source);
  });

  it('default-off ping path performs zero network calls (panel closed equivalent)', async () => {
    const fetchImpl = vi.fn();
    const closedPanelDefault = await maybeSendAnonymousPing({
      optIn: DEFAULT_PING_OPT_IN,
      endpointUrl: PING_ENDPOINT_URL,
      payload: {
        platformId: 'chatgpt',
        selectorPackVersion: '1.3.0',
        errorClass: 'unavailable',
      },
      fetchImpl,
    });
    expect(closedPanelDefault.sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('service worker still fans SEARCH_REQUEST and does not import a production ping URL', () => {
    const sw = readFileSync(join(root, 'extension/background/service-worker.js'), 'utf8');
    expect(sw).toContain('MSG.SEARCH_REQUEST');
    expect(sw).toContain('runPlatform');
    expect(sw).toContain('refreshSelectorPack');
    expect(sw).toContain('DEBUG_GET_SNAPSHOT');
    // No hardcoded production ping host in the SW.
    expect(sw).not.toMatch(/https:\/\/cogis\.ai\/ping/);
    expect(sw).not.toMatch(/https:\/\/.*\/telemetry/);
  });

  it('popup still owns search UX; debug is an opt-in footer link only', () => {
    const html = readFileSync(join(root, 'extension/popup/popup.html'), 'utf8');
    const js = readFileSync(join(root, 'extension/popup/popup.js'), 'utf8');
    expect(html).toContain('cogis-search-form');
    expect(html).toContain('Some AIs do not support full-text search.');
    expect(html).toContain('cogis-debug-link');
    expect(js).toContain('createSearchRequest');
    expect(js).toContain('debug/panel.html');
    // Popup must not auto-open the panel or send pings.
    expect(js).not.toContain('DEBUG_SEND_PING');
    expect(js).not.toContain('maybeSendAnonymousPing');
  });
});

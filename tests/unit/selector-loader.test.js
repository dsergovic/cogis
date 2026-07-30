import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REMOTE_PACK_URL,
  getPlatformSelectors,
  getSelectorPackStatus,
  isAllowlistedRemotePackUrl,
  isDataOnlyPack,
  isSafeRelativeEndpointPath,
  isSameHostUrlPattern,
  isValidRemotePlatformOverlay,
  loadSelectorPack,
  mergeSelectorPacks,
  parseRemotePackText,
  refreshSelectorPack,
  resetSelectorPackForTests,
} from '../../extension/lib/selectors/loader.js';
import localPack from '../../extension/lib/selectors/local-pack.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const loaderSrc = readFileSync(join(root, 'extension/lib/selectors/loader.js'), 'utf8');
const chatgptContentSrc = readFileSync(join(root, 'extension/content/chatgpt.js'), 'utf8');
const perplexityContentSrc = readFileSync(join(root, 'extension/content/perplexity.js'), 'utf8');
const claudeContentSrc = readFileSync(join(root, 'extension/content/claude.js'), 'utf8');
const geminiContentSrc = readFileSync(join(root, 'extension/content/gemini.js'), 'utf8');

function okResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

describe('selector loader', () => {
  afterEach(() => {
    resetSelectorPackForTests();
  });

  it('loads local pack with chatgpt selectors and search endpoint', () => {
    const pack = loadSelectorPack();
    expect(pack.version).toBeTruthy();
    const chatgpt = getPlatformSelectors('chatgpt');
    expect(chatgpt.endpoints.search).toBe('/backend-api/conversations/search');
    expect(chatgpt.selectors.loginButton).toContain('login-button');
  });

  it('exposes pack version via getSelectorPackStatus for debug hooks', () => {
    const status = getSelectorPackStatus();
    expect(status.localVersion).toBe(localPack.version);
    expect(status.activeVersion).toBe(localPack.version);
    expect(status.source).toBe('local');
    expect(status.remoteUrl).toBe(REMOTE_PACK_URL);
  });

  it('rejects executable-looking packs', () => {
    expect(isDataOnlyPack({ version: '1', script: 'alert(1)', platforms: {} })).toBe(false);
    expect(isDataOnlyPack({ version: '1', platforms: { chatgpt: { eval: '1' } } })).toBe(false);
    expect(
      isDataOnlyPack({
        version: '1',
        platforms: { chatgpt: { selectors: { x: 'a' }, wasm: 'nope' } },
      }),
    ).toBe(false);
    expect(isDataOnlyPack({ version: '1', platforms: {} })).toBe(true);
    expect(isDataOnlyPack({ platforms: {} })).toBe(false);
    expect(isDataOnlyPack(null)).toBe(false);
  });

  it('rejects remote overlays with non-data platform keys or non-string selectors', () => {
    expect(isValidRemotePlatformOverlay({ chatgpt: { selectors: { a: 'b' } } })).toBe(true);
    expect(isValidRemotePlatformOverlay({ chatgpt: { notes: 'nope' } })).toBe(false);
    expect(isValidRemotePlatformOverlay({ chatgpt: { selectors: { a: 1 } } })).toBe(false);
    expect(isValidRemotePlatformOverlay({ chatgpt: { pageSize: 20 } })).toBe(false);
  });

  it('rejects absolute or off-host endpoint/URL overlays (B1)', () => {
    expect(isSafeRelativeEndpointPath('/backend-api/conversations/search')).toBe(true);
    expect(isSafeRelativeEndpointPath('https://evil.example/collect')).toBe(false);
    expect(isSafeRelativeEndpointPath('//evil.example/collect')).toBe(false);
    expect(
      isSameHostUrlPattern('https://chatgpt.com/c/{id}', localPack.platforms.chatgpt.origin),
    ).toBe(true);
    expect(
      isSameHostUrlPattern('https://evil.example/c/{id}', localPack.platforms.chatgpt.origin),
    ).toBe(false);

    expect(
      isValidRemotePlatformOverlay({
        chatgpt: { endpoints: { search: 'https://evil.example/collect' } },
      }),
    ).toBe(false);
    expect(
      isValidRemotePlatformOverlay({
        chatgpt: { endpoints: { search: '/backend-api/conversations/search-v2' } },
      }),
    ).toBe(true);
    expect(
      isValidRemotePlatformOverlay({
        chatgpt: { origin: 'https://evil.example' },
      }),
    ).toBe(false);
  });

  it('refresh fails closed to local when remote endpoint retargets off-host (B1)', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({
        version: '9.9.9',
        platforms: {
          chatgpt: { endpoints: { search: 'https://evil.example/collect' } },
        },
      }),
    );
    await refreshSelectorPack({ fetchImpl });
    expect(getSelectorPackStatus().source).toBe('local');
    expect(getSelectorPackStatus().lastErrorCode).toBe('malformed');
    expect(getPlatformSelectors('chatgpt').endpoints.search).toBe(
      localPack.platforms.chatgpt.endpoints.search,
    );
  });

  it('allowlists only the HTTPS cogis.ai packs path', () => {
    expect(isAllowlistedRemotePackUrl(REMOTE_PACK_URL)).toBe(true);
    expect(isAllowlistedRemotePackUrl('http://cogis.ai/packs/selectors.json')).toBe(false);
    expect(isAllowlistedRemotePackUrl('https://evil.example/packs/selectors.json')).toBe(false);
    expect(isAllowlistedRemotePackUrl('https://cogis.ai/other.json')).toBe(false);
    expect(isAllowlistedRemotePackUrl('https://user:pass@cogis.ai/packs/selectors.json')).toBe(
      false,
    );
  });

  it('merges remote selector overlays onto local without dropping local endpoints', () => {
    const remote = {
      version: '1.3.1-hotfix',
      platforms: {
        gemini: {
          selectors: { historyItem: 'a[data-test="history"]' },
        },
      },
    };
    const merged = mergeSelectorPacks(localPack, remote);
    expect(merged.version).toBe('1.3.1-hotfix');
    expect(merged.platforms.gemini.selectors.historyItem).toBe('a[data-test="history"]');
    expect(merged.platforms.gemini.selectors.signIn).toBe(
      localPack.platforms.gemini.selectors.signIn,
    );
    expect(merged.platforms.chatgpt.endpoints.search).toBe(
      localPack.platforms.chatgpt.endpoints.search,
    );
  });

  it('parseRemotePackText returns null for invalid JSON and executable payloads', () => {
    expect(parseRemotePackText('{')).toBeNull();
    expect(parseRemotePackText(JSON.stringify({ version: '1', script: 'x', platforms: {} }))).toBe(
      null,
    );
    expect(
      parseRemotePackText(
        JSON.stringify({
          version: '1.0.0',
          platforms: { gemini: { selectors: { historyItem: 'a' } } },
        }),
      ),
    ).toEqual({
      version: '1.0.0',
      platforms: { gemini: { selectors: { historyItem: 'a' } } },
    });
  });

  it('refresh keeps local pack when remote is unreachable', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const pack = await refreshSelectorPack({ fetchImpl });
    expect(pack.version).toBe(localPack.version);
    expect(getPlatformSelectors('chatgpt').endpoints.search).toBe(
      '/backend-api/conversations/search',
    );
    const status = getSelectorPackStatus();
    expect(status.source).toBe('local');
    expect(status.lastRefreshOk).toBe(false);
    expect(status.lastErrorCode).toBe('fetch_failed');
    expect(fetchImpl).toHaveBeenCalledWith(
      REMOTE_PACK_URL,
      expect.objectContaining({ method: 'GET', credentials: 'omit' }),
    );
  });

  it('refresh fails closed to local on HTTP error', async () => {
    const fetchImpl = vi.fn(async () => okResponse('nope', 503));
    await refreshSelectorPack({ fetchImpl });
    expect(getSelectorPackStatus().source).toBe('local');
    expect(getSelectorPackStatus().lastErrorCode).toBe('http_error');
    expect(loadSelectorPack().version).toBe(localPack.version);
  });

  it('refresh fails closed to local on invalid JSON', async () => {
    const fetchImpl = vi.fn(async () => okResponse('not-json{'));
    await refreshSelectorPack({ fetchImpl });
    expect(getSelectorPackStatus().lastErrorCode).toBe('invalid_json');
    expect(getSelectorPackStatus().source).toBe('local');
    expect(loadSelectorPack()).toEqual(localPack);
  });

  it('refresh fails closed to local on malformed payload missing version', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({ platforms: { gemini: { selectors: { historyItem: 'a' } } } }),
    );
    await refreshSelectorPack({ fetchImpl });
    expect(getSelectorPackStatus().lastErrorCode).toBe('malformed');
    expect(getSelectorPackStatus().source).toBe('local');
    expect(loadSelectorPack().version).toBe(localPack.version);
  });

  it('refresh fails closed to local when payload contains executable-looking keys', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({
        version: '9.9.9',
        platforms: { gemini: { selectors: { historyItem: 'a' }, script: 'alert(1)' } },
      }),
    );
    await refreshSelectorPack({ fetchImpl });
    expect(getSelectorPackStatus().lastErrorCode).toBe('rejected_exec');
    expect(getSelectorPackStatus().source).toBe('local');
    expect(getPlatformSelectors('gemini').selectors.historyItem).toBe(
      localPack.platforms.gemini.selectors.historyItem,
    );
  });

  it('refresh fails closed to local when overlay includes non-data keys', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({
        version: '9.9.9',
        platforms: { gemini: { selectors: { historyItem: 'a' }, notes: 'x', pageSize: 1 } },
      }),
    );
    await refreshSelectorPack({ fetchImpl });
    expect(getSelectorPackStatus().lastErrorCode).toBe('malformed');
    expect(getSelectorPackStatus().source).toBe('local');
  });

  it('refresh merges a valid remote pack and surfaces the active version', async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({
        version: '1.3.1-hotfix',
        platforms: {
          gemini: { selectors: { historyItem: 'a[data-hotfix="1"]' } },
        },
      }),
    );
    const pack = await refreshSelectorPack({ fetchImpl });
    expect(pack.version).toBe('1.3.1-hotfix');
    expect(getPlatformSelectors('gemini').selectors.historyItem).toBe('a[data-hotfix="1"]');
    const status = getSelectorPackStatus();
    expect(status.source).toBe('merged');
    expect(status.activeVersion).toBe('1.3.1-hotfix');
    expect(status.localVersion).toBe(localPack.version);
    expect(status.lastRefreshOk).toBe(true);
    expect(status.lastErrorCode).toBeNull();
  });

  it('after a successful merge, a later malformed remote fails closed back to local', async () => {
    const good = vi.fn(async () =>
      okResponse({
        version: '1.3.1-hotfix',
        platforms: { gemini: { selectors: { historyItem: 'a[data-hotfix="1"]' } } },
      }),
    );
    await refreshSelectorPack({ fetchImpl: good });
    expect(getSelectorPackStatus().source).toBe('merged');

    const bad = vi.fn(async () => okResponse('{'));
    await refreshSelectorPack({ fetchImpl: bad });
    expect(getSelectorPackStatus().source).toBe('local');
    expect(getSelectorPackStatus().lastErrorCode).toBe('invalid_json');
    expect(getPlatformSelectors('gemini').selectors.historyItem).toBe(
      localPack.platforms.gemini.selectors.historyItem,
    );
  });

  it('refresh fails closed on hung fetch without waiting forever (B2)', async () => {
    const fetchImpl = vi.fn(
      () =>
        new Promise(() => {
          /* never settles; ignores abort */
        }),
    );
    const started = Date.now();
    const pack = await refreshSelectorPack({ fetchImpl, timeoutMs: 40 });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(pack.version).toBe(localPack.version);
    expect(getSelectorPackStatus().source).toBe('local');
    expect(getSelectorPackStatus().lastErrorCode).toBe('fetch_timeout');
  });

  it('content scripts hydrate local pack without awaiting refresh (B2)', () => {
    for (const src of [
      chatgptContentSrc,
      perplexityContentSrc,
      claudeContentSrc,
      geminiContentSrc,
    ]) {
      expect(src).toContain('hydrateFromPack();');
      expect(src).toMatch(/refreshSelectorPack\(refreshOpts\)\.then\(hydrateFromPack/);
      expect(src).not.toMatch(
        /return loaderMod\s*\n?\s*\.refreshSelectorPack\(refreshOpts\)\s*\n?\s*\.then\(hydrateFromPack,\s*hydrateFromPack\)/,
      );
    }
  });

  it('does not contain eval, Function constructor, or dynamic remote import', () => {
    expect(loaderSrc).not.toMatch(/\beval\s*\(/);
    expect(loaderSrc).not.toMatch(/new\s+Function\s*\(/);
    expect(loaderSrc).not.toMatch(/import\s*\(\s*[^)'"`]/);
  });
});

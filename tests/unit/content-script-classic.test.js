import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = join(root, 'tests/fixtures/chatgpt');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

/**
 * Load the classic content script in a sandbox where dynamic import() is stubbed
 * to Node's import (mirrors chrome.runtime.getURL + import in Chrome).
 */
function loadContentScript(fetchImpl) {
  /** @type {((message: any, sender: any, sendResponse: any) => boolean)|null} */
  let messageListener = null;

  const chromeMock = {
    runtime: {
      getURL: vi.fn((path) => pathToFileURL(join(root, 'extension', path)).href),
      onMessage: {
        addListener: vi.fn((fn) => {
          messageListener = fn;
        }),
      },
    },
  };

  const context = {
    chrome: chromeMock,
    fetch: fetchImpl,
    AbortController,
    Response,
    URL,
    URLSearchParams,
    location: { origin: 'https://chatgpt.com' },
    document: { querySelector: () => null },
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    console,
    globalThis: null,
    self: null,
    __dynamicImport: (specifier) => import(specifier),
  };
  context.globalThis = context;
  context.self = context;

  const src = readFileSync(join(root, 'extension/content/chatgpt.js'), 'utf8').replace(
    /\bimport\s*\(/g,
    '__dynamicImport(',
  );
  vm.runInNewContext(src, context, { filename: 'chatgpt.js' });

  return {
    messageListener,
    chromeMock,
  };
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    const keep = listener(message, {}, resolve);
    if (keep === false) {
      resolve(undefined);
    }
  });
}

describe('classic content script wiring', () => {
  it('does not declare content_scripts type module', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
    for (const entry of manifest.content_scripts ?? []) {
      expect(entry.type).toBeUndefined();
    }
    expect(manifest.permissions ?? []).not.toContain('tabs');
  });

  it('ships a thin classic wrapper that dynamically imports the shared adapter', () => {
    const src = readFileSync(join(root, 'extension/content/chatgpt.js'), 'utf8');
    expect(src).toMatch(/^\s*\(function\s*\(/m);
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/^export\s/m);
    expect(src).toContain('CHATGPT_SEARCH_CANCEL');
    expect(src).toContain('AbortController');
    expect(src).toContain("chrome.runtime.getURL('lib/chatgpt-adapter.js')");
    expect(src).toContain("chrome.runtime.getURL('lib/selectors/loader.js')");
    expect(src).toMatch(/\bimport\s*\(/);
    expect(src).not.toContain('/backend-api/conversations/search');
    expect(src).not.toContain('SEARCH_PARAMS');
  });
});

describe('content script message handler (shipped path)', () => {
  it('runs search via shared adapter and returns pointers (no body leak)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/api/auth/session')) {
        return new Response(JSON.stringify(loadFixture('session.authenticated.stub.json')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).includes('/backend-api/conversations/search')) {
        return new Response(JSON.stringify(loadFixture('search.hits.stub.json')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const { messageListener, chromeMock } = loadContentScript(fetchImpl);
    expect(messageListener).toBeTypeOf('function');

    const result = await sendMessage(messageListener, {
      type: 'CHATGPT_SEARCH',
      requestId: 'r1',
      query: 'tomato',
    });

    expect(result.status).toBe('ready');
    expect(result.capability).toBe('full-text');
    expect(result.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.results)).not.toMatch(/secret body/i);
    expect(result.results[0].deepLinkUrl).toMatch(/^https:\/\/chatgpt\.com\/c\//);
    expect(
      fetchImpl.mock.calls.some((c) => String(c[0]).includes('/backend-api/conversations/search')),
    ).toBe(true);
    expect(chromeMock.runtime.getURL).toHaveBeenCalledWith('lib/chatgpt-adapter.js');
    expect(chromeMock.runtime.getURL).toHaveBeenCalledWith('lib/selectors/loader.js');
  });

  it('aborts in-flight search on CHATGPT_SEARCH_CANCEL', async () => {
    let releaseSession;
    const sessionGate = new Promise((r) => {
      releaseSession = r;
    });

    const fetchImpl = vi.fn(async (url, init) => {
      if (String(url).includes('/api/auth/session')) {
        await sessionGate;
        if (init?.signal?.aborted) {
          const err = new Error('aborted');
          err.name = 'AbortError';
          throw err;
        }
        return new Response(JSON.stringify(loadFixture('session.authenticated.stub.json')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(loadFixture('search.hits.stub.json')), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { messageListener } = loadContentScript(fetchImpl);

    const resultPromise = sendMessage(messageListener, {
      type: 'CHATGPT_SEARCH',
      requestId: 'r-cancel',
      query: 'x',
    });

    messageListener({ type: 'CHATGPT_SEARCH_CANCEL', requestId: 'r-cancel' }, {}, () => {});
    releaseSession();

    const result = await resultPromise;
    expect(result.errorCode).toBe('aborted');
  });

  it('reports adapter_import_failed when dynamic import rejects', async () => {
    /** @type {((message: any, sender: any, sendResponse: any) => boolean)|null} */
    let messageListener = null;
    const chromeMock = {
      runtime: {
        getURL: vi.fn(() => 'file:///missing-adapter.js'),
        onMessage: {
          addListener: vi.fn((fn) => {
            messageListener = fn;
          }),
        },
      },
    };

    const context = {
      chrome: chromeMock,
      fetch: vi.fn(),
      AbortController,
      Response,
      URL,
      URLSearchParams,
      location: { origin: 'https://chatgpt.com' },
      document: { querySelector: () => null },
      window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
      console,
      globalThis: null,
      self: null,
      __dynamicImport: async () => {
        const err = new TypeError('Failed to fetch dynamically imported module');
        throw err;
      },
    };
    context.globalThis = context;
    context.self = context;

    const src = readFileSync(join(root, 'extension/content/chatgpt.js'), 'utf8').replace(
      /\bimport\s*\(/g,
      '__dynamicImport(',
    );
    vm.runInNewContext(src, context, { filename: 'chatgpt.js' });

    const result = await sendMessage(messageListener, {
      type: 'CHATGPT_SEARCH',
      requestId: 'r-import',
      query: 'x',
    });
    expect(result.status).toBe('unavailable');
    expect(result.errorCode).toBe('adapter_import_failed');
  });
});

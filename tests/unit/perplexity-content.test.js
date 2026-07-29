import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = join(root, 'tests/fixtures/perplexity');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

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
    location: { origin: 'https://www.perplexity.ai' },
    document: { querySelectorAll: () => [] },
    window: { getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) },
    console,
    globalThis: null,
    self: null,
    __dynamicImport: (specifier) => import(specifier),
  };
  context.globalThis = context;
  context.self = context;

  const src = readFileSync(join(root, 'extension/content/perplexity.js'), 'utf8').replace(
    /\bimport\s*\(/g,
    '__dynamicImport(',
  );
  vm.runInNewContext(src, context, { filename: 'perplexity.js' });

  return { messageListener, chromeMock };
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    const keep = listener(message, {}, resolve);
    if (keep === false) {
      resolve(undefined);
    }
  });
}

describe('classic perplexity content script wiring', () => {
  it('ships a thin classic wrapper that dynamically imports the shared adapter', () => {
    const src = readFileSync(join(root, 'extension/content/perplexity.js'), 'utf8');
    expect(src).toMatch(/^\s*\(function\s*\(/m);
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/^export\s/m);
    expect(src).toContain('PERPLEXITY_SEARCH_CANCEL');
    expect(src).toContain("chrome.runtime.getURL('lib/perplexity-adapter.js')");
    expect(src).toContain("chrome.runtime.getURL('lib/selectors/loader.js')");
    expect(src).not.toContain('list_ask_threads');
  });
});

describe('perplexity content script message handler', () => {
  it('runs search via shared adapter and returns pointers (no body leak)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/rest/thread/list_ask_threads')) {
        return new Response(JSON.stringify(loadFixture('list.hits.stub.json')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (String(url).includes('/rest/spaces')) {
        return new Response(JSON.stringify(loadFixture('spaces.stub.json')), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const { messageListener, chromeMock } = loadContentScript(fetchImpl);
    const result = await sendMessage(messageListener, {
      type: 'PERPLEXITY_SEARCH',
      requestId: 'r1',
      query: 'tomato',
    });

    expect(result.status).toBe('ready');
    expect(result.capability).toBe('title-match');
    expect(result.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(result.results)).not.toMatch(/secret body/i);
    expect(result.results[0].deepLinkUrl).toMatch(/^https:\/\/www\.perplexity\.ai\/search\//);
    expect(chromeMock.runtime.getURL).toHaveBeenCalledWith('lib/perplexity-adapter.js');
  });

  it('aborts in-flight search on PERPLEXITY_SEARCH_CANCEL', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });

    const fetchImpl = vi.fn(async (_url, init) => {
      await gate;
      if (init?.signal?.aborted) {
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const { messageListener } = loadContentScript(fetchImpl);
    const resultPromise = sendMessage(messageListener, {
      type: 'PERPLEXITY_SEARCH',
      requestId: 'r-cancel',
      query: 'x',
    });
    messageListener({ type: 'PERPLEXITY_SEARCH_CANCEL', requestId: 'r-cancel' }, {}, () => {});
    release();

    const result = await resultPromise;
    expect(result.errorCode).toBe('aborted');
  });
});

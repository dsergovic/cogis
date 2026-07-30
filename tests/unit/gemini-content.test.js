import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixturesDir = join(root, 'tests/fixtures/gemini');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

function loadContentScript() {
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
    AbortController,
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      documentElement: {},
      body: {},
      scrollingElement: null,
      defaultView: {
        getComputedStyle: () => ({
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          overflowY: 'visible',
        }),
      },
    },
    console,
    globalThis: null,
    self: null,
    __dynamicImport: (specifier) => import(specifier),
  };
  context.globalThis = context;
  context.self = context;

  const src = readFileSync(join(root, 'extension/content/gemini.js'), 'utf8').replace(
    /\bimport\s*\(/g,
    '__dynamicImport(',
  );
  vm.runInNewContext(src, context, { filename: 'gemini.js' });

  return { messageListener, chromeMock, context };
}

function sendMessage(listener, message) {
  return new Promise((resolve) => {
    const keep = listener(message, {}, resolve);
    if (keep === false) {
      resolve(undefined);
    }
  });
}

describe('classic gemini content script wiring', () => {
  it('ships a thin classic wrapper that dynamically imports the shared adapter', () => {
    const src = readFileSync(join(root, 'extension/content/gemini.js'), 'utf8');
    expect(src).toMatch(/^\s*\(function\s*\(/m);
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/^export\s/m);
    expect(src).toContain('GEMINI_SEARCH_CANCEL');
    expect(src).toContain('COGIS_PING');
    expect(src).toContain("chrome.runtime.getURL('lib/gemini-adapter.js')");
    expect(src).toContain("chrome.runtime.getURL('lib/selectors/loader.js')");
  });
});

describe('gemini content script message handler', () => {
  it('responds to COGIS_PING for tab reachability (SC-7)', async () => {
    const { messageListener } = loadContentScript();
    const result = await sendMessage(messageListener, { type: 'COGIS_PING' });
    expect(result).toEqual({ ok: true, platform: 'gemini' });
  });

  it('runs DOM search via shared adapter (login shell path)', async () => {
    const { messageListener, chromeMock, context } = loadContentScript();

    // Sign-in shell: visible Sign in + save-activity copy, no history links.
    const signIn = {
      textContent: 'Sign in',
      getAttribute: () => null,
    };
    const save = {
      textContent: 'Sign in to save activity',
      getAttribute: () => null,
    };
    context.document.querySelectorAll = (sel) => {
      const s = String(sel);
      if (s.includes('accounts.google.com') || s.includes('Sign in')) return [signIn];
      if (s.includes('button, a, p')) return [save];
      return [];
    };
    context.document.defaultView.getComputedStyle = () => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      overflowY: 'visible',
    });

    const result = await sendMessage(messageListener, {
      type: 'GEMINI_SEARCH',
      requestId: 'r1',
      query: 'tomato',
    });

    expect(result.status).toBe('login_required');
    expect(result.capability).toBe('title-match');
    expect(result.errorCode).toBe('login_shell');
    expect(chromeMock.runtime.getURL).toHaveBeenCalledWith('lib/gemini-adapter.js');
  });

  it('returns ready pointers without body leak when history links exist', async () => {
    const { messageListener, context } = loadContentScript();
    const hits = loadFixture('history.hits.stub.json');
    const nodes = hits.map((h) => ({
      href: h.href,
      textContent: h.title,
      getAttribute: (name) => (name === 'href' ? h.href : null),
    }));
    // Mark as HTMLAnchorElement-like for href property path.
    for (const n of nodes) {
      Object.setPrototypeOf(n, { constructor: { name: 'Object' } });
    }

    context.document.querySelectorAll = (sel) => {
      const s = String(sel);
      if (s.includes('/app/')) return nodes;
      if (s.includes('Google Account')) {
        return [
          {
            textContent: '',
            getAttribute: () => 'Google Account',
          },
        ];
      }
      return [];
    };
    context.document.defaultView.getComputedStyle = () => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      overflowY: 'auto',
    });

    const result = await sendMessage(messageListener, {
      type: 'GEMINI_SEARCH',
      requestId: 'r2',
      query: 'tomato',
    });

    expect(result.status).toBe('ready');
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0].deepLinkUrl).toMatch(/^https:\/\/gemini\.google\.com\/app\//);
    expect(JSON.stringify(result.results)).not.toMatch(/secret body/i);
  });

  it('aborts in-flight search on GEMINI_SEARCH_CANCEL', async () => {
    const { messageListener, context } = loadContentScript();

    // Slow readiness path: never ready until aborted.
    context.document.querySelectorAll = () => [];

    const resultPromise = sendMessage(messageListener, {
      type: 'GEMINI_SEARCH',
      requestId: 'r-cancel',
      query: 'x',
      platformBudgetMs: 8000,
    });

    // Cancel promptly while waitForReady / scan may be in flight.
    await new Promise((r) => setTimeout(r, 20));
    messageListener({ type: 'GEMINI_SEARCH_CANCEL', requestId: 'r-cancel' }, {}, () => {});

    const result = await resultPromise;
    expect(result.errorCode).toBe('aborted');
  });
});

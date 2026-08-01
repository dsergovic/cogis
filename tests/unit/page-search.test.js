import { describe, it, expect } from 'vitest';
import { startPage, PAGE_GROUP_ORDER } from '../helpers/page-harness.js';

/** A connected page with the handshake already done. */
function connected() {
  const harness = startPage();
  harness.fireDomReady();
  harness.connect();
  return harness;
}

/** A RESULT_CHUNK shaped exactly as toBridgeEnvelope() projects it. */
function chunk(nonce, overrides = {}) {
  return {
    type: 'WEB_BRIDGE_RESULT_CHUNK',
    nonce,
    requestId: 'req-1',
    platform: 'chatgpt',
    status: 'ready',
    capability: 'full-text',
    results: [],
    ...overrides,
  };
}

describe('search submit', () => {
  it('sends one SEARCH envelope and reserves the group layout', () => {
    // §6 M8b AC #3 and AC #8: one search, and the group box is sized before
    // the first chunk arrives rather than growing under the reader.
    const harness = connected();
    harness.submit('risotto');

    const searches = harness.posted('WEB_BRIDGE_SEARCH');
    expect(searches).toHaveLength(1);
    expect(searches[0].targetOrigin).toBe('https://cogis.ai');
    expect(searches[0].data).toMatchObject({
      requestId: 'req-1',
      query: 'risotto',
      platforms: ['chatgpt', 'perplexity', 'claude', 'gemini'],
    });
    // Every group is reserved on submit, not just the one that answers first.
    for (const id of PAGE_GROUP_ORDER) {
      expect(harness.status(id), id).toBe('loading');
      expect(harness.statusText(id), id).toBe('Searching…');
    }
  });

  it('trims the query before sending it', () => {
    const harness = connected();
    harness.submit('  risotto  ');
    expect(harness.posted('WEB_BRIDGE_SEARCH')[0].data.query).toBe('risotto');
  });

  it('renders arriving chunks into the ChatGPT group', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        results: [
          {
            platform: 'chatgpt',
            title: 'Risotto technique',
            dateIso: '2026-03-04T10:00:00.000Z',
            deepLinkUrl: 'https://chatgpt.com/c/abc-123',
          },
        ],
      }),
    });

    expect(harness.group().getAttribute('data-cogis-status')).toBe('ready');
    const [link] = harness.resultLinks();
    // §6 M8b AC #6.
    expect(link.href).toBe('https://chatgpt.com/c/abc-123');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.textContent).toContain('Risotto technique');
  });

  it('falls back to the lab origin rather than fabricating a deep link', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        results: [{ platform: 'chatgpt', title: 'No id', dateIso: null, deepLinkUrl: null }],
      }),
    });
    expect(harness.resultLinks()[0].href).toBe('https://chatgpt.com');
  });

  it('renders empty, login_required, and unavailable honestly', () => {
    // Parent §4.6 copy family. `empty` is only ever the adapter's own `empty`;
    // the page never relabels a login or timeout state as "no results".
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({ data: chunk(harness.nonce(), { status: 'empty' }) });
    expect(harness.statusText()).toBe('No matching chats.');

    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), { requestId: 'req-2', status: 'login_required' }),
    });
    expect(harness.statusText()).toContain('Please log in to ChatGPT');
    const loginLink = [...harness.group().descendants()].find(
      (node) => node.className === 'cogis-login-link',
    );
    expect(loginLink.href).toBe('https://chatgpt.com/');
    expect(loginLink.rel).toBe('noopener noreferrer');

    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), { requestId: 'req-3', status: 'unavailable' }),
    });
    expect(harness.statusText()).toBe('ChatGPT is temporarily unavailable.');
  });
});

describe('empty submit', () => {
  it('clears results, cancels in flight, and shows the hint', () => {
    // §6 M8b AC #4, same copy family as the popup.
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        results: [{ platform: 'chatgpt', title: 'Risotto', dateIso: null, deepLinkUrl: null }],
      }),
    });
    expect(harness.resultLinks()).toHaveLength(1);

    harness.submit('   ');

    expect(harness.resultLinks()).toHaveLength(0);
    expect(harness.group().getAttribute('data-cogis-status')).toBe('idle');
    expect(harness.statusText()).toBe('');
    expect(harness.el('cogis-hint').hidden).toBe(false);
    expect(harness.posted('WEB_BRIDGE_SEARCH')).toHaveLength(1);
  });

  it('hides the hint again on the next real search', () => {
    const harness = connected();
    harness.submit('');
    expect(harness.el('cogis-hint').hidden).toBe(false);
    harness.submit('risotto');
    expect(harness.el('cogis-hint').hidden).toBe(true);
  });
});

describe('in-flight supersede', () => {
  it('cancels the prior request and never renders its late chunks', () => {
    // §6 M8b AC #5.
    const harness = connected();
    harness.submit('risotto');
    const firstNonce = harness.nonce();
    harness.submit('paella');

    expect(harness.posted('WEB_BRIDGE_CANCEL')).toHaveLength(1);
    expect(harness.posted('WEB_BRIDGE_CANCEL')[0].data.requestId).toBe('req-1');
    expect(harness.posted('WEB_BRIDGE_SEARCH')[1].data).toMatchObject({
      requestId: 'req-2',
      query: 'paella',
    });

    harness.env.deliver({
      data: chunk(firstNonce, {
        requestId: 'req-1',
        results: [{ platform: 'chatgpt', title: 'Stale', dateIso: null, deepLinkUrl: null }],
      }),
    });
    expect(harness.resultLinks()).toHaveLength(0);
    expect(harness.group().getAttribute('data-cogis-status')).toBe('loading');

    harness.env.deliver({
      data: chunk(harness.nonce(), {
        requestId: 'req-2',
        results: [{ platform: 'chatgpt', title: 'Fresh', dateIso: null, deepLinkUrl: null }],
      }),
    });
    expect(harness.resultLinks()[0].textContent).toContain('Fresh');
  });

  it('ignores a PLATFORM_DONE for a superseded request', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.submit('paella');
    harness.env.deliver({
      data: {
        type: 'WEB_BRIDGE_PLATFORM_DONE',
        nonce: harness.nonce(),
        requestId: 'req-1',
        platform: 'all',
        status: 'cancelled',
      },
    });
    expect(harness.page.snapshot().activeRequestId).toBe('req-2');
  });
});

describe('four-group rendering', () => {
  it('ships the four groups in the locked parent §4.7 order', () => {
    // §6 M8c: ChatGPT → Perplexity → Claude → Gemini. Grok is M7, not here.
    const harness = connected();
    expect(harness.view.platforms).toEqual(['chatgpt', 'perplexity', 'claude', 'gemini']);
    expect(harness.groupOrder()).toEqual(['chatgpt', 'perplexity', 'claude', 'gemini']);
    expect(harness.groupOrder()).not.toContain('grok');
  });

  it('drops a chunk for a platform the page does not render', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        platform: 'grok',
        results: [{ platform: 'grok', title: 'Elsewhere', dateIso: null, deepLinkUrl: null }],
      }),
    });
    for (const id of PAGE_GROUP_ORDER) {
      expect(harness.resultLinks(id), id).toHaveLength(0);
      expect(harness.status(id), id).toBe('loading');
    }
  });

  it('routes each lab chunk into its own group and nowhere else', () => {
    const harness = connected();
    harness.submit('risotto');
    for (const id of PAGE_GROUP_ORDER) {
      harness.env.deliver({
        data: chunk(harness.nonce(), {
          platform: id,
          results: [
            {
              platform: id,
              title: `${id} hit`,
              dateIso: null,
              deepLinkUrl: null,
              prefillSupported: false,
            },
          ],
        }),
      });
    }
    for (const id of PAGE_GROUP_ORDER) {
      const links = harness.resultLinks(id);
      expect(links, id).toHaveLength(1);
      expect(links[0].textContent, id).toContain(`${id} hit`);
    }
  });
});

describe('partial failure stays partial (§6 M8c AC #3)', () => {
  it('combines login_required, ready, and timeout under one requestId', () => {
    // One lab logged out, one serving pointers, one timing out — all in the
    // same request. None of the three may affect the other two.
    const harness = connected();
    harness.submit('risotto');
    const nonce = harness.nonce();

    harness.env.deliver({
      data: chunk(nonce, { platform: 'perplexity', status: 'login_required', results: [] }),
    });
    harness.env.deliver({
      data: chunk(nonce, {
        platform: 'claude',
        status: 'ready',
        results: [
          {
            platform: 'claude',
            title: 'Risotto method',
            dateIso: '2026-03-04T10:00:00.000Z',
            deepLinkUrl: 'https://claude.ai/chat/1f0d9a6e-2b74-4c1b-9a3e-5d8c7b6a4f21',
            prefillSupported: false,
          },
        ],
      }),
    });
    harness.env.deliver({
      data: chunk(nonce, { platform: 'gemini', status: 'timeout', results: [] }),
    });

    expect(harness.status('perplexity')).toBe('login_required');
    expect(harness.statusText('perplexity')).toContain('Please log in to Perplexity');

    expect(harness.status('claude')).toBe('ready');
    expect(harness.resultLinks('claude')[0].href).toBe(
      'https://claude.ai/chat/1f0d9a6e-2b74-4c1b-9a3e-5d8c7b6a4f21',
    );

    expect(harness.status('gemini')).toBe('timeout');
    expect(harness.statusText('gemini')).toBe('Gemini is temporarily unavailable.');

    // The lab nobody reported on is still waiting, not silently failed.
    expect(harness.status('chatgpt')).toBe('loading');
  });

  it('links each logged-out lab to its own login surface', () => {
    const harness = connected();
    harness.submit('risotto');
    const nonce = harness.nonce();
    for (const id of PAGE_GROUP_ORDER) {
      harness.env.deliver({ data: chunk(nonce, { platform: id, status: 'login_required' }) });
    }

    const expected = {
      chatgpt: ['Please log in to ChatGPT', 'https://chatgpt.com/'],
      perplexity: ['Please log in to Perplexity', 'https://www.perplexity.ai/'],
      claude: ['Please log in to Claude', 'https://claude.ai/login'],
      gemini: ['Please log in to Gemini', 'https://gemini.google.com/app'],
    };
    for (const [id, [copy, loginUrl]] of Object.entries(expected)) {
      expect(harness.statusText(id), id).toContain(copy);
      const link = [...harness.group(id).descendants()].find(
        (node) => node.className === 'cogis-login-link',
      );
      expect(link.href, id).toBe(loginUrl);
      expect(link.rel, id).toBe('noopener noreferrer');
    }
  });
});

describe('empty is only ever the adapter’s own empty (§6 M8c AC #4)', () => {
  it('does not relabel a truncated ready group as empty', () => {
    // A soft-ceilinged / truncated scan still returns pointers: it is `ready`
    // with fewer rows, never "no matching chats". Mirrors parent M7 AC #6.
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        platform: 'claude',
        status: 'ready',
        truncated: true,
        results: [
          {
            platform: 'claude',
            title: 'Partial scan hit',
            dateIso: null,
            deepLinkUrl: null,
            prefillSupported: false,
          },
        ],
      }),
    });

    expect(harness.status('claude')).toBe('ready');
    expect(harness.statusText('claude')).not.toBe('No matching chats.');
    expect(harness.resultLinks('claude')).toHaveLength(1);
  });

  it('does not relabel login_required, unavailable, or timeout as empty', () => {
    const harness = connected();
    harness.submit('risotto');
    const nonce = harness.nonce();
    const notEmpty = ['login_required', 'unavailable', 'timeout'];
    for (const [i, status] of notEmpty.entries()) {
      const id = PAGE_GROUP_ORDER[i + 1];
      harness.env.deliver({ data: chunk(nonce, { platform: id, status, results: [] }) });
      expect(harness.status(id), id).toBe(status);
      expect(harness.statusText(id), id).not.toBe('No matching chats.');
    }
  });

  it('says "No matching chats." only for a real empty', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), { platform: 'gemini', status: 'empty', results: [] }),
    });
    expect(harness.status('gemini')).toBe('empty');
    expect(harness.statusText('gemini')).toBe('No matching chats.');
  });
});

describe('deep-link cascade per lab (§6 M8c AC #6)', () => {
  it('uses the pointer deep link when the adapter supplies one', () => {
    const harness = connected();
    harness.submit('risotto');
    const nonce = harness.nonce();
    // The live patterns from parent §3.6.1.
    const deepLinks = {
      chatgpt: 'https://chatgpt.com/c/abc-123',
      perplexity: 'https://www.perplexity.ai/search/risotto-technique-AbCdEf',
      claude: 'https://claude.ai/chat/1f0d9a6e-2b74-4c1b-9a3e-5d8c7b6a4f21',
      gemini: 'https://gemini.google.com/app/9f8e7d6c5b4a',
    };
    for (const [id, deepLinkUrl] of Object.entries(deepLinks)) {
      harness.env.deliver({
        data: chunk(nonce, {
          platform: id,
          results: [
            {
              platform: id,
              title: `${id} hit`,
              dateIso: null,
              deepLinkUrl,
              prefillSupported: false,
            },
          ],
        }),
      });
      const [link] = harness.resultLinks(id);
      expect(link.href, id).toBe(deepLinkUrl);
      expect(link.target, id).toBe('_blank');
      expect(link.rel, id).toBe('noopener noreferrer');
    }
  });

  it('falls back to the lab home and never fabricates a deep link', () => {
    const harness = connected();
    harness.submit('risotto');
    const nonce = harness.nonce();
    const homes = {
      chatgpt: 'https://chatgpt.com',
      perplexity: 'https://www.perplexity.ai',
      claude: 'https://claude.ai',
      gemini: 'https://gemini.google.com/app',
    };
    for (const [id, home] of Object.entries(homes)) {
      harness.env.deliver({
        data: chunk(nonce, {
          platform: id,
          results: [
            {
              platform: id,
              title: `${id} hit`,
              dateIso: null,
              deepLinkUrl: null,
              prefillSupported: false,
            },
          ],
        }),
      });
      const [link] = harness.resultLinks(id);
      expect(link.href, id).toBe(home);
      // A fabricated pointer would look like /c/, /search/, /chat/, /app/<id>.
      expect(link.href, id).not.toMatch(/\/(c|chat|search)\/.+/);
    }
  });

  it('offers the Perplexity ?q= prefill when the pointer says it is supported', () => {
    // Parent §4.4 middle leg of the cascade — Perplexity only.
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        platform: 'perplexity',
        results: [
          {
            platform: 'perplexity',
            title: 'Prefill only',
            dateIso: null,
            deepLinkUrl: null,
            prefillSupported: true,
          },
        ],
      }),
    });
    expect(harness.resultLinks('perplexity')[0].href).toBe(
      'https://www.perplexity.ai/search?q=risotto',
    );
  });
});

describe('result watchdog', () => {
  it('marks a silent group as timed out rather than spinning forever', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.advance(15500);
    expect(harness.group().getAttribute('data-cogis-status')).toBe('timeout');
    expect(harness.statusText()).toBe('ChatGPT is temporarily unavailable.');
  });

  it('does not fire once the group has answered', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({ data: chunk(harness.nonce(), { status: 'empty' }) });
    harness.env.advance(20000);
    expect(harness.group().getAttribute('data-cogis-status')).toBe('empty');
  });
});

describe('keyboard', () => {
  it('focuses the searchbox on "/" unless the user is already typing', () => {
    const harness = connected();
    const input = harness.el('cogis-query');
    input.focused = false;

    harness.doc.dispatch('keydown', {
      key: '/',
      target: { tagName: 'INPUT' },
      preventDefault() {},
    });
    expect(input.focused).toBe(false);

    let defaultPrevented = false;
    harness.doc.dispatch('keydown', {
      key: '/',
      target: { tagName: 'BODY' },
      preventDefault() {
        defaultPrevented = true;
      },
    });
    expect(input.focused).toBe(true);
    expect(defaultPrevented).toBe(true);
  });
});

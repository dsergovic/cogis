import { describe, it, expect } from 'vitest';
import { startPage } from '../helpers/page-harness.js';

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
      platforms: ['chatgpt'],
    });
    expect(harness.group().getAttribute('data-cogis-status')).toBe('loading');
    expect(harness.statusText()).toBe('Searching…');
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

describe('ChatGPT-only rendering', () => {
  it('ships exactly one group', () => {
    // Perplexity / Claude / Gemini are M8c (§6 M8b out-of-scope).
    const harness = connected();
    expect(harness.view.platforms).toEqual(['chatgpt']);
    const groups = [...harness.el('cogis-results').descendants()].filter((node) =>
      node.attributes.has('data-cogis-platform'),
    );
    expect(groups).toHaveLength(1);
  });

  it('drops a chunk for a platform the page does not render', () => {
    const harness = connected();
    harness.submit('risotto');
    harness.env.deliver({
      data: chunk(harness.nonce(), {
        platform: 'claude',
        results: [{ platform: 'claude', title: 'Elsewhere', dateIso: null, deepLinkUrl: null }],
      }),
    });
    expect(harness.resultLinks()).toHaveLength(0);
    expect(harness.group().getAttribute('data-cogis-status')).toBe('loading');
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

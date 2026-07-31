import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  FOOTNOTE_TEXT,
  loginRequiredCopy,
  unavailableCopy,
} from '../../extension/lib/platforms.js';
import { resolveResultHref } from '../../extension/lib/results.js';
import { POPUP_WATCHDOG_MS } from '../../extension/lib/timeouts.js';
import { normalizeQuery } from '../../extension/lib/messaging.js';
import { loadPageApi, readWebFile, buildPageDom } from '../helpers/page-harness.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const addendum = readFileSync(join(repoRoot, 'docs/agent_blueprint-m8-web-surface.md'), 'utf8');

const api = loadPageApi();
const index = readWebFile('index');
const notFound = readWebFile('notFound');

describe('CSP meta matches §3.7 exactly', () => {
  /** Pulled out of the addendum rather than retyped, so the doc is the source. */
  const expected = addendum.match(/`(default-src 'self';[^`]*upgrade-insecure-requests)`/)?.[1];

  it('finds the policy in the addendum', () => {
    expect(expected).toBeTruthy();
  });

  for (const [name, html] of [
    ['index.html', index],
    ['404.html', notFound],
  ]) {
    it(`${name} carries the policy character for character`, () => {
      const found = html.match(
        /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/,
      )?.[1];
      expect(found).toBe(expected);
    });
  }
});

describe('page literals mirror extension/lib', () => {
  it('uses the same ChatGPT platform definition', () => {
    const chatgpt = PLATFORMS.chatgpt;
    expect(api.render.CHATGPT).toEqual({
      id: chatgpt.id,
      label: chatgpt.label,
      capability: chatgpt.capability,
      origin: chatgpt.origin,
      loginUrl: chatgpt.loginUrl,
    });
    // The capability chip is baked into the markup, so assert the markup too.
    expect(index).toContain(
      `<span class="cogis-capability" data-cogis-capability>full-text</span>`,
    );
    expect(index).toContain(`<span class="cogis-group-title">${chatgpt.label}</span>`);
  });

  it('uses the same group chip copy the popup uses', () => {
    expect(api.render.COPY.loginRequired).toBe(loginRequiredCopy('chatgpt'));
    expect(api.render.COPY.unavailable).toBe(unavailableCopy('chatgpt'));
    expect(api.render.statusCopy('timeout')).toBe(unavailableCopy('chatgpt'));
    expect(index).toContain(FOOTNOTE_TEXT);
    expect(index).toContain('Type a query and press Enter.');
  });

  it('resolves hrefs the same way the popup does', () => {
    const origin = PLATFORMS.chatgpt.origin;
    const cases = [
      { deepLinkUrl: 'https://chatgpt.com/c/abc', prefillSupported: false },
      { deepLinkUrl: null, prefillSupported: false },
      { deepLinkUrl: '', prefillSupported: true },
    ];
    for (const hit of cases) {
      expect(api.render.resultHref(hit)).toBe(resolveResultHref(hit, 'chatgpt', 'risotto', origin));
    }
  });

  it('normalizes queries the same way the popup does', () => {
    for (const raw of ['risotto', '  risotto  ', '', '   ', '\t\n', 42, null]) {
      expect(api.page.normalizeQuery(raw)).toBe(normalizeQuery(raw));
    }
  });

  it('uses the popup watchdog interval', () => {
    expect(api.page.RESULT_WATCHDOG_MS).toBe(POPUP_WATCHDOG_MS);
  });
});

describe('S8.2 constants are sourced from the closed spike', () => {
  const spike = readFileSync(join(repoRoot, 'docs/spikes/s8-2-install-gate-latency.md'), 'utf8');

  it('ships the budget and the cadence the spike locked', () => {
    expect(api.page.INSTALL_GATE_BUDGET_MS).toBe(900);
    expect(api.page.HELLO_REEMIT_EVERY_MS).toBe(100);
    expect(spike).toMatch(/900\s*ms/);
    expect(spike).toMatch(/100\s*ms/);
  });
});

describe('index.html provides every hook the scripts bind to', () => {
  // buildPageDom() is a hand-rolled stand-in for this markup; if the real page
  // drops an id, the fake would keep the unit tests green while the live page
  // silently stopped working. This is the check that prevents that.
  const doc = buildPageDom();

  for (const id of [...doc.byId.keys()]) {
    it(`has #${id}`, () => {
      expect(index).toContain(`id="${id}"`);
    });
  }

  it('has the group hooks render.js queries', () => {
    expect(index).toContain('data-cogis-platform="chatgpt"');
    expect(index).toContain('data-cogis-status-text');
    expect(index).toContain('data-cogis-list');
  });

  it('loads the three page scripts in bridge → render → page order', () => {
    const order = [...index.matchAll(/<script src="assets\/js\/([a-z-]+)\.js"><\/script>/g)].map(
      (match) => match[1],
    );
    expect(order).toEqual(['bridge-client', 'render', 'page']);
  });

  it('ships no inline script and no inline event handler', () => {
    // `script-src 'self'` (§3.7) blocks both; failing here beats failing live.
    for (const [name, html] of [
      ['index.html', index],
      ['404.html', notFound],
    ]) {
      expect(html, name).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/i);
      expect(html, name).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html, name).not.toMatch(/<style[\s>]/i);
    }
  });
});

describe('structural sanity', () => {
  // §6 M8b AC #12 asks the `web-build-and-check` job to prove "HTML validates".
  // This is a structural check, not a conformance validator: it catches the
  // failure modes a hand-edited static page actually hits — a missing doctype,
  // a missing `lang`, an unclosed container. A real validator (html-validate,
  // vnu) is a new dependency and is filed as BL-028.
  const CONTAINERS = [
    'html',
    'head',
    'body',
    'header',
    'nav',
    'main',
    'section',
    'div',
    'form',
    'ul',
    'li',
    'p',
    'footer',
  ];

  for (const [name, html] of [
    ['index.html', index],
    ['404.html', notFound],
  ]) {
    it(`${name} opens with a doctype and a language`, () => {
      expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
      expect(html.trimEnd().endsWith('</html>')).toBe(true);
    });

    it(`${name} closes every container it opens`, () => {
      for (const tag of CONTAINERS) {
        const opened = html.match(new RegExp(`<${tag}[\\s>]`, 'g'))?.length ?? 0;
        const closed = html.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0;
        expect(closed, `${name} <${tag}>`).toBe(opened);
      }
    });

    it(`${name} declares a charset and a title`, () => {
      expect(html).toContain('<meta charset="utf-8" />');
      expect(html).toMatch(/<title>[^<]+<\/title>/);
    });
  }
});

describe('web/CNAME', () => {
  it('is exactly the apex (§6 M8b AC #12)', () => {
    expect(readFileSync(join(repoRoot, 'web/CNAME'), 'utf8').trim()).toBe('cogis.ai');
  });
});

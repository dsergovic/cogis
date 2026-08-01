import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  PLATFORMS,
  PLATFORM_ORDER,
  FOOTNOTE_TEXT,
  loginRequiredCopy,
  unavailableCopy,
} from '../../extension/lib/platforms.js';
import { resolveResultHref } from '../../extension/lib/results.js';
import { POPUP_WATCHDOG_MS } from '../../extension/lib/timeouts.js';
import { normalizeQuery } from '../../extension/lib/messaging.js';
import {
  loadPageApi,
  readWebFile,
  buildPageDom,
  PAGE_GROUP_ORDER,
} from '../helpers/page-harness.js';

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

/**
 * Every group box in index.html, in document order, with the two strings the
 * markup states about each lab. Parsed rather than retyped so the assertions
 * below are about the page that actually ships.
 */
const markupGroups = [
  ...index.matchAll(
    /data-cogis-platform="([a-z]+)"[\s\S]*?<span class="cogis-group-title">([^<]+)<\/span>\s*<span class="cogis-capability" data-cogis-capability>([^<]+)<\/span>/g,
  ),
].map(([, id, label, capability]) => ({ id, label, capability }));

describe('group order is the locked parent §4.7 order', () => {
  // §6 M8c scope: ChatGPT → Perplexity → Claude → Gemini. Grok is M7 and is
  // not rendered by the page. The order is read from PLATFORM_ORDER, so the
  // popup and the page cannot disagree about it.
  it('renders exactly the popup platform set', () => {
    expect(api.render.PAGE_PLATFORMS).toEqual([...PLATFORM_ORDER]);
    expect(api.render.PAGE_PLATFORMS).not.toContain('grok');
  });

  it('preallocates the four group boxes in that order in index.html', () => {
    expect(markupGroups.map((group) => group.id)).toEqual([...PLATFORM_ORDER]);
  });

  it('drives the fake DOM from the same order', () => {
    expect(PAGE_GROUP_ORDER).toEqual([...PLATFORM_ORDER]);
  });
});

describe('page literals mirror extension/lib', () => {
  it('mirrors every platform definition, in order', () => {
    expect(
      api.render.PLATFORMS.map((platform) => ({ id: platform.id, label: platform.label })),
    ).toEqual(PLATFORM_ORDER.map((id) => ({ id, label: PLATFORMS[id].label })));
    for (const id of PLATFORM_ORDER) {
      expect(api.render.getPlatform(id).loginUrl, id).toBe(PLATFORMS[id].loginUrl);
    }
  });

  it('states each capability exactly as extension/lib/platforms.js does', () => {
    // §6 M8c AC #2: the capability chip is the page's only statement of a
    // lab's capability, and it is not allowed to invent one. render.js does
    // not carry a capability field at all — this markup is the single place.
    for (const group of markupGroups) {
      expect(group.capability, group.id).toBe(PLATFORMS[group.id].capability);
      expect(group.label, group.id).toBe(PLATFORMS[group.id].label);
    }
    expect(markupGroups.map((group) => group.capability)).toEqual([
      'full-text',
      'title-match',
      'title-match',
      'title-match',
    ]);
  });

  it('uses the same group chip copy the popup uses, per lab', () => {
    for (const id of PLATFORM_ORDER) {
      expect(api.render.loginRequiredCopy(id), id).toBe(loginRequiredCopy(id));
      expect(api.render.unavailableCopy(id), id).toBe(unavailableCopy(id));
      expect(api.render.statusCopy('login_required', id), id).toBe(loginRequiredCopy(id));
      expect(api.render.statusCopy('timeout', id), id).toBe(unavailableCopy(id));
      expect(api.render.statusCopy('unavailable', id), id).toBe(unavailableCopy(id));
    }
    expect(index).toContain(FOOTNOTE_TEXT);
    expect(index).toContain('Type a query and press Enter.');
  });

  it('spells the per-lab login sentence exactly', () => {
    expect(PLATFORM_ORDER.map((id) => api.render.loginRequiredCopy(id))).toEqual([
      'Please log in to ChatGPT',
      'Please log in to Perplexity',
      'Please log in to Claude',
      'Please log in to Gemini',
    ]);
  });

  it('resolves hrefs the same way the popup does, for every platform', () => {
    // Includes the `null` deep-link row: the page must land on the lab's own
    // home surface, never on a URL shaped like a chat pointer (§6 M8c AC #6).
    const cases = [
      { deepLinkUrl: 'https://example.invalid/deep/link', prefillSupported: false },
      { deepLinkUrl: null, prefillSupported: false },
      { deepLinkUrl: null, prefillSupported: true },
      { deepLinkUrl: '', prefillSupported: true },
    ];
    for (const id of PLATFORM_ORDER) {
      for (const hit of cases) {
        expect(api.render.resultHref(hit, id, 'risotto'), `${id} ${JSON.stringify(hit)}`).toBe(
          resolveResultHref(hit, id, 'risotto', PLATFORMS[id].origin),
        );
      }
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

  it('has the group hooks render.js queries, for every group', () => {
    for (const id of PLATFORM_ORDER) {
      expect(index, id).toContain(`data-cogis-platform="${id}"`);
    }
    // One status line and one list per group, or a chunk would render into
    // the wrong lab's box.
    expect(index.match(/data-cogis-status-text/g)).toHaveLength(PLATFORM_ORDER.length);
    expect(index.match(/data-cogis-list/g)).toHaveLength(PLATFORM_ORDER.length);
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

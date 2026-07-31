import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createEnv } from './bridge-client-harness.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const WEB_PATHS = {
  index: join(root, 'web/index.html'),
  notFound: join(root, 'web/404.html'),
  css: join(root, 'web/assets/css/site.css'),
  bridgeClient: join(root, 'web/assets/js/bridge-client.js'),
  render: join(root, 'web/assets/js/render.js'),
  page: join(root, 'web/assets/js/page.js'),
};

/** @param {keyof typeof WEB_PATHS} name */
export function readWebFile(name) {
  return readFileSync(WEB_PATHS[name], 'utf8');
}

/**
 * The three page scripts are flat classic scripts loaded in document order, so
 * the tests load them the same way: concatenated into one vm context. The
 * context has no `document`, which is what keeps `page.js` from auto-booting.
 */
export function loadPageApi() {
  const context = { console };
  const source = [readWebFile('bridgeClient'), readWebFile('render'), readWebFile('page')].join(
    '\n;\n',
  );
  runInNewContext(source, context, { filename: 'web/assets/js/*.js' });
  return {
    client: context.CogisBridgeClient,
    render: context.CogisRender,
    page: context.CogisPage,
  };
}

/**
 * Minimal DOM stand-in — vitest runs in `environment: 'node'` and the repo has
 * no jsdom, so the page gets the same treatment the bridge got: a hand-rolled
 * fake with only the surface the code under test actually touches.
 */
class FakeNode {
  constructor(text) {
    this.nodeType = 3;
    this.textContent = String(text);
  }
}

class FakeElement {
  /** @param {FakeDocument} doc @param {string} tag */
  constructor(doc, tag) {
    this.ownerDocument = doc;
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.focused = false;
    this.ownText = '';
  }

  get textContent() {
    if (this.childNodes.length === 0) return this.ownText;
    return this.childNodes.map((node) => node.textContent).join('');
  }

  set textContent(value) {
    this.childNodes = [];
    this.ownText = String(value);
  }

  append(...nodes) {
    for (const node of nodes) this.childNodes.push(node);
    this.ownText = '';
  }

  replaceChildren(...nodes) {
    this.childNodes = [...nodes];
    this.ownText = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  focus() {
    this.focused = true;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, event = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ ...event, target: event.target });
  }

  /** Supports `[attr]` and `[attr="value"]` only — all this code needs. */
  querySelector(selector) {
    const match = /^\[([a-z-]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (!match) throw new Error(`unsupported selector: ${selector}`);
    const [, name, value] = match;
    for (const child of this.descendants()) {
      if (!child.attributes.has(name)) continue;
      if (value === undefined || child.attributes.get(name) === value) return child;
    }
    return null;
  }

  *descendants() {
    for (const child of this.childNodes) {
      if (!(child instanceof FakeElement)) continue;
      yield child;
      yield* child.descendants();
    }
  }
}

class FakeDocument {
  constructor(readyState) {
    this.readyState = readyState;
    this.byId = new Map();
    this.listeners = new Map();
    this.root = new FakeElement(this, 'body');
  }

  createElement(tag) {
    return new FakeElement(this, tag);
  }

  createTextNode(text) {
    return new FakeNode(text);
  }

  getElementById(id) {
    return this.byId.get(id) ?? null;
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  dispatch(type, event = {}) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }

  /** @param {string} id @param {string} tag @param {Record<string,string>} [attrs] */
  register(id, tag, attrs = {}, parent = this.root) {
    const el = new FakeElement(this, tag);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    parent.append(el);
    this.byId.set(id, el);
    return el;
  }
}

/**
 * The element graph `render.js` binds to. Mirrors the ids and data hooks in
 * `web/index.html`; `tests/unit/page-contract-parity.test.js` fails if the real page
 * stops providing one of them, which is what keeps this fake honest.
 *
 * @param {{ readyState?: 'loading'|'interactive'|'complete' }} [options]
 */
export function buildPageDom(options = {}) {
  const doc = new FakeDocument(options.readyState ?? 'loading');

  doc.register('cogis-status-pill', 'p', { 'data-cogis-connection': 'checking' });
  const search = doc.register('cogis-search', 'section');
  const form = doc.register('cogis-search-form', 'form', {}, search);
  doc.register('cogis-query', 'input', {}, form);
  doc.register('cogis-submit', 'button', {}, form);
  doc.register('cogis-hint', 'p', {}, search);
  const gate = doc.register('cogis-install-gate', 'section');
  doc.register('cogis-gate-copy', 'p', {}, gate);
  const results = doc.register('cogis-results', 'section');

  const group = new FakeElement(doc, 'div');
  group.setAttribute('data-cogis-platform', 'chatgpt');
  group.setAttribute('data-cogis-status', 'idle');
  const statusText = new FakeElement(doc, 'p');
  statusText.setAttribute('data-cogis-status-text', '');
  const list = new FakeElement(doc, 'ul');
  list.setAttribute('data-cogis-list', '');
  group.append(statusText, list);
  results.append(group);

  return doc;
}

/**
 * A started page wired to the fake clock, the fake DOM, and a real bridge
 * client. `clientOptions` captures what `page.js` handed the client factory, so
 * the S8.2 constants are asserted at the call site rather than by reading a
 * literal out of the source.
 *
 * @param {{ readyState?: string, start?: boolean }} [options]
 */
export function startPage(options = {}) {
  const api = loadPageApi();
  const env = createEnv();
  const doc = buildPageDom({ readyState: options.readyState ?? 'loading' });
  /** @type {object|null} */
  let clientOptions = null;
  let bridgeClient = null;
  let requestSeq = 0;

  const view = api.render.createView({ doc });
  const page = api.page.create({
    view,
    win: env.win,
    doc,
    cryptoImpl: { randomUUID: () => `req-${++requestSeq}` },
    createClient(opts) {
      clientOptions = opts;
      bridgeClient = api.client.create({ ...opts, now: env.now, cryptoImpl: env.cryptoImpl });
      return bridgeClient;
    },
  });

  if (options.start !== false) page.start();

  const el = (id) => doc.getElementById(id);
  const group = () => doc.getElementById('cogis-results').querySelector('[data-cogis-platform]');

  return {
    api,
    env,
    doc,
    view,
    page,
    el,
    group,
    clientOptions: () => clientOptions,
    /** Fire the DOMContentLoaded the bridge client is waiting on. */
    fireDomReady() {
      doc.readyState = 'interactive';
      doc.dispatch('DOMContentLoaded');
    },
    /** Complete the handshake with a COGIS_READY the bridge would really send. */
    connect() {
      const nonce = env.hellos()[0]?.data?.nonce;
      env.deliver({
        data: {
          type: 'COGIS_READY',
          nonce,
          v: 1,
          extVersion: '0.6.0',
          capabilities: { search: true, cancel: true },
        },
      });
      return nonce;
    },
    nonce: () => env.hellos()[0]?.data?.nonce ?? null,
    /** Type into the searchbox and submit the form. */
    submit(query) {
      el('cogis-query').value = query;
      el('cogis-search-form').dispatch('submit', { preventDefault() {} });
    },
    statusText: () => group().querySelector('[data-cogis-status-text]').textContent,
    resultLinks: () =>
      [...group().querySelector('[data-cogis-list]').descendants()].filter(
        (node) => node.tagName === 'A',
      ),
    posted: (type) => env.posted.filter((entry) => entry.data?.type === type),
  };
}

// Cogis page-side rendering — the group/copy half of addendum §6 M8b.
//
// Flat classic script, one global, no imports: `script-src 'self'` (§3.7)
// forbids inline JS, and a `type="module"` script would be deferred, which is
// the timing posture bridge-client.js documents at its own head.
//
// Every user-visible string here is a mirror of a source of truth that lives
// somewhere else — extension/lib/platforms.js for the platform literals and the
// group chips, docs/spikes/s8-2-install-gate-latency.md for the connection copy
// (LOCKED 2026-07-31). tests/unit/page-contract-parity.test.js fails if either
// drifts. Nothing here may say *why* a handshake failed (S8.2 residual risk R4):
// a withheld host permission and an uninstalled extension are indistinguishable
// at the protocol level, so the copy states only what the page observed.
(function (global) {
  'use strict';

  /** ChatGPT only in M8b. Perplexity/Claude/Gemini fold in during M8c (§6). */
  const CHATGPT = {
    id: 'chatgpt',
    label: 'ChatGPT',
    capability: 'full-text',
    origin: 'https://chatgpt.com',
    loginUrl: 'https://chatgpt.com/',
  };

  const PAGE_PLATFORMS = [CHATGPT.id];

  /** LOCKED by S8.2, "Install-gate copy" table. */
  const COPY = {
    connected: 'Extension connected.',
    checking: 'Checking for Cogis extension…',
    gate: 'Install the Cogis Chrome extension to search.',
    searching: 'Searching…',
    empty: 'No matching chats.',
    loginRequired: `Please log in to ${CHATGPT.label}`,
    unavailable: `${CHATGPT.label} is temporarily unavailable.`,
  };

  const CONNECTION_STATES = new Set(['checking', 'connected', 'gated']);

  /**
   * Group status vocabulary, identical to the popup's (parent §4.6). The bridge
   * projects the same statuses the popup receives, so the page renders the same
   * words for the same state.
   */
  const GROUP_STATUSES = new Set([
    'idle',
    'loading',
    'ready',
    'empty',
    'login_required',
    'unavailable',
    'timeout',
  ]);

  /**
   * Click cascade for a ChatGPT pointer: deep link, then the lab origin. Mirror
   * of resolveResultHref(hit, 'chatgpt', …) in extension/lib/results.js — never
   * a fabricated deep link (§6 M8c AC #6 states the rule; it holds here too).
   * @param {{ deepLinkUrl?: string|null }|null|undefined} hit
   */
  function resultHref(hit) {
    return hit?.deepLinkUrl || CHATGPT.origin;
  }

  /** @param {string} iso */
  function formatDate(iso) {
    if (typeof iso !== 'string' || !iso) return '';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /**
   * Status-line copy for a group. `null` means "render results, not a message".
   * @param {string} status
   */
  function statusCopy(status) {
    switch (status) {
      case 'loading':
        return COPY.searching;
      case 'empty':
        return COPY.empty;
      case 'login_required':
        return COPY.loginRequired;
      case 'unavailable':
      case 'timeout':
        return COPY.unavailable;
      default:
        return null;
    }
  }

  /**
   * Bind the view to an already-rendered document. The page ships its DOM in
   * index.html rather than building it here, so the group boxes exist before
   * the first chunk arrives and the layout cannot jump (§6 M8b AC #8).
   *
   * @param {object} options
   * @param {Document} options.doc
   */
  function createView(options) {
    const doc = options.doc;

    const searchSection = doc.getElementById('cogis-search');
    const form = doc.getElementById('cogis-search-form');
    const input = doc.getElementById('cogis-query');
    const submit = doc.getElementById('cogis-submit');
    const hint = doc.getElementById('cogis-hint');
    const pill = doc.getElementById('cogis-status-pill');
    const gate = doc.getElementById('cogis-install-gate');
    const gateCopy = doc.getElementById('cogis-gate-copy');
    const results = doc.getElementById('cogis-results');

    /** @param {string} platformId */
    function groupEl(platformId) {
      return results?.querySelector(`[data-cogis-platform="${platformId}"]`) ?? null;
    }

    /** @param {Element} list @param {object[]} hits */
    function renderResults(list, hits) {
      for (const hit of hits) {
        const item = doc.createElement('li');
        item.className = 'cogis-result-item';

        const link = doc.createElement('a');
        link.className = 'cogis-result-link';
        link.href = resultHref(hit);
        link.target = '_blank';
        // §6 M8b AC #6: deep links open in a new tab with no opener handle.
        link.rel = 'noopener noreferrer';

        const title = doc.createElement('span');
        title.className = 'cogis-result-title';
        title.textContent = hit.title;
        link.append(title);

        const when = formatDate(hit.dateIso);
        if (when) {
          const date = doc.createElement('span');
          date.className = 'cogis-result-date';
          date.textContent = when;
          link.append(date);
        }

        item.append(link);
        list.append(item);
      }
    }

    return {
      platforms: [...PAGE_PLATFORMS],

      /**
       * checking → searchbox present but disabled; connected → searchbox live;
       * gated → the gate replaces the searchbox. The disabled-checking shape is
       * the S8.2 behavior table's `t < budget` row ("searchbox present but
       * disabled"), which is also what §6 M8b AC #2 asks for: nothing runnable
       * until the handshake resolves.
       * @param {'checking'|'connected'|'gated'} state
       */
      setConnection(state) {
        if (!CONNECTION_STATES.has(state)) return;
        const gated = state === 'gated';
        const connected = state === 'connected';

        if (pill) {
          pill.textContent = connected ? COPY.connected : COPY.checking;
          pill.setAttribute('data-cogis-connection', state);
          pill.hidden = gated;
        }
        if (searchSection) searchSection.hidden = gated;
        if (results) results.hidden = gated;
        if (gate) gate.hidden = !gated;
        // Written from the constant, not trusted to the markup: the LOCKED
        // sentence is the one thing on the gate that cannot be allowed to drift.
        if (gateCopy) gateCopy.textContent = COPY.gate;
        if (input) input.disabled = !connected;
        if (submit) submit.disabled = !connected;
        if (connected && input) input.focus();
      },

      focusInput() {
        if (input && !input.disabled) input.focus();
      },

      /** @param {(query: string) => void} handler */
      onSubmit(handler) {
        form?.addEventListener('submit', (event) => {
          event.preventDefault();
          handler(input?.value ?? '');
        });
      },

      /** @param {boolean} visible */
      showHint(visible) {
        if (hint) hint.hidden = !visible;
      },

      /**
       * @param {string} platformId
       * @param {string} status
       * @param {{ results?: object[] }} [opts]
       */
      setGroup(platformId, status, opts) {
        // M8b renders one group. An envelope naming any other platform is
        // dropped rather than rendered into a group that does not exist (§6
        // M8b out-of-scope; the groups land in M8c).
        if (!PAGE_PLATFORMS.includes(platformId)) return false;
        if (!GROUP_STATUSES.has(status)) return false;

        const group = groupEl(platformId);
        if (!group) return false;
        const statusText = group.querySelector('[data-cogis-status-text]');
        const list = group.querySelector('[data-cogis-list]');
        if (!statusText || !list) return false;

        group.setAttribute('data-cogis-status', status);
        group.className = `cogis-group cogis-group--${status}`;
        list.replaceChildren();
        statusText.replaceChildren();

        if (status === 'ready') {
          renderResults(list, opts?.results ?? []);
        } else if (status === 'login_required') {
          statusText.append(doc.createTextNode(`${COPY.loginRequired} `));
          const link = doc.createElement('a');
          link.className = 'cogis-login-link';
          link.href = CHATGPT.loginUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `Open ${CHATGPT.label}`;
          statusText.append(link);
        } else {
          const copy = statusCopy(status);
          if (copy) statusText.textContent = copy;
        }
        return true;
      },

      /** @param {string} status */
      setAllGroups(status, opts) {
        for (const id of PAGE_PLATFORMS) this.setGroup(id, status, opts);
      },
    };
  }

  global.CogisRender = {
    CHATGPT,
    PAGE_PLATFORMS,
    COPY,
    GROUP_STATUSES,
    resultHref,
    statusCopy,
    formatDate,
    createView,
  };
})(globalThis);

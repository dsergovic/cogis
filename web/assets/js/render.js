// Cogis page-side rendering — the group/copy half of addendum §6 M8b.
//
// Flat classic script, one global, no imports: `script-src 'self'` (§3.7)
// forbids inline JS, and a `type="module"` script would be deferred, which is
// the timing posture bridge-client.js documents at its own head.
//
// Every user-visible string here is a mirror of a source of truth that lives
// somewhere else — extension/lib/platforms.js for the platform literals,
// extension/lib/results.js for the click cascade,
// docs/spikes/s8-2-install-gate-latency.md for the connection copy
// (LOCKED 2026-07-31). tests/unit/page-contract-parity.test.js fails if either
// drifts. Nothing here may say *why* a handshake failed (S8.2 residual risk R4):
// a withheld host permission and an uninstalled extension are indistinguishable
// at the protocol level, so the copy states only what the page observed.
(function (global) {
  'use strict';

  /**
   * The four labs, in the locked parent §4.7 group order
   * (ChatGPT → Perplexity → Claude → Gemini). Mirror of PLATFORMS and
   * PLATFORM_ORDER in extension/lib/platforms.js; the page cannot import that
   * module (flat classic script, see the head note), so parity is proven in
   * tests/unit/page-contract-parity.test.js instead of at runtime.
   *
   * `capability` is deliberately absent: the capability chip is static markup
   * in index.html, read from extension/lib/platforms.js by the parity test, so
   * there is exactly one place on the page that states a lab's capability and
   * this file is not it. Grok is M7/M8-later and is not rendered here.
   */
  const PLATFORMS = [
    {
      id: 'chatgpt',
      label: 'ChatGPT',
      loginUrl: 'https://chatgpt.com/',
      home: 'https://chatgpt.com',
    },
    {
      id: 'perplexity',
      label: 'Perplexity',
      loginUrl: 'https://www.perplexity.ai/',
      home: 'https://www.perplexity.ai',
    },
    {
      id: 'claude',
      label: 'Claude',
      loginUrl: 'https://claude.ai/login',
      home: 'https://claude.ai',
    },
    {
      id: 'gemini',
      label: 'Gemini',
      loginUrl: 'https://gemini.google.com/app',
      // Gemini's home surface is /app, not the bare origin — same value the
      // popup falls back to in resolveResultHref(). Parity-asserted.
      home: 'https://gemini.google.com/app',
    },
  ];

  const PAGE_PLATFORMS = PLATFORMS.map((platform) => platform.id);

  /** @param {string} platformId */
  function getPlatform(platformId) {
    return PLATFORMS.find((platform) => platform.id === platformId) ?? null;
  }

  /** Mirror of loginRequiredCopy() in extension/lib/platforms.js. @param {string} platformId */
  function loginRequiredCopy(platformId) {
    return `Please log in to ${getPlatform(platformId)?.label ?? platformId}`;
  }

  /** Mirror of unavailableCopy() in extension/lib/platforms.js. @param {string} platformId */
  function unavailableCopy(platformId) {
    return `${getPlatform(platformId)?.label ?? platformId} is temporarily unavailable.`;
  }

  /** Page-level copy. The install-gate rows are LOCKED by S8.2. */
  const COPY = {
    connected: 'Extension connected.',
    checking: 'Checking for Cogis extension…',
    gate: 'Install the Cogis Chrome extension to search.',
    searching: 'Searching…',
    empty: 'No matching chats.',
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

  /** Mirror of perplexityPrefillUrl() in extension/lib/results.js. @param {string} query */
  function perplexityPrefillUrl(query) {
    if (typeof query !== 'string') return null;
    const trimmed = query.trim();
    if (!trimmed) return null;
    const url = new URL('https://www.perplexity.ai/search');
    url.searchParams.set('q', trimmed);
    return url.toString();
  }

  /**
   * Click cascade for a pointer: deep link → Perplexity `?q=` prefill → lab
   * home (parent §4.4). Mirror of resolveResultHref() in
   * extension/lib/results.js, asserted against it for every platform in
   * tests/unit/page-contract-parity.test.js.
   *
   * §6 M8c AC #6: a `null` deepLinkUrl falls back to the lab's own home
   * surface. The page never assembles a URL that looks like a chat pointer it
   * was not given.
   *
   * @param {{ deepLinkUrl?: string|null, prefillSupported?: boolean }|null|undefined} hit
   * @param {string} platformId
   * @param {string|null} [query]
   */
  function resultHref(hit, platformId, query) {
    if (hit?.deepLinkUrl) return hit.deepLinkUrl;
    if (hit?.prefillSupported && platformId === 'perplexity') {
      const prefill = perplexityPrefillUrl(query ?? '');
      if (prefill) return prefill;
    }
    return getPlatform(platformId)?.home ?? '#';
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
   *
   * `empty` says only that the adapter returned nothing. A truncated, soft-
   * ceilinged, or logged-out group arrives as its own status and is never
   * rewritten into `empty` here (§6 M8c AC #4).
   *
   * @param {string} status
   * @param {string} platformId
   */
  function statusCopy(status, platformId) {
    switch (status) {
      case 'loading':
        return COPY.searching;
      case 'empty':
        return COPY.empty;
      case 'login_required':
        return loginRequiredCopy(platformId);
      case 'unavailable':
      case 'timeout':
        return unavailableCopy(platformId);
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

    /** @param {Element} list @param {object[]} hits @param {string} platformId @param {string|null} query */
    function renderResults(list, hits, platformId, query) {
      for (const hit of hits) {
        const item = doc.createElement('li');
        item.className = 'cogis-result-item';

        const link = doc.createElement('a');
        link.className = 'cogis-result-link';
        link.href = resultHref(hit, platformId, query);
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
       * @param {{ results?: object[], query?: string|null }} [opts]
       */
      setGroup(platformId, status, opts) {
        // An envelope naming a platform the page does not render — Grok, or
        // anything else — is dropped rather than rendered into a group that
        // does not exist.
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

        const platform = getPlatform(platformId);

        if (status === 'ready') {
          renderResults(list, opts?.results ?? [], platformId, opts?.query ?? null);
        } else if (status === 'login_required') {
          statusText.append(doc.createTextNode(`${loginRequiredCopy(platformId)} `));
          const link = doc.createElement('a');
          link.className = 'cogis-login-link';
          link.href = platform.loginUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = `Open ${platform.label}`;
          statusText.append(link);
        } else {
          const copy = statusCopy(status, platformId);
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
    PLATFORMS,
    PAGE_PLATFORMS,
    COPY,
    GROUP_STATUSES,
    getPlatform,
    loginRequiredCopy,
    unavailableCopy,
    resultHref,
    statusCopy,
    formatDate,
    createView,
  };
})(globalThis);

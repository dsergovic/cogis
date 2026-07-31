import localPack from './local-pack.js';

/**
 * Allowlisted HTTPS URL for the optional remote data-only selector pack (M5).
 * Path is Tier 2; host must stay cogis.ai. Widening beyond data-only is an escalation.
 */
export const REMOTE_PACK_URL = 'https://cogis.ai/packs/selectors.json';

/** Cap remote pack fetch so a hung cogis.ai cannot stall search (B2). */
export const REMOTE_PACK_FETCH_TIMEOUT_MS = 1500;

/** Keys that must never appear in a remote / merged pack payload. */
const FORBIDDEN_KEYS = Object.freeze([
  'script',
  'scripts',
  'eval',
  'module',
  'wasm',
  'javascript',
  'code',
  'function',
  'handler',
  'onload',
  'sourceText',
  'bytecode',
]);

/** Platform fields the remote pack may overlay (strings / string maps / string endpoint maps). */
const ALLOWED_PLATFORM_OVERLAY_KEYS = Object.freeze([
  'selectors',
  'waitPredicates',
  'deepLinkPattern',
  'prefillPattern',
  'origin',
  'loginUrl',
  'endpoints',
]);

/**
 * @typedef {'local'|'merged'} PackSource
 *
 * @typedef {{
 *   localVersion: string,
 *   activeVersion: string,
 *   source: PackSource,
 *   remoteUrl: string,
 *   lastRefreshAt: number|null,
 *   lastRefreshOk: boolean|null,
 *   lastErrorCode: string|null,
 * }} SelectorPackStatus
 */

/** @type {typeof localPack} */
let activePack = structuredClone(localPack);

/** @type {SelectorPackStatus} */
let status = createInitialStatus();

/** @type {Promise<typeof localPack>|null} */
let refreshInFlight = null;

function createInitialStatus() {
  return {
    localVersion: String(localPack.version),
    activeVersion: String(localPack.version),
    source: /** @type {PackSource} */ ('local'),
    remoteUrl: REMOTE_PACK_URL,
    lastRefreshAt: null,
    lastRefreshOk: null,
    lastErrorCode: null,
  };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Reject payloads that contain executable-looking keys at any depth.
 * @param {unknown} payload
 * @returns {boolean} true if safe data-only shape
 */
export function isDataOnlyPack(payload) {
  if (!isPlainObject(payload)) return false;
  if (typeof payload.version !== 'string' || !payload.version.trim()) return false;
  if (!isPlainObject(payload.platforms)) return false;

  /** @type {unknown[]} */
  const stack = [payload];
  while (stack.length) {
    const node = stack.pop();
    if (!isPlainObject(node) && !Array.isArray(node)) continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    for (const [key, value] of Object.entries(node)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_KEYS.includes(lower)) return false;
      if (isPlainObject(value) || Array.isArray(value)) stack.push(value);
    }
  }
  return true;
}

/**
 * @param {string} url
 * @returns {boolean}
 */
export function isAllowlistedRemotePackUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'cogis.ai' &&
      parsed.pathname === '/packs/selectors.json' &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isStringMap(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((v) => typeof v === 'string');
}

/**
 * Relative lab path only — blocks absolute / protocol-relative retargets (B1).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSafeRelativeEndpointPath(value) {
  if (typeof value !== 'string' || !value) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return true;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isSafeRelativeEndpointMap(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((v) => {
    if (typeof v === 'string') return isSafeRelativeEndpointPath(v);
    if (Array.isArray(v)) return v.every((item) => isSafeRelativeEndpointPath(item));
    return false;
  });
}

/**
 * HTTPS URL/pattern whose host matches the local platform origin (B1).
 * Template tokens like `{id}` are substituted for parsing only.
 * @param {unknown} value
 * @param {string} localOrigin
 * @returns {boolean}
 */
export function isSameHostUrlPattern(value, localOrigin) {
  if (typeof value !== 'string' || !value || typeof localOrigin !== 'string') return false;
  try {
    const allowed = new URL(localOrigin);
    const normalized = value.replace(/\{[^}]+\}/g, 'x');
    const parsed = new URL(normalized);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === allowed.hostname &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/**
 * Validate remote platform overlays are data-only and cannot retarget lab traffic.
 * @param {unknown} platforms
 * @param {typeof localPack} [local]
 * @returns {boolean}
 */
export function isValidRemotePlatformOverlay(platforms, local = localPack) {
  if (!isPlainObject(platforms)) return false;
  if (!isPlainObject(local?.platforms)) return false;

  for (const [platformId, platform] of Object.entries(platforms)) {
    if (!isPlainObject(platform)) return false;
    const localPlatform = local.platforms[platformId];
    if (!isPlainObject(localPlatform) || typeof localPlatform.origin !== 'string') return false;

    for (const key of Object.keys(platform)) {
      if (!ALLOWED_PLATFORM_OVERLAY_KEYS.includes(key)) return false;
    }
    if ('selectors' in platform && !isStringMap(platform.selectors)) return false;
    if ('waitPredicates' in platform && !isStringMap(platform.waitPredicates)) return false;
    for (const urlKey of ['deepLinkPattern', 'prefillPattern', 'origin', 'loginUrl']) {
      if (urlKey in platform && !isSameHostUrlPattern(platform[urlKey], localPlatform.origin)) {
        return false;
      }
    }
    if ('endpoints' in platform && !isSafeRelativeEndpointMap(platform.endpoints)) return false;
  }
  return true;
}

/**
 * Deep-merge remote data-only overlays onto a clone of the local pack.
 * Behavior fields stay local; only selector / predicate / URL / endpoint strings overlay.
 * @param {typeof localPack} local
 * @param {{ version: string, platforms: Record<string, Record<string, unknown>> }} remote
 * @returns {typeof localPack}
 */
export function mergeSelectorPacks(local, remote) {
  const merged = structuredClone(local);
  merged.version = remote.version;

  for (const [platformId, overlay] of Object.entries(remote.platforms || {})) {
    if (!isPlainObject(merged.platforms?.[platformId]) || !isPlainObject(overlay)) continue;
    const target = merged.platforms[platformId];

    if (isStringMap(overlay.selectors)) {
      target.selectors = { ...(target.selectors || {}), ...overlay.selectors };
    }
    if (isStringMap(overlay.waitPredicates)) {
      target.waitPredicates = { ...(target.waitPredicates || {}), ...overlay.waitPredicates };
    }
    for (const urlKey of ['deepLinkPattern', 'prefillPattern', 'origin', 'loginUrl']) {
      if (
        typeof overlay[urlKey] === 'string' &&
        isSameHostUrlPattern(overlay[urlKey], target.origin)
      ) {
        target[urlKey] = overlay[urlKey];
      }
    }
    if (isSafeRelativeEndpointMap(overlay.endpoints)) {
      target.endpoints = { ...(target.endpoints || {}), ...overlay.endpoints };
    }
  }

  return merged;
}

/**
 * Parse + validate a remote JSON document. Returns null when fail-closed.
 * @param {string} text
 * @returns {{ version: string, platforms: Record<string, Record<string, unknown>> }|null}
 */
export function parseRemotePackText(text) {
  if (typeof text !== 'string') return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isDataOnlyPack(parsed)) return null;
  if (!isValidRemotePlatformOverlay(parsed.platforms, localPack)) return null;
  return /** @type {{ version: string, platforms: Record<string, Record<string, unknown>> }} */ (
    parsed
  );
}

/**
 * Manifest version + refresh diagnostics for M6 debug hooks.
 * @returns {SelectorPackStatus}
 */
export function getSelectorPackStatus() {
  return { ...status };
}

/**
 * Active pack (local, or local+remote merge after a successful refresh).
 * Synchronous and offline-safe — never throws; starts as the bundled local pack.
 * @returns {typeof localPack}
 */
export function loadSelectorPack() {
  return activePack;
}

/**
 * @param {string} platformId
 */
export function getPlatformSelectors(platformId) {
  const pack = loadSelectorPack();
  return pack.platforms?.[platformId] ?? null;
}

/**
 * Fail closed: restore the bundled local pack and record why refresh did not apply.
 * @param {string} errorCode
 */
function failClosedToLocal(errorCode) {
  activePack = structuredClone(localPack);
  status = {
    localVersion: String(localPack.version),
    activeVersion: String(localPack.version),
    source: 'local',
    remoteUrl: REMOTE_PACK_URL,
    lastRefreshAt: Date.now(),
    lastRefreshOk: false,
    lastErrorCode: errorCode,
  };
}

/**
 * Optional HTTPS fetch + merge from the allowlisted cogis.ai path.
 * Fail-closed: any network, timeout, parse, shape, or executable-key failure keeps the local pack.
 * Never evaluates remote strings as code and never loads remote modules.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   remoteUrl?: string,
 *   now?: () => number,
 *   timeoutMs?: number,
 * }} [options]
 * @returns {Promise<typeof localPack>}
 */
export async function refreshSelectorPack(options = {}) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const remoteUrl = options.remoteUrl ?? REMOTE_PACK_URL;
    const timeoutMs =
      typeof options.timeoutMs === 'number' && options.timeoutMs >= 0
        ? options.timeoutMs
        : REMOTE_PACK_FETCH_TIMEOUT_MS;

    if (!isAllowlistedRemotePackUrl(remoteUrl)) {
      failClosedToLocal('url_not_allowlisted');
      return activePack;
    }

    if (typeof fetchImpl !== 'function') {
      failClosedToLocal('fetch_unavailable');
      return activePack;
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response;
    try {
      const fetchPromise = fetchImpl(remoteUrl, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const timeoutPromise = new Promise((_, reject) => {
        const onAbort = () => {
          reject(Object.assign(new Error('selector pack fetch timeout'), { name: 'AbortError' }));
        };
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener('abort', onAbort, { once: true });
      });
      response = await Promise.race([fetchPromise, timeoutPromise]);
    } catch {
      failClosedToLocal(timedOut || controller.signal.aborted ? 'fetch_timeout' : 'fetch_failed');
      return activePack;
    } finally {
      clearTimeout(timer);
    }

    if (!response || !response.ok) {
      failClosedToLocal('http_error');
      return activePack;
    }

    let text;
    try {
      text = await response.text();
    } catch {
      failClosedToLocal('read_failed');
      return activePack;
    }

    const remote = parseRemotePackText(text);
    if (!remote) {
      // Covers invalid JSON, missing version, executable keys, and non-data overlays.
      let errorCode = 'malformed';
      try {
        const probe = JSON.parse(text);
        if (!isPlainObject(probe) || typeof probe.version !== 'string' || !probe.version.trim()) {
          errorCode = 'malformed';
        } else if (!isDataOnlyPack(probe)) {
          errorCode = 'rejected_exec';
        } else if (!isValidRemotePlatformOverlay(probe.platforms, localPack)) {
          errorCode = 'malformed';
        }
      } catch {
        errorCode = 'invalid_json';
      }
      failClosedToLocal(errorCode);
      return activePack;
    }

    activePack = mergeSelectorPacks(localPack, remote);
    status = {
      localVersion: String(localPack.version),
      activeVersion: String(activePack.version),
      source: 'merged',
      remoteUrl: REMOTE_PACK_URL,
      lastRefreshAt: options.now ? options.now() : Date.now(),
      lastRefreshOk: true,
      lastErrorCode: null,
    };
    return activePack;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/**
 * Test-only: restore bundled local pack and clear refresh state.
 */
export function resetSelectorPackForTests() {
  activePack = structuredClone(localPack);
  status = createInitialStatus();
  refreshInFlight = null;
}

export { localPack };

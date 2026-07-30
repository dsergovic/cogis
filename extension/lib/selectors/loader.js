import localPack from './local-pack.js';

/**
 * Allowlisted HTTPS URL for the optional remote data-only selector pack (M5).
 * Path is Tier 2; host must stay cogis.ai. Widening beyond data-only is an escalation.
 */
export const REMOTE_PACK_URL = 'https://cogis.ai/packs/selectors.json';

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
 * @param {unknown} value
 * @returns {boolean}
 */
function isEndpointMap(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every(
    (v) =>
      typeof v === 'string' || (Array.isArray(v) && v.every((item) => typeof item === 'string')),
  );
}

/**
 * Validate remote platform overlays are data-only string fields.
 * @param {unknown} platforms
 * @returns {boolean}
 */
export function isValidRemotePlatformOverlay(platforms) {
  if (!isPlainObject(platforms)) return false;
  for (const platform of Object.values(platforms)) {
    if (!isPlainObject(platform)) return false;
    for (const key of Object.keys(platform)) {
      if (!ALLOWED_PLATFORM_OVERLAY_KEYS.includes(key)) return false;
    }
    if ('selectors' in platform && !isStringMap(platform.selectors)) return false;
    if ('waitPredicates' in platform && !isStringMap(platform.waitPredicates)) return false;
    for (const urlKey of ['deepLinkPattern', 'prefillPattern', 'origin', 'loginUrl']) {
      if (urlKey in platform && typeof platform[urlKey] !== 'string') return false;
    }
    if ('endpoints' in platform && !isEndpointMap(platform.endpoints)) return false;
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
      if (typeof overlay[urlKey] === 'string') {
        target[urlKey] = overlay[urlKey];
      }
    }
    if (isEndpointMap(overlay.endpoints)) {
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
  if (!isValidRemotePlatformOverlay(parsed.platforms)) return null;
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
 * Fail-closed: any network, parse, shape, or executable-key failure keeps the local pack.
 * Never evaluates remote strings as code and never loads remote modules.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   remoteUrl?: string,
 *   now?: () => number,
 * }} [options]
 * @returns {Promise<typeof localPack>}
 */
export async function refreshSelectorPack(options = {}) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const remoteUrl = options.remoteUrl ?? REMOTE_PACK_URL;

    if (!isAllowlistedRemotePackUrl(remoteUrl)) {
      failClosedToLocal('url_not_allowlisted');
      return activePack;
    }

    if (typeof fetchImpl !== 'function') {
      failClosedToLocal('fetch_unavailable');
      return activePack;
    }

    let response;
    try {
      response = await fetchImpl(remoteUrl, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch {
      failClosedToLocal('fetch_failed');
      return activePack;
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
        } else if (!isValidRemotePlatformOverlay(probe.platforms)) {
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

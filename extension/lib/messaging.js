export const MSG = Object.freeze({
  SEARCH_REQUEST: 'SEARCH_REQUEST',
  SEARCH_CANCEL: 'SEARCH_CANCEL',
  SEARCH_RESULT_CHUNK: 'SEARCH_RESULT_CHUNK',
  SEARCH_PLATFORM_DONE: 'SEARCH_PLATFORM_DONE',
  CHATGPT_SEARCH: 'CHATGPT_SEARCH',
  CHATGPT_SEARCH_RESULT: 'CHATGPT_SEARCH_RESULT',
  CHATGPT_SEARCH_CANCEL: 'CHATGPT_SEARCH_CANCEL',
  PERPLEXITY_SEARCH: 'PERPLEXITY_SEARCH',
  PERPLEXITY_SEARCH_RESULT: 'PERPLEXITY_SEARCH_RESULT',
  PERPLEXITY_SEARCH_CANCEL: 'PERPLEXITY_SEARCH_CANCEL',
  CLAUDE_SEARCH: 'CLAUDE_SEARCH',
  CLAUDE_SEARCH_RESULT: 'CLAUDE_SEARCH_RESULT',
  CLAUDE_SEARCH_CANCEL: 'CLAUDE_SEARCH_CANCEL',
  GEMINI_SEARCH: 'GEMINI_SEARCH',
  GEMINI_SEARCH_RESULT: 'GEMINI_SEARCH_RESULT',
  GEMINI_SEARCH_CANCEL: 'GEMINI_SEARCH_CANCEL',
  /** Lightweight reachability probe before adopting an existing lab tab (SC-7). */
  COGIS_PING: 'COGIS_PING',
  /** M6 debug panel: request stats + pack status + ping prefs. */
  DEBUG_GET_SNAPSHOT: 'DEBUG_GET_SNAPSHOT',
  /** M6 debug panel: persist anonymous-ping opt-in (default off). */
  DEBUG_SET_PING_OPT_IN: 'DEBUG_SET_PING_OPT_IN',
  /** M6 debug panel: opt-in anonymous selector-failure ping for one platform. */
  DEBUG_SEND_PING: 'DEBUG_SEND_PING',
});

/** @typedef {'idle'|'loading'|'ready'|'empty'|'login_required'|'unavailable'|'timeout'} GroupStatus */

/**
 * @typedef {object} PointerRecord
 * @property {string} platform
 * @property {string} title
 * @property {string|null} dateIso
 * @property {string|null} deepLinkUrl
 * @property {boolean} prefillSupported
 */

/**
 * @param {{ requestId: string, query: string, platforms?: string[] }} input
 */
export function createSearchRequest(input) {
  if (!input || typeof input.requestId !== 'string' || !input.requestId) {
    throw new Error('SEARCH_REQUEST requires requestId');
  }
  if (typeof input.query !== 'string') {
    throw new Error('SEARCH_REQUEST requires query string');
  }
  return {
    type: MSG.SEARCH_REQUEST,
    requestId: input.requestId,
    query: input.query,
    platforms: Array.isArray(input.platforms)
      ? input.platforms
      : ['chatgpt', 'perplexity', 'claude', 'gemini'],
  };
}

/**
 * @param {{ requestId: string }} input
 */
export function createSearchCancel(input) {
  if (!input || typeof input.requestId !== 'string' || !input.requestId) {
    throw new Error('SEARCH_CANCEL requires requestId');
  }
  return {
    type: MSG.SEARCH_CANCEL,
    requestId: input.requestId,
  };
}

/**
 * @param {{
 *   requestId: string,
 *   platform: string,
 *   status: GroupStatus,
 *   capability?: string,
 *   results?: PointerRecord[],
 *   errorCode?: string,
 *   message?: string,
 *   loginUrl?: string,
 * }} input
 */
export function createResultChunk(input) {
  if (!input?.requestId || !input?.platform || !input?.status) {
    throw new Error('SEARCH_RESULT_CHUNK requires requestId, platform, status');
  }
  return {
    type: MSG.SEARCH_RESULT_CHUNK,
    requestId: input.requestId,
    platform: input.platform,
    status: input.status,
    capability: input.capability,
    results: Array.isArray(input.results) ? input.results : undefined,
    errorCode: input.errorCode,
    message: input.message,
    loginUrl: input.loginUrl,
  };
}

/**
 * @param {{ requestId: string, platform: string, status: GroupStatus }} input
 */
export function createPlatformDone(input) {
  if (!input?.requestId || !input?.platform || !input?.status) {
    throw new Error('SEARCH_PLATFORM_DONE requires requestId, platform, status');
  }
  return {
    type: MSG.SEARCH_PLATFORM_DONE,
    requestId: input.requestId,
    platform: input.platform,
    status: input.status,
  };
}

/**
 * True when a chunk should be applied to the UI for the active request.
 * @param {string|null|undefined} activeRequestId
 * @param {{ requestId?: string }} message
 */
export function shouldApplyChunk(activeRequestId, message) {
  if (!activeRequestId || !message?.requestId) return false;
  return activeRequestId === message.requestId;
}

/**
 * Trim query for submit rules. Returns null when empty/whitespace-only.
 * @param {string} raw
 * @returns {string|null}
 */
export function normalizeQuery(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length >= 1 ? trimmed : null;
}

/**
 * @param {{ pingOptIn: boolean }} input
 */
export function createDebugSetPingOptIn(input) {
  return {
    type: MSG.DEBUG_SET_PING_OPT_IN,
    pingOptIn: input?.pingOptIn === true,
  };
}

/**
 * @param {{ platformId: string }} input
 */
export function createDebugSendPing(input) {
  if (!input || typeof input.platformId !== 'string' || !input.platformId) {
    throw new Error('DEBUG_SEND_PING requires platformId');
  }
  return {
    type: MSG.DEBUG_SEND_PING,
    platformId: input.platformId,
  };
}

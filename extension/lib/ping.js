/**
 * Optional anonymous selector-failure ping (M6).
 *
 * Default **off**. Production endpoint URL is intentionally unset —
 * pointing any build at a production ping endpoint is a blueprint escalation.
 */

/** @type {null} */
export const PING_ENDPOINT_URL = null;

/** Opt-in preference default — must stay false. */
export const DEFAULT_PING_OPT_IN = false;

/**
 * Allowed payload keys only. Query text, titles, cookies, and bodies are never included.
 * @typedef {{
 *   platformId: string,
 *   selectorPackVersion: string,
 *   errorClass: string,
 *   extensionVersion?: string,
 * }} PingPayload
 */

/**
 * Build a privacy-safe ping payload. Extra fields (query, titles, etc.) are dropped.
 *
 * @param {{
 *   platformId: string,
 *   selectorPackVersion: string,
 *   errorClass: string,
 *   extensionVersion?: string,
 * }} input
 * @returns {PingPayload}
 */
export function buildPingPayload(input) {
  if (!input || typeof input.platformId !== 'string' || !input.platformId) {
    throw new Error('ping payload requires platformId');
  }
  if (typeof input.selectorPackVersion !== 'string' || !input.selectorPackVersion) {
    throw new Error('ping payload requires selectorPackVersion');
  }
  if (typeof input.errorClass !== 'string' || !input.errorClass) {
    throw new Error('ping payload requires errorClass');
  }

  /** @type {PingPayload} */
  const payload = {
    platformId: input.platformId,
    selectorPackVersion: input.selectorPackVersion,
    errorClass: input.errorClass,
  };

  if (typeof input.extensionVersion === 'string' && input.extensionVersion) {
    payload.extensionVersion = input.extensionVersion;
  }

  return payload;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPingOptInEnabled(value) {
  return value === true;
}

/**
 * Send the anonymous ping only when opted in **and** an endpoint URL is configured.
 * Default-off and unset endpoint produce zero network calls.
 *
 * @param {{
 *   optIn?: boolean,
 *   endpointUrl?: string|null,
 *   payload: PingPayload,
 *   fetchImpl?: typeof fetch,
 * }} options
 * @returns {Promise<{ sent: boolean, reason?: string, status?: number }>}
 */
export async function maybeSendAnonymousPing(options) {
  const optIn = isPingOptInEnabled(options?.optIn);
  const endpointUrl =
    typeof options?.endpointUrl === 'string' && options.endpointUrl.trim()
      ? options.endpointUrl.trim()
      : PING_ENDPOINT_URL;
  const fetchImpl = options?.fetchImpl ?? globalThis.fetch;

  if (!optIn) {
    return { sent: false, reason: 'opt_in_off' };
  }
  if (!endpointUrl || typeof endpointUrl !== 'string') {
    return { sent: false, reason: 'no_endpoint' };
  }
  if (typeof fetchImpl !== 'function') {
    return { sent: false, reason: 'no_fetch' };
  }

  const payload = buildPingPayload(options.payload);
  const res = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  return {
    sent: true,
    status: typeof res?.status === 'number' ? res.status : undefined,
  };
}

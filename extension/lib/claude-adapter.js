/**
 * Claude adapter.
 *
 * Live contract, verified 2026-08-21 against claude.ai with a logged-in
 * session (via Claude-in-Chrome network inspection — not the old blueprint's
 * assumption of title/preview-only search; that's no longer accurate):
 *
 *   1. GET /api/organizations
 *        -> array of orgs the account belongs to, each { uuid, name, ... }.
 *           A single account can have more than one org (e.g. a personal org
 *           and a workspace org) — conversations are scoped per org, so every
 *           org must be searched and the results merged.
 *   2. GET /api/organizations/{orgUuid}/conversation/search/v2
 *        ?query=<q>&n=25&target_snippet_size=100
 *        -> { data: [ { conversation: { uuid, name, updated_at, project_uuid,
 *           ... }, matched_snippet, title_matches } ], next_page_token }
 *
 * `target_snippet_size` and `matched_snippet` confirm this searches message
 * bodies, not just titles — capability is `full-text`. `project_uuid` shows
 * up inline on conversations that live inside a Project, so Project chats
 * are already covered by this one endpoint; no separate Projects
 * enumeration needed.
 *
 * Both calls are plain cookie-authenticated GETs (`credentials: 'include'`),
 * no bearer token step like ChatGPT. Runs from the background service
 * worker directly via `host_permissions` — no content script or tab needed.
 *
 * Auth mapping: 401 -> login_required. Other non-ok -> unavailable. Network
 * error/abort -> timeout. Generic S5-style mapping, no Claude-specific rule.
 */

import {
  anyDateToIso,
  stripForbiddenFields,
  pointerHasForbiddenFields,
  dedupePointers,
} from './results.js';
import { PLATFORM_TIMEOUT_MS, MAX_RESULTS_PER_PLATFORM } from './timeouts.js';

const ORIGIN = 'https://claude.ai';

/**
 * @param {string} uuid
 * @returns {string|null}
 */
export function claudeDeepLink(uuid) {
  if (typeof uuid !== 'string' || !uuid.trim()) return null;
  return `${ORIGIN}/chat/${encodeURIComponent(uuid.trim())}`;
}

/**
 * @param {Record<string, unknown>} raw one `data[]` entry from conversation/search/v2
 * @returns {import('./messaging.js').PointerRecord|null}
 */
export function normalizeClaudeHit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const safe = stripForbiddenFields(raw);
  const conversation =
    safe.conversation && typeof safe.conversation === 'object'
      ? stripForbiddenFields(safe.conversation)
      : null;
  if (!conversation) return null;

  const uuid = typeof conversation.uuid === 'string' ? conversation.uuid : null;
  const title =
    typeof conversation.name === 'string' && conversation.name.trim()
      ? conversation.name.trim()
      : null;
  if (!uuid || !title) return null;

  const pointer = {
    platform: 'claude',
    title,
    dateIso: anyDateToIso(conversation.updated_at),
    deepLinkUrl: claudeDeepLink(uuid),
    prefillSupported: false,
  };

  if (pointerHasForbiddenFields(pointer)) return null;
  return pointer;
}

/**
 * @param {string} orgUuid
 * @param {string} query
 * @param {AbortSignal} signal
 */
async function searchOrg(orgUuid, query, signal) {
  const url = `${ORIGIN}/api/organizations/${encodeURIComponent(orgUuid)}/conversation/search/v2?query=${encodeURIComponent(query)}&n=25&target_snippet_size=100`;
  const res = await fetch(url, { credentials: 'include', signal });
  if (!res.ok) {
    const err = new Error(`Claude org search failed (${res.status})`);
    err.code = res.status;
    throw err;
  }
  const payload = await res.json();
  return Array.isArray(payload?.data) ? payload.data : [];
}

/**
 * Run a Claude search across every org the account belongs to. Returns a
 * result descriptor the service worker turns into a SEARCH_RESULT_CHUNK —
 * never throws.
 * @param {string} query
 * @returns {Promise<{ status: import('./messaging.js').GroupStatus, results?: import('./messaging.js').PointerRecord[], message?: string, loginUrl?: string }>}
 */
export async function searchClaude(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLATFORM_TIMEOUT_MS);

  try {
    let orgs;
    try {
      const orgsRes = await fetch(`${ORIGIN}/api/organizations`, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (orgsRes.status === 401) {
        return { status: 'login_required', loginUrl: `${ORIGIN}/login` };
      }
      if (!orgsRes.ok) {
        return {
          status: 'unavailable',
          message: `Claude organizations lookup failed (${orgsRes.status}).`,
        };
      }
      orgs = await orgsRes.json();
    } catch (err) {
      if (err?.name === 'AbortError') return { status: 'timeout' };
      return { status: 'unavailable', message: 'Could not reach Claude.' };
    }

    const orgUuids = Array.isArray(orgs)
      ? orgs.map((o) => o?.uuid).filter((id) => typeof id === 'string' && id)
      : [];
    if (!orgUuids.length) {
      return { status: 'unavailable', message: 'No Claude organization found.' };
    }

    const outcomes = await Promise.allSettled(
      orgUuids.map((orgUuid) => searchOrg(orgUuid, query, controller.signal)),
    );

    const anyAuthFailure = outcomes.some((o) => o.status === 'rejected' && o.reason?.code === 401);
    const anyTimeout = outcomes.some(
      (o) => o.status === 'rejected' && o.reason?.name === 'AbortError',
    );
    const items = outcomes.flatMap((o) => (o.status === 'fulfilled' ? o.value : []));

    if (!items.length && outcomes.every((o) => o.status === 'rejected')) {
      if (anyAuthFailure) return { status: 'login_required', loginUrl: `${ORIGIN}/login` };
      if (anyTimeout) return { status: 'timeout' };
      return { status: 'unavailable', message: 'Could not reach Claude.' };
    }

    const pointers = dedupePointers(
      items.map(normalizeClaudeHit).filter(Boolean),
      MAX_RESULTS_PER_PLATFORM,
    );

    return { status: pointers.length ? 'ready' : 'empty', results: pointers };
  } finally {
    clearTimeout(timer);
  }
}

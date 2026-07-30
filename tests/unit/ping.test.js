import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_PING_OPT_IN,
  PING_ENDPOINT_URL,
  buildPingPayload,
  isPingOptInEnabled,
  maybeSendAnonymousPing,
} from '../../extension/lib/ping.js';

describe('anonymous ping defaults (M6)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ships opt-in default off and no production endpoint URL', () => {
    expect(DEFAULT_PING_OPT_IN).toBe(false);
    expect(PING_ENDPOINT_URL).toBeNull();
    expect(isPingOptInEnabled(undefined)).toBe(false);
    expect(isPingOptInEnabled(false)).toBe(false);
    expect(isPingOptInEnabled(true)).toBe(true);
  });

  it('when ping is off, makes zero network calls', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204 }));
    const result = await maybeSendAnonymousPing({
      optIn: false,
      endpointUrl: 'https://example.test/ping',
      payload: {
        platformId: 'chatgpt',
        selectorPackVersion: '1.3.0',
        errorClass: 'unavailable',
      },
      fetchImpl,
    });
    expect(result).toEqual({ sent: false, reason: 'opt_in_off' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.length).toBe(0);
  });

  it('when endpoint is unset (shipped default), makes zero network calls even if opted in', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204 }));
    const result = await maybeSendAnonymousPing({
      optIn: true,
      endpointUrl: PING_ENDPOINT_URL,
      payload: {
        platformId: 'claude',
        selectorPackVersion: '1.3.0',
        errorClass: 'adapter_error',
      },
      fetchImpl,
    });
    expect(result).toEqual({ sent: false, reason: 'no_endpoint' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('builds a payload with only allowed fields (drops query / titles)', () => {
    const payload = buildPingPayload({
      platformId: 'gemini',
      selectorPackVersion: '1.3.0',
      errorClass: 'history_rail_missing',
      extensionVersion: '0.6.0',
      // @ts-expect-error intentional junk fields
      query: 'secret recipe',
      titles: ['nope'],
      cookies: 'sid=1',
    });
    expect(payload).toEqual({
      platformId: 'gemini',
      selectorPackVersion: '1.3.0',
      errorClass: 'history_rail_missing',
      extensionVersion: '0.6.0',
    });
    expect(JSON.stringify(payload)).not.toMatch(/secret|recipe|nope|sid=/i);
  });

  it('sends only when opted in and endpoint is explicitly provided (test inject)', async () => {
    const fetchImpl = vi.fn(async () => ({ status: 204 }));
    const result = await maybeSendAnonymousPing({
      optIn: true,
      endpointUrl: 'https://example.test/cogis-ping',
      payload: {
        platformId: 'perplexity',
        selectorPackVersion: '1.3.0',
        errorClass: 'timeout',
      },
      fetchImpl,
    });
    expect(result.sent).toBe(true);
    expect(result.status).toBe(204);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/cogis-ping');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(['errorClass', 'platformId', 'selectorPackVersion']);
  });
});

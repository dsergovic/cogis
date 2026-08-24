import { describe, it, expect, vi } from 'vitest';
import { retryOnce } from '../../extension/lib/retry.js';

describe('retryOnce', () => {
  it('returns the result on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    await expect(retryOnce(fn, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries once after a transient failure and returns the second result', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('flaky')).mockResolvedValueOnce('ok');
    await expect(retryOnce(fn, 0)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('propagates the second failure if the retry also fails', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('still broken'));
    await expect(retryOnce(fn, 0)).rejects.toThrow('still broken');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('never retries an AbortError', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    const fn = vi.fn().mockRejectedValue(abortErr);
    await expect(retryOnce(fn, 0)).rejects.toThrow('aborted');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

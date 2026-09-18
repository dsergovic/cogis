import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHiddenTab, openTabFailureMessage } from '../../extension/lib/tab-messaging.js';

function mockChrome(create) {
  globalThis.chrome = {
    windows: { create, remove: vi.fn(() => Promise.resolve()) },
  };
}

afterEach(() => {
  delete globalThis.chrome;
});

describe('createHiddenTab', () => {
  it('opens an off-screen popup window when Chrome allows it', async () => {
    const create = vi.fn(async () => ({ id: 7, tabs: [{ id: 70 }] }));
    mockChrome(create);

    await expect(createHiddenTab('https://www.perplexity.ai/')).resolves.toEqual({
      tabId: 70,
      windowId: 7,
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ left: -32000, top: -32000, focused: false });
  });

  it('falls back to a minimized window when the off-screen bounds are rejected', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Invalid value for bounds. Bounds must be at least 50% within visible screen space.',
        ),
      )
      .mockResolvedValueOnce({ id: 8, tabs: [{ id: 80 }] });
    mockChrome(create);

    await expect(createHiddenTab('https://gemini.google.com/search')).resolves.toEqual({
      tabId: 80,
      windowId: 8,
    });
    const fallback = create.mock.calls[1][0];
    expect(fallback).toMatchObject({ state: 'minimized', focused: false });
    // Chrome refuses explicit bounds alongside a minimized state.
    expect(fallback).not.toHaveProperty('left');
    expect(fallback).not.toHaveProperty('width');
  });

  it('propagates the fallback error when both attempts fail', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('bounds rejected'))
      .mockRejectedValueOnce(new Error('No current window'));
    mockChrome(create);

    await expect(createHiddenTab('https://www.perplexity.ai/')).rejects.toThrow(
      'No current window',
    );
  });

  it('closes a window whose tab id never appeared', async () => {
    const create = vi.fn(async () => ({ id: 9, tabs: [] }));
    mockChrome(create);

    await expect(createHiddenTab('https://www.perplexity.ai/')).rejects.toThrow(
      'Could not open a hidden tab.',
    );
    expect(globalThis.chrome.windows.remove).toHaveBeenCalledWith(9);
  });
});

describe('openTabFailureMessage', () => {
  it("includes Chrome's reason when there is one", () => {
    expect(openTabFailureMessage('Gemini', new Error('No current window'))).toBe(
      'Could not open a Gemini tab (No current window).',
    );
  });

  it('falls back to the plain message', () => {
    expect(openTabFailureMessage('Perplexity', undefined)).toBe('Could not open a Perplexity tab.');
    expect(openTabFailureMessage('Perplexity', new Error('  '))).toBe(
      'Could not open a Perplexity tab.',
    );
  });
});

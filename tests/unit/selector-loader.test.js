import { describe, it, expect } from 'vitest';
import {
  loadSelectorPack,
  getPlatformSelectors,
  isDataOnlyPack,
} from '../../extension/lib/selectors/loader.js';

describe('selector loader', () => {
  it('loads local pack with chatgpt selectors and search endpoint', () => {
    const pack = loadSelectorPack();
    expect(pack.version).toBeTruthy();
    const chatgpt = getPlatformSelectors('chatgpt');
    expect(chatgpt.endpoints.search).toBe('/backend-api/conversations/search');
    expect(chatgpt.selectors.loginButton).toContain('login-button');
  });

  it('rejects executable-looking packs', () => {
    expect(isDataOnlyPack({ version: '1', script: 'alert(1)' })).toBe(false);
    expect(isDataOnlyPack({ version: '1', platforms: {} })).toBe(true);
  });
});

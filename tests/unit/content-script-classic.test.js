import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('classic content script wiring', () => {
  it('does not declare content_scripts type module', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
    for (const entry of manifest.content_scripts ?? []) {
      expect(entry.type).toBeUndefined();
    }
    expect(manifest.permissions ?? []).not.toContain('tabs');
  });

  it('ships chatgpt content script without top-level import/export', () => {
    const src = readFileSync(join(root, 'extension/content/chatgpt.js'), 'utf8');
    expect(src).toMatch(/^\s*\(function\s*\(/m);
    expect(src).not.toMatch(/^import\s/m);
    expect(src).not.toMatch(/^export\s/m);
    expect(src).toContain('CHATGPT_SEARCH_CANCEL');
    expect(src).toContain('AbortController');
  });
});

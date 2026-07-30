import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { groupClassName, nextCollapsedState } from '../../extension/lib/popup-collapse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('per-lab collapse (BL-020)', () => {
  it('toggles session-only collapsed state', () => {
    expect(nextCollapsedState(false)).toBe(true);
    expect(nextCollapsedState(true)).toBe(false);
  });

  it('preserves collapse across status class updates', () => {
    expect(groupClassName('loading', false)).toBe('cogis-group cogis-group--loading');
    expect(groupClassName('ready', true)).toBe(
      'cogis-group cogis-group--ready cogis-group--collapsed',
    );
    expect(groupClassName('empty', true)).toContain('cogis-group--collapsed');
  });

  it('popup wires a keyboard-focusable collapse control on each group header', () => {
    const html = readFileSync(join(root, 'extension/popup/popup.html'), 'utf8');
    const js = readFileSync(join(root, 'extension/popup/popup.js'), 'utf8');
    const css = readFileSync(join(root, 'extension/popup/popup.css'), 'utf8');

    expect(html.match(/data-cogis-collapse(?:\s|>)/g)?.length).toBe(4);
    expect(html.match(/data-cogis-collapsed=/g)?.length).toBe(4);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="cogis-body-chatgpt"');
    expect(js).toContain('nextCollapsedState');
    expect(js).toContain('applyGroupCollapsed');
    expect(js).not.toMatch(/chrome\.storage\.(local|sync)/);
    expect(css).toContain('.cogis-group--collapsed');
    expect(css).toContain('.cogis-collapse-btn:focus-visible');
  });
});

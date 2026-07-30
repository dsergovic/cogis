import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('sticky popup footer', () => {
  it('keeps results scrollable and footer pinned via CSS flex', () => {
    const css = readFileSync(join(root, 'extension/popup/popup.css'), 'utf8');
    const html = readFileSync(join(root, 'extension/popup/popup.html'), 'utf8');
    const js = readFileSync(join(root, 'extension/popup/popup.js'), 'utf8');

    expect(css).toMatch(/\.cogis-results\s*\{[^}]*overflow-y:\s*auto/s);
    expect(css).toMatch(/\.cogis-results\s*\{[^}]*min-height:\s*0/s);
    expect(css).toMatch(/\.cogis-results\s*\{[^}]*flex:\s*1\s+1\s+auto/s);
    expect(css).toMatch(/\.cogis-footer\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
    expect(css).toMatch(/\.cogis-shell\s*\{[^}]*overflow:\s*hidden/s);

    expect(html).toContain('Some AIs do not support full-text search.');
    expect(html).toContain('id="cogis-debug-link"');
    expect(js).toContain("chrome.runtime.getURL('debug/panel.html')");
  });

  it('lets platform groups keep their natural height instead of shrinking', () => {
    const css = readFileSync(join(root, 'extension/popup/popup.css'), 'utf8');

    expect(css).toMatch(/\.cogis-group\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
    expect(css).toMatch(/\.cogis-group--collapsed\s*\{[^}]*flex:\s*0\s+0\s+auto/s);
    expect(css).toMatch(/\.cogis-group--collapsed\s*\{[^}]*min-height:\s*0/s);
  });

  it('fills the side panel instead of pinning a fixed popup height', () => {
    const css = readFileSync(join(root, 'extension/popup/popup.css'), 'utf8');

    expect(css).toMatch(/html,\s*body\s*\{[^}]*height:\s*100%/s);
    expect(css).toMatch(/\bbody\s*\{[^}]*min-height:\s*100%/s);
    expect(css).toMatch(/\.cogis-shell\s*\{[^}]*height:\s*100%/s);
    expect(css).toMatch(/\.cogis-shell\s*\{[^}]*min-height:\s*0/s);

    expect(css).not.toMatch(/height:\s*520px/);
    expect(css).not.toMatch(/max-height:\s*600px/);
  });

  it('does not change search submit wiring for the footer layout', () => {
    const js = readFileSync(join(root, 'extension/popup/popup.js'), 'utf8');
    expect(js).toContain('createSearchRequest');
    expect(js).toContain("form?.addEventListener('submit'");
  });
});

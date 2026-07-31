import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectImportGraph, extractGetUrlResources, warCovers } from '../helpers/war-coverage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const extensionRoot = join(root, 'extension');

/**
 * @param {object} manifest
 * @param {string[]} hostGlobs
 */
function warResourcesForHosts(manifest, hostGlobs) {
  const entries = manifest.web_accessible_resources ?? [];
  return entries
    .filter((e) => hostGlobs.every((h) => (e.matches ?? []).includes(h)))
    .flatMap((e) => e.resources);
}

describe('web_accessible_resources coverage for content-script imports', () => {
  it('lists WAR entries matching chatgpt, perplexity, claude, and gemini hosts', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    expect(manifest.web_accessible_resources?.length).toBeGreaterThanOrEqual(4);

    const chatgptWar = warResourcesForHosts(manifest, [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
    ]);
    expect(chatgptWar.length).toBeGreaterThan(0);

    const perplexityWar = warResourcesForHosts(manifest, [
      'https://www.perplexity.ai/*',
      'https://perplexity.ai/*',
    ]);
    expect(perplexityWar.length).toBeGreaterThan(0);

    const claudeWar = warResourcesForHosts(manifest, ['https://claude.ai/*']);
    expect(claudeWar.length).toBeGreaterThan(0);

    const geminiWar = warResourcesForHosts(manifest, ['https://gemini.google.com/*']);
    expect(geminiWar.length).toBeGreaterThan(0);
  });

  it('covers every chrome.runtime.getURL target used by chatgpt content script', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
    ]);
    const cs = readFileSync(join(extensionRoot, 'content/chatgpt.js'), 'utf8');
    const getUrlPaths = extractGetUrlResources(cs);
    expect(getUrlPaths.length).toBeGreaterThan(0);
    for (const path of getUrlPaths) {
      expect(warCovers(warResources, path), `WAR missing getURL target: ${path}`).toBe(true);
    }
  });

  it('covers every chrome.runtime.getURL target used by perplexity content script', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, [
      'https://www.perplexity.ai/*',
      'https://perplexity.ai/*',
    ]);
    const cs = readFileSync(join(extensionRoot, 'content/perplexity.js'), 'utf8');
    const getUrlPaths = extractGetUrlResources(cs);
    expect(getUrlPaths.length).toBeGreaterThan(0);
    for (const path of getUrlPaths) {
      expect(warCovers(warResources, path), `WAR missing getURL target: ${path}`).toBe(true);
    }
  });

  it('covers every chrome.runtime.getURL target used by claude content script', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, ['https://claude.ai/*']);
    const cs = readFileSync(join(extensionRoot, 'content/claude.js'), 'utf8');
    const getUrlPaths = extractGetUrlResources(cs);
    expect(getUrlPaths.length).toBeGreaterThan(0);
    for (const path of getUrlPaths) {
      expect(warCovers(warResources, path), `WAR missing getURL target: ${path}`).toBe(true);
    }
  });

  it('covers the full static import graph of the chatgpt adapter entry', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, [
      'https://chatgpt.com/*',
      'https://chat.openai.com/*',
    ]);
    const graph = collectImportGraph(extensionRoot, 'lib/chatgpt-adapter.js');
    expect(graph).toContain('lib/chatgpt-adapter.js');
    expect(graph).toContain('lib/selectors/loader.js');
    expect(graph).toContain('lib/selectors/local-pack.js');
    for (const path of graph) {
      expect(warCovers(warResources, path), `WAR missing graph module: ${path}`).toBe(true);
    }
  });

  it('covers the full static import graph of the perplexity adapter entry', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, [
      'https://www.perplexity.ai/*',
      'https://perplexity.ai/*',
    ]);
    const graph = collectImportGraph(extensionRoot, 'lib/perplexity-adapter.js');
    expect(graph).toContain('lib/perplexity-adapter.js');
    expect(graph).toContain('lib/selectors/loader.js');
    expect(graph).toContain('lib/selectors/local-pack.js');
    for (const path of graph) {
      expect(warCovers(warResources, path), `WAR missing graph module: ${path}`).toBe(true);
    }
  });

  it('covers the full static import graph of the claude adapter entry', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, ['https://claude.ai/*']);
    const graph = collectImportGraph(extensionRoot, 'lib/claude-adapter.js');
    expect(graph).toContain('lib/claude-adapter.js');
    expect(graph).toContain('lib/selectors/loader.js');
    expect(graph).toContain('lib/selectors/local-pack.js');
    for (const path of graph) {
      expect(warCovers(warResources, path), `WAR missing graph module: ${path}`).toBe(true);
    }
  });

  it('covers every chrome.runtime.getURL target used by gemini content script', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, ['https://gemini.google.com/*']);
    const cs = readFileSync(join(extensionRoot, 'content/gemini.js'), 'utf8');
    const getUrlPaths = extractGetUrlResources(cs);
    expect(getUrlPaths.length).toBeGreaterThan(0);
    for (const path of getUrlPaths) {
      expect(warCovers(warResources, path), `WAR missing getURL target: ${path}`).toBe(true);
    }
  });

  it('covers the full static import graph of the gemini adapter entry', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = warResourcesForHosts(manifest, ['https://gemini.google.com/*']);
    const graph = collectImportGraph(extensionRoot, 'lib/gemini-adapter.js');
    expect(graph).toContain('lib/gemini-adapter.js');
    expect(graph).toContain('lib/readiness.js');
    expect(graph).toContain('lib/selectors/loader.js');
    expect(graph).toContain('lib/selectors/local-pack.js');
    for (const path of graph) {
      expect(warCovers(warResources, path), `WAR missing graph module: ${path}`).toBe(true);
    }
  });

  it('needs no WAR entry for the web bridge because its graph is a single file', () => {
    // The bridge is deliberately flat: the locked document_idle handshake
    // timing was observed against a single-file bridge, and the finding defers
    // the isolated-world module import graph. If anyone adds an import here,
    // this fails and the WAR block becomes mandatory before it can ship.
    const graph = collectImportGraph(extensionRoot, 'content/web-bridge.js');
    expect(graph).toEqual(['content/web-bridge.js']);

    const cs = readFileSync(join(extensionRoot, 'content/web-bridge.js'), 'utf8');
    expect(extractGetUrlResources(cs)).toEqual([]);

    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    expect(warResourcesForHosts(manifest, ['https://cogis.ai/*'])).toEqual([]);
  });

  it('fails closed when a getURL path would be uncovered (helper sanity)', () => {
    expect(warCovers(['lib/chatgpt-adapter.js'], 'lib/results.js')).toBe(false);
    expect(warCovers(['lib/*'], 'lib/results.js')).toBe(true);
  });
});

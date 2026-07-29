import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { collectImportGraph, extractGetUrlResources, warCovers } from '../helpers/war-coverage.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const extensionRoot = join(root, 'extension');

describe('web_accessible_resources coverage for content-script imports', () => {
  it('lists WAR entries matching chatgpt hosts', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    expect(manifest.web_accessible_resources?.length).toBeGreaterThan(0);
    const entry = manifest.web_accessible_resources[0];
    expect(entry.matches).toEqual(
      expect.arrayContaining(['https://chatgpt.com/*', 'https://chat.openai.com/*']),
    );
    expect(entry.resources.length).toBeGreaterThan(0);
  });

  it('covers every chrome.runtime.getURL target used by the content script', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = (manifest.web_accessible_resources ?? []).flatMap((e) => e.resources);
    const cs = readFileSync(join(extensionRoot, 'content/chatgpt.js'), 'utf8');
    const getUrlPaths = extractGetUrlResources(cs);
    expect(getUrlPaths.length).toBeGreaterThan(0);
    for (const path of getUrlPaths) {
      expect(warCovers(warResources, path), `WAR missing getURL target: ${path}`).toBe(true);
    }
  });

  it('covers the full static import graph of the shared adapter entry', () => {
    const manifest = JSON.parse(readFileSync(join(extensionRoot, 'manifest.json'), 'utf8'));
    const warResources = (manifest.web_accessible_resources ?? []).flatMap((e) => e.resources);
    const graph = collectImportGraph(extensionRoot, 'lib/chatgpt-adapter.js');
    expect(graph).toContain('lib/chatgpt-adapter.js');
    expect(graph).toContain('lib/selectors/loader.js');
    expect(graph).toContain('lib/selectors/local-pack.js');
    for (const path of graph) {
      expect(warCovers(warResources, path), `WAR missing graph module: ${path}`).toBe(true);
    }
  });

  it('fails closed when a getURL path would be uncovered (helper sanity)', () => {
    expect(warCovers(['lib/chatgpt-adapter.js'], 'lib/results.js')).toBe(false);
    expect(warCovers(['lib/*'], 'lib/results.js')).toBe(true);
  });
});

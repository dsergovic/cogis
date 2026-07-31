import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

/**
 * Collect relative import specifiers from an ES module file (static import/export).
 * @param {string} absFile
 * @returns {string[]}
 */
function readStaticImports(absFile) {
  const src = readFileSync(absFile, 'utf8');
  const out = [];
  const re = /(?:import\s+[^'"\n]+from\s+|import\s+|export\s+[^'"\n]+from\s+)['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    out.push(m[1]);
  }
  return out;
}

/**
 * Resolve a relative import to an absolute path (tries .js if bare).
 * @param {string} fromFile
 * @param {string} spec
 */
function resolveImport(fromFile, spec) {
  const base = join(dirname(fromFile), spec);
  if (existsSync(base)) return normalize(base);
  if (existsSync(`${base}.js`)) return normalize(`${base}.js`);
  if (existsSync(`${base}.json`)) return normalize(`${base}.json`);
  return normalize(base);
}

/**
 * Walk the static import graph from an extension-relative entry.
 * @param {string} extensionRoot
 * @param {string} entryRel e.g. lib/chatgpt-adapter.js
 * @returns {string[]} extension-relative posix-ish paths
 */
export function collectImportGraph(extensionRoot, entryRel) {
  const entryAbs = normalize(join(extensionRoot, entryRel));
  const seenAbs = new Set();
  const queue = [entryAbs];
  const relPaths = [];

  while (queue.length) {
    const abs = queue.shift();
    if (!abs || seenAbs.has(abs)) continue;
    seenAbs.add(abs);
    if (!existsSync(abs)) continue;

    const rel = abs
      .slice(normalize(extensionRoot).length)
      .replace(/^[/\\]/, '')
      .replace(/\\/g, '/');
    relPaths.push(rel);

    if (!abs.endsWith('.js')) continue;
    for (const spec of readStaticImports(abs)) {
      queue.push(resolveImport(abs, spec));
    }
  }

  return relPaths.sort();
}

/**
 * Extract chrome.runtime.getURL('...') string literals from source.
 * @param {string} source
 * @returns {string[]}
 */
export function extractGetUrlResources(source) {
  const out = [];
  const re = /chrome\.runtime\.getURL\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(source))) {
    out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

/**
 * True if a WAR resources pattern covers a concrete path.
 * Supports trailing /* directory wildcards and exact matches.
 * @param {string[]} patterns
 * @param {string} resourcePath
 */
export function warCovers(patterns, resourcePath) {
  const path = resourcePath.replace(/\\/g, '/');
  return patterns.some((pattern) => {
    const p = pattern.replace(/\\/g, '/');
    if (p === path) return true;
    if (p.endsWith('/*')) {
      const prefix = p.slice(0, -1); // keep trailing slash intent: "lib/" from "lib/*"
      const dir = p.slice(0, -2);
      return path === dir || path.startsWith(`${dir}/`) || path.startsWith(prefix);
    }
    if (p.includes('*')) {
      const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${esc}$`).test(path);
    }
    return false;
  });
}

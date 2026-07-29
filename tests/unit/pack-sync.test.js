import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import localPackJs from '../../extension/lib/selectors/local-pack.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('selector pack sync', () => {
  it('keeps local-pack.js identical to local-pack.json', () => {
    const json = JSON.parse(
      readFileSync(join(root, 'extension/lib/selectors/local-pack.json'), 'utf8'),
    );
    expect(localPackJs).toEqual(json);
  });
});

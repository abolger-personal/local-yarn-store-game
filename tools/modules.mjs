import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STORE = 'characters/store';

export function storeFiles(dir = STORE, ext = '.js') {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return e === 'node_modules' ? [] : storeFiles(p, ext);
    return p.endsWith(ext) ? [p] : [];
  });
}

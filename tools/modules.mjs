// Every store module, wherever it lives. The files are grouped into folders now, so nothing may
// assume a flat directory.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const STORE = 'characters/store';

export function storeFiles(dir = STORE) {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return storeFiles(p);
    return p.endsWith('.js') ? [p] : [];
  });
}

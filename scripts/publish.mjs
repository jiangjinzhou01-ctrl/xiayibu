import { cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
// The repository's existing Pages configuration publishes main/(root).
// Replace only generated assets; preserve source files and documentation.
await rm(new URL('assets/', root), { recursive: true, force: true });
await cp(fileURLToPath(dist), fileURLToPath(root), { recursive: true });

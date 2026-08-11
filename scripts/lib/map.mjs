import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * `docs-sync-map.json` read/write, plus the slug-adoption lookup that makes the map a cache
 * rather than the sole source of truth for page identity (Decision 1 — a lost/corrupt map is
 * self-healing via a REST slug probe, not a hard failure).
 */

const EMPTY_MAP = { version: 1, pages: {} };

/**
 * Reads `docs-sync-map.json`. Returns an empty (but valid) map if the file does not exist —
 * this is the expected first-run state (Decision 1's "revisit trigger" note).
 *
 * Note: there is no `parentPageId` field. `doc-page` is its own hierarchical custom post type
 * (REST base `/wp/v2/doc-page`, rewrite slug `docs` already baked into the post type itself) —
 * unlike the originally-planned `/wp/v2/pages` target, there is no synthetic "docs" parent Page
 * to resolve or create (see scripts/lib/wp.mjs).
 *
 * @param {string} mapPath
 * @returns {{version: number, pages: Record<string, {id: number, slug: string}>}}
 */
export function readMap(mapPath) {
  if (!existsSync(mapPath)) {
    return structuredClone(EMPTY_MAP);
  }
  const raw = readFileSync(mapPath, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    version: parsed.version ?? 1,
    pages: parsed.pages ?? {},
  };
}

/**
 * Writes `docs-sync-map.json` with sorted keys and a trailing newline, for stable diffs
 * (Data contracts, architect-plan-docs-sync-script-stage1.md).
 *
 * @param {string} mapPath
 * @param {{version: number, pages: Record<string, {id: number, slug: string}>}} map
 */
export function writeMap(mapPath, map) {
  const sortedPages = {};
  for (const key of Object.keys(map.pages).sort()) {
    sortedPages[key] = map.pages[key];
  }
  const out = {
    version: map.version ?? 1,
    pages: sortedPages,
  };
  writeFileSync(mapPath, JSON.stringify(out, null, 2) + '\n');
}

/**
 * Looks up (or records) the page ID for `file` in the in-memory map object. Entries are never
 * deleted here — a file dropped from index.md keeps its map entry so the draft-on-removal pass
 * (Task 3.4) can find it on every subsequent run.
 *
 * @param {object} map
 * @param {string} file
 * @returns {{id: number, slug: string}|undefined}
 */
export function getMapEntry(map, file) {
  return map.pages[file];
}

/**
 * @param {object} map
 * @param {string} file
 * @param {{id: number, slug: string}} entry
 */
export function setMapEntry(map, file, entry) {
  map.pages[file] = entry;
}

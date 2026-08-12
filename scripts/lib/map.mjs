import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/**
 * `docs-sync-map.json` read/write, plus the slug-adoption lookup that makes the map a cache
 * rather than the sole source of truth for page identity (Decision 1 — a lost/corrupt map is
 * self-healing via a REST slug probe, not a hard failure).
 *
 * Site-scoped `version: 2` format (Decision 3, architect-plan-docs-fixtures-and-ci-pipeline.md):
 * the on-disk file is keyed by exact base URL under `sites`, e.g.
 *
 *   {
 *     "version": 2,
 *     "sites": {
 *       "http://starter-kit.loc": {
 *         "pages": { "usage.md": { "id": 50, "slug": "usage" } }
 *       }
 *     }
 *   }
 *
 * so a CI run targeting a different WordPress install never sees — and never overwrites — post
 * IDs that belong to another site. `readMap()`/`writeMap()` are the only functions aware of this
 * on-disk shape; everything downstream (`getMapEntry`, `setMapEntry`, every `wp.mjs` call site)
 * keeps working against the same flat in-memory `{version, pages}` shape as before.
 */

const EMPTY_MAP = { version: 2, pages: {} };

/**
 * Reads `docs-sync-map.json` and returns the in-memory map for one site (`baseUrl`, used exactly
 * as `readEnvCredentials()` normalizes it — trailing slashes stripped, scheme included, no case
 * folding). Returns an empty (but valid) map if the file does not exist, or if the file exists
 * but has no entry for `baseUrl` — both are safe: every file then goes through slug adoption and
 * adopts the target site's real posts (`wp.mjs`'s `syncPage()`).
 *
 * Throws if the file is still in the pre-Decision-3 `version: 1` flat shape — that shape has no
 * site key, so silently guessing which site it describes is exactly the failure mode this format
 * exists to prevent.
 *
 * @param {string} mapPath
 * @param {string} baseUrl
 * @returns {{version: number, pages: Record<string, {id: number, slug: string}>}}
 */
export function readMap(mapPath, baseUrl) {
  if (!existsSync(mapPath)) {
    return structuredClone(EMPTY_MAP);
  }
  const raw = readFileSync(mapPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (parsed.version === 1) {
    throw new Error(
      `map: ${mapPath} is a version 1 (single-site) map, which is unsafe to run from CI. ` +
        'Migrate it by hand into the version 2 site-scoped shape ' +
        '({"version":2,"sites":{"<baseUrl>":{"pages":{...}}}}) before running against any site.'
    );
  }
  if (parsed.version !== 2) {
    throw new Error(`map: ${mapPath} has an unrecognized version (${JSON.stringify(parsed.version)}).`);
  }

  const sitePages = parsed.sites?.[baseUrl]?.pages ?? {};
  return { version: 2, pages: sitePages };
}

/**
 * Writes `docs-sync-map.json`, merging `map.pages` into `sites[baseUrl].pages` and leaving every
 * other site's entries untouched. Keys sorted at both the site level and the page level, with a
 * trailing newline, for stable diffs (Data contracts, architect-plan-docs-sync-script-stage1.md).
 *
 * @param {string} mapPath
 * @param {string} baseUrl
 * @param {{version: number, pages: Record<string, {id: number, slug: string}>}} map
 */
export function writeMap(mapPath, baseUrl, map) {
  let existingSites = {};
  if (existsSync(mapPath)) {
    const raw = readFileSync(mapPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed.version === 1) {
      throw new Error(
        `map: ${mapPath} is a version 1 (single-site) map, which is unsafe to run from CI. ` +
          'Migrate it by hand into the version 2 site-scoped shape ' +
          '({"version":2,"sites":{"<baseUrl>":{"pages":{...}}}}) before running against any site.'
      );
    }
    existingSites = parsed.sites ?? {};
  }

  const sortedPages = {};
  for (const key of Object.keys(map.pages).sort()) {
    sortedPages[key] = map.pages[key];
  }

  const mergedSites = { ...existingSites, [baseUrl]: { pages: sortedPages } };
  const sortedSites = {};
  for (const key of Object.keys(mergedSites).sort()) {
    sortedSites[key] = mergedSites[key];
  }

  const out = { version: 2, sites: sortedSites };
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

import { getMapEntry, setMapEntry } from './map.mjs';

/**
 * REST namespace the `doc-page` CPT is registered under (`starter-kit-addon`'s `DocPage`
 * post type registration, `rest_namespace => SK_REST_API_NS`, `skt/v1`) — the theme's own
 * already-whitelisted namespace, not core's `wp/v2`. See the module docblock below.
 */
const DOC_PAGE_NAMESPACE = 'skt/v1';

/**
 * REST client + publishing logic (Tasks 3.2-3.4).
 *
 * Target: `/skt/v1/doc-page`, NOT `/wp/v2/pages` and no longer `/wp/v2/doc-page` either.
 *
 * `starter-kit.loc` already publishes these docs as a custom post type, `doc-page` (registered
 * by the `starter-kit-addon` plugin; rewrite slug `docs`; hierarchical; `has_archive: false`).
 * Publishing to `/wp/v2/pages` instead — the original Task 3.2 design — would create a second,
 * colliding set of posts at the same `/docs/<slug>/` URLs, since a Page's own parent/child slug
 * resolution would produce identical permalinks. That was caught before any live write happened;
 * see `.claude/plans/architect-plan-docs-sync-script-stage1.md`'s "Update 2026-08-10 (later same
 * day)" section for the full investigation.
 *
 * The namespace moved from `wp/v2` to `skt/v1` (`starter-kit-addon`'s `docs-publisher-role`
 * plan) because the theme's REST API whitelist (`RestApiFilter.php`) only ever admits its own
 * namespace, `skt/v1` — `/wp/v2/doc-page` can never be whitelisted itself. Registering `doc-page`
 * under `skt/v1` instead means the CI publishing identity (`docs-publisher` role) no longer needs
 * the core `edit_pages` capability (which would also grant it every other `wp/v2` route, including
 * `/wp/v2/pages` and `/wp/v2/users`) just to pass the whitelist. See that plan for the full
 * capability design.
 *
 * No synthetic "docs" parent page/post is resolved or created here. `doc-page`'s rewrite slug
 * (`docs`) is baked into the post type registration itself — confirmed via
 * `wp eval 'print_r(get_post_type_object("doc-page"));'` (`rewrite.slug === "docs"`). Checking
 * `post_parent` across all 17 live `doc-page` posts
 * (`wp post list --post_type=doc-page --fields=ID,post_name,post_parent`) shows most are
 * top-level (`post_parent = 0`), but two are NOT: `advanced-installation-options` and
 * `platform-notes` both have `post_parent` set to `installation`'s ID. This is real, existing
 * content structure that this flat, single-level `index.md` manifest has no way to express or
 * derive. Rather than guess a policy and silently flatten (or otherwise rewrite) that hierarchy,
 * this module never sends a `parent` field at all — publishing only touches `title`, `content`,
 * `slug`, `menu_order`, and `status`. Reconciling `doc-page` parent/child structure with the
 * manifest, if desired, is a follow-up design decision, not something to guess here.
 */

/**
 * Reads and validates the three required env vars. Throws a clear, password-free error if any
 * is missing.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{baseUrl: string, user: string, appPassword: string}}
 */
export function readEnvCredentials(env = process.env) {
  const baseUrl = env.WP_BASE_URL;
  const user = env.WP_USER;
  const appPassword = env.WP_APP_PASSWORD;

  const missing = [];
  if (!baseUrl) missing.push('WP_BASE_URL');
  if (!user) missing.push('WP_USER');
  if (!appPassword) missing.push('WP_APP_PASSWORD');

  if (missing.length) {
    throw new Error(
      `wp: missing required environment variable(s): ${missing.join(', ')}. ` +
        'Set WP_BASE_URL, WP_USER and WP_APP_PASSWORD before running a live sync.'
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ''), user, appPassword };
}

/**
 * Builds a minimal REST client: Basic auth from the three env vars, `Accept: application/json`
 * on every request, and non-2xx responses surfaced as thrown `Error`s with a status code and
 * WordPress's own error message — never the password.
 *
 * @param {{baseUrl: string, user: string, appPassword: string}} credentials
 */
export function createWpClient({ baseUrl, user, appPassword }) {
  const authHeader = 'Basic ' + Buffer.from(`${user}:${appPassword.replace(/\s+/g, '')}`).toString('base64');

  /**
   * Namespace-agnostic request: `pathUnderWpJson` is everything after `/wp-json/`, so it can
   * target any REST namespace (`wp/v2/...`, `skt/v1/...`), not just the `doc-page` publishing
   * routes. `request()` below is a thin `DOC_PAGE_NAMESPACE`-prefixing wrapper over this for the
   * existing `doc-page` call sites, which keeps their behaviour and URLs identical.
   */
  async function requestPath(pathUnderWpJson, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch(`${baseUrl}/wp-json/${pathUnderWpJson}`, {
        method,
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (cause) {
      throw new Error(
        `wp: could not reach ${baseUrl} (${cause.message}) — check WP_BASE_URL and the runner's network access`,
        { cause }
      );
    }

    if (res.status === 401) {
      throw new Error('wp: 401 Unauthorized — check WP_USER / WP_APP_PASSWORD');
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      // Non-JSON response body; fall through to the status-code check below.
    }

    if (res.status < 200 || res.status >= 300) {
      const message = json?.message || res.statusText;
      const code = json?.code ? ` ${json.code}` : '';
      throw new Error(`wp: ${res.status}${code}: ${message}`);
    }

    return json;
  }

  async function request(pathAndQuery, opts) {
    return requestPath(`${DOC_PAGE_NAMESPACE}/${pathAndQuery}`, opts);
  }

  return { request, requestPath };
}

/**
 * Finds an existing `doc-page` post by slug (any status), for slug-adoption (Decision 1 /
 * Task 3.1) — used when the map has no entry for a file, before creating a new post, so a
 * lost/corrupt map self-heals instead of creating a duplicate. No `parent` filter: `doc-page`
 * slugs are expected to be unique site-wide regardless of hierarchy position.
 *
 * @param {{request: Function}} client
 * @param {{slug: string}} args
 * @returns {Promise<object|null>}
 */
export async function findPageBySlug(client, { slug }) {
  const found = await client.request(`doc-page?slug=${encodeURIComponent(slug)}&status=any&context=edit`);
  return Array.isArray(found) && found.length > 0 ? found[0] : null;
}

/**
 * Publishes (creates or updates) one `doc-page` post per the manifest entry, or reports
 * `unchanged` if the generated markup, title, status and slug all already match the live post.
 * Only `title`, `content`, `slug`, `menu_order`, and `status: "publish"` are ever sent — no
 * `parent` (see this module's header note) and nothing else (source plan's out-of-scope list —
 * no meta, no SEO fields).
 *
 * `title` now comes from `convertFile()`'s captured `# heading` text (the file's own title), not
 * from the manifest — see `convert.mjs` and `manifest.mjs`'s `tocTitle` field. A missing/empty
 * `title` is treated as a caller bug and reported as `failed`, never silently published: a stale
 * read of `manifestEntry.tocTitle` (renamed away, per Decision 3) would otherwise send no `title`
 * key at all (`JSON.stringify` drops `undefined`), and WordPress would leave the old title
 * untouched with no error anywhere.
 *
 * @param {{request: Function}} client
 * @param {object} map
 * @param {{file: string, slug: string, title: string, order: number, html: string}} entry
 * @returns {Promise<{file: string, slug: string, id: number|null, action: string, error: string|null}>}
 */
export async function syncPage(client, map, entry) {
  const { file, slug: manifestSlug, title, order, html } = entry;

  if (typeof title !== 'string' || title === '') {
    return { file, slug: manifestSlug, id: getMapEntry(map, file)?.id ?? null, action: 'failed', error: `wp: ${file}: missing or empty title` };
  }

  try {
    let mapEntry = getMapEntry(map, file);

    if (!mapEntry) {
      const adopted = await findPageBySlug(client, { slug: manifestSlug });
      if (adopted) {
        mapEntry = { id: adopted.id, slug: manifestSlug };
        setMapEntry(map, file, mapEntry);
      }
    }

    // Use the map's own slug when one is already known, so a page's slug only ever changes when
    // the manifest-derived value actually changes — not spuriously on every run. Slugs derive
    // from the filename only (`file.slice(0, -3)`, see manifest.mjs), never from a title, so a
    // title edit alone never changes a slug. Only a brand-new page (no map entry yet) uses the
    // manifest-derived slug directly.
    const slug = mapEntry ? mapEntry.slug : manifestSlug;

    const payload = {
      title,
      content: html,
      slug,
      menu_order: order,
      status: 'publish',
    };

    if (!mapEntry) {
      const created = await client.request('doc-page', { method: 'POST', body: payload });
      setMapEntry(map, file, { id: created.id, slug });
      return { file, slug, id: created.id, action: 'created', error: null };
    }

    const live = await client.request(`doc-page/${mapEntry.id}?context=edit`);
    const liveContent = live?.content?.raw ?? '';
    // `title.raw` is only present when the request uses `?context=edit` (as above); treat it as
    // absent — i.e. "differs" — never as "matches", so a missing field never masquerades as an
    // unchanged title (Decision 5/R2: without this comparison, every page whose body markup is
    // unchanged would report `unchanged` and its corrected title would never actually publish).
    if (
      liveContent === html &&
      live?.status === 'publish' &&
      live?.slug === slug &&
      live?.menu_order === order &&
      live?.title?.raw === title
    ) {
      return { file, slug, id: mapEntry.id, action: 'unchanged', error: null };
    }

    const updated = await client.request(`doc-page/${mapEntry.id}`, { method: 'POST', body: payload });
    setMapEntry(map, file, { id: updated.id, slug });
    return { file, slug, id: updated.id, action: 'updated', error: null };
  } catch (err) {
    return { file, slug: manifestSlug, id: getMapEntry(map, file)?.id ?? null, action: 'failed', error: err.message };
  }
}

/**
 * Sets every map entry whose file is no longer present in the current manifest to
 * `status: "draft"` (never trashed, never deleted, map entry always retained) — Task 3.4.
 *
 * @param {{request: Function}} client
 * @param {object} map
 * @param {Set<string>} manifestFiles Files currently listed in index.md.
 * @returns {Promise<{file: string, slug: string, id: number, action: string, error: string|null}[]>}
 */
export async function draftRemovedPages(client, map, manifestFiles) {
  const results = [];
  for (const [file, mapEntry] of Object.entries(map.pages)) {
    if (manifestFiles.has(file)) continue;
    try {
      await client.request(`doc-page/${mapEntry.id}`, {
        method: 'POST',
        body: { status: 'draft' },
      });
      results.push({ file, slug: mapEntry.slug, id: mapEntry.id, action: 'drafted', error: null });
    } catch (err) {
      results.push({ file, slug: mapEntry.slug, id: mapEntry.id, action: 'failed', error: err.message });
    }
  }
  return results;
}

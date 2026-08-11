import { getMapEntry, setMapEntry } from './map.mjs';

/**
 * REST client + publishing logic (Tasks 3.2-3.4).
 *
 * Target: `/wp/v2/doc-page`, NOT `/wp/v2/pages`.
 *
 * `starter-kit.loc` already publishes these docs (17 of 18 at the time this was corrected) as a
 * custom post type, `doc-page` (registered by the `starter-kit-addon` plugin; REST base
 * `/wp/v2/doc-page`; rewrite slug `docs`; hierarchical; `has_archive: false`). Publishing to
 * `/wp/v2/pages` instead — the original Task 3.2 design — would create a second, colliding set
 * of posts at the same `/docs/<slug>/` URLs, since a Page's own parent/child slug resolution
 * would produce identical permalinks. That was caught before any live write happened; see
 * `.claude/plans/architect-plan-docs-sync-script-stage1.md`'s "Update 2026-08-10 (later same
 * day)" section for the full investigation.
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
   * routes. `request()` below is a thin `wp/v2/`-prefixing wrapper over this for the existing
   * `doc-page` call sites, which keeps their behaviour and URLs identical.
   */
  async function requestPath(pathUnderWpJson, { method = 'GET', body } = {}) {
    const res = await fetch(`${baseUrl}/wp-json/${pathUnderWpJson}`, {
      method,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

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
    return requestPath(`wp/v2/${pathAndQuery}`, opts);
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
 * `unchanged` if the generated markup already matches the live `content.raw`. Only `title`,
 * `content`, `slug`, `menu_order`, and `status: "publish"` are ever sent — no `parent` (see this
 * module's header note) and nothing else (source plan's out-of-scope list — no meta, no SEO
 * fields).
 *
 * @param {{request: Function}} client
 * @param {object} map
 * @param {{file: string, slug: string, title: string, order: number, html: string}} entry
 * @returns {Promise<{file: string, slug: string, id: number|null, action: string, error: string|null}>}
 */
export async function syncPage(client, map, entry) {
  const { file, slug: manifestSlug, title, order, html } = entry;

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
    // the manifest-derived value actually changes (e.g. a title edit) — not spuriously on every
    // run. Only a brand-new page (no map entry yet) uses the manifest-derived slug directly.
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
    if (liveContent === html && live?.status === 'publish' && live?.slug === slug && live?.menu_order === order) {
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

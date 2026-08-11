/**
 * Client for the WordPress-side `POST /wp-json/skt/v1/serialize-blocks` endpoint
 * (implemented by `starter-kit-addon`'s `BlockTreeSerializer`, but registered under the theme's
 * own REST namespace `skt/v1` rather than the addon's `ska/v1`).
 *
 * The endpoint owns **all** outer serialization mechanics: block-comment delimiters, core
 * namespace stripping, `attrs` JSON encoding, `wp_kses_post()`, and — critically — the `"\n\n"`
 * glue placed between sibling blocks at every nesting level. Callers build a plain node tree
 * (`{blockName, attrs, innerBlocks, innerHTML}`, see `blocks.mjs`) and must never insert `"\n\n"`
 * themselves; the endpoint is the sole owner of that glue.
 */

/**
 * Serializes a document's array of block nodes into the canonical `post_content` markup string.
 *
 * @param {{requestPath: Function}} client A client built by `createWpClient()` (`wp.mjs`).
 * @param {object[]} blocks Top-level block nodes for one document, as returned by
 *   `convertFile()`'s `blocks` array.
 * @returns {Promise<string>} The serialized markup (`response.markup`).
 */
export async function serializeBlocks(client, blocks) {
  const response = await client.requestPath('skt/v1/serialize-blocks', {
    method: 'POST',
    body: { blocks },
  });

  if (!response || typeof response.markup !== 'string') {
    throw new Error(
      'serialize: skt/v1/serialize-blocks returned no "markup" string in its response'
    );
  }

  return response.markup;
}

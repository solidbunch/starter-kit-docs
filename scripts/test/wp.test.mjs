import { test } from 'node:test';
import assert from 'node:assert/strict';

import { syncPage } from '../lib/wp.mjs';

/**
 * Builds a stubbed `client` whose `request()` returns a fixed `live` doc-page response for the
 * `GET doc-page/<id>?context=edit` call, and records every request made (for assertions on
 * whether an update call actually fired).
 */
function stubClient(liveResponse) {
  const calls = [];
  return {
    calls,
    request: async (pathAndQuery, opts) => {
      calls.push({ pathAndQuery, opts });
      if (pathAndQuery.startsWith('doc-page/') && pathAndQuery.includes('context=edit')) {
        return liveResponse;
      }
      // Any POST (update) — echo back an id.
      return { id: 42 };
    },
  };
}

function baseMap() {
  return { version: 2, pages: { 'example.md': { id: 42, slug: 'example' } } };
}

function baseEntry(overrides = {}) {
  return {
    file: 'example.md',
    slug: 'example',
    title: 'Example',
    order: 1,
    html: '<!-- wp:paragraph --><p>hi</p><!-- /wp:paragraph -->',
    ...overrides,
  };
}

test('identical content, differing title.raw -> updated', async () => {
  const client = stubClient({
    status: 'publish',
    slug: 'example',
    menu_order: 1,
    title: { raw: 'Old Title' },
    content: { raw: '<!-- wp:paragraph --><p>hi</p><!-- /wp:paragraph -->' },
  });
  const result = await syncPage(client, baseMap(), baseEntry({ title: 'Example' }));
  assert.equal(result.action, 'updated');
});

test('identical content, identical title.raw -> unchanged', async () => {
  const client = stubClient({
    status: 'publish',
    slug: 'example',
    menu_order: 1,
    title: { raw: 'Example' },
    content: { raw: '<!-- wp:paragraph --><p>hi</p><!-- /wp:paragraph -->' },
  });
  const result = await syncPage(client, baseMap(), baseEntry({ title: 'Example' }));
  assert.equal(result.action, 'unchanged');
});

test('missing live.title.raw is treated as "differs" -> updated, never unchanged', async () => {
  const client = stubClient({
    status: 'publish',
    slug: 'example',
    menu_order: 1,
    // No `title` field at all in the live response.
    content: { raw: '<!-- wp:paragraph --><p>hi</p><!-- /wp:paragraph -->' },
  });
  const result = await syncPage(client, baseMap(), baseEntry({ title: 'Example' }));
  assert.equal(result.action, 'updated');
});

test('title: "" -> failed, naming the file, no request made', async () => {
  const client = stubClient({});
  const result = await syncPage(client, baseMap(), baseEntry({ title: '' }));
  assert.equal(result.action, 'failed');
  assert.match(result.error, /example\.md/);
  assert.equal(client.calls.length, 0);
});

test('title: undefined -> failed, naming the file, no request made', async () => {
  const client = stubClient({});
  const entry = baseEntry();
  delete entry.title;
  const result = await syncPage(client, baseMap(), entry);
  assert.equal(result.action, 'failed');
  assert.match(result.error, /example\.md/);
  assert.equal(client.calls.length, 0);
});

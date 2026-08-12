import { test } from 'node:test';
import assert from 'node:assert/strict';

import { paragraph, heading, listSection, listItem, code, quote, table, separator, embed } from '../lib/blocks.mjs';

// Every builder returns a `{blockName, attrs, innerBlocks, innerHTML}` node object — the JSON
// shape consumed by the `POST /wp-json/skt/v1/serialize-blocks` endpoint. These tests assert
// node shape by deep-equality, not markup-string matching: byte-shape verification now happens
// against `npm run sync:dry`'s live diff, not offline. The content examples below are kept
// identical to the pre-migration string-emitting tests so the innerHTML strings stay tied to
// real content captured 2026-08-10 from the live doc-page post_content on starter-kit.loc (the
// `installation`, `usage` and `overview` pages) — the live site and the skt/v1/serialize-blocks
// endpoint are the authority.

// --- paragraph() ---------------------------------------------------------------------------

test('paragraph() returns a core/paragraph node with a bare <p>, no class', () => {
  const node = paragraph(
    '<code>environment_type</code> if omitted, defaults to <code>local</code>, it must match a file in <code>config/environment/.env.type.*</code>'
  );
  assert.deepEqual(node, {
    blockName: 'core/paragraph',
    attrs: {},
    innerBlocks: [],
    innerHTML:
      '\n<p><code>environment_type</code> if omitted, defaults to <code>local</code>, it must match a file in <code>config/environment/.env.type.*</code></p>\n',
  });
});

// --- heading(): fully-qualified name, level-2 default omission -----------------------------

test('heading() level 1 uses fully-qualified blockName and non-empty attrs', () => {
  const node = heading(1, 'Heading Level 1');
  assert.deepEqual(node, {
    blockName: 'starter-kit/heading',
    attrs: { level: 1 },
    innerBlocks: [],
    innerHTML: '\n<h1>Heading Level 1</h1>\n',
  });
});

test('heading() level 2 omits the level attribute (block.json default)', () => {
  const node = heading(2, 'Heading Level 2');
  assert.deepEqual(node.attrs, {});
  assert.deepEqual(node, {
    blockName: 'starter-kit/heading',
    attrs: {},
    innerBlocks: [],
    innerHTML: '\n<h2>Heading Level 2</h2>\n',
  });
});

test('heading() level 3 emits the level attribute', () => {
  const node = heading(3, 'Heading Level 3');
  assert.deepEqual(node.attrs, { level: 3 });
  assert.deepEqual(node, {
    blockName: 'starter-kit/heading',
    attrs: { level: 3 },
    innerBlocks: [],
    innerHTML: '\n<h3>Heading Level 3</h3>\n',
  });
});

// --- listSection()/listItem(): core/list, ul (no ordered) vs ol (ordered:true) -------------

test('listSection()/listItem() ul has no ordered key and holds child nodes in innerBlocks', () => {
  const items = [
    listItem(
      '<code>.env.main</code> – shared base config, edit <code>APP_NAME</code> and <code>APP_TITLE</code>'
    ),
    listItem(
      '<code>.env.type.local</code>, <code>.env.type.dev</code>, <code>.env.type.stage</code>, <code>.env.type.prod</code> – environment-specific overrides, edit <code>APP_DOMAIN</code> variable.'
    ),
    listItem(
      'You can create as many <code>.env.type.*</code> files as needed (<code>.env.type.qa</code>, <code>.env.type.stage2</code>, etc.)'
    ),
  ];
  const node = listSection('ul', items);
  assert.ok(!Object.prototype.hasOwnProperty.call(node.attrs, 'ordered'));
  assert.deepEqual(node, {
    blockName: 'core/list',
    attrs: {},
    innerBlocks: items,
    innerHTML: '\n<ul class="wp-block-list"></ul>\n',
  });
});

test('listSection()/listItem() ol carries ordered:true and holds child nodes in innerBlocks', () => {
  const items = [
    listItem('<a href="https://docs.docker.com/engine/install/">Docker Engine</a> v24+ (includes Compose v2)'),
    listItem('<a href="https://www.gnu.org/software/make/">GNU Make</a> - required to run project commands'),
    listItem('<a href="https://git-scm.com/downloads">Git</a> - for version control and cloning the repository'),
  ];
  const node = listSection('ol', items);
  assert.equal(node.attrs.ordered, true);
  assert.deepEqual(node, {
    blockName: 'core/list',
    attrs: { ordered: true },
    innerBlocks: items,
    innerHTML: '\n<ol class="wp-block-list"></ol>\n',
  });
});

test('listItem() returns a core/list-item node, bare <li>, no class', () => {
  const node = listItem('<code>.env.main</code> – shared base config');
  assert.deepEqual(node, {
    blockName: 'core/list-item',
    attrs: {},
    innerBlocks: [],
    innerHTML: '\n<li><code>.env.main</code> – shared base config</li>\n',
  });
});

// --- code(): starter-kit/code, with and without a language ---------------------------------

test('code() with language=bash emits the language attribute and a language-bash class', () => {
  const node = code('bash', 'git clone https://github.com/solidbunch/starter-kit-foundation.git my-project');
  assert.deepEqual(node, {
    blockName: 'starter-kit/code',
    attrs: { language: 'bash' },
    innerBlocks: [],
    innerHTML:
      '\n<pre class="sk-block-code"><code class="language-bash">git clone https://github.com/solidbunch/starter-kit-foundation.git my-project</code></pre>\n',
  });
});

test('code() with no language (auto) omits the language attribute and the <code> class', () => {
  const node = code(undefined, '127.0.0.1 myproject.local');
  assert.deepEqual(node, {
    blockName: 'starter-kit/code',
    attrs: {},
    innerBlocks: [],
    innerHTML: '\n<pre class="sk-block-code"><code>127.0.0.1 myproject.local</code></pre>\n',
  });
});

test('code() with language="auto" (explicit) also omits the language attribute', () => {
  const node = code('auto', 'echo hello');
  assert.deepEqual(node.attrs, {});
  assert.equal(node.innerHTML, '\n<pre class="sk-block-code"><code>echo hello</code></pre>\n');
});

// --- quote(): core/quote wrapping N core/paragraph innerBlocks, empty <blockquote> wrapper -

test('quote() with a single paragraph produces one core/paragraph innerBlock and an empty <blockquote> wrapper', () => {
  const p =
    '🖥️ <strong>Supported Platforms:</strong> macOS, Linux, and Windows (with <a href="https://learn.microsoft.com/en-us/windows/wsl/install">WSL2</a>). See <a href="/doc/platform-notes/">Platform Notes</a> for details.';
  const node = quote([p]);
  assert.equal(node.innerBlocks.length, 1);
  assert.deepEqual(node, {
    blockName: 'core/quote',
    attrs: {},
    innerBlocks: [paragraph(p)],
    innerHTML: '\n<blockquote class="wp-block-quote"></blockquote>\n',
  });
});

test('quote() with two paragraphs produces two core/paragraph innerBlocks and an empty <blockquote> wrapper', () => {
  const p1 =
    '🔐 <strong>Security Note:</strong> The <code>.env.secret</code> file contains sensitive credentials and should not be committed to version control. It is generated automatically during installation and should be kept secure.';
  const p2 =
    '🛠️ <strong>Tip:</strong> If you have any problems during installation, check the The <a href="/doc/troubleshooting/">Troubleshooting</a> section for common issues and solutions.';
  const node = quote([p1, p2]);
  assert.equal(node.innerBlocks.length, 2);
  assert.deepEqual(node, {
    blockName: 'core/quote',
    attrs: {},
    innerBlocks: [paragraph(p1), paragraph(p2)],
    innerHTML: '\n<blockquote class="wp-block-quote"></blockquote>\n',
  });
  node.innerBlocks.forEach((child) => assert.equal(child.blockName, 'core/paragraph'));
});

// --- table(): core/table, unchanged flat innerHTML shape ------------------------------------

test('table() returns a core/table node with a flat innerHTML (no InnerBlocks)', () => {
  const node = table(
    ['Command', 'Under the hood', 'Description'],
    [
      ['<strong>make up</strong>', '<code>docker compose up -d</code>', 'Start all services in detached mode'],
      ['<strong>make down</strong>', '<code>docker compose down</code>', 'Stop containers and remove networks'],
      ['<strong>make restart</strong>', '<code>docker compose restart</code>', 'Quick services restart'],
      [
        '<strong>make recreate</strong>',
        '<code>docker compose up -d --force-recreate</code>',
        'Recreate containers to reapply configs',
      ],
      ['<strong>make log</strong>', '<code>docker compose logs -f</code>', 'Tail logs from all or one service'],
    ]
  );
  assert.deepEqual(node, {
    blockName: 'core/table',
    attrs: {},
    innerBlocks: [],
    innerHTML:
      '\n<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th>Command</th><th>Under the hood</th><th>Description</th></tr></thead><tbody><tr><td><strong>make up</strong></td><td><code>docker compose up -d</code></td><td>Start all services in detached mode</td></tr><tr><td><strong>make down</strong></td><td><code>docker compose down</code></td><td>Stop containers and remove networks</td></tr><tr><td><strong>make restart</strong></td><td><code>docker compose restart</code></td><td>Quick services restart</td></tr><tr><td><strong>make recreate</strong></td><td><code>docker compose up -d --force-recreate</code></td><td>Recreate containers to reapply configs</td></tr><tr><td><strong>make log</strong></td><td><code>docker compose logs -f</code></td><td>Tail logs from all or one service</td></tr></tbody></table></figure>\n',
  });
});

// --- separator() -----------------------------------------------------------------------------

test('separator() returns a core/separator node with a space before the self-closing />', () => {
  const node = separator();
  assert.deepEqual(node, {
    blockName: 'core/separator',
    attrs: {},
    innerBlocks: [],
    innerHTML: '\n<hr class="wp-block-separator has-alpha-channel-opacity" />\n',
  });
});

// --- embed(): starter-kit/row > starter-kit/column > core/embed, 3-level nesting -------------

test('embed() builds a 3-level starter-kit/row > starter-kit/column > core/embed tree', () => {
  const node = embed('https://youtu.be/uCQcxhVUsdc');

  assert.equal(node.blockName, 'starter-kit/row');
  assert.equal(node.innerBlocks.length, 1);
  const column = node.innerBlocks[0];
  assert.equal(column.blockName, 'starter-kit/column');
  assert.equal(column.innerBlocks.length, 1);
  const embedBlock = column.innerBlocks[0];
  assert.equal(embedBlock.blockName, 'core/embed');
  assert.equal(embedBlock.innerBlocks.length, 0);

  assert.deepEqual(node, {
    blockName: 'starter-kit/row',
    attrs: {
      properties: {
        xs: { justifyContent: 'center' },
        sm: [],
        md: [],
        lg: [],
        xl: [],
        xxl: [],
      },
      spacers: {
        xs: { valueRange: { 'mt-xs': 3, 'mb-xs': 3 } },
        sm: {},
        md: {},
        lg: {},
        xl: {},
        xxl: {},
      },
    },
    innerBlocks: [
      {
        blockName: 'starter-kit/column',
        attrs: {
          size: {
            xs: { mod: 'default' },
            sm: [],
            md: [],
            lg: { mod: 'custom', valueRange: 8 },
            xl: [],
            xxl: [],
          },
        },
        innerBlocks: [
          {
            blockName: 'core/embed',
            attrs: {
              url: 'https://youtu.be/uCQcxhVUsdc',
              type: 'video',
              providerNameSlug: 'youtube',
              responsive: true,
              className: 'wp-embed-aspect-16-9 wp-has-aspect-ratio',
            },
            innerBlocks: [],
            innerHTML:
              '\n<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">\nhttps://youtu.be/uCQcxhVUsdc\n</div></figure>\n',
          },
        ],
        innerHTML: '\n<div class="col col-lg-8"></div>\n',
      },
    ],
    innerHTML: '\n<div class="row justify-content-center mt-3 mb-3"></div>\n',
  });
});

test('embed() attrs keep properties.sm as an array and spacers.sm as an object — [] vs {} must not be swapped', () => {
  const node = embed('https://youtu.be/uCQcxhVUsdc');
  const { properties, spacers } = node.attrs;
  const size = node.innerBlocks[0].attrs.size;

  assert.ok(Array.isArray(properties.sm), 'properties.sm must be an array ([])');
  assert.deepEqual(Object.keys(properties.sm), []);

  assert.ok(!Array.isArray(spacers.sm), 'spacers.sm must be a plain object ({})');
  assert.equal(typeof spacers.sm, 'object');
  assert.deepEqual(Object.keys(spacers.sm), []);

  assert.ok(Array.isArray(size.sm), 'size.sm must be an array ([])');
  assert.deepEqual(Object.keys(size.sm), []);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractClaims, MAKE_ARG_LIMITS, parseAllowlist } from '../lib/claims.mjs';

const extract = (source, file = 'page.md') => extractClaims({ file, source });
const ofKind = (claims, kind) => claims.filter((c) => c.kind === kind);
const values = (claims, kind) => ofKind(claims, kind).map((c) => c.value);

// The past callout from commit a5b9f2e (`git show a5b9f2e^:infrastructure.md`), verbatim.
const PAST_CALLOUT = [
  '> The GitHub provisioning workflow offers `stage` as an environment choice alongside `dev` and',
  '> `prod`, but only `kit-modules/basis/terraform/envs/dev/`, `.../prod/`, and `.../shared/` ship',
  '> with the project — there is no `.../stage/` directory yet. Running `make tf stage ...` (or',
  '> triggering the workflow with `stage`) will fail until that env directory is created first,',
  '> following the pattern of `dev/`/`prod/`.',
].join('\n');

test('MAKE_ARG_LIMITS mirrors sh/dev/run.sh: exec and run take at most 2 words', () => {
  assert.deepEqual({ ...MAKE_ARG_LIMITS }, { exec: 2, run: 2 });
});

// ---------------------------------------------------------------------------------- make

test('make: command start in inline code, bold and fences', () => {
  const src = [
    'Run `make install` first.',
    '',
    '**make oidc \\<env\\> ...** does the thing.',
    '',
    '```bash',
    'make up',
    '$ make down',
    'sudo make clean',
    'cd x && make build; make test | tee out',
    'echo $(make version)',
    '```',
  ].join('\n');
  const claims = ofKind(extract(src), 'make');
  assert.deepEqual(
    claims.map((c) => [c.value, c.source, c.line]),
    [
      ['install', 'code', 1],
      ['oidc', 'strong', 3],
      ['up', 'fence', 6],
      ['down', 'fence', 7],
      ['clean', 'fence', 8],
      ['build', 'fence', 9],
      ['test', 'fence', 9],
      ['version', 'fence', 10],
    ],
  );
  assert.equal(claims[1].raw, '**make oidc <env> ...**');
});

test('make: VAR=value prefixes are skipped, in a fence and in inline code', () => {
  const src = [
    '```',
    'MARIADB_AUTO_UPGRADE=1 make recreate <env>',
    '```',
    '',
    'Or `FOO=1 BAR=x make restart`.',
  ].join('\n');
  assert.deepEqual(values(extract(src), 'make'), ['recreate', 'restart']);
});

test('make: non-start mentions and non-target words are ignored', () => {
  const src = [
    '`sudo apt install make git`',
    '',
    'Please make sure the stack is up and make it work.',
    '',
    'Use `make <target>` or `make -C dir x` or `make`.',
    '',
    '```',
    'sudo apt install make git',
    'echo "make sure"',
    '```',
  ].join('\n');
  assert.deepEqual(ofKind(extract(src), 'make'), []);
});

test('make: inline code only counts when the span starts with make', () => {
  assert.deepEqual(values(extract('`run make up` and `echo make up`'), 'make'), []);
});

// ---------------------------------------------------------------------------- make-args

test('make-args: a fence line with more than 2 words after exec yields one claim with 7 args', () => {
  const src = ['```', 'make exec mariadb mariadb -u root -p -e "SELECT 1"', '```'].join('\n');
  const claims = extract(src);
  const args = ofKind(claims, 'make-args');
  assert.equal(args.length, 1);
  assert.deepEqual(args[0].args, ['mariadb', 'mariadb', '-u', 'root', '-p', '-e', '"SELECT 1"']);
  assert.equal(args[0].args.length, 7);
  assert.equal(args[0].value, 'exec mariadb mariadb -u root -p -e "SELECT 1"');
  assert.equal(args[0].line, 2);
  assert.equal(args[0].source, 'fence');
  assert.deepEqual(values(claims, 'make'), ['exec']);
});

test('make-args: the bold reference row `make exec <service> [user]` has 2 words, no claim', () => {
  assert.deepEqual(ofKind(extract('**make exec \\<service\\> \\[user]**'), 'make-args'), []);
});

test('make-args: within the limit and unlimited targets produce no claim', () => {
  const src = ['```', 'make exec mariadb', 'make tf stage plan extra', 'make run web root', '```'].join(
    '\n',
  );
  assert.deepEqual(ofKind(extract(src), 'make-args'), []);
});

test('make-args: the command ends at an unquoted separator or comment, quoted ones do not end it', () => {
  const src = [
    '```',
    'make exec db sh && echo a b c',
    'make run db root # a b c',
    'make exec db sh -c "a; b | c"',
    '```',
  ].join('\n');
  const args = ofKind(extract(src), 'make-args');
  assert.deepEqual(
    args.map((c) => [c.line, c.args]),
    [[4, ['db', 'sh', '-c', '"a; b | c"']]],
  );
});

test('make-args: an inline span can carry the claim too', () => {
  const claims = ofKind(extract('Try `make exec db mariadb -u root`.'), 'make-args');
  assert.equal(claims.length, 1);
  assert.equal(claims[0].source, 'code');
  assert.equal(claims[0].args.length, 4);
});

// ------------------------------------------------------------------------------- context

test('context: table cell, blockquote paragraph, list item, fence, heading, paragraph', () => {
  const src = [
    '# Heading with `sh/h.sh`',
    '',
    'Para `sh/p.sh`',
    '',
    '| a | b |',
    '|---|---|',
    '| `sh/t.sh` | x |',
    '',
    '> Quote `sh/q.sh`',
    '',
    '- item `sh/l.sh`',
    '',
    '> | a |',
    '> |---|',
    '> | `sh/qt.sh` |',
    '',
    '```',
    'make fenced',
    '```',
  ].join('\n');
  const byValue = Object.fromEntries(extract(src).map((c) => [c.value, c.context]));
  assert.deepEqual(byValue, {
    'sh/h.sh': 'heading',
    'sh/p.sh': 'paragraph',
    'sh/t.sh': 'table',
    'sh/q.sh': 'blockquote',
    'sh/l.sh': 'list',
    'sh/qt.sh': 'table',
    fenced: 'fence',
  });
});

// ---------------------------------------------------------------------------------- path

test('path: prefixes, ./ stripping, trailing slash, wrapping punctuation', () => {
  const src = [
    'See `./sh/dev/run.sh`, `kit-modules/basis/`, `config/environment/.env.main`.',
    '',
    'Also `dockerfiles/php/Dockerfile`, `.github/workflows/x.yml` and `.gitlab/ci/y.yml`.',
  ].join('\n');
  assert.deepEqual(values(extract(src), 'path'), [
    'sh/dev/run.sh',
    'kit-modules/basis',
    'config/environment/.env.main',
    'dockerfiles/php/Dockerfile',
    '.github/workflows/x.yml',
    '.gitlab/ci/y.yml',
  ]);
});

test('path: container paths, bare words, root-level runtime paths and URLs are not claims', () => {
  const src = [
    '`"cd /srv/kit-modules/basis"`',
    '`config`',
    '`.env` `db-data` `tmp/` `logs/` `vendor/` `backups/`',
    '`https://example.com/sh/x`',
    '```',
    'ls kit-modules/basis/sh',
    '```',
  ].join('\n');
  assert.deepEqual(ofKind(extract(src), 'path'), []);
  assert.deepEqual(ofKind(extract(src), 'relpath'), []);
});

test('path: a placeholder is kept as written', () => {
  const src = 'Use `config/environment/.env.type.<env>` and `kit-modules/{$name}/` and `.github/workflows/**`.';
  assert.deepEqual(values(extract(src), 'path'), [
    'config/environment/.env.type.<env>',
    'kit-modules/{$name}',
    '.github/workflows/**',
  ]);
});

test('past callout (a5b9f2e): .../prod/ and .../shared/ expand, .../stage/ expands and is negated', () => {
  const claims = extract(PAST_CALLOUT, 'infrastructure.md');
  const paths = ofKind(claims, 'path');
  assert.deepEqual(
    paths.map((c) => [c.value, c.negated, c.line]),
    [
      ['kit-modules/basis/terraform/envs/dev', false, 2],
      ['kit-modules/basis/terraform/envs/prod', false, 2],
      ['kit-modules/basis/terraform/envs/shared', false, 2],
      ['kit-modules/basis/terraform/envs/stage', true, 3],
    ],
  );
  const stage = paths[3];
  assert.equal(stage.anchor, 'kit-modules/basis/terraform/envs/dev');
  assert.equal(stage.raw, '`.../stage/`');
  assert.equal(stage.unresolved, false);
  assert.equal(stage.context, 'blockquote');
  assert.equal(stage.file, 'infrastructure.md');
  assert.equal(paths[1].anchor, 'kit-modules/basis/terraform/envs/dev');
  // `dev/`/`prod/` on line 5 are not negated relative paths, `stage` is not followed by a noun
  assert.deepEqual(ofKind(claims, 'relpath'), []);
  // `make tf stage ...` is a make claim but tf is not arg-limited
  assert.deepEqual(values(claims, 'make'), ['tf']);
  assert.deepEqual(ofKind(claims, 'make-args'), []);
});

test('shortened path: splice expansion when the first segment occurs in the anchor', () => {
  const src = 'Only `kit-modules/basis/terraform/envs/dev/` ships, not `.../terraform/envs/stage/`.';
  const stage = ofKind(extract(src), 'path')[1];
  assert.equal(stage.value, 'kit-modules/basis/terraform/envs/stage');
  assert.equal(stage.anchor, 'kit-modules/basis/terraform/envs/dev');
});

test('shortened path: the unicode ellipsis works too', () => {
  const src = 'Only `kit-modules/basis/terraform/envs/dev/` and `…/prod/`.';
  assert.equal(ofKind(extract(src), 'path')[1].value, 'kit-modules/basis/terraform/envs/prod');
});

test('shortened path: anchor from an earlier paragraph in the same section', () => {
  const src = ['# S', '', 'Has `kit-modules/basis/terraform/envs/dev/`.', '', 'Then `.../prod/`.'].join('\n');
  const prod = ofKind(extract(src), 'path')[1];
  assert.equal(prod.value, 'kit-modules/basis/terraform/envs/prod');
  assert.equal(prod.line, 5);
});

test('shortened path: no full path before it -> unresolved', () => {
  const claims = ofKind(extract('Text with `.../x/` here.'), 'path');
  assert.equal(claims.length, 1);
  assert.equal(claims[0].unresolved, true);
  assert.equal(claims[0].value, 'x');
  assert.equal(claims[0].anchor, null);
});

test('shortened path: the anchor is not carried across a heading, and a shortened span is never an anchor', () => {
  const src = [
    '# A',
    '',
    'See `kit-modules/basis/x/one`.',
    '',
    '# B',
    '',
    'Then `.../y/`.',
    '',
    '# C',
    '',
    'Only `.../a/` and `.../b/`.',
  ].join('\n');
  const paths = ofKind(extract(src), 'path');
  assert.deepEqual(
    paths.map((c) => [c.value, c.unresolved]),
    [
      ['kit-modules/basis/x/one', false],
      ['y', true],
      ['a', true],
      ['b', true],
    ],
  );
});

// ------------------------------------------------------------------------------- relpath

test('relpath: a negated relative path is a claim, the same path un-negated is not', () => {
  const claims = ofKind(extract('The Terraform directory `envs/stage` does not exist.'), 'relpath');
  assert.equal(claims.length, 1);
  assert.equal(claims[0].value, 'envs/stage');
  assert.equal(claims[0].negated, true);
  assert.deepEqual(ofKind(extract('The Terraform directory `envs/stage` is used.'), 'relpath'), []);
  assert.deepEqual(ofKind(extract('Create `envs/stage` first.'), 'relpath'), []);
});

test('relpath: "there is no `stage` directory" is a bare-word claim, noun kept in raw', () => {
  const claims = ofKind(extract('Sadly there is no `stage` directory yet.'), 'relpath');
  assert.equal(claims.length, 1);
  assert.equal(claims[0].value, 'stage');
  assert.equal(claims[0].raw, '`stage` directory');
  assert.equal(claims[0].negated, true);
});

test('relpath: a negated bare word needs the noun after it', () => {
  assert.deepEqual(ofKind(extract('There is no `stage` here.'), 'relpath'), []);
  assert.deepEqual(ofKind(extract('The `stage` directory exists.'), 'relpath'), []);
});

test('relpath: Ansible has no `stage` host is not a claim (infrastructure.md:51 wording)', () => {
  const src =
    '(`kit-modules/basis/terraform/envs/stage/`), but Ansible has no `stage` host in\n`kit-modules/basis/ansible/inventory.yml`, so a server would be created.';
  const claims = extract(src);
  assert.deepEqual(ofKind(claims, 'relpath'), []);
  assert.deepEqual(
    ofKind(claims, 'path').map((c) => [c.value, c.negated]),
    [
      ['kit-modules/basis/terraform/envs/stage', false],
      ['kit-modules/basis/ansible/inventory.yml', false],
    ],
  );
});

test('relpath: placeholder, absolute, home and URL tokens are never relpath claims', () => {
  const src = [
    '`envs/<env>` does not exist.',
    '`/srv/x/y` does not exist.',
    '`~/x/y` does not exist.',
    '`https://a/b` does not exist.',
  ].join('\n\n');
  assert.deepEqual(ofKind(extract(src), 'relpath'), []);
});

// ---------------------------------------------------------------------------------- var

test('var: the supported forms', () => {
  const src = [
    '`TF_VAR_tf_lock_table`',
    '',
    '`CURRENT_UID` / `CURRENT_GID`',
    '',
    '`APP_DOMAIN=<your-domain>` and `APP_MULTI_INSTANCE=1`',
    '',
    '`${APP_NAME}` and `$DB_HOST` and `A_B, C_D | E_F`',
    '',
    '`MARIADB_AUTO_UPGRADE=1 make recreate <env>`',
  ].join('\n');
  const claims = extract(src);
  assert.deepEqual(values(claims, 'var'), [
    'TF_VAR_tf_lock_table',
    'CURRENT_UID',
    'CURRENT_GID',
    'APP_DOMAIN',
    'APP_MULTI_INSTANCE',
    'APP_NAME',
    'DB_HOST',
    'A_B',
    'C_D',
    'E_F',
    'MARIADB_AUTO_UPGRADE',
  ]);
  assert.deepEqual(values(claims, 'make'), ['recreate']);
});

test('var: $(PARAM1), a whole command, single words and lowercase names are not var claims', () => {
  const src = '`$(PARAM1)` `make up` `HOME` `app_name` `docker compose up` `Foo_Bar`';
  assert.deepEqual(ofKind(extract(src), 'var'), []);
});

// ------------------------------------------------------------------------------ workflow

test('workflow: names incl. dotfile and glob forms; paths with slashes are paths', () => {
  const src =
    'Files `job-deploy.yml`, `.gitlab-ci.yml`, `docker-compose*.yml`, `docker-compose.override.yaml`, `.github/workflows/x.yml`.';
  const claims = extract(src);
  assert.deepEqual(values(claims, 'workflow'), [
    'job-deploy.yml',
    '.gitlab-ci.yml',
    'docker-compose*.yml',
    'docker-compose.override.yaml',
  ]);
  assert.deepEqual(values(claims, 'path'), ['.github/workflows/x.yml']);
});

// ---------------------------------------------------------------------------- negation

test('negation: positive forms after and before the span', () => {
  const cases = [
    'The `sh/a.sh` file does not exist.',
    'The `sh/a.sh` doesn\'t exist.',
    'The `sh/a.sh` no longer exists.',
    '`sh/a.sh` is not present.',
    '`sh/a.sh` is no longer shipped.',
    '`sh/a.sh` was removed.',
    '`sh/a.sh` has been removed in 2.0.',
    'There is no `sh/a.sh` here.',
    "There's no `sh/a.sh` here.",
    'there are no matching `sh/a.sh` files',
    'No such `sh/a.sh` anywhere.',
  ];
  for (const src of cases) {
    assert.equal(ofKind(extract(src), 'path')[0].negated, true, src);
  }
});

test('negation: negative forms (infrastructure.md:51 and ci-cd-deployments.md:55 wording)', () => {
  const cases = [
    '`config/environment/.env.type.stage` has its own `APP_DOMAIN`, but there is no stage deploy',
    'but Ansible has no `sh/stage.sh` host in',
    'The `sh/a.sh` file exists and does exist.',
    'The `sh/a.sh` is used. It does not exist elsewhere.',
    'There is no stage. Use `sh/a.sh` instead.',
    'There is no `sh/a.sh` and `sh/b.sh`.',
  ];
  const results = cases.map((src) => ofKind(extract(src), 'path').map((c) => c.negated));
  assert.deepEqual(results[0], [false]);
  assert.deepEqual(results[1], [false]);
  assert.deepEqual(results[2], [false]);
  assert.deepEqual(results[3], [false]);
  assert.deepEqual(results[4], [false]);
  // sentence-scoped per span: the first span is negated, the second one is not
  assert.deepEqual(results[5], [true, false]);
});

test('negation: a fence line is never negated', () => {
  const src = ['```', 'make nothing # does not exist', '```'].join('\n');
  assert.equal(ofKind(extract(src), 'make')[0].negated, false);
});

test('negation: applies to a bold make claim', () => {
  const claims = ofKind(extract('**make gone** does not exist.'), 'make');
  assert.equal(claims[0].negated, true);
});

// ------------------------------------------------------------------------ line numbers

test('line numbers: multi-line paragraph, repeated span, table row, fence line', () => {
  const src = [
    '# Title', // 1
    '', // 2
    'first `sh/one.sh` line', // 3
    'second `sh/two.sh` line', // 4
    'third `sh/one.sh` and `sh/one.sh`', // 5
    '', // 6
    '| a | b |', // 7
    '|---|---|', // 8
    '| `sh/cell1.sh` | `sh/cell2.sh` |', // 9
    '', // 10
    '```bash', // 11
    'echo hi', // 12
    '', // 13
    'make fenced', // 14
    '```', // 15
  ].join('\n');
  const claims = extract(src);
  assert.deepEqual(
    claims.map((c) => [c.value, c.line]),
    [
      ['sh/one.sh', 3],
      ['sh/two.sh', 4],
      ['sh/one.sh', 5],
      ['sh/one.sh', 5],
      ['sh/cell1.sh', 9],
      ['sh/cell2.sh', 9],
      ['fenced', 14],
    ],
  );
});

test('line numbers: a span the search cannot find falls back to the block first line', () => {
  const src = ['intro', '', 'a ``code with ` tick sh/x.sh`` here'].join('\n');
  const claims = extract(src);
  assert.equal(claims[0].line, 3);
});

test('line numbers: a bold row with escapes is located by its leading text', () => {
  const src = ['| a |', '|---|', '| x |', '| **make oidc \\<env\\> ...** |'].join('\n');
  const claims = ofKind(extract(src), 'make');
  assert.equal(claims[0].line, 4);
  assert.equal(claims[0].context, 'table');
});

// --------------------------------------------------------------------------- allowlist

const ALLOWLIST = [
  '# comment',
  '',
  '[allowed]',
  "usage.md var XDEBUG_TRIGGER  # Xdebug's own trigger parameter",
  'usage.md make-args exec mariadb mariadb -u root  # value with spaces',
  '',
  '[known-drift]',
  'infrastructure.md path kit-modules/x/y  # real drift, not fixed yet',
].join('\n');

test('parseAllowlist: sections, entries, make-args value with spaces, line numbers', () => {
  assert.deepEqual(parseAllowlist(ALLOWLIST), [
    {
      section: 'allowed',
      file: 'usage.md',
      kind: 'var',
      value: 'XDEBUG_TRIGGER',
      reason: "Xdebug's own trigger parameter",
      line: 4,
    },
    {
      section: 'allowed',
      file: 'usage.md',
      kind: 'make-args',
      value: 'exec mariadb mariadb -u root',
      reason: 'value with spaces',
      line: 5,
    },
    {
      section: 'known-drift',
      file: 'infrastructure.md',
      kind: 'path',
      value: 'kit-modules/x/y',
      reason: 'real drift, not fixed yet',
      line: 8,
    },
  ]);
});

test('parseAllowlist: an empty file and a sections-only file parse to nothing', () => {
  assert.deepEqual(parseAllowlist(''), []);
  assert.deepEqual(parseAllowlist('# c\n\n[allowed]\n\n[known-drift]\n'), []);
});

test('parseAllowlist: the same key is allowed in two sections only once, and in two files separately', () => {
  assert.equal(
    parseAllowlist('[allowed]\na.md var X_Y  # r\nb.md var X_Y  # r\n').length,
    2,
  );
});

const PARSE_ERRORS = [
  ['an entry before any section', 'usage.md var X_Y  # r', /^doc-claims-allowlist\.txt:1: entry before any/],
  ['an unknown section', '[nope]\n', /^doc-claims-allowlist\.txt:1: unknown section \[nope\]/],
  ['an unknown kind', '[allowed]\nusage.md thing X_Y  # r', /^doc-claims-allowlist\.txt:2: unknown kind "thing"/],
  ['a missing file column (kind first)', '[allowed]\nvar X_Y  # r', /^doc-claims-allowlist\.txt:2: invalid file column "var"/],
  ['a file not ending in .md', '[allowed]\nusage.txt var X_Y  # r', /^doc-claims-allowlist\.txt:2: invalid file column "usage\.txt"/],
  ['a file containing a slash', '[allowed]\ndocs/usage.md var X_Y  # r', /^doc-claims-allowlist\.txt:2: invalid file column "docs\/usage\.md"/],
  ['a missing reason', '[allowed]\nusage.md var X_Y', /^doc-claims-allowlist\.txt:2: missing "# reason"/],
  ['an empty reason', '[allowed]\nusage.md var X_Y  #   ', /^doc-claims-allowlist\.txt:2: missing value or reason/],
  ['a missing value', '[allowed]\nusage.md var  # r', /^doc-claims-allowlist\.txt:2: missing value or reason/],
  ['a lone token', '[allowed]\nusage.md', /^doc-claims-allowlist\.txt:2: malformed entry/],
  [
    'a duplicate file kind value',
    '[allowed]\nusage.md var X_Y  # r\n\n[known-drift]\nusage.md var X_Y  # again',
    /^doc-claims-allowlist\.txt:5: duplicate entry "usage\.md var X_Y"/,
  ],
];

for (const [name, text, pattern] of PARSE_ERRORS) {
  test(`parseAllowlist: throws on ${name}`, () => {
    assert.throws(() => parseAllowlist(text), { message: pattern });
  });
}

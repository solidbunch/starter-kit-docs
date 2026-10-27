import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression guard for `.claude/skills/make-doc/SKILL.md`.
//
// WHY: the skill harness substitutes argument placeholders into the skill text before the model
// reads it: the full-arguments token and the positional digit tokens (a dollar sign followed by a
// number, optionally braced). A trial run of the skill showed that the full-arguments token written
// in prose, and the positional tokens written in a sentence about shell arguments, were replaced
// with the user's actual arguments, which silently corrupted the instructions.
//
// CONVENTION (decided, see the architect plan): the full-arguments token occurs exactly once, on
// the line `**Arguments:** <token>`, which is the one deliberate substitution point. The positional
// digit tokens are forbidden everywhere, including inside code blocks. Describe arguments in words
// instead. The backslash escape is NOT used: a harness version that ignores it would leak a visible
// backslash into the text, and this test could not tell an escaped token from a live one.
//
// Scope: `make-doc` only, and only these tokens. `$$` and `$RANDOM` are safe (no digit follows).

const SKILL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.claude', 'skills', 'make-doc', 'SKILL.md');
const ARGUMENTS_LINE = '**Arguments:** $ARGUMENTS';

const lines = readFileSync(SKILL_PATH, 'utf8').split('\n');

test('make-doc SKILL.md: the arguments token occurs exactly once, on the Arguments line', () => {
  const hits = [];
  lines.forEach((text, index) => {
    const count = text.split('$ARGUMENTS').length - 1;
    for (let i = 0; i < count; i++) hits.push({ line: index + 1, text });
  });

  const where = hits.map((h) => `line ${h.line}: ${h.text.trim()}`).join('\n  ');
  assert.equal(
    hits.length,
    1,
    `expected exactly one arguments token in SKILL.md, found ${hits.length}${where ? `:\n  ${where}` : ''}`
  );
  assert.equal(
    hits[0].text.trim(),
    ARGUMENTS_LINE,
    `the single arguments token must be on the line "${ARGUMENTS_LINE}", but line ${hits[0].line} is: ${hits[0].text.trim()}`
  );
});

test('make-doc SKILL.md: no positional digit tokens anywhere', () => {
  const offenders = [];
  lines.forEach((text, index) => {
    if (/\$\{?\d/.test(text)) offenders.push(`line ${index + 1}: ${text.trim()}`);
  });

  assert.deepEqual(
    offenders,
    [],
    `SKILL.md contains positional placeholder tokens that the harness would substitute:\n  ${offenders.join('\n  ')}`
  );
});

// --- Supporting files: recipes and anchors -------------------------------------------------------
//
// The recipe scripts live in `recipes/*.sh` next to SKILL.md. The harness does not substitute
// placeholders in them, but they are still scanned for the safety rules below, because agents run
// them against the shared Docker daemon.

const SKILL_DIR = dirname(SKILL_PATH);
const RECIPES_DIR = join(SKILL_DIR, 'recipes');
const skillText = lines.join('\n');

const recipeFiles = () => readdirSync(RECIPES_DIR).filter((name) => name.endsWith('.sh')).sort();
const readRecipe = (name) => readFileSync(join(RECIPES_DIR, name), 'utf8');
const NON_DOCKER_RECIPES = new Set(['scratch-project.sh', 'scratch-teardown.sh']);

// Joins backslash-continued lines and drops comment lines (first non-space char is `#`).
function effectiveLines(text) {
  const joined = text.replace(/\\\n[ \t]*/g, ' ');
  return joined.split('\n').filter((line) => !/^\s*#/.test(line));
}

test('make-doc SKILL.md: every supporting file it names exists', () => {
  const names = new Set([
    ...(skillText.match(/recipes\/[\w.-]+\.sh/g) ?? []),
    ...(skillText.match(/\b(?:known-pitfalls|house-style|ground-truth)\.md\b/g) ?? []),
  ]);
  assert.ok(names.size > 0, 'SKILL.md names no supporting files; the regex or the text broke');
  const missing = [...names].filter((name) => !existsSync(join(SKILL_DIR, name)));
  assert.deepEqual(missing, [], `SKILL.md names files that do not exist under ${SKILL_DIR}: ${missing.join(', ')}`);
});

test('make-doc recipes: every Docker recipe has trap cleanup EXIT', () => {
  const files = recipeFiles().filter((name) => !NON_DOCKER_RECIPES.has(name));
  assert.ok(files.length >= 4, `expected at least 4 Docker recipes, found ${files.length}`);
  const missing = files.filter((name) => !readRecipe(name).includes('trap cleanup EXIT'));
  assert.deepEqual(missing, [], `recipes without "trap cleanup EXIT": ${missing.join(', ')}`);
});

test('make-doc recipes: no published ports, prune, container_name or ports key', () => {
  const problems = [];
  const files = recipeFiles();
  assert.ok(files.length >= 6, `expected at least 6 recipe files, found ${files.length}`);
  for (const name of files) {
    const text = readRecipe(name);
    if (/\$\{?\d/.test(text)) problems.push(`${name}: contains a positional digit token`);
    for (const line of effectiveLines(text)) {
      if (/docker run/.test(line) && /(^|\s)(-p|-P|--publish|--publish-all)(\s|=|$)/.test(line)) {
        problems.push(`${name}: docker run publishes a port: ${line.trim()}`);
      }
      if (/\bprune\b/.test(line)) problems.push(`${name}: prune: ${line.trim()}`);
      if (line.includes('container_name')) problems.push(`${name}: container_name: ${line.trim()}`);
      if (/^\s*ports:/.test(line)) problems.push(`${name}: ports key: ${line.trim()}`);
    }
  }
  assert.deepEqual(problems, [], `unsafe recipe content:\n  ${problems.join('\n  ')}`);
});

test('make-doc recipes: every docker run has --pull=never and every compose file has pull_policy: never', () => {
  const problems = [];
  for (const name of recipeFiles()) {
    const text = readRecipe(name);
    for (const line of effectiveLines(text)) {
      if (/docker run/.test(line) && !line.includes('--pull=never')) {
        problems.push(`${name}: docker run without --pull=never: ${line.trim()}`);
      }
    }
    if (/^\s*services:/m.test(text) && !text.includes('pull_policy: never')) {
      problems.push(`${name}: compose heredoc without pull_policy: never`);
    }
  }
  assert.deepEqual(problems, [], `recipes that may pull images:\n  ${problems.join('\n  ')}`);
});

test('make-doc recipes: bash -n accepts every file', () => {
  const failures = [];
  for (const name of recipeFiles()) {
    const result = spawnSync('bash', ['-n', join(RECIPES_DIR, name)], { encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${name}: ${result.stderr.trim() || `exit ${result.status}`}`);
  }
  assert.deepEqual(failures, [], `syntax errors:\n  ${failures.join('\n  ')}`);
});

test('make-doc SKILL.md: every in-file anchor link resolves to a heading', () => {
  const slugger = () => {
    const seen = new Map();
    return (heading) => {
      const base = heading
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .replace(/ /g, '-');
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return count === 0 ? base : `${base}-${count}`;
    };
  };
  const slug = slugger();
  const slugs = new Set();
  const anchors = [];
  let inFence = false;
  lines.forEach((text, index) => {
    if (/^\s*```/.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(text);
    if (heading) slugs.add(slug(heading[1]));
    for (const match of text.matchAll(/\]\(#([^)\s]+)\)/g)) anchors.push({ line: index + 1, anchor: match[1] });
  });
  assert.ok(anchors.length > 0, 'no in-file anchor links found; the regex or the text broke');
  const dangling = anchors.filter((a) => !slugs.has(a.anchor)).map((a) => `line ${a.line}: #${a.anchor}`);
  assert.deepEqual(dangling, [], `anchor links without a heading:\n  ${dangling.join('\n  ')}`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

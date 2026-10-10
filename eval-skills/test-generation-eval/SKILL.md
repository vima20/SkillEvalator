---
name: test-generation-eval
description: Write a Node.js assert test file for a provided subject module. Metadata/prompt only.
---

# Test generation eval

You receive one or more **subject** JavaScript modules (CommonJS).
Write a complete **test file** named as specified (`test.js`) that:

1. Uses Node's built-in `assert` (and `require` of the subject module(s) with a relative path, e.g. `./clamp.js`).
2. Covers happy path, edge cases, and at least one failure mode the subject should handle.
3. Prints `ok` on success (after assertions).
4. Exits non-zero (throw) if any assertion fails.

Grading runs your tests against a correct subject **and** a broken subject.
Weak tests that still pass on the broken subject will fail the evaluation.

Return **only** the test file body. Do not explain. Do not wrap in markdown fences.

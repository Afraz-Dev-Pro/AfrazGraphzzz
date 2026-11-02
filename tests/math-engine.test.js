'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compile, parseAnalysisNumber, MAX_EXPRESSION_LENGTH, MAX_TOKEN_COUNT, MAX_PARSE_DEPTH, MAX_ANALYSIS_ABS_X } = require('../math-engine.js');

test('compiles supported math, constants, implicit multiplication and unary operators', () => {
  assert.equal(compile('x^2')(3), 9);
  assert.equal(compile('2x + pi')(2), 4 + Math.PI);
  assert.equal(compile('sin(pi / 2)')(), 1);
  assert.equal(compile('--x + -2')(3), 1);
});

test('rejects HTML, script, event-handler, URL-scheme and object-access payloads', () => {
  for (const value of [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    'x;alert(1)',
    'javascript:alert(1)',
    'constructor.constructor(1)',
    'globalThis.alert(1)',
    'x\u0000+1',
    'x\u200b+1'
  ]) assert.throws(() => compile(value));
});

test('rejects oversized expressions, excessive tokens, deep nesting and non-finite literals', () => {
  assert.throws(() => compile('1'.repeat(MAX_EXPRESSION_LENGTH + 1)), /characters/);
  assert.throws(() => compile(Array(MAX_TOKEN_COUNT).fill('x').join('+')), /tokens/);
  assert.throws(() => compile('('.repeat(MAX_PARSE_DEPTH + 1) + 'x' + ')'.repeat(MAX_PARSE_DEPTH + 1)), /nesting/);
  assert.throws(() => compile('1e9999'), /finite/);
});

test('rejects non-string values at the parser boundary', () => {
  for (const value of [null, {}, ['x'], 2]) assert.throws(() => compile(value));
});

test('accepts only finite, bounded numeric analysis inputs', () => {
  assert.equal(parseAnalysisNumber('2.5e2'), 250);
  assert.equal(parseAnalysisNumber(String(MAX_ANALYSIS_ABS_X)), MAX_ANALYSIS_ABS_X);
  for (const value of ['', ' ', '1e9999', '1000001', '1;alert(1)', '<svg onload=alert(1)>']) {
    assert.equal(parseAnalysisNumber(value), null);
  }
  assert.equal(parseAnalysisNumber('10', false), null);
});

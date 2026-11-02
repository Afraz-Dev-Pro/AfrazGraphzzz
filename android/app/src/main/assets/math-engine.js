(function (root) {
  'use strict';

  const MAX_EXPRESSION_LENGTH = 256;
  const MAX_TOKEN_COUNT = 128;
  const MAX_PARSE_DEPTH = 32;
  const MAX_ANALYSIS_ABS_X = 1e6;
  const FUNCTIONS = Object.freeze({
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10,
    exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh
  });

  function tokenize(source) {
    if (typeof source !== 'string') throw new Error('Enter an equation as text.');
    if (source.length > MAX_EXPRESSION_LENGTH) throw new Error(`Keep equations under ${MAX_EXPRESSION_LENGTH} characters.`);
    const tokens = [];
    const push = token => {
      if (tokens.length >= MAX_TOKEN_COUNT - 1) throw new Error(`Keep equations under ${MAX_TOKEN_COUNT - 1} math tokens.`);
      tokens.push(token);
    };
    let i = 0;
    while (i < source.length) {
      const c = source[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
      const number = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
      if (number) {
        const value = Number(number[0]);
        if (!Number.isFinite(value)) throw new Error('Numeric values must be finite.');
        push({ type: 'number', value });
        i += number[0].length;
        continue;
      }
      const name = source.slice(i).match(/^[a-zA-Z]+/);
      if (name) { push({ type: 'name', value: name[0].toLowerCase() }); i += name[0].length; continue; }
      if ('+-*/^(),'.includes(c)) { push({ type: c, value: c }); i++; continue; }
      throw new Error(`Invalid math character at position ${i}.`);
    }
    tokens.push({ type: 'end', value: '' });
    return tokens;
  }

  function compile(source) {
    const tokens = tokenize(source);
    let pos = 0;
    const peek = () => tokens[pos];
    const take = type => { if (peek().type !== type) throw new Error('Check the expression syntax.'); return tokens[pos++]; };
    const primary = () => {
      const token = peek();
      if (token.type === 'number') { pos++; return () => token.value; }
      if (token.type === 'name') {
        pos++;
        if (peek().type === '(') {
          if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, token.value)) throw new Error('Use a supported math function.');
          pos++;
          const arg = nestedExpression();
          take(')');
          const fn = FUNCTIONS[token.value];
          return x => fn(arg(x));
        }
        if (token.value === 'x') return x => x;
        if (token.value === 'pi') return () => Math.PI;
        if (token.value === 'e') return () => Math.E;
        throw new Error('Use x, pi, e, or a supported math function.');
      }
      if (token.type === '(') { pos++; const value = nestedExpression(); take(')'); return value; }
      throw new Error('Expected a number, x, or supported function.');
    };
    const power = () => { let left = primary(); if (peek().type === '^') { pos++; const right = unary(); const l = left; left = x => Math.pow(l(x), right(x)); } return left; };
    const unary = () => { if (peek().type === '+') { pos++; return unary(); } if (peek().type === '-') { pos++; const value = unary(); return x => -value(x); } return power(); };
    const term = () => {
      let left = unary();
      while (peek().type === '*' || peek().type === '/' || peek().type === 'number' || peek().type === 'name' || peek().type === '(') {
        const explicit = peek().type === '*' || peek().type === '/';
        const op = explicit ? tokens[pos++].type : '*';
        const prior = left, right = unary();
        left = op === '*' ? x => prior(x) * right(x) : x => prior(x) / right(x);
      }
      return left;
    };
    const expression = () => {
      let left = term();
      while (peek().type === '+' || peek().type === '-') {
        const op = tokens[pos++].type, prior = left, right = term();
        left = op === '+' ? x => prior(x) + right(x) : x => prior(x) - right(x);
      }
      return left;
    };
    let parseDepth = 0;
    const nestedExpression = () => {
      if (parseDepth >= MAX_PARSE_DEPTH) throw new Error(`Function or bracket nesting is limited to ${MAX_PARSE_DEPTH} levels.`);
      parseDepth++;
      try { return expression(); } finally { parseDepth--; }
    };
    const result = expression();
    if (peek().type !== 'end') throw new Error('Check the expression syntax.');
    return result;
  }

  function parseAnalysisNumber(source, valid = true) {
    if (!valid || typeof source !== 'string' || source.trim() === '') return null;
    const valueText = source.trim();
    if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(valueText)) return null;
    const value = Number(valueText);
    if (!Number.isFinite(value) || Math.abs(value) > MAX_ANALYSIS_ABS_X) return null;
    return value;
  }

  const api = Object.freeze({ compile, parseAnalysisNumber, MAX_EXPRESSION_LENGTH, MAX_TOKEN_COUNT, MAX_PARSE_DEPTH, MAX_ANALYSIS_ABS_X });
  root.GraphMath = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis === 'object' ? globalThis : window);

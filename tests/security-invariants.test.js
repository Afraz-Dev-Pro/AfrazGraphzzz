'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('CSP denies inline code, remote resources, frames, forms and objects', () => {
  const html = read('index.html');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1];
  assert.ok(policy, 'meta CSP exists');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "script-src-attr 'none'",
    "style-src 'self'", "style-src-attr 'none'", "connect-src 'self'",
    "worker-src 'self'", "frame-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'", "require-trusted-types-for 'script'",
    "trusted-types 'none'"
  ]) assert.ok(policy.includes(directive), `CSP includes ${directive}`);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|data:/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
});

test('untrusted expression output uses no HTML or JavaScript execution sinks', () => {
  for (const file of ['app.js', 'math-engine.js']) {
    const source = read(file);
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function(']) {
      assert.equal(source.includes(sink), false, `${file} does not use ${sink}`);
    }
  }
  assert.match(read('app.js'), /\.textContent\s*=/);
  assert.match(read('app.js'), /input\.value\s*=/);
});

test('Android WebView assets match the hardened browser source', () => {
  for (const file of ['index.html', 'styles.css', 'app.js', 'math-engine.js', 'icon.svg']) {
    assert.equal(read(file), read(path.join('android/app/src/main/assets', file)), `${file} is synchronized`);
  }
  const activity = read('android/app/src/main/java/com/graphite/calculator/MainActivity.java');
  assert.match(activity, /setBlockNetworkLoads\(true\)/);
  assert.match(activity, /setAllowUniversalAccessFromFileURLs\(false\)/);
});

test('offline app shell caches the math parser required by the app', () => {
  const worker = read('sw.js');
  assert.match(worker, /afrazgraphzzz-shell-v3/);
  assert.match(worker, /'\.\/math-engine\.js'/);
});

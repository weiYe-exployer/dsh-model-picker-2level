/**
 * Structural tests. They run with the Node built-in test runner and check the
 * contract the Harness loader relies on, without needing a live Host.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const pkg = JSON.parse(read('package.json'));

test('manifest declares a bundle patch and a web client', () => {
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
});

test('exports expose the client half', () => {
  assert.equal(pkg.exports['./client'], './client.js');
  assert.equal(pkg.exports['.'], './index.js');
});

test('promised files exist', () => {
  for (const rel of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/zh.json', 'locale/en.json']) {
    assert.ok(existsSync(join(ROOT, rel)), `${rel} should exist`);
  }
});

test('patch inserts the package under its row id', () => {
  const patch = read('cordis.patch.yml');
  assert.match(patch, /^\s*-\s*insert:/m);
  assert.ok(patch.includes(pkg.name), 'patch should name the package');
  assert.ok(patch.includes('model-picker-2level'), 'patch should declare the row id');
});

test('client registers with the package name as module id', () => {
  const source = read('client.js');
  assert.match(source, /window\.__ModuleLoader__\.load\(/);
  assert.ok(source.includes(`'${pkg.name}'`), 'module id should equal the package name');
});

test('client does not import Harness client packages', () => {
  const source = read('client.js');
  assert.doesNotMatch(source, /require\(\s*['"]@deepseek-ai\/dsh-client-/);
});

test('host half exports apply()', () => {
  const source = read('index.js');
  assert.match(source, /export\s+function\s+apply/);
});

test('locale dictionaries carry meta title and description', () => {
  for (const lang of ['zh', 'en']) {
    const dict = JSON.parse(read(`locale/${lang}.json`));
    assert.ok(dict.meta?.title, `${lang}: meta.title`);
    assert.ok(dict.meta?.description, `${lang}: meta.description`);
  }
});

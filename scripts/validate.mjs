#!/usr/bin/env node
/**
 * Validate the plugin package before installing it into a profile.
 *
 * Checks the manifest fields a bundle needs, that the files the manifest
 * promises actually exist, that the patch is a well-formed Loader patch, that
 * the client half is loadable JavaScript, and that locale resources parse.
 *
 * Exit code 0 = valid, 1 = problems found (each printed with a prefix).
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const problems = [];
const notes = [];

function problem(message) {
  problems.push(message);
}

function readJson(rel) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) {
    problem(`${rel} does not exist`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    problem(`${rel} is not valid JSON: ${error.message}`);
    return null;
  }
}

// 1. Manifest basics -------------------------------------------------------
const pkg = readJson('package.json');
if (pkg) {
  if (!pkg.name) problem('package.json: missing "name"');
  if (!pkg.version) problem('package.json: missing "version"');
  if (pkg.type !== 'module') problem('package.json: "type" must be "module"');

  if (pkg.exports?.['.'] === undefined) problem('package.json: exports["."] is required');
  if (pkg.exports?.['./client'] === undefined) problem('package.json: exports["./client"] is required');

  const bundlePatch = pkg.dsh?.bundle?.patch;
  if (!bundlePatch) problem('package.json: dsh.bundle.patch is required');
  else if (!existsSync(join(ROOT, bundlePatch))) problem(`package.json: dsh.bundle.patch points at missing ${bundlePatch}`);

  const client = pkg.dsh?.client;
  if (!client) problem('package.json: dsh.client is required for a Web plugin');
  else {
    if (client.platform !== 'web') problem('package.json: dsh.client.platform must be "web"');
    if (!Array.isArray(client.inject ?? [])) problem('package.json: dsh.client.inject must be an array when present');
  }

  // "files" must not name paths that break the install
  for (const entry of pkg.files ?? []) {
    if (entry.startsWith('..')) problem(`package.json: files entry escapes the package: ${entry}`);
  }
}

// 2. Promised files exist --------------------------------------------------
for (const rel of ['index.js', 'client.js', 'cordis.patch.yml', 'icon.svg', 'locale/zh.json', 'locale/en.json']) {
  if (!existsSync(join(ROOT, rel))) problem(`missing required file: ${rel}`);
}

// 3. Client half is loadable ---------------------------------------------
const clientPath = join(ROOT, 'client.js');
if (existsSync(clientPath)) {
  const source = readFileSync(clientPath, 'utf8');
  if (!source.includes('window.__ModuleLoader__.load')) {
    problem('client.js must register through window.__ModuleLoader__.load');
  }
  const idMatch = source.match(/id:\s*['"]([^'"]+)['"]/);
  if (pkg && idMatch && idMatch[1] !== pkg.name) {
    problem(`client.js registers id "${idMatch[1]}" but package name is "${pkg.name}"`);
  }
  // A plain-JS plugin must not import Harness packages (see docs/design.md §9).
  const forbidden = [/require\(\s*['"]@deepseek-ai\/dsh-client-/];
  for (const pattern of forbidden) {
    if (pattern.test(source)) problem('client.js must not require Harness client packages (use dsh.client.inject for ordering)');
  }
}

// 4. Patch shape -----------------------------------------------------------
const patchPath = join(ROOT, 'cordis.patch.yml');
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8');
  if (!/^\s*-\s*insert:/m.test(patch)) problem('cordis.patch.yml must contain an "insert:" list');
  if (pkg && !patch.includes(pkg.name)) problem(`cordis.patch.yml must reference the package name ${pkg.name}`);
}

// 5. Locale resources ------------------------------------------------------
for (const rel of ['locale/zh.json', 'locale/en.json']) {
  const dict = readJson(rel);
  if (dict && (!dict.meta?.title || !dict.meta?.description)) {
    problem(`${rel}: meta.title and meta.description are required`);
  }
}

// 6. Icon is a real SVG ----------------------------------------------------
const iconPath = join(ROOT, 'icon.svg');
if (existsSync(iconPath)) {
  const icon = readFileSync(iconPath, 'utf8').trim();
  if (!icon.startsWith('<svg')) problem('icon.svg must be a root <svg> element');
}

// Report -------------------------------------------------------------------
if (notes.length > 0) {
  for (const note of notes) console.log(`note: ${note}`);
}
if (problems.length === 0) {
  console.log(`ok: ${pkg?.name ?? 'package'} looks installable`);
  process.exit(0);
}
for (const message of problems) console.error(`problem: ${message}`);
console.error(`\n${problems.length} problem(s) found`);
process.exit(1);

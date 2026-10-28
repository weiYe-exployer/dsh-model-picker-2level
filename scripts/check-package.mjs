import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { checkMarkdownLinks } from './lib/docs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli && existsSync(npmCli), 'Run this check through npm run check:package');
const tempParent = realpathSync(tmpdir());
const workspace = mkdtempSync(join(tempParent, 'dsh-package-check-'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const npm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], {
  cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});

try {
  const [packed] = JSON.parse(npm(['pack', '--json', '--ignore-scripts', '--pack-destination', workspace], root));
  for (const file of packed.files) {
    assert.ok(!/(^|\/)(node_modules|\.git|archive)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:tgz|log)$/.test(file.path),
      `Development or private file entered package: ${file.path}`);
  }
  const unpack = join(workspace, 'unpack');
  mkdirSync(unpack);
  const tarball = join(workspace, packed.filename);
  execFileSync('tar', ['-xf', tarball, '-C', unpack], { encoding: 'utf8' });
  const extracted = join(unpack, 'package');
  for (const file of pkg.files.filter((entry) => !entry.includes('*'))) {
    assert.ok(existsSync(join(extracted, file)), `Promised file missing from tarball: ${file}`);
  }
  assert.deepEqual(checkMarkdownLinks(extracted).problems, [], 'Packed Markdown contains missing relative targets');

  // Test installation outside the checkout so local devDependencies cannot
  // accidentally conceal missing runtime files or entry declarations.
  const smoke = join(workspace, 'smoke');
  mkdirSync(smoke);
  writeFileSync(join(smoke, 'package.json'), JSON.stringify({ name: 'dsh-package-smoke', private: true, type: 'module' }));
  npm(['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false', '--no-save', tarball], smoke);
  const installed = join(smoke, 'node_modules', pkg.name);
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.engines.dsh, pkg.engines.dsh);
  const host = await import(pathToFileURL(join(installed, manifest.exports['.'])).href);
  assert.equal(typeof host.apply, 'function');
  new Script(readFileSync(join(installed, manifest.exports['./client']), 'utf8'), { filename: 'packed-client.js' });
  assert.ok(existsSync(join(installed, manifest.dsh.bundle.patch)));
  console.log(`ok: ${pkg.name}@${pkg.version}: ${packed.entryCount} packed files, complete Markdown targets, isolated installation and entry checks`);
} finally {
  // Only remove the exact temporary directory created above, after verifying
  // the resolved target remains under the intended temporary parent.
  const realWorkspace = realpathSync(workspace);
  const child = relative(tempParent, realWorkspace);
  assert.ok(!isAbsolute(child) && child.startsWith('dsh-package-check-') && !child.includes(sep));
  rmSync(realWorkspace, { recursive: true, force: true });
}

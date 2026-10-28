import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Only inspect regular project files; never walk dependency, Git or symlink trees. */
export function markdownFiles(root) {
  const result = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['.git', 'node_modules'].includes(entry.name)) continue;
      const filename = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.md')) result.push(filename);
    }
  }
  visit(root);
  return result;
}

/** Validate inline relative file targets, including images. Remote URLs and anchors
 * are deliberately excluded; this is a file completeness check, not a web crawler. */
export function checkMarkdownLinks(root) {
  const problems = [];
  const files = markdownFiles(root);
  for (const filename of files) {
    const source = readFileSync(filename, 'utf8');
    // Preserve line numbers while ignoring examples in fenced code blocks.
    const content = source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm,
      (block) => block.replace(/[^\n]/g, ' '));
    for (const match of content.matchAll(/!?\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)/g)) {
      const target = match[1].replace(/^<|>$/g, '').split('#')[0].split('?')[0];
      if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const label = relative(root, filename).split(sep).join('/') + ':' + (source.slice(0, match.index).split('\n').length);
      let destination;
      try { destination = resolve(dirname(filename), decodeURIComponent(target)); }
      catch { problems.push(`${label}: invalid link encoding`); continue; }
      const inside = relative(root, destination);
      if (isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) {
        problems.push(`${label}: link escapes the project: ${target}`);
      } else if (!existsSync(destination) || !statSync(destination).isFile()) {
        problems.push(`${label}: missing file: ${target}`);
      }
    }
  }
  return { files: files.length, problems };
}

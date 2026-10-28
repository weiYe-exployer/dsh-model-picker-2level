import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkMarkdownLinks } from './lib/docs.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = checkMarkdownLinks(root);
for (const problem of result.problems) console.error('problem: ' + problem);
if (result.problems.length) process.exitCode = 1;
else console.log(`ok: relative file links in ${result.files} Markdown documents`);

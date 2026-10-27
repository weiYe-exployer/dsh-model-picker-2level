/**
 * Unit tests for the host-independent helpers in client.js.
 *
 * `client.js` runs inside the Harness module loader, so it cannot be imported
 * directly by node. This harness evaluates the factory with a stub `require`
 * and a stub `window`, then pulls the helpers off the returned `__pure` face.
 * Because there is no hot reload in the desktop app (ADR-0004 rule R3), this is
 * how ranking and selection logic gets verified without restarting anything.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** Load client.js in a sandbox and return the plugin's export object. */
function loadPlugin() {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  let captured = null;

  const reactStub = {
    createElement: () => null,
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  const requireStub = (id) => {
    if (id === 'react') return reactStub;
    if (id === 'react-dom') return { createPortal: () => null };
    throw new Error('unexpected require: ' + id);
  };

  const sandbox = {
    window: {
      __ModuleLoader__: {
        load: (definition) => {
          captured = definition.factory(requireStub);
        },
      },
    },
    document: undefined,
    requestAnimationFrame: () => {},
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'client.js' });

  assert.ok(captured, 'client.js should register through __ModuleLoader__.load');
  assert.ok(captured.__pure, 'plugin should expose __pure helpers for tests');
  return captured;
}

const plugin = loadPlugin();
const {
  subsequenceScore,
  rankModels,
  orderProviders,
  resolveEffort,
  rememberEffort,
  forgetEfforts,
  selectionFor,
  providerLabel,
  totalModels,
  flatMatches,
} = plugin.__pure;

// ── subsequenceScore ────────────────────────────────────────────────────

test('empty query matches everything with the best score', () => {
  assert.equal(subsequenceScore('anything', ''), 0);
  assert.equal(subsequenceScore('anything', '   '), 0);
});

test('contiguous substring hit scores best', () => {
  assert.equal(subsequenceScore('bytedance/doubao-seed-2.1-pro', 'doubao'), 0);
  assert.equal(subsequenceScore('bytedance/doubao-seed-2.1-pro', 'DOUBAO'), 0, 'case insensitive');
});

test('scattered in-order hit ranks behind a contiguous one', () => {
  const contiguous = subsequenceScore('glm-5.3', 'glm');
  const scattered = subsequenceScore('g-l-m', 'glm');
  assert.equal(contiguous, 0);
  assert.ok(scattered > contiguous, 'scattered hits rank behind contiguous hits');
});

test('out-of-order or missing characters do not match', () => {
  assert.equal(subsequenceScore('glm', 'mlg'), -1);
  assert.equal(subsequenceScore('glm', 'zzz'), -1);
});

// ── rankModels ──────────────────────────────────────────────────────────

const MODELS = [
  { id: 'z-ai/glm-5.3', name: 'z-ai/glm-5.3' },
  { id: 'moonshotai/kimi-k3', name: 'moonshotai/kimi-k3' },
  { id: 'z-ai/glm-5.3-flash', name: 'z-ai/glm-5.3-flash' },
];

test('empty query preserves catalog order (no re-sorting)', () => {
  assert.equal(JSON.stringify(rankModels(MODELS, '').map((m) => m.id)), JSON.stringify(MODELS.map((m) => m.id)));
});

test('search keeps catalog order among equal-scoring hits', () => {
  const hit = rankModels(MODELS, 'glm');
  assert.equal(JSON.stringify(hit.map((m) => m.id)), JSON.stringify(['z-ai/glm-5.3', 'z-ai/glm-5.3-flash']));
});

test('search matches by display name too', () => {
  const list = [{ id: 'x', name: 'Doubao Seed 2.1 Pro' }];
  assert.equal(rankModels(list, 'seed').length, 1);
});

test('no match yields an empty list, and input is never mutated', () => {
  const before = JSON.stringify(MODELS);
  assert.equal(rankModels(MODELS, 'zzz').length, 0);
  assert.equal(JSON.stringify(MODELS), before, 'input array must not be mutated');
});

// ── orderProviders ──────────────────────────────────────────────────────

test('account and official providers come first, the rest keep config order', () => {
  const groups = [
    { id: 'zai-coding-cn' },
    { id: 'qiniu' },
    { id: 'deepseek-official' },
    { id: 'deepseek-account' },
    { id: 'lyrouter' },
  ];
  assert.equal(
    JSON.stringify(orderProviders(groups).map((g) => g.id)),
    JSON.stringify(['deepseek-account', 'deepseek-official', 'zai-coding-cn', 'qiniu', 'lyrouter']),
  );
});

test('orderProviders tolerates junk entries', () => {
  const groups = [null, { id: 'a' }, { name: 'no-id' }, { id: 'b' }];
  assert.equal(JSON.stringify(orderProviders(groups).map((g) => g.id)), JSON.stringify(['a', 'b']));
  assert.equal(orderProviders(undefined).length, 0);
});

// ── resolveEffort / selectionFor ────────────────────────────────────────

const GROUP = { id: 'qiniu' };
const MODEL = { id: 'gpt-4', reasoning: { defaultEffort: 'medium' } };

test('picking a different model uses that model default effort', () => {
  const current = { provider: 'lyrouter', model: 'other', reasoningEffort: 'high' };
  assert.equal(resolveEffort(current, GROUP, MODEL), 'medium');
});

test('re-picking the current model keeps its current effort', () => {
  const current = { provider: 'qiniu', model: 'gpt-4', reasoningEffort: 'high' };
  assert.equal(resolveEffort(current, GROUP, MODEL), 'high');
});

test('current model without explicit effort falls back to the default', () => {
  const current = { provider: 'qiniu', model: 'gpt-4' };
  assert.equal(resolveEffort(current, GROUP, MODEL), 'medium');
});

test('models without reasoning produce a selection with no effort field', () => {
  const selection = selectionFor(null, GROUP, { id: 'plain' });
  assert.equal(JSON.stringify(selection), JSON.stringify({ provider: 'qiniu', model: 'plain' }));
});

test('a model that lost reasoning support never inherits a stale current effort', () => {
  const selection = selectionFor({ provider: 'qiniu', model: 'plain', reasoningEffort: 'high' }, GROUP, { id: 'plain' });
  assert.equal(JSON.stringify(selection), JSON.stringify({ provider: 'qiniu', model: 'plain' }));
});

test('selection carries the resolved effort when one exists', () => {
  const selection = selectionFor(null, GROUP, MODEL);
  assert.equal(JSON.stringify(selection), JSON.stringify({ provider: 'qiniu', model: 'gpt-4', reasoningEffort: 'medium' }));
});

// ── providerLabel / totalModels / flatMatches ───────────────────────────

test('the account provider renders through the localized name', () => {
  assert.equal(providerLabel({ id: 'deepseek-account', name: 'ignored' }, 'DeepSeek 账号'), 'DeepSeek 账号');
  assert.equal(providerLabel({ id: 'qiniu', name: '七牛云' }, 'DeepSeek 账号'), '七牛云');
  assert.equal(providerLabel({ id: 'bare' }, 'acct'), 'bare');
});

test('totalModels counts across providers', () => {
  assert.equal(totalModels([{ models: [1, 2] }, { models: [3] }, {}]), 3);
  assert.equal(totalModels(undefined), 0);
});

test('flatMatches searches every provider and keeps provider grouping', () => {
  const groups = [
    { id: 'qiniu', models: [{ id: 'z-ai/glm-5.3' }] },
    { id: 'lyrouter', models: [{ id: 'z-ai/glm-5.3' }, { id: 'qwen/qwen3.8' }] },
  ];
  const rows = flatMatches(groups, 'glm');
  assert.equal(rows.length, 2, 'both providers contribute a hit');
  assert.equal(JSON.stringify(rows.map((row) => row.group.id)), JSON.stringify(['qiniu', 'lyrouter']));
});

// ── registration contract (rule R2) ─────────────────────────────────────

test('plugin re-declares the model seat child slot (ADR-0004 rule R2)', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  assert.match(
    source,
    /children:\s*\{[\s\S]*?'conversation\.input\.model\.label'/,
    'the winner of the single slot must re-declare its child slot',
  );
});

test('plugin does not require Harness client packages', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  assert.doesNotMatch(source, /require\(\s*['"]@deepseek-ai\/dsh-client-/);
});

test('plugin only uses theme tokens for colours', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  const css = source.slice(source.indexOf('const CSS ='), source.indexOf('let styleInjected'));
  const literalColours = css.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.equal(literalColours.length, 0, 'CSS must use --dsw-alias-* tokens, not literal colours');
});

// ── level-2 browsing independence (regression) ───────────────────────────

test('level 2 browses the clicked provider, not the provider in use', () => {
  const { resolveBrowsingGroup } = loadPlugin().__pure;
  const groups = [
    { id: 'zai-coding-cn', models: [{ id: 'glm-5.3' }] },
    { id: 'qiniu', models: [{ id: 'z-ai/glm-5.3' }] },
    { id: 'lyrouter', models: [{ id: 'qwen/qwen3.8' }] },
  ];

  // Session currently uses `lyrouter`; the user clicks `qiniu`.
  const browsed = resolveBrowsingGroup(groups, 'qiniu', 'models', 'models');
  assert.notEqual(browsed, null);
  assert.equal(browsed.id, 'qiniu', 'must show the clicked provider, not the current one');
});

test('level 2 returns null outside the models pane', () => {
  const { resolveBrowsingGroup } = loadPlugin().__pure;
  const groups = [{ id: 'qiniu', models: [] }];
  assert.equal(resolveBrowsingGroup(groups, 'qiniu', 'providers', 'models'), null);
  assert.equal(resolveBrowsingGroup(groups, 'qiniu', 'effort', 'models'), null);
});

test('level 2 tolerates a stale or missing provider id', () => {
  const { resolveBrowsingGroup } = loadPlugin().__pure;
  const groups = [{ id: 'qiniu', models: [] }];
  assert.equal(resolveBrowsingGroup(groups, 'removed-provider', 'models', 'models'), null);
  assert.equal(resolveBrowsingGroup(groups, null, 'models', 'models'), null);
  assert.equal(resolveBrowsingGroup(undefined, 'qiniu', 'models', 'models'), null);
});

// ── menu follows the trigger (regression) ────────────────────────────────

test('open menu re-measures on window resize and scroll', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  assert.match(source, /addEventListener\(\s*'resize'/, 'must reposition when the window resizes');
  assert.match(source, /addEventListener\(\s*'scroll'[\s\S]{0,40}true/, 'must reposition when an ancestor scrolls');
  assert.match(source, /removeEventListener\(\s*'resize'/, 'listeners must be cleaned up');
});

// ── effort memory across model switches (regression) ────────────────────

test('a remembered effort survives switching to another model and back', () => {
  forgetEfforts();
  const qiniu = { id: 'qiniu' };
  const glm = { id: 'glm-5.3', reasoning: { defaultEffort: 'low', efforts: [{ id: 'high' }] } };
  const other = { id: 'other' };
  const otherModel = { id: 'plain', reasoning: { defaultEffort: 'medium' } };

  // The user picks `high` for qiniu/glm-5.3, then switches to another provider.
  rememberEffort('qiniu', 'glm-5.3', 'high');
  const afterSwitch = { provider: 'lyrouter', model: 'plain', reasoningEffort: 'medium' };

  assert.equal(
    resolveEffort(afterSwitch, qiniu, glm),
    'high',
    'returning to the model must restore the remembered level, not the provider default',
  );
  assert.equal(
    resolveEffort(afterSwitch, other, otherModel),
    'medium',
    'a model with no remembered choice still uses its own default',
  );
  forgetEfforts();
});

test('an explicit "provider default" choice is remembered as such', () => {
  forgetEfforts();
  const group = { id: 'qiniu' };
  const model = { id: 'gpt-4', reasoning: { defaultEffort: 'medium' } };
  rememberEffort('qiniu', 'gpt-4', undefined);

  const selection = selectionFor({ provider: 'x', model: 'y' }, group, model);
  assert.equal(
    JSON.stringify(selection),
    JSON.stringify({ provider: 'qiniu', model: 'gpt-4' }),
    'remembering "provider default" must omit the field so the provider decides',
  );
  forgetEfforts();
});

test('effort memory is keyed per provider and model', () => {
  forgetEfforts();
  const model = { id: 'a', reasoning: { defaultEffort: 'low' } };
  rememberEffort('p1', 'a', 'high');
  assert.equal(resolveEffort(null, { id: 'p1' }, model), 'high');
  assert.equal(resolveEffort(null, { id: 'p2' }, model), 'low', 'another provider must not inherit the choice');
  forgetEfforts();
});

// ── outside click dismissal (regression) ────────────────────────────────

test('open menu closes on a pointer press outside trigger and menu', () => {
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8');
  assert.match(source, /addEventListener\(\s*'pointerdown'/, 'must listen for outside presses');
  assert.match(source, /menuRef\.current\.contains\(target\)/, 'presses inside the portal must not close it');
  assert.match(source, /rootRef\.current\.contains\(target\)/, 'presses on the trigger must not close it');
  assert.match(source, /removeEventListener\(\s*'pointerdown'/, 'listener must be cleaned up');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// React detects DOM capabilities at module initialization.
const bootstrap = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = bootstrap.window;
globalThis.document = bootstrap.window.document;
const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: bootstrap.window.navigator });
const ReactDOM = await import('react-dom');
const { createRoot } = await import('react-dom/client');
delete globalThis.window;
delete globalThis.document;
if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
else delete globalThis.navigator;
bootstrap.window.close();

// Use real React and bubbling DOM events. Only the Harness services are mocked.
async function mount(options = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { pretendToBeVisual: true });
  const { window } = dom;
  const previous = new Map();
  for (const [key, value] of Object.entries({ window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true })) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  const frames = [];
  const timers = new Map();
  let nextTimer = 0;
  let plugin, spec, Component;
  const errors = [];
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: Object.assign(window, { __ModuleLoader__: { load: (definition) => {
      plugin = definition.factory((id) => id === 'react' ? React : ReactDOM);
    } } }),
    document: window.document, console: { ...console, error: (...args) => errors.push(args) },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => timers.delete(id),
  });
  const calls = [];
  let snapshot = options.snapshot ?? {
    status: 'ready', failures: [],
    current: { provider: 'p', model: 'a', reasoningEffort: 'low' },
    groups: [{ id: 'p', models: [
      { id: 'a', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
      { id: 'b' }, { id: 'c' },
    ] }, { id: 'q', models: [{ id: 'd' }] }],
  };
  const listeners = new Set();
  const directory = {
    store: { getSnapshot: () => snapshot, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } },
    load: () => {},
    select: async (selection) => { calls.push(selection); return options.select ? options.select(selection) : { ok: true }; },
  };
  const scope = {
    sessions: { subagentAddress: () => options.subagent ? 'child' : undefined },
    modelDirectories: { directoryFor: (id) => options.resolve ? options.resolve(id, directory) : directory },
    slots: { inject: (_name, fn) => fn(), register: (value, component) => { spec = value; Component = component; } },
  };
  plugin.apply({ effect: (fn) => fn(), locale: { register: () => {} }, inject: (_keys, fn) => fn(scope) });
  const root = createRoot(window.document.getElementById('app'));
  const t = (key) => key;
  async function render(id = 's1') { await act(async () => { root.render(React.createElement(Component, { ...spec.inject(id), t })); }); }
  await render();
  const query = (selector) => window.document.querySelector(selector);
  async function event(node, type, init = {}) {
    assert.ok(node, `missing target for ${type}`);
    const dispatched = type === 'keydown'
      ? new window.KeyboardEvent(type, { bubbles: true, cancelable: true, ...init })
      : new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
    await act(async () => { node.dispatchEvent(dispatched); });
    return dispatched;
  }
  async function click(selector) { await event(typeof selector === 'string' ? query(selector) : selector, 'click'); }
  async function open() {
    await click('.dmp-trigger');
    await act(async () => { frames.splice(0).forEach((fn) => fn()); });
  }
  return {
    query, calls, plugin, directory, render, click, open, timers, errors,
    async input(value) {
      const node = query('.dmp-search');
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(node, value);
        node.dispatchEvent(new window.Event('input', { bubbles: true }));
      });
    },
    async pointer(selector) { await event(query(selector), 'pointerdown'); },
    key: (key, selector = '.dmp-search', init = {}) => event(query(selector), 'keydown', { key, ...init }),
    async update(next) { await act(async () => { snapshot = next; listeners.forEach((fn) => fn()); }); },
    async cleanup() {
      await act(async () => root.unmount());
      dom.window.close();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

async function check(options, run) {
  const ui = await mount(options);
  try { await run(ui); } finally { await ui.cleanup(); }
}

test('one ArrowDown in search advances exactly one provider', () => check({}, async (ui) => {
  await ui.open();
  await ui.key('ArrowDown');
  assert.equal(ui.query('[data-dmp-active="1"] .dmp-row-title').textContent, 'q');
}));

test('Enter on the effort button opens effort choices without selecting a provider', () => check({}, async (ui) => {
  await ui.open();
  await ui.key('Enter', '.dmp-effort-row button');
  // Native Enter activates the button after keydown if not prevented.
  await ui.click('.dmp-effort-row button');
  assert.equal(ui.query('.dmp-back-name').textContent, 'effort.title');
}));

test('failed effort selection leaves remembered effort unchanged', () => check({ select: () => ({ ok: false, error: { code: 'session/writer-held' } }) }, async (ui) => {
  await ui.open();
  await ui.click('.dmp-effort-row button');
  await ui.click(ui.query('.dmp-groups').querySelectorAll('button')[2]);
  assert.ok(ui.query('.dmp-error'));
  assert.equal(ui.plugin.__pure.resolveEffort(null, { id: 'p' }, { id: 'a', reasoning: {} }), 'low');
}));

test('unavailable directory keeps a compact trigger and manual retry really resolves', () => {
  let ready = false;
  return check({ resolve: (_id, directory) => { if (!ready) throw new Error('not ready'); return directory; } }, async (ui) => {
    assert.ok(ui.query('.dmp-trigger'));
    await ui.open();
    assert.match(ui.query('.dmp-diag-body').textContent, /not ready/);
    ready = true;
    await ui.click('.dmp-diag-retry');
    assert.ok(ui.query('.dmp-provider-row'));
  });
});

test('subagent sessions show a disabled trigger', () => check({ subagent: true }, async (ui) => {
  assert.equal(ui.query('.dmp-trigger')?.disabled, true);
}));

test('changing session rebinds the directory instead of selecting in the previous session', () => {
  const selected = [];
  return check({ resolve: (id, directory) => ({ ...directory, select: async () => { selected.push(id); return { ok: true }; } }) }, async (ui) => {
    await ui.render('s2');
    await ui.open();
    await ui.click('.dmp-provider-row');
    await ui.click('.dmp-model-row');
    assert.deepEqual(selected, ['s2']);
  });
});

test('a selection completing after close and reopen does not dismiss the new menu', () => {
  let finish;
  return check({ select: () => new Promise((resolve) => { finish = resolve; }) }, async (ui) => {
    await ui.open();
    await ui.click('.dmp-provider-row');
    await ui.click('.dmp-model-row');
    await ui.key('Escape');
    await ui.key('Escape');
    await ui.open();
    await act(async () => finish({ ok: true }));
    assert.ok(ui.query('.dmp-menu'));
  });
});

test('IME confirmation does not choose a provider', () => check({}, async (ui) => {
  await ui.open();
  await ui.key('Enter', '.dmp-search', { isComposing: true });
  assert.ok(ui.query('.dmp-provider-row'));
  assert.equal(ui.query('.dmp-back'), null);
}));

test('level 1 search spans providers, level 2 search stays local, Escape clears it first', () => check({}, async (ui) => {
  await ui.open();
  await ui.input('d');
  assert.equal(ui.query('.dmp-model-id').textContent, 'd');
  await ui.key('Escape');
  assert.ok(ui.query('.dmp-provider-row'));
  await ui.click('.dmp-provider-row');
  await ui.input('d');
  assert.equal(ui.query('.dmp-model-id'), null);
  assert.equal(ui.query('.dmp-back-name').textContent, 'p');
  await ui.key('Escape');
  assert.ok(ui.query('.dmp-groups'));
  await ui.key('Escape');
  assert.ok(ui.query('.dmp-provider-row'));
}));

test('inside pointer presses preserve menu, outside presses dismiss it', () => check({}, async (ui) => {
  await ui.open();
  await ui.pointer('.dmp-search');
  assert.ok(ui.query('.dmp-menu'));
  await ui.pointer('#app');
  assert.equal(ui.query('.dmp-menu'), null);
}));

test('rapid double clicks submit only once, and successful effort writes are remembered', () => {
  let finish;
  return check({ select: () => new Promise((resolve) => { finish = resolve; }) }, async (ui) => {
    await ui.open();
    await ui.click('.dmp-effort-row button');
    const high = ui.query('.dmp-groups').querySelectorAll('button')[2];
    await act(async () => { high.click(); high.click(); });
    assert.equal(ui.calls.length, 1);
    await act(async () => finish({ ok: true }));
    assert.equal(ui.query('.dmp-menu'), null);
    assert.equal(ui.plugin.__pure.resolveEffort(null, { id: 'p' }, { id: 'a', reasoning: {} }), 'high');
  });
});

test('rejected selection stays open, shows an error and allows a second attempt', () => {
  let count = 0;
  return check({ select: () => { if (++count === 1) throw new Error('offline'); return { ok: true }; } }, async (ui) => {
    await ui.open();
    await ui.click('.dmp-provider-row');
    await ui.click('.dmp-model-row');
    assert.ok(ui.query('.dmp-error'));
    await ui.click('.dmp-model-row');
    assert.equal(ui.calls.length, 2);
    assert.equal(ui.query('.dmp-menu'), null);
  });
});

test('directory resolution retries are bounded and cancelled when unmounted', async () => {
  let attempts = 0;
  const ui = await mount({ resolve: () => { attempts += 1; throw new Error('not ready'); } });
  try {
    while (ui.timers.size) {
      const [id, fn] = ui.timers.entries().next().value;
      ui.timers.delete(id);
      await act(async () => fn());
    }
    assert.equal(attempts, 9, 'one injection probe plus eight effect attempts');
    await ui.open();
    await ui.click('.dmp-diag-retry');
    assert.equal(ui.timers.size, 1);
  } finally { await ui.cleanup(); }
  assert.equal(ui.timers.size, 0);
});

test('searching in the effort pane selects an effort instead of a model', () => check({}, async (ui) => {
  await ui.open();
  await ui.click('.dmp-effort-row button');
  await ui.input('high');
  assert.equal(ui.query('.dmp-groups').querySelectorAll('button').length, 1);
  assert.equal(ui.query('.dmp-model-id').textContent, 'High');
  await ui.key('Enter');
  assert.equal(ui.calls[0].model, 'a');
  assert.equal(ui.calls[0].reasoningEffort, 'high');
}));

test('opening another provider does not highlight its coincidentally identical model id', () => check({ snapshot: {
  status: 'ready', failures: [], current: { provider: 'p', model: 'shared' },
  groups: [{ id: 'p', models: [{ id: 'shared' }] }, { id: 'q', models: [{ id: 'first' }, { id: 'shared' }] }],
} }, async (ui) => {
  await ui.open();
  await ui.click(ui.query('.dmp-groups').querySelectorAll('button')[1]);
  assert.equal(ui.query('[data-dmp-active="1"] .dmp-model-id').textContent, 'first');
}));

test('only Enter opens the trigger; arrows and Space do not open it', () => check({}, async (ui) => {
  await ui.key('ArrowDown', '.dmp-trigger');
  assert.ok(!ui.query('.dmp-menu'), 'ArrowDown must not open the menu');
  const space = await ui.key(' ', '.dmp-trigger');
  assert.equal(space.defaultPrevented, true, 'prevent native button Space activation');
  assert.equal(ui.query('.dmp-menu'), null);
  await ui.key('Enter', '.dmp-trigger');
  assert.ok(ui.query('.dmp-menu'));
  await ui.key('Enter');
  assert.equal(ui.query('.dmp-back-name').textContent, 'p');
  await ui.key('ArrowDown');
  await ui.key('Enter');
  assert.equal(ui.calls[0].model, 'b');
  assert.equal(ui.query('.dmp-menu'), null);
}));

for (const pane of ['models', 'effort']) {
  test(`Tab and Shift+Tab have no custom action in the ${pane} pane`, () => check({}, async (ui) => {
    await ui.open();
    await ui.click(pane === 'models' ? '.dmp-provider-row' : '.dmp-effort-row button');
    await ui.input('a');
    const header = ui.query('.dmp-back-name').textContent;
    for (const shiftKey of [false, true]) {
      const event = await ui.key('Tab', '.dmp-search', { shiftKey });
      assert.equal(event.defaultPrevented, false);
      assert.equal(ui.query('.dmp-back-name')?.textContent, header);
      assert.equal(ui.query('.dmp-search').value, 'a');
      assert.equal(ui.calls.length, 0);
    }
    // jsdom does not perform native Tab traversal. These assertions verify
    // only that the plugin leaves it to the browser and never navigates back.
  }));

  test(`Escape clears search then returns from ${pane}, then closes the menu`, () => check({}, async (ui) => {
    await ui.open();
    await ui.click(pane === 'models' ? '.dmp-provider-row' : '.dmp-effort-row button');
    await ui.input('a');
    await ui.key('Escape');
    assert.equal(ui.query('.dmp-search').value, '');
    assert.ok(ui.query('.dmp-back'));
    await ui.key('Escape');
    assert.equal(ui.query('.dmp-back'), null);
    assert.ok(ui.query('.dmp-provider-row'));
    await ui.key('Escape');
    assert.equal(ui.query('.dmp-menu'), null);
    assert.equal(ui.calls.length, 0);
  }));
}

test('Space cannot activate menu buttons and remains editable in search', () => check({}, async (ui) => {
  await ui.open();
  for (const selector of ['.dmp-provider-row', '.dmp-effort-row button']) {
    const space = await ui.key(' ', selector);
    assert.equal(space.defaultPrevented, true);
    assert.equal(ui.query('.dmp-back'), null);
  }
  const searchSpace = await ui.key(' ');
  assert.equal(searchSpace.defaultPrevented, false);
  await ui.input('a b');
  assert.equal(ui.query('.dmp-search').value, 'a b');
  assert.equal(ui.calls.length, 0);
  await ui.key('Escape');
  assert.equal(ui.query('.dmp-search').value, '');
  assert.ok(ui.query('.dmp-menu'));
}));

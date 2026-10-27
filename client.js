/**
 * Browser half of @local/dsh-model-picker-2level.
 *
 * A two-level model picker for the composer model seat
 * (`conversation.input.model`):
 *
 *   ① providers  → ② that provider's models
 *
 * Search stays available on both levels: level 1 searches every provider's
 * models (the stock behaviour), level 2 searches within the chosen provider.
 *
 * Data and submission ride the built-in `modelDirectories` service — the same
 * one the stock picker and the `/model` command use — so no second source of
 * truth is introduced. The helpers below build selections and rank names; they
 * are re-exported on `__pure` so node tests can call them without a live
 * Harness (the module loader ignores extra keys).
 *
 * Editing notes:
 *  - The single slot's winner must re-declare its child slot
 *    `conversation.input.model.label`, or third-party registrations into it
 *    silently disappear (docs/decisions.md ADR-0004, rule R2).
 *  - There is no hot reload: changing this file requires restarting the app
 *    (rule R3).
 *
 * @see docs/design.md
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-model-picker-2level',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    const NS = 'model-picker-2level';

    // ─────────────────────────────────────────────────────────────────────
    // pure helpers — no React, no DOM, no host access
    // ─────────────────────────────────────────────────────────────────────

    /** Index of `ch` in `text` at or after `from`, or -1. */
    function indexFrom(text, ch, from) {
      for (let i = from; i < text.length; i += 1) if (text[i] === ch) return i;
      return -1;
    }

    /**
     * Ordered-subsequence match, mirroring the stock picker's ranking style:
     * a contiguous substring hit scores best (0), a scattered in-order hit
     * scores 1000 + position of its first character, and -1 means no match.
     * Lower ranks first.
     */
    function subsequenceScore(label, query) {
      const text = String(label ?? '').toLowerCase();
      const needle = String(query ?? '').trim().toLowerCase();
      if (needle === '') return 0;
      if (text.includes(needle)) return 0;
      let cursor = 0;
      let first = -1;
      for (const ch of needle) {
        const at = indexFrom(text, ch, cursor);
        if (at === -1) return -1;
        if (first === -1) first = at;
        cursor = at + 1;
      }
      return 1000 + first;
    }

    /**
     * Filter and rank one provider's models. A model matches by id or by its
     * display name; catalog order breaks ties, so equal hits stay grouped the
     * way the catalog declares them.
     */
    function rankModels(models, query) {
      const list = Array.isArray(models) ? models : [];
      const q = String(query ?? '').trim();
      if (q === '') return list.slice();
      const scored = [];
      for (let i = 0; i < list.length; i += 1) {
        const model = list[i];
        const byId = subsequenceScore(model?.id, q);
        const byName = subsequenceScore(model?.name, q);
        if (byId === -1 && byName === -1) continue;
        const score = byId === -1 ? byName : byName === -1 ? byId : Math.min(byId, byName);
        scored.push({ model, score, index: i });
      }
      scored.sort((a, b) => (a.score - b.score) || (a.index - b.index));
      return scored.map((entry) => entry.model);
    }

    /**
     * Provider display order: the account and official providers first, every
     * other provider keeping its configured order. Mirrors the stock
     * `orderModelProviders` so our list matches `/model` and the stock picker.
     */
    function orderProviders(groups) {
      const list = Array.isArray(groups) ? groups.filter((group) => group && typeof group.id === 'string') : [];
      const weight = (id) => (id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2);
      return list
        .map((group, index) => ({ group, index }))
        .sort((a, b) => (weight(a.group.id) - weight(b.group.id)) || (a.index - b.index))
        .map((entry) => entry.group);
    }

    /**
     * Last effort the user explicitly picked, keyed by provider/model.
     *
     * The session only remembers the effort of the model currently in use, so
     * switching away and back used to reset the reasoning level to the provider
     * default. This map keeps the per-model choice alive for the session.
     */
    const effortMemory = new Map();

    /** Stable effort-memory key for one provider/model pair. */
    function effortKey(provider, model) {
      return String(provider) + '\u0000' + String(model);
    }

    /** Record an explicit effort choice (undefined means "provider default"). */
    function rememberEffort(provider, model, effort) {
      if (provider === undefined || model === undefined) return;
      effortMemory.set(effortKey(provider, model), effort);
    }

    /** Drop every remembered choice (used by tests). */
    function forgetEfforts() {
      effortMemory.clear();
    }

    /**
     * Reasoning effort to submit with a choice.
     *
     * Order of precedence: the effort already in use for this exact model, then
     * the remembered choice for it, then the model's provider default.
     */
    function resolveEffort(current, group, model) {
      if (!model?.reasoning) return undefined;
      const same = Boolean(current) && current.provider === group?.id && current.model === model?.id;
      const fallback = model?.reasoning?.defaultEffort;
      if (same) return current.reasoningEffort ?? fallback;
      const key = effortKey(group?.id, model?.id);
      return effortMemory.has(key) ? effortMemory.get(key) : fallback;
    }

    /** Build the selection payload for a model row. */
    function selectionFor(current, group, model) {
      const selection = { provider: group.id, model: model.id };
      const effort = resolveEffort(current, group, model);
      if (effort !== undefined) selection.reasoningEffort = effort;
      return selection;
    }

    /** Human label for a provider. */
    function providerLabel(provider, accountName) {
      if (provider?.id === 'deepseek-account') return accountName;
      return provider?.name || provider?.id || '';
    }

    /** Total model count across providers (used by the search hit counter). */
    function totalModels(groups) {
      return (Array.isArray(groups) ? groups : []).reduce(
        (sum, group) => sum + (Array.isArray(group?.models) ? group.models.length : 0),
        0,
      );
    }

    /** Flatten every provider's models into search rows, preserving order. */
    function flatMatches(groups, query) {
      const rows = [];
      for (const group of orderProviders(groups)) {
        for (const model of rankModels(group.models, query)) rows.push({ group, model });
      }
      return rows;
    }

    // ─────────────────────────────────────────────────────────────────────
    // styles — theme tokens only, `dmp-` prefix, scoped to the component
    // ─────────────────────────────────────────────────────────────────────

    const CSS = `.dmp-root{min-width:0;position:relative}
.dmp-trigger{display:flex;align-items:center;gap:4px;height:28px;max-width:min(360px,45cqw);min-width:0;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm);background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:13px;font-weight:400;line-height:20px}
.dmp-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dmp-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dmp-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline:none}
.dmp-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmp-trigger-effort{flex-shrink:1000;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption)}
.dmp-trigger-glyph{width:16px;height:16px;flex:none;opacity:.75}
.dmp-chevron{flex:none;width:7px;height:7px;margin-left:3px;border-right:1.5px solid var(--dsw-alias-label-caption);border-bottom:1.5px solid var(--dsw-alias-label-caption);transform:rotate(45deg) translate(-1px,-1px);transition:transform .12s}
.dmp-chevron-open{transform:rotate(-135deg) translate(-1px,-1px)}
.dmp-menu{position:fixed;z-index:1100;display:flex;flex-direction:column;min-width:min(300px,100vw - 32px);max-width:min(420px,100vw - 32px);max-height:min(380px,100vh - 96px);overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent)}
.dmp-search-row{position:relative;padding:2px 2px 6px}
.dmp-search{width:100%;height:30px;box-sizing:border-box;padding:0 26px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;outline:none}
.dmp-search:focus{border-color:var(--dsw-alias-brand-primary)}
.dmp-search-glyph{position:absolute;left:11px;top:12px;width:9px;height:9px;border:1.5px solid var(--dsw-alias-label-caption);border-radius:50%;pointer-events:none}
.dmp-search-glyph:after{content:'';position:absolute;right:-4px;bottom:-3px;width:5px;height:1.5px;background:var(--dsw-alias-label-caption);transform:rotate(45deg)}
.dmp-search-clear{position:absolute;right:8px;top:9px;width:16px;height:16px;border:none;border-radius:50%;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:11px;line-height:1;padding:0}
.dmp-groups{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.dmp-group-label{padding:6px 8px 2px;font-size:11px;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.dmp-row{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;border:none;border-radius:8px;background:none;color:inherit;cursor:pointer;text-align:left}
.dmp-row:focus-visible{outline:none}
.dmp-row-active{background:var(--dsw-alias-interactive-bg-hover)}
.dmp-row-current{color:var(--dsw-alias-brand-primary)}
.dmp-row-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px}
.dmp-row-title{font-size:13px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmp-row-sub{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmp-row-meta{flex:none;font-size:11px;color:var(--dsw-alias-label-caption)}
.dmp-provider-row{padding:7px 8px}
.dmp-provider-row .dmp-row-title{font-weight:500}
.dmp-model-row{padding:4px 8px}
.dmp-model-id{font-family:var(--dsw-font-family-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dmp-badge{flex:none;padding:0 5px;border-radius:4px;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary);font-size:10px;line-height:16px}
.dmp-check{flex:none;width:14px;height:14px;color:var(--dsw-alias-brand-primary)}
.dmp-chev{flex:none;width:6px;height:6px;margin-right:4px;border-top:1.5px solid var(--dsw-alias-label-caption);border-right:1.5px solid var(--dsw-alias-label-caption);transform:rotate(45deg)}
.dmp-back{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;padding:5px 6px;margin-bottom:2px;border:none;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;text-align:left}
.dmp-back-glyph{font-size:14px;line-height:1}
.dmp-back-name{color:var(--dsw-alias-label-primary);font-weight:500}
.dmp-status{padding:10px 8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.dmp-error{margin:4px 2px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;display:flex;align-items:center;gap:8px}
.dmp-retry{margin-left:auto;border:none;border-radius:6px;padding:2px 8px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-state-error-primary);cursor:pointer;font-size:11px}
.dmp-warn{margin:2px;padding:4px 8px;font-size:11px;color:var(--dsw-alias-state-warn-primary)}
.dmp-effort-row{margin-top:2px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:4px}
.dmp-effort-head{padding:4px 8px 2px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.dmp-diag{padding:10px 10px 8px}
.dmp-diag-title{font-size:12px;color:var(--dsw-alias-state-error-primary);margin-bottom:6px}
.dmp-diag-body{margin:0 0 6px;padding:6px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-interactive-bg-hover));color:var(--dsw-alias-label-primary);font-size:11px;line-height:1.5;white-space:pre-wrap;word-break:break-word;max-height:160px;overflow:auto;user-select:text}
.dmp-diag-hint{font-size:11px;color:var(--dsw-alias-label-caption)}
.dmp-diag-retry{margin-top:8px;padding:4px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer}
.dmp-trigger[data-dmp-unavailable]{color:var(--dsw-alias-state-error-primary)}`;

    let styleInjected = false;

    /** Inject the stylesheet once per document. */
    function ensureStyles() {
      if (styleInjected || typeof document === 'undefined') return;
      const tagId = NS + '/styles.css';
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') !== null) {
        styleInjected = true;
        return;
      }
      const tag = document.createElement('style');
      tag.dataset.plugin = NS;
      tag.dataset.pluginCss = tagId;
      tag.textContent = CSS;
      document.head.appendChild(tag);
      styleInjected = true;
    }

    // ─────────────────────────────────────────────────────────────────────
    // presentational atoms
    // ─────────────────────────────────────────────────────────────────────

    function Check() {
      return h(
        'svg',
        { className: 'dmp-check', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        h('path', {
          d: 'M3 8.5 L6.2 11.7 L13 4.9',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      );
    }

    function TriggerGlyph() {
      return h(
        'svg',
        { className: 'dmp-trigger-glyph', viewBox: '0 0 16 16', 'aria-hidden': 'true' },
        h('circle', { cx: 8, cy: 8, r: 3, fill: 'currentColor' }),
        h('circle', { cx: 8, cy: 8, r: 6.2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, opacity: 0.55 }),
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // the picker component
    // ─────────────────────────────────────────────────────────────────────

    const PANE_PROVIDERS = 'providers';
    const PANE_MODELS = 'models';
    const PANE_EFFORT = 'effort';

    // A slot can reuse its component across conversations. Give each session
    // its own directory subscription and pending-operation lifecycle.
    function PickerSeat(props) {
      return h(ModelPicker, { ...props, key: props.sessionId });
    }

    function ModelPicker(props) {
      ensureStyles();

      const { t, locked } = props;

      // The directory can be unavailable on the first render (the session
      // binding may not exist yet) and it can also fail outright. Resolve it
      // here with retries instead of trusting the inject-time attempt alone,
      // and keep the reason visible so a failure is diagnosable from the UI.
      const [dir, setDir] = React.useState(() =>
        props.available ? { store: props.store, load: props.load, select: props.select } : null,
      );
      const [reason, setReason] = React.useState(props.available ? null : (props.reason ?? null));
      const [resolveAttempt, setResolveAttempt] = React.useState(0);

      React.useEffect(() => {
        if (dir) return undefined;
        let alive = true;
        let tries = 0;
        let timer;
        const attempt = () => {
          if (!alive || typeof props.resolve !== 'function') return;
          try {
            const next = props.resolve();
            if (next) {
              setDir(next);
              setReason(null);
              return;
            }
          } catch (error) {
            const message = error?.message ?? String(error);
            const stack = String(error?.stack ?? '').split('\n').slice(0, 3).join('\n');
            if (alive) setReason(stack && stack !== message ? message + '\n\n' + stack : message);
            // Cordis reports missing services as
            // `cannot get property "X" without inject`; keep the full text so
            // the property name is never lost to truncation.
            console.error('[model-picker-2level] resolve failed:', message, error);
          }
          tries += 1;
          if (tries < 8) timer = setTimeout(attempt, 300 * tries);
        };
        attempt();
        return () => {
          alive = false;
          clearTimeout(timer);
        };
      }, [dir, props.resolve, resolveAttempt]);

      // Load the catalog as soon as the directory exists: without this the
      // snapshot stays empty until the menu is opened, so the trigger would
      // show a placeholder instead of the current model.
      React.useEffect(() => {
        if (dir && typeof dir.load === 'function') dir.load();
      }, [dir]);

      const available = Boolean(dir);
      const store = dir?.store;
      const load = dir?.load;
      const select = dir?.select;

      const state = React.useSyncExternalStore(
        React.useCallback((notify) => (store ? store.subscribe(notify) : () => {}), [store]),
        React.useCallback(() => (store ? store.getSnapshot() : undefined), [store]),
      );

      const [open, setOpen] = React.useState(false);
      const [pane, setPane] = React.useState(PANE_PROVIDERS);
      // The provider whose models level 2 is showing. It must NOT be derived from
      // the session's current provider: browsing ("which row did I click") and
      // selection ("what is in use") are different things.
      const [browsingGroupId, setBrowsingGroupId] = React.useState(null);
      const [query, setQuery] = React.useState('');
      const [active, setActive] = React.useState(0);
      const [menuPos, setMenuPos] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [failure, setFailure] = React.useState(null);

      const rootRef = React.useRef(null);
      const triggerRef = React.useRef(null);
      const menuRef = React.useRef(null);
      const searchRef = React.useRef(null);
      const listRef = React.useRef(null);
      const pendingRef = React.useRef(false);
      const menuEpoch = React.useRef(0);
      const mountedRef = React.useRef(false);
      React.useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
      }, []);

      const groups = React.useMemo(() => orderProviders(state?.groups), [state?.groups]);
      const current = state?.current ?? null;
      const failures = state?.failures ?? [];
      // No snapshot yet (store not ready) reads as loading, not as "no models".
      const loading = state === undefined || state?.status === 'loading';

      const currentGroupId = current?.provider ?? null;
      const currentGroup = React.useMemo(
        () => groups.find((group) => group.id === currentGroupId) ?? null,
        [groups, currentGroupId],
      );
      const currentModel = React.useMemo(() => {
        if (!currentGroup) return null;
        return currentGroup.models.find((model) => model.id === current?.model) ?? null;
      }, [currentGroup, current?.model]);

      // Keep the per-model memory in step with what the session actually runs,
      // so an effort chosen in an earlier session (or by another surface) is
      // restored when the user browses back to that model.
      const liveProvider = current?.provider;
      const liveModel = current?.model;
      const liveEffort = current?.reasoningEffort;
      React.useEffect(() => {
        if (liveProvider === undefined || liveModel === undefined) return;
        if (liveEffort === undefined) return;
        rememberEffort(liveProvider, liveModel, liveEffort);
      }, [liveProvider, liveModel, liveEffort]);

      const accountName = t('provider.account');
      const labelText = current
        ? (currentGroup ? providerLabel(currentGroup, accountName) : current.provider) + ' / ' + current.model
        : loading
          ? t('status.loadingShort')
          : t('empty.models');

      // When the directory cannot be resolved, surface the actual reason on the
      // trigger instead of a generic placeholder: the desktop app has no console
      // open by default, so the label is the only reliable diagnostic channel.
      const unavailableText = reason
        ? t('error.unavailableDetail', { reason })
        : t('error.unavailable');
      const shownLabel = available ? labelText : unavailableText;

      const effortText = React.useMemo(() => {
        if (!current || !currentModel) return '';
        const reasoning = currentModel.reasoning;
        if (!reasoning) return '';
        const effort = current.reasoningEffort ?? reasoning.defaultEffort;
        if (effort === undefined) return t('effort.providerDefault');
        const found = (reasoning.efforts ?? []).find((level) => level.id === effort);
        return found ? found.name : String(effort);
      }, [current, currentModel, t]);

      const browsingGroup = React.useMemo(
        () => resolveBrowsingGroup(groups, browsingGroupId, pane, PANE_MODELS),
        [groups, browsingGroupId, pane],
      );

      const rows = React.useMemo(() => {
        const q = query.trim();
        if (q !== '' && pane !== PANE_EFFORT) {
          // Level 1 searches every provider; level 2 searches its own provider.
          const scope = browsingGroup ? [browsingGroup] : groups;
          const flat = [];
          for (const group of scope) {
            for (const model of rankModels(group.models, q)) flat.push({ kind: 'model', group, model });
          }
          return flat;
        }
        if (browsingGroup) return browsingGroup.models.map((model) => ({ kind: 'model', group: browsingGroup, model }));
        if (pane === PANE_EFFORT) {
          const reasoning = currentModel?.reasoning;
          if (!reasoning) return [];
          const list = [];
          if (reasoning.defaultEffort === undefined) {
            list.push({ kind: 'effort', effort: undefined, label: t('effort.providerDefault') });
          }
          for (const level of reasoning.efforts ?? []) {
            list.push({ kind: 'effort', effort: level.id, label: level.name });
          }
          return q === '' ? list : list.filter((row) =>
            subsequenceScore(row.label, q) >= 0 || subsequenceScore(row.effort, q) >= 0,
          );
        }
        return groups.map((group) => ({ kind: 'provider', group }));
      }, [query, browsingGroup, pane, groups, currentModel, t]);

      const measure = React.useCallback(() => {
        const trigger = triggerRef.current;
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const width = Math.min(380, Math.max(288, Math.round(rect.width)));
        const below = window.innerHeight - rect.bottom;
        const placeAbove = below < 320 && rect.top > below;
        setMenuPos({
          width,
          left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
          ...(placeAbove ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
        });
      }, []);

      // Follow the trigger while the menu is open: a window resize (including
      // maximize / restore) moves the composer, and a menu positioned only once
      // at open time would be left floating at its stale coordinates.
      React.useEffect(() => {
        if (!open) return undefined;
        // Coalesce bursts into one measurement per frame: maximize/minimize
        // emits a stream of resize events, and each one would otherwise
        // re-render the whole menu.
        let frame = 0;
        const follow = () => {
          if (frame !== 0) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            measure();
          });
        };
        window.addEventListener('resize', follow);
        // Capture scroll from any ancestor: the composer sits in a scrollable
        // pane, so the trigger moves without a window resize.
        window.addEventListener('scroll', follow, true);
        const viewport = window.visualViewport;
        if (viewport) viewport.addEventListener('resize', follow);
        return () => {
          if (frame !== 0) cancelAnimationFrame(frame);
          window.removeEventListener('resize', follow);
          window.removeEventListener('scroll', follow, true);
          if (viewport) viewport.removeEventListener('resize', follow);
        };
      }, [open, measure]);

      const openMenu = React.useCallback(() => {
        if (locked) return;
        menuEpoch.current += 1;
        setQuery('');
        setFailure(null);
        setPane(PANE_PROVIDERS);
        setBrowsingGroupId(null);
        setOpen(true);
        measure();
        if (load) load();
        requestAnimationFrame(() => {
          if (searchRef.current) searchRef.current.focus();
          else if (menuRef.current) menuRef.current.focus();
        });
      }, [locked, available, measure, load]);

      const closeMenu = React.useCallback(() => {
        menuEpoch.current += 1;
        setOpen(false);
        setPane(PANE_PROVIDERS);
        setBrowsingGroupId(null);
        setQuery('');
        if (triggerRef.current) triggerRef.current.focus();
      }, []);

      // Dismiss on any pointer press outside the trigger and the menu. The menu
      // lives in a body-level portal, so containment must be checked against the
      // portal node rather than the trigger's subtree.
      React.useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
          const target = event.target;
          if (menuRef.current && menuRef.current.contains(target)) return;
          if (rootRef.current && rootRef.current.contains(target)) return;
          closeMenu();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
      }, [open, closeMenu]);


      // Land the highlight on the "currently in use" row when browsing (not while
      // searching — there the first hit is the natural highlight).
      React.useEffect(() => {
        if (!open || query.trim() !== '') return;
        let index = -1;
        if (pane === PANE_PROVIDERS) {
          index = rows.findIndex((row) => row.kind === 'provider' && row.group.id === currentGroupId);
        } else if (pane === PANE_MODELS) {
          index = rows.findIndex((row) => row.kind === 'model' && row.group.id === currentGroupId && row.model.id === current?.model);
        }
        setActive((previous) => {
          const next = index >= 0 ? index : 0;
          return previous === next ? previous : next;
        });
      }, [open, pane, query, rows, currentGroupId, current?.model]);

      // Keep the highlighted row inside the scroll viewport.
      React.useEffect(() => {
        if (!open || !listRef.current) return;
        const node = listRef.current.querySelector('[data-dmp-active="1"]');
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
      }, [open, active, rows]);

      const choose = React.useCallback(
        async (row) => {
          if (!row || locked || pendingRef.current) return;
          if (row.kind === 'provider') {
            setBrowsingGroupId(row.group.id);
            setPane(PANE_MODELS);
            setQuery('');
            // Focus the model in use only when this is the provider in use;
            // otherwise start at the top of the clicked provider's list.
            const at =
              row.group.id === current?.provider
                ? (row.group.models ?? []).findIndex((model) => model.id === current?.model)
                : -1;
            setActive(at >= 0 ? at : 0);
            return;
          }
          if (row.kind === 'effort' && !current) return;
          const epoch = menuEpoch.current;
          const stillOpen = () => mountedRef.current && epoch === menuEpoch.current;
          pendingRef.current = true;
          setBusy(true);
          setFailure(null);
          try {
            const selection = row.kind === 'effort'
              ? { provider: current.provider, model: current.model }
              : selectionFor(current, row.group, row.model);
            if (row.kind === 'effort' && row.effort !== undefined) selection.reasoningEffort = row.effort;
            const result = await select(selection);
            if (result && result.ok === false) {
              if (stillOpen()) setFailure(
                result.error?.code === 'session/writer-held'
                  ? t('error.sessionInUse')
                  : t('error.action', { message: result.error?.message ?? String(result.error) }),
              );
            } else {
              // Only a successful write may change the remembered choice.
              if (mountedRef.current) rememberEffort(selection.provider, selection.model, selection.reasoningEffort);
              if (stillOpen()) closeMenu();
            }
          } catch (error) {
            if (stillOpen()) setFailure(t('error.action', { message: error?.message ?? String(error) }));
          } finally {
            pendingRef.current = false;
            if (mountedRef.current) setBusy(false);
          }
        },
        [locked, current, select, t, closeMenu],
      );

      const stepActive = React.useCallback(
        (delta) => {
          const count = rows.length;
          if (count === 0) return;
          setActive((previous) => {
            const next = previous + delta;
            return ((next % count) + count) % count;
          });
        },
        [rows.length],
      );

      const goBack = React.useCallback(() => {
        setPane(PANE_PROVIDERS);
        setBrowsingGroupId(null);
        setQuery('');
        setActive(0);
      }, []);

      const onMenuKeyDown = React.useCallback(
        (event) => {
          if (event.nativeEvent && event.nativeEvent.isComposing) return;
          // Enter is the only keyboard activation key. Cancel native Space
          // activation on buttons, while leaving search text editing intact.
          if (event.key === ' ' && event.target.closest?.('button')) {
            event.preventDefault();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            if (query !== '') {
              setQuery('');
              setActive(0);
              return;
            }
            if (pane !== PANE_PROVIDERS) {
              goBack();
              return;
            }
            closeMenu();
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            stepActive(event.key === 'ArrowDown' ? 1 : -1);
            return;
          }
          if (event.key === 'Enter') {
            // Buttons retain native keyboard activation (back, retry, effort,
            // and the actually focused row), rather than choosing a stale row.
            if (event.target.closest?.('button')) return;
            if (rows.length === 0) return;
            event.preventDefault();
            choose(rows[Math.min(Math.max(active, 0), rows.length - 1)]);
            return;
          }
        },
        [query, pane, rows, active, choose, closeMenu, goBack, stepActive],
      );

      const renderProviderRow = (row, index) => {
        const isCurrent = row.group.id === currentGroupId;
        const count = (row.group.models ?? []).length;
        return h(
          'button',
          {
            key: 'p:' + row.group.id,
            type: 'button',
            role: 'menuitem',
            className: 'dmp-row dmp-provider-row' + (index === active ? ' dmp-row-active' : '') + (isCurrent ? ' dmp-row-current' : ''),
            'data-dmp-active': index === active ? '1' : undefined,
            'aria-current': isCurrent ? 'true' : undefined,
            onClick: () => choose(row),
            onMouseMove: () => setActive(index),
          },
          h(
            'span',
            { className: 'dmp-row-main' },
            h('span', { className: 'dmp-row-title' }, providerLabel(row.group, accountName)),
            count === 0 ? h('span', { className: 'dmp-row-sub' }, t('provider.empty')) : null,
          ),
          isCurrent ? h('span', { className: 'dmp-badge' }, t('badge.current')) : null,
          h('span', { className: 'dmp-row-meta' }, t('provider.count', { count })),
          h('span', { className: 'dmp-chev', 'aria-hidden': 'true' }),
        );
      };

      const renderModelRow = (row, index) => {
        const isCurrent = current?.provider === row.group.id && current?.model === row.model.id;
        const showProvider = browsingGroup === null;
        return h(
          'button',
          {
            key: 'm:' + row.group.id + ':' + row.model.id,
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': isCurrent ? 'true' : 'false',
            className: 'dmp-row dmp-model-row' + (index === active ? ' dmp-row-active' : '') + (isCurrent ? ' dmp-row-current' : ''),
            'data-dmp-active': index === active ? '1' : undefined,
            onClick: () => choose(row),
            onMouseMove: () => setActive(index),
          },
          showProvider
            ? h(
                'span',
                { className: 'dmp-row-main' },
                h('span', { className: 'dmp-model-id' }, row.model.id),
                h('span', { className: 'dmp-row-sub' }, providerLabel(row.group, accountName)),
              )
            : h('span', { className: 'dmp-model-id dmp-row-main' }, row.model.id),
          isCurrent ? h(Check) : null,
        );
      };

      const renderEffortRow = (row, index) => {
        const reasoning = currentModel?.reasoning;
        const effort = current?.reasoningEffort ?? reasoning?.defaultEffort;
        const isCurrent = (row.effort ?? undefined) === (effort ?? undefined);
        return h(
          'button',
          {
            key: 'e:' + (row.effort ?? 'default'),
            type: 'button',
            role: 'menuitemradio',
            'aria-checked': isCurrent ? 'true' : 'false',
            className: 'dmp-row dmp-model-row' + (index === active ? ' dmp-row-active' : '') + (isCurrent ? ' dmp-row-current' : ''),
            'data-dmp-active': index === active ? '1' : undefined,
            onClick: () => choose(row),
            onMouseMove: () => setActive(index),
          },
          h('span', { className: 'dmp-model-id dmp-row-main' }, row.label),
          isCurrent ? h(Check) : null,
        );
      };

      const header = browsingGroup
        ? h(
            'button',
            { type: 'button', className: 'dmp-back', onClick: goBack },
            h('span', { className: 'dmp-back-glyph', 'aria-hidden': 'true' }, '\u2039'),
            h('span', { className: 'dmp-back-name' }, providerLabel(browsingGroup, accountName)),
            h('span', { className: 'dmp-row-meta' }, t('provider.count', { count: (browsingGroup.models ?? []).length })),
          )
        : pane === PANE_EFFORT
          ? h(
              'button',
              { type: 'button', className: 'dmp-back', onClick: goBack },
              h('span', { className: 'dmp-back-glyph', 'aria-hidden': 'true' }, '\u2039'),
              h('span', { className: 'dmp-back-name' }, t('effort.title')),
            )
          : null;

      // When the directory cannot be resolved there is nothing to browse; show
      // the full, untruncated reason instead of an empty list. The desktop app
      // has no DevTools open by default, so this panel is the only channel
      // through which a Cordis service error can reach the user.
      const diagnostic = !available ? h(
          'div',
          { className: 'dmp-status dmp-diag' },
          h('div', { className: 'dmp-diag-title' }, t('error.unavailable')),
          h('pre', { className: 'dmp-diag-body' }, String(reason ?? 'unknown')),
          h('button', { type: 'button', className: 'dmp-diag-retry', onClick: () => { setResolveAttempt((value) => value + 1); } }, t('retry')),
          h('div', { className: 'dmp-diag-hint' }, t('error.unavailableHint')),
        ) : null;

      const body = (() => {
        if (loading && rows.length === 0) return h('div', { className: 'dmp-status' }, t('status.loading'));
        if (rows.length === 0) {
          return h('div', { className: 'dmp-status' }, query.trim() !== '' ? t('search.empty') : t('empty.models'));
        }
        return h(
          'div',
          { className: 'dmp-groups', ref: listRef, role: 'menu', 'aria-label': t('menu.aria') },
          query.trim() !== '' && browsingGroup === null && pane !== PANE_EFFORT
            ? h('div', { className: 'dmp-group-label' }, t('search.results', { count: rows.length }))
            : null,
          rows.map((row, index) =>
            row.kind === 'provider' ? renderProviderRow(row, index) : row.kind === 'effort' ? renderEffortRow(row, index) : renderModelRow(row, index),
          ),
        );
      })();

      const effortEntry =
        pane === PANE_PROVIDERS && query.trim() === '' && currentModel?.reasoning
          ? h(
              'div',
              { className: 'dmp-effort-row' },
              h('div', { className: 'dmp-effort-head' }, t('effort.title')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dmp-row dmp-model-row',
                  onClick: () => {
                    setPane(PANE_EFFORT);
                    setQuery('');
                    setActive(0);
                  },
                },
                h('span', { className: 'dmp-row-main dmp-model-id' }, effortText),
                h('span', { className: 'dmp-chev', 'aria-hidden': 'true' }),
              ),
            )
          : null;

      const menu =
        open && menuPos && typeof document !== 'undefined'
          ? ReactDOM.createPortal(
              h(
                'div',
                {
                  ref: menuRef,
                  tabIndex: -1,
                  className: 'dmp-menu',
                  style: menuPos,
                  'aria-busy': busy || loading ? 'true' : 'false',
                  onKeyDown: onMenuKeyDown,
                  onMouseDown: (event) => {
                    // Keep list clicks in the search field, but allow editing
                    // its caret and selecting diagnostic text for copying.
                    if (event.target.closest?.('button')) event.preventDefault();
                  },
                  onBlur: (event) => {
                    const next = event.relatedTarget;
                    if (next && menuRef.current && menuRef.current.contains(next)) return;
                    if (next && rootRef.current && rootRef.current.contains(next)) return;
                    if (next === null) return;
                    closeMenu();
                  },
                },
                available ? h(
                  'div',
                  { className: 'dmp-search-row' },
                  h('span', { className: 'dmp-search-glyph', 'aria-hidden': 'true' }),
                  h('input', {
                    ref: searchRef,
                    className: 'dmp-search',
                    type: 'text',
                    role: 'searchbox',
                    'aria-label': t(pane === PANE_EFFORT ? 'search.placeholderEffort' : browsingGroup ? 'search.placeholderLocal' : 'search.placeholder'),
                    placeholder: t(pane === PANE_EFFORT ? 'search.placeholderEffort' : browsingGroup ? 'search.placeholderLocal' : 'search.placeholder'),
                    value: query,
                    onChange: (event) => {
                      setQuery(event.target.value);
                      setActive(0);
                    },
                  }),
                  query !== ''
                    ? h(
                        'button',
                        {
                          type: 'button',
                          className: 'dmp-search-clear',
                          'aria-label': t('search.clear'),
                          onClick: () => {
                            setQuery('');
                            setActive(0);
                            if (searchRef.current) searchRef.current.focus();
                          },
                        },
                        '\u00d7',
                      )
                    : null,
                ) : null,
                header,
                failure
                  ? h(
                      'div',
                      { className: 'dmp-error' },
                      h('span', null, failure),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dmp-retry',
                          onClick: () => {
                            setFailure(null);
                            if (load) load();
                          },
                        },
                        t('retry'),
                      ),
                    )
                  : null,
                failures.map((item) =>
                  h(
                    'div',
                    { className: 'dmp-warn', key: 'f:' + item.id },
                    t('warning.groupLoad', { name: item.name || item.id, message: item.message }),
                  ),
                ),
                diagnostic || body,
                effortEntry,
              ),
              document.body,
            )
          : null;

      return h(
        'span',
        { className: 'dmp-root', ref: rootRef },
        h(
          'button',
          {
            ref: triggerRef,
            type: 'button',
            className: 'dmp-trigger',
            // Keep the trigger clickable while unavailable: clicking opens the
            // diagnostic panel with the full error, which is the only way a
            // Cordis service failure surfaces in the desktop app.
            disabled: locked,
            'data-dmp-unavailable': available ? undefined : '1',
            'data-dmp-reason': available ? undefined : (reason ?? 'unavailable'),
            title: available ? undefined : (reason ?? t('error.unavailable')),
            'aria-haspopup': 'menu',
            'aria-expanded': open ? 'true' : 'false',
            'aria-label': shownLabel,
            onClick: () => (open ? closeMenu() : openMenu()),
            onKeyDown: (event) => {
              if (event.nativeEvent && event.nativeEvent.isComposing) return;
              if (event.key === ' ') {
                event.preventDefault();
                return;
              }
              if (!open && event.key === 'Enter') {
                event.preventDefault();
                openMenu();
              }
            },
          },
          h(TriggerGlyph),
          h('span', { className: 'dmp-trigger-label' }, shownLabel),
          effortText ? h('span', { className: 'dmp-trigger-effort' }, effortText) : null,
          h('span', { className: 'dmp-chevron' + (open ? ' dmp-chevron-open' : ''), 'aria-hidden': 'true' }),
        ),
        menu,
      );
    }

    /**
     * Resolve the provider shown by level 2.
     *
     * Browsing is deliberately independent of the session's current provider:
     * clicking provider B must show B's models even while A is in use. Returns
     * null outside level 2 or when the id no longer exists in the catalog.
     *
     * @param groups - ordered provider groups from the directory snapshot.
     * @param browsingGroupId - provider id chosen on level 1, or null.
     * @param pane - active pane key.
     * @param modelsPane - the pane key that means "level 2".
     * @returns the browsed group, or null.
     */
    function resolveBrowsingGroup(groups, browsingGroupId, pane, modelsPane) {
      if (pane !== modelsPane || browsingGroupId === null || browsingGroupId === undefined) return null;
      return (groups ?? []).find((group) => group.id === browsingGroupId) ?? null;
    }

    /** Human-readable text for an unknown thrown value. */
    function describe(error) {
      if (error === null || error === undefined) return 'unknown error';
      if (typeof error === 'string') return error;
      const message = error.message ?? String(error);
      return message || 'unknown error';
    }

    /** The standard unavailable result: mounted but not usable. */
    function unavailable(reason) {
      return { available: false, locked: false, reason };
    }

    // ─────────────────────────────────────────────────────────────────────
    // dictionaries
    // ─────────────────────────────────────────────────────────────────────

    const zh = {
      'menu.aria': '选择模型',
      'provider.account': 'DeepSeek 账号',
      'provider.count': '{count} 个模型',
      'provider.empty': '0 个模型',
      'badge.current': '当前使用',
      'effort.title': '思考强度',
      'effort.providerDefault': '供应商默认',
      'status.loading': '正在加载模型目录…',
      'status.loadingShort': '加载模型…',
      'search.placeholder': '搜索全部模型（跨供应商）…',
      'search.placeholderLocal': '在本供应商内搜索…',
      'search.placeholderEffort': '搜索思考强度…',
      'search.empty': '无匹配模型',
      'search.clear': '清除搜索',
      'search.results': '搜索结果：{count} 个模型',
      'empty.models': '选择模型',
      'error.unavailable': '模型目录不可用',
      'error.unavailableDetail': '模型目录不可用：{reason}',
      'error.unavailableHint': '点此面板可选中复制完整错误；重启应用后再试一次。',
      'warning.groupLoad': '{name} 加载失败：{message}',
      'error.action': '切换失败：{message}',
      'error.sessionInUse': '该会话正在写入，请稍后重试',
      retry: '重试',
    };

    const en = {
      'menu.aria': 'Choose a model',
      'provider.account': 'DeepSeek account',
      'provider.count': '{count} models',
      'provider.empty': '0 models',
      'badge.current': 'In use',
      'effort.title': 'Reasoning effort',
      'effort.providerDefault': 'Provider default',
      'status.loading': 'Loading model catalog…',
      'status.loadingShort': 'Loading models…',
      'search.placeholder': 'Search all models (all providers)…',
      'search.placeholderLocal': 'Search this provider…',
      'search.placeholderEffort': 'Search reasoning efforts…',
      'search.empty': 'No matching model',
      'search.clear': 'Clear search',
      'search.results': 'Search results: {count} models',
      'empty.models': 'Choose a model',
      'error.unavailable': 'Model catalog unavailable',
      'error.unavailableDetail': 'Model catalog unavailable: {reason}',
      'error.unavailableHint': 'Select this panel to copy the full error; restart the app and retry.',
      'warning.groupLoad': '{name} failed to load: {message}',
      'error.action': 'Could not switch: {message}',
      'error.sessionInUse': 'This session is being written to; try again shortly',
      retry: 'Retry',
    };

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'model-picker-2level: locale');

        // `ModelDirectoryResolver.directoryFor()` reads `this.ctx.remote.session`
        // while building the per-session directory. Cordis rebinds a service
        // face to the CALLING context, so a plugin that has not injected
        // `remote` fails with `cannot get property "remote" without inject`.
        // Declare the same capability set the built-in plugin declares.
        ctx.inject(
          ['slots', 'modelDirectories', 'sessions', 'remote', 'remote.session'],
          (scope) => {
            const models = scope.modelDirectories;
            const sessions = scope.sessions;

            scope.slots.inject('conversation.input.model', () =>
              scope.slots.register(
                {
                  name: 'conversation.input.model',
                  locale: NS,
                  // Rule R2 (ADR-0004): a single slot's winner must re-declare
                  // its child slot, or third-party registrations into it vanish.
                  children: {
                    'conversation.input.model.label': { kind: 'single', scope: 'session', inline: true },
                  },
                  inject: (context) => {
                    // The slot passes a session id; tolerate an object carrier so
                    // a shape change degrades gracefully instead of throwing
                    // "resolved no scope" deep inside directoryFor.
                    const sessionId =
                      typeof context === 'string' ? context : (context?.sessionId ?? context?.id);

                    // Every capability probe is isolated: a Cordis service face
                    // is a Proxy whose getter throws, so even a `typeof` check
                    // can raise `cannot get property "x" without inject`.
                    let isSubagent = false;
                    try {
                      const probe = sessions?.subagentAddress;
                      if (typeof probe === 'function') isSubagent = probe.call(sessions, sessionId) !== undefined;
                    } catch {
                      isSubagent = false;
                    }
                    if (isSubagent) return { ...unavailable('subagent session'), sessionId, locked: true };

                    let directoryFor;
                    try {
                      directoryFor = models?.directoryFor;
                    } catch (error) {
                      return { ...unavailable('service: ' + describe(error)), sessionId };
                    }
                    if (typeof directoryFor !== 'function') return { ...unavailable('modelDirectories service unavailable'), sessionId };

                    // Resolve lazily and repeatedly: the session binding may not
                    // exist at inject time, and `directoryFor` throws until it does.
                    const resolve = () => {
                      const directory = models.directoryFor(sessionId);
                      return {
                        store: directory.store,
                        load: () => {
                          const pending = directory.load();
                          if (pending && typeof pending.catch === 'function') pending.catch(() => {});
                        },
                        select: (selection) => directory.select(selection),
                      };
                    };

                    try {
                      return { sessionId, available: true, locked: false, resolve, ...resolve() };
                    } catch (error) {
                      // Stay mounted and retrying instead of rendering a dead
                      // button: a too-early `directoryFor` used to disable the
                      // seat permanently.
                      return { sessionId, available: false, locked: false, resolve, reason: describe(error) };
                    }
                  },
                },
                PickerSeat,
              ),
            );
          },
        );
      },
      // Exposed for node unit tests; the module loader ignores extra keys.
      __pure: {
        subsequenceScore,
        rankModels,
        orderProviders,
        resolveEffort,
        rememberEffort,
        forgetEfforts,
        effortKey,
        selectionFor,
        providerLabel,
        totalModels,
        flatMatches,
        resolveBrowsingGroup,
      },
    };
  },
});

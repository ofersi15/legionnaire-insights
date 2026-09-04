(function () {
  'use strict';

  // Keep the frozen 7.2 sync/update core, but gate its expensive polling and
  // collect small in-memory timing samples so real-device jank can be traced
  // without adding another heavy profiler. No save contents/IDs are recorded.
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  let renderCaptured = false;
  let changeScanCaptured = false;

  const diag = window.__legionnaireInsightsDiag = window.__legionnaireInsightsDiag || {
    version: '7.10.0',
    startedAt: Date.now(),
    metrics: Object.create(null),
    events: [],
    stalls: [],
  };

  function record(name, ms, meta) {
    const value = Number(ms) || 0;
    const metric = diag.metrics[name] || (diag.metrics[name] = { count: 0, total: 0, max: 0, last: 0 });
    metric.count += 1;
    metric.total += value;
    metric.max = Math.max(metric.max, value);
    metric.last = value;
    if (value >= 8 || meta) {
      diag.events.push({ at: Date.now(), name, ms: Math.round(value * 10) / 10, meta: meta || null });
      if (diag.events.length > 60) diag.events.splice(0, diag.events.length - 60);
    }
  }

  function timed(name, callback) {
    const start = performance.now();
    try { return callback(); }
    finally { record(name, performance.now() - start); }
  }

  diag.record = record;
  diag.snapshot = function () {
    const metrics = {};
    for (const [name, value] of Object.entries(diag.metrics)) {
      metrics[name] = {
        count: value.count,
        avgMs: value.count ? Math.round((value.total / value.count) * 10) / 10 : 0,
        maxMs: Math.round(value.max * 10) / 10,
        lastMs: Math.round(value.last * 10) / 10,
      };
    }
    return {
      version: diag.version,
      uptimeSec: Math.round((Date.now() - diag.startedAt) / 1000),
      viewport: `${innerWidth}x${innerHeight}`,
      dpr: devicePixelRatio || 1,
      metrics,
      stalls: diag.stalls.slice(-20),
      recentEvents: diag.events.slice(-30),
    };
  };
  diag.reset = function () {
    diag.startedAt = Date.now();
    diag.metrics = Object.create(null);
    diag.events = [];
    diag.stalls = [];
  };

  function panelVisible() {
    const panel = document.getElementById('legionnaire-insights-panel');
    if (!panel) return false;
    const style = getComputedStyle(panel);
    return style.display !== 'none' && style.visibility !== 'hidden' && panel.dataset.mode !== 'hidden';
  }

  function runIdle(fn, timeout) {
    if (document.visibilityState === 'hidden') return;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => fn(), { timeout: timeout || 1800 });
    } else {
      nativeSetTimeout(fn, 80);
    }
  }

  // A 1Hz event-loop heartbeat is intentionally tiny. It detects real main
  // thread stalls even on Firefox, where the Long Tasks API may be absent.
  let heartbeatAt = performance.now();
  nativeSetInterval(() => {
    const now = performance.now();
    const lag = Math.max(0, now - heartbeatAt - 1000);
    heartbeatAt = now;
    if (lag >= 80) {
      const rounded = Math.round(lag);
      diag.stalls.push({ at: Date.now(), lagMs: rounded });
      if (diag.stalls.length > 30) diag.stalls.shift();
      record('event-loop-lag', lag);
    }
  }, 1000);

  try {
    if (typeof PerformanceObserver === 'function' && PerformanceObserver.supportedEntryTypes && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record('browser-long-task', entry.duration);
      });
      observer.observe({ entryTypes: ['longtask'] });
    }
  } catch (e) {}

  window.setInterval = function (callback, delay, ...args) {
    if (!renderCaptured && delay === 700 && typeof callback === 'function' && callback.name === 'render') {
      renderCaptured = true;
      return nativeSetInterval(() => {
        if (panelVisible()) runIdle(() => timed('core-react-render', () => callback(...args)), 1000);
      }, 2500);
    }

    if (!changeScanCaptured && delay === 3000 && typeof callback === 'function') {
      changeScanCaptured = true;
      let pending = 0;
      let lastRun = 0;

      const run = () => {
        pending = 0;
        lastRun = Date.now();
        runIdle(() => timed('core-state-fingerprint', () => callback(...args)), 2500);
      };
      const queue = () => {
        if (pending) nativeClearTimeout(pending);
        pending = nativeSetTimeout(run, 6500);
      };

      window.addEventListener('pointerup', queue, { passive: true });
      window.addEventListener('keyup', queue, { passive: true });

      return nativeSetInterval(() => {
        if (document.visibilityState === 'visible' && Date.now() - lastRun > 120000) run();
      }, 120000);
    }

    return nativeSetInterval(callback, delay, ...args);
  };

  // 7.9 deliberately used a four-pass 0/70/200/500ms club-decoration burst
  // after every interaction. Real-device feedback still showed intermittent
  // jank, so keep one early pass plus one recovery pass and time both. This
  // preserves fast badges without four full DOM walks per tap.
  window.setTimeout = function (callback, delay, ...args) {
    if (typeof callback === 'function' && callback.name === 'decorateClubs' && [0, 70, 200, 500].includes(Number(delay))) {
      if (Number(delay) !== 70 && Number(delay) !== 500) return 0;
      return nativeSetTimeout(() => timed('club-dom-scan', () => callback(...args)), delay);
    }
    return nativeSetTimeout(callback, delay, ...args);
  };

  window.clearInterval = function (id) { return nativeClearInterval(id); };
  window.clearTimeout = function (id) { return nativeClearTimeout(id); };
})();

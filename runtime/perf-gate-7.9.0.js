(function () {
  'use strict';

  // The legacy core owns sync/update logic we still want, but two of its
  // polling loops are too expensive on Firefox Android:
  //   - render() every 700ms walks the React tree even when UI is hidden.
  //   - the 3s local-change detector hashes all Legionnaire localStorage.
  // Intercept only those intervals. Keep all other timers untouched.
  const nativeSetInterval = window.setInterval.bind(window);
  const nativeClearInterval = window.clearInterval.bind(window);
  let renderCaptured = false;
  let changeScanCaptured = false;

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
      setTimeout(fn, 80);
    }
  }

  window.setInterval = function (callback, delay, ...args) {
    if (!renderCaptured && delay === 700 && typeof callback === 'function' && callback.name === 'render') {
      renderCaptured = true;
      return nativeSetInterval(() => {
        if (panelVisible()) runIdle(() => callback(...args), 1000);
      }, 2500);
    }

    if (!changeScanCaptured && delay === 3000 && typeof callback === 'function') {
      changeScanCaptured = true;
      let pending = 0;
      let lastRun = 0;

      const run = () => {
        pending = 0;
        lastRun = Date.now();
        runIdle(() => callback(...args), 2500);
      };
      const queue = () => {
        if (pending) clearTimeout(pending);
        // Wait until the game has settled after a choice, then do the expensive
        // fingerprint during idle time instead of every three seconds forever.
        pending = setTimeout(run, 6500);
      };

      window.addEventListener('pointerup', queue, { passive: true });
      window.addEventListener('keyup', queue, { passive: true });

      // Safety check in case state changes without user input. Periodic cloud
      // sync remains owned by the core; this is only local-change detection.
      return nativeSetInterval(() => {
        if (document.visibilityState === 'visible' && Date.now() - lastRun > 120000) run();
      }, 120000);
    }

    return nativeSetInterval(callback, delay, ...args);
  };

  // Keep native clearInterval semantics even though setInterval is wrapped.
  window.clearInterval = function (id) { return nativeClearInterval(id); };
})();

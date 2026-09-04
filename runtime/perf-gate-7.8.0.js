(function () {
  'use strict';

  // The frozen 7.2 core ends with setInterval(render, 700). render() walks the
  // React tree even while the LI panel is hidden. Intercept only that one
  // interval and gate it behind panel visibility, then restore setInterval.
  const nativeSetInterval = window.setInterval.bind(window);
  let armed = true;

  window.setInterval = function (callback, delay, ...args) {
    if (armed && delay === 700 && typeof callback === 'function' && callback.name === 'render') {
      armed = false;
      const id = nativeSetInterval(() => {
        const panel = document.getElementById('legionnaire-insights-panel');
        if (!panel) return;
        const style = getComputedStyle(panel);
        if (style.display === 'none' || style.visibility === 'hidden') return;
        callback(...args);
      }, 1500);
      window.setInterval = nativeSetInterval;
      return id;
    }
    return nativeSetInterval(callback, delay, ...args);
  };
})();

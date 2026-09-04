(function () {
  'use strict';

  const HUD_ID = 'legionnaire-insights-v79-hud';
  const DIAG_ID = 'legionnaire-insights-v710-diag';
  const STYLE_ID = 'legionnaire-insights-v710-diag-style';
  let holdTimer = 0;
  let held = false;
  let holdPointerId = null;

  function diag() { return window.__legionnaireInsightsDiag || null; }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${DIAG_ID}{position:fixed;inset:0;z-index:1000004;display:flex;align-items:flex-end;justify-content:center;padding:10px;background:rgba(0,0,0,.58)}
      #${DIAG_ID} .li-d-box{width:min(520px,100%);max-height:82dvh;overflow:auto;border:1px solid #475569;border-radius:16px;background:#090c11;color:#e5e7eb;padding:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;direction:ltr;text-align:left}
      #${DIAG_ID} .li-d-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-weight:900;font-size:14px}
      #${DIAG_ID} .li-d-actions{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px}
      #${DIAG_ID} button{min-height:34px;padding:5px 9px;border:1px solid #475569;border-radius:8px;background:#171b22;color:#e5e7eb;font:700 11px system-ui,-apple-system,Segoe UI,sans-serif}
      #${DIAG_ID} pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;color:#cbd5e1}
      @media(min-width:700px){#${DIAG_ID}{align-items:center}}
    `;
    document.head.appendChild(style);
  }

  function formatReport() {
    const source = diag();
    if (!source || typeof source.snapshot !== 'function') return 'Diagnostics collector is unavailable.';
    const snap = source.snapshot();
    const lines = [
      `Legionnaire Insights diagnostics ${snap.version}`,
      `uptime: ${snap.uptimeSec}s | viewport: ${snap.viewport} | DPR: ${snap.dpr}`,
      '',
      'TIMINGS',
    ];
    const entries = Object.entries(snap.metrics || {}).sort((a, b) => (b[1].maxMs || 0) - (a[1].maxMs || 0));
    if (!entries.length) lines.push('(no LI timing samples yet)');
    for (const [name, metric] of entries) {
      lines.push(`${name}: count=${metric.count} avg=${metric.avgMs}ms max=${metric.maxMs}ms last=${metric.lastMs}ms`);
    }
    lines.push('', `EVENT LOOP STALLS >=80ms: ${(snap.stalls || []).length}`);
    for (const stall of (snap.stalls || []).slice(-10)) {
      const age = Math.max(0, Math.round((Date.now() - stall.at) / 1000));
      lines.push(`  ${stall.lagMs}ms (${age}s ago)`);
    }
    lines.push('', 'RECENT EXPENSIVE EVENTS');
    for (const event of (snap.recentEvents || []).slice(-12)) {
      const age = Math.max(0, Math.round((Date.now() - event.at) / 1000));
      lines.push(`  ${event.name}: ${event.ms}ms (${age}s ago)`);
    }
    return lines.join('\n');
  }

  function closeDiag() { document.getElementById(DIAG_ID)?.remove(); }

  function openDiag() {
    ensureStyles();
    closeDiag();
    const overlay = document.createElement('div');
    overlay.id = DIAG_ID;
    overlay.innerHTML = `<div class="li-d-box" role="dialog" aria-modal="true"><div class="li-d-head"><span>LI Performance Diagnostics</span><button type="button" data-close>×</button></div><div class="li-d-actions"><button type="button" data-copy>Copy report</button><button type="button" data-refresh>Refresh</button><button type="button" data-reset>Reset counters</button></div><pre data-report></pre></div>`;
    const render = () => { const pre = overlay.querySelector('[data-report]'); if (pre) pre.textContent = formatReport(); };
    render();
    overlay.addEventListener('click', async (event) => {
      if (event.target === overlay || event.target.closest('[data-close]')) { closeDiag(); return; }
      if (event.target.closest('[data-refresh]')) { render(); return; }
      if (event.target.closest('[data-reset]')) { const d = diag(); if (d && d.reset) d.reset(); render(); return; }
      if (event.target.closest('[data-copy]')) {
        const text = formatReport();
        try {
          await navigator.clipboard.writeText(text);
          event.target.closest('[data-copy]').textContent = 'Copied';
        } catch (e) {
          const area = document.createElement('textarea');
          area.value = text;
          area.style.position = 'fixed'; area.style.opacity = '0';
          document.body.appendChild(area); area.select();
          try { document.execCommand('copy'); } catch (ignore) {}
          area.remove();
        }
      }
    });
    document.body.appendChild(overlay);
  }

  function hudFromEvent(event) {
    return event.target instanceof Element ? event.target.closest(`#${HUD_ID}`) : null;
  }

  // Long-pressing the normal LI/POT HUD opens diagnostics without adding a
  // second always-visible control. Normal taps are left entirely to 7.9 UI.
  document.addEventListener('pointerdown', (event) => {
    if (!hudFromEvent(event)) return;
    clearTimeout(holdTimer);
    held = false;
    holdPointerId = event.pointerId;
    holdTimer = setTimeout(() => {
      held = true;
      openDiag();
    }, 850);
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (holdPointerId !== event.pointerId) return;
    if (event.buttons === 0) { clearTimeout(holdTimer); holdPointerId = null; }
  }, true);

  const endHold = (event) => {
    if (holdPointerId !== event.pointerId) return;
    clearTimeout(holdTimer);
    holdPointerId = null;
  };
  document.addEventListener('pointerup', endHold, true);
  document.addEventListener('pointercancel', endHold, true);

  document.addEventListener('click', (event) => {
    if (!held || !hudFromEvent(event)) return;
    held = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  // Desktop fallback.
  window.addEventListener('keydown', (event) => {
    if (event.altKey && String(event.key).toLowerCase() === 'd') openDiag();
  });

  // Record whether LI's menu appeared promptly after a normal HUD click.
  document.addEventListener('click', (event) => {
    if (!hudFromEvent(event) || held) return;
    const d = diag();
    if (!d || !d.record) return;
    const start = performance.now();
    setTimeout(() => {
      const opened = !!document.getElementById('legionnaire-insights-v79-quick');
      d.record(opened ? 'hud-menu-open' : 'hud-menu-missed', performance.now() - start, opened ? null : { opened: false });
    }, 80);
  }, false);
})();

// ==UserScript==
// @name         Legionnaire Insights
// @namespace    legionnaire-insights
// @version      7.9.0
// @description  Adds a lightweight draggable POT HUD, fast cached club strength and on-demand tools while preserving conflict-safe sync and updates.
// @match        https://www.legionnaire.xyz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/perf-gate-7.9.0.js
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/legionnaire-insights-core-7.2.0.js
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/native-ui-7.9.0.js
// @homepageURL  https://github.com/ofersi15/legionnaire-insights
// @source       https://github.com/ofersi15/legionnaire-insights
// @updateURL    https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// @downloadURL  https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// ==/UserScript==

// 7.9 keeps the proven 7.2 sync/update core, gates its expensive polling,
// and uses an event-driven native UI with no continuous UI polling.

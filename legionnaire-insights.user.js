// ==UserScript==
// @name         Legionnaire Insights
// @namespace    legionnaire-insights
// @version      7.7.0
// @description  Embeds lightweight player potential, club context and seed tools into Legionnaire while preserving conflict-safe sync and updates.
// @match        https://www.legionnaire.xyz/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_info
// @connect      api.github.com
// @connect      gist.githubusercontent.com
// @connect      raw.githubusercontent.com
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/legionnaire-insights-core-7.2.0.js
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/native-ui-7.6.0.js
// @require      https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/runtime/native-ui-7.7.0.js
// @homepageURL  https://github.com/ofersi15/legionnaire-insights
// @source       https://github.com/ofersi15/legionnaire-insights
// @updateURL    https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// @downloadURL  https://raw.githubusercontent.com/ofersi15/legionnaire-insights/main/legionnaire-insights.user.js
// ==/UserScript==

// Runtime is split deliberately: the frozen 7.2 core keeps sync/update behavior
// stable, 7.6 owns the low-overhead native UI/Seed Finder, and 7.7 is a tiny
// compatibility patch for OVR targeting, fast club badges and draggable compact UI.

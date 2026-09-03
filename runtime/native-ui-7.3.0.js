(function () {
  'use strict';
  const MODE_KEY = 'legionnaire-insights:mode';
  const NATIVE_MIGRATION_KEY = 'legionnaire-insights:native-ui-migrated-v1';
  const STYLE_ID = 'legionnaire-insights-native-style';
  const SUMMARY_ID = 'legionnaire-insights-native-summary';
  const POLL_MS = 700;
  let clubsById = null;
  let clubsLoadPromise = null;
  let clubsNextAttemptAt = 0;

  function getFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
    return key ? node[key] : null;
  }
  function findRootFiber() {
    let fiber = getFiber(document.getElementById('root') || document.body);
    if (!fiber) for (const el of document.querySelectorAll('*')) { fiber = getFiber(el); if (fiber) break; }
    while (fiber && fiber.return) fiber = fiber.return;
    return fiber;
  }
  function scanProps() {
    const root = findRootFiber();
    if (!root) return [];
    const results = [], stack = [root], seen = new Set();
    let guard = 0;
    while (stack.length && guard++ < 50000) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object' && ('decision' in props || (props.player && 'potential' in props.player))) results.push(props);
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return results;
  }
  async function loadClubsDb() {
    if (clubsById) return clubsById;
    if (clubsLoadPromise) return clubsLoadPromise;
    if (Date.now() < clubsNextAttemptAt) return null;
    clubsLoadPromise = (async () => {
      try {
        const scriptTag = [...document.scripts].find((s) => /\/assets\/index-[^/]+\.js/.test(s.src));
        if (!scriptTag) { clubsNextAttemptAt = Date.now() + 1000; return null; }
        const response = await fetch(scriptTag.src);
        if (!response.ok) throw new Error(String(response.status));
        const src = await response.text(), marker = 'JSON.parse(`', map = new Map();
        let searchFrom = 0;
        while (true) {
          const markerIdx = src.indexOf(marker, searchFrom);
          if (markerIdx === -1) break;
          const start = markerIdx + marker.length, end = src.indexOf('`)', start);
          if (end === -1) break;
          searchFrom = end + 2;
          try {
            const raw = src.slice(start, end);
            const parsed = JSON.parse((0, eval)('`' + raw.replace(/`/g, '\\`') + '`'));
            if (!Array.isArray(parsed)) continue;
            for (const c of parsed) {
              if (Array.isArray(c)) {
                if (typeof c[0] === 'string') map.set(c[0], { name:c[1], league:c[4], tier:c[5], ovr:c[6] });
              } else if (c && typeof c === 'object' && typeof c.id === 'string') {
                map.set(c.id, { name:c.name, league:c.league, tier:c.tier, ovr:c.baseOverall });
              }
            }
          } catch (e) {}
        }
        if (map.size) clubsById = map;
        return clubsById;
      } catch (e) { clubsNextAttemptAt = Date.now() + 10000; return null; }
      finally { clubsLoadPromise = null; }
    })();
    return clubsLoadPromise;
  }
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .li-native-summary{grid-column:1/-1;width:100%;box-sizing:border-box;display:flex;align-items:center;flex-wrap:wrap;gap:7px 10px;margin:0 0 10px;padding:9px 11px;border:1px solid rgba(74,222,128,.32);border-radius:12px;background:rgba(8,10,15,.9);color:#e5e7eb;box-shadow:0 6px 20px rgba(0,0,0,.18);backdrop-filter:blur(8px);direction:rtl;text-align:right;font:600 12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif}
      .li-native-brand{direction:ltr;color:#4ade80;font:800 11px/1 ui-monospace,SFMono-Regular,Consolas,monospace;border:1px solid rgba(74,222,128,.35);border-radius:999px;padding:5px 7px}
      .li-native-pot strong{color:#facc15;font-size:14px}.li-native-muted{color:#aeb6c3;font-weight:500}.li-native-actions{margin-inline-start:auto;display:flex;gap:6px}
      .li-native-action{min-height:30px;border:1px solid #475569;border-radius:8px;padding:4px 9px;background:#191d25;color:#e5e7eb;font:700 11px system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer}
      .li-native-option{display:block;width:max-content;max-width:100%;margin:5px auto 0;padding:3px 7px;border:1px solid rgba(148,163,184,.28);border-radius:999px;background:rgba(15,18,24,.8);color:#cbd5e1;direction:rtl;text-align:center;font:700 10px/1.25 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:none;white-space:normal}
      .li-native-option[data-best="true"]{color:#86efac;border-color:rgba(74,222,128,.48)}.li-native-strongest{outline:2px solid rgba(74,222,128,.45)!important;outline-offset:2px}
      @media(max-width:640px){.li-native-summary{gap:6px 8px;padding:8px 9px;margin-bottom:8px;font-size:11px}.li-native-actions{width:100%;margin-inline-start:0}.li-native-action{flex:1;min-height:34px}.li-native-option{font-size:9px}}
    `;
    document.head.appendChild(style);
  }
  function getMode(){try{return localStorage.getItem(MODE_KEY)||'hidden'}catch(e){return'hidden'}}
  function migrateOverlayOnce(){try{if(!localStorage.getItem(NATIVE_MIGRATION_KEY)){localStorage.setItem(MODE_KEY,'hidden');localStorage.setItem(NATIVE_MIGRATION_KEY,'1')}}catch(e){} const p=document.getElementById('legionnaire-insights-panel'); if(p&&getMode()==='hidden')p.style.display='none'}
  function norm(v){return String(v||'').replace(/\s+/g,' ').trim()}
  function visible(el){if(!el||!(el instanceof Element))return false;const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;const s=getComputedStyle(el);return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)!==0}
  function findText(text){const needle=norm(text);let best=null,len=Infinity;if(!needle)return null;for(const el of document.querySelectorAll('button,[role="button"],div,span,h1,h2,h3,h4,p')){if(el.closest('#legionnaire-insights-panel')||el.closest('[data-li-native]')||!visible(el))continue;const h=norm(el.textContent);if(h.includes(needle)&&h.length<len){best=el;len=h.length}}return best}
  function cardFor(el){let node=el,fallback=null;for(let d=0;node&&d<7&&node!==document.body;d++,node=node.parentElement){const f=getFiber(node),p=f&&f.memoizedProps;if(node.matches('button,a,[role="button"]')||(p&&typeof p.onClick==='function'))return node;try{if(getComputedStyle(node).cursor==='pointer')fallback=node}catch(e){}}return fallback||(el&&el.parentElement)}
  function commonParent(elements){if(!elements.length)return null;const same=elements[0].parentElement;if(same&&elements.every((e)=>e.parentElement===same))return same;let c=elements[0].parentElement;while(c&&c!==document.body){if(elements.every((e)=>c.contains(e)))return c;c=c.parentElement}return null}
  function profileLabel(p){return({early:'התפתחות מוקדמת',normal:'התפתחות רגילה',late:'התפתחות מאוחרת'})[p]||norm(p)}
  function outcomeText(option){if(!option||!Array.isArray(option.outcomes)||option.outcomes.length<2)return'';return option.outcomes.slice(0,3).map((o)=>`${Math.round((Number(o.probability)||0)*100)}%${norm(o.resultLabel)?' '+norm(o.resultLabel):''}`).join(' · ')}
  function openCorePanel(tab){const panel=document.getElementById('legionnaire-insights-panel'),reopen=document.getElementById('legionnaire-insights-reopen');if(!panel||!reopen)return;if(getMode()==='hidden')reopen.click();setTimeout(()=>{const p=document.getElementById('legionnaire-insights-panel');if(!p)return;const full=[...p.querySelectorAll('button')].find((b)=>b.title==='Full mode');if(full)full.click();setTimeout(()=>p.querySelector(`.li-tab[data-tab="${tab}"]`)?.click(),0)},0)}
  function clearNative(){document.getElementById(SUMMARY_ID)?.remove();document.querySelectorAll('[data-li-native="option"]').forEach((e)=>e.remove());document.querySelectorAll('.li-native-strongest').forEach((e)=>e.classList.remove('li-native-strongest'));const r=document.getElementById('legionnaire-insights-reopen');if(r&&getMode()==='hidden')r.style.display='block'}
  function ensureSummary(host,player){let s=document.getElementById(SUMMARY_ID);if(!s){s=document.createElement('div');s.id=SUMMARY_ID;s.setAttribute('data-li-native','summary');s.className='li-native-summary';s.innerHTML='<span class="li-native-brand">LI</span><span class="li-native-pot" data-li-role="potential"></span><span class="li-native-muted" data-li-role="profile"></span><span class="li-native-actions"><button type="button" class="li-native-action" data-li-open="now">פרטים</button><button type="button" class="li-native-action" data-li-open="tools">כלים</button></span>';s.querySelectorAll('[data-li-open]').forEach((b)=>b.addEventListener('click',(ev)=>{ev.preventDefault();ev.stopPropagation();openCorePanel(b.dataset.liOpen)}))}const gap=Number(player.potential)-Number(player.overall),pot=s.querySelector('[data-li-role="potential"]'),prof=s.querySelector('[data-li-role="profile"]');if(pot){pot.innerHTML='';pot.append('פוטנציאל ');const strong=document.createElement('strong');strong.textContent=String(player.potential);pot.appendChild(strong);pot.append(` · ${gap>=0?'+':''}${gap}`)}if(prof)prof.textContent=profileLabel(player.developmentProfile);if(s.parentElement!==host||host.firstElementChild!==s)host.insertBefore(s,host.firstChild);return s}
  function renderNative(){let results;try{results=scanProps()}catch(e){clearNative();return}const live=results.find((p)=>p.decision&&'onChoose'in p);let player=live?live.player:null,decision=live?live.decision:null;if(!player)player=results.find((p)=>p.player&&p.player.potential!==undefined)?.player||null;if(!decision)decision=results.find((p)=>p.decision)?.decision||null;const options=decision&&Array.isArray(decision.options)?decision.options:[];if(!player||!options.length){clearNative();return}if(!clubsById&&!clubsLoadPromise)loadClubsDb().then(renderNative);const targets=[];for(let i=0;i<options.length;i++){const option=options[i],club=option.clubId&&clubsById?clubsById.get(option.clubId):null,raw=norm(option.label||option.key||option.id),searchable=club&&club.name?club.name:(raw&&!['join_club','academy'].includes(raw)?raw:'');if(!searchable)continue;const labelEl=findText(searchable);if(!labelEl)continue;const card=cardFor(labelEl);if(card)targets.push({option,club,labelEl,card,index:i})}if(!targets.length){clearNative();return}document.querySelectorAll('.li-native-strongest').forEach((e)=>e.classList.remove('li-native-strongest'));const ovrs=targets.map((t)=>Number(t.club&&t.club.ovr)).filter(Number.isFinite),bestOvr=ovrs.length?Math.max(...ovrs):null,liveBadges=new Set();for(const t of targets){const key=String(t.option.clubId||t.option.id||t.option.key||t.index);let badge=[...t.card.querySelectorAll('[data-li-native="option"]')].find((e)=>e.dataset.liOptionKey===key);if(!badge){badge=document.createElement('span');badge.setAttribute('data-li-native','option');badge.dataset.liOptionKey=key;badge.className='li-native-option';t.labelEl.parentNode?.insertBefore(badge,t.labelEl.nextSibling)}const parts=[];if(t.club){if(t.club.tier!=null)parts.push(`T${t.club.tier}`);if(t.club.ovr!=null)parts.push(`OVR ${t.club.ovr}`)}const best=bestOvr!=null&&t.club&&Number(t.club.ovr)===bestOvr;if(best)parts.push('★ הכי חזק');const outcomes=outcomeText(t.option);if(outcomes)parts.push(outcomes);badge.textContent=parts.join(' · ');badge.dataset.best=String(best);badge.style.display=parts.length?'block':'none';liveBadges.add(badge);if(best)t.card.classList.add('li-native-strongest')}document.querySelectorAll('[data-li-native="option"]').forEach((e)=>{if(!liveBadges.has(e))e.remove()});const cards=[...new Set(targets.map((t)=>t.card))];let host=commonParent(cards);if(!host||host===document.body||host.id==='root')host=cards[0].parentElement;if(!host)return;ensureSummary(host,player);const reopen=document.getElementById('legionnaire-insights-reopen');if(reopen&&getMode()==='hidden')reopen.style.display='none'}
  ensureStyles();migrateOverlayOnce();loadClubsDb().then(renderNative);window.addEventListener('load',()=>loadClubsDb().then(renderNative));setInterval(renderNative,POLL_MS);renderNative();
})();

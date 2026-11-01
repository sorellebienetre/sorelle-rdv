/**
 * gestion/magie.js : module MAGIE
 *   « ★ Remplir l'agenda » (analyse admin.remplir, alertes, relances, créneaux à proposer)
 *   + studio de story Instagram (canvas 1080×1920, thèmes, mises en page, polices, fond photo,
 *     mode message ou lien éclair, partage navigator.share ou téléchargement).
 * N'utilise que le contrat window.G (docs/GESTION-V2-SPEC.md, section 1).
 */
(function () {
  'use strict';
  var G = window.G;
  if (!G || typeof G.register !== 'function') { if (window.console) console.warn('magie.js : window.G absent, module non chargé'); return; }

  /* =====================================================================
   * Outils
   * =================================================================== */
  function U() { return G.U || (window.SorelleCore && window.SorelleCore._); }
  function cfg() { return (G.cfg && G.cfg()) || null; }
  function esc(s) { return G.esc(s); }
  function ic(n) { try { return G.icon(n) || ''; } catch (e) { return ''; } }
  function pc(id) { try { return G.pratColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function pn(id) { try { return G.pratName(id) || id; } catch (e) { return id; } }
  function tnt(hex, a) { try { return G.tint(hex, a); } catch (e) { return hex; } }
  function toast(msg, type) { try { G.toast(msg, { type: type || 'ok' }); } catch (e) { /* ignore */ } }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }

  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var JOURS_C = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function dp(d) { var p = String(d).split('-'); return { y: +p[0], m: +p[1], j: +p[2] }; }
  function wd(d) { return U().weekday(d); }
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function dayLong(d) { var p = dp(d); return JOURS[wd(d)] + ' ' + (p.j === 1 ? '1er' : p.j) + ' ' + MOIS[p.m - 1]; }
  function dayShort(d) { var p = dp(d); return JOURS_C[wd(d)] + ' ' + p.j + ' ' + MOIS_C[p.m - 1]; }
  function dayNum(d) { var p = dp(d); return cap1(JOURS[wd(d)]) + ' ' + p.j; }
  function rel(d) { var t = G.today(); if (d === t) return 'Aujourd\'hui'; if (d === U().addDays(t, 1)) return 'Demain'; return ''; }
  function dayTitle(d) { var r = rel(d); return r ? r + ' · ' + dayLong(d) : cap1(dayLong(d)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ddmm(d) { var p = dp(d); return pad(p.j) + '/' + pad(p.m); }
  function hfr(t) { if (!t) return ''; var p = String(t).split(':'); return (+p[0]) + 'h' + (p[1] === '00' ? '' : p[1]); }
  function svcName(id, court) { try { return G.svcName(id, court) || id; } catch (e) { return id; } }

  var LSP = 'sorelle_magie_';
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(LSP + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem(LSP + k); else localStorage.setItem(LSP + k, JSON.stringify(v)); } catch (e) { /* plein ou bloqué */ } }
  };

  function copyText(text, okMsg) {
    function legacy() {
      try {
        var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
        ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return ok;
      } catch (e) { return false; }
    }
    function done(ok) { if (ok) toast(okMsg || 'Copié'); else toast('Copie impossible : sélectionnez le texte et copiez-le.', 'err'); return ok; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return done(true); }, function () { return done(legacy()); });
      }
    } catch (e) { /* repli */ }
    return Promise.resolve(done(legacy()));
  }

  /* Couleurs (calculs locaux pour le canvas ; l'interface utilise les jetons CSS du shell) */
  function vHex(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h) ? h : null; }
  function rgb(h) { var n = parseInt((vHex(h) || '#8E9583').slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexOf(a) { return '#' + a.map(function (x) { x = Math.round(Math.max(0, Math.min(255, x))); return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function mix(a, b, t) { var x = rgb(a), y = rgb(b); return hexOf(x.map(function (v, i) { return v * t + y[i] * (1 - t); })); }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function lum(h) { var a = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function inkOn(bg) { try { var t = G.textOn(bg); if (vHex(t)) return t; } catch (e) { /* repli */ } return contrast(bg, '#1E2218') >= contrast(bg, '#FFFFFF') ? '#1E2218' : '#FFFFFF'; }

  function activeIds() { try { return (G.prats() || []).filter(function (p) { return p.active !== false; }).map(function (p) { return p.id; }); } catch (e) { return ['laurie', 'lea']; } }
  function pratOrder(a, b) { var o = activeIds(); return o.indexOf(a) - o.indexOf(b); }

  /* =====================================================================
   * CSS (préfixé .mod-magie, jetons du shell uniquement)
   * =================================================================== */
  var CSS = [
    '.mod-magie{color:var(--text);font-size:15px;line-height:1.45;-webkit-tap-highlight-color:transparent}',
    '.mod-magie *{box-sizing:border-box}',
    '.mod-magie button{font:inherit;color:inherit;cursor:pointer}',
    '.mod-magie .mg-pad{padding:16px 18px 0}',
    '@media (max-width:699px){.mod-magie .mg-pad{padding:12px 16px 0}}',
    '.mod-magie .mg-f{margin-bottom:14px}',
    '.mod-magie .mg-f:last-child{margin-bottom:0}',
    '.mod-magie .mg-lab{display:block;font-size:13px;font-weight:500;color:var(--text-sub);margin:0 0 6px}',
    '.mod-magie .mg-ctrl{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-lg);padding:14px}',
    '.mod-magie .mg-seg{display:flex;gap:4px;padding:4px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);width:100%}',
    '.mod-magie .mg-seg button{flex:1 1 0;min-width:0;min-height:44px;border:0;background:transparent;border-radius:calc(var(--radius) - 4px);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 8px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-magie .mg-seg button.on{background:var(--accent);color:var(--accent-text);font-weight:600}',
    '.mod-magie .mg-seg button.on.pr{background:var(--pc);color:var(--pt)}',
    '.mod-magie .mg-seg button:disabled{opacity:.5;cursor:default}',
    '.mod-magie .mg-dot{width:12px;height:12px;border-radius:50%;background:var(--pc);flex:none;display:inline-block;box-shadow:0 0 0 2px var(--surface)}',
    '.mod-magie .mg-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.mod-magie .mg-chip{min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);display:inline-flex;align-items:center;gap:8px;font-weight:500;color:var(--text)}',
    '.mod-magie .mg-chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}',
    '.mod-magie .mg-chip i{width:10px;height:10px;border-radius:50%;background:var(--sc);flex:none}',
    '.mod-magie .mg-chip small{font-size:12px;opacity:.8;font-weight:400}',
    '.mod-magie .mg-range{margin-top:8px;font-size:13px;color:var(--text-sub)}',
    '.mod-magie .mg-sep{display:inline-block;width:1px;height:28px;background:var(--line);align-self:center;margin:0 2px}',
    '.mod-magie .mg-sec{margin-top:22px}',
    '.mod-magie .mg-sec>h3{font-size:17px;font-weight:600;margin:0 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.mod-magie .mg-sec>h3 .mg-n{font-size:13px;font-weight:500;color:var(--text-sub);background:var(--surface-2);border:1px solid var(--line);border-radius:999px;padding:1px 9px}',
    '.mod-magie .mg-sec>h3 .mg-sp{flex:1}',
    '.mod-magie .mg-link{border:0;background:transparent;color:var(--accent);font-weight:500;min-height:44px;padding:0 4px;font-size:14px}',
    '.mod-magie .mg-empty{padding:14px 16px;border-radius:var(--radius);background:var(--surface-2);color:var(--text-sub);font-size:14px;border:1px solid var(--line)}',
    '.mod-magie .mg-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}',
    '.mod-magie .mg-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px 14px 14px;box-shadow:inset 0 5px 0 var(--pc);overflow:hidden}',
    '.mod-magie .mg-card-h{display:flex;align-items:center;gap:8px;font-weight:600}',
    '.mod-magie .mg-card-h .mg-cnt{margin-left:auto;font-size:13px;font-weight:500;color:var(--text-sub)}',
    '.mod-magie .mg-big{display:flex;align-items:baseline;gap:8px;margin-top:8px}',
    '.mod-magie .mg-big b{font-size:34px;font-weight:600;line-height:1;color:var(--text)}',
    '.mod-magie .mg-big span{font-size:14px;color:var(--text-sub)}',
    '.mod-magie .mg-card p{margin:6px 0 0;font-size:13px;color:var(--text-sub)}',
    '.mod-magie .mg-gauge{height:10px;border-radius:99px;background:var(--surface-2);border:1px solid var(--line);margin-top:10px;overflow:hidden}',
    '.mod-magie .mg-gauge i{display:block;height:100%;background:var(--pc);border-radius:99px}',
    '.mod-magie .mg-list{display:flex;flex-direction:column;gap:8px}',
    '.mod-magie .mg-row{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px;min-width:0}',
    '.mod-magie .mg-row .mg-body{flex:1;min-width:0}',
    '.mod-magie .mg-row .mg-t{font-weight:600;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.mod-magie .mg-row .mg-s{font-size:13px;color:var(--text-sub);margin-top:2px}',
    '.mod-magie .mg-row .mg-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}',
    '.mod-magie .mg-badge{font-size:12px;font-weight:600;border-radius:999px;padding:2px 9px;border:1px solid transparent;white-space:nowrap}',
    '.mod-magie .mg-badge.crit{background:var(--danger);color:var(--accent-text)}',
    '.mod-magie .mg-badge.att{background:transparent;border-color:var(--warn);color:var(--text)}',
    '.mod-magie .mg-badge.late{background:transparent;border-color:var(--danger);color:var(--danger)}',
    '.mod-magie .mg-alert{border-left:5px solid var(--warn)}',
    '.mod-magie .mg-alert.crit{border-left-color:var(--danger)}',
    '.mod-magie .mg-btn{min-height:44px;padding:0 14px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap;color:var(--text)}',
    '.mod-magie .mg-btn svg{width:18px;height:18px;flex:none}',
    '.mod-magie .mg-btn.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-text);font-weight:600}',
    '.mod-magie .mg-btn.blk{width:100%}',
    '.mod-magie .mg-btn:disabled{opacity:.5;cursor:default}',
    '.mod-magie .mg-btn:focus-visible,.mod-magie .mg-chip:focus-visible,.mod-magie .mg-seg button:focus-visible,.mod-magie .mg-slot-b:focus-visible,.mod-magie .mg-link:focus-visible{outline:3px solid var(--focus);outline-offset:2px}',
    '.mod-magie .mg-av{width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:600;background:var(--pc);color:var(--pt)}',
    '.mod-magie .mg-pratname{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--text)}',
    '.mod-magie .mg-day{margin-top:16px}',
    '.mod-magie .mg-day>h4{font-size:15px;font-weight:600;margin:0 0 8px;color:var(--text)}',
    '.mod-magie .mg-pblk{border-radius:var(--radius-lg);border:1px solid var(--line);border-left:6px solid var(--pc);padding:10px 10px 10px 12px;background:var(--pbg)}',
    '.mod-magie .mg-pblk+.mg-pblk{margin-top:10px}',
    '.mod-magie .mg-ph{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}',
    '.mod-magie .mg-ptag{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 12px;border-radius:999px;background:var(--pc);color:var(--pt);font-weight:600;font-size:14px}',
    '.mod-magie .mg-pinfo{font-size:13px;color:var(--text-sub)}',
    '.mod-magie .mg-wins{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px;align-items:center}',
    '.mod-magie .mg-wins>span{font-size:13px;color:var(--text-sub)}',
    '.mod-magie .mg-win{min-height:36px;padding:0 10px;border-radius:999px;border:1px dashed var(--pc);background:var(--surface);font-size:13px;color:var(--text)}',
    '.mod-magie .mg-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:6px}',
    '.mod-magie .mg-slot{display:flex;align-items:stretch;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);min-height:48px;overflow:hidden}',
    '.mod-magie .mg-slot.off{opacity:.55}',
    '.mod-magie .mg-chk{display:grid;place-items:center;width:48px;flex:none;cursor:pointer;border-right:1px solid var(--line);position:relative}',
    '.mod-magie .mg-chk input{position:absolute;opacity:0;width:100%;height:100%;margin:0;cursor:pointer}',
    '.mod-magie .mg-chk span{width:24px;height:24px;border-radius:7px;border:2px solid var(--muted);display:grid;place-items:center;color:var(--accent-text)}',
    '.mod-magie .mg-chk span svg{width:16px;height:16px;opacity:0}',
    '.mod-magie .mg-chk input:checked+span{background:var(--accent);border-color:var(--accent)}',
    '.mod-magie .mg-chk input:checked+span svg{opacity:1}',
    '.mod-magie .mg-chk input:focus-visible+span{outline:3px solid var(--focus);outline-offset:2px}',
    '.mod-magie .mg-slot-b{flex:1;min-width:0;border:0;background:transparent;display:flex;align-items:center;gap:8px;padding:0 10px;text-align:left;white-space:nowrap}',
    '.mod-magie .mg-slot-b b{font-size:17px;font-weight:600}',
    '.mod-magie .mg-slot-b small{font-size:12px;color:var(--text-sub)}',
    '.mod-magie .mg-slot-b em{font-style:normal;margin-left:auto;font-size:13px;font-weight:500;color:var(--accent);display:inline-flex;align-items:center;gap:2px}',
    '.mod-magie .mg-slot-b em svg{width:16px;height:16px}',
    '.mod-magie .mg-none{font-size:13px;color:var(--text-sub);padding:2px 2px 4px}',
    '.mod-magie .mg-foot{position:sticky;bottom:0;z-index:3;margin-top:22px;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 18px var(--shadow);padding:12px 18px calc(12px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
    '.mod-magie .mg-foot .mg-fi{flex:1 1 180px;font-size:13px;color:var(--text-sub);min-width:0}',
    '.mod-magie .mg-foot .mg-fi b{color:var(--text);font-size:15px}',
    '.mod-magie .mg-foot .mg-btn{flex:1 1 200px}',
    '.mod-magie .mg-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--accent);border-left:6px solid var(--accent);margin-bottom:12px}',
    '.mod-magie .mg-banner span{flex:1 1 200px;font-weight:500}',
    '.mod-magie .mg-err{padding:14px;border-radius:var(--radius);border:1px solid var(--danger);color:var(--text);background:var(--surface)}',
    '.mod-magie .mg-load{display:flex;align-items:center;gap:10px;color:var(--text-sub);padding:22px 4px}',
    '.mod-magie .mg-spin{width:18px;height:18px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation:mgspin .8s linear infinite;flex:none}',
    '@keyframes mgspin{to{transform:rotate(360deg)}}',
    '.mod-magie .mg-busy{font-size:12px;color:var(--text-sub);display:inline-flex;align-items:center;gap:6px;font-weight:400}',
    '.mod-magie .mg-busy .mg-spin{width:12px;height:12px}',
    '@media (max-width:699px){.mod-magie .mg-row{flex-wrap:wrap}.mod-magie .mg-row .mg-acts{width:100%;justify-content:stretch}.mod-magie .mg-row .mg-acts .mg-btn{flex:1}.mod-magie .mg-slots{grid-template-columns:1fr 1fr}.mod-magie .mg-slot-b em{display:none}.mod-magie .mg-chk{width:44px}.mod-magie .mg-slot-b{padding:4px 8px;gap:0;flex-direction:column;align-items:flex-start;justify-content:center;line-height:1.2}}',
    '@media (max-width:370px){.mod-magie .mg-slots{grid-template-columns:1fr}}',
    /* Studio */
    '.mod-magie.mg-studio .mg-st{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:20px;align-items:start}',
    '.mod-magie .mg-prev{position:sticky;top:0;z-index:2}',
    '.mod-magie .mg-cv{position:relative;width:100%;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:var(--surface-2);box-shadow:0 8px 28px var(--shadow);border:1px solid var(--line)}',
    '.mod-magie .mg-cv canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.mod-magie .mg-cv .mg-safe{position:absolute;left:0;right:0;pointer-events:none;border:0 dashed var(--accent);opacity:0;transition:opacity .2s}',
    '.mod-magie .mg-pager{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px}',
    '.mod-magie .mg-pager button{min-width:44px;min-height:44px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-weight:600}',
    '.mod-magie .mg-pager button.on{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}',
    '.mod-magie .mg-note{font-size:13px;color:var(--text-sub);text-align:center;margin:8px 0 0}',
    '.mod-magie .mg-themes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.mod-magie .mg-th{border:2px solid var(--line);border-radius:var(--radius);padding:0;background:var(--surface);overflow:hidden;display:flex;flex-direction:column;min-height:44px}',
    '.mod-magie .mg-th.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}',
    '.mod-magie .mg-th i{display:grid;place-items:center;height:56px;font-style:normal;font-size:22px;font-weight:600;background:var(--tb);color:var(--tt)}',
    '.mod-magie .mg-th i b{display:block;width:30px;height:6px;border-radius:3px;background:var(--ta);margin-top:2px}',
    '.mod-magie .mg-th span{font-size:12px;font-weight:500;padding:5px 4px;text-align:center;line-height:1.2;color:var(--text)}',
    '.mod-magie .mg-inp{width:100%;min-height:44px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);color:var(--text);padding:0 12px;font:inherit;font-size:16px}',
    '.mod-magie .mg-inp:focus{outline:3px solid var(--focus);outline-offset:1px}',
    '.mod-magie .mg-txt{display:grid;gap:8px}',
    '.mod-magie .mg-txt label{display:grid;gap:4px;font-size:13px;color:var(--text-sub)}',
    '.mod-magie .mg-fonts .mg-chip{font-size:16px}',
    '.mod-magie .mg-colrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:8px}',
    '.mod-magie .mg-colrow>b{flex-basis:100%;font-size:13px;font-weight:500;color:var(--text-sub);margin-bottom:-2px}',
    '.mod-magie .mg-colrow{gap:2px}',
    '.mod-magie .mg-sw{width:44px;height:44px;border-radius:50%;border:0;background:transparent;display:grid;place-items:center;padding:0}',
    '.mod-magie .mg-sw i{width:30px;height:30px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px var(--line)}',
    '.mod-magie .mg-sw.on i{box-shadow:0 0 0 3px var(--surface),0 0 0 5px var(--accent)}',
    '.mod-magie .mg-pick{width:44px;height:44px;border-radius:50%;border:1px solid var(--line);padding:0;background:var(--surface);overflow:hidden;cursor:pointer}',
    '.mod-magie .mg-pick::-webkit-color-swatch-wrapper{padding:6px}',
    '.mod-magie .mg-pick::-webkit-color-swatch{border-radius:50%;border:0}',
    '.mod-magie .mg-slider{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;font-size:13px;color:var(--text-sub);min-height:44px}',
    '.mod-magie .mg-slider input{width:100%;accent-color:var(--accent);min-height:32px}',
    '.mod-magie .mg-tog{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}',
    '.mod-magie .mg-tog input{width:22px;height:22px;accent-color:var(--accent);flex:none}',
    '.mod-magie .mg-adv{border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface-2);margin-bottom:14px}',
    '.mod-magie .mg-adv>summary{list-style:none;min-height:48px;display:flex;align-items:center;gap:8px;padding:0 14px;font-weight:600;cursor:pointer}',
    '.mod-magie .mg-adv>summary::-webkit-details-marker{display:none}',
    '.mod-magie .mg-adv>summary svg{width:18px;height:18px;margin-left:auto;transition:transform .2s}',
    '.mod-magie .mg-adv[open]>summary svg{transform:rotate(180deg)}',
    '.mod-magie .mg-adv>div{padding:4px 14px 14px}',
    '.mod-magie .mg-linkbox{display:flex;gap:6px;margin-top:8px}',
    '.mod-magie .mg-linkbox input{flex:1;min-width:0;font-size:14px}',
    '.mod-magie .mg-help{font-size:13px;color:var(--text-sub);margin:6px 0 0}',
    '.mod-magie .mg-warn{font-size:13px;color:var(--text);margin:8px 0 0;padding:8px 10px;border-radius:var(--radius);border:1px solid var(--warn);background:var(--surface)}',
    '.mod-magie .mg-photo{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '.mod-magie .mg-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
    '.mod-magie .mg-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--text-sub);align-items:center}',
    '.mod-magie .mg-steps b{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-weight:500}',
    '@media (max-width:699px){',
    '  .mod-magie.mg-studio .mg-st{grid-template-columns:1fr;gap:12px}',
    '  .mod-magie .mg-prev{background:var(--bg);padding:6px 0 8px;margin:0 -16px;border-bottom:1px solid var(--line)}',
    '  .mod-magie .mg-cv{width:auto;height:min(38vh,340px);margin:0 auto;aspect-ratio:9/16}',
    '  .mod-magie.mg-studio .mg-ctl button,.mod-magie.mg-studio .mg-ctl input,.mod-magie.mg-studio .mg-ctl summary{scroll-margin-top:calc(min(38vh,340px) + 90px);scroll-margin-bottom:140px}',
    '  .mod-magie .mg-pager{margin-top:6px}',
    '  .mod-magie .mg-note{margin-top:4px}',
    '}'
  ].join('\n');
  function ensureCss() {
    if (document.querySelector('style[data-module="magie"]')) return;
    var s = document.createElement('style'); s.setAttribute('data-module', 'magie'); s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* =====================================================================
   * PANNEAU « REMPLIR L'AGENDA »
   * =================================================================== */
  var M = null;   // état du panneau ouvert
  var STU = null; // état du studio ouvert

  function defaultServices() {
    var c = cfg() || {}, ok = {};
    (c.services || []).forEach(function (s) { if (s.categorie === 'main' || s.categorie === 'pied') ok[s.id] = s.categorie; });
    var want = (c.magie && Array.isArray(c.magie.services) ? c.magie.services : ['remplissage']).filter(function (id) { return ok[id]; });
    var main = want.filter(function (id) { return ok[id] === 'main'; })[0], pied = want.filter(function (id) { return ok[id] === 'pied'; })[0];
    var out = [main, pied].filter(Boolean);
    if (!out.length) { var first = Object.keys(ok).filter(function (id) { return ok[id] === 'main'; })[0] || Object.keys(ok)[0]; if (first) out = [first]; }
    return out;
  }
  function svcList(cat) { try { return (G.svcs(cat) || []).filter(function (s) { return s.categorie === cat; }); } catch (e) { return []; } }
  function svcCat(id) { var c = cfg() || {}; var s = (c.services || []).filter(function (x) { return x.id === id; })[0]; return s ? s.categorie : ''; }
  function svcLabel(ids) { return ids.map(function (id) { return svcName(id); }).join(' + '); }

  function periods(st) {
    var u = U(), t = G.today(), w = wd(t), mon = u.addDays(t, -((w + 6) % 7));
    var c = cfg() || {}, hz = Math.max(1, Math.min(31, (c.magie && +c.magie.horizonJours) || 7));
    var l = [
      { id: 'auj', nom: 'Aujourd\'hui et demain', du: t, au: u.addDays(t, 1) },
      { id: '7j', nom: hz + ' prochains jours', du: t, au: u.addDays(t, hz - 1) },
      { id: 'semaine', nom: 'Cette semaine', du: t, au: u.addDays(mon, 6) },
      { id: 'prochaine', nom: 'Semaine prochaine', du: u.addDays(mon, 7), au: u.addDays(mon, 13) }
    ];
    if (st.jour) l.push({ id: 'jour', nom: st.jour.du === st.jour.au ? 'Jour affiché' : 'Période affichée', du: st.jour.du, au: st.jour.au });
    return l;
  }
  function curPer(st) { var l = periods(st); return l.filter(function (p) { return p.id === st.per; })[0] || l[1]; }
  function shownPids(st) { return st.qui === 'tous' ? activeIds() : [st.qui]; }
  function key(date, pid, debut) { return date + '|' + pid + '|' + debut; }

  function open(opts) {
    opts = opts || {};
    var c = cfg();
    if (!c || !c.services) { toast('Connectez-vous d\'abord.', 'err'); return null; }
    ensureCss();
    if (M && !M.closed) { try { M.panel.close(); } catch (e) { /* ignore */ } }
    var ids = activeIds();
    var qui = opts.praticienne || (G.filtre && G.filtre.prat) || 'tous';
    if (qui !== 'tous' && ids.indexOf(qui) < 0) qui = 'tous';
    if (qui === 'tous' && ids.length === 1) qui = ids[0];
    var jour = opts.du ? { du: opts.du, au: opts.au && opts.au >= opts.du ? opts.au : opts.du } : null;
    var per = jour ? 'jour' : ls.get('per', '7j');
    if (['auj', '7j', 'semaine', 'prochaine'].indexOf(per) < 0 && !jour) per = '7j';
    var st = { qui: qui, per: per, jour: jour, services: defaultServices(), excl: {}, data: null, loading: false, err: null, req: 0,
      changed: false, closed: false, relMore: false, alMore: false, loadP: Promise.resolve() };
    M = st;
    var root = document.createElement('div');
    root.className = 'mod-magie mg-main';
    st.root = root;
    st.panel = G.panel({ title: 'Remplir l\'agenda', size: 'wide', content: root, onClose: function () { st.closed = true; } });
    // Le module gère ses marges : sans cela la barre « Créer la story » flotte au-dessus d'une bande de contenu
    if (st.panel && st.panel.el) { st.panel.el.style.padding = '0'; }
    bindMain(st);
    load(st);
    return st.panel;
  }

  function load(st) {
    var my = ++st.req, p = curPer(st);
    st.loading = true; st.err = null; renderMain(st);
    st.loadP = G.API.admin('admin.remplir', { praticienne: st.qui, du: p.du, au: p.au, services: st.services }).then(function (d) {
      if (my !== st.req || st.closed) return;
      st.data = d; st.loading = false; renderMain(st);
    }, function (e) {
      if (my !== st.req || st.closed) return;
      st.loading = false; st.err = (e && e.message) || 'Erreur inattendue.'; renderMain(st);
    });
    return st.loadP;
  }

  function collectAlerts(st) {
    var out = [];
    if (!st.data) return out;
    st.data.jours.forEach(function (j) {
      shownPids(st).forEach(function (pid) {
        var P = j.praticiennes[pid]; if (!P) return;
        var crit = (P.alertes || []).filter(function (a) { return a.niveau === 'critique'; });
        var att = (P.alertes || []).filter(function (a) { return a.niveau === 'attention'; });
        if (!crit.length && !att.length) return;
        out.push({ date: j.date, pid: pid, niveau: crit.length ? 'critique' : 'attention', textes: crit.concat(att).map(function (a) { return a.texte; }), P: P });
      });
    });
    out.sort(function (a, b) { return (a.niveau === b.niveau ? 0 : a.niveau === 'critique' ? -1 : 1) || a.date.localeCompare(b.date) || pratOrder(a.pid, b.pid); });
    return out;
  }

  function checkedItems(st) {
    var out = [];
    if (!st.data) return out;
    st.data.jours.forEach(function (j) {
      shownPids(st).forEach(function (pid) {
        var P = j.praticiennes[pid]; if (!P) return;
        (P.creneaux || []).forEach(function (c) {
          var k = key(j.date, pid, c.debut);
          if (!st.excl[k]) out.push({ key: k, date: j.date, praticienne: pid, debut: c.debut, fin: c.fin, ordre: c.ordre });
        });
      });
    });
    return out;
  }
  function allSlots(st) {
    var n = 0;
    if (st.data) st.data.jours.forEach(function (j) { shownPids(st).forEach(function (pid) { var P = j.praticiennes[pid]; if (P) n += (P.creneaux || []).length; }); });
    return n;
  }
  function findSlot(st, k) {
    var f = null;
    if (st.data) st.data.jours.forEach(function (j) { Object.keys(j.praticiennes).forEach(function (pid) { (j.praticiennes[pid].creneaux || []).forEach(function (c) { if (key(j.date, pid, c.debut) === k) f = { date: j.date, pid: pid, c: c }; }); }); });
    return f;
  }

  function pStyle(pid) { var c = pc(pid); return '--pc:' + c + ';--pt:' + inkOn(c) + ';--pbg:' + tnt(c, 0.1); }

  function ctrlHTML(st) {
    var ids = activeIds(), p = curPer(st), h = '<div class="mg-ctrl">';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-qui">Pour qui</span><div class="mg-seg" role="group" aria-labelledby="mg-l-qui">';
    if (ids.length > 1) h += '<button type="button" data-a="qui" data-v="tous" class="' + (st.qui === 'tous' ? 'on' : '') + '" aria-pressed="' + (st.qui === 'tous') + '">Les deux</button>';
    ids.forEach(function (id) {
      h += '<button type="button" data-a="qui" data-v="' + esc(id) + '" class="pr' + (st.qui === id ? ' on' : '') + '" style="' + pStyle(id) + '" aria-pressed="' + (st.qui === id) + '"><span class="mg-dot"></span>' + esc(pn(id)) + '</button>';
    });
    h += '</div></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-per">Période</span><div class="mg-chips" role="group" aria-labelledby="mg-l-per">' + periods(st).map(function (x) {
      return '<button type="button" class="mg-chip' + (x.id === p.id ? ' on' : '') + '" data-a="per" data-v="' + x.id + '" aria-pressed="' + (x.id === p.id) + '">' + esc(x.nom) + '</button>';
    }).join('') + '</div><div class="mg-range">' + esc(p.du === p.au ? cap1(dayLong(p.du)) : 'Du ' + dayLong(p.du) + ' au ' + dayLong(p.au)) + '</div></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-svc">Prestation à proposer</span><div class="mg-chips" role="group" aria-labelledby="mg-l-svc">';
    var mains = svcList('main'), pieds = svcList('pied');
    function chip(s) {
      var on = st.services.indexOf(s.id) >= 0, col = '#8E9583';
      try { col = G.svcColor(s.id) || col; } catch (e) { /* défaut */ }
      return '<button type="button" class="mg-chip' + (on ? ' on' : '') + '" data-a="svc" data-v="' + esc(s.id) + '" aria-pressed="' + on + '" style="--sc:' + col + '"><i></i>' + esc(svcName(s.id, true)) + '<small>' + esc(fmtDur(s.duree)) + '</small></button>';
    }
    if (st.svcOpen) {
      h += mains.map(chip).join('');
      if (pieds.length) h += '<span class="mg-sep" aria-hidden="true"></span>' + pieds.map(chip).join('');
      h += '<button type="button" class="mg-link" data-a="svc-open" data-v="0">Fermer</button></div><div class="mg-range">Un soin mains, et si besoin un soin pieds en plus.</div></div>';
    } else {
      h += mains.concat(pieds).filter(function (s) { return st.services.indexOf(s.id) >= 0; }).map(chip).join('') +
        '<button type="button" class="mg-chip" data-a="svc-open" data-v="1" aria-expanded="false">' + ic('edit') + 'Changer</button></div></div>';
    }
    return h + '</div>';
  }
  function fmtDur(m) { m = +m || 0; var h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + pad(r) : '') : r + ' min'; }

  function summaryHTML(st) {
    var d = st.data, lbl = svcLabel(d.services || st.services);
    var h = '<section class="mg-sec" aria-labelledby="mg-h-sum"><h3 id="mg-h-sum">Résumé</h3><div class="mg-sum">';
    Object.keys(d.resume).sort(pratOrder).forEach(function (pid) {
      var r = d.resume[pid], taux = r.max ? Math.round(r.clientes / r.max * 100) : 0;
      h += '<div class="mg-card" style="' + pStyle(pid) + '"><div class="mg-card-h"><span class="mg-dot"></span>' + esc(pn(pid)) + '<span class="mg-cnt">' + r.clientes + '/' + r.max + ' clientes</span></div>' +
        '<div class="mg-big"><b>' + r.capacite + '</b><span>' + esc(lbl) + ' encore possible' + (r.capacite > 1 ? 's' : '') + '</span></div>' +
        '<p>' + plural(r.places, 'place restante', 'places restantes') + ' · remplie à ' + taux + ' %</p>' +
        '<div class="mg-gauge" role="img" aria-label="Remplissage ' + taux + ' %"><i style="width:' + Math.min(100, taux) + '%"></i></div></div>';
    });
    return h + '</div></section>';
  }

  function alertsHTML(st) {
    var al = collectAlerts(st), h = '<section class="mg-sec" aria-labelledby="mg-h-al"><h3 id="mg-h-al">À traiter en priorité' + (al.length ? '<span class="mg-n">' + al.length + '</span>' : '') + '</h3>';
    if (!al.length) return h + '<div class="mg-empty">Rien d\'urgent sur cette période.</div></section>';
    var lim = st.alMore ? al.length : 6;
    h += '<div class="mg-list">' + al.slice(0, lim).map(function (a) {
      var crit = a.niveau === 'critique';
      var hasSlot = (a.P.creneaux || []).length > 0;
      return '<div class="mg-row mg-alert' + (crit ? ' crit' : '') + '" style="' + pStyle(a.pid) + '"><div class="mg-body"><div class="mg-t"><span class="mg-badge ' + (crit ? 'crit' : 'att') + '">' + (crit ? 'Urgent' : 'À voir') + '</span>' +
        esc(dayTitle(a.date)) + '<span class="mg-pratname"><span class="mg-dot"></span>' + esc(pn(a.pid)) + '</span></div><div class="mg-s">' + a.textes.map(esc).join(' · ') + '</div></div>' +
        '<div class="mg-acts">' + (hasSlot ? '<button type="button" class="mg-btn" data-a="al-book" data-d="' + a.date + '" data-p="' + esc(a.pid) + '">' + ic('plus') + 'Placer une cliente</button>' : '') +
        '<button type="button" class="mg-btn" data-a="goday" data-d="' + a.date + '">' + ic('calendar') + 'Voir le jour</button></div></div>';
    }).join('') + '</div>';
    if (al.length > lim) h += '<button type="button" class="mg-link" data-a="al-more">Voir les ' + al.length + ' points</button>';
    return h + '</section>';
  }

  function relWhen(r) {
    var n = r.retardJours;
    if (n > 0) return { txt: 'en retard de ' + n + ' j', late: true };
    if (n === 0) return { txt: 'prévu aujourd\'hui', late: false };
    return { txt: 'dans ' + (-n) + ' j', late: false };
  }
  function relMsg(r) {
    var s = r.suggestion;
    var what = (r.services || []).indexOf('remplissage') >= 0 ? 'ton prochain remplissage approche' : 'ton prochain rendez-vous approche';
    return 'Bonjour ' + r.prenom + ', ' + what + (s ? ' : je te propose ' + dayLong(s.date) + ' à ' + hfr(s.debut) + '. Dis-moi si ça te va !' : '. Dis-moi quand tu es disponible !');
  }
  function relancesHTML(st) {
    var rl = st.data.relances || [], h = '<section class="mg-sec" aria-labelledby="mg-h-rel"><h3 id="mg-h-rel">Clientes à relancer' + (rl.length ? '<span class="mg-n">' + rl.length + '</span>' : '') + '</h3>';
    if (!rl.length) return h + '<div class="mg-empty">Aucune cliente à relancer sur cette période.</div></section>';
    var lim = st.relMore ? rl.length : 5, hasFiche = !!(G.modules && G.modules.clientes);
    h += '<div class="mg-list">' + rl.slice(0, lim).map(function (r, i) {
      var w = relWhen(r), s = r.suggestion;
      var nom = esc((r.prenom + ' ' + (r.nom || '')).trim());
      return '<div class="mg-row" style="' + pStyle(r.praticienne) + '"><span class="mg-av" aria-hidden="true">' + esc((r.prenom || '?').charAt(0).toUpperCase()) + '</span>' +
        '<div class="mg-body"><div class="mg-t">' + (hasFiche ? '<button type="button" class="mg-link" style="padding:0;min-height:0;color:var(--text);font-weight:600;font-size:15px" data-a="fiche" data-i="' + i + '">' + nom + '</button>' : nom) +
        '<span class="mg-pratname"><span class="mg-dot"></span>' + esc(pn(r.praticienne)) + '</span>' + (w.late ? '<span class="mg-badge late">En retard</span>' : '') + '</div>' +
        '<div class="mg-s">' + esc(svcLabel(r.services || [])) + ' prévu le ' + ddmm(r.prevue) + ' (' + w.txt + ')</div>' +
        (s ? '<div class="mg-s">Créneau suggéré : <b style="color:var(--text);font-weight:600">' + esc(cap1(dayShort(s.date)) + ' à ' + hfr(s.debut)) + '</b> avec ' + esc(pn(s.praticienne)) + '</div>' : '<div class="mg-s">Pas de créneau trouvé sur la période.</div>') + '</div>' +
        '<div class="mg-acts"><button type="button" class="mg-btn pri" data-a="rel-book" data-i="' + i + '">' + ic('plus') + 'Réserver</button>' +
        '<button type="button" class="mg-btn" data-a="rel-copy" data-i="' + i + '">' + ic('copy') + 'Copier le message</button></div></div>';
    }).join('') + '</div>';
    if (rl.length > lim) h += '<button type="button" class="mg-link" data-a="rel-more">Voir les ' + rl.length + ' clientes</button>';
    return h + '</section>';
  }

  function slotsHTML(st) {
    var d = st.data, total = allSlots(st), n = checkedItems(st).length;
    var h = '<section class="mg-sec" aria-labelledby="mg-h-sl"><h3 id="mg-h-sl">Créneaux à proposer' + (total ? '<span class="mg-n" data-n="sel">' + n + '/' + total + ' cochés</span><span class="mg-sp"></span>' +
      '<button type="button" class="mg-link" data-a="all" data-v="1">Tout cocher</button><button type="button" class="mg-link" data-a="all" data-v="0">Tout décocher</button>' : '') + '</h3>';
    if (!d.jours.length) {
      var p = curPer(st);
      return h + '<div class="mg-empty">' + (p.au < G.today() ? 'Ce jour est passé : choisissez une autre période.' : 'Le salon est fermé sur cette période.') + '</div></section>';
    }
    h += '<p class="mg-help" style="margin:-4px 0 4px">Heures conseillées pour ' + esc(svcLabel(d.services || st.services)) + '. Touchez une heure pour réserver ; les cases cochées iront dans la story.</p>';
    d.jours.forEach(function (j) {
      var blocks = shownPids(st).map(function (pid) {
        var P = j.praticiennes[pid]; if (!P) return '';
        var info = P.clientes + '/' + P.max + ' clientes';
        if (P.placesRestantes > 0 && P.capacite > 0) info += ' · ' + P.capacite + ' possible' + (P.capacite > 1 ? 's' : '');
        var body = '';
        var blocked = (P.alertes || []).some(function (a) { return a.niveau === 'info'; });
        if (blocked) body = '<div class="mg-none">Indisponible ce jour-là.</div>';
        else if (P.clientes >= P.max) body = '<div class="mg-none">Journée complète.</div>';
        else {
          if ((P.fenetres || []).length) {
            body += '<div class="mg-wins"><span>Libre :</span>' + P.fenetres.map(function (w, wi) {
              return '<button type="button" class="mg-win" data-a="win" data-d="' + j.date + '" data-p="' + esc(pid) + '" data-w="' + wi + '" aria-label="Réserver dans la plage libre ' + esc(hfr(w.debut) + ' à ' + hfr(w.fin)) + '">' + esc(hfr(w.debut) + ' – ' + hfr(w.fin)) + '</button>';
            }).join('') + '</div>';
          }
          if ((P.creneaux || []).length) {
            body += '<div class="mg-slots">' + P.creneaux.map(function (c) {
              var k = key(j.date, pid, c.debut), on = !st.excl[k];
              return '<div class="mg-slot' + (on ? '' : ' off') + '" data-key="' + esc(k) + '"><label class="mg-chk"><input type="checkbox" data-a="chk" data-key="' + esc(k) + '"' + (on ? ' checked' : '') +
                ' aria-label="Mettre ' + esc(hfr(c.debut)) + ' avec ' + esc(pn(pid)) + ' dans la story"><span>' + ic('check') + '</span></label>' +
                '<button type="button" class="mg-slot-b" data-a="book" data-key="' + esc(k) + '" aria-label="Réserver ' + esc(dayTitle(j.date) + ' à ' + hfr(c.debut) + ' avec ' + pn(pid)) + '"><b>' + esc(hfr(c.debut)) + '</b><small>→ ' + esc(hfr(c.fin)) + '</small><em><span>Réserver</span>' + ic('chevronR') + '</em></button></div>';
            }).join('') + '</div>';
          } else body += '<div class="mg-none">Plus de place pour ' + esc(svcLabel(d.services || st.services)) + ' (trous trop courts).</div>';
        }
        return '<div class="mg-pblk" style="' + pStyle(pid) + '"><div class="mg-ph"><span class="mg-ptag">' + esc(pn(pid)) + '</span><span class="mg-pinfo">' + esc(info) + '</span></div>' + body + '</div>';
      }).join('');
      h += '<div class="mg-day"><h4>' + esc(dayTitle(j.date)) + '</h4>' + blocks + '</div>';
    });
    return h + '</section>';
  }

  function footHTML(st) {
    var n = checkedItems(st).length;
    return '<div class="mg-foot"><div class="mg-fi" data-n="foot"><b>' + plural(n, 'créneau', 'créneaux') + '</b> pour la story · aucun nom de cliente</div>' +
      '<button type="button" class="mg-btn pri" data-a="story"' + (n ? '' : ' disabled') + '>' + ic('image') + 'Créer la story</button></div>';
  }

  function renderMain(st) {
    if (st.closed || !st.root) return;
    var h = '<div class="mg-pad">';
    if (st.changed && st.data) h += '<div class="mg-banner" role="status"><span>Le planning a changé : pensez à mettre la story à jour.</span><button type="button" class="mg-btn pri" data-a="story">' + ic('image') + 'Mettre la story à jour</button></div>';
    h += ctrlHTML(st);
    if (st.err) h += '<div class="mg-sec"><div class="mg-err" role="alert">' + esc(st.err) + ' <button type="button" class="mg-btn" data-a="retry">Réessayer</button></div></div>';
    else if (!st.data) h += '<div class="mg-load" role="status"><span class="mg-spin"></span>Analyse des agendas…</div>';
    else {
      if (st.loading) h += '<div class="mg-busy" role="status" style="margin-top:10px"><span class="mg-spin"></span>Mise à jour…</div>';
      h += summaryHTML(st) + alertsHTML(st) + relancesHTML(st) + slotsHTML(st);
    }
    h += '</div>';
    if (st.data && !st.err && allSlots(st)) h += footHTML(st);
    else h += '<div style="height:24px"></div>';
    st.root.innerHTML = h;
  }

  function updCounts(st) {
    var n = checkedItems(st).length, total = allSlots(st);
    var a = st.root.querySelector('[data-n="sel"]'); if (a) a.textContent = n + '/' + total + ' cochés';
    var f = st.root.querySelector('[data-n="foot"]'); if (f) f.innerHTML = '<b>' + plural(n, 'créneau', 'créneaux') + '</b> pour la story · aucun nom de cliente';
    var b = st.root.querySelector('.mg-foot [data-a="story"]'); if (b) b.disabled = !n;
  }

  function afterBook(st, r) {
    if (r && !st.closed) { st.changed = true; load(st); }
  }
  function newRdv(st, prefill) {
    var p;
    try { p = G.newRdv(prefill); } catch (e) { toast((e && e.message) || 'Création impossible', 'err'); return; }
    if (p && typeof p.then === 'function') p.then(function (r) { afterBook(st, r); }, function () { /* annulé */ });
  }

  function bindMain(st) {
    var root = st.root;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || !root.contains(b)) return;
      var a = b.getAttribute('data-a');
      if (a === 'chk') return; // géré par 'change'
      if (a === 'qui') { var v = b.getAttribute('data-v'); if (v !== st.qui) { st.qui = v; st.excl = {}; load(st); } return; }
      if (a === 'per') { var pv = b.getAttribute('data-v'); if (pv !== st.per) { st.per = pv; if (pv !== 'jour') ls.set('per', pv); load(st); } return; }
      if (a === 'svc') {
        var id = b.getAttribute('data-v'), cat = svcCat(id), cur = st.services.slice();
        if (cur.indexOf(id) >= 0) { if (cur.length === 1) { toast('Gardez au moins une prestation.', 'info'); return; } cur = cur.filter(function (x) { return x !== id; }); }
        else { cur = cur.filter(function (x) { return svcCat(x) !== cat; }); cur.push(id); }
        cur.sort(function (x, y) { return (svcCat(x) === 'pied') - (svcCat(y) === 'pied'); });
        st.services = cur; st.excl = {}; load(st); return;
      }
      if (a === 'retry') { load(st); return; }
      if (a === 'svc-open') { st.svcOpen = b.getAttribute('data-v') === '1'; renderMain(st); return; }
      if (a === 'al-more') { st.alMore = true; renderMain(st); return; }
      if (a === 'rel-more') { st.relMore = true; renderMain(st); return; }
      if (a === 'goday') { var d = b.getAttribute('data-d'); try { st.panel.close(); } catch (x) { /* ignore */ } try { G.goDate(d, 'jour'); } catch (x2) { /* ignore */ } return; }
      if (a === 'al-book') {
        var dd = b.getAttribute('data-d'), pp = b.getAttribute('data-p');
        var j = st.data.jours.filter(function (x) { return x.date === dd; })[0], P = j && j.praticiennes[pp];
        var c = P && P.creneaux && P.creneaux[0];
        newRdv(st, { praticienne: pp, date: dd, debut: c ? c.debut : undefined, services: c && c.ordre ? c.ordre : st.services.slice() });
        return;
      }
      if (a === 'book') {
        var f = findSlot(st, b.getAttribute('data-key')); if (!f) return;
        newRdv(st, { praticienne: f.pid, date: f.date, debut: f.c.debut, services: (f.c.ordre && f.c.ordre.length ? f.c.ordre : st.services).slice() });
        return;
      }
      if (a === 'win') {
        var wd2 = b.getAttribute('data-d'), wp = b.getAttribute('data-p'), wi = +b.getAttribute('data-w');
        var jj = st.data.jours.filter(function (x) { return x.date === wd2; })[0], PP = jj && jj.praticiennes[wp], w = PP && PP.fenetres[wi];
        if (!w) return;
        var main = st.services.filter(function (x) { return svcCat(x) === 'main'; })[0] || st.services[0];
        var fit = (w.prestations || []).filter(function (x) { return x.service === main; })[0];
        newRdv(st, { praticienne: wp, date: wd2, debut: fit ? fit.debut : w.debut, services: fit ? st.services.slice() : undefined });
        return;
      }
      if (a === 'rel-book' || a === 'rel-copy' || a === 'fiche') {
        var r = (st.data.relances || [])[+b.getAttribute('data-i')]; if (!r) return;
        if (a === 'rel-copy') { copyText(relMsg(r), 'Message copié pour ' + r.prenom); return; }
        if (a === 'fiche') { try { G.openClient(r.cle); } catch (x3) { /* ignore */ } return; }
        var s = r.suggestion, pre = { cle: r.cle, prenom: r.prenom, nom: r.nom, praticienne: (s && s.praticienne) || r.praticienne, services: (s && s.ordre && s.ordre.length ? s.ordre : r.services).slice() };
        if (s) { pre.date = s.date; pre.debut = s.debut; }
        newRdv(st, pre); return;
      }
      if (a === 'all') {
        var on = b.getAttribute('data-v') === '1';
        st.data.jours.forEach(function (jx) { shownPids(st).forEach(function (pid) { var Px = jx.praticiennes[pid]; if (!Px) return; (Px.creneaux || []).forEach(function (c) { var k = key(jx.date, pid, c.debut); if (on) delete st.excl[k]; else st.excl[k] = true; }); }); });
        Array.prototype.forEach.call(root.querySelectorAll('input[data-a="chk"]'), function (i) { i.checked = on; var row = i.closest('.mg-slot'); if (row) row.classList.toggle('off', !on); });
        updCounts(st); return;
      }
      if (a === 'story') {
        var go = function () { st.changed = false; renderMain(st); openStudio(st); };
        if (st.loading) st.loadP.then(go); else go();
      }
    });
    root.addEventListener('change', function (e) {
      var i = e.target; if (!i || i.getAttribute('data-a') !== 'chk') return;
      var k = i.getAttribute('data-key');
      if (i.checked) delete st.excl[k]; else st.excl[k] = true;
      var row = i.closest('.mg-slot'); if (row) row.classList.toggle('off', !i.checked);
      updCounts(st);
    });
  }

  /* =====================================================================
   * STUDIO DE STORY
   * =================================================================== */
  var SW = 1080, SH = 1920, SX = 90, CW = SW - 2 * SX;
  var BODY = 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  function bf(w, px) { return w + ' ' + Math.round(px) + 'px ' + BODY; }

  var FONTS = [
    { n: 'Outfit', q: 'Outfit:wght@400;500;600', w: '600', fb: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', k: 1 },
    { n: 'Playfair Display', q: 'Playfair+Display:wght@500;600;700', w: '600', fb: 'Georgia, "Times New Roman", serif', k: 1 },
    { n: 'DM Serif Display', q: 'DM+Serif+Display', w: '400', fb: 'Georgia, "Times New Roman", serif', k: 1 },
    { n: 'Montserrat', q: 'Montserrat:wght@500;600;700', w: '600', fb: '"Helvetica Neue", Helvetica, Arial, sans-serif', k: 0.94 },
    { n: 'Cormorant Garamond', q: 'Cormorant+Garamond:wght@500;600;700', w: '600', fb: 'Georgia, "Times New Roman", serif', k: 1.1 },
    { n: 'Poppins', q: 'Poppins:wght@500;600', w: '600', fb: '"Helvetica Neue", Helvetica, Arial, sans-serif', k: 0.95 },
    { n: 'Caveat', q: 'Caveat:wght@500;700', w: '700', fb: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive', k: 1.2 }
  ];
  function fontBy(n) { return FONTS.filter(function (f) { return f.n === n; })[0] || FONTS[0]; }
  function tf(F, px) { return F.w + ' ' + Math.round(px * F.k) + 'px "' + F.n + '", ' + F.fb; }
  var fontP = {};
  function loadFont(n) {
    if (fontP[n]) return fontP[n];
    var F = fontBy(n);
    try {
      var id = 'mg-font-' + F.n.replace(/\s+/g, '-');
      if (F.n !== 'Outfit' && !document.getElementById(id)) {
        var l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + F.q + '&display=swap';
        document.head.appendChild(l);
      }
    } catch (e) { /* repli système */ }
    var p = new Promise(function (res) {
      if (!document.fonts || !document.fonts.load) { res(false); return; }
      var t = setTimeout(function () { res(false); }, 3500);
      // Attendre la feuille de style puis la police (la feuille peut arriver après le premier load)
      var tries = 0;
      (function tryLoad() {
        document.fonts.load(F.w + ' 80px "' + F.n + '"', 'Aa').then(function (l) {
          if (l && l.length) { clearTimeout(t); res(true); }
          else if (++tries < 6) setTimeout(tryLoad, 450);
          else { clearTimeout(t); res(false); }
        }, function () { clearTimeout(t); res(false); });
      })();
    });
    fontP[n] = p;
    return p;
  }

  var THEMES = [
    { id: 'derniere', nom: 'Dernière minute', bg: '#1E2218', bg2: '#3A4A2F', text: '#FBF7EE', accent: '#E0A48A', fond: 'degrade', font: 'Outfit' },
    { id: 'creme', nom: 'Crème', bg: '#F5EFE3', bg2: '#ECE3D0', text: '#1E2218', accent: '#A85F3F', fond: 'uni', font: 'Playfair Display' },
    { id: 'sauge', nom: 'Sauge', bg: '#6F8161', bg2: '#3A4A2F', text: '#FBF7EE', accent: '#FBF7EE', fond: 'degrade', font: 'Cormorant Garamond' },
    { id: 'terracotta', nom: 'Terracotta', bg: '#C97B5A', bg2: '#A85F3F', text: '#FFFFFF', accent: '#1E2218', fond: 'degrade', font: 'DM Serif Display' },
    { id: 'minimal', nom: 'Minimal blanc', bg: '#FFFFFF', bg2: '#F5EFE3', text: '#1E2218', accent: '#1E2218', fond: 'uni', font: 'Montserrat' },
    { id: 'nuit', nom: 'Nuit', bg: '#141824', bg2: '#2C2440', text: '#F4EFE6', accent: '#C9A86A', fond: 'degrade', font: 'Playfair Display' },
    { id: 'poudre', nom: 'Poudré', bg: '#F7E6DC', bg2: '#EFD3C3', text: '#3C2A22', accent: '#A85F3F', fond: 'degrade', font: 'Caveat' },
    { id: 'photo', nom: 'Photo', bg: '#1E2218', bg2: '#3A4A2F', text: '#FFFFFF', accent: '#E0A48A', fond: 'photo', font: 'Outfit', voile: '#1E2218', voileOp: 0.5 }
  ];
  function themeBy(id) { return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[1]; }
  var SWATCHES = ['#1E2218', '#3A4A2F', '#6F8161', '#8A9D7A', '#ECF0E0', '#FBF7EE', '#F5EFE3', '#E7DCC5', '#E0A48A', '#C97B5A', '#A85F3F', '#FFFFFF'];
  var LAYOUTS = [['liste', 'Liste'], ['agenda', 'Agenda'], ['vedette', 'Une praticienne']];

  function normStyle(s) {
    s = s && typeof s === 'object' ? s : {};
    var th = themeBy(s.theme);
    return {
      theme: th.id,
      layout: LAYOUTS.some(function (l) { return l[0] === s.layout; }) ? s.layout : 'liste',
      font: FONTS.some(function (f) { return f.n === s.font; }) ? s.font : th.font,
      bg: vHex(s.bg), text: vHex(s.text), accent: vHex(s.accent),
      fond: ['uni', 'degrade', 'photo'].indexOf(s.fond) >= 0 ? s.fond : th.fond,
      voile: vHex(s.voile) || th.voile || '#1E2218',
      voileOp: typeof s.voileOp === 'number' ? Math.max(0, Math.min(0.85, s.voileOp)) : (th.voileOp != null ? th.voileOp : 0.45),
      flou: typeof s.flou === 'number' ? Math.max(0, Math.min(3, Math.round(s.flou))) : 1,
      photos: s.photos !== false, adresse: s.adresse !== false,
      vedette: typeof s.vedette === 'string' ? s.vedette : null
    };
  }
  function effTheme(S) {
    var s = S.style, th = themeBy(s.theme);
    var bg = s.bg || th.bg, text = s.text || th.text, accent = s.accent || th.accent;
    var bg2 = s.bg ? (lum(bg) < 0.3 ? mix(bg, '#FFFFFF', 0.82) : mix(bg, '#1E2218', 0.88)) : th.bg2;
    var photo = s.fond === 'photo' && S.bgImg;
    var darkBg = photo ? lum(s.voile) < 0.4 || s.voileOp < 0.3 : lum(bg) < 0.4;
    var card, cardBorder = null;
    if (photo || darkBg || lum(bg) < 0.62) card = '#FBF7EE';
    else if (lum(bg) > 0.95) { card = '#F4F0E8'; }
    else card = '#FFFFFF';
    if (!photo && !darkBg && lum(bg) > 0.62) cardBorder = rgba('#1E2218', 0.08);
    return {
      bg: bg, bg2: bg2, text: text, sub: rgba(text, 0.8), accent: accent, ctaText: inkOn(accent),
      card: card, cardText: '#1E2218', cardSub: '#5A6453', cardBorder: cardBorder, photo: !!photo
    };
  }

  /* --- Fond photo stocké sur l'appareil (IndexedDB, repli localStorage) --- */
  var IDB = {
    db: null,
    open: function () {
      if (IDB.db) return Promise.resolve(IDB.db);
      return new Promise(function (res) {
        try {
          if (!window.indexedDB) { res(null); return; }
          var rq = indexedDB.open('sorelle-magie', 1);
          rq.onupgradeneeded = function () { try { rq.result.createObjectStore('kv'); } catch (e) { /* ignore */ } };
          rq.onsuccess = function () { IDB.db = rq.result; res(IDB.db); };
          rq.onerror = function () { res(null); };
          rq.onblocked = function () { res(null); };
        } catch (e) { res(null); }
      });
    },
    get: function (k) {
      return IDB.open().then(function (db) {
        if (!db) return ls.get(k, null);
        return new Promise(function (res) {
          try { var rq = db.transaction('kv', 'readonly').objectStore('kv').get(k); rq.onsuccess = function () { res(rq.result != null ? rq.result : ls.get(k, null)); }; rq.onerror = function () { res(ls.get(k, null)); }; }
          catch (e) { res(ls.get(k, null)); }
        });
      }, function () { return ls.get(k, null); });
    },
    set: function (k, v) {
      return IDB.open().then(function (db) {
        if (!db) { if (v == null || v.length < 1500000) ls.set(k, v); return; }
        return new Promise(function (res) {
          try { var tx = db.transaction('kv', 'readwrite'); if (v == null) tx.objectStore('kv').delete(k); else tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(); }; tx.onerror = function () { res(); }; }
          catch (e) { res(); }
        });
      }).catch(function () { /* stockage impossible : photo gardée pour cette session */ });
    }
  };

  function loadImage(src) {
    return new Promise(function (res) {
      if (!src) { res(null); return; }
      var im = new Image();
      im.onload = function () { res(im.naturalWidth ? im : null); };
      im.onerror = function () { res(null); };
      im.src = src;
    });
  }
  // Recadrage « cover » d'une image dans w×h
  function coverDraw(ctx, im, w, h) {
    var iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    var s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
    ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  function fileToBg(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type || 'image/')) { rej(new Error('Choisissez une image.')); return; }
      var url = URL.createObjectURL(file);
      loadImage(url).then(function (im) {
        URL.revokeObjectURL(url);
        if (!im) { rej(new Error('Image illisible : essayez une autre photo.')); return; }
        var w = 1080, h = 1920, out = null;
        [[1080, 1920, 0.82], [810, 1440, 0.78], [540, 960, 0.75]].some(function (t) {
          var cv = document.createElement('canvas'); cv.width = t[0]; cv.height = t[1];
          var c = cv.getContext('2d'); coverDraw(c, im, t[0], t[1]);
          var d = cv.toDataURL('image/jpeg', t[2]);
          out = d; w = t[0]; h = t[1];
          return d.length < 1400000;
        });
        res(out);
      });
    });
  }
  function blurred(S) {
    var im = S.bgImg; if (!im) return null;
    var k = S.style.flou;
    if (S.bgBlur && S.bgBlur.k === k && S.bgBlur.im === im) return S.bgBlur.cv;
    var cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
    var c = cv.getContext('2d');
    if (!k) coverDraw(c, im, SW, SH);
    else {
      // Flou portable (Safari ne gère pas ctx.filter) : réduction puis agrandissement lissé, en deux passes
      var f = [1, 8, 14, 22][k], sw = Math.max(8, Math.round(SW / f)), sh = Math.max(8, Math.round(SH / f));
      var a = document.createElement('canvas'); a.width = sw; a.height = sh;
      var ac = a.getContext('2d'); ac.imageSmoothingEnabled = true; ac.imageSmoothingQuality = 'high'; coverDraw(ac, im, sw, sh);
      var b = document.createElement('canvas'); b.width = Math.round(sw * 2); b.height = Math.round(sh * 2);
      var bc = b.getContext('2d'); bc.imageSmoothingEnabled = true; bc.drawImage(a, 0, 0, b.width, b.height);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.drawImage(b, 0, 0, SW, SH);
    }
    S.bgBlur = { k: k, im: im, cv: cv };
    return cv;
  }

  /* --- Texte --- */
  function rrect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h / 2, w / 2));
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function wrap(ctx, text, maxW) {
    var words = String(text || '').split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (!cur || ctx.measureText(t).width <= maxW) cur = t; else { lines.push(cur); cur = w; } });
    if (cur) lines.push(cur);
    return lines;
  }
  // Taille la plus grande (≤ size) pour que le texte tienne en maxLines lignes de largeur maxW : jamais rogné
  function fitText(ctx, text, fontFn, size, minSize, maxW, maxLines) {
    var s = size, lines;
    for (; s >= minSize; s -= 2) {
      ctx.font = fontFn(s); lines = wrap(ctx, text, maxW);
      if (lines.length <= maxLines && lines.every(function (l) { return ctx.measureText(l).width <= maxW; })) return { size: s, lines: lines };
    }
    // Au plus petit : on autorise plus de lignes, et on réduit encore si un mot seul dépasse
    s = minSize;
    for (; s >= 14; s -= 2) {
      ctx.font = fontFn(s); lines = wrap(ctx, text, maxW);
      if (lines.every(function (l) { return ctx.measureText(l).width <= maxW; })) return { size: s, lines: lines };
    }
    ctx.font = fontFn(14); return { size: 14, lines: wrap(ctx, text, maxW) };
  }

  /* --- Contenu de la story --- */
  function storyDays(items) {
    var byDay = [], idx = {};
    items.slice().sort(function (a, b) { return a.date.localeCompare(b.date) || pratOrder(a.praticienne, b.praticienne) || a.debut.localeCompare(b.debut); })
      .forEach(function (it) {
        if (!(it.date in idx)) { idx[it.date] = byDay.length; byDay.push({ date: it.date, groups: [] }); }
        var d = byDay[idx[it.date]], g = d.groups.filter(function (x) { return x.pid === it.praticienne; })[0];
        if (!g) { g = { pid: it.praticienne, items: [] }; d.groups.push(g); }
        g.items.push(it);
      });
    return byDay;
  }
  function storyDayLabel(d) { var r = rel(d); return r ? r + ' · ' + dayNum(d).toLowerCase() : cap1(dayLong(d)); }

  // Mise en page LISTE : jours, puis une ligne par praticienne (étiquette + heures en pastilles)
  function layoutList(ctx, m, items, f) {
    var days = storyDays(items), multi = m.pids.length > 1 && m.layout !== 'vedette';
    var ph = Math.round(f * 1.72), gap = Math.round(f * 0.3), band = Math.round(f * 0.26), padx = Math.round(f * 0.5);
    var LW = 0;
    if (multi) {
      ctx.font = bf('600', f * 0.85);
      m.pids.forEach(function (pid) { LW = Math.max(LW, ctx.measureText(pn(pid)).width + (m.imgs[pid] && m.style.photos ? ph + f * 0.35 : f * 0.75)); });
      LW = Math.ceil(LW + f * 0.5);
      if (LW > CW * 0.42) LW = Math.ceil(CW * 0.42);
    }
    var ops = [], y = 0;
    days.forEach(function (d, di) {
      if (di) y += Math.round(f * 0.9);
      var hs = Math.round(f * 0.92);
      ops.push({ t: 'day', y: y, text: storyDayLabel(d.date), size: hs });
      y += Math.round(hs * 1.5);
      d.groups.forEach(function (g, gi) {
        if (gi) y += Math.round(f * 0.42);
        var x0 = multi ? LW : 0, x = x0;
        if (multi) ops.push({ t: 'lab', y: y, pid: g.pid, f: f, h: ph, w: LW });
        g.items.forEach(function (it) {
          ctx.font = bf('600', f); var tw = ctx.measureText(hfr(it.debut)).width;
          var w = Math.ceil(band + padx * 2 + tw);
          if (x > x0 && x + w > CW) { x = x0; y += ph + gap; }
          ops.push({ t: 'slot', x: x, y: y, w: w, h: ph, it: it, f: f, band: band, padx: padx });
          x += w + gap;
        });
        y += ph;
      });
    });
    return { h: y, ops: ops };
  }
  // Mise en page AGENDA : grille de jours (cartes), créneaux par praticienne dans chaque jour
  function layoutAgenda(ctx, m, items, f) {
    var days = storyDays(items), n = days.length;
    var cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, gapX = 24, gapY = 24;
    var cwid = Math.floor((CW - gapX * (cols - 1)) / cols), p = Math.round(f * 0.55), iw = cwid - 2 * p;
    var chh = Math.round(f * 1.4), cg = Math.round(f * 0.24), cpad = Math.round(f * 0.42), multi = m.pids.length > 1;
    var cards = days.map(function (d) {
      var ops = [], y = p;
      ops.push({ t: 'cday', y: y, text: cols === 1 ? storyDayLabel(d.date) : cap1(dayShort(d.date)), size: Math.round(f * 0.95) });
      y += Math.round(f * 0.95 * 1.25) + Math.round(f * 0.2);
      d.groups.forEach(function (g, gi) {
        if (gi) y += Math.round(f * 0.3);
        if (multi) { ops.push({ t: 'clab', y: y, pid: g.pid, size: Math.round(f * 0.66) }); y += Math.round(f * 0.66 * 1.45); }
        var x = 0;
        g.items.forEach(function (it) {
          ctx.font = bf('600', f * 0.86); var w = Math.ceil(ctx.measureText(hfr(it.debut)).width + cpad * 2);
          if (w > iw) w = iw;
          if (x > 0 && x + w > iw) { x = 0; y += chh + cg; }
          ops.push({ t: 'chip', x: x, y: y, w: w, h: chh, it: it, size: Math.round(f * 0.86) });
          x += w + cg;
        });
        y += chh;
      });
      return { h: y + p, ops: ops, date: d.date };
    });
    var out = [], y = 0;
    for (var i = 0; i < cards.length; i += cols) {
      var row = cards.slice(i, i + cols), rh = Math.max.apply(null, row.map(function (c) { return c.h; }));
      row.forEach(function (c, ci) { out.push({ t: 'card', x: ci * (cwid + gapX), y: y, w: cwid, h: rh, card: c, p: p }); });
      y += rh + gapY;
    }
    return { h: Math.max(0, y - gapY), ops: out, minW: iw };
  }

  function layoutFor(m) { return m.layout === 'agenda' ? layoutAgenda : layoutList; }
  // Une seule page si possible, sinon pagination automatique (taille commune lisible)
  function paginate(ctx, m, items, avail) {
    var lay = layoutFor(m), fMax = m.layout === 'agenda' ? 70 : 66, fMin = m.layout === 'agenda' ? 34 : 38;
    function fit(list, a, b) { for (var f = a; f >= b; f -= 2) { var L = lay(ctx, m, list, f); if (L.h <= avail) return { f: f, L: L }; } return null; }
    var one = fit(items, fMax, fMin);
    if (one) return [{ items: items, f: one.f, L: one.L }];
    // Remplissage glouton à une taille cible ; si une page reste trop serrée, on vise plus grand (plus de pages)
    var target = m.layout === 'agenda' ? 46 : 46, pages, f, cur;
    for (var guard = 0; guard < 8; guard++, target += 4) {
      pages = []; cur = [];
      items.forEach(function (it) {
        var t = cur.concat([it]);
        if (cur.length && lay(ctx, m, t, target).h > avail) { pages.push(cur); cur = [it]; } else cur = t;
      });
      if (cur.length) pages.push(cur);
      f = Math.min.apply(null, pages.map(function (p) { var r = fit(p, fMax, 24); return r ? r.f : 24; }));
      if (f >= fMin - 4) break;
    }
    return pages.map(function (p) { return { items: p, f: f, L: lay(ctx, m, p, f) }; });
  }

  function drawAvatar(ctx, m, pid, cx, cy, r, ring) {
    var im = m.imgs[pid], col = pc(pid);
    ctx.save();
    if (ring) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r + ring, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    if (im) { ctx.clip(); var d = r * 2; ctx.translate(cx - r, cy - r); coverDraw(ctx, im, d, d); }
    else {
      ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = inkOn(col); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = tf(m.F, r * 1.05); ctx.fillText((pn(pid) || '?').charAt(0).toUpperCase(), cx, cy + r * 0.04);
    }
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // En-tête : nom du salon, titre, sous-titre, légende (ou praticienne en avant) ; renvoie le haut de la zone de contenu
  function head(ctx, m, th, draw, pi, np) {
    var y = 262;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (draw) {
      ctx.fillStyle = th.sub; ctx.font = bf('500', 34); ctx.fillText(m.salon, SX, y);
      if (np > 1) { ctx.textAlign = 'right'; ctx.fillText((pi + 1) + '/' + np, SW - SX, y); ctx.textAlign = 'left'; }
    }
    y += 26;
    var tFn = function (s) { return tf(m.F, s); }, tMax = m.layout === 'vedette' ? 100 : 116;
    var T = fitText(ctx, m.texts.titre, tFn, tMax, 84, CW, 1);
    if (T.lines.length > 1 || T.size < 84) T = fitText(ctx, m.texts.titre, tFn, tMax, 60, CW, 2);
    var lhT = Math.round(T.size * m.F.k * 1.08);
    T.lines.forEach(function (l, i) {
      var by = y + Math.round(T.size * m.F.k * 0.92) + i * lhT;
      if (draw) { ctx.font = tf(m.F, T.size); ctx.fillStyle = th.text; ctx.fillText(l, SX, by); }
    });
    y += Math.round(T.size * m.F.k * 0.92) + (T.lines.length - 1) * lhT + Math.round(T.size * 0.2);
    if (m.layout === 'vedette') {
      var pid = m.vedette, d = 250, cy;
      y += 40; cy = y + d / 2;
      if (draw) drawAvatar(ctx, m, pid, SX + d / 2, cy, d / 2, 8);
      var tx = SX + d + 50, tw = SW - SX - tx;
      var N = fitText(ctx, pn(pid), function (s) { return tf(m.F, s); }, 92, 48, tw, 1);
      var Sb = fitText(ctx, m.texts.sous, function (s) { return bf('400', s); }, 40, 28, tw, 3);
      var blockH = Math.round(N.size * m.F.k) + 16 + Sb.lines.length * Math.round(Sb.size * 1.3);
      var by0 = cy - blockH / 2 + Math.round(N.size * m.F.k * 0.85);
      if (draw) {
        ctx.font = tf(m.F, N.size); ctx.fillStyle = th.text; ctx.fillText(N.lines[0], tx, by0);
        ctx.font = bf('400', Sb.size); ctx.fillStyle = th.sub;
        Sb.lines.forEach(function (l, i) { ctx.fillText(l, tx, by0 + 16 + Math.round(Sb.size * 1.12) + i * Math.round(Sb.size * 1.3)); });
      }
      y = Math.max(y + d, cy + blockH / 2) + 8;
    } else {
      if (m.texts.sous) {
        var S2 = fitText(ctx, m.texts.sous, function (s) { return bf('400', s); }, 44, 30, CW, 3), lh = Math.round(S2.size * 1.3);
        y += 18;
        S2.lines.forEach(function (l, i) { if (draw) { ctx.font = bf('400', S2.size); ctx.fillStyle = th.sub; ctx.fillText(l, SX, y + Math.round(S2.size * 0.95) + i * lh); } });
        y += Math.round(S2.size * 0.95) + (S2.lines.length - 1) * lh + Math.round(S2.size * 0.3);
      }
      var withPh = m.style.photos && m.pids.some(function (p) { return m.imgs[p]; });
      if ((m.layout === 'agenda' && (m.pids.length > 1 || withPh)) || (m.pids.length === 1 && withPh)) {
        // Légende des praticiennes : pastilles avec photo (ou point de couleur)
        y += 28;
        var ch = withPh ? 92 : 76, x = SX;
        m.pids.forEach(function (p) {
          ctx.font = bf('600', 40);
          var w = Math.ceil(ctx.measureText(pn(p)).width) + (withPh ? ch + 28 : 84);
          if (x > SX && x + w > SX + CW) { x = SX; y += ch + 14; }
          if (draw) {
            ctx.fillStyle = th.card; rrect(ctx, x, y, w, ch, ch / 2); ctx.fill();
            if (th.cardBorder) { ctx.strokeStyle = th.cardBorder; ctx.lineWidth = 2; ctx.stroke(); }
            if (withPh) drawAvatar(ctx, m, p, x + ch / 2, y + ch / 2, ch / 2 - 9, 4);
            else { ctx.fillStyle = pc(p); ctx.beginPath(); ctx.arc(x + 40, y + ch / 2, 16, 0, Math.PI * 2); ctx.fill(); }
            ctx.fillStyle = th.cardText; ctx.font = bf('600', 40); ctx.fillText(pn(p), x + (withPh ? ch + 6 : 68), y + ch / 2 + 14);
          }
          x += w + 16;
        });
        y += ch;
      }
    }
    return y + 56;
  }
  // Pied : appel à l'action + adresse ; renvoie le bas de la zone de contenu
  function foot(ctx, m, th, draw) {
    var C = fitText(ctx, m.texts.cta, function (s) { return bf('600', s); }, 48, 30, CW - 110, 2);
    var lh = Math.round(C.size * 1.25), h = C.lines.length * lh + 70;
    var bottom = m.style.adresse ? 1640 : 1680, top = bottom - h;
    if (draw) {
      ctx.fillStyle = th.accent; rrect(ctx, SX, top, CW, h, Math.min(h / 2, 64)); ctx.fill();
      ctx.fillStyle = th.ctaText; ctx.font = bf('600', C.size); ctx.textAlign = 'center';
      C.lines.forEach(function (l, i) { ctx.fillText(l, SW / 2, top + 35 + Math.round(C.size * 0.9) + i * lh); });
      if (m.style.adresse && m.adresse) {
        var A = fitText(ctx, m.adresse, function (s) { return bf('500', s); }, 34, 22, CW, 2);
        ctx.font = bf('500', A.size); ctx.fillStyle = th.sub;
        A.lines.forEach(function (l, i) { ctx.fillText(l, SW / 2, bottom + 54 + i * Math.round(A.size * 1.25)); });
      }
      ctx.textAlign = 'left';
    }
    return top - 56 - (m.lien ? 190 : 0);
  }

  function drawBg(ctx, m, th) {
    var s = m.style;
    if (s.fond === 'photo' && th.photo) {
      ctx.drawImage(blurred(m.S), 0, 0, SW, SH);
      ctx.fillStyle = rgba(s.voile, s.voileOp); ctx.fillRect(0, 0, SW, SH);
      // Renfort discret en haut et en bas pour la lisibilité
      var g = ctx.createLinearGradient(0, 0, 0, SH);
      g.addColorStop(0, rgba(s.voile, 0.35)); g.addColorStop(0.3, rgba(s.voile, 0)); g.addColorStop(0.75, rgba(s.voile, 0)); g.addColorStop(1, rgba(s.voile, 0.4));
      ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
    } else if (s.fond === 'degrade' || s.fond === 'photo') {
      var gr = ctx.createLinearGradient(0, 0, SW * 0.35, SH);
      gr.addColorStop(0, th.bg); gr.addColorStop(1, th.bg2);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, SW, SH);
    } else { ctx.fillStyle = th.bg; ctx.fillRect(0, 0, SW, SH); }
  }

  function drawContent(ctx, m, th, pg, top) {
    if (m.layout === 'agenda') {
      pg.L.ops.forEach(function (o) {
        var x0 = SX + o.x, y0 = top + o.y, c = o.card;
        ctx.fillStyle = th.card; rrect(ctx, x0, y0, o.w, o.h, 28); ctx.fill();
        if (th.cardBorder) { ctx.strokeStyle = th.cardBorder; ctx.lineWidth = 2; ctx.stroke(); }
        var iw = o.w - 2 * o.p;
        c.ops.forEach(function (q) {
          var ix = x0 + o.p, iy = y0 + q.y;
          if (q.t === 'cday') {
            var D = fitText(ctx, q.text, function (s) { return tf(m.F, s); }, q.size, 18, iw, 1);
            ctx.font = tf(m.F, D.size); ctx.fillStyle = th.cardText; ctx.fillText(D.lines[0], ix, iy + Math.round(q.size * 0.95));
          } else if (q.t === 'clab') {
            ctx.fillStyle = pc(q.pid); ctx.beginPath(); ctx.arc(ix + q.size * 0.35, iy + q.size * 0.62, q.size * 0.33, 0, Math.PI * 2); ctx.fill();
            var Lb = fitText(ctx, pn(q.pid), function (s) { return bf('600', s); }, q.size, 16, iw - q.size, 1);
            ctx.font = bf('600', Lb.size); ctx.fillStyle = th.cardSub; ctx.fillText(Lb.lines[0], ix + q.size * 0.95, iy + Math.round(q.size * 0.95));
          } else if (q.t === 'chip') {
            var col = pc(q.it.praticienne), bgc = mix(col, '#FFFFFF', 0.24);
            ctx.fillStyle = bgc; rrect(ctx, ix + q.x, iy, q.w, q.h, q.h * 0.3); ctx.fill();
            ctx.fillStyle = col; rrect(ctx, ix + q.x, iy + q.h - 6, q.w, 6, 3); ctx.fill();
            var Ts = fitText(ctx, hfr(q.it.debut), function (s) { return bf('600', s); }, q.size, 14, q.w - 8, 1);
            ctx.font = bf('600', Ts.size); ctx.fillStyle = '#1E2218'; ctx.textAlign = 'center';
            ctx.fillText(Ts.lines[0], ix + q.x + q.w / 2, iy + q.h / 2 + Ts.size * 0.34); ctx.textAlign = 'left';
          }
        });
      });
      return;
    }
    pg.L.ops.forEach(function (o) {
      if (o.t === 'day') {
        var D = fitText(ctx, o.text, function (s) { return tf(m.F, s); }, o.size, 20, CW, 1);
        ctx.font = tf(m.F, D.size); ctx.fillStyle = th.text; ctx.fillText(D.lines[0], SX, top + o.y + Math.round(o.size * m.F.k * 0.92));
        return;
      }
      if (o.t === 'lab') {
        var withPh = m.imgs[o.pid] && m.style.photos, cy = top + o.y + o.h / 2, tx;
        if (withPh) { drawAvatar(ctx, m, o.pid, SX + o.h / 2, cy, o.h / 2 - 3, 3); tx = SX + o.h + o.f * 0.3; }
        else { ctx.fillStyle = pc(o.pid); ctx.beginPath(); ctx.arc(SX + o.f * 0.28, cy, o.f * 0.28, 0, Math.PI * 2); ctx.fill(); tx = SX + o.f * 0.75; }
        var Lb = fitText(ctx, pn(o.pid), function (s) { return bf('600', s); }, o.f * 0.85, 14, o.w - (tx - SX) - o.f * 0.3, 1);
        ctx.font = bf('600', Lb.size); ctx.fillStyle = th.text; ctx.fillText(Lb.lines[0], tx, cy + Lb.size * 0.35);
        return;
      }
      var x0 = SX + o.x, y0 = top + o.y, col = pc(o.it.praticienne);
      ctx.save(); rrect(ctx, x0, y0, o.w, o.h, o.h * 0.3); ctx.fillStyle = th.card; ctx.fill();
      if (th.cardBorder) { ctx.strokeStyle = th.cardBorder; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x0, y0, o.band, o.h); ctx.restore();
      ctx.fillStyle = th.cardText; ctx.font = bf('600', o.f);
      ctx.fillText(hfr(o.it.debut), x0 + o.band + o.padx, y0 + o.h / 2 + o.f * 0.35);
    });
  }

  // Dessine toutes les pages ; renvoie [canvas]
  function renderStory(S) {
    var c = cfg() || {}, items = S.items.slice();
    var pids = []; items.forEach(function (it) { if (pids.indexOf(it.praticienne) < 0) pids.push(it.praticienne); });
    pids.sort(pratOrder);
    var layout = S.style.layout, ved = null;
    if (layout === 'vedette') {
      ved = pids.indexOf(S.style.vedette) >= 0 ? S.style.vedette : pids[0];
      items = items.filter(function (it) { return it.praticienne === ved; });
    }
    var m = {
      S: S, style: S.style, layout: layout, vedette: ved, pids: layout === 'vedette' ? [ved] : pids, imgs: S.imgs || {},
      F: fontBy(S.style.font), texts: S.textsEff, lien: S.mode === 'lien',
      salon: (c.salon && c.salon.nom) || 'Sorelle Bien-Être', adresse: (c.salon && c.salon.adresse) || ''
    };
    var th = effTheme(S);
    var meas = document.createElement('canvas').getContext('2d');
    var top = head(meas, m, th, false, 0, 1), bottom = foot(meas, m, th, false);
    var avail = Math.max(200, bottom - top);
    var pages = paginate(meas, m, items, avail);
    if (pages.length > 1) { top = head(meas, m, th, false, 0, pages.length); avail = Math.max(200, bottom - top); pages = paginate(meas, m, items, avail); }
    return pages.map(function (pg, pi) {
      var cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
      var ctx = cv.getContext('2d');
      drawBg(ctx, m, th);
      var t = head(ctx, m, th, true, pi, pages.length);
      // Peu de créneaux : on descend légèrement le bloc pour équilibrer la page
      var spare = (bottom - t) - pg.L.h;
      drawContent(ctx, m, th, pg, t + (spare > 0 ? Math.min(Math.round(spare / 3), 140) : 0));
      foot(ctx, m, th, true);
      cv.setAttribute('data-items', String(pg.items.length));
      return cv;
    });
  }

  /* --- Textes par défaut --- */
  function defTexts(S) {
    var src = S.src, per = curPer(src), t = G.today(), u = U();
    var titre = per.id === 'auj' ? 'Dernière minute' : per.id === 'semaine' ? 'Cette semaine' : per.id === 'prochaine' ? 'La semaine prochaine' : 'Nos créneaux libres';
    if (per.id === 'jour') titre = per.du === per.au ? (per.du <= u.addDays(t, 1) ? 'Dernière minute' : cap1(dayLong(per.du))) : 'Nos créneaux libres';
    var pids = []; S.items.forEach(function (it) { if (pids.indexOf(it.praticienne) < 0) pids.push(it.praticienne); });
    pids.sort(pratOrder);
    var who = S.style.layout === 'vedette' ? '' : pids.map(pn).join(' et ');
    var sous = S.style.layout === 'vedette' ? 'Ses prochaines places libres' : 'Il reste de la place avec ' + who;
    var cta = S.mode === 'lien' ? 'Réserve en 1 minute avec le lien' : 'Réponds à cette story pour réserver';
    return { titre: titre, sous: sous, cta: cta };
  }
  function computeTexts(S) {
    var d = defTexts(S), o = {};
    ['titre', 'sous', 'cta'].forEach(function (k) { var v = S.texts[k]; o[k] = v != null && String(v).trim() ? String(v).trim() : d[k]; });
    S.textsEff = o; S.textsDef = d;
  }

  /* --- Lien éclair --- */
  function offerUrl(token) { return new URL('../rdv/?offre=' + token, location.href).href; }
  function storedOffer() {
    var o = ls.get('offre', null);
    if (!o) { try { var v = localStorage.getItem('sorelle_ui_offreActive'); o = v ? JSON.parse(v) : null; } catch (e) { o = null; } } // ancien générateur
    return o && o.id && o.expire > Date.now() ? o : null;
  }
  function ensureOffer(S) {
    if (S.mode !== 'lien') return Promise.resolve(null);
    if (S.offre && !S.offreStale) return Promise.resolve(S.offre);
    if (S.offreP) return S.offreP;
    var c = cfg() || {}, items = S.items.slice(0, 40);
    if (!items.length) return Promise.resolve(null);
    computeTexts(S);
    var payload = {
      creneaux: items.map(function (x) { return { praticienne: x.praticienne, date: x.date, debut: x.debut, fin: x.fin }; }),
      heures: (c.story && +c.story.dureeLien) || 24, titre: String(S.textsEff ? S.textsEff.titre : 'Dernières places').slice(0, 60)
    };
    var prev = (S.offre && S.offre.id) ? S.offre : storedOffer();
    if (prev && prev.id) payload.id = prev.id;
    S.offreBusy = true; S.offreErr = null; updLink(S);
    S.offreP = G.API.admin('admin.creerOffre', payload).then(function (o) {
      S.offreP = null; S.offreBusy = false;
      if (S.closed) return o;
      S.offre = o; S.offreStale = false;
      ls.set('offre', { id: o.id, token: o.token, expire: o.expire });
      updLink(S);
      return o;
    }, function (e) {
      S.offreP = null; S.offreBusy = false; S.offreErr = (e && e.message) || 'Lien impossible à créer.'; updLink(S);
      return null;
    });
    return S.offreP;
  }

  /* --- Ouverture du studio --- */
  function openStudio(src) {
    var items = checkedItems(src);
    if (!items.length) { toast('Cochez au moins un créneau.', 'err'); return; }
    ensureCss();
    if (STU && !STU.closed) { try { STU.panel.close(); } catch (e) { /* ignore */ } }
    var c = cfg() || {}, so = c.story || {};
    var S = { src: src, items: items, style: normStyle(so.style), texts: {}, mode: so.mode === 'lien' ? 'lien' : 'message', page: 0, pages: [],
      imgs: {}, bgImg: null, offre: null, offreStale: true, changed: false, closed: false, dirtyStyle: false, adv: !G.isMobile() };
    if (S.style.fond === 'photo') S.style.fond = 'photo';
    STU = S;
    var root = document.createElement('div');
    root.className = 'mod-magie mg-studio';
    S.root = root;
    S.panel = G.panel({ title: 'Story Instagram', size: 'wide', content: root, onClose: function () { S.closed = true; if (S.dirtyStyle) saveStyle(S); } });
    if (S.panel && S.panel.el) { S.panel.el.style.padding = '0'; }
    computeTexts(S);
    renderStudio(S);
    bindStudio(S);
    draw(S);
    // Ressources : police, photos des praticiennes, fond photo mémorisé
    loadFont(S.style.font).then(function () { if (!S.closed) draw(S); });
    Promise.resolve().then(function () { return G.photos(); }).then(function (ph) {
      ph = ph || {};
      return Promise.all(activeIds().map(function (pid) {
        return loadImage(ph[pid] && /^data:image\//.test(ph[pid]) ? ph[pid] : null).then(function (im) { S.imgs[pid] = im; });
      }));
    }).catch(function () { /* sans photos */ }).then(function () { if (!S.closed) { draw(S); renderCtl(S); } });
    IDB.get('fond').then(function (d) {
      if (!d || S.closed) return;
      return loadImage(d).then(function (im) { if (im && !S.closed) { S.bgImg = im; S.bgData = d; draw(S); renderCtl(S); } });
    });
    if (S.mode === 'lien') ensureOffer(S);
  }

  function saveStyle(S) {
    var style = JSON.parse(JSON.stringify(S.style)), mode = S.mode;
    S.dirtyStyle = false;
    try {
      var p = G.saveConfig(function (c) { c.story = c.story && typeof c.story === 'object' ? c.story : {}; c.story.style = style; c.story.mode = mode; });
      if (p && p.then) p.then(null, function (e) { toast('Style non enregistré : ' + ((e && e.message) || 'erreur'), 'err'); });
    } catch (e) { /* ignore */ }
  }

  var drawT = null;
  function draw(S, delay) {
    if (S.closed) return;
    clearTimeout(drawT);
    var run = function () {
      if (S.closed) return;
      computeTexts(S);
      try { S.pages = renderStory(S); } catch (e) { if (window.console) console.error(e); S.pages = []; }
      if (S.page >= S.pages.length) S.page = 0;
      showPreview(S);
    };
    if (delay) drawT = setTimeout(run, delay); else run();
  }
  function showPreview(S) {
    var box = S.root.querySelector('.mg-cv'); if (!box) return;
    box.innerHTML = '';
    var cv = S.pages[S.page];
    if (cv) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Aperçu de la story' + (S.pages.length > 1 ? ' ' + (S.page + 1) + ' sur ' + S.pages.length : '')); box.appendChild(cv); }
    var pg = S.root.querySelector('.mg-pager');
    if (pg) pg.innerHTML = S.pages.length > 1 ? S.pages.map(function (p, i) { return '<button type="button" data-s="page" data-v="' + i + '" class="' + (i === S.page ? 'on' : '') + '" aria-label="Story ' + (i + 1) + '" aria-pressed="' + (i === S.page) + '">' + (i + 1) + '</button>'; }).join('') : '';
    var nt = S.root.querySelector('.mg-note');
    if (nt) {
      var n = S.style.layout === 'vedette' ? S.pages.reduce(function (a, p) { return a + (+p.getAttribute('data-items') || 0); }, 0) : S.items.length;
      nt.textContent = plural(n, 'créneau', 'créneaux') + ' · ' + (S.pages.length > 1 ? S.pages.length + ' stories (texte jamais coupé)' : '1 story');
    }
    setFoot(S);
  }
  // Ne remplace le pied que s'il change (un remplacement pendant un tap annulerait le clic)
  function setFoot(S) { var f = S.root && S.root.querySelector('.mg-foot'); if (!f) return; var h = footStudio(S); if (f.getAttribute('data-h') !== h) { f.innerHTML = h; f.setAttribute('data-h', h); } }

  function footStudio(S) {
    var share = canShare(), n = S.pages.length, h = '';
    var tooMany = S.mode === 'lien' && S.items.length > 40;
    var dis = (!n || tooMany || (S.mode === 'lien' && !S.offre)) ? ' disabled' : '';
    if (n > 1) {
      h += S.pages.map(function (p, i) { return '<button type="button" class="mg-btn pri" data-s="share" data-v="' + i + '"' + dis + '>' + ic(share ? 'share' : 'image') + (share ? 'Partager ' : 'Télécharger ') + 'la story ' + (i + 1) + '</button>'; }).join('');
    } else h += '<button type="button" class="mg-btn pri" data-s="share" data-v="0"' + dis + '>' + ic(share ? 'share' : 'image') + (share ? 'Partager sur Instagram' : 'Télécharger l\'image') + '</button>';
    h += '<div class="mg-fi" style="flex-basis:100%">' + (share ? 'Partager → Instagram → Story.' : 'Envoyez l\'image sur votre téléphone, puis Instagram → Story.') +
      (S.mode === 'lien' ? ' Le lien est copié en même temps : Sticker → Lien → Coller.' : '') + '</div>';
    return h;
  }
  function canShare() {
    try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; }
  }

  function linkHTML(S) {
    if (S.mode !== 'lien') return '';
    if (S.items.length > 40) return '<div class="mg-warn" role="alert">Le lien éclair accepte 40 créneaux au maximum : décochez-en ' + (S.items.length - 40) + ' dans la liste.</div>';
    if (S.offreErr) return '<div class="mg-warn" role="alert">' + esc(S.offreErr) + ' <button type="button" class="mg-link" data-s="offre-retry">Réessayer</button></div>';
    if (!S.offre || S.offreBusy) return '<p class="mg-help"><span class="mg-busy"><span class="mg-spin"></span>Préparation du lien…</span></p>';
    var c = cfg() || {}, h = (c.story && +c.story.dureeLien) || 24;
    return '<div class="mg-linkbox"><input class="mg-inp" readonly data-s="url" aria-label="Lien de réservation" value="' + esc(offerUrl(S.offre.token)) + '"><button type="button" class="mg-btn" data-s="copy">' + ic('copy') + 'Copier</button></div>' +
      '<div class="mg-steps" aria-label="Dans Instagram"><span>Dans Instagram :</span><b>Sticker</b><span>→</span><b>Lien</b><span>→</span><b>Coller</b></div>' +
      '<p class="mg-help">Valable ' + h + ' h. Le lien reste le même quand vous mettez la story à jour ; un créneau réservé s\'affiche « Réservé ».</p>';
  }
  function updLink(S) { var b = S.root && S.root.querySelector('[data-box="link"]'); if (b) { var h = linkHTML(S); if (b.getAttribute('data-h') !== h) { b.innerHTML = h; b.setAttribute('data-h', h); } } setFoot(S); }

  function renderStudio(S) {
    S.root.innerHTML = '<div class="mg-pad"><div data-box="banner"></div><div class="mg-st"><div class="mg-prev"><div class="mg-cv"></div><div class="mg-pager"></div><p class="mg-note"></p></div>' +
      '<div class="mg-ctl"></div></div></div><div class="mg-foot"></div>' +
      '<input type="file" accept="image/*" class="mg-file" data-s="file" tabindex="-1" aria-hidden="true">';
    renderCtl(S);
  }
  function swRow(S, k, label) {
    var th = themeBy(S.style.theme), cur = S.style[k] || (k === 'bg' ? th.bg : k === 'text' ? th.text : th.accent);
    return '<div class="mg-colrow" role="group" aria-label="Couleur ' + label + '"><b>' + label + '</b>' + SWATCHES.map(function (c) {
      var on = c.toLowerCase() === cur.toLowerCase();
      return '<button type="button" class="mg-sw' + (on ? ' on' : '') + '" data-s="sw" data-k="' + k + '" data-v="' + c + '" style="--c:' + c + '" aria-label="' + c + '" aria-pressed="' + on + '"><i></i></button>';
    }).join('') + '<input type="color" class="mg-pick" data-s="pick" data-k="' + k + '" value="' + esc(cur) + '" aria-label="Autre couleur ' + label + '"></div>';
  }
  function renderCtl(S) {
    var box = S.root.querySelector('.mg-ctl'); if (!box) return;
    var s = S.style, pids = []; S.items.forEach(function (it) { if (pids.indexOf(it.praticienne) < 0) pids.push(it.praticienne); }); pids.sort(pratOrder);
    var h = '';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-th">Thème</span><div class="mg-themes" role="group" aria-labelledby="mg-l-th">' + THEMES.map(function (t) {
      var on = s.theme === t.id, bg = t.fond === 'photo' ? (S.bgData ? 'url(' + S.bgData + ') center/cover' : 'linear-gradient(160deg,#5A6B4D,#1E2218)') : t.fond === 'degrade' ? 'linear-gradient(160deg,' + t.bg + ',' + t.bg2 + ')' : t.bg;
      var F = fontBy(t.font);
      return '<button type="button" class="mg-th' + (on ? ' on' : '') + '" data-s="theme" data-v="' + t.id + '" aria-pressed="' + on + '" style="--tb:' + bg + ';--tt:' + t.text + ';--ta:' + t.accent + '"><i style="font-family:\'' + F.n + '\',' + esc(F.fb) + '">Aa<b></b></i><span>' + esc(t.nom) + '</span></button>';
    }).join('') + '</div></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-lay">Mise en page</span><div class="mg-seg" role="group" aria-labelledby="mg-l-lay">' + LAYOUTS.map(function (l) {
      return '<button type="button" data-s="layout" data-v="' + l[0] + '" class="' + (s.layout === l[0] ? 'on' : '') + '" aria-pressed="' + (s.layout === l[0]) + '">' + l[1] + '</button>';
    }).join('') + '</div>';
    if (s.layout === 'vedette' && pids.length > 1) {
      var ved = pids.indexOf(s.vedette) >= 0 ? s.vedette : pids[0];
      h += '<div class="mg-seg" role="group" aria-label="Praticienne en avant" style="margin-top:8px">' + pids.map(function (pid) {
        return '<button type="button" data-s="vedette" data-v="' + esc(pid) + '" class="pr' + (ved === pid ? ' on' : '') + '" style="' + pStyle(pid) + '" aria-pressed="' + (ved === pid) + '"><span class="mg-dot"></span>' + esc(pn(pid)) + '</button>';
      }).join('') + '</div><p class="mg-help">Seuls les créneaux de ' + esc(pn(ved)) + ' apparaissent.</p>';
    }
    if (s.layout === 'vedette' && !S.imgs[s.vedette && pids.indexOf(s.vedette) >= 0 ? s.vedette : pids[0]]) h += '<p class="mg-help">Pas encore de photo : ajoutez-la dans Réglages, Praticiennes. Un monogramme s\'affiche en attendant.</p>';
    h += '</div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-res">Réservation</span><div class="mg-seg" role="group" aria-labelledby="mg-l-res">' +
      '<button type="button" data-s="mode" data-v="message" class="' + (S.mode === 'message' ? 'on' : '') + '" aria-pressed="' + (S.mode === 'message') + '">Réponse en message</button>' +
      '<button type="button" data-s="mode" data-v="lien" class="' + (S.mode === 'lien' ? 'on' : '') + '" aria-pressed="' + (S.mode === 'lien') + '">Lien éclair</button></div>' +
      '<p class="mg-help">' + (S.mode === 'lien' ? 'Les clientes réservent seules avec le lien, même le jour même.' : 'Les clientes répondent à la story ; vous placez le rendez-vous ici.') + '</p><div data-box="link">' + linkHTML(S) + '</div></div>';
    var d = S.textsDef || defTexts(S);
    h += '<div class="mg-f"><span class="mg-lab">Textes</span><div class="mg-txt">' +
      '<label>Titre<input class="mg-inp" data-s="txt" data-k="titre" maxlength="60" value="' + esc(S.texts.titre || '') + '" placeholder="' + esc(d.titre) + '"></label>' +
      '<label>Sous-titre<input class="mg-inp" data-s="txt" data-k="sous" maxlength="90" value="' + esc(S.texts.sous || '') + '" placeholder="' + esc(d.sous) + '"></label>' +
      '<label>Appel à l\'action<input class="mg-inp" data-s="txt" data-k="cta" maxlength="70" value="' + esc(S.texts.cta || '') + '" placeholder="' + esc(d.cta) + '"></label></div>' +
      '<p class="mg-help">Laissez vide pour le texte proposé.</p></div>';
    h += '<details class="mg-adv"' + (S.adv ? ' open' : '') + ' data-s="adv"><summary>Personnaliser : police, couleurs, fond' + ic('chevronD') + '</summary><div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-f">Police des titres</span><div class="mg-chips mg-fonts" role="group" aria-labelledby="mg-l-f">' + FONTS.map(function (F) {
      var on = s.font === F.n;
      return '<button type="button" class="mg-chip' + (on ? ' on' : '') + '" data-s="font" data-v="' + esc(F.n) + '" aria-pressed="' + on + '" style="font-family:\'' + F.n + '\',' + esc(F.fb) + '">' + esc(F.n) + '</button>';
    }).join('') + '</div></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-bg">Fond</span><div class="mg-seg" role="group" aria-labelledby="mg-l-bg">' +
      [['uni', 'Uni'], ['degrade', 'Dégradé'], ['photo', 'Photo']].map(function (x) { return '<button type="button" data-s="fond" data-v="' + x[0] + '" class="' + (s.fond === x[0] ? 'on' : '') + '" aria-pressed="' + (s.fond === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (s.fond === 'photo') {
      h += '<div class="mg-photo"><button type="button" class="mg-btn" data-s="pickfile">' + ic('image') + (S.bgImg ? 'Changer de photo' : 'Choisir une photo') + '</button>' +
        (S.bgImg ? '<button type="button" class="mg-btn" data-s="rmfile">' + ic('trash') + 'Retirer</button>' : '') + '</div>' +
        (S.bgImg ? '' : '<p class="mg-help">En attendant la photo, un dégradé est utilisé.</p>') +
        '<p class="mg-help">La photo reste sur cet appareil.</p>' +
        '<div style="margin-top:10px">' + swRow(S, 'voile', 'Voile') + '</div>' +
        '<label class="mg-slider">Voile<input type="range" min="0" max="85" step="5" data-s="voileOp" value="' + Math.round(s.voileOp * 100) + '" aria-label="Opacité du voile"><span data-o="voileOp">' + Math.round(s.voileOp * 100) + ' %</span></label>' +
        '<label class="mg-slider">Flou<input type="range" min="0" max="3" step="1" data-s="flou" value="' + s.flou + '" aria-label="Flou de la photo"><span data-o="flou">' + ['Aucun', 'Léger', 'Moyen', 'Fort'][s.flou] + '</span></label>';
    }
    h += '</div>';
    h += '<div class="mg-f"><span class="mg-lab">Couleurs</span>' + (s.fond !== 'photo' ? swRow(S, 'bg', 'Fond') : '') + swRow(S, 'text', 'Texte') + swRow(S, 'accent', 'Accent') +
      '<button type="button" class="mg-link" data-s="resetcol">Couleurs du thème</button></div>';
    h += '<div class="mg-f"><label class="mg-tog"><input type="checkbox" data-s="photos"' + (s.photos ? ' checked' : '') + '>Afficher les photos des praticiennes</label>' +
      '<label class="mg-tog"><input type="checkbox" data-s="adresse"' + (s.adresse ? ' checked' : '') + '>Afficher l\'adresse</label></div>';
    h += '</div></details>';
    box.innerHTML = h;
    setFoot(S);
  }
  function setBanner(S) {
    var b = S.root && S.root.querySelector('[data-box="banner"]'); if (!b) return;
    b.innerHTML = S.changed ? '<div class="mg-banner" role="status"><span>Le planning a changé : un créneau proposé n\'est peut-être plus libre.</span><button type="button" class="mg-btn pri" data-s="refresh">Mettre la story à jour</button></div>' : '';
  }

  function styleChanged(S, redrawCtl) {
    S.dirtyStyle = true;
    if (redrawCtl) renderCtl(S);
    draw(S);
  }

  function shareOrDownload(S, i) {
    var cv = S.pages[i]; if (!cv) return;
    if (S.mode === 'lien') {
      if (!S.offre) { toast('Lien en préparation, réessayez dans un instant.', 'info'); ensureOffer(S); return; }
      copyText(offerUrl(S.offre.token), 'Lien copié : Sticker → Lien → Coller');
    }
    var name = 'sorelle-story' + (S.pages.length > 1 ? '-' + (i + 1) : '') + '.png';
    var blob = canvasBlobSync(cv), file = null;
    try { file = new File([blob], name, { type: 'image/png' }); } catch (e) { file = null; }
    var done = false;
    try {
      if (file && navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
        done = true;
        navigator.share({ files: [file] }).catch(function (e) { if (e && e.name !== 'AbortError') download(blob, name); });
      }
    } catch (e) { done = false; }
    if (!done) download(blob, name);
    if (S.dirtyStyle || !(cfg() && cfg().story && cfg().story.style)) saveStyle(S);
  }
  // Conversion synchrone (garde le « geste utilisateur » exigé par Safari pour navigator.share)
  function canvasBlobSync(cv) {
    var d = cv.toDataURL('image/png'), b = atob(d.split(',')[1]), n = b.length, a = new Uint8Array(n);
    for (var i = 0; i < n; i++) a[i] = b.charCodeAt(i);
    return new Blob([a], { type: 'image/png' });
  }
  function download(blob, name) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast('Image enregistrée');
  }

  function bindStudio(S) {
    var root = S.root;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]'); if (!b || !root.contains(b)) return;
      var a = b.getAttribute('data-s'), v = b.getAttribute('data-v');
      if (a === 'theme') {
        var th = themeBy(v), s = S.style;
        s.theme = th.id; s.bg = s.text = s.accent = null; s.font = th.font; s.fond = th.fond;
        if (th.voile) { s.voile = th.voile; s.voileOp = th.voileOp; }
        loadFont(s.font).then(function () { if (!S.closed) draw(S); });
        if (th.fond === 'photo' && !S.bgImg) pickFile(S);
        styleChanged(S, true); return;
      }
      if (a === 'layout') { S.style.layout = v; styleChanged(S, true); return; }
      if (a === 'vedette') { S.style.vedette = v; styleChanged(S, true); return; }
      if (a === 'font') { S.style.font = v; loadFont(v).then(function () { if (!S.closed) draw(S); }); styleChanged(S, true); return; }
      if (a === 'fond') { S.style.fond = v; if (v === 'photo' && !S.bgImg) pickFile(S); styleChanged(S, true); return; }
      if (a === 'pickfile') { pickFile(S); return; }
      if (a === 'rmfile') { S.bgImg = null; S.bgData = null; S.bgBlur = null; IDB.set('fond', null); styleChanged(S, true); return; }
      if (a === 'sw') { S.style[b.getAttribute('data-k')] = v; styleChanged(S, true); return; }
      if (a === 'resetcol') { S.style.bg = S.style.text = S.style.accent = null; styleChanged(S, true); return; }
      if (a === 'page') { S.page = +v || 0; showPreview(S); return; }
      if (a === 'mode') {
        if (v === S.mode) return;
        S.mode = v; S.dirtyStyle = true; computeTexts(S); renderCtl(S); draw(S);
        if (v === 'lien') ensureOffer(S);
        saveStyle(S); return;
      }
      if (a === 'copy') { if (S.offre) copyText(offerUrl(S.offre.token), 'Lien copié'); return; }
      if (a === 'offre-retry') { S.offreErr = null; ensureOffer(S); return; }
      if (a === 'share') { shareOrDownload(S, +v || 0); return; }
      if (a === 'refresh') {
        S.src.loadP.then(function () {
          if (S.closed) return;
          S.items = checkedItems(S.src); S.changed = false; S.offreStale = true; setBanner(S);
          if (!S.items.length) { toast('Plus aucun créneau coché.', 'info'); }
          renderCtl(S); draw(S);
          if (S.mode === 'lien' && S.items.length) ensureOffer(S).then(function (o) { if (o) toast('Story et lien mis à jour'); });
          else toast('Story mise à jour');
        });
      }
    });
    root.addEventListener('input', function (e) {
      var t = e.target, a = t.getAttribute('data-s'); if (!a) return;
      if (a === 'txt') { S.texts[t.getAttribute('data-k')] = t.value; draw(S, 120); return; }
      if (a === 'pick') { S.style[t.getAttribute('data-k')] = t.value; S.dirtyStyle = true; draw(S, 40); return; }
      if (a === 'voileOp') { S.style.voileOp = (+t.value || 0) / 100; S.dirtyStyle = true; var o = root.querySelector('[data-o="voileOp"]'); if (o) o.textContent = t.value + ' %'; draw(S, 30); return; }
      if (a === 'flou') { S.style.flou = +t.value || 0; S.dirtyStyle = true; var o2 = root.querySelector('[data-o="flou"]'); if (o2) o2.textContent = ['Aucun', 'Léger', 'Moyen', 'Fort'][S.style.flou]; draw(S, 30); return; }
    });
    root.addEventListener('change', function (e) {
      var t = e.target, a = t.getAttribute('data-s'); if (!a) return;
      if (a === 'pick') { renderCtl(S); return; }
      if (a === 'photos' || a === 'adresse') { S.style[a] = t.checked; styleChanged(S, false); return; }
      if (a === 'txt' && S.mode === 'lien' && t.getAttribute('data-k') === 'titre') { S.offreStale = true; ensureOffer(S); return; }
      if (a === 'file') {
        var f = t.files && t.files[0]; t.value = '';
        if (!f) return;
        fileToBg(f).then(function (d) {
          return loadImage(d).then(function (im) {
            if (!im || S.closed) return;
            S.bgImg = im; S.bgData = d; S.bgBlur = null; S.style.fond = 'photo';
            IDB.set('fond', d);
            styleChanged(S, true);
          });
        }, function (err) { toast((err && err.message) || 'Photo illisible', 'err'); });
      }
    });
    root.addEventListener('toggle', function (e) { if (e.target && e.target.getAttribute && e.target.getAttribute('data-s') === 'adv') S.adv = e.target.open; }, true);
    root.addEventListener('focusin', function (e) { if (e.target && e.target.getAttribute('data-s') === 'url') { try { e.target.select(); } catch (x) { /* ignore */ } } });
  }
  function pickFile(S) { var i = S.root.querySelector('[data-s="file"]'); if (i) i.click(); }

  /* =====================================================================
   * Événements du shell
   * =================================================================== */
  if (typeof G.on === 'function') {
    G.on('change', function () {
      if (M && !M.closed) { M.changed = true; load(M); }
      if (STU && !STU.closed) { STU.changed = true; setBanner(STU); }
    });
    G.on('theme', function () { if (M && !M.closed) renderMain(M); if (STU && !STU.closed) renderCtl(STU); });
    G.on('config', function () {
      if (STU && !STU.closed && STU.mode === 'lien' && STU.offre) updLink(STU);
    });
  }

  G.register('magie', {
    open: open,
    // Exposés pour les tests et l'intégration (non requis par le contrat)
    _render: function (S) { return renderStory(S); },
    _state: function () { return { panel: M, studio: STU }; }
  });
})();

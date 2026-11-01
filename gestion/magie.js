/**
 * gestion/magie.js : module MAGIE
 *   « Remplir l'agenda » : jours (aujourd'hui, demain, semaine prochaine ou choisis un par un dans un calendrier),
 *   alertes, toutes les heures de début valides à proposer, clientes à relancer (option)
 *   + studio de story Instagram aux couleurs Sorelle (canvas 1080×1920, thèmes de la marque, liste ou
 *     grille horaire, fond photo avec voile, mode message ou lien éclair, partage ou téléchargement).
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
    '.mod-magie .mg-pad{padding:16px 20px 0}',
    '@media (max-width:699px){.mod-magie .mg-pad{padding:12px 16px 0}}',
    '.mod-magie .mg-f{margin-bottom:16px}',
    '.mod-magie .mg-f:last-child{margin-bottom:0}',
    '.mod-magie .mg-lab{display:block;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-sub);margin:0 0 8px}',
    '.mod-magie .mg-ctrl{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:16px}',
    '@media (max-width:699px){.mod-magie .mg-ctrl{padding:14px 12px}}',
    '.mod-magie .mg-seg{display:flex;gap:4px;padding:4px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius);width:100%}',
    '.mod-magie .mg-seg button{flex:1 1 0;min-width:0;min-height:44px;border:0;background:transparent;border-radius:calc(var(--radius) - 4px);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 8px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-magie .mg-seg button.on{background:var(--surface);color:var(--text);font-weight:600;box-shadow:0 1px 2px var(--line),0 0 0 1px var(--line)}',
    '.mod-magie .mg-seg button:disabled{opacity:.5;cursor:default}',
    '.mod-magie .mg-dot{width:9px;height:9px;border-radius:50%;background:var(--pc);flex:none;display:inline-block}',
    '.mod-magie .mg-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.mod-magie .mg-chip{min-height:44px;padding:0 15px;border-radius:999px;border:1px solid var(--line);background:var(--surface);display:inline-flex;align-items:center;gap:8px;font-weight:500;color:var(--text)}',
    '.mod-magie .mg-chip svg{width:16px;height:16px;flex:none}',
    '.mod-magie .mg-chip.on{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}',
    '.mod-magie .mg-chip i{width:9px;height:9px;border-radius:50%;background:var(--sc);flex:none}',
    '.mod-magie .mg-chip small{font-size:12px;opacity:.8;font-weight:400}',
    '.mod-magie .mg-pers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}',
    '.mod-magie .mg-pers .mg-chip{justify-content:center;padding:0 8px;border-radius:var(--radius);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '@media (max-width:520px){.mod-magie .mg-pers{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.mod-magie .mg-range{margin-top:10px;font-size:13.5px;color:var(--text-sub)}',
    '.mod-magie .mg-range b{color:var(--text);font-weight:600}',
    '.mod-magie .mg-range.bad{color:var(--danger);font-weight:500}',
    '.mod-magie .mg-sep{display:inline-block;width:1px;height:28px;background:var(--line);align-self:center;margin:0 2px}',
    /* Calendrier de sélection des jours */
    '.mod-magie .mg-cal{margin-top:12px;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--bg);padding:8px 10px 10px;max-width:460px}',
    '.mod-magie .mg-calh{display:flex;align-items:center;gap:4px;margin-bottom:2px}',
    '.mod-magie .mg-calh b{flex:1;text-align:center;font-family:var(--serif);font-size:21px;font-weight:600;letter-spacing:.01em}',
    '.mod-magie .mg-calh button{width:44px;height:44px;border:0;background:transparent;border-radius:50%;display:grid;place-items:center;color:var(--text)}',
    '.mod-magie .mg-calh button svg{width:20px;height:20px}',
    '.mod-magie .mg-calh button:disabled{opacity:.25;cursor:default}',
    '.mod-magie .mg-calg{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}',
    '.mod-magie .mg-calw{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);text-align:center;padding:4px 0 6px}',
    '.mod-magie .mg-cd{position:relative;min-height:50px;min-width:0;border:0;border-radius:10px;background:transparent;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-variant-numeric:tabular-nums;padding:0;color:var(--text)}',
    '.mod-magie .mg-cd .n{font-size:16px;font-weight:500;line-height:1}',
    '.mod-magie .mg-cd .f{width:56%;max-width:30px;height:3px;border-radius:2px;background:var(--line);overflow:hidden;display:block}',
    '.mod-magie .mg-cd .f i{display:block;height:100%;background:var(--sage);border-radius:2px}',
    '.mod-magie .mg-cd .f.full i{background:var(--clay)}',
    '.mod-magie .mg-cd .f.na{background:transparent;border-top:1px dashed var(--muted);height:0}',
    '.mod-magie .mg-cd:not(:disabled):hover{background:var(--surface-2)}',
    '.mod-magie .mg-cd.today .n{font-weight:700}',
    '.mod-magie .mg-cd.today::after{content:"";position:absolute;top:5px;left:50%;margin-left:-2px;width:4px;height:4px;border-radius:50%;background:var(--clay)}',
    '.mod-magie .mg-cd.on,.mod-magie .mg-cd.on:hover{background:var(--accent);color:var(--accent-text)}',
    '.mod-magie .mg-cd.on .f{background:rgba(255,255,255,.28)}',
    '.mod-magie .mg-cd.on .f i{background:currentColor}',
    '.mod-magie .mg-cd.pl{box-shadow:inset 0 0 0 2px var(--accent)}',
    '.mod-magie .mg-cd:disabled{cursor:default;color:var(--muted)}',
    '.mod-magie .mg-cd:disabled .n{opacity:.55;font-weight:400}',
    '.mod-magie .mg-cd.closed .n{text-decoration:line-through;text-decoration-color:var(--line-3,var(--line))}',
    '.mod-magie .mg-cd:focus-visible{outline:3px solid var(--focus);outline-offset:1px}',
    '.mod-magie .mg-calf{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid var(--line);font-size:12.5px;color:var(--text-sub)}',
    '.mod-magie .mg-calf .sp{flex:1}',
    '.mod-magie .mg-calf .lg{display:inline-flex;align-items:center;gap:6px}',
    '.mod-magie .mg-calf .lg i{display:inline-block;width:18px;height:3px;border-radius:2px;background:var(--sage)}',
    '.mod-magie .mg-calf .lg i.full{background:var(--clay)}',
    '.mod-magie .mg-calf .mg-link{min-height:40px;font-size:13.5px}',
    '.mod-magie .mg-tgl{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-size:13px;font-weight:500;color:var(--text)}',
    '.mod-magie .mg-tgl.on{background:var(--accent);border-color:var(--accent);color:var(--accent-text)}',
    '.mod-magie .mg-tgl svg{width:15px;height:15px}',
    '.mod-magie .mg-sec{margin-top:28px}',
    '.mod-magie .mg-sec>h3{font-family:var(--serif);font-size:23px;font-weight:600;letter-spacing:.005em;margin:0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;line-height:1.15}',
    '.mod-magie .mg-sec>h3 .mg-sp{flex:1}',
    '.mod-magie .mg-sec>h3 .mg-n{font-family:var(--sans,inherit);font-size:13px;font-weight:500;color:var(--text-sub);letter-spacing:0}',
    '.mod-magie .mg-aide{font-size:13.5px;color:var(--text-sub);margin:4px 0 10px}',
    '.mod-magie .mg-link{border:0;background:transparent;color:var(--accent);font-weight:600;min-height:44px;padding:0 6px;font-size:14px}',
    '.mod-magie .mg-more{display:block;margin-top:4px}',
    '.mod-magie .mg-empty{padding:14px 16px;border-radius:var(--radius);background:var(--surface-2);color:var(--text-sub);font-size:14px}',
    /* Résumé */
    '.mod-magie .mg-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-top:18px}',
    '.mod-magie .mg-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:14px 16px}',
    '.mod-magie .mg-card-h{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px}',
    '.mod-magie .mg-big{display:flex;align-items:baseline;gap:8px;margin-top:4px}',
    '.mod-magie .mg-big b{font-family:var(--serif);font-size:38px;font-weight:600;line-height:1.05}',
    '.mod-magie .mg-big span{font-size:14px;color:var(--text-sub)}',
    '.mod-magie .mg-gauge{height:4px;border-radius:99px;background:var(--surface-2);margin-top:10px;overflow:hidden}',
    '.mod-magie .mg-gauge i{display:block;height:100%;background:var(--pc);border-radius:99px}',
    '.mod-magie .mg-card p{margin:6px 0 0;font-size:12.5px;color:var(--text-sub)}',
    /* Cartes compactes (priorités, relances) */
    '.mod-magie .mg-list{display:flex;flex-direction:column;gap:8px}',
    '.mod-magie .mg-it{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:10px 12px 12px;min-width:0}',
    '.mod-magie .mg-ih{display:flex;align-items:center;gap:8px;min-width:0;min-height:30px}',
    '.mod-magie .mg-ih>b{font-weight:600;white-space:nowrap}',
    '.mod-magie .mg-ih .mg-sp{flex:1}',
    '.mod-magie .mg-ih .mg-link{min-height:36px;font-size:14px;white-space:nowrap}',
    '.mod-magie .mg-who{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--text-sub);white-space:nowrap}',
    '.mod-magie .mg-is{font-size:14px;color:var(--text-sub);margin:2px 0 0}',
    '.mod-magie .mg-is.crit{color:var(--text);font-weight:500}',
    '.mod-magie .mg-is b{color:var(--text);font-weight:600}',
    '.mod-magie .mg-late{display:inline-block;font-size:12px;font-weight:500;color:var(--danger);border:1px solid var(--danger);border-radius:999px;padding:0 7px;margin-left:4px;white-space:nowrap;line-height:18px}',
    '.mod-magie .mg-name{border:0;background:transparent;padding:0;font-weight:600;font-size:15px;color:var(--text);text-align:left;min-height:30px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}',
    '.mod-magie .mg-hrs{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}',
    '.mod-magie .mg-h{min-height:44px;min-width:64px;padding:0 14px;border-radius:10px;border:1px solid var(--pc);background:var(--pbg);font-weight:600;font-size:15px;color:var(--text);white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.mod-magie .mg-acts{display:flex;gap:8px;margin-top:8px;max-width:460px}',
    '.mod-magie .mg-acts .mg-btn{flex:1 1 0;min-width:0}',
    '.mod-magie .mg-btn{min-height:44px;padding:0 16px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);font-weight:500;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;color:var(--text)}',
    '.mod-magie .mg-btn svg{width:18px;height:18px;flex:none}',
    '.mod-magie .mg-btn.pri{background:var(--accent);border-color:var(--accent);color:var(--accent-text);font-weight:600}',
    '.mod-magie .mg-btn.pri svg{opacity:.9}',
    '.mod-magie .mg-btn.blk{width:100%}',
    '.mod-magie .mg-btn:disabled{opacity:.5;cursor:default}',
    '.mod-magie .mg-btn:focus-visible,.mod-magie .mg-chip:focus-visible,.mod-magie .mg-seg button:focus-visible,.mod-magie .mg-h:focus-visible,.mod-magie .mg-t:focus-visible,.mod-magie .mg-link:focus-visible,.mod-magie .mg-name:focus-visible,.mod-magie .mg-tgl:focus-visible{outline:3px solid var(--focus);outline-offset:2px}',
    /* Créneaux à proposer : jour > praticienne > heures */
    '.mod-magie .mg-tools{display:flex;gap:6px;margin:4px 0 0;flex-wrap:wrap;align-items:center}',
    '.mod-magie .mg-tools .mg-sp{flex:1}',
    '.mod-magie .mg-legend{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--text-sub)}',
    '.mod-magie .mg-legend i{width:6px;height:6px;border-radius:50%;background:var(--clay);display:inline-block}',
    '.mod-magie .mg-day{margin-top:20px}',
    '.mod-magie .mg-day>h4{font-family:var(--serif);font-size:20px;font-weight:600;margin:0 0 8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;line-height:1.2}',
    '.mod-magie .mg-day>h4 small{font-family:var(--sans,inherit);font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--clay)}',
    '.mod-magie .mg-day.full>h4{margin:0;font-size:17px;font-weight:500;color:var(--text-sub)}',
    '.mod-magie .mg-pblk{border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);padding:10px 12px 12px}',
    '.mod-magie .mg-pblk+.mg-pblk,.mod-magie .mg-pblk+.mg-pgrey,.mod-magie .mg-pgrey+.mg-pblk,.mod-magie .mg-alt+.mg-pblk,.mod-magie .mg-pblk+.mg-alt{margin-top:8px}',
    '.mod-magie .mg-ph{display:flex;align-items:center;gap:8px;font-weight:600;font-size:14.5px;min-height:32px}',
    '.mod-magie .mg-ph small{font-weight:400;color:var(--text-sub);font-size:13px}',
    '.mod-magie .mg-ph .mg-sp{flex:1}',
    '.mod-magie .mg-ph .mg-link{min-height:36px;font-size:13.5px;display:inline-flex;align-items:center;gap:4px}',
    '.mod-magie .mg-ph .mg-link svg{width:16px;height:16px}',
    '.mod-magie .mg-pgrey{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted);padding:2px 2px 2px 4px}',
    '.mod-magie .mg-pgrey .mg-dot{opacity:.6}',
    '.mod-magie .mg-tg{display:grid;grid-template-columns:repeat(auto-fill,minmax(66px,1fr));gap:6px;margin-top:8px}',
    '.mod-magie .mg-t{position:relative;min-height:44px;min-width:0;padding:0 4px;border-radius:10px;border:1px dashed var(--line-3,var(--line));background:transparent;color:var(--muted);font-weight:500;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap}',
    '.mod-magie .mg-t.on{border-style:solid;border-color:var(--pc);background:var(--pbg);color:var(--text);font-weight:600}',
    '.mod-magie .mg-t.id::after{content:"";position:absolute;top:6px;right:6px;width:5px;height:5px;border-radius:50%;background:var(--clay)}',
    '.mod-magie .mg-alt{font-size:13px;color:var(--text-sub);padding:0 2px 0 4px;margin-top:6px;line-height:20px;min-height:40px;display:flex;align-items:center;flex-wrap:wrap;column-gap:4px}',
    '.mod-magie .mg-alt .mg-dot{margin-right:6px;vertical-align:-1px}',
    '.mod-magie .mg-alt button{display:inline-block;border:0;background:transparent;color:var(--accent);font-weight:600;font-size:14px;min-height:40px;line-height:20px;padding:0;white-space:nowrap}',
    '.mod-magie .mg-foot{position:sticky;bottom:0;z-index:3;margin-top:24px;background:var(--surface);border-top:1px solid var(--line);box-shadow:0 -6px 18px var(--shadow);padding:12px 20px calc(12px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
    '@media (max-width:699px){.mod-magie .mg-foot{padding-left:16px;padding-right:16px}}',
    '.mod-magie .mg-foot .mg-fi{flex:1 1 160px;font-size:13px;color:var(--text-sub);min-width:0}',
    '.mod-magie .mg-foot .mg-fi b{color:var(--text);font-size:15px}',
    '.mod-magie .mg-foot .mg-btn{flex:1 1 200px}',
    '.mod-magie .mg-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line);border-left:4px solid var(--accent);margin-bottom:12px}',
    '.mod-magie .mg-banner span{flex:1 1 200px;font-weight:500}',
    '.mod-magie .mg-err{padding:14px;border-radius:var(--radius);border:1px solid var(--danger);color:var(--text);background:var(--surface)}',
    '.mod-magie .mg-load{display:flex;align-items:center;gap:10px;color:var(--text-sub);padding:22px 4px}',
    '.mod-magie .mg-spin{width:18px;height:18px;border-radius:50%;border:2px solid var(--line);border-top-color:var(--accent);animation:mgspin .8s linear infinite;flex:none}',
    '@keyframes mgspin{to{transform:rotate(360deg)}}',
    '.mod-magie .mg-busy{font-size:12px;color:var(--text-sub);display:inline-flex;align-items:center;gap:6px;font-weight:400}',
    '.mod-magie .mg-busy .mg-spin{width:12px;height:12px}',
    '@media (max-width:699px){.mod-magie .mg-sum{grid-template-columns:1fr 1fr;gap:8px}.mod-magie .mg-card{padding:12px}.mod-magie .mg-big b{font-size:32px}.mod-magie .mg-big{flex-wrap:wrap;gap:0 6px}.mod-magie .mg-big span{font-size:13px}}',
    '@media (max-width:370px){.mod-magie .mg-sum{grid-template-columns:1fr}}',
    /* Studio */
    '.mod-magie.mg-studio .mg-st{display:grid;grid-template-columns:minmax(240px,320px) 1fr;gap:24px;align-items:start}',
    '.mod-magie .mg-prev{position:sticky;top:0;z-index:2}',
    '.mod-magie .mg-cv{position:relative;width:100%;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:var(--surface-2);box-shadow:0 10px 30px var(--shadow);border:1px solid var(--line)}',
    '.mod-magie .mg-cv canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
    '.mod-magie .mg-cv .mg-load{position:absolute;inset:0;justify-content:center}',
    '.mod-magie .mg-pager{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.mod-magie .mg-pager button{min-width:44px;min-height:44px;border-radius:999px;border:1px solid var(--line);background:var(--surface);font-weight:600}',
    '.mod-magie .mg-pager button.on{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}',
    '.mod-magie .mg-note{font-size:13px;color:var(--text-sub);text-align:center;margin:8px 0 0}',
    '.mod-magie .mg-themes{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}',
    '.mod-magie .mg-th{border:1px solid var(--line);border-radius:var(--radius);padding:0;background:var(--surface);overflow:hidden;display:flex;flex-direction:column;min-height:44px;min-width:0}',
    '.mod-magie .mg-th.on{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent)}',
    '.mod-magie .mg-th i{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;height:62px;font-style:normal;font-family:var(--serif);font-size:24px;font-weight:600;background:var(--tb);color:var(--tt);line-height:1}',
    '.mod-magie .mg-th i b{display:block;width:22px;height:2px;background:var(--ta)}',
    '.mod-magie .mg-th span{font-size:12px;font-weight:500;padding:6px 2px;text-align:center;line-height:1.2;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-magie .mg-inp{width:100%;min-height:44px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);color:var(--text);padding:0 12px;font:inherit;font-size:16px}',
    '.mod-magie .mg-inp:focus{outline:3px solid var(--focus);outline-offset:1px}',
    '.mod-magie .mg-txt{display:grid;gap:8px}',
    '.mod-magie .mg-txt label{display:grid;gap:4px;font-size:13px;color:var(--text-sub)}',
    '.mod-magie .mg-fonts .mg-chip{font-size:16px}',
    '.mod-magie .mg-colrow{display:flex;align-items:center;gap:2px;flex-wrap:wrap;margin-bottom:8px}',
    '.mod-magie .mg-colrow>b{flex-basis:100%;font-size:13px;font-weight:500;color:var(--text-sub);margin-bottom:-2px}',
    '.mod-magie .mg-sw{width:44px;height:44px;border-radius:50%;border:0;background:transparent;display:grid;place-items:center;padding:0}',
    '.mod-magie .mg-sw i{width:30px;height:30px;border-radius:50%;background:var(--c);box-shadow:inset 0 0 0 1px var(--line)}',
    '.mod-magie .mg-sw.on i{box-shadow:0 0 0 3px var(--surface),0 0 0 5px var(--accent)}',
    '.mod-magie .mg-slider{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;font-size:13px;color:var(--text-sub);min-height:44px}',
    '.mod-magie .mg-slider input{width:100%;accent-color:var(--accent);min-height:32px}',
    '.mod-magie .mg-tog{display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer}',
    '.mod-magie .mg-tog input{width:22px;height:22px;accent-color:var(--accent);flex:none}',
    '.mod-magie .mg-adv{border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);margin-bottom:14px}',
    '.mod-magie .mg-adv>summary{list-style:none;min-height:48px;display:flex;align-items:center;gap:8px;padding:0 14px;font-weight:600;cursor:pointer}',
    '.mod-magie .mg-adv>summary::-webkit-details-marker{display:none}',
    '.mod-magie .mg-adv>summary svg{width:18px;height:18px;margin-left:auto;transition:transform .2s}',
    '.mod-magie .mg-adv[open]>summary svg{transform:rotate(180deg)}',
    '.mod-magie .mg-adv>div{padding:4px 14px 14px}',
    '.mod-magie .mg-linkbox{display:flex;gap:6px;margin-top:8px}',
    '.mod-magie .mg-linkbox input{flex:1;min-width:0;font-size:14px}',
    '.mod-magie .mg-help{font-size:13px;color:var(--text-sub);margin:6px 0 0}',
    '.mod-magie .mg-warn{font-size:13px;color:var(--text);margin:8px 0 0;padding:8px 10px;border-radius:var(--radius);border:1px solid var(--warn);background:var(--surface)}',
    '.mod-magie .mg-warn .mg-link{min-height:36px;padding:0 4px}',
    '.mod-magie .mg-photo{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '.mod-magie .mg-file{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}',
    '.mod-magie .mg-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;font-size:13px;color:var(--text-sub);align-items:center}',
    '.mod-magie .mg-steps b{display:inline-flex;align-items:center;min-height:26px;padding:0 9px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);color:var(--text);font-weight:500}',
    '@media (max-width:699px){',
    '  .mod-magie.mg-studio .mg-st{grid-template-columns:1fr;gap:12px}',
    '  .mod-magie .mg-prev{background:var(--bg);padding:6px 0 8px;margin:0 -16px;border-bottom:1px solid var(--line)}',
    '  .mod-magie .mg-cv{width:auto;height:min(40vh,360px);margin:0 auto;aspect-ratio:9/16}',
    '  .mod-magie.mg-studio .mg-ctl button,.mod-magie.mg-studio .mg-ctl input,.mod-magie.mg-studio .mg-ctl summary{scroll-margin-top:calc(min(40vh,360px) + 90px);scroll-margin-bottom:140px}',
    '  .mod-magie .mg-pager{margin-top:6px}',
    '  .mod-magie .mg-note{margin-top:4px}',
    '  .mod-magie .mg-themes{gap:6px}',
    '  .mod-magie .mg-th i{height:54px;font-size:21px}',
    '}'
  ].join('\n');
  function ensureCss() {
    var old = document.querySelector('style[data-module="magie"]');
    if (old && old.getAttribute('data-v') === '3') return;
    if (old) old.remove();
    var s = document.createElement('style'); s.setAttribute('data-module', 'magie'); s.setAttribute('data-v', '3'); s.textContent = CSS;
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

  /* Heure affichée : début seul (« 9h ») ou plage si cfg.affichage.heureFin === true. G.heure du shell si présent. */
  function hr(debut, fin) {
    if (typeof G.heure === 'function') { try { var s = G.heure(debut, fin); if (s) return String(s); } catch (e) { /* repli */ } }
    var c = cfg();
    return c && c.affichage && c.affichage.heureFin === true && fin ? hfr(debut) + ' – ' + hfr(fin) : hfr(debut);
  }
  function dayMid(d) { var p = dp(d); return cap1(JOURS[wd(d)]) + ' ' + p.j + ' ' + MOIS_C[p.m - 1]; }
  function dayLabel(d) { return rel(d) || dayMid(d); }
  function showSec(name) { var c = cfg() || {}, m = c.magie || {}; return name === 'afficherRelances' ? m[name] === true : m[name] !== false; }
  function isDateStr(s) { return typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s); }
  function isOpenDay(d) { try { return !!U().dayRules(cfg(), d); } catch (e) { return true; } }
  function stepMin() { var c = cfg() || {}; return +c.pasMinutes > 0 ? +c.pasMinutes : 15; }

  /* --- Jours : périodes rapides + sélection libre dans un calendrier --- */
  var MAXJ = 31;
  var PERIODES = [['auj', 'Aujourd\'hui'], ['demain', 'Demain'], ['semaine', 'Semaine prochaine'], ['perso', 'Personnalisée']];
  var PERS = ['auj', 'demain', 'semaine', 'perso'];
  function nextWeek() {
    var u = U(), t = G.today(), mon = u.addDays(t, 7 - ((wd(t) + 6) % 7)), out = [];
    for (var i = 0; i < 7; i++) out.push(u.addDays(mon, i));
    return out;
  }
  function selDays(st) {
    var t = G.today(), u = U();
    if (st.per === 'auj') return [t];
    if (st.per === 'demain') return [u.addDays(t, 1)];
    if (st.per === 'semaine') return nextWeek();
    return Object.keys(st.sel).filter(function (d) { return st.sel[d] && d >= t; }).sort();
  }
  function openDays(st) { return selDays(st).filter(isOpenDay); }
  function contiguous(days) { for (var i = 1; i < days.length; i++) if (U().diffDays(days[i - 1], days[i]) !== 1) return false; return days.length > 1; }
  function rangeText(days) {
    if (!days.length) return '';
    if (days.length === 1) return dayTitle(days[0]);
    var a = dp(days[0]), b = dp(days[days.length - 1]);
    if (contiguous(days)) return 'Du ' + dayLong(days[0]) + ' au ' + dayLong(days[days.length - 1]);
    var lst = days.slice(0, 5).map(function (d) { var p = dp(d); return JOURS_C[wd(d)] + ' ' + p.j + (a.m === b.m ? '' : ' ' + MOIS_C[p.m - 1]); }).join(', ');
    return lst + (a.m === b.m ? ' ' + MOIS[a.m - 1] : '') + (days.length > 5 ? ', et ' + plural(days.length - 5, 'autre jour', 'autres jours') : '');
  }
  function shownPids(st) { return st.qui === 'tous' ? activeIds() : [st.qui]; }
  function key(date, pid, debut) { return date + '|' + pid + '|' + debut; }
  function ym(d) { return String(d).slice(0, 7); }
  function ymAdd(m, n) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + '-' + pad(mo + 1); }
  function monthLast(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7); return m + '-' + pad(new Date(Date.UTC(y, mo, 0)).getUTCDate()); }

  /* Remplissage du mois (pour le calendrier) : RDV et indisponibilités via admin.planning, mis en cache */
  var MCACHE = {};
  function monthData(m) {
    if (!MCACHE[m]) {
      var p = G.API.admin('admin.planning', { du: m + '-01', au: monthLast(m) }).then(function (d) { return { rdvs: (d && d.rdvs) || [], bls: (d && d.blocages) || [] }; });
      p.catch(function () { delete MCACHE[m]; });
      MCACHE[m] = p;
    }
    return MCACHE[m];
  }
  function dayFill(st, d) {
    var md = st.month && st.month.m === ym(d) ? st.month.data : null;
    if (!md) return null;
    var c = cfg() || {}, max = +c.maxClientesJour || 6, rules = null;
    try { rules = U().dayRules(c, d); } catch (e) { rules = null; }
    var pids = shownPids(st), n = 0, cap = 0;
    pids.forEach(function (pid) {
      var off = md.bls.some(function (b) {
        if (d < b.du || d > b.au || (b.praticienne !== 'tous' && b.praticienne !== pid)) return false;
        if (!b.heureDebut && !b.heureFin) return true;
        if (!rules) return false;
        return U().toMin(b.heureDebut || '00:00') <= rules.debut && U().toMin(b.heureFin || '23:59') >= rules.fin;
      });
      if (off) return;
      cap += max;
      n += md.rdvs.filter(function (r) { return r.date === d && r.praticienne === pid && r.type !== 'massage' && (r.statut === 'confirme' || r.statut === 'en_attente'); }).length;
    });
    return { n: n, cap: cap, off: cap === 0 };
  }
  function loadMonth(st) {
    var m = st.cal;
    if (st.month && st.month.m === m && st.month.data) return;
    st.month = { m: m, data: null };
    monthData(m).then(function (d) {
      if (st.closed || st.cal !== m) return;
      st.month = { m: m, data: d }; renderCal(st);
    }, function () { /* calendrier sans remplissage */ });
  }

  function calHTML(st) {
    var u = U(), t = G.today(), m = st.cal, first = m + '-01', last = monthLast(m);
    var p = dp(first), lead = (wd(first) + 6) % 7, minM = ym(t), maxM = ymAdd(minM, 6);
    var h = '<div class="mg-cal" role="group" aria-label="Choisir les jours"><div class="mg-calh">' +
      '<button type="button" data-a="cal" data-v="-1" aria-label="Mois précédent"' + (m <= minM ? ' disabled' : '') + '>' + ic('chevronL') + '</button>' +
      '<b aria-live="polite">' + esc(cap1(MOIS[p.m - 1]) + ' ' + p.y) + '</b>' +
      '<button type="button" data-a="cal" data-v="1" aria-label="Mois suivant"' + (m >= maxM ? ' disabled' : '') + '>' + ic('chevronR') + '</button></div>';
    h += '<div class="mg-calg">' + ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map(function (x) { return '<span class="mg-calw" aria-hidden="true">' + x + '</span>'; }).join('');
    for (var i = 0; i < lead; i++) h += '<span></span>';
    for (var d = first; d <= last; d = u.addDays(d, 1)) {
      var past = d < t, open = isOpenDay(d), on = !!st.sel[d] && !past && open, f = open && !past ? dayFill(st, d) : null;
      var cls = 'mg-cd' + (on ? ' on' : '') + (d === t ? ' today' : '') + (!open ? ' closed' : '') + (st.plage === d ? ' pl' : '');
      var bar = '';
      if (open && !past) {
        if (f && f.off) bar = '<span class="f na"></span>';
        else if (f) { var pc100 = f.cap ? Math.min(100, Math.round(f.n / f.cap * 100)) : 0; bar = '<span class="f' + (pc100 >= 100 ? ' full' : '') + '"><i style="width:' + Math.max(pc100, pc100 ? 8 : 0) + '%"></i></span>'; }
        else bar = '<span class="f"></span>';
      }
      var lab = cap1(dayLong(d)) + (past ? ', passé' : !open ? ', fermé' : f ? (f.off ? ', indisponible' : ', ' + f.n + ' rendez-vous sur ' + f.cap) : '');
      h += '<button type="button" class="' + cls + '" data-a="day" data-d="' + d + '"' + (past || !open ? ' disabled' : '') + ' aria-pressed="' + on + '" aria-label="' + esc(lab) + '"><span class="n">' + dp(d).j + '</span>' + bar + '</button>';
    }
    h += '</div><div class="mg-calf"><span class="lg"><i></i>Remplissage</span><span class="lg"><i class="full"></i>Complet</span><span class="sp"></span>' +
      '<button type="button" class="mg-tgl' + (st.plageOn ? ' on' : '') + '" data-a="plage" aria-pressed="' + !!st.plageOn + '">' + ic('calendar') + 'Plage</button>' +
      (selDays(st).length ? '<button type="button" class="mg-link" data-a="clear">Effacer</button>' : '') + '</div>';
    if (st.plageOn) h += '<div class="mg-range" role="status">' + (st.plage ? 'Touchez le dernier jour de la plage.' : 'Touchez le premier jour, puis le dernier : les jours ouverts entre les deux sont ajoutés.') + '</div>';
    return h + '</div>';
  }
  function renderCal(st) {
    var b = st.root && st.root.querySelector('[data-box="cal"]');
    if (b) b.innerHTML = st.per === 'perso' ? calHTML(st) : '';
    var r = st.root && st.root.querySelector('[data-box="range"]');
    if (r) r.innerHTML = rangeHTML(st);
  }
  function rangeHTML(st) {
    var days = selDays(st), od = days.filter(isOpenDay);
    if (!days.length) return '<div class="mg-range">' + (st.per === 'perso' ? 'Touchez les jours à remplir dans le calendrier.' : '') + '</div>';
    var txt = esc(rangeText(days));
    if (st.per === 'perso') txt = '<b>' + plural(days.length, 'jour') + '</b> · ' + txt;
    if (!od.length) txt += ' · fermé';
    else if (od.length < days.length && days.length > 1) txt += ' · ' + plural(od.length, 'jour ouvert', 'jours ouverts');
    return '<div class="mg-range">' + txt + '</div>';
  }

  function open(opts) {
    opts = opts || {};
    var c = cfg();
    if (!c || !c.services) { toast('Connectez-vous d\'abord.', 'err'); return null; }
    ensureCss();
    if (M && !M.closed) { try { M.panel.close(); } catch (e) { /* ignore */ } }
    var ids = activeIds(), t = G.today(), u = U();
    var qui = opts.praticienne || (G.filtre && G.filtre.prat) || 'tous';
    if (qui !== 'tous' && ids.indexOf(qui) < 0) qui = 'tous';
    if (qui === 'tous' && ids.length === 1) qui = ids[0];
    var per = null, sel = {};
    var jours = Array.isArray(opts.jours) ? opts.jours.filter(function (d, i, a) { return isDateStr(d) && d >= t && a.indexOf(d) === i; }).sort().slice(0, MAXJ) : [];
    if (!jours.length && isDateStr(opts.du) && opts.du >= t) { // compatibilité : plage du → au
      var au = isDateStr(opts.au) && opts.au >= opts.du ? opts.au : opts.du;
      for (var d = opts.du; d <= au && jours.length < MAXJ; d = u.addDays(d, 1)) jours.push(d);
    }
    if (jours.length) {
      if (jours.length === 1 && jours[0] === t) per = 'auj';
      else if (jours.length === 1 && jours[0] === u.addDays(t, 1)) per = 'demain';
      else { per = 'perso'; jours.forEach(function (x) { sel[x] = true; }); }
    } else {
      per = ls.get('per', 'auj');
      if (PERS.indexOf(per) < 0) per = 'auj';
      if (per === 'perso') (ls.get('sel', []) || []).forEach(function (x) { if (isDateStr(x) && x >= t) sel[x] = true; });
      // Raccourci sans jour ouvert (salon fermé aujourd'hui, demain…) : le suivant qui en a
      if (per !== 'perso') {
        var order = PERS.slice(PERS.indexOf(per), 3).concat(['semaine']);
        for (var oi = 0; oi < order.length; oi++) { if (openDays({ per: order[oi], sel: {} }).length) { per = order[oi]; break; } }
      }
    }
    var calM = ym(t);
    var firstSel = Object.keys(sel).sort()[0];
    if (firstSel) calM = ym(firstSel);
    else if (isDateStr(opts.jour) && opts.jour >= t) calM = ym(opts.jour);
    if (calM > ymAdd(ym(t), 6)) calM = ym(t);
    var st = { qui: qui, per: per, sel: sel, cal: calM, plageOn: false, plage: null, month: null,
      services: defaultServices(), excl: {}, data: null, loading: false, err: null, req: 0,
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

  var loadT = null;
  function loadSoon(st) { clearTimeout(loadT); st.loading = true; renderBusy(st); loadT = setTimeout(function () { if (!st.closed) load(st); }, 380); }
  function renderBusy(st) {
    var b = st.root && st.root.querySelector('[data-box="busy"]');
    if (b) b.innerHTML = st.loading && st.data ? '<span class="mg-busy" role="status"><span class="mg-spin"></span>Mise à jour…</span>' : '';
  }
  function load(st) {
    clearTimeout(loadT);
    var my = ++st.req, days = selDays(st);
    if (!days.length) { st.loading = false; st.err = null; st.data = null; renderMain(st); st.loadP = Promise.resolve(); return st.loadP; }
    st.loading = true; st.err = null; st.alMore = false; st.relMore = false; renderMain(st);
    if (st.per === 'perso' || !(st.month && st.month.data)) loadMonth(st);
    st.loadP = G.API.admin('admin.remplir', { praticienne: st.qui, jours: days, du: days[0], au: days[days.length - 1], services: st.services }).then(function (d) {
      if (my !== st.req || st.closed) return;
      // Serveur plus ancien (sans « jours ») : on ne garde que les jours choisis
      var want = {}; days.forEach(function (x) { want[x] = true; });
      d.jours = (d.jours || []).filter(function (j) { return want[j.date]; });
      st.data = d; st.loading = false; renderMain(st);
    }, function (e) {
      if (my !== st.req || st.closed) return;
      st.loading = false; st.err = (e && e.message) || 'Erreur inattendue.'; renderMain(st);
    });
    return st.loadP;
  }

  function dayOf(st, date) { return st.data ? st.data.jours.filter(function (x) { return x.date === date; })[0] : null; }
  // Toutes les heures valides (serveur ≥ 1.3) ; sinon les heures « idéales » sans chevauchement
  function slotsOf(P) {
    if (!P) return [];
    if (Array.isArray(P.toutes) && P.toutes.length) return P.toutes;
    return (P.creneaux || []).map(function (c) { return { debut: c.debut, fin: c.fin, ordre: c.ordre, classe: c.classe, ideal: true }; });
  }
  function isBlocked(P) { return (P.alertes || []).some(function (a) { return a.niveau === 'info'; }); }

  function collectAlerts(st) {
    var out = [];
    if (!st.data) return out;
    st.data.jours.forEach(function (j) {
      shownPids(st).forEach(function (pid) {
        var P = j.praticiennes[pid]; if (!P) return;
        var al = (P.alertes || []).filter(function (a) { return a.niveau === 'critique' || a.niveau === 'attention'; });
        if (!al.length) return;
        var crit = al.some(function (a) { return a.niveau === 'critique'; });
        al.sort(function (a, b) { return (a.niveau === 'critique' ? 0 : 1) - (b.niveau === 'critique' ? 0 : 1); });
        var txt = String(al[0].texte || '').replace(/^(Aujourd'hui|Aujourd’hui|Demain)\s*:\s*/, '');
        out.push({ date: j.date, pid: pid, niveau: crit ? 'critique' : 'attention', texte: cap1(txt), P: P });
      });
    });
    out.sort(function (a, b) { return (a.niveau === b.niveau ? 0 : a.niveau === 'critique' ? -1 : 1) || a.date.localeCompare(b.date) || pratOrder(a.pid, b.pid); });
    return out;
  }

  function eachSlot(st, fn) {
    if (!st.data) return;
    st.data.jours.forEach(function (j) {
      shownPids(st).forEach(function (pid) {
        var P = j.praticiennes[pid]; if (!P || isBlocked(P)) return;
        slotsOf(P).forEach(function (c) { fn(j, pid, c, key(j.date, pid, c.debut)); });
      });
    });
  }
  function checkedItems(st) {
    var out = [];
    eachSlot(st, function (j, pid, c, k) { if (!st.excl[k]) out.push({ key: k, date: j.date, praticienne: pid, debut: c.debut, fin: c.fin, ordre: c.ordre, ideal: !!c.ideal }); });
    return out;
  }
  function allSlots(st) { var n = 0; eachSlot(st, function () { n++; }); return n; }
  function findSlot(st, k) {
    var f = null;
    if (st.data) st.data.jours.forEach(function (j) { Object.keys(j.praticiennes).forEach(function (pid) {
      var P = j.praticiennes[pid];
      (P.creneaux || []).concat(slotsOf(P)).forEach(function (c) { if (!f && key(j.date, pid, c.debut) === k) f = { date: j.date, pid: pid, c: c }; });
    }); });
    return f;
  }

  function pStyle(pid) { var c = pc(pid); return '--pc:' + c + ';--pt:' + inkOn(c) + ';--pbg:' + tnt(c, 0.12); }
  function who(pid) { return '<span class="mg-who" style="' + pStyle(pid) + '"><span class="mg-dot"></span>' + esc(pn(pid)) + '</span>'; }

  function ctrlHTML(st) {
    var ids = activeIds(), h = '<div class="mg-ctrl">';
    if (ids.length > 1) {
      h += '<div class="mg-f"><span class="mg-lab" id="mg-l-qui">Pour qui</span><div class="mg-seg" role="group" aria-labelledby="mg-l-qui">';
      h += '<button type="button" data-a="qui" data-v="tous" class="' + (st.qui === 'tous' ? 'on' : '') + '" aria-pressed="' + (st.qui === 'tous') + '">Les deux</button>';
      ids.forEach(function (id) {
        h += '<button type="button" data-a="qui" data-v="' + esc(id) + '" class="' + (st.qui === id ? 'on' : '') + '" style="' + pStyle(id) + '" aria-pressed="' + (st.qui === id) + '"><span class="mg-dot"></span>' + esc(pn(id)) + '</button>';
      });
      h += '</div></div>';
    }
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-per">Jours</span><div class="mg-chips mg-pers" role="group" aria-labelledby="mg-l-per">' + PERIODES.map(function (x) {
      var on = x[0] === st.per;
      return '<button type="button" class="mg-chip' + (on ? ' on' : '') + '" data-a="per" data-v="' + x[0] + '" aria-pressed="' + on + '">' + esc(x[1]) + '</button>';
    }).join('') + '</div><div data-box="range">' + rangeHTML(st) + '</div><div data-box="cal">' + (st.per === 'perso' ? calHTML(st) : '') + '</div></div>';
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
    var d = st.data, pids = Object.keys(d.resume || {}).filter(function (p) { return shownPids(st).indexOf(p) >= 0; }).sort(pratOrder);
    if (!pids.length || !d.jours.length) return '';
    var h = '<div class="mg-sum' + (pids.length === 1 ? '" style="grid-template-columns:1fr' : '') + '" role="group" aria-label="Résumé">';
    pids.forEach(function (pid) {
      var r = d.resume[pid], taux = r.max ? Math.round(r.clientes / r.max * 100) : 0, n = r.capacite;
      h += '<div class="mg-card" style="' + pStyle(pid) + '"><div class="mg-card-h"><span class="mg-dot"></span>' + esc(pn(pid)) + '</div>' +
        '<div class="mg-big">' + (n ? '<b>' + n + '</b><span>place' + (n > 1 ? 's' : '') + ' à remplir</span>' : '<b style="font-size:26px">Complet</b>') + '</div>' +
        '<div class="mg-gauge" role="img" aria-label="Remplie à ' + taux + ' %"><i style="width:' + Math.min(100, taux) + '%"></i></div>' +
        '<p>Remplie à ' + taux + ' %</p></div>';
    });
    return h + '</div>';
  }

  function hourBtn(date, pid, c, label) {
    var k = key(date, pid, c.debut);
    return '<button type="button" class="mg-h" data-a="book" data-key="' + esc(k) + '" aria-label="Réserver ' + esc(dayLabel(date) + ' à ' + hfr(c.debut) + ' avec ' + pn(pid)) + '">' + esc(label || hr(c.debut, c.fin)) + '</button>';
  }

  function alertsHTML(st) {
    var al = collectAlerts(st);
    if (!al.length) return '';
    var h = '<section class="mg-sec" aria-labelledby="mg-h-al"><h3 id="mg-h-al">À remplir en priorité</h3>' +
      '<p class="mg-aide">Les heures conseillées : elles remplissent le planning sans laisser de trou. Touchez une heure pour réserver.</p>';
    var lim = st.alMore ? al.length : 4;
    h += '<div class="mg-list">' + al.slice(0, lim).map(function (a) {
      var crit = a.niveau === 'critique';
      return '<div class="mg-it" style="' + pStyle(a.pid) + '"><div class="mg-ih"><b>' + esc(dayLabel(a.date)) + '</b>' + who(a.pid) + '<span class="mg-sp"></span>' +
        '<button type="button" class="mg-link" data-a="goday" data-d="' + a.date + '">Voir le jour</button></div>' +
        '<div class="mg-is' + (crit ? ' crit' : '') + '">' + esc(a.texte) + '</div>' +
        ((a.P.creneaux || []).length ? '<div class="mg-hrs">' + a.P.creneaux.map(function (c) { return hourBtn(a.date, a.pid, c); }).join('') + '</div>' : '') + '</div>';
    }).join('') + '</div>';
    if (al.length > lim) h += '<button type="button" class="mg-link mg-more" data-a="al-more">' + more(al.length - lim) + '</button>';
    return h + '</section>';
  }

  function more(n) { return n > 1 ? 'Voir les ' + n + ' autres' : 'Voir l\'autre'; }
  function relMsg(r) {
    var s = r.suggestion;
    var what = (r.services || []).indexOf('remplissage') >= 0 ? 'ton prochain remplissage approche' : 'ton prochain rendez-vous approche';
    return 'Bonjour ' + r.prenom + ', ' + what + (s ? ' : je te propose ' + dayLong(s.date) + ' à ' + hfr(s.debut) + '. Dis-moi si ça te va !' : '. Dis-moi quand tu es disponible !');
  }
  function relancesHTML(st) {
    var rl = st.data.relances || [];
    var h = '<section class="mg-sec" aria-labelledby="mg-h-rel"><h3 id="mg-h-rel">Clientes à relancer</h3>' +
      '<p class="mg-aide">Habituées dont le prochain soin est dû et qui n\'ont pas encore de rendez-vous.</p>';
    if (!rl.length) return h + '<div class="mg-empty">Aucune cliente à relancer sur cette période.</div></section>';
    var lim = st.relMore ? rl.length : 5, hasFiche = !!(G.modules && G.modules.clientes);
    h += '<div class="mg-list">' + rl.slice(0, lim).map(function (r, i) {
      var s = r.suggestion, nom = esc((r.prenom + ' ' + (r.nom || '')).trim());
      var late = r.retardJours > 0;
      var line = esc(svcLabel(r.services || [])) + ' prévu le ' + ddmm(r.prevue) + (late ? '<span class="mg-late">en retard de ' + r.retardJours + ' j</span>' : '');
      var sug = s ? 'Proposer <b>' + esc(cap1(dayShort(s.date)) + ' à ' + hr(s.debut, s.fin)) + '</b>' + (s.praticienne && s.praticienne !== r.praticienne ? ' avec ' + esc(pn(s.praticienne)) : '') : 'Pas de créneau libre sur la période';
      return '<div class="mg-it"><div class="mg-ih">' + (hasFiche ? '<button type="button" class="mg-name" data-a="fiche" data-i="' + i + '">' + nom + '</button>' : '<b>' + nom + '</b>') + who(r.praticienne) + '</div>' +
        '<div class="mg-is">' + line + '</div><div class="mg-is">' + sug + '</div>' +
        '<div class="mg-acts"><button type="button" class="mg-btn pri" data-a="rel-book" data-i="' + i + '">' + ic('plus') + 'Réserver</button>' +
        '<button type="button" class="mg-btn" data-a="rel-copy" data-i="' + i + '">' + ic('copy') + 'Copier le message</button></div></div>';
    }).join('') + '</div>';
    if (rl.length > lim) h += '<button type="button" class="mg-link mg-more" data-a="rel-more">' + more(rl.length - lim) + '</button>';
    return h + '</section>';
  }

  function timeChip(j, pid, c, st) {
    var k = key(j.date, pid, c.debut), on = !st.excl[k];
    return '<button type="button" class="mg-t' + (on ? ' on' : '') + (c.ideal ? ' id' : '') + '" data-a="tg" data-key="' + esc(k) + '" aria-pressed="' + on + '" aria-label="' +
      esc(hfr(c.debut) + (c.ideal ? ', heure conseillée' : '') + ', dans la story : ' + (on ? 'oui' : 'non')) + '">' + esc(hfr(c.debut)) + '</button>';
  }
  function slotsHTML(st) {
    var d = st.data, total = allSlots(st), n = checkedItems(st).length;
    var h = '<section class="mg-sec" aria-labelledby="mg-h-sl"><h3 id="mg-h-sl">Heures à proposer' + (total ? '<span class="mg-n" data-n="sel">' + n + ' sur ' + total + ' dans la story</span>' : '') + '</h3>';
    if (!d.jours.length) {
      var days = selDays(st);
      return h + '<div class="mg-empty" style="margin-top:10px">' + (days.length === 1 ? 'Le salon est fermé ce jour-là : choisissez un autre jour.' : 'Le salon est fermé sur ces jours : choisissez-en d\'autres.') + '</div></section>';
    }
    if (total) {
      h += '<p class="mg-aide">Le plus de choix possible, sans jamais laisser de trou inutilisable avant ou après le rendez-vous. Touchez une heure pour la retirer de la story ; la réservation par lien revérifie chaque heure.</p>';
      h += '<div class="mg-tools"><button type="button" class="mg-link" data-a="all" data-v="1">Tout</button><button type="button" class="mg-link" data-a="all" data-v="0">Aucune</button>' +
        '<button type="button" class="mg-link" data-a="all" data-v="ideal">Conseillées seulement</button><span class="mg-sp"></span><span class="mg-legend"><i></i>Heure conseillée</span></div>';
    }
    d.jours.forEach(function (j) {
      var live = [], grey = [];
      shownPids(st).forEach(function (pid) {
        var P = j.praticiennes[pid]; if (!P) return;
        var blocked = isBlocked(P), list = slotsOf(P), alts = P.alternatives || [];
        if (!blocked && list.length) {
          var places = P.capacite > 0 ? ' · ' + plural(P.capacite, 'place') : '';
          live.push('<div class="mg-pblk" style="' + pStyle(pid) + '"><div class="mg-ph"><span class="mg-dot"></span>' + esc(pn(pid)) + '<small>' + plural(list.length, 'heure') + places + '</small><span class="mg-sp"></span>' +
            '<button type="button" class="mg-link" data-a="bookp" data-d="' + j.date + '" data-p="' + esc(pid) + '">' + ic('plus') + 'Réserver</button></div>' +
            '<div class="mg-tg">' + list.map(function (c) { return timeChip(j, pid, c, st); }).join('') + '</div></div>');
        } else if (!blocked && P.placesRestantes > 0 && alts.length) {
          live.push('<div class="mg-alt" style="' + pStyle(pid) + '"><span class="mg-dot"></span><span>' + esc(pn(pid)) + ' · encore possible : </span>' + alts.slice(0, 1).map(function (a, ai) {
            return '<button type="button" data-a="alt" data-d="' + j.date + '" data-p="' + esc(pid) + '" data-i="' + ai + '">' + esc(svcName(a.service, true) || a.nom) + ' à ' + esc(hr(a.debut, a.fin)) + '</button>';
          }).join(' ou ') + '</div>');
        } else {
          grey.push({ pid: pid, txt: blocked ? 'indisponible' : P.clientes >= P.max ? 'complet' : 'plus de place' });
        }
      });
      var r = rel(j.date), title = cap1(dayLong(j.date));
      if (!live.length) {
        var same = grey.every(function (g) { return g.txt === grey[0].txt; });
        var t = !grey.length ? '' : ' · ' + (same ? grey[0].txt : grey.map(function (g) { return pn(g.pid) + ' ' + g.txt; }).join(', '));
        h += '<div class="mg-day full"><h4>' + esc(title + t) + '</h4></div>';
        return;
      }
      h += '<div class="mg-day"><h4>' + (r ? '<small>' + esc(r) + '</small>' : '') + esc(title) + '</h4>' + live.join('') + grey.map(function (g) {
        return '<div class="mg-pgrey" style="' + pStyle(g.pid) + '"><span class="mg-dot"></span>' + esc(pn(g.pid) + ' : ' + g.txt) + '</div>';
      }).join('') + '</div>';
    });
    return h + '</section>';
  }

  function footHTML(st) {
    var n = checkedItems(st).length;
    return '<div class="mg-foot"><div class="mg-fi" data-n="foot"><b>' + plural(n, 'heure', 'heures') + '</b> dans la story</div>' +
      '<button type="button" class="mg-btn pri" data-a="story"' + (n ? '' : ' disabled') + '>' + ic('sparkle') + 'Créer la story</button></div>';
  }

  function renderMain(st) {
    if (st.closed || !st.root) return;
    var h = '<div class="mg-pad">';
    if (st.changed && st.data) h += '<div class="mg-banner" role="status"><span>Le planning a changé : pensez à mettre la story à jour.</span><button type="button" class="mg-btn pri" data-a="story">' + ic('sparkle') + 'Mettre la story à jour</button></div>';
    h += ctrlHTML(st);
    h += '<div data-box="busy" style="min-height:0;margin-top:8px"></div>';
    var none = !selDays(st).length;
    if (none) h += '<div class="mg-sec"><div class="mg-empty">Choisissez au moins un jour pour voir les heures à proposer.</div></div>';
    else if (st.err) h += '<div class="mg-sec"><div class="mg-err" role="alert">' + esc(st.err) + ' <button type="button" class="mg-btn" data-a="retry">Réessayer</button></div></div>';
    else if (!st.data) h += '<div class="mg-load" role="status"><span class="mg-spin"></span>Analyse des agendas…</div>';
    else {
      h += summaryHTML(st) + (showSec('afficherPriorites') && st.data.jours.length > 1 ? alertsHTML(st) : '') + (showSec('afficherRelances') ? relancesHTML(st) : '') + slotsHTML(st);
    }
    h += '</div>';
    if (!none && st.data && !st.err && allSlots(st)) h += footHTML(st);
    else h += '<div style="height:24px"></div>';
    st.root.innerHTML = h;
    renderBusy(st);
  }

  function updCounts(st) {
    var n = checkedItems(st).length, total = allSlots(st);
    var a = st.root.querySelector('[data-n="sel"]'); if (a) a.textContent = n + ' sur ' + total + ' dans la story';
    var f = st.root.querySelector('[data-n="foot"]'); if (f) f.innerHTML = '<b>' + plural(n, 'heure', 'heures') + '</b> dans la story';
    var b = st.root.querySelector('.mg-foot [data-a="story"]'); if (b) b.disabled = !n;
  }
  function syncChips(st) {
    Array.prototype.forEach.call(st.root.querySelectorAll('.mg-t[data-key]'), function (el) {
      var on = !st.excl[el.getAttribute('data-key')];
      el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on));
    });
    updCounts(st);
  }

  function afterBook(st, r) {
    if (r && !st.closed) { st.changed = true; load(st); }
  }
  function newRdv(st, prefill) {
    var p;
    try { p = G.newRdv(prefill); } catch (e) { toast((e && e.message) || 'Création impossible', 'err'); return; }
    if (p && typeof p.then === 'function') p.then(function (r) { afterBook(st, r); }, function () { /* annulé */ });
  }
  function saveSel(st) { if (st.per === 'perso') ls.set('sel', selDays(st)); }

  function bindMain(st) {
    var root = st.root;
    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || !root.contains(b) || b.disabled) return;
      var a = b.getAttribute('data-a');
      if (a === 'qui') { var v = b.getAttribute('data-v'); if (v !== st.qui) { st.qui = v; st.excl = {}; load(st); } return; }
      if (a === 'per') {
        var pv = b.getAttribute('data-v');
        if (pv === st.per) return;
        var before = selDays(st).filter(isOpenDay);
        st.per = pv; ls.set('per', pv);
        if (pv === 'perso') {
          // Calendrier vide : on part des jours affichés jusque-là
          if (!selDays(st).length) { st.sel = {}; before.forEach(function (x) { st.sel[x] = true; }); }
          var f0 = selDays(st)[0]; if (f0) st.cal = ym(f0);
          saveSel(st);
        }
        st.plageOn = false; st.plage = null;
        load(st); return;
      }
      if (a === 'cal') {
        st.cal = ymAdd(st.cal, +b.getAttribute('data-v') || 0); st.plage = null;
        renderCal(st); loadMonth(st); return;
      }
      if (a === 'plage') { st.plageOn = !st.plageOn; st.plage = null; renderCal(st); return; }
      if (a === 'clear') { st.sel = {}; st.plage = null; saveSel(st); renderCal(st); load(st); return; }
      if (a === 'day') {
        var d = b.getAttribute('data-d'), n0 = selDays(st).length;
        if (st.plageOn) {
          if (!st.plage) { st.plage = d; st.sel[d] = true; }
          else {
            var lo = st.plage < d ? st.plage : d, hi = st.plage < d ? d : st.plage, added = 0;
            for (var x = lo; x <= hi; x = U().addDays(x, 1)) {
              if (x >= G.today() && isOpenDay(x) && !st.sel[x]) { if (selDays(st).length >= MAXJ) { toast(MAXJ + ' jours au maximum.', 'info'); break; } st.sel[x] = true; added++; }
            }
            st.plage = null; st.plageOn = false;
          }
        } else if (st.sel[d]) delete st.sel[d];
        else {
          if (n0 >= MAXJ) { toast(MAXJ + ' jours au maximum : retirez-en un d\'abord.', 'info'); return; }
          st.sel[d] = true;
        }
        saveSel(st); renderCal(st);
        if (selDays(st).length) loadSoon(st); else load(st);
        return;
      }
      if (a === 'svc') {
        var id = b.getAttribute('data-v'), cat = svcCat(id), cur2 = st.services.slice();
        if (cur2.indexOf(id) >= 0) { if (cur2.length === 1) { toast('Gardez au moins une prestation.', 'info'); return; } cur2 = cur2.filter(function (x) { return x !== id; }); }
        else { cur2 = cur2.filter(function (x) { return svcCat(x) !== cat; }); cur2.push(id); }
        cur2.sort(function (x, y) { return (svcCat(x) === 'pied') - (svcCat(y) === 'pied'); });
        st.services = cur2; st.excl = {}; load(st); return;
      }
      if (a === 'retry') { load(st); return; }
      if (a === 'svc-open') { st.svcOpen = b.getAttribute('data-v') === '1'; renderMain(st); return; }
      if (a === 'al-more') { st.alMore = true; renderMain(st); return; }
      if (a === 'rel-more') { st.relMore = true; renderMain(st); return; }
      if (a === 'goday') { var gd = b.getAttribute('data-d'); try { st.panel.close(); } catch (x1) { /* ignore */ } try { G.goDate(gd, 'jour'); } catch (x2) { /* ignore */ } return; }
      if (a === 'tg') {
        var k = b.getAttribute('data-key');
        if (st.excl[k]) delete st.excl[k]; else st.excl[k] = true;
        var on = !st.excl[k]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        updCounts(st); return;
      }
      if (a === 'book') {
        var f = findSlot(st, b.getAttribute('data-key')); if (!f) return;
        newRdv(st, { praticienne: f.pid, date: f.date, debut: f.c.debut, services: (f.c.ordre && f.c.ordre.length ? f.c.ordre : st.services).slice() });
        return;
      }
      if (a === 'bookp') {
        var bd = b.getAttribute('data-d'), bp = b.getAttribute('data-p'), Pj = dayOf(st, bd), Pb = Pj && Pj.praticiennes[bp];
        var first = Pb && ((Pb.creneaux || [])[0] || slotsOf(Pb)[0]);
        var pre = { praticienne: bp, date: bd, services: st.services.slice() };
        if (first) { pre.debut = first.debut; if (first.ordre && first.ordre.length) pre.services = first.ordre.slice(); }
        newRdv(st, pre); return;
      }
      if (a === 'alt') {
        var jd = dayOf(st, b.getAttribute('data-d')), ap = b.getAttribute('data-p'), Pa = jd && jd.praticiennes[ap];
        var alt = Pa && (Pa.alternatives || [])[+b.getAttribute('data-i')]; if (!alt) return;
        newRdv(st, { praticienne: ap, date: jd.date, debut: alt.debut, services: [alt.service] });
        return;
      }
      if (a === 'rel-book' || a === 'rel-copy' || a === 'fiche') {
        var r = (st.data.relances || [])[+b.getAttribute('data-i')]; if (!r) return;
        if (a === 'rel-copy') { copyText(relMsg(r), 'Message copié pour ' + r.prenom); return; }
        if (a === 'fiche') { try { G.openClient(r.cle); } catch (x3) { /* ignore */ } return; }
        var s = r.suggestion, pr = { cle: r.cle, prenom: r.prenom, nom: r.nom, praticienne: (s && s.praticienne) || r.praticienne, services: (s && s.ordre && s.ordre.length ? s.ordre : r.services).slice() };
        if (s) { pr.date = s.date; pr.debut = s.debut; }
        newRdv(st, pr); return;
      }
      if (a === 'all') {
        var mode = b.getAttribute('data-v');
        eachSlot(st, function (j, pid, c, kk) { var keep = mode === '1' || (mode === 'ideal' && c.ideal); if (keep) delete st.excl[kk]; else st.excl[kk] = true; });
        syncChips(st); return;
      }
      if (a === 'story') {
        var go = function () { st.changed = false; renderMain(st); openStudio(st); };
        if (st.loading) st.loadP.then(go); else go();
      }
    });
  }

  /* =====================================================================
   * STUDIO DE STORY (charte Sorelle : sauge, terracotta, crème, sable)
   * =================================================================== */
  var SW = 1080, SH = 1920, SX = 96, CW = SW - 2 * SX;
  var SANS = 'Outfit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  var SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';
  var INK = '#2A2F23', CREAM = '#F6EFE3', SAND = '#E9DCC6', SAGE = '#5E7052', SAGE_D = '#4F6046', TERRA = '#C97B5A';
  var OFFRE_MAX = 200;
  function sf(w, px) { return w + ' ' + Math.round(px) + 'px ' + SANS; }

  var FONTS = [
    { n: 'Cormorant Garamond', label: 'Cormorant', w: '600', fb: 'Georgia, "Times New Roman", serif', k: 1.12 },
    { n: 'Playfair Display', label: 'Playfair', q: 'Playfair+Display:wght@500;600', w: '500', fb: 'Georgia, "Times New Roman", serif', k: 0.94 },
    { n: 'Outfit', label: 'Outfit', w: '500', fb: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', k: 0.96 }
  ];
  function fontBy(n) { return FONTS.filter(function (f) { return f.n === n; })[0] || FONTS[0]; }
  function tf(F, px) { return F.w + ' ' + Math.round(px * F.k) + 'px "' + F.n + '", ' + F.fb; }
  var fontP = {};
  function waitFont(spec) {
    return new Promise(function (res) {
      if (!document.fonts || !document.fonts.load) { res(false); return; }
      var t = setTimeout(function () { res(false); }, 3500), tries = 0;
      (function tryLoad() {
        document.fonts.load(spec, 'Aa').then(function (l) {
          if (l && l.length) { clearTimeout(t); res(true); }
          else if (++tries < 6) setTimeout(tryLoad, 450);
          else { clearTimeout(t); res(false); }
        }, function () { clearTimeout(t); res(false); });
      })();
    });
  }
  function loadFont(n) {
    if (fontP[n]) return fontP[n];
    var F = fontBy(n);
    try {
      var id = 'mg-font-' + F.n.replace(/\s+/g, '-');
      if (F.q && !document.getElementById(id)) {
        var l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
        l.href = 'https://fonts.googleapis.com/css2?family=' + F.q + '&display=swap';
        document.head.appendChild(l);
      }
    } catch (e) { /* repli système */ }
    fontP[n] = waitFont(F.w + ' 80px "' + F.n + '"');
    return fontP[n];
  }
  // Polices de la marque, attendues avant le premier dessin (repli Georgia / système)
  var brandP = null;
  function brandFonts() {
    if (!brandP) brandP = Promise.all([waitFont('600 40px "Cormorant Garamond"'), waitFont('500 40px "Cormorant Garamond"'), waitFont('400 40px Outfit'), waitFont('500 40px Outfit')]);
    return brandP;
  }

  var THEMES = [
    { id: 'creme', nom: 'Crème', bg: CREAM, bg2: '#EEE3CF', text: INK, accent: SAGE, fond: 'uni' },
    { id: 'sable', nom: 'Sable', bg: SAND, bg2: '#DFCCAE', text: INK, accent: SAGE_D, fond: 'uni' },
    { id: 'sauge', nom: 'Sauge', bg: SAGE, bg2: '#536548', text: CREAM, accent: CREAM, fond: 'degrade' },
    { id: 'profond', nom: 'Sauge profond', bg: SAGE_D, bg2: '#3C4935', text: CREAM, accent: SAND, fond: 'degrade' },
    { id: 'photo', nom: 'Photo', bg: SAGE_D, bg2: '#3C4935', text: CREAM, accent: CREAM, fond: 'photo', voile: '#3C4935', voileOp: 0.55 }
  ];
  // Anciens thèmes (hors charte) : remplacés par le plus proche de la marque
  var OLD_THEMES = { derniere: 'profond', terracotta: 'sable', minimal: 'creme', nuit: 'profond', poudre: 'sable' };
  function themeBy(id) { id = OLD_THEMES[id] || id; return THEMES.filter(function (t) { return t.id === id; })[0] || THEMES[0]; }
  var SWATCHES = [CREAM, '#FFFDF8', SAND, SAGE, SAGE_D, INK, TERRA];
  var VOILES = ['#3C4935', SAGE, INK, CREAM];
  var LAYOUTS = [['liste', 'Liste'], ['agenda', 'Agenda'], ['vedette', 'Une praticienne']];
  function brandHex(h, list) { h = vHex(h); return h && (list || SWATCHES).some(function (c) { return c.toLowerCase() === h.toLowerCase(); }) ? h : null; }

  function normStyle(s) {
    s = s && typeof s === 'object' ? s : {};
    var th = themeBy(s.theme);
    return {
      theme: th.id,
      layout: LAYOUTS.some(function (l) { return l[0] === s.layout; }) ? s.layout : 'liste',
      font: FONTS.some(function (f) { return f.n === s.font; }) ? s.font : FONTS[0].n,
      bg: brandHex(s.bg), text: brandHex(s.text), accent: brandHex(s.accent),
      fond: ['uni', 'degrade', 'photo'].indexOf(s.fond) >= 0 ? s.fond : th.fond,
      voile: brandHex(s.voile, VOILES) || th.voile || '#3C4935',
      voileOp: typeof s.voileOp === 'number' ? Math.max(0, Math.min(0.85, s.voileOp)) : (th.voileOp != null ? th.voileOp : 0.55),
      flou: typeof s.flou === 'number' ? Math.max(0, Math.min(3, Math.round(s.flou))) : 1,
      photos: s.photos !== false, adresse: s.adresse !== false,
      logo: s.logo === 'dessus' ? 'dessus' : 'cote', mois: s.mois !== false,
      vedette: typeof s.vedette === 'string' ? s.vedette : null
    };
  }
  function effTheme(S) {
    var s = S.style, th = themeBy(s.theme);
    var photo = s.fond === 'photo' && !!S.bgImg;
    var bg = s.bg || th.bg;
    var dark = photo ? !(lum(s.voile) > 0.5 && s.voileOp >= 0.45) : lum(bg) < 0.35;
    if (s.fond === 'photo' && !photo && !s.bg) { bg = th.id === 'photo' ? th.bg : bg; dark = lum(bg) < 0.35; }
    var text = s.text || (th.id === 'photo' || s.bg || s.fond === 'photo' ? (dark ? CREAM : INK) : th.text);
    var accent = s.accent || (s.bg || s.fond === 'photo' ? (dark ? CREAM : SAGE) : th.accent);
    if (contrast(accent, dark ? bg : bg) < 1.6 && !photo) accent = dark ? CREAM : SAGE_D;
    var bg2 = s.bg ? mix(bg, dark ? '#000000' : '#5A4A30', 0.9) : th.bg2;
    var ctaText = contrast(accent, CREAM) >= 4.2 ? CREAM : contrast(accent, SAGE_D) >= 4.2 ? SAGE_D : INK;
    return {
      bg: bg, bg2: bg2, text: text, sub: rgba(text, dark ? 0.8 : 0.74), faint: rgba(text, dark ? 0.24 : 0.16), accent: accent, ctaText: ctaText,
      deco: TERRA, kick: dark ? rgba(text, 0.82) : mix(TERRA, INK, 0.82), dark: dark, photo: photo,
      chip: dark ? rgba(CREAM, photo ? 0.16 : 0.12) : rgba(INK, 0.055), chipLine: dark ? rgba(CREAM, 0.26) : rgba(INK, 0.1),
      card: dark ? CREAM : (lum(bg) > 0.8 ? '#FFFDF8' : CREAM), cardInk: INK, cardSub: '#5A6453', cardLine: rgba(INK, 0.1),
      logoBig: dark ? CREAM : SAGE, logoWord: dark ? CREAM : SAGE
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

  // Texte espacé (capitales de la marque) : dessiné lettre à lettre, sans dépendre de ctx.letterSpacing
  function spacedW(ctx, t, sp) { var w = 0; t = String(t); for (var i = 0; i < t.length; i++) w += ctx.measureText(t.charAt(i)).width; return w + sp * Math.max(0, t.length - 1); }
  function spacedText(ctx, t, x, y, sp, align) {
    t = String(t); var w = spacedW(ctx, t, sp), cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    var a = ctx.textAlign; ctx.textAlign = 'left';
    for (var i = 0; i < t.length; i++) { var ch = t.charAt(i); ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; }
    ctx.textAlign = a; return w;
  }
  // Capitales espacées tenant dans maxW : renvoie la taille retenue
  function fitSpaced(ctx, t, w0, size, minSize, sp, maxW) {
    for (var s = size; s > minSize; s -= 1) { ctx.font = sf(w0, s); if (spacedW(ctx, t, sp * s / size) <= maxW) return s; }
    ctx.font = sf(w0, minSize); return minSize;
  }

  /* --- Logo : deux ongles amande glacés (sauge + terracotta) et mot-symbole --- */
  function nailPath(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x + w * 0.5, y);
    ctx.bezierCurveTo(x + w * 0.88, y, x + w, y + h * 0.4, x + w, y + h * 0.66);
    ctx.bezierCurveTo(x + w, y + h * 0.9, x + w * 0.79, y + h, x + w * 0.5, y + h);
    ctx.bezierCurveTo(x + w * 0.21, y + h, x, y + h * 0.9, x, y + h * 0.66);
    ctx.bezierCurveTo(x, y + h * 0.4, x + w * 0.12, y, x + w * 0.5, y);
    ctx.closePath();
  }
  function drawNail(ctx, x, y, w, h, col) {
    ctx.save();
    ctx.shadowColor = 'rgba(30,34,24,0.22)'; ctx.shadowBlur = h * 0.1; ctx.shadowOffsetY = h * 0.04;
    nailPath(ctx, x, y, w, h);
    var g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, mix(col, '#FFFFFF', 0.78)); g.addColorStop(0.55, col); g.addColorStop(1, mix(col, '#1E2218', 0.8));
    ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.clip();
    // Reflet vernis
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + h * 0.36, w * 0.07, h * 0.24, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.ellipse(x + w * 0.62, y + h * 0.18, w * 0.12, h * 0.05, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function drawMark(ctx, x, y, h, th) {
    var w = h * 0.56, h2 = h * 0.8, w2 = h2 * 0.6;
    drawNail(ctx, x, y, w, h, th.logoBig);
    drawNail(ctx, x + w * 0.86, y + h - h2, w2, h2, TERRA);
    return w * 0.86 + w2;
  }
  // Logo horizontal centré en cx ; renvoie le bas
  function drawLockup(ctx, cx, top, th, draw, scale) {
    scale = scale || 1;
    var mh = Math.round(76 * scale), ws = Math.round(60 * scale), ss = Math.round(16 * scale), sp = 6.2 * scale;
    var markW = mh * 0.56 * 0.86 + mh * 0.8 * 0.6, gap = Math.round(20 * scale);
    ctx.font = '600 ' + ws + 'px ' + SERIF; var w1 = ctx.measureText('Sorelle').width;
    ctx.font = sf('400', ss); var w2 = spacedW(ctx, 'BIEN-ÊTRE', sp);
    var tw = Math.max(w1, w2), total = markW + gap + tw, x0 = cx - total / 2;
    if (draw) {
      drawMark(ctx, x0, top, mh, th);
      var tx = x0 + markW + gap + tw / 2;
      ctx.fillStyle = th.logoWord; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = '600 ' + ws + 'px ' + SERIF; ctx.fillText('Sorelle', tx, top + mh * 0.6);
      ctx.font = sf('400', ss); spacedText(ctx, 'BIEN-ÊTRE', tx, top + mh * 0.6 + ss * 1.9, sp, 'center');
      ctx.textAlign = 'left';
    }
    return top + mh;
  }
  // Logo empilé : symbole centré au-dessus du mot-symbole ; renvoie le bas (ligne de base de BIEN-ÊTRE)
  function drawLockupStack(ctx, cx, top, th, draw) {
    var mh = 56, ws = 52, ss = 16, sp = 6.2, markW = mh * 0.56 * 0.86 + mh * 0.8 * 0.6;
    var yS = top + mh + 12 + Math.round(ws * 0.72), yB = yS + Math.round(ss * 1.9);
    if (draw) {
      drawMark(ctx, cx - markW / 2, top, mh, th);
      ctx.fillStyle = th.logoWord; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = '600 ' + ws + 'px ' + SERIF; ctx.fillText('Sorelle', cx, yS);
      ctx.font = sf('400', ss); spacedText(ctx, 'BIEN-ÊTRE', cx, yB, sp, 'center');
      ctx.textAlign = 'left';
    }
    return yB;
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
  // « Afficher le mois » (réglage du studio) : « Mardi 4 novembre » ou « Mardi 4 »
  function storyDayLabel(d, mois) { return mois === false ? dayNum(d) : cap1(dayLong(d)); }
  function storyDayShort(d, mois) { return mois === false ? cap1(JOURS_C[wd(d)]) + ' ' + dp(d).j : cap1(dayShort(d)); }
  function flatDays(days) { var out = []; days.forEach(function (d) { d.groups.forEach(function (g) { out = out.concat(g.items); }); }); return out; }

  // Mise en page LISTE : jour (titre + filet), praticienne (capitales espacées), heures en grille régulière
  function layoutList(ctx, m, items, f, capLines) {
    var days = storyDays(items), multi = m.pids.length > 1;
    var ch = Math.round(f * 1.52), gap = Math.round(f * 0.24), padx = Math.round(f * 0.42);
    var hs = Math.round(f * 1.06), ls = Math.max(20, Math.round(f * 0.48));
    ctx.font = sf('500', f);
    var tw = Math.ceil(ctx.measureText('10h45').width) + padx * 2;
    var cols = Math.max(1, Math.floor((CW + gap) / (tw + gap))), cw = (CW - gap * (cols - 1)) / cols;
    var ops = [], y = 0, hidden = 0;
    days.forEach(function (d, di) {
      if (di) y += Math.round(f * 1.0);
      // Un seul jour dans la story : la date est déjà dans le surtitre
      if (!m.oneDay) {
        ops.push({ t: 'day', y: y, text: storyDayLabel(d.date, m.style.mois), rel: rel(d.date), size: hs });
        y += Math.round(hs * m.F.k * 0.95) + Math.round(f * 0.34);
        ops.push({ t: 'rule', y: y });
        y += Math.round(f * 0.5);
      }
      d.groups.forEach(function (g, gi) {
        if (gi) y += Math.round(f * 0.55);
        if (multi) { ops.push({ t: 'lab', y: y, pid: g.pid, size: ls }); y += Math.round(ls * 1.85); }
        var list = g.items, n = list.length, lines = Math.ceil(n / cols), plus = 0;
        if (capLines && lines > capLines) { lines = capLines; plus = n - (capLines * cols - 1); list = list.slice(0, capLines * cols - 1); hidden += plus; }
        list.forEach(function (it, i) {
          ops.push({ t: 'slot', x: (i % cols) * (cw + gap), y: y + Math.floor(i / cols) * (ch + gap), w: cw, h: ch, text: hfr(it.debut), f: f });
        });
        if (plus) { var i2 = list.length; ops.push({ t: 'slot', x: (i2 % cols) * (cw + gap), y: y + Math.floor(i2 / cols) * (ch + gap), w: cw, h: ch, text: '+' + plus, f: f, more: true }); }
        y += lines * ch + (lines - 1) * gap;
      });
    });
    return { h: y, ops: ops, hidden: hidden };
  }

  // Mise en page AGENDA : une colonne par jour (sous-colonnes par praticienne), heures complètes empilées
  // dans l'ordre chronologique, en deux temps (matin, après-midi) alignés d'une colonne à l'autre
  function layoutAgenda(ctx, m, items, f) {
    var days = storyDays(items), pids = m.pids, multi = pids.length > 1, u = U(), single = !!m.oneDay;
    var cols = [];
    days.forEach(function (d, di) { pids.forEach(function (pid, pi) { var g = d.groups.filter(function (x) { return x.pid === pid; })[0]; cols.push({ date: d.date, di: di, pi: pi, pid: pid, items: g ? g.items : [] }); }); });
    var n = cols.length, nd = days.length, np = pids.length;
    if (!n || n > 6) return { h: 1e9, ops: [] };
    var P = Math.round(f * 0.66), dg = Math.round(f * (np > 1 ? 0.62 : 0.4)), pg = Math.round(f * 0.24);
    var gridW = CW - 2 * P, dayW = (gridW - dg * (nd - 1)) / nd, cw = (dayW - pg * (np - 1)) / np;
    var tokPad = Math.round(f * 0.38), tokH = Math.round(f * 1.46), tg = Math.round(f * 0.22);
    ctx.font = sf('500', f);
    var tokW = Math.ceil(ctx.measureText('10h45').width) + tokPad * 2;
    if (tokW > cw) return { h: 1e9, ops: [] };
    var maxFit = Math.max(1, Math.floor((cw + tg) / (tokW + tg)));
    cols.forEach(function (c) { c.h = [[], []]; c.items.forEach(function (it) { c.h[u.toMin(it.debut) >= 720 ? 1 : 0].push(it); }); });
    var has = [0, 1].map(function (k) { return cols.some(function (c) { return c.h[k].length; }); }), both = has[0] && has[1];
    function colX(c) { return c.di * (dayW + dg) + c.pi * (cw + pg); }
    // En-têtes de jour : sur une ligne si possible, sinon « Mar. » / « 24 nov. »
    var dsz = Math.round(f * 0.84), dLines = 1;
    if (!single) {
      ctx.font = tf(m.F, dsz);
      days.forEach(function (d) { if (ctx.measureText(storyDayShort(d.date, m.style.mois)).width > dayW - 8) dLines = 2; });
    }
    function build(pl) {
      var ops = [], y = P, top = P;
      if (!single) {
        days.forEach(function (d, di) {
          var t = storyDayShort(d.date, m.style.mois), sp = t.indexOf(' ');
          ops.push({ t: 'hday', x: di * (dayW + dg), y: y, w: dayW, size: dsz, lines: dLines === 2 ? [t.slice(0, sp), t.slice(sp + 1)] : [t] });
        });
        y += Math.round(dLines === 2 ? dsz * 0.66 + dsz * m.F.k * 1.06 : dsz * m.F.k * 1.08);
      }
      var pTop = y;
      if (multi) {
        var psz = Math.max(17, Math.round(f * (single ? 0.52 : 0.4)));
        y += single ? 0 : Math.round(f * 0.22);
        cols.forEach(function (c) { ops.push({ t: 'hpid', x: colX(c), y: y, w: cw, size: psz, pid: c.pid }); });
        y += Math.round(psz * 1.75);
      }
      y += Math.round(f * 0.34);
      ops.push({ t: 'hline', y: y });
      var gridTop = y;
      y += Math.round(f * 0.5);
      [0, 1].forEach(function (k) {
        if (!has[k]) return;
        if (both) {
          var ls = Math.max(16, Math.round(f * 0.4));
          if (k === 1) y += Math.round(f * 0.45);
          ops.push({ t: 'sec', y: y, size: ls, text: k ? 'APRÈS-MIDI' : 'MATIN' });
          y += Math.round(ls * 1.9);
        }
        var rows = Math.max.apply(null, cols.map(function (c) { return Math.ceil(c.h[k].length / pl); }));
        cols.forEach(function (c) {
          var list = c.h[k], x0 = colX(c);
          if (!list.length) { ops.push({ t: 'dash', x: x0, y: y, w: cw, h: tokH }); return; }
          var w = pl === 1 ? Math.min(cw, Math.round(tokW * 1.7)) : (cw - tg * (pl - 1)) / pl, off = pl === 1 ? (cw - w) / 2 : 0;
          list.forEach(function (it, i) {
            ops.push({ t: 'tok', x: x0 + off + (i % pl) * (w + tg), y: y + Math.floor(i / pl) * (tokH + tg), w: w, h: tokH, f: f, pid: c.pid, text: hfr(it.debut) });
          });
        });
        y += rows * tokH + (rows - 1) * tg;
      });
      // Filets verticaux : entre deux jours (sur toute la hauteur), entre praticiennes d'un même jour (plus légers)
      var vl = [];
      for (var di = 1; di < nd; di++) vl.push({ t: 'vline', x: di * (dayW + dg) - dg / 2, y: top, h: y - top, strong: true });
      if (np > 1) days.forEach(function (d, di2) { for (var pi = 1; pi < np; pi++) vl.push({ t: 'vline', x: di2 * (dayW + dg) + pi * (cw + pg) - pg / 2, y: gridTop + Math.round(f * 0.3), h: y - gridTop - Math.round(f * 0.3) }); });
      return { h: y + P, ops: vl.concat(ops) };
    }
    var L = null;
    for (var pl = 1; pl <= maxFit; pl++) { L = build(pl); if (L.h <= (m.agAvail || 1e9)) return L; }
    return L;
  }

  function layoutFor(m) { return m.layout === 'agenda' ? layoutAgenda : layoutList; }
  // Une seule page si possible ; sinon une page par groupe de jours (jamais de texte coupé) ;
  // « +N » seulement si un jour seul ne tient pas, même en petit.
  function paginate(ctx, m, items, avail) {
    var lay = layoutFor(m), ag = m.layout === 'agenda', fMax = ag ? 46 : 54, fMin = ag ? 30 : 32, fAbs = 26;
    function best(list, lo, cap) {
      for (var f = fMax; f >= lo; f -= 2) { var L = lay(ctx, m, list, f, cap); if (L.h <= avail) return { f: f, L: L }; }
      return null;
    }
    // Agenda : heures toujours complètes ; la mise en page s'adapte à la hauteur disponible
    m.agAvail = avail;
    function bestAg(list, lo) { return best(list, lo); }
    var one = bestAg(items, fMin);
    if (one) return [{ items: items, f: one.f, L: one.L }];
    var days = storyDays(items), pages = [], cur = [];
    days.forEach(function (d) {
      var its = flatDays([d]), t = cur.concat(its);
      if (cur.length && !bestAg(t, ag ? fMin : 36)) { pages.push(cur); cur = its; } else cur = t;
    });
    if (cur.length) pages.push(cur);
    return pages.map(function (p) {
      var r = bestAg(p, fMin) || bestAg(p, fAbs);
      if (!r && !ag) for (var cap = 8; cap >= 1 && !r; cap--) r = best(p, fMin, cap);
      if (!r) r = { f: fAbs, L: lay(ctx, m, p, fAbs, ag ? null : 1) };
      return { items: p, f: r.f, L: r.L };
    });
  }

  function drawAvatar(ctx, m, pid, cx, cy, r, ring, ringCol) {
    var im = m.imgs[pid], col = pc(pid);
    ctx.save();
    if (ring) { ctx.fillStyle = ringCol || col; ctx.beginPath(); ctx.arc(cx, cy, r + ring, 0, Math.PI * 2); ctx.fill(); }
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    if (im) { ctx.clip(); var d = r * 2; ctx.translate(cx - r, cy - r); coverDraw(ctx, im, d, d); }
    else {
      ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = inkOn(col); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '600 ' + Math.round(r * 1.1) + 'px ' + SERIF; ctx.fillText((pn(pid) || '?').charAt(0).toUpperCase(), cx, cy + r * 0.06);
    }
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // En-tête : logo, surtitre, titre, filet, sous-titre, légende ; renvoie le haut de la zone de contenu
  function head(ctx, m, th, draw, pi, np) {
    // Logo empilé : même encombrement vertical que le logo à côté (même mise en page en dessous)
    var stack = m.style.logo === 'dessus';
    var y = stack ? drawLockupStack(ctx, SW / 2, 172, th, draw) : drawLockup(ctx, SW / 2, 214, th, draw);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    if (draw && np > 1) { ctx.fillStyle = th.sub; ctx.font = sf('500', 24); spacedText(ctx, (pi + 1) + ' / ' + np, SW - SX, 262, 2, 'right'); }
    y += stack ? 290 + 74 - y : 74;
    var kick = String(m.kicker || '').toUpperCase();
    if (kick) {
      var ks = fitSpaced(ctx, kick, '500', 25, 17, 6, CW);
      if (draw) { ctx.font = sf('500', ks); ctx.fillStyle = th.kick; spacedText(ctx, kick, SW / 2, y, 6 * ks / 25, 'center'); }
      y += 30;
    }
    var ved = m.layout === 'vedette';
    if (ved) {
      var r = 104; y += 30;
      if (draw) drawAvatar(ctx, m, m.vedette, SW / 2, y + r, r, 6, th.dark ? rgba(CREAM, 0.9) : '#FFFDF8');
      y += 2 * r + 16;
    }
    var tFn = function (s) { return tf(m.F, s); }, tMax = ved ? 84 : m.layout === 'agenda' ? 98 : 108;
    var T = fitText(ctx, m.texts.titre, tFn, tMax, 76, CW, 1);
    if (T.lines.length > 1 || T.size < 76) T = fitText(ctx, m.texts.titre, tFn, tMax, 56, CW, 2);
    var asc = Math.round(T.size * m.F.k * 0.86), lhT = Math.round(T.size * m.F.k * 1.04);
    y += 8;
    T.lines.forEach(function (l, i) { if (draw) { ctx.font = tf(m.F, T.size); ctx.fillStyle = th.text; ctx.textAlign = 'center'; ctx.fillText(l, SW / 2, y + asc + i * lhT); ctx.textAlign = 'left'; } });
    y += asc + (T.lines.length - 1) * lhT + 30;
    if (draw) { ctx.fillStyle = th.deco; ctx.fillRect(SW / 2 - 28, y, 56, 3); }
    y += 3;
    if (m.texts.sous) {
      var S2 = fitText(ctx, m.texts.sous, function (s) { return sf('400', s); }, 36, 27, CW - 40, 2), lh = Math.round(S2.size * 1.32);
      y += 26;
      S2.lines.forEach(function (l, i) { if (draw) { ctx.font = sf('400', S2.size); ctx.fillStyle = th.sub; ctx.textAlign = 'center'; ctx.fillText(l, SW / 2, y + Math.round(S2.size * 0.92) + i * lh); ctx.textAlign = 'left'; } });
      y += Math.round(S2.size * 0.92) + (S2.lines.length - 1) * lh;
    }
    var withPh = m.style.photos && m.pids.some(function (p) { return m.imgs[p]; });
    if (!ved && m.layout !== 'agenda' && withPh) {
      // Légende des praticiennes, centrée : point de couleur (ou photo) et nom en capitales espacées
      y += 34;
      var hL = withPh ? 64 : 30, gapL = 44, parts = m.pids.map(function (p) {
        ctx.font = sf('500', 23); var w = spacedW(ctx, pn(p).toUpperCase(), 4.5);
        return { pid: p, w: w + (withPh ? hL + 14 : 26) };
      });
      var tot = parts.reduce(function (a, p) { return a + p.w; }, 0) + gapL * (parts.length - 1), x = SW / 2 - tot / 2;
      if (draw) parts.forEach(function (p) {
        var cy = y + hL / 2;
        if (withPh) drawAvatar(ctx, m, p.pid, x + hL / 2, cy, hL / 2 - 3, 3, pc(p.pid));
        else { ctx.fillStyle = pc(p.pid); ctx.beginPath(); ctx.arc(x + 8, cy, 8, 0, Math.PI * 2); ctx.fill(); if (th.dark) { ctx.strokeStyle = rgba(CREAM, 0.6); ctx.lineWidth = 2; ctx.stroke(); } }
        ctx.font = sf('500', 23); ctx.fillStyle = th.text; spacedText(ctx, pn(p.pid).toUpperCase(), x + (withPh ? hL + 14 : 26), cy + 8, 4.5, 'left');
        x += p.w + gapL;
      });
      y += hL;
    }
    return y + 52;
  }
  // Pied : appel à l'action + adresse ; renvoie le bas de la zone de contenu
  function foot(ctx, m, th, draw) {
    var C = fitText(ctx, m.texts.cta, function (s) { return sf('500', s); }, 36, 27, CW - 120, 2);
    var lh = Math.round(C.size * 1.3), h = C.lines.length * lh + 58;
    var addr = m.style.adresse && m.adresse, bottom = addr ? 1632 : 1676, top = bottom - h;
    if (draw) {
      ctx.fillStyle = th.accent; rrect(ctx, SX, top, CW, h, 10); ctx.fill();
      ctx.fillStyle = th.ctaText; ctx.font = sf('500', C.size); ctx.textAlign = 'center';
      C.lines.forEach(function (l, i) { ctx.fillText(l, SW / 2, top + 29 + Math.round(C.size * 0.9) + i * lh); });
      if (addr) {
        var A = String(m.adresse).toUpperCase(), as = fitSpaced(ctx, A, '400', 21, 15, 3.5, CW);
        ctx.font = sf('400', as); ctx.fillStyle = th.sub;
        spacedText(ctx, A, SW / 2, bottom + 50, 3.5 * as / 21, 'center');
      }
      ctx.textAlign = 'left';
    }
    return top - 48 - (m.lien ? 190 : 0);
  }

  function drawBg(ctx, m, th) {
    var s = m.style;
    if (s.fond === 'photo' && th.photo) {
      ctx.drawImage(blurred(m.S), 0, 0, SW, SH);
      ctx.fillStyle = rgba(s.voile, s.voileOp); ctx.fillRect(0, 0, SW, SH);
      var g = ctx.createLinearGradient(0, 0, 0, SH);
      g.addColorStop(0, rgba(s.voile, 0.35)); g.addColorStop(0.32, rgba(s.voile, 0)); g.addColorStop(0.72, rgba(s.voile, 0)); g.addColorStop(1, rgba(s.voile, 0.45));
      ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
    } else if (s.fond === 'degrade' || s.fond === 'photo') {
      var gr = ctx.createLinearGradient(0, 0, 0, SH);
      gr.addColorStop(0, th.bg); gr.addColorStop(1, th.bg2);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, SW, SH);
      var rg = ctx.createRadialGradient(SW / 2, 300, 40, SW / 2, 300, 900);
      rg.addColorStop(0, rgba('#FFFFFF', th.dark ? 0.07 : 0.22)); rg.addColorStop(1, rgba('#FFFFFF', 0));
      ctx.fillStyle = rg; ctx.fillRect(0, 0, SW, SH);
    } else { ctx.fillStyle = th.bg; ctx.fillRect(0, 0, SW, SH); }
  }

  function drawContent(ctx, m, th, pg, top) {
    var L = pg.L;
    if (m.layout === 'agenda') {
      var x0 = SX, y0 = top;
      ctx.save();
      ctx.shadowColor = 'rgba(30,34,24,' + (th.dark ? 0.28 : 0.1) + ')'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 12;
      ctx.fillStyle = th.card; rrect(ctx, x0, y0, CW, L.h, 18); ctx.fill();
      ctx.restore();
      if (!th.dark) { ctx.strokeStyle = th.cardLine; ctx.lineWidth = 1.5; rrect(ctx, x0, y0, CW, L.h, 18); ctx.stroke(); }
      var P = Math.round(pg.f * 0.66), ix = x0 + P, iw = CW - 2 * P;
      L.ops.forEach(function (o) {
        if (o.t === 'hday') {
          var cx = ix + o.x + o.w / 2, by = y0 + o.y + Math.round(o.size * m.F.k * 0.8);
          ctx.fillStyle = th.cardInk; ctx.textAlign = 'center';
          if (o.lines.length === 1) {
            var D = fitText(ctx, o.lines[0], function (s) { return tf(m.F, s); }, o.size, 18, o.w - 4, 1);
            ctx.font = tf(m.F, D.size); ctx.fillText(D.lines[0], cx, by);
          } else {
            var D1 = fitText(ctx, o.lines[1], function (s) { return tf(m.F, s); }, o.size, 18, o.w - 4, 1);
            ctx.font = sf('500', Math.round(o.size * 0.56)); ctx.fillStyle = th.cardSub;
            spacedText(ctx, o.lines[0].toUpperCase(), cx, y0 + o.y + Math.round(o.size * 0.5), o.size * 0.08, 'center');
            ctx.font = tf(m.F, D1.size); ctx.fillStyle = th.cardInk; ctx.fillText(D1.lines[0], cx, y0 + o.y + Math.round(o.size * 0.66 + o.size * m.F.k * 0.8));
          }
          ctx.textAlign = 'left';
        } else if (o.t === 'hpid') {
          var nm = pn(o.pid).toUpperCase(), sp0 = o.size * 0.18, s0 = fitSpaced(ctx, nm, '500', o.size, 13, sp0, o.w - o.size * 1.3);
          var sp = sp0 * s0 / o.size, tw = spacedW(ctx, nm, sp), col = pc(o.pid), cx2 = ix + o.x + o.w / 2, cy = y0 + o.y + s0;
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx2 - (tw + s0 * 0.85) / 2 + s0 * 0.24, cy - s0 * 0.36, s0 * 0.24, 0, Math.PI * 2); ctx.fill();
          ctx.font = sf('500', s0); ctx.fillStyle = mix(col, INK, 0.55); spacedText(ctx, nm, cx2 + s0 * 0.42, cy, sp, 'center');
        } else if (o.t === 'hline') {
          ctx.fillStyle = rgba(INK, 0.28); ctx.fillRect(ix, y0 + o.y - 0.75, iw, 1.5);
        } else if (o.t === 'vline') {
          ctx.fillStyle = o.strong ? rgba(INK, 0.13) : rgba(INK, 0.07); ctx.fillRect(ix + o.x - 0.75, y0 + o.y, 1.5, o.h);
        } else if (o.t === 'sec') {
          ctx.font = sf('500', o.size); ctx.fillStyle = mix(TERRA, INK, 0.75);
          var sw = spacedW(ctx, o.text, o.size * 0.28);
          ctx.fillStyle = th.card; ctx.fillRect(ix - 2, y0 + o.y - 4, sw + o.size * 0.8, o.size * 1.3);
          ctx.fillStyle = mix(TERRA, INK, 0.75); spacedText(ctx, o.text, ix, y0 + o.y + o.size * 0.85, o.size * 0.28, 'left');
          ctx.fillStyle = rgba(INK, 0.08); ctx.fillRect(ix + sw + o.size * 0.8, y0 + o.y + o.size * 0.5, iw - sw - o.size * 0.8, 1.5);
        } else if (o.t === 'dash') {
          ctx.fillStyle = rgba(INK, 0.2); ctx.fillRect(ix + o.x + o.w / 2 - 12, y0 + o.y + o.h / 2 - 1, 24, 2);
        } else if (o.t === 'tok') {
          var c2 = pc(o.pid);
          ctx.fillStyle = mix(c2, th.card, 0.15); rrect(ctx, ix + o.x, y0 + o.y, o.w, o.h, Math.round(o.h / 2)); ctx.fill();
          ctx.strokeStyle = rgba(c2, 0.32); ctx.lineWidth = 1.5; rrect(ctx, ix + o.x + 0.75, y0 + o.y + 0.75, o.w - 1.5, o.h - 1.5, Math.round(o.h / 2)); ctx.stroke();
          ctx.font = sf('500', o.f); ctx.fillStyle = th.cardInk; ctx.textAlign = 'center';
          ctx.fillText(o.text, ix + o.x + o.w / 2, y0 + o.y + o.h / 2 + o.f * 0.35); ctx.textAlign = 'left';
        }
      });
      return;
    }
    L.ops.forEach(function (o) {
      var y = top + o.y;
      if (o.t === 'day') {
        var asc = Math.round(o.size * m.F.k * 0.8), kx = SX;
        if (o.rel) {
          var rs = Math.round(o.size * 0.36); ctx.font = sf('500', rs); ctx.fillStyle = th.kick;
          kx = SX + spacedText(ctx, o.rel.toUpperCase(), SX, y + asc, rs * 0.22, 'left') + rs * 1.1;
          ctx.fillStyle = th.deco; ctx.beginPath(); ctx.arc(kx - rs * 0.55, y + asc - rs * 0.36, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        var D = fitText(ctx, o.text, function (s) { return tf(m.F, s); }, o.size, 20, CW - (kx - SX), 1);
        ctx.font = tf(m.F, D.size); ctx.fillStyle = th.text; ctx.fillText(D.lines[0], kx, y + asc);
        return;
      }
      if (o.t === 'rule') { ctx.fillStyle = th.faint; ctx.fillRect(SX, y, CW, 1.5); return; }
      if (o.t === 'lab') {
        var nm = pn(o.pid).toUpperCase();
        ctx.fillStyle = pc(o.pid); ctx.beginPath(); ctx.arc(SX + o.size * 0.3, y + o.size * 0.62, o.size * 0.3, 0, Math.PI * 2); ctx.fill();
        if (th.dark) { ctx.strokeStyle = rgba(CREAM, 0.55); ctx.lineWidth = 1.5; ctx.stroke(); }
        ctx.font = sf('500', o.size); ctx.fillStyle = th.sub; spacedText(ctx, nm, SX + o.size * 1.0, y + o.size * 0.98, o.size * 0.2, 'left');
        return;
      }
      var x0 = SX + o.x;
      ctx.fillStyle = o.more ? 'transparent' : th.chip; rrect(ctx, x0, y, o.w, o.h, Math.round(o.h * 0.18)); ctx.fill();
      ctx.strokeStyle = th.chipLine; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = o.more ? th.sub : th.text; ctx.font = sf('500', o.f); ctx.textAlign = 'center';
      ctx.fillText(o.text, x0 + o.w / 2, y + o.h / 2 + o.f * 0.35); ctx.textAlign = 'left';
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
      F: fontBy(S.style.font), texts: S.textsEff, lien: S.mode === 'lien', kicker: kickerOf(items, S.src && S.src.per), oneDay: itemDays(items).length === 1,
      salon: (c.salon && c.salon.nom) || 'Sorelle Bien-Être', adresse: (c.salon && c.salon.adresse) || ''
    };
    var th = effTheme(S);
    var meas = document.createElement('canvas').getContext('2d');
    var top = head(meas, m, th, false, 0, 1), bottom = foot(meas, m, th, false);
    var avail = Math.max(200, bottom - top);
    var pages = paginate(meas, m, items, avail);
    return pages.map(function (pg, pi) {
      var cv = document.createElement('canvas'); cv.width = SW; cv.height = SH;
      var ctx = cv.getContext('2d');
      drawBg(ctx, m, th);
      var t = head(ctx, m, th, true, pi, pages.length);
      // Peu d'heures : bloc centré dans l'espace libre
      var spare = (bottom - t) - pg.L.h;
      drawContent(ctx, m, th, pg, t + (spare > 0 ? Math.min(Math.round(spare / 2), 160) : 0));
      foot(ctx, m, th, true);
      cv.setAttribute('data-items', String(pg.items.length - (pg.L.hidden || 0)));
      return cv;
    });
  }

  /* --- Textes par défaut --- */
  function itemDays(items) { var d = []; items.forEach(function (it) { if (d.indexOf(it.date) < 0) d.push(it.date); }); return d.sort(); }
  function kickerOf(items, per) {
    var days = itemDays(items);
    if (!days.length) return '';
    if (days.length === 1) return dayLong(days[0]);
    var a = dp(days[0]), b = dp(days[days.length - 1]);
    if (contiguous(days) || per === 'semaine') return a.m === b.m ? 'Du ' + a.j + ' au ' + b.j + ' ' + MOIS[b.m - 1] : 'Du ' + a.j + ' ' + MOIS_C[a.m - 1] + ' au ' + b.j + ' ' + MOIS_C[b.m - 1];
    if (a.m === b.m && days.length <= 6) return days.map(function (d) { return dp(d).j; }).join(' · ') + ' ' + MOIS[a.m - 1];
    return plural(days.length, 'jour') + ' de disponibilités';
  }
  function defTexts(S) {
    var src = S.src, t = G.today(), u = U(), days = itemDays(S.items);
    var titre = 'Places disponibles';
    if (src.per === 'auj' || (days.length === 1 && days[0] === t)) titre = 'Dernière minute';
    else if (src.per === 'demain' || (days.length === 1 && days[0] === u.addDays(t, 1))) titre = 'Places pour demain';
    else if (src.per === 'semaine') titre = 'La semaine prochaine';
    else if (days.length > 1) titre = 'Nos places disponibles';
    var pids = []; S.items.forEach(function (it) { if (pids.indexOf(it.praticienne) < 0) pids.push(it.praticienne); });
    pids.sort(pratOrder);
    var who = pids.map(pn).join(' et ');
    var sous = S.style.layout === 'vedette' ? 'Ses prochaines places libres' : (pids.length > 1 ? 'Avec ' + who + ', sur rendez-vous' : 'Avec ' + who + ', sur rendez-vous');
    var cta = S.mode === 'lien' ? 'Réserve en une minute avec le lien' : 'Réponds à cette story pour réserver';
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
    if (S.items.length > OFFRE_MAX) return Promise.resolve(null);
    if (S.offre && !S.offreStale) return Promise.resolve(S.offre);
    if (S.offreP) return S.offreP;
    var c = cfg() || {}, u = U(), step = stepMin(), items = S.items.slice(0, OFFRE_MAX);
    if (!items.length) return Promise.resolve(null);
    computeTexts(S);
    var payload = {
      // Chaque créneau = une heure de début précise (fenêtre d'un pas), revérifiée à la réservation
      creneaux: items.map(function (x) {
        var fin = Math.min(u.toMin(x.fin || x.debut) || 0, u.toMin(x.debut) + step);
        if (!(fin > u.toMin(x.debut))) fin = u.toMin(x.debut) + step;
        return { praticienne: x.praticienne, date: x.date, debut: x.debut, fin: u.toHHMM(fin) };
      }),
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
    if (!items.length) { toast('Gardez au moins une heure.', 'err'); return; }
    ensureCss();
    if (STU && !STU.closed) { try { STU.panel.close(); } catch (e) { /* ignore */ } }
    var c = cfg() || {}, so = c.story || {};
    var S = { src: src, items: items, style: normStyle(so.style), texts: {}, mode: so.mode === 'lien' ? 'lien' : 'message', page: 0, pages: [],
      imgs: {}, bgImg: null, offre: null, offreStale: true, changed: false, closed: false, dirtyStyle: false, adv: false, ready: false };
    STU = S;
    var root = document.createElement('div');
    root.className = 'mod-magie mg-studio';
    S.root = root;
    S.panel = G.panel({ title: 'Story Instagram', size: 'wide', content: root, onClose: function () { S.closed = true; if (S.dirtyStyle) saveStyle(S); } });
    if (S.panel && S.panel.el) { S.panel.el.style.padding = '0'; }
    computeTexts(S);
    renderStudio(S);
    bindStudio(S);
    // Polices de la marque d'abord (repli Georgia après 3,5 s), puis police choisie
    Promise.all([brandFonts(), loadFont(S.style.font)]).then(function () { if (S.closed) return; S.ready = true; draw(S); });
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
    if (S.closed || !S.ready) return;
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
      var shown = S.pages.reduce(function (a, p) { return a + (+p.getAttribute('data-items') || 0); }, 0);
      var n = S.style.layout === 'vedette' ? shown : S.items.length;
      nt.textContent = plural(n, 'heure', 'heures') + ' · ' + (S.pages.length > 1 ? S.pages.length + ' stories, à publier à la suite' : '1 story') + (S.style.layout !== 'vedette' && shown < S.items.length ? ' · ' + (S.items.length - shown) + ' en « +N »' : '');
    }
    setFoot(S);
  }
  // Ne remplace le pied que s'il change (un remplacement pendant un tap annulerait le clic)
  function setFoot(S) { var f = S.root && S.root.querySelector('.mg-foot'); if (!f) return; var h = footStudio(S); if (f.getAttribute('data-h') !== h) { f.innerHTML = h; f.setAttribute('data-h', h); } }

  function footStudio(S) {
    var share = canShare(), n = S.pages.length, h = '';
    var tooMany = S.mode === 'lien' && S.items.length > OFFRE_MAX;
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
    if (S.items.length > OFFRE_MAX) {
      var nIdeal = S.items.filter(function (x) { return x.ideal; }).length;
      return '<div class="mg-warn" role="alert">Le lien éclair accepte ' + OFFRE_MAX + ' heures au maximum (' + S.items.length + ' choisies).' +
        (nIdeal && nIdeal <= OFFRE_MAX ? ' <button type="button" class="mg-link" data-s="keepideal">Garder les ' + nIdeal + ' heures conseillées</button>' : ' Retirez des heures dans la liste.') + '</div>';
    }
    if (S.offreErr) return '<div class="mg-warn" role="alert">' + esc(S.offreErr) + ' <button type="button" class="mg-link" data-s="offre-retry">Réessayer</button></div>';
    if (!S.offre || S.offreBusy) return '<p class="mg-help"><span class="mg-busy"><span class="mg-spin"></span>Préparation du lien…</span></p>';
    var c = cfg() || {}, h = (c.story && +c.story.dureeLien) || 24;
    return '<div class="mg-linkbox"><input class="mg-inp" readonly data-s="url" aria-label="Lien de réservation" value="' + esc(offerUrl(S.offre.token)) + '"><button type="button" class="mg-btn" data-s="copy">' + ic('copy') + 'Copier</button></div>' +
      '<div class="mg-steps" aria-label="Dans Instagram"><span>Dans Instagram :</span><b>Sticker</b><span>→</span><b>Lien</b><span>→</span><b>Coller</b></div>' +
      '<p class="mg-help">Valable ' + h + ' h. Le lien reste le même quand vous mettez la story à jour ; une heure réservée s\'affiche « Réservé ».</p>';
  }
  function updLink(S) { var b = S.root && S.root.querySelector('[data-box="link"]'); if (b) { var h = linkHTML(S); if (b.getAttribute('data-h') !== h) { b.innerHTML = h; b.setAttribute('data-h', h); } } setFoot(S); }

  function renderStudio(S) {
    S.root.innerHTML = '<div class="mg-pad"><div data-box="banner"></div><div class="mg-st"><div class="mg-prev"><div class="mg-cv"><div class="mg-load"><span class="mg-spin"></span></div></div><div class="mg-pager"></div><p class="mg-note"></p></div>' +
      '<div class="mg-ctl"></div></div></div><div class="mg-foot"></div>' +
      '<input type="file" accept="image/*" class="mg-file" data-s="file" tabindex="-1" aria-hidden="true">';
    renderCtl(S);
  }
  function swRow(S, k, label, list) {
    var th = themeBy(S.style.theme), e = effTheme(S);
    var cur = S.style[k] || (k === 'bg' ? e.bg : k === 'text' ? e.text : k === 'voile' ? S.style.voile : e.accent);
    return '<div class="mg-colrow" role="group" aria-label="Couleur ' + label + '"><b>' + label + '</b>' + (list || SWATCHES).map(function (c) {
      var on = String(cur).toLowerCase() === c.toLowerCase();
      return '<button type="button" class="mg-sw' + (on ? ' on' : '') + '" data-s="sw" data-k="' + k + '" data-v="' + c + '" style="--c:' + c + '" aria-label="' + c + '" aria-pressed="' + on + '"><i></i></button>';
    }).join('') + '</div>';
  }
  function renderCtl(S) {
    var box = S.root.querySelector('.mg-ctl'); if (!box) return;
    var s = S.style, pids = []; S.items.forEach(function (it) { if (pids.indexOf(it.praticienne) < 0) pids.push(it.praticienne); }); pids.sort(pratOrder);
    var h = '';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-th">Thème</span><div class="mg-themes" role="group" aria-labelledby="mg-l-th">' + THEMES.map(function (t) {
      var on = s.theme === t.id, bg = t.fond === 'photo' ? (S.bgData ? 'linear-gradient(' + rgba(t.voile, 0.5) + ',' + rgba(t.voile, 0.5) + '),url(' + S.bgData + ') center/cover' : 'linear-gradient(180deg,' + t.bg + ',' + t.bg2 + ')') : t.fond === 'degrade' ? 'linear-gradient(180deg,' + t.bg + ',' + t.bg2 + ')' : t.bg;
      return '<button type="button" class="mg-th' + (on ? ' on' : '') + '" data-s="theme" data-v="' + t.id + '" aria-pressed="' + on + '" style="--tb:' + bg + ';--tt:' + t.text + ';--ta:' + TERRA + '"><i>Aa<b></b></i><span>' + esc(t.nom) + '</span></button>';
    }).join('') + '</div></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-lay">Mise en page</span><div class="mg-seg" role="group" aria-labelledby="mg-l-lay">' + LAYOUTS.map(function (l) {
      return '<button type="button" data-s="layout" data-v="' + l[0] + '" class="' + (s.layout === l[0] ? 'on' : '') + '" aria-pressed="' + (s.layout === l[0]) + '">' + l[1] + '</button>';
    }).join('') + '</div>';
    if (s.layout === 'agenda') h += '<p class="mg-help">Une colonne par jour (et par praticienne), heures en entier, matin puis après-midi.</p>';
    if (s.layout === 'vedette' && pids.length > 1) {
      var ved = pids.indexOf(s.vedette) >= 0 ? s.vedette : pids[0];
      h += '<div class="mg-seg" role="group" aria-label="Praticienne en avant" style="margin-top:8px">' + pids.map(function (pid) {
        return '<button type="button" data-s="vedette" data-v="' + esc(pid) + '" class="' + (ved === pid ? 'on' : '') + '" style="' + pStyle(pid) + '" aria-pressed="' + (ved === pid) + '"><span class="mg-dot"></span>' + esc(pn(pid)) + '</button>';
      }).join('') + '</div><p class="mg-help">Seules les heures de ' + esc(pn(ved)) + ' apparaissent.</p>';
    }
    if (s.layout === 'vedette' && !S.imgs[s.vedette && pids.indexOf(s.vedette) >= 0 ? s.vedette : pids[0]]) h += '<p class="mg-help">Pas encore de photo : ajoutez-la dans Réglages, Praticiennes. L\'initiale s\'affiche en attendant.</p>';
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
      return '<button type="button" class="mg-chip' + (on ? ' on' : '') + '" data-s="font" data-v="' + esc(F.n) + '" aria-pressed="' + on + '" style="font-family:\'' + F.n + '\',' + esc(F.fb) + '">' + esc(F.label) + '</button>';
    }).join('') + '</div></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-bg">Fond</span><div class="mg-seg" role="group" aria-labelledby="mg-l-bg">' +
      [['uni', 'Uni'], ['degrade', 'Dégradé'], ['photo', 'Photo']].map(function (x) { return '<button type="button" data-s="fond" data-v="' + x[0] + '" class="' + (s.fond === x[0] ? 'on' : '') + '" aria-pressed="' + (s.fond === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>';
    if (s.fond === 'photo') {
      h += '<div class="mg-photo"><button type="button" class="mg-btn" data-s="pickfile">' + ic('image') + (S.bgImg ? 'Changer de photo' : 'Choisir une photo') + '</button>' +
        (S.bgImg ? '<button type="button" class="mg-btn" data-s="rmfile">' + ic('trash') + 'Retirer</button>' : '') + '</div>' +
        (S.bgImg ? '' : '<p class="mg-help">En attendant la photo, le fond du thème est utilisé.</p>') +
        '<p class="mg-help">La photo reste sur cet appareil. Un voile aux couleurs de la marque garde le texte lisible.</p>' +
        '<div style="margin-top:10px">' + swRow(S, 'voile', 'Voile', VOILES) + '</div>' +
        '<label class="mg-slider">Voile<input type="range" min="0" max="85" step="5" data-s="voileOp" value="' + Math.round(s.voileOp * 100) + '" aria-label="Opacité du voile"><span data-o="voileOp">' + Math.round(s.voileOp * 100) + ' %</span></label>' +
        '<label class="mg-slider">Flou<input type="range" min="0" max="3" step="1" data-s="flou" value="' + s.flou + '" aria-label="Flou de la photo"><span data-o="flou">' + ['Aucun', 'Léger', 'Moyen', 'Fort'][s.flou] + '</span></label>';
    }
    h += '</div>';
    h += '<div class="mg-f"><span class="mg-lab">Couleurs de la marque</span>' + (s.fond !== 'photo' ? swRow(S, 'bg', 'Fond') : '') + swRow(S, 'text', 'Texte') + swRow(S, 'accent', 'Bouton') +
      '<button type="button" class="mg-link" data-s="resetcol">Couleurs du thème</button></div>';
    h += '<div class="mg-f"><span class="mg-lab" id="mg-l-logo">Logo</span><div class="mg-seg" role="group" aria-labelledby="mg-l-logo">' +
      [['cote', 'À côté'], ['dessus', 'Au-dessus']].map(function (x) { return '<button type="button" data-s="logo" data-v="' + x[0] + '" class="' + (s.logo === x[0] ? 'on' : '') + '" aria-pressed="' + (s.logo === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>';
    h += '<div class="mg-f"><label class="mg-tog"><input type="checkbox" data-s="photos"' + (s.photos ? ' checked' : '') + '>Afficher les photos des praticiennes</label>' +
      '<label class="mg-tog"><input type="checkbox" data-s="adresse"' + (s.adresse ? ' checked' : '') + '>Afficher l\'adresse</label>' +
      '<label class="mg-tog"><input type="checkbox" data-s="mois"' + (s.mois ? ' checked' : '') + '>Afficher le mois à côté du jour</label></div>';
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
        s.theme = th.id; s.bg = s.text = s.accent = null; s.fond = th.fond;
        if (th.voile) { s.voile = th.voile; s.voileOp = th.voileOp; }
        if (th.fond === 'photo' && !S.bgImg) pickFile(S);
        styleChanged(S, true); return;
      }
      if (a === 'layout') { S.style.layout = v; styleChanged(S, true); return; }
      if (a === 'logo') { S.style.logo = v === 'dessus' ? 'dessus' : 'cote'; styleChanged(S, true); return; }
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
      if (a === 'keepideal') {
        S.src.excl = S.src.excl || {};
        eachSlot(S.src, function (j, pid, c, k) { if (!c.ideal) S.src.excl[k] = true; });
        if (!S.src.closed) syncChips(S.src);
        S.items = checkedItems(S.src); S.offreStale = true; renderCtl(S); draw(S); ensureOffer(S); return;
      }
      if (a === 'copy') { if (S.offre) copyText(offerUrl(S.offre.token), 'Lien copié'); return; }
      if (a === 'offre-retry') { S.offreErr = null; ensureOffer(S); return; }
      if (a === 'share') { shareOrDownload(S, +v || 0); return; }
      if (a === 'refresh') {
        S.src.loadP.then(function () {
          if (S.closed) return;
          S.items = checkedItems(S.src); S.changed = false; S.offreStale = true; setBanner(S);
          if (!S.items.length) { toast('Plus aucune heure choisie.', 'info'); }
          renderCtl(S); draw(S);
          if (S.mode === 'lien' && S.items.length) ensureOffer(S).then(function (o) { if (o) toast('Story et lien mis à jour'); });
          else toast('Story mise à jour');
        });
      }
    });
    root.addEventListener('input', function (e) {
      var t = e.target, a = t.getAttribute('data-s'); if (!a) return;
      if (a === 'txt') { S.texts[t.getAttribute('data-k')] = t.value; draw(S, 120); return; }
      if (a === 'voileOp') { S.style.voileOp = (+t.value || 0) / 100; S.dirtyStyle = true; var o = root.querySelector('[data-o="voileOp"]'); if (o) o.textContent = t.value + ' %'; draw(S, 30); return; }
      if (a === 'flou') { S.style.flou = +t.value || 0; S.dirtyStyle = true; var o2 = root.querySelector('[data-o="flou"]'); if (o2) o2.textContent = ['Aucun', 'Léger', 'Moyen', 'Fort'][S.style.flou]; draw(S, 30); return; }
    });
    root.addEventListener('change', function (e) {
      var t = e.target, a = t.getAttribute('data-s'); if (!a) return;
      if (a === 'photos' || a === 'adresse' || a === 'mois') { S.style[a] = t.checked; styleChanged(S, false); return; }
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
      MCACHE = {};
      if (M && !M.closed) { M.changed = true; M.month = null; load(M); }
      if (STU && !STU.closed) { STU.changed = true; setBanner(STU); }
    });
    G.on('theme', function () { if (M && !M.closed) renderMain(M); if (STU && !STU.closed) renderCtl(STU); });
    G.on('config', function () {
      if (M && !M.closed) renderMain(M); // afficherPriorites / afficherRelances / affichage.heureFin : re-rendu sans recharger
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

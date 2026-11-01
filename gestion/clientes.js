/* Sorelle Bien-Être, interface de gestion : onglet « Nos clientes » + fiche cliente.
 * Module autonome (contrat window.G : docs/GESTION-V2-SPEC.md §1 et §4).
 */
(function () {
  'use strict';
  var G = window.G;
  if (!G || typeof G.register !== 'function') return;

  var ACTIVE = { confirme: 1, en_attente: 1 };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var JC = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var SITS = [['avenir', 'RDV à venir'], ['inactives', 'Inactives depuis plus de 90 jours']];
  var TRIS = [['derniere', 'Dernière visite'], ['visites', 'Nombre de visites'], ['prochain', 'Prochain RDV'], ['az', 'A → Z']];
  var STATUT = { confirme: ['Confirmé', 'ok'], en_attente: ['À valider', 'warn'], annule: ['Annulé', 'danger'], refuse: ['Refusé', 'danger'], absente: ['Absente', 'danger'] };
  var VUE_KEY = 'sorelle.gestion.clientesVue';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* appareil sans stockage */ } }
  var st = { q: '', prat: null, sit: 'tous', tri: 'derniere', n: 60, incOpen: false, vue: lsGet(VUE_KEY) === 'cartes' ? 'cartes' : 'liste' };
  var fp = null; // panneau des filtres ouvert {panel, el}
  var SVG = {
    filtre: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    liste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6" fill="currentColor"/><circle cx="4" cy="12" r=".6" fill="currentColor"/><circle cx="4" cy="18" r=".6" fill="currentColor"/></svg>',
    cartes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  var root = null, mounted = false, hooked = false, tok = 0, profils = null, err = null;
  var fiches = []; // fiches ouvertes {cle, panel, tok}
  var ficheUid = 0;

  /* ---------------- outils ---------------- */
  function U() { return G.U || (window.SorelleCore && window.SorelleCore._); }
  function esc(s) { return G.esc ? G.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(n) { try { return G.icon ? G.icon(n) : ''; } catch (e) { return ''; } }
  function today() { return G.today(); }
  function add(d, n) { return U().addDays(d, n); }
  function diff(a, b) { return U().diffDays(a, b); }
  function wd(d) { return U().weekday(d); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function nf(n, dec) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: dec || 0 }); }
  function pl(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }
  function dayNum(d) { var j = +d.slice(8, 10); return j === 1 ? '1er' : String(j); }
  function fDate(d) { return JC[wd(d)] + ' ' + dayNum(d) + ' ' + MOIS[+d.slice(5, 7) - 1]; }
  function fDateY(d) { return dayNum(d) + ' ' + MOIS[+d.slice(5, 7) - 1] + (d.slice(0, 4) !== today().slice(0, 4) ? ' ' + d.slice(0, 4) : ''); }
  function fLong(d) { return JOURS[wd(d)] + ' ' + dayNum(d) + ' ' + MOIS_L[+d.slice(5, 7) - 1]; }
  function fH(h) { if (!h) return ''; var p = h.split(':'); return (+p[0]) + 'h' + (p[1] === '00' ? '' : p[1]); }
  /** Heure d'un RDV selon le réglage Apparence (début seul par défaut, plage si activée). */
  function fHR(h, fin) { try { if (G.heure) return G.heure(h, fin); } catch (e) { /* repli */ } return fH(h); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function pcol(id) { try { return G.pratColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function pname(id) { try { return G.pratName(id) || id || ''; } catch (e) { return id || ''; } }
  function scol(id) { try { return G.svcColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function sname(id, c) { try { return G.svcName(id, c) || id; } catch (e) { return id; } }
  function tOn(hex) { try { return G.textOn(hex); } catch (e) { return '#fff'; } }
  function tint(hex, a) { try { return G.tint ? G.tint(hex, a) : hex; } catch (e) { return hex; } }
  function nomAff(p) { var n = String(p.nom || '').trim(); return n === '-' ? '' : n; }
  function fullName(p) { return ((p.prenom || '') + ' ' + nomAff(p)).trim() || 'Sans nom'; }
  function initials(p) { return ((p.prenom || '').charAt(0) + nomAff(p).charAt(0)).toUpperCase() || '?'; }
  function prats() { try { return G.prats() || []; } catch (e) { return []; } }
  function ago(d) {
    var n = diff(d, today());
    if (n <= 0) return n === 0 ? 'aujourd’hui' : 'dans ' + pl(-n, 'jour');
    if (n === 1) return 'hier';
    if (n < 14) return 'il y a ' + n + ' j';
    if (n < 60) return 'il y a ' + Math.round(n / 7) + ' sem.';
    if (n < 365) return 'il y a ' + Math.round(n / 30.4) + ' mois';
    var y = Math.floor(n / 365); return 'il y a ' + pl(y, 'an');
  }
  function inDays(d) { var n = diff(today(), d); return n === 0 ? 'aujourd’hui' : n === 1 ? 'demain' : n > 0 ? 'dans ' + n + ' j' : 'il y a ' + (-n) + ' j'; }

  /* ---------------- statut d'une cliente ---------------- */
  function prevue(p) { return p.habitude && p.habitude.prochaineVisitePrevue; }
  function inactive(p, t) { var last = p.derniere || p.premiere; return !p.aVenir && !!last && diff(last, t) > 90; }
  /** Fiche sans vrai nom de famille : vide, « - » ou une seule lettre (« B », « B. »). */
  function incomplete(p) { return String((p && p.nom) || '').replace(/[\s.\-'’]/g, '').length <= 1; }
  function matchStatut(p, s, t) {
    if (s === 'avenir') return p.aVenir > 0;
    if (s === 'inactives') return inactive(p, t);
    return true;
  }
  function pratFilter() { return st.prat || (G.filtre && (G.filtre.prat === 'laurie' || G.filtre.prat === 'lea') ? G.filtre.prat : 'tous'); }

  /* ---------------- CSS ---------------- */
  var CSS = [
    '.mod-clientes{container-type:inline-size;color:var(--text);font-family:Outfit,-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;box-sizing:border-box}',
    '.mod-clientes *{box-sizing:border-box}',
    '.mod-clientes button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.mod-clientes input,.mod-clientes select{font:inherit;font-size:16px;color:var(--text)}',
    '.mod-clientes :focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
    '.mod-clientes.page{padding:16px 16px 96px;max-width:1500px;margin:0 auto}',
    '.mod-clientes .cl-head{display:flex;align-items:baseline;justify-content:space-between;gap:4px 16px;flex-wrap:wrap;margin:0 0 12px}',
    '.mod-clientes h2{font-size:22px;font-weight:600;margin:0;letter-spacing:-.01em;color:var(--text)}',
    '.mod-clientes .cl-count{color:var(--text-sub);font-size:14px;margin:0}',
    '.mod-clientes .cl-tools{display:flex;gap:8px;align-items:center;margin-bottom:8px}',
    '.mod-clientes .cl-tools .cl-search{flex:1 1 auto}',
    '@container (min-width:900px){.mod-clientes .cl-tools .cl-search{flex:0 1 420px}}',
    '.mod-clientes .cl-search{position:relative;min-width:0}',
    '.mod-clientes .tbtn{display:inline-flex;align-items:center;gap:8px;min-height:46px;padding:0 14px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);font-weight:500;font-size:15px;color:var(--text);flex:0 0 auto;white-space:nowrap}',
    '.mod-clientes .tbtn svg{width:20px;height:20px;display:block}',
    '.mod-clientes .tbtn[data-on="true"]{border-color:var(--text)}',
    '.mod-clientes .tbtn .bdg{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--text);color:var(--bg);font-size:12px;font-weight:600;display:inline-grid;place-items:center}',
    '@container (max-width:479px){.mod-clientes .tbtn .lbl{display:none}.mod-clientes .tbtn{padding:0 12px}}',
    '.mod-clientes .vt{display:inline-flex;flex:0 0 auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:3px;gap:2px}',
    '.mod-clientes .vt button{width:40px;height:38px;border-radius:calc(var(--radius) - 3px);display:grid;place-items:center;color:var(--text-sub)}',
    '.mod-clientes .vt button svg{width:20px;height:20px}',
    '.mod-clientes .vt button[aria-pressed="true"]{background:var(--surface-2);color:var(--text)}',
    '.mod-clientes .cl-active{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 12px;font-size:13.5px;color:var(--text-sub);min-height:20px}',
    '.mod-clientes .cl-active:empty{margin:0 0 6px;min-height:0}',
    '.mod-clientes .cl-active b{color:var(--text);font-weight:600}',
    '.mod-clientes .cl-active .lnk{min-height:28px;font-size:13.5px;text-decoration:underline;text-underline-offset:2px}',
    /* vue liste */
    '.mod-clientes .cl-tab{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden}',
    '.mod-clientes .cl-tab ul{list-style:none;margin:0;padding:0}',
    '.mod-clientes .cl-tab li+li{border-top:1px solid var(--line)}',
    '.mod-clientes .cl-row,.mod-clientes .cl-th{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;padding:9px 14px;text-align:left}',
    '.mod-clientes .cl-row{min-height:58px}',
    '.mod-clientes .cl-row:hover{background:var(--surface-2)}',
    '.mod-clientes .cl-row .av{width:34px;height:34px;font-size:12.5px}',
    '.mod-clientes .cl-row b{display:block;font-weight:600;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .cl-row small{display:block;font-size:12.5px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .cl-row .c{display:none;font-size:13.5px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}',
    '.mod-clientes .cl-row .c i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;vertical-align:1px}',
    '.mod-clientes .cl-row .nx{font-size:12.5px;font-weight:600;color:var(--ok);white-space:nowrap}',
    '.mod-clientes .cl-th{display:none;font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding-top:10px;padding-bottom:8px;border-bottom:1px solid var(--line)}',
    '@container (min-width:720px){.mod-clientes .cl-row,.mod-clientes .cl-th{grid-template-columns:34px minmax(0,1.6fr) minmax(0,.8fr) 70px minmax(0,1fr) minmax(0,1.1fr)}.mod-clientes .cl-th{display:grid}.mod-clientes .cl-row .c{display:block}.mod-clientes .cl-row small,.mod-clientes .cl-row .nx{display:none}}',
    '.mod-clientes .cl-row .c.nb{text-align:right;font-variant-numeric:tabular-nums}',
    '.mod-clientes .cl-th .nb{text-align:right}',
    '.mod-clientes .cl-row .c.ok{color:var(--ok);font-weight:600}',
    /* vue cartes */
    '.mod-clientes .cl-card{display:flex;flex-direction:column;gap:10px;width:100%;height:100%;padding:14px;border-radius:var(--radius-lg);background:var(--surface);border:1px solid var(--line);border-top:4px solid var(--pc);text-align:left;transition:border-color .15s}',
    '.mod-clientes .cl-card:hover{border-color:var(--text-sub);border-top-color:var(--pc)}',
    '.mod-clientes .cl-card .top{display:flex;align-items:center;gap:12px;min-width:0}',
    '.mod-clientes .cl-card .kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 12px;font-size:13.5px;margin:0}',
    '.mod-clientes .cl-card .kv dt{color:var(--muted)}',
    '.mod-clientes .cl-card .kv dd{margin:0;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .cl-card .ft{margin-top:auto;padding-top:9px;border-top:1px solid var(--line);font-size:13px;color:var(--text-sub)}',
    '.mod-clientes .cl-card .ft b{color:var(--ok);font-weight:600}',
    /* fiches à compléter */
    '.mod-clientes .inc-l{list-style:none;margin:0;padding:0 8px 6px}',
    '.mod-clientes .inc-l li+li{border-top:1px solid var(--line)}',
    '.mod-clientes .inc-l button{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-height:54px;padding:6px 6px;text-align:left;border-radius:var(--radius)}',
    '.mod-clientes .inc-l button:hover{background:color-mix(in srgb,var(--warn) 9%,transparent)}',
    '.mod-clientes .inc-l .av{width:32px;height:32px;font-size:12.5px}',
    '.mod-clientes .inc-l b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .inc-l small{display:block;color:var(--text-sub);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .inc-l .go{display:inline-flex;align-items:center;gap:2px;font-size:13px;font-weight:500;color:var(--text-sub)}',
    '.mod-clientes .inc-l .go svg{width:16px;height:16px}',
    '.mod-clientes .inc-help{margin:0;padding:0 14px 8px;font-size:13px;color:var(--text-sub);line-height:1.45}',
    /* panneau filtres */
    '.mod-clientes.fp{padding:0 0 8px}',
    '.mod-clientes .fp-h{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:4px 0 6px}',
    '.mod-clientes .fp-g{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;margin:0 0 18px}',
    '.mod-clientes .fp-o{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:8px 14px;text-align:left;font-size:15px}',
    '.mod-clientes .fp-o+.fp-o{border-top:1px solid var(--line)}',
    '.mod-clientes .fp-o .dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto}',
    '.mod-clientes .fp-o .n{margin-left:auto;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}',
    '.mod-clientes .fp-o .ck{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--line);display:grid;place-items:center;flex:0 0 auto;color:var(--bg)}',
    '.mod-clientes .fp-o .ck svg{width:14px;height:14px;opacity:0}',
    '.mod-clientes .fp-o[aria-pressed="true"]{font-weight:600}',
    '.mod-clientes .fp-o[aria-pressed="true"] .ck{background:var(--text);border-color:var(--text)}',
    '.mod-clientes .fp-o[aria-pressed="true"] .ck svg{opacity:1}',
    '.mod-clientes .fp-f{display:flex;gap:8px;position:sticky;bottom:0;padding:10px 0 2px;background:var(--bg)}',
    '.mod-clientes .fp-f .btn{flex:1}',
    /* fusion / complétion */
    '.mod-clientes .mg-lb{display:block;font-size:13px;font-weight:500;color:var(--text-sub);margin:10px 0 5px}',
    '.mod-clientes .mg-row{display:flex;gap:8px;flex-wrap:wrap}',
    '.mod-clientes .mg-row select{flex:1 1 220px;min-width:0;min-height:46px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:0 12px;color-scheme:light dark}',
    '.mod-clientes .mg-row .btn{flex:0 0 auto}',
    '.mod-clientes .mg-or{display:flex;align-items:center;gap:10px;margin:14px 0 10px;color:var(--muted);font-size:13px}',
    '.mod-clientes .mg-or::before,.mod-clientes .mg-or::after{content:"";flex:1;height:1px;background:var(--line)}',
    '.mod-clientes .mg .btn.full{width:100%}',
    '.mod-clientes .rl .ttl{display:block;font-size:12.5px;color:var(--muted);font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .f-sw{display:block;margin:-6px 0 14px;font-size:13.5px}',
    '.mod-clientes .cl-search input{width:100%;min-height:46px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:0 12px 0 42px;color-scheme:light dark}',
    '.mod-clientes .cl-search .ico{position:absolute;left:13px;top:13px;color:var(--muted);pointer-events:none}',
    '.mod-clientes .ico svg{width:20px;height:20px;display:block}',
    '.mod-clientes .chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:2px 16px}',
    '@container (min-width:900px){.mod-clientes .cl-tools .chips{margin:0;padding:2px 0}}',
    '.mod-clientes .chips::-webkit-scrollbar{display:none}',
    '.mod-clientes .chip{flex:0 0 auto;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--text-sub);font-size:14px;font-weight:500;white-space:nowrap;display:inline-flex;align-items:center;gap:7px}',
    '.mod-clientes .chip[aria-pressed="true"]{background:var(--text);color:var(--bg);border-color:var(--text)}',
    '.mod-clientes .chip[data-p][aria-pressed="true"]{background:var(--pc);border-color:var(--pc);color:var(--pf)}',
    '.mod-clientes .chip .n{font-size:12px;opacity:.75}',
    '.mod-clientes .chip .dot{width:9px;height:9px;border-radius:50%;background:var(--pc)}',
    '.mod-clientes .chip[aria-pressed="true"] .dot{background:currentColor}',
    '.mod-clientes .sel{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:var(--text-sub)}',
    '.mod-clientes .sel select{min-height:40px;border:1px solid var(--line);border-radius:999px;background:var(--surface);padding:0 32px 0 14px;font-size:14px;font-weight:500;appearance:none;-webkit-appearance:none;color-scheme:light dark;background-image:linear-gradient(45deg,transparent 50%,var(--text-sub) 50%),linear-gradient(135deg,var(--text-sub) 50%,transparent 50%);background-position:calc(100% - 17px) 17px,calc(100% - 12px) 17px;background-size:5px 5px;background-repeat:no-repeat}',
    '.mod-clientes .cl-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:8px}',
    '@container (min-width:700px){.mod-clientes .cl-list{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '@container (min-width:1100px){.mod-clientes .cl-list{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '.mod-clientes .cl-item{display:flex;align-items:center;gap:12px;width:100%;min-height:68px;padding:10px 12px;border-radius:var(--radius);background:var(--surface);border:1px solid var(--line);text-align:left;transition:border-color .15s}',
    '.mod-clientes .cl-item:hover{border-color:var(--text-sub)}',
    '.mod-clientes .av{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;font-weight:600;font-size:15px;flex:0 0 auto;letter-spacing:.02em}',
    '.mod-clientes .cl-main{flex:1;min-width:0}',
    '.mod-clientes .cl-name{font-weight:600;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}',
    '.mod-clientes .cl-meta{font-size:13px;color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}',
    '.mod-clientes .cl-next{font-size:12.5px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .cl-next b{color:var(--ok);font-weight:600}',
    '.mod-clientes .cl-next .tag{min-height:20px;padding:0 7px;font-size:11.5px;margin-right:4px}',
    '.mod-clientes .tag{display:inline-flex;align-items:center;gap:5px;min-height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--surface-2);color:var(--text-sub);flex:0 0 auto}',
    '.mod-clientes .tag.warn{color:var(--warn)}.mod-clientes .tag.danger{color:var(--danger)}.mod-clientes .tag.ok{color:var(--ok)}',
    '.mod-clientes .more{display:block;margin:14px auto 0;min-height:44px;padding:0 20px;border-radius:999px;border:1px solid var(--line);color:var(--text-sub);font-weight:500;background:var(--surface)}',
    '.mod-clientes .empty{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:36px 20px;text-align:center;color:var(--text-sub)}',
    '.mod-clientes .empty h3{color:var(--text);font-size:17px;margin:0 0 6px;font-weight:600}',
    '.mod-clientes .empty .big{width:48px;height:48px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center;margin:0 auto 12px;color:var(--muted)}',
    '.mod-clientes .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border-radius:999px;font-weight:500;font-size:15px;border:1px solid var(--line);background:var(--surface);color:var(--text);white-space:nowrap}',
    '.mod-clientes .btn svg{width:18px;height:18px}',
    '.mod-clientes .btn.pri{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}',
    '.mod-clientes .btn[disabled]{opacity:.55;cursor:default}',
    '.mod-clientes .lnk{color:var(--accent);font-weight:500;min-height:44px;padding:0 4px}',
    '.mod-clientes .sk{background:var(--surface-2);border-radius:8px;position:relative;overflow:hidden}',
    '.mod-clientes .sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--surface) 60%,transparent),transparent);animation:mcl-sh 1.3s infinite}',
    '@keyframes mcl-sh{100%{transform:translateX(100%)}}',
    '@media (prefers-reduced-motion:reduce){.mod-clientes .sk::after{animation:none}}',
    /* fiche */
    '.mod-clientes.fiche{padding:0 0 32px}',
    '.mod-clientes .f-hero{display:flex;align-items:center;gap:14px;padding:16px;border-radius:var(--radius-lg);background:var(--hb);color:var(--hf);margin-bottom:14px;border-left:5px solid var(--pc)}',
    '.mod-clientes .f-hero .av{width:54px;height:54px;font-size:19px;background:var(--pc);color:var(--pf)}',
    '.mod-clientes .f-hero h3{font-size:20px;font-weight:600;margin:0;line-height:1.2;color:var(--hf)}',
    '.mod-clientes .f-hero p{margin:3px 0 0;font-size:13.5px;opacity:.85}',
    '.mod-clientes .f-act{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;margin-bottom:16px}',
    '.mod-clientes .f-act .btn{width:100%;padding:0 10px}',
    '.mod-clientes .f-act .full{grid-column:1/-1}',
    '.mod-clientes .f-sec{margin:0 0 18px}',
    '.mod-clientes .f-sec>h4{font-size:15px;font-weight:600;margin:0 0 8px;color:var(--text);display:flex;align-items:center;justify-content:space-between;gap:8px}',
    '.mod-clientes .f-sec>h4 small{font-weight:400;color:var(--muted);font-size:12.5px}',
    '.mod-clientes .nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
    '.mod-clientes .num{background:var(--surface-2);border-radius:var(--radius);padding:10px 10px 9px;min-width:0}',
    '.mod-clientes .num b{display:block;font-size:20px;font-weight:600;line-height:1.15;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .num span{font-size:12px;color:var(--text-sub)}',
    '.mod-clientes .hab{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:12px 14px}',
    '.mod-clientes .hab-r{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line);font-size:14px}',
    '.mod-clientes .hab-r:first-child{border-top:0;padding-top:2px}',
    '.mod-clientes .hab-r>span:first-child{color:var(--text-sub)}',
    '.mod-clientes .hab-r b{font-weight:600;text-align:right}',
    '.mod-clientes .hbars{display:flex;flex-direction:column;gap:6px;padding:4px 0 8px}',
    '.mod-clientes .hbar{display:grid;grid-template-columns:92px minmax(0,1fr) 30px;align-items:center;gap:8px;font-size:13.5px}',
    '.mod-clientes .hbar.wide{grid-template-columns:118px minmax(0,1fr) 30px}',
    '.mod-clientes .hbar .l{color:var(--text-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .hbar .l.on{color:var(--text);font-weight:600}',
    '.mod-clientes .hbar .t{height:12px;border-radius:6px;background:var(--surface-2);overflow:hidden}',
    '.mod-clientes .hbar .t i{display:block;height:100%;border-radius:6px}',
    '.mod-clientes .hbar .v{text-align:right;font-weight:600;font-size:13px}',
    '.mod-clientes .hab-h{font-size:12.5px;color:var(--muted);margin:10px 0 2px}',
    '.mod-clientes .prev{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:var(--radius);background:var(--surface-2)}',
    '.mod-clientes .prev .ico{color:var(--text-sub)}',
    '.mod-clientes .prev b{display:block;font-weight:600}',
    '.mod-clientes .prev small{color:var(--text-sub);font-size:13px}',
    '.mod-clientes .recos{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}',
    '@container (min-width:600px){.mod-clientes .recos{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '.mod-clientes .reco{display:flex;flex-direction:column;gap:4px;padding:11px 13px 11px 15px;border-radius:var(--radius);border:1px solid var(--line);background:var(--surface);text-align:left;position:relative;border-left:5px solid var(--pc);min-height:64px}',
    '.mod-clientes .reco:hover{border-color:var(--pc)}',
    '.mod-clientes .reco .r1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    '.mod-clientes .reco .r1 b{font-size:15px;font-weight:600}',
    '.mod-clientes .reco .r1 .who{font-size:13px;color:var(--text-sub);display:inline-flex;align-items:center;gap:5px}',
    '.mod-clientes .reco .r1 .who i{width:9px;height:9px;border-radius:50%;background:var(--pc)}',
    '.mod-clientes .reco .rs{font-size:12.5px;color:var(--muted);line-height:1.35}',
    '.mod-clientes .reco .best{margin-left:auto;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--accent);color:var(--accent-text)}',
    '.mod-clientes .rl{list-style:none;margin:0;padding:0}',
    '.mod-clientes .rl li{border-top:1px solid var(--line)}',
    '.mod-clientes .rl li:first-child{border-top:0}',
    '.mod-clientes .rl button{display:grid;grid-template-columns:4px minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;min-height:52px;padding:8px 2px;text-align:left}',
    '.mod-clientes .rl .mcl-stripe{width:4px;align-self:stretch;border-radius:4px;background:var(--pc)}',
    '.mod-clientes .rl b{display:block;font-weight:600;font-size:14.5px}',
    '.mod-clientes .rl small{display:block;color:var(--text-sub);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .rl .off b,.mod-clientes .rl .off small{color:var(--muted)}',
    '.mod-clientes .rl .off b{text-decoration:line-through;text-decoration-color:var(--line)}',
    '.mod-clientes .f-empty{color:var(--muted);font-size:14px;padding:6px 0}',
    '.mod-clientes .f-hero .f-ed{margin-left:auto;align-self:flex-start;flex:0 0 auto;width:40px;height:40px;margin-top:-6px;margin-right:-6px;border-radius:50%;display:grid;place-items:center;color:var(--hf);opacity:.6;transition:opacity .15s,background .15s}',
    '.mod-clientes .f-hero .f-ed:hover{opacity:1;background:color-mix(in srgb,var(--pc) 22%,transparent)}',
    '.mod-clientes .f-hero .f-ed svg{width:18px;height:18px;display:block}',
    '.mod-clientes .f-hero.edit{display:block}',
    '.mod-clientes .rn-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}',
    '.mod-clientes .rn-f label{display:block;font-size:13px;font-weight:500;color:var(--text-sub);margin:0 0 5px}',
    '.mod-clientes .rn-f input{width:100%;min-height:46px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:0 12px;color-scheme:light dark}',
    '.mod-clientes .rn-f input[aria-invalid="true"]{border-color:var(--danger)}',
    '.mod-clientes .rn-err{margin:8px 0 0;font-size:13.5px;color:var(--danger);font-weight:500;line-height:1.4}',
    '.mod-clientes .rn-err:empty{display:none}',
    '.mod-clientes .rn-help{margin:8px 0 0;font-size:12.5px;color:var(--text-sub);line-height:1.4}',
    '.mod-clientes .rn-act{display:flex;gap:8px;margin-top:12px}',
    '.mod-clientes .rn-act .btn{flex:1;min-height:44px}',
    '.mod-clientes .f-act .btn.sub{min-height:42px;font-size:14px;color:var(--text-sub);border-style:dashed}',
    '.mod-clientes .mg{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:12px 14px;margin-bottom:16px}',
    '.mod-clientes .mg h4{font-size:15px;font-weight:600;margin:0 0 8px;color:var(--text)}',
    '.mod-clientes .mg .cl-search input{padding-left:42px}',
    '.mod-clientes .mg-mode{margin:8px 0 4px;font-size:13px;color:var(--text-sub);line-height:1.45}',
    '.mod-clientes .mg-mode b{color:var(--text);font-weight:600}',
    '.mod-clientes .mg-mode .lnk{min-height:32px;padding:0;font-size:13px;text-decoration:underline;text-underline-offset:2px}',
    '.mod-clientes .mg-res{list-style:none;margin:6px 0 0;padding:0}',
    '.mod-clientes .mg-res li+li{border-top:1px solid var(--line)}',
    '.mod-clientes .mg-res button{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:6px 2px;text-align:left}',
    '.mod-clientes .mg-res .av{width:34px;height:34px;font-size:13px}',
    '.mod-clientes .mg-res b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .mg-res small{display:block;color:var(--text-sub);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .mg-res .sug{font-size:11px;font-weight:600;color:var(--warn);margin-left:auto;flex:0 0 auto}',
    '.mod-clientes .mg-foot{display:flex;justify-content:flex-end;margin-top:6px}',
    '.mod-clientes .dup{border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));background:color-mix(in srgb,var(--warn) 7%,var(--surface));border-radius:var(--radius-lg);margin:0 0 14px;overflow:hidden}',
    '.mod-clientes .dup-h{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;padding:8px 14px;text-align:left}',
    '.mod-clientes .dup-h .ico{color:var(--warn)}',
    '.mod-clientes .dup-h b{font-weight:600;font-size:15px}',
    '.mod-clientes .dup-h small{color:var(--text-sub);font-size:13px;margin-left:auto;display:inline-flex;align-items:center;gap:4px}',
    '.mod-clientes .dup-h small svg{width:16px;height:16px;transition:transform .15s}',
    '.mod-clientes .dup-h[aria-expanded="true"] small svg{transform:rotate(180deg)}',
    '.mod-clientes .dup-l{list-style:none;margin:0;padding:0 14px 6px;display:grid;grid-template-columns:minmax(0,1fr);gap:0}',
    '@container (min-width:900px){.mod-clientes .dup-l{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px}}',
    '.mod-clientes .dup-p{border-top:1px solid var(--line);padding:10px 0}',
    '.mod-clientes .dup-k{font-size:12.5px;color:var(--text-sub);margin:0 0 6px}',
    '.mod-clientes .dup-o{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:6px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);text-align:left;margin-top:6px}',
    '.mod-clientes .dup-o[aria-pressed="true"]{border-color:var(--text);box-shadow:inset 0 0 0 1px var(--text)}',
    '.mod-clientes .dup-o .av{width:32px;height:32px;font-size:12.5px}',
    '.mod-clientes .dup-o b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .dup-o small{display:block;color:var(--text-sub);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-clientes .dup-o .keep{margin-left:auto;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--text);color:var(--bg);flex:0 0 auto}',
    '.mod-clientes .dup-o[aria-pressed="false"] .keep{display:none}',
    '.mod-clientes .dup-a{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}',
    '.mod-clientes .dup-a .btn{min-height:40px;font-size:14px;padding:0 16px}',
    '.mod-clientes .dup-a .lnk{min-height:40px;font-size:13.5px;color:var(--text-sub)}',
    '.mod-clientes .msg{margin-top:8px;padding:10px 12px;border-radius:var(--radius);background:var(--surface-2);font-size:14px;color:var(--text);line-height:1.45;white-space:pre-wrap}'
  ].join('\n');

  function injectCss() {
    if (document.querySelector('style[data-module="clientes"]')) return;
    var s = document.createElement('style'); s.setAttribute('data-module', 'clientes'); s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- liste ---------------- */
  function skeleton(n) {
    var h = ''; for (var i = 0; i < n; i++) h += '<li><div class="cl-item"><div class="av sk"></div><div class="cl-main"><div class="sk" style="height:14px;width:55%"></div><div class="sk" style="height:11px;width:80%;margin-top:8px"></div></div></div></li>';
    return '<ul class="cl-list" aria-busy="true">' + h + '</ul>';
  }

  function render() {
    if (!root) return;
    root.innerHTML = '<div class="cl-head"><h2>Nos clientes</h2><p class="cl-count" data-r="count"></p></div>' +
      '<div class="cl-tools"><div class="cl-search"><span class="ico">' + icon('search') + '</span><input type="search" data-r="q" placeholder="Rechercher" autocomplete="off" aria-label="Rechercher une cliente" value="' + esc(st.q) + '"></div>' +
      '<button class="tbtn" data-act="filters" aria-haspopup="dialog" data-r="fbtn">' + SVG.filtre + '<span class="lbl">Filtres</span></button>' +
      '<div class="vt" role="group" aria-label="Affichage">' +
      '<button data-vue="liste" aria-pressed="' + (st.vue === 'liste') + '" aria-label="Vue liste" title="Vue liste">' + SVG.liste + '</button>' +
      '<button data-vue="cartes" aria-pressed="' + (st.vue === 'cartes') + '" aria-label="Vue cartes" title="Vue cartes">' + SVG.cartes + '</button></div></div>' +
      '<p class="cl-active" data-r="active" aria-live="polite"></p>' +
      '<div data-r="inc"></div><div data-r="list"></div>';
    renderList();
  }

  /** Listes filtrées : par recherche (byQ), + praticienne (byP), + situation (list). */
  function compute() {
    var t = today(), q = norm(st.q), pf = pratFilter();
    var byQ = (profils || []).filter(function (p) {
      if (!q) return true;
      var a = norm(p.prenom + ' ' + p.nom), b = norm(p.nom + ' ' + p.prenom);
      return a.indexOf(q) >= 0 || b.indexOf(q) >= 0;
    });
    var byP = byQ.filter(function (p) { return pf === 'tous' || p.praticienne === pf; });
    var list = byP.filter(function (p) { return matchStatut(p, st.sit, t); });
    list.sort(sorter(st.tri));
    return { t: t, q: q, pf: pf, byQ: byQ, byP: byP, list: list };
  }
  function nActive() { return (pratFilter() !== 'tous' ? 1 : 0) + (st.sit !== 'tous' ? 1 : 0); }

  function renderList() {
    var el = root && root.querySelector('[data-r="list"]'); if (!el) return;
    var cnt = root.querySelector('[data-r="count"]');
    paintToolbar();
    if (err && !profils) {
      el.innerHTML = '<div class="empty"><div class="big">' + icon('alert') + '</div><h3>Impossible de charger les clientes</h3><p>' + esc(err) + '</p><button class="btn pri" data-act="retry">Réessayer</button></div>';
      return;
    }
    var ie = root.querySelector('[data-r="inc"]'); if (ie) ie.innerHTML = incHtml();
    if (!profils) { el.innerHTML = skeleton(8); if (cnt) cnt.textContent = 'Chargement…'; return; }
    var c = compute(), list = c.list;
    if (cnt) cnt.textContent = profils.length ? (list.length === profils.length ? pl(profils.length, 'cliente') : list.length + ' sur ' + pl(profils.length, 'cliente')) : '';
    paintFilters(c);
    if (!profils.length) {
      el.innerHTML = '<div class="empty"><div class="big">' + icon('users') + '</div><h3>Aucune cliente pour l’instant</h3><p>La base se remplit automatiquement avec chaque rendez-vous.</p>' + (G.newRdv ? '<button class="btn pri" data-act="new" style="margin-top:12px">' + icon('plus') + 'Nouveau RDV</button>' : '') + '</div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div class="empty"><h3>Aucune cliente</h3><p>' + (c.q ? 'Personne ne correspond à « ' + esc(st.q) + ' ».' : 'Aucune cliente dans ce filtre.') + '</p>' +
        ((c.q || nActive()) ? '<button class="btn" data-act="reset" style="margin-top:12px">Effacer les filtres</button>' : '') + '</div>';
      return;
    }
    var shown = list.slice(0, st.n), more = list.length > st.n ? '<button class="more" data-act="more">Afficher plus (' + (list.length - st.n) + ' restantes)</button>' : '';
    if (st.vue === 'cartes') el.innerHTML = '<ul class="cl-list">' + shown.map(function (p) { return '<li>' + card(p, c.t) + '</li>'; }).join('') + '</ul>' + more;
    else el.innerHTML = '<div class="cl-tab"><div class="cl-th" aria-hidden="true"><span></span><span>Cliente</span><span>Praticienne</span><span class="nb">Visites</span><span>Dernière visite</span><span>Prochain RDV</span></div><ul>' +
      shown.map(function (p) { return '<li>' + row(p, c.t) + '</li>'; }).join('') + '</ul></div>' + more;
  }

  /** Bouton Filtres (nombre de filtres actifs) + rappel discret des filtres en cours. */
  function paintToolbar() {
    if (!root) return;
    var n = nActive(), b = root.querySelector('[data-r="fbtn"]'), a = root.querySelector('[data-r="active"]');
    if (b) { b.setAttribute('data-on', String(n > 0)); b.innerHTML = SVG.filtre + '<span class="lbl">Filtres</span>' + (n ? '<span class="bdg" aria-label="' + n + ' actif' + (n > 1 ? 's' : '') + '">' + n + '</span>' : ''); }
    root.querySelectorAll('[data-vue]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-vue') === st.vue)); });
    if (!a) return;
    var parts = [], pf = pratFilter();
    if (pf !== 'tous') parts.push('Clientes de ' + pname(pf));
    if (st.sit !== 'tous') parts.push(SITS.filter(function (x) { return x[0] === st.sit; })[0][1]);
    a.innerHTML = parts.length ? '<span>Filtre :</span> <b>' + esc(parts.join(' · ')) + '</b> <button class="lnk" data-act="reset-f">Effacer</button>' : '';
  }

  /* ---------------- panneau des filtres ---------------- */
  function filtersHtml(c) {
    var pf = pratFilter(), H = '';
    var opt = function (attr, val, on, label, n, dot) {
      return '<button class="fp-o" ' + attr + '="' + esc(val) + '" aria-pressed="' + on + '"><span class="ck">' + SVG.check + '</span>' +
        (dot ? '<span class="dot" style="background:' + dot + '"></span>' : '') + '<span>' + esc(label) + '</span>' + (n != null ? '<span class="n">' + n + '</span>' : '') + '</button>';
    };
    H += '<p class="fp-h">Afficher</p><div class="fp-g">' + opt('data-prat', 'tous', pf === 'tous', 'Toutes', c ? c.byQ.length : null);
    prats().forEach(function (p) { H += opt('data-prat', p.id, pf === p.id, p.nom, c ? c.byQ.filter(function (x) { return x.praticienne === p.id; }).length : null, pcol(p.id)); });
    SITS.forEach(function (x) { H += opt('data-sit', x[0], st.sit === x[0], x[1], c ? c.byP.filter(function (p) { return matchStatut(p, x[0], c.t); }).length : null); });
    H += '</div><p class="fp-h">Trier par</p><div class="fp-g">';
    TRIS.forEach(function (x) { H += opt('data-tri', x[0], st.tri === x[0], x[1], null); });
    H += '</div><div class="fp-f"><button class="btn" data-act="fp-reset"' + (nActive() ? '' : ' disabled') + '>Réinitialiser</button><button class="btn pri" data-act="fp-close">Voir ' + pl(c ? c.list.length : 0, 'cliente') + '</button></div>';
    return H;
  }
  function paintFilters(c) { if (fp && fp.el) fp.el.innerHTML = filtersHtml(c || (profils ? compute() : null)); }
  function openFilters() {
    if (fp) return;
    var box = document.createElement('div'); box.className = 'mod-clientes fp';
    fp = { el: box };
    box.innerHTML = filtersHtml(profils ? compute() : null);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !box.contains(b)) return;
      var a;
      if ((a = b.getAttribute('data-prat'))) { st.prat = a; }
      else if ((a = b.getAttribute('data-sit'))) { st.sit = st.sit === a ? 'tous' : a; }
      else if ((a = b.getAttribute('data-tri'))) { st.tri = a; }
      else if (b.getAttribute('data-act') === 'fp-reset') { st.prat = 'tous'; st.sit = 'tous'; }
      else if (b.getAttribute('data-act') === 'fp-close') { if (fp && fp.panel) fp.panel.close(); return; }
      else return;
      st.n = 60; renderList();
    });
    fp.panel = G.panel({ title: 'Filtres', size: 'side', content: box, onClose: function () { fp = null; var fb = root && root.querySelector('[data-r="fbtn"]'); if (fb) fb.focus(); } });
  }

  function sorter(tri) {
    if (tri === 'visites') return function (a, b) { return (b.realises || 0) - (a.realises || 0) || (b.derniere || '').localeCompare(a.derniere || ''); };
    if (tri === 'az') return function (a, b) { return fullName(a).localeCompare(fullName(b), 'fr', { sensitivity: 'base' }); };
    if (tri === 'prochain') return function (a, b) {
      // RDV le plus proche d'abord ; les clientes sans RDV à venir ensuite, par dernière visite
      var ka = a.prochain ? '1' + a.prochain.date + a.prochain.debut : '2', kb = b.prochain ? '1' + b.prochain.date + b.prochain.debut : '2';
      return ka.localeCompare(kb) || (b.derniere || '').localeCompare(a.derniere || '') || fullName(a).localeCompare(fullName(b), 'fr');
    };
    // Dernière visite réalisée (la plus récente d'abord) ; les clientes pas encore venues à la fin
    return function (a, b) { return (!a.derniere) - (!b.derniere) || (b.derniere || b.premiere || '').localeCompare(a.derniere || a.premiere || '') || fullName(a).localeCompare(fullName(b), 'fr'); };
  }

  function nextTxt(p) { return p.prochain ? fDate(p.prochain.date) + ' ' + fH(p.prochain.debut) : ''; }
  function row(p, t) {
    var col = pcol(p.praticienne), h = p.habitude || {};
    var meta = [pname(p.praticienne), pl(p.realises || 0, 'visite'), p.derniere ? 'dernière ' + ago(p.derniere) : 'pas encore venue'].filter(Boolean);
    return '<button class="cl-row" data-cle="' + esc(p.cle) + '">' + avatar(p) +
      '<span style="min-width:0"><b>' + esc(fullName(p)) + '</b><small>' + esc(meta.join(' · ')) + '</small></span>' +
      '<span class="c"><i style="background:' + col + '"></i>' + esc(pname(p.praticienne)) + '</span>' +
      '<span class="c nb">' + nf(p.realises || 0) + '</span>' +
      '<span class="c">' + esc(p.derniere ? fDateY(p.derniere) + ' · ' + ago(p.derniere) : '—') + '</span>' +
      '<span class="c' + (p.prochain ? ' ok' : '') + '">' + esc(p.prochain ? nextTxt(p) : (inactive(p, t) ? 'Inactive' : '—')) + '</span>' +
      (p.prochain ? '<span class="nx">' + esc(nextTxt(p)) + '</span>' : inactive(p, t) ? '<span class="tag">Inactive</span>' : '<span></span>') +
      '</button>';
  }
  function card(p, t) {
    var col = pcol(p.praticienne), h = p.habitude || {};
    var kv = [['Visites', nf(p.realises || 0) + (h.frequenceJours ? ' · tous les ' + h.frequenceJours + ' j' : '')]];
    if ((h.services || []).length) kv.push(['Soin', h.services.map(function (x) { return sname(x, true); }).join(' + ')]);
    if (h.jours && h.jours[0]) kv.push(['Jour', cap(JOURS[h.jours[0].jour]) + (h.heure ? ' · ' + fH(h.heure) : '')]);
    var ft = p.prochain ? '<b>Prochain RDV ' + esc(nextTxt(p)) + '</b>' : (p.derniere ? 'Dernière visite ' + esc(fDateY(p.derniere)) + ' · ' + esc(ago(p.derniere)) : 'Pas encore venue');
    return '<button class="cl-card" data-cle="' + esc(p.cle) + '" style="--pc:' + col + '"><span class="top">' + avatar(p) +
      '<span style="min-width:0;flex:1"><div class="cl-name">' + esc(fullName(p)) + '</div><div class="cl-meta">' + esc(pname(p.praticienne)) + '</div></span>' +
      (inactive(p, t) && !p.prochain ? '<span class="tag">Inactive</span>' : '') + '</span>' +
      '<dl class="kv">' + kv.map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') + '</dl>' +
      '<span class="ft">' + ft + '</span></button>';
  }

  /* ---------------- fiches à compléter ---------------- */
  function incList() {
    var pf = pratFilter();
    return (profils || []).filter(function (p) { return incomplete(p) && (pf === 'tous' || p.praticienne === pf); })
      .sort(function (a, b) { return fullName(a).localeCompare(fullName(b), 'fr', { sensitivity: 'base' }); });
  }
  function incHtml() {
    if (!profils || st.q) return '';
    var l = incList(); if (!l.length) return '';
    var H = '<section class="dup"><button class="dup-h" data-act="inc-toggle" aria-expanded="' + !!st.incOpen + '"><span class="ico">' + icon('users') + '</span><b>Fiches à compléter (' + l.length + ')</b><small>' + (st.incOpen ? 'Masquer' : 'Voir') + icon('chevronD') + '</small></button>';
    if (st.incOpen) {
      H += '<p class="inc-help">Prénom seul ou nom incomplet. Touchez une fiche pour voir ses rendez-vous, puis la fusionner avec la bonne cliente ou compléter son nom.</p><ul class="inc-l">' + l.map(function (p) {
        return '<li><button data-inc="' + esc(p.cle) + '">' + avatar(p) + '<span style="min-width:0"><b>' + esc(fullName(p)) + '</b><small>' + esc(pname(p.praticienne) + ' · ' + visitsLine(p)) + '</small></span><span class="go">Compléter' + SVG.chev + '</span></button></li>';
      }).join('') + '</ul>';
    }
    return H + '</section>';
  }

  function load() {
    var my = ++tok; err = null;
    if (!profils) renderList();
    Promise.resolve().then(function () { return G.clientes(); }).then(function (l) {
      if (my !== tok || !mounted) return;
      profils = Array.isArray(l) ? l : [];
      renderList();
    }).catch(function (e) {
      if (my !== tok || !mounted) return;
      err = (e && e.message) || 'Erreur inattendue.';
      if (!profils) renderList(); else if (G.toast) G.toast(err, { type: 'err' });
    });
  }

  var qTimer = null;
  function bindList(el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !el.contains(b)) return;
      var a;
      if ((a = b.getAttribute('data-cle'))) { openClient(a); return; }
      if ((a = b.getAttribute('data-inc'))) { openClient(a, { completer: true }); return; }
      if ((a = b.getAttribute('data-vue'))) { st.vue = a === 'cartes' ? 'cartes' : 'liste'; lsSet(VUE_KEY, st.vue); renderList(); return; }
      a = b.getAttribute('data-act');
      if (a === 'filters') { openFilters(); return; }
      if (a === 'inc-toggle') { st.incOpen = !st.incOpen; renderList(); return; }
      if (a === 'reset-f') { st.prat = 'tous'; st.sit = 'tous'; st.n = 60; renderList(); return; }
      if (a === 'more') { st.n += 60; renderList(); }
      else if (a === 'retry') load();
      else if (a === 'new' && G.newRdv) G.newRdv({});
      else if (a === 'reset') { st.q = ''; st.sit = 'tous'; st.prat = 'tous'; render(); }
    });
    el.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-r') !== 'q') return;
      st.q = e.target.value; st.n = 60;
      clearTimeout(qTimer); qTimer = setTimeout(renderList, 60);
    });
  }

  /* ---------------- fiche cliente ---------------- */
  function openClient(cle, opts) {
    if (!cle) return null;
    injectCss();
    var box = document.createElement('div');
    box.className = 'mod-clientes fiche';
    box.innerHTML = ficheSkeleton();
    var f = { cle: cle, el: box, tok: 0, data: null, recos: null, recoErr: null, recoLoading: false, showPast: 10, rn: null, mg: null, uid: ++ficheUid, completer: !!(opts && opts.completer) };
    var known = (profils || []).filter(function (p) { return p.cle === cle; })[0];
    var title = known ? fullName(known) : 'Fiche cliente';
    f.panel = G.panel({ title: title, size: 'side', content: box, onClose: function () { fiches = fiches.filter(function (x) { return x !== f; }); } });
    fiches.push(f);
    bindFiche(f);
    loadFiche(f);
    return f.panel;
  }

  function ficheSkeleton() {
    return '<div class="sk" style="height:86px;border-radius:18px;margin-bottom:14px"></div>' +
      '<div class="f-act"><div class="sk" style="height:46px;border-radius:99px"></div><div class="sk" style="height:46px;border-radius:99px"></div></div>' +
      '<div class="nums">' + [1, 2, 3, 4, 5, 6].map(function () { return '<div class="sk" style="height:58px;border-radius:12px"></div>'; }).join('') + '</div>' +
      '<div class="sk" style="height:220px;border-radius:18px;margin-top:18px"></div>';
  }

  function loadFiche(f) {
    var my = ++f.tok;
    G.API.admin('admin.client', { cle: f.cle }).then(function (d) {
      if (my !== f.tok) return;
      f.data = d; f.recos = null; f.recoErr = null;
      try { if (f.panel && f.panel.setTitle) f.panel.setTitle(fullName(d)); } catch (e) { /* ignore */ }
      renderFiche(f);
    }).catch(function (e) {
      if (my !== f.tok) return;
      f.el.innerHTML = '<div class="empty"><div class="big">' + icon('alert') + '</div><h3>Fiche indisponible</h3><p>' + esc((e && e.message) || 'Erreur inattendue.') + '</p><button class="btn pri" data-act="f-retry">Réessayer</button></div>';
    });
  }

  function renderFiche(f) {
    var d = f.data, t = today(), h = d.habitude || {};
    var col = pcol(d.praticienne || h.praticienne), H = '';
    var dp = d.premiere ? diff(d.premiere, t) : null;
    var since = dp == null ? '' : dp > 0 ? 'Cliente depuis ' + ago(d.premiere).replace('il y a ', '') : dp === 0 ? 'Première visite aujourd’hui' : 'Nouvelle cliente · 1re visite ' + ago(d.premiere);
    var heroStyle = '--pc:' + col + ';--pf:' + tOn(col) + ';--hb:' + tint(col, 0.22) + ';--hf:var(--text)';
    if (f.rn) H += renameHtml(f, heroStyle);
    else H += '<div class="f-hero" style="' + heroStyle + '"><span class="av">' + esc(initials(d)) + '</span><div style="min-width:0"><h3>' + esc(fullName(d)) + '</h3><p>' +
      esc([d.praticienne ? 'Avec ' + pname(d.praticienne) : '', since].filter(Boolean).join(' · ')) + '</p></div>' +
      '<button class="f-ed" data-act="f-rn" aria-label="Modifier le nom" title="Modifier le nom">' + icon('edit') + '</button></div>';

    var rd = d.rdvs || [];
    var up = rd.filter(function (r) { return r.date >= t && (ACTIVE[r.statut]); }).sort(function (a, b) { return (a.date + a.debut).localeCompare(b.date + b.debut); });
    var past = rd.filter(function (r) { return !(r.date >= t && ACTIVE[r.statut]); }).sort(function (a, b) { return (b.date + b.debut).localeCompare(a.date + a.debut); });
    var rdvSecs = function (titres) {
      return '<div class="f-sec"><h4>À venir <small>' + up.length + '</small></h4>' + (up.length ? '<ul class="rl">' + up.map(function (r) { return rdvRow(r, t, titres); }).join('') + '</ul>' : '<p class="f-empty">Aucun rendez-vous à venir.</p>') + '</div>' +
        '<div class="f-sec"><h4>Passés <small>' + past.length + '</small></h4>' + (past.length ? '<ul class="rl">' + past.slice(0, f.showPast).map(function (r) { return rdvRow(r, t, titres); }).join('') + '</ul>' +
        (past.length > f.showPast ? '<button class="btn" data-act="f-past" style="width:100%;margin-top:8px">Voir les ' + (past.length - f.showPast) + ' autres</button>' : '') : '<p class="f-empty">Aucun rendez-vous passé.</p>') + '</div>';
    };

    // Mode « compléter » : uniquement ce qui sert à identifier la cliente et à décider
    if (f.completer) {
      if (!f.rn && !f.mg) initMerge(f);
      if (f.mg) H += mergeBlock(f);
      H += rdvSecs(true) + '<button class="lnk f-sw" data-act="f-full">Voir la fiche complète (habitudes, créneaux recommandés)</button>';
      f.el.innerHTML = H;
      return;
    }

    if (f.mg) H += mergeBlock(f);
    else H += '<div class="f-act">' +
      '<button class="btn pri full" data-act="f-new">' + icon('plus') + 'Nouveau RDV</button>' +
      '<button class="btn sub full" data-act="f-mg">' + icon('users') + 'Fusionner avec une autre fiche</button>' +
      '</div>';

    // Chiffres clés
    var freq = h.frequenceJours;
    H += '<div class="f-sec"><h4>En chiffres</h4><div class="nums">' +
      num(nf(d.realises || 0), (d.realises || 0) > 1 ? 'visites réalisées' : 'visite réalisée') +
      num(nf(d.heures || 0, 1) + ' h', 'de soins') +
      num(freq ? freq + ' j' : '—', 'fréquence') +
      num(d.premiere ? fDateY(d.premiere) : '—', 'première visite') +
      num(nf(d.annules || 0), (d.annules || 0) > 1 ? 'annulations' : 'annulation') +
      num(nf(d.absentes || 0), (d.absentes || 0) > 1 ? 'absences' : 'absence') +
      '</div></div>';

    // Prochain RDV, sinon rythme habituel (simple repère, pas de relance)
    var pv = h.prochaineVisitePrevue;
    if (d.prochain) {
      H += '<div class="f-sec"><div class="prev"><span class="ico">' + icon('calendar') + '</span><div><b>Prochain RDV ' + esc(fLong(d.prochain.date)) + ' à ' + esc(fH(d.prochain.debut)) + '</b><small>' + esc(pname(d.prochain.praticienne)) + ' · ' + esc((d.prochain.services || []).map(function (x) { return sname(x, true); }).join(' + ')) + ' · ' + inDays(d.prochain.date) + '</small></div></div></div>';
    } else if (pv && pv >= t) {
      H += '<div class="f-sec"><div class="prev"><span class="ico">' + icon('clock') + '</span><div><b>Revient habituellement vers le ' + esc(fLong(pv)) + '</b><small>D’après son rythme · aucun RDV pris pour l’instant</small></div></div></div>';
    }

    // Habitudes
    H += '<div class="f-sec"><h4>Ses habitudes <small>' + ((d.realises || 0) ? 'd’après ' + pl(d.realises, 'visite') : 'd’après ses RDV') + '</small></h4><div class="hab">' + habits(d) + '</div></div>';

    // Créneaux recommandés
    H += '<div class="f-sec" data-r="recos"><h4>Créneaux recommandés <small>' + esc(recoSub(d)) + '</small></h4><div data-r="recos-body">' + recosHtml(f) + '</div></div>';

    H += rdvSecs(false);
    f.el.innerHTML = H;
    if (!f.recos && !f.recoLoading && !f.recoErr) loadRecos(f);
  }

  function num(v, l) { return '<div class="num"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>'; }

  function habits(d) {
    var h = d.habitude || {}, H = '', cfg = G.cfg && G.cfg();
    // Jours préférés : jours ouverts de la semaine + jours où elle est déjà venue
    var cnt = {}; (h.jours || []).forEach(function (j) { cnt[j.jour] = j.n; });
    var days = [1, 2, 3, 4, 5, 6, 0].filter(function (x) { return cnt[x] || (cfg && cfg.semaine && cfg.semaine[String(x)] && cfg.semaine[String(x)].ouvert); });
    var maxJ = Math.max.apply(null, [1].concat(days.map(function (x) { return cnt[x] || 0; })));
    var top = h.jours && h.jours[0] ? h.jours[0].jour : null;
    var accent = pcol(h.praticienne || d.praticienne);
    if (days.length && (h.jours || []).length) {
      H += '<div class="hab-h">Jours préférés</div><div class="hbars">' + days.map(function (x) {
        var n = cnt[x] || 0;
        return '<div class="hbar"><span class="l' + (x === top ? ' on' : '') + '">' + cap(JOURS[x]) + '</span><span class="t"><i style="width:' + (n / maxJ * 100) + '%;background:' + accent + '"></i></span><span class="v">' + (n || '') + '</span></div>';
      }).join('') + '</div>';
    }
    H += '<div class="hab-r"><span>Heure habituelle</span><b>' + (h.heure ? esc(fH(h.heure)) + (h.moment ? ' · ' + esc(h.moment) : '') : '—') + '</b></div>';
    H += '<div class="hab-r"><span>Praticienne</span><b style="display:inline-flex;align-items:center;gap:6px">' + (h.praticienne ? '<i style="width:10px;height:10px;border-radius:50%;background:' + pcol(h.praticienne) + ';display:inline-block"></i>' + esc(pname(h.praticienne)) + praShare(d) : '—') + '</b></div>';
    H += '<div class="hab-r"><span>Soin habituel</span><b>' + ((h.services || []).length ? esc(h.services.map(function (x) { return sname(x); }).join(' + ')) : '—') + '</b></div>';
    H += '<div class="hab-r"><span>Revient tous les</span><b>' + (h.frequenceJours ? h.frequenceJours + ' jours environ' : 'pas encore assez de visites') + '</b></div>';
    var sv = d.services || [];
    if (sv.length) {
      var maxS = sv[0].n || 1;
      H += '<div class="hab-h">Prestations</div><div class="hbars">' + sv.slice(0, 6).map(function (s) {
        return '<div class="hbar wide"><span class="l" title="' + esc(sname(s.id)) + '">' + esc(sname(s.id, true)) + '</span><span class="t"><i style="width:' + (s.n / maxS * 100) + '%;background:' + scol(s.id) + '"></i></span><span class="v">' + s.n + '</span></div>';
      }).join('') + '</div>';
    }
    return H;
  }
  function praShare(d) {
    var p = d.praticiennes || {}, ks = Object.keys(p), tot = 0; ks.forEach(function (k) { tot += p[k]; });
    if (ks.length < 2 || !tot) return '';
    return ' <span style="font-weight:400;color:var(--muted)">(' + Math.round(p[d.habitude.praticienne] / tot * 100) + ' %)</span>';
  }

  function recoSub(d) {
    var h = d.habitude || {};
    var s = (h.services || []).map(function (x) { return sname(x, true); }).join(' + ');
    return [s, h.praticienne ? pname(h.praticienne) : ''].filter(Boolean).join(' · ');
  }
  function recosHtml(f) {
    if (f.recoErr) return '<p class="f-empty">' + esc(f.recoErr) + ' <button class="lnk" data-act="f-reco">Réessayer</button></p>';
    if (!f.recos) return '<div class="recos">' + [1, 2, 3, 4].map(function () { return '<div class="sk" style="height:66px;border-radius:12px"></div>'; }).join('') + '</div>';
    var c = f.recos.creneaux || [];
    if (!c.length) return '<p class="f-empty">Aucun créneau libre dans les 3 prochaines semaines pour ce soin. Essayez « Nouveau RDV » pour choisir une autre date.</p>';
    return '<div class="recos">' + c.map(function (x, i) {
      var col = pcol(x.praticienne);
      return '<button class="reco" data-reco="' + i + '" style="--pc:' + col + '"><span class="r1"><b>' + esc(cap(fDate(x.date))) + ' · ' + esc(fHR(x.debut, x.fin)) + '</b><span class="who"><i></i>' + esc(pname(x.praticienne)) + '</span>' + (i === 0 ? '<span class="best">Recommandé</span>' : '') + '</span>' +
        '<span class="rs">' + esc((x.raisons && x.raisons.length ? x.raisons : ['Créneau disponible']).join(' · ').replace(/\b0?(\d{1,2})h(\d{2})\b/g, function (m, h, mi) { return (+h) + 'h' + (mi === '00' ? '' : mi); })) + '</span></button>';
    }).join('') + '</div>';
  }
  function loadRecos(f) {
    f.recoLoading = true; f.recoErr = null;
    var my = f.tok;
    G.API.admin('admin.recommander', { cle: f.cle, limit: 5 }).then(function (r) {
      if (my !== f.tok) return;
      f.recos = r || { creneaux: [] };
    }).catch(function (e) {
      if (my !== f.tok) return;
      f.recoErr = (e && e.message) || 'Recommandations indisponibles.';
    }).then(function () {
      f.recoLoading = false;
      if (my !== f.tok) return;
      var b = f.el.querySelector('[data-r="recos-body"]'); if (b) b.innerHTML = recosHtml(f);
    });
  }

  var TITRE_RE = /^Importé de Google Agenda : (.*?)( \(prestation à vérifier\))?$/;
  function rdvRow(r, t, titre) {
    var stt = STATUT[r.statut] || [r.statut, ''], off = !ACTIVE[r.statut];
    var done = r.statut === 'confirme' && r.date < t;
    var svc = r.type === 'massage' ? (r.services || []).map(function (x) { return sname(x); }).join(' + ') : (r.services || []).map(function (x) { return sname(x, true); }).join(' + ');
    return '<li><button data-rdv="' + esc(r.id) + '" class="' + (off ? 'off' : '') + '" style="--pc:' + pcol(r.praticienne) + '"><span class="mcl-stripe"></span><span style="min-width:0"><b>' + esc(cap(fDate(r.date))) + (r.date.slice(0, 4) !== t.slice(0, 4) ? ' ' + r.date.slice(0, 4) : '') + ' · ' + esc(fHR(r.debut, r.fin)) + '</b><small>' + esc(pname(r.praticienne)) + ' · ' + esc(svc) + '</small>' +
      (titre && TITRE_RE.test(r.note || '') ? '<span class="ttl">Google Agenda : « ' + esc(TITRE_RE.exec(r.note)[1]) + ' »</span>' : '') + '</span>' +
      '<span class="tag ' + (done ? '' : stt[1]) + '">' + (done ? 'Réalisé' : stt[0]) + '</span></button></li>';
  }

  function nk(s) { return norm(s).replace(/[’`]/g, "'").replace(/\s+/g, ' '); }
  function visitsLine(p) {
    return [pl(p.realises || 0, 'visite'), p.derniere ? 'dernière ' + ago(p.derniere) : (p.prochain ? 'RDV ' + fDate(p.prochain.date) : 'pas encore venue')].join(' · ');
  }
  function avatar(p) { var c = pcol(p.praticienne); return '<span class="av" style="background:' + c + ';color:' + tOn(c) + '" title="' + esc(pname(p.praticienne)) + '">' + esc(initials(p)) + '</span>'; }
  function mergeText(src, dst) {
    var n = src.total || src.rdvs && src.rdvs.length || 0;
    var debut = n === 1 ? 'Le rendez-vous de « ' + fullName(src) + ' » passera' : (n ? 'Les ' + n + ' rendez-vous' : 'Les rendez-vous') + ' de « ' + fullName(src) + ' » passeront';
    return debut + ' sur la fiche « ' + fullName(dst) + ' ». La fiche « ' + fullName(src) + ' » disparaîtra.';
  }
  /** Fusionne la fiche src dans dst (src prend le nom de dst). Promise<{cle,…}|null> (null = annulé). */
  function doMerge(src, dst) {
    return Promise.resolve(G.confirm ? G.confirm({ title: 'Fusionner les deux fiches ?', text: mergeText(src, dst), ok: 'Fusionner' }) : true).then(function (ok) {
      if (!ok) return null;
      return G.API.admin('admin.renommerCliente', { cle: src.cle, prenom: dst.prenom, nom: dst.nom || '-', fusionner: true }).then(function (res) {
        if (G.toast) G.toast('Fiches fusionnées', { type: 'ok' });
        var cle = (res && res.cle) || dst.cle;
        fiches.forEach(function (x) { if (x.cle === src.cle) x.cle = cle; });
        if (G.emit) G.emit('change', { source: 'fusionClientes', ancienne: src.cle, cle: cle });
        return res || { cle: cle };
      });
    });
  }

  /* ---------------- fusion / complétion depuis la fiche ---------------- */
  // Liste déroulante de toutes les clientes : celles qui ont le même prénom en tête.
  function mergeOptions(f) {
    var m = f.mg, me = f.data;
    if (!m.list) return '<option value="">' + (m.err ? esc(m.err) : 'Chargement des clientes…') + '</option>';
    var others = m.list.filter(function (p) { return p.cle !== f.cle; });
    var fn = nk(me.prenom);
    var lab = function (p) { return fullName(p) + ' — ' + [pname(p.praticienne), pl(p.realises || 0, 'visite'), p.derniere ? 'dernière ' + fDateY(p.derniere) : ''].filter(Boolean).join(' · '); };
    var o = function (p) { return '<option value="' + esc(p.cle) + '"' + (m.sel === p.cle ? ' selected' : '') + '>' + esc(lab(p)) + '</option>'; };
    var same = others.filter(function (p) { return fn && nk(p.prenom) === fn; }).sort(function (a, b) { return incomplete(a) - incomplete(b) || (b.realises || 0) - (a.realises || 0); });
    var all = others.slice().sort(function (a, b) { return fullName(a).localeCompare(fullName(b), 'fr', { sensitivity: 'base' }); });
    return '<option value="">Choisir la cliente…</option>' +
      (same.length ? '<optgroup label="Même prénom (' + same.length + ')">' + same.map(o).join('') + '</optgroup>' : '') +
      '<optgroup label="Toutes les clientes (' + all.length + ')">' + all.map(o).join('') + '</optgroup>';
  }
  /** Sens de la fusion : on garde toujours le nom le plus complet. */
  function mergeDir(f, other) {
    var me = { cle: f.cle, prenom: f.data.prenom, nom: f.data.nom, total: f.data.total || (f.data.rdvs || []).length, praticienne: f.data.praticienne };
    return incomplete(other) && !incomplete(me) ? { src: other, dst: me } : { src: me, dst: other };
  }
  function mergeHint(f) {
    var m = f.mg, other = m && m.list && m.sel ? m.list.filter(function (p) { return p.cle === m.sel; })[0] : null;
    if (!other) return incomplete(f.data) ? 'Les rendez-vous de cette fiche iront sur la fiche choisie, avec son nom complet.' : 'Les deux fiches n’en feront plus qu’une.';
    var d = mergeDir(f, other); return mergeText(d.src, d.dst);
  }
  function mergeBlock(f) {
    var m = f.mg, d = f.data, inc = incomplete(d);
    var nom = String(d.nom || '').trim();
    return '<div class="mg" data-r="mg"><h4>' + (inc ? 'Compléter cette fiche' : 'Fusionner avec une autre fiche') + '</h4>' +
      (inc ? '<p class="mg-mode">' + (nom && nom !== '-' ? 'Nom incomplet (« ' + esc(nom) + ' »).' : 'Pas de nom de famille.') + ' Vérifiez ses rendez-vous plus bas, puis fusionnez-la avec la bonne cliente ou complétez son nom.</p>' : '') +
      '<label class="mg-lb" for="mg-sel-' + f.uid + '">C’est la même cliente que</label>' +
      '<div class="mg-row"><select id="mg-sel-' + f.uid + '" data-mg="sel"' + (m.list ? '' : ' disabled') + '>' + mergeOptions(f) + '</select>' +
      '<button class="btn pri" data-act="mg-go"' + (m.sel && !m.busy ? '' : ' disabled') + '>' + (m.busy ? 'Fusion…' : 'Fusionner') + '</button></div>' +
      '<p class="mg-mode" data-r="mg-hint">' + esc(mergeHint(f)) + '</p>' +
      (inc ? '<div class="mg-or">ou</div><button class="btn full" data-act="f-rn">' + icon('edit') + 'C’est une autre cliente : compléter son nom</button>' : '') +
      (f.completer ? '' : '<div class="mg-foot"><button class="btn" data-act="mg-cancel">Annuler</button></div>') + '</div>';
  }
  function initMerge(f) {
    f.mg = { sel: '', list: null, err: null, busy: false };
    var m = f.mg;
    Promise.resolve().then(function () { return G.clientes(); }).then(function (l) { if (f.mg !== m) return; m.list = l || []; paintMerge(f); },
      function (e) { if (f.mg !== m) return; m.err = (e && e.message) || 'Clientes indisponibles.'; paintMerge(f); });
  }
  function startMerge(f) { f.rn = null; initMerge(f); renderFiche(f); }
  function paintMerge(f) {
    var b = f.el.querySelector('[data-r="mg"]'); if (!b || !f.mg) return;
    var t = document.createElement('div'); t.innerHTML = mergeBlock(f);
    b.parentNode.replaceChild(t.firstChild, b);
  }
  function goMerge(f) {
    var m = f.mg; if (!m || m.busy || !m.sel) return;
    var other = (m.list || []).filter(function (p) { return p.cle === m.sel; })[0]; if (!other) return;
    var dir = mergeDir(f, other);
    m.busy = true; paintMerge(f);
    doMerge(dir.src, dir.dst).then(function (res) {
      if (f.mg !== m) return;
      m.busy = false;
      if (!res) { paintMerge(f); return; }
      if (f.completer) { closeFiche(f); return; }
      f.mg = null; f.cle = res.cle;
      try { if (f.panel && f.panel.setTitle) f.panel.setTitle(fullName(dir.dst)); } catch (e) { /* ignore */ }
      if (!G.emit) loadFiche(f);
    }).catch(function (e) {
      m.busy = false; paintMerge(f);
      if (G.toast) G.toast((e && e.message) || 'Fusion impossible.', { type: 'err' });
    });
  }
  /** Ferme une fiche (mode « compléter » : retour direct à la liste pour traiter la suivante). */
  function closeFiche(f) {
    fiches = fiches.filter(function (x) { return x !== f; });
    try { if (f.panel && f.panel.close) f.panel.close(); } catch (e) { /* ignore */ }
  }

  /* ---------------- renommer / fusionner ---------------- */
  // Même règle que le moteur (app/core.js NAME_RE) : lettres, espaces, tiret, apostrophe, point (initiales « B. »)
  var NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿŒœ' .\-]{1,40}$/;
  function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function checkName(prenom, nom) {
    if (!prenom) return { champ: 'prenom', msg: 'Le prénom est obligatoire.' };
    if (prenom.length > 40) return { champ: 'prenom', msg: 'Prénom : 40 caractères maximum.' };
    if (!NAME_RE.test(prenom)) return { champ: 'prenom', msg: 'Prénom : lettres, espaces, tiret, apostrophe ou point uniquement.' };
    if (nom.length > 40) return { champ: 'nom', msg: 'Nom : 40 caractères maximum.' };
    if (!NAME_RE.test(nom)) return { champ: 'nom', msg: 'Nom : lettres, espaces, tiret, apostrophe ou point uniquement.' };
    return null;
  }
  function renameHtml(f, style) {
    var r = f.rn, bad = r.champ;
    return '<div class="f-hero edit" style="' + style + '"><form data-r="rn" novalidate>' +
      '<div class="rn-row"><div class="rn-f"><label for="rn-pre-' + f.uid + '">Prénom</label><input id="rn-pre-' + f.uid + '" data-rn="prenom" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false" value="' + esc(r.prenom) + '"' + (bad === 'prenom' ? ' aria-invalid="true"' : '') + ' aria-describedby="rn-err-' + f.uid + '"></div>' +
      '<div class="rn-f"><label for="rn-nom-' + f.uid + '">Nom</label><input id="rn-nom-' + f.uid + '" data-rn="nom" maxlength="40" autocomplete="off" autocapitalize="words" spellcheck="false" value="' + esc(r.nom) + '"' + (bad === 'nom' ? ' aria-invalid="true"' : '') + ' aria-describedby="rn-err-' + f.uid + '"></div></div>' +
      '<p class="rn-err" id="rn-err-' + f.uid + '" role="alert">' + esc(r.err || '') + '</p>' +
      '<p class="rn-help">Pour fusionner deux fiches en double, donnez à l’une exactement le nom de l’autre.</p>' +
      '<div class="rn-act"><button type="button" class="btn" data-act="f-rn-cancel"' + (r.busy ? ' disabled' : '') + '>Annuler</button>' +
      '<button type="submit" class="btn pri" data-act="f-rn-save"' + (r.busy ? ' disabled' : '') + '>' + (r.busy ? 'Enregistrement…' : 'Enregistrer') + '</button></div>' +
      '</form></div>';
  }
  function startRename(f) {
    var d = f.data; if (!d) return;
    f.rn = { prenom: d.prenom || '', nom: d.nom === '-' ? '' : (d.nom || ''), err: '', champ: null, busy: false };
    renderFiche(f);
    setTimeout(function () { var i = f.el.querySelector('[data-rn="prenom"]'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* ignore */ } } }, 30);
  }
  function stopRename(f) { f.rn = null; renderFiche(f); var b = f.el.querySelector('[data-act="f-rn"]'); if (b) b.focus(); }
  function showRnErr(f) {
    var r = f.rn, e = f.el.querySelector('.rn-err'); if (!r || !e) return;
    e.textContent = r.err || '';
    ['prenom', 'nom'].forEach(function (k) { var i = f.el.querySelector('[data-rn="' + k + '"]'); if (i) { if (r.champ === k) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); } });
    f.el.querySelectorAll('.rn-act .btn').forEach(function (b) { b.disabled = !!r.busy; });
    var s = f.el.querySelector('[data-act="f-rn-save"]'); if (s) s.textContent = r.busy ? 'Enregistrement…' : 'Enregistrer';
  }
  function saveRename(f, fusionner) {
    var r = f.rn; if (!r || (r.busy && !fusionner)) return;
    var prenom = clean(r.prenom), nomSaisi = clean(r.nom), nom = nomSaisi || '-';
    var bad = checkName(prenom, nom);
    if (bad) { r.err = bad.msg; r.champ = bad.champ; showRnErr(f); var i = f.el.querySelector('[data-rn="' + bad.champ + '"]'); if (i) i.focus(); return; }
    if (U().clientKey(prenom, nom) === f.cle && prenom === (f.data.prenom || '') && nom === (f.data.nom || '-')) { stopRename(f); return; }
    r.err = ''; r.champ = null; r.busy = true; showRnErr(f);
    var oldCle = f.cle;
    var payload = { cle: oldCle, prenom: prenom, nom: nom }; if (fusionner) payload.fusionner = true;
    G.API.admin('admin.renommerCliente', payload).then(function (res) {
      var n = (res && res.modifies) || 0;
      f.cle = (res && res.cle) || U().clientKey(prenom, nom);
      f.rn = null;
      // les autres fiches ouvertes sur l'ancienne clé suivent la cliente
      fiches.forEach(function (x) { if (x !== f && x.cle === oldCle) x.cle = f.cle; });
      if (G.toast) G.toast(fusionner ? 'Fiches fusionnées' : 'Nom modifié sur ' + pl(n, 'rendez-vous', 'rendez-vous'), { type: 'ok' });
      if (f.completer && !incomplete({ nom: nom })) { closeFiche(f); if (G.emit) G.emit('change', { source: 'renommerCliente', ancienne: oldCle, cle: f.cle }); return; }
      try { if (f.panel && f.panel.setTitle) f.panel.setTitle(res.prenom + ' ' + res.nom); } catch (e) { /* ignore */ }
      if (G.emit) G.emit('change', { source: 'renommerCliente', ancienne: oldCle, cle: f.cle }); // vide les caches du shell, recharge la liste et les fiches
      else loadFiche(f);
    }).catch(function (e) {
      if (!f.rn) return;
      f.rn.busy = false;
      if (e && e.code === 'cliente_existante' && !fusionner) {
        showRnErr(f);
        Promise.resolve(G.confirm ? G.confirm({ title: 'Fusionner les deux fiches ?', text: e.message, ok: 'Fusionner' }) : false).then(function (ok) {
          if (ok && f.rn) saveRename(f, true);
          else { var i = f.el.querySelector('[data-rn="nom"]'); if (i) i.focus(); }
        });
        return;
      }
      f.rn.err = (e && e.message) || 'Erreur inattendue.';
      f.rn.champ = e && e.code === 'nom_requis' ? 'prenom' : null;
      showRnErr(f);
    });
  }

  function bindFiche(f) {
    f.el.addEventListener('submit', function (e) { e.preventDefault(); saveRename(f, false); });
    f.el.addEventListener('input', function (e) {
      var k = e.target.getAttribute && e.target.getAttribute('data-rn'); if (!k || !f.rn) return;
      f.rn[k] = e.target.value;
      if (f.rn.err) { f.rn.err = ''; f.rn.champ = null; showRnErr(f); }
    });
    f.el.addEventListener('change', function (e) {
      if (e.target.getAttribute && e.target.getAttribute('data-mg') === 'sel' && f.mg) {
        f.mg.sel = e.target.value;
        var go = f.el.querySelector('[data-act="mg-go"]'); if (go) go.disabled = !f.mg.sel;
        var h = f.el.querySelector('[data-r="mg-hint"]'); if (h) h.textContent = mergeHint(f);
      }
    });
    f.el.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && f.rn && e.target.getAttribute && e.target.getAttribute('data-rn')) { e.stopPropagation(); e.preventDefault(); if (!f.rn.busy) stopRename(f); }
    });
    f.el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !f.el.contains(b)) return;
      var a, d = f.data;
      if ((a = b.getAttribute('data-rdv'))) { if (G.openRdv) G.openRdv(a); return; }
      if ((a = b.getAttribute('data-reco')) != null && a !== '') {
        var c = f.recos && f.recos.creneaux[+a]; if (!c || !G.newRdv) return;
        G.newRdv({ cle: d.cle, prenom: d.prenom, nom: d.nom, praticienne: c.praticienne, services: (c.ordre && c.ordre.length ? c.ordre : (f.recos.services || [])).slice(), date: c.date, debut: c.debut });
        return;
      }
      a = b.getAttribute('data-act');
      if (a === 'f-mg') { startMerge(f); return; }
      if (a === 'mg-cancel') { f.mg = null; renderFiche(f); var mb = f.el.querySelector('[data-act="f-mg"]'); if (mb) mb.focus(); return; }
      if (a === 'mg-go') { goMerge(f); return; }
      if (a === 'f-full') { f.completer = false; renderFiche(f); return; }
      if (a === 'f-rn') { f.mg = null; startRename(f); return; }
      if (a === 'f-rn-cancel') { stopRename(f); return; }
      if (a === 'f-rn-save') { e.preventDefault(); saveRename(f, false); return; }
      if (a === 'f-new') { if (G.newRdv && d) G.newRdv({ cle: d.cle, prenom: d.prenom, nom: d.nom }); }
      else if (a === 'f-retry') { f.el.innerHTML = ficheSkeleton(); loadFiche(f); }
      else if (a === 'f-reco') { f.recoErr = null; var bb = f.el.querySelector('[data-r="recos-body"]'); if (bb) bb.innerHTML = recosHtml(f); loadRecos(f); }
      else if (a === 'f-past') { f.showPast += 20; renderFiche(f); }
    });
  }

  /* ---------------- événements globaux ---------------- */
  function hook() {
    if (hooked || !G.on) return; hooked = true;
    G.on('change', function () {
      if (mounted) load();
      fiches.forEach(function (f) { f.recos = null; f.recoErr = null; loadFiche(f); });
    });
    G.on('filtre', function () { if (mounted) { st.prat = null; st.n = 60; renderList(); } });
    G.on('theme', function () { if (mounted) renderList(); fiches.forEach(function (f) { if (f.data) renderFiche(f); }); });
    G.on('config', function () { if (mounted) renderList(); fiches.forEach(function (f) { if (f.data) renderFiche(f); }); });
    G.on('login', function () { profils = null; if (mounted) load(); });
  }

  G.register('clientes', {
    mount: function (container) {
      if (!container) return;
      injectCss(); hook();
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = document.createElement('div'); root.className = 'mod-clientes page';
      container.innerHTML = ''; container.appendChild(root);
      mounted = true; profils = null; st.prat = null;
      bindList(root); render(); load();
    },
    unmount: function () {
      mounted = false; tok++;
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null;
    },
    openClient: function (cle) { hook(); return openClient(cle); }
  });
})();

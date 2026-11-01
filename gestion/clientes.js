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
  var STATUTS = [['tous', 'Toutes'], ['relancer', 'À relancer'], ['avenir', 'RDV à venir'], ['inactives', 'Inactives']];
  var TRIS = [['derniere', 'Dernière visite'], ['visites', 'Nombre de visites'], ['prevue', 'Prochaine visite prévue'], ['az', 'A → Z']];
  var STATUT = { confirme: ['Confirmé', 'ok'], en_attente: ['À valider', 'warn'], annule: ['Annulé', 'danger'], refuse: ['Refusé', 'danger'], absente: ['Absente', 'danger'] };
  // Mot utilisé dans le message de relance selon la prestation habituelle
  var SOIN = { remplissage: 'remplissage', extension: 'rendez-vous', renfort: 'renfort', semi: 'semi-permanent', depose_pose_semi: 'semi-permanent',
    depose_gel: 'rendez-vous', depose_semi: 'rendez-vous', yumi: 'soin des pieds', yumi_semi: 'soin des pieds', yumi_depose_semi: 'soin des pieds' };

  var st = { q: '', prat: null, statut: 'tous', tri: 'derniere', n: 60 };
  var root = null, mounted = false, hooked = false, tok = 0, profils = null, err = null;
  var fiches = []; // fiches ouvertes {cle, panel, tok}

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
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function pcol(id) { try { return G.pratColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function pname(id) { try { return G.pratName(id) || id || ''; } catch (e) { return id || ''; } }
  function scol(id) { try { return G.svcColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function sname(id, c) { try { return G.svcName(id, c) || id; } catch (e) { return id; } }
  function tOn(hex) { try { return G.textOn(hex); } catch (e) { return '#fff'; } }
  function tint(hex, a) { try { return G.tint ? G.tint(hex, a) : hex; } catch (e) { return hex; } }
  function fullName(p) { return ((p.prenom || '') + ' ' + (p.nom || '')).trim() || 'Sans nom'; }
  function initials(p) { return ((p.prenom || '').charAt(0) + (p.nom || '').charAt(0)).toUpperCase() || '?'; }
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
  function aRelancer(p, t) { var pv = prevue(p); return !p.aVenir && !!pv && pv <= add(t, 7) && diff(p.derniere || pv, t) <= 365; }
  function inactive(p, t) { var last = p.derniere || p.premiere; return !p.aVenir && !!last && diff(last, t) > 90; }
  function matchStatut(p, s, t) {
    if (s === 'relancer') return aRelancer(p, t);
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
    '.mod-clientes .cl-tools{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}',
    '@container (min-width:900px){.mod-clientes .cl-tools{flex-direction:row;flex-wrap:wrap;align-items:center}.mod-clientes .cl-search{flex:1 1 300px;max-width:420px}}',
    '.mod-clientes .cl-search{position:relative;min-width:0}',
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
      '<div class="cl-tools"><div class="cl-search"><span class="ico">' + icon('search') + '</span><input type="search" data-r="q" placeholder="Rechercher une cliente" autocomplete="off" aria-label="Rechercher une cliente" value="' + esc(st.q) + '"></div>' +
      '<div class="chips" role="group" aria-label="Praticienne" data-r="prats"></div>' +
      '<div class="chips" role="group" aria-label="Statut" data-r="statuts"></div>' +
      '<label class="sel">Trier par <select data-r="tri">' + TRIS.map(function (t) { return '<option value="' + t[0] + '"' + (st.tri === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div data-r="list"></div>';
    renderList();
  }

  function renderList() {
    var el = root && root.querySelector('[data-r="list"]'); if (!el) return;
    var cnt = root.querySelector('[data-r="count"]');
    if (err && !profils) {
      el.innerHTML = '<div class="empty"><div class="big">' + icon('alert') + '</div><h3>Impossible de charger les clientes</h3><p>' + esc(err) + '</p><button class="btn pri" data-act="retry">Réessayer</button></div>';
      return;
    }
    if (!profils) { el.innerHTML = skeleton(8); if (cnt) cnt.textContent = 'Chargement…'; renderChips(null); return; }
    var t = today(), q = norm(st.q), pf = pratFilter();
    var byQ = profils.filter(function (p) {
      if (!q) return true;
      var a = norm(p.prenom + ' ' + p.nom), b = norm(p.nom + ' ' + p.prenom);
      return a.indexOf(q) >= 0 || b.indexOf(q) >= 0;
    });
    var byP = byQ.filter(function (p) { return pf === 'tous' || p.praticienne === pf; });
    renderChips({ byQ: byQ, byP: byP, t: t });
    var list = byP.filter(function (p) { return matchStatut(p, st.statut, t); });
    list.sort(sorter(st.tri));
    if (cnt) cnt.textContent = profils.length ? (list.length === profils.length ? pl(profils.length, 'cliente') : list.length + ' sur ' + pl(profils.length, 'cliente')) : '';
    if (!profils.length) {
      el.innerHTML = '<div class="empty"><div class="big">' + icon('users') + '</div><h3>Aucune cliente pour l’instant</h3><p>La base se remplit automatiquement avec chaque rendez-vous.</p>' + (G.newRdv ? '<button class="btn pri" data-act="new" style="margin-top:12px">' + icon('plus') + 'Nouveau RDV</button>' : '') + '</div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div class="empty"><h3>Aucune cliente</h3><p>' + (q ? 'Personne ne correspond à « ' + esc(st.q) + ' ».' : 'Aucune cliente dans ce filtre.') + '</p>' +
        ((q || st.statut !== 'tous' || st.prat) ? '<button class="btn" data-act="reset" style="margin-top:12px">Effacer les filtres</button>' : '') + '</div>';
      return;
    }
    el.innerHTML = '<ul class="cl-list">' + list.slice(0, st.n).map(function (p) { return '<li>' + item(p, t) + '</li>'; }).join('') + '</ul>' +
      (list.length > st.n ? '<button class="more" data-act="more">Afficher plus (' + (list.length - st.n) + ' restantes)</button>' : '');
  }

  function renderChips(c) {
    var pe = root.querySelector('[data-r="prats"]'), se = root.querySelector('[data-r="statuts"]');
    var pf = pratFilter(), t = c && c.t;
    if (pe) pe.innerHTML = [{ id: 'tous', nom: 'Toutes' }].concat(prats()).map(function (p) {
      var n = c ? (p.id === 'tous' ? c.byQ.length : c.byQ.filter(function (x) { return x.praticienne === p.id; }).length) : '';
      var col = p.id === 'tous' ? '' : pcol(p.id);
      return '<button class="chip"' + (col ? ' data-p="' + esc(p.id) + '" style="--pc:' + col + ';--pf:' + tOn(col) + '"' : '') + ' data-prat="' + esc(p.id) + '" aria-pressed="' + (pf === p.id) + '">' + (col ? '<i class="dot"></i>' : '') + esc(p.nom) + (c ? ' <span class="n">' + n + '</span>' : '') + '</button>';
    }).join('');
    if (se) se.innerHTML = STATUTS.map(function (s) {
      var n = c ? c.byP.filter(function (p) { return matchStatut(p, s[0], t); }).length : '';
      return '<button class="chip" data-statut="' + s[0] + '" aria-pressed="' + (st.statut === s[0]) + '"' + (s[0] === 'inactives' ? ' title="Sans visite depuis plus de 90 jours"' : s[0] === 'relancer' ? ' title="Prochaine visite prévue dépassée ou dans les 7 jours, sans RDV à venir"' : '') + '>' + s[1] + (s[0] === 'inactives' ? ' (+90 j)' : '') + (c ? ' <span class="n">' + n + '</span>' : '') + '</button>';
    }).join('');
  }

  function sorter(tri) {
    var t = today();
    if (tri === 'visites') return function (a, b) { return (b.realises || 0) - (a.realises || 0) || (b.derniere || '').localeCompare(a.derniere || ''); };
    if (tri === 'az') return function (a, b) { return fullName(a).localeCompare(fullName(b), 'fr', { sensitivity: 'base' }); };
    if (tri === 'prevue') return function (a, b) {
      // les clientes avec un RDV déjà pris passent après celles à relancer ; sans date prévue en dernier
      var ka = a.aVenir ? '2' + (a.prochain ? a.prochain.date : '') : prevue(a) ? '1' + prevue(a) : '3';
      var kb = b.aVenir ? '2' + (b.prochain ? b.prochain.date : '') : prevue(b) ? '1' + prevue(b) : '3';
      return ka.localeCompare(kb) || fullName(a).localeCompare(fullName(b), 'fr');
    };
    // Dernière visite réalisée (la plus récente d'abord) ; les clientes pas encore venues à la fin
    return function (a, b) { return (!a.derniere) - (!b.derniere) || (b.derniere || b.premiere || '').localeCompare(a.derniere || a.premiere || '') || fullName(a).localeCompare(fullName(b), 'fr'); };
  }

  function item(p, t) {
    var col = pcol(p.praticienne), h = p.habitude || {};
    var meta = [pl(p.realises || 0, 'visite')];
    if (h.frequenceJours) meta.push('tous les ' + h.frequenceJours + ' j');
    meta.push(p.derniere ? 'dernière ' + ago(p.derniere) : 'pas encore venue');
    var right = '', next = '';
    if (p.prochain) next = '<div class="cl-next"><b>RDV ' + esc(fDate(p.prochain.date)) + ' ' + esc(fH(p.prochain.debut)) + '</b> · ' + esc(pname(p.prochain.praticienne)) + '</div>';
    else if (aRelancer(p, t)) {
      var late = diff(prevue(p), t);
      next = '<div class="cl-next"><span class="tag warn">À relancer</span> ' + (late > 0 ? 'prévue le ' + esc(fDateY(prevue(p))) + ', ' + late + ' j de retard' : late === 0 ? 'prévue aujourd’hui' : 'prévue le ' + esc(fDateY(prevue(p))) + ' (' + inDays(prevue(p)) + ')') + '</div>';
    } else if (inactive(p, t)) right = '<span class="tag">Inactive</span>';
    else if (prevue(p)) next = '<div class="cl-next">Prochaine visite prévue vers le ' + esc(fDateY(prevue(p))) + '</div>';
    return '<button class="cl-item" data-cle="' + esc(p.cle) + '"><span class="av" style="background:' + col + ';color:' + tOn(col) + '">' + esc(initials(p)) + '</span>' +
      '<span class="cl-main"><div class="cl-name">' + esc(fullName(p)) + '</div><div class="cl-meta">' + esc(meta.join(' · ')) + '</div>' + next + '</span>' + right + '</button>';
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
      if ((a = b.getAttribute('data-prat'))) { st.prat = a; st.n = 60; renderList(); return; }
      if ((a = b.getAttribute('data-statut'))) { st.statut = a; st.n = 60; renderList(); return; }
      a = b.getAttribute('data-act');
      if (a === 'more') { st.n += 60; renderList(); }
      else if (a === 'retry') load();
      else if (a === 'new' && G.newRdv) G.newRdv({});
      else if (a === 'reset') { st.q = ''; st.statut = 'tous'; st.prat = 'tous'; render(); }
    });
    el.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-r') !== 'q') return;
      st.q = e.target.value; st.n = 60;
      clearTimeout(qTimer); qTimer = setTimeout(renderList, 60);
    });
    el.addEventListener('change', function (e) {
      if (e.target.getAttribute('data-r') === 'tri') { st.tri = e.target.value; renderList(); }
    });
  }

  /* ---------------- fiche cliente ---------------- */
  function openClient(cle) {
    if (!cle) return null;
    injectCss();
    var box = document.createElement('div');
    box.className = 'mod-clientes fiche';
    box.innerHTML = ficheSkeleton();
    var f = { cle: cle, el: box, tok: 0, data: null, recos: null, recoErr: null, recoLoading: false, showPast: 10 };
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
    H += '<div class="f-hero" style="--pc:' + col + ';--pf:' + tOn(col) + ';--hb:' + tint(col, 0.22) + ';--hf:var(--text)"><span class="av">' + esc(initials(d)) + '</span><div style="min-width:0"><h3>' + esc(fullName(d)) + '</h3><p>' +
      esc([d.praticienne ? 'Avec ' + pname(d.praticienne) : '', since].filter(Boolean).join(' · ')) + '</p></div></div>';

    H += '<div class="f-act">' +
      '<button class="btn pri" data-act="f-new">' + icon('plus') + 'Nouveau RDV</button>' +
      '<button class="btn" data-act="f-copy">' + icon('copy') + 'Message de relance</button>' +
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

    // Prochaine visite prévue
    var pv = h.prochaineVisitePrevue;
    if (d.prochain) {
      H += '<div class="f-sec"><div class="prev"><span class="ico">' + icon('calendar') + '</span><div><b>Prochain RDV ' + esc(fLong(d.prochain.date)) + ' à ' + esc(fH(d.prochain.debut)) + '</b><small>' + esc(pname(d.prochain.praticienne)) + ' · ' + esc((d.prochain.services || []).map(function (x) { return sname(x, true); }).join(' + ')) + ' · ' + inDays(d.prochain.date) + '</small></div></div></div>';
    } else if (pv) {
      var late = diff(pv, t);
      H += '<div class="f-sec"><div class="prev"><span class="ico">' + icon('clock') + '</span><div><b>Prochaine visite prévue ' + (late > 0 ? 'le ' + esc(fLong(pv)) : 'vers le ' + esc(fLong(pv))) + '</b><small>' +
        (late > 0 ? 'En retard de ' + pl(late, 'jour') + ', aucun RDV à venir' : late === 0 ? 'Aujourd’hui, aucun RDV à venir' : inDays(pv) + ', aucun RDV à venir') + '</small></div>' +
        (late >= -7 ? '<span class="tag warn" style="margin-left:auto">À relancer</span>' : '') + '</div></div>';
    }

    // Habitudes
    H += '<div class="f-sec"><h4>Ses habitudes <small>' + ((d.realises || 0) ? 'd’après ' + pl(d.realises, 'visite') : 'd’après ses RDV') + '</small></h4><div class="hab">' + habits(d) + '</div></div>';

    // Créneaux recommandés
    H += '<div class="f-sec" data-r="recos"><h4>Créneaux recommandés <small>' + esc(recoSub(d)) + '</small></h4><div data-r="recos-body">' + recosHtml(f) + '</div></div>';

    // RDV à venir et passés
    var rd = (d.rdvs || []).filter(function (r) { return r.type !== 'massage' || true; });
    var up = rd.filter(function (r) { return r.date >= t && (ACTIVE[r.statut]); }).sort(function (a, b) { return (a.date + a.debut).localeCompare(b.date + b.debut); });
    var past = rd.filter(function (r) { return !(r.date >= t && ACTIVE[r.statut]); }).sort(function (a, b) { return (b.date + b.debut).localeCompare(a.date + a.debut); });
    H += '<div class="f-sec"><h4>À venir <small>' + up.length + '</small></h4>' + (up.length ? '<ul class="rl">' + up.map(function (r) { return rdvRow(r, t); }).join('') + '</ul>' : '<p class="f-empty">Aucun rendez-vous à venir.</p>') + '</div>';
    H += '<div class="f-sec"><h4>Passés <small>' + past.length + '</small></h4>' + (past.length ? '<ul class="rl">' + past.slice(0, f.showPast).map(function (r) { return rdvRow(r, t); }).join('') + '</ul>' +
      (past.length > f.showPast ? '<button class="btn" data-act="f-past" style="width:100%;margin-top:8px">Voir les ' + (past.length - f.showPast) + ' autres</button>' : '') : '<p class="f-empty">Aucun rendez-vous passé.</p>') + '</div>';
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
      return '<button class="reco" data-reco="' + i + '" style="--pc:' + col + '"><span class="r1"><b>' + esc(cap(fDate(x.date))) + ' · ' + esc(fH(x.debut)) + '</b><span class="who"><i></i>' + esc(pname(x.praticienne)) + '</span>' + (i === 0 ? '<span class="best">Recommandé</span>' : '') + '</span>' +
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

  function rdvRow(r, t) {
    var stt = STATUT[r.statut] || [r.statut, ''], off = !ACTIVE[r.statut];
    var done = r.statut === 'confirme' && r.date < t;
    var svc = r.type === 'massage' ? (r.services || []).map(function (x) { return sname(x); }).join(' + ') : (r.services || []).map(function (x) { return sname(x, true); }).join(' + ');
    return '<li><button data-rdv="' + esc(r.id) + '" class="' + (off ? 'off' : '') + '" style="--pc:' + pcol(r.praticienne) + '"><span class="mcl-stripe"></span><span style="min-width:0"><b>' + esc(cap(fDate(r.date))) + (r.date.slice(0, 4) !== t.slice(0, 4) ? ' ' + r.date.slice(0, 4) : '') + ' · ' + esc(fH(r.debut)) + '</b><small>' + esc(pname(r.praticienne)) + ' · ' + esc(svc) + '</small></span>' +
      '<span class="tag ' + (done ? '' : stt[1]) + '">' + (done ? 'Réalisé' : stt[0]) + '</span></button></li>';
  }

  function relanceText(f) {
    var d = f.data, h = d.habitude || {}, prenom = (d.prenom || '').trim() || 'à toi';
    var main = (h.services || [])[0], soin = SOIN[main] || 'rendez-vous';
    var gen = soin === 'rendez-vous' || soin === 'renfort' || soin === 'remplissage' || soin === 'semi-permanent' || soin === 'soin des pieds' ? 'ton prochain ' + soin : 'ton prochain soin';
    var c = f.recos && f.recos.creneaux && f.recos.creneaux[0];
    if (c) return 'Bonjour ' + prenom + ', ' + gen + ' approche : je te propose ' + fLong(c.date) + ' à ' + fH(c.debut) + '. Dis-moi si ça te va !';
    return 'Bonjour ' + prenom + ', ' + gen + ' approche : dis-moi quand tu es disponible, je te trouve un créneau !';
  }

  function copy(text) {
    function fallback() {
      return new Promise(function (res, rej) {
        try {
          var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
          document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
          var ok = document.execCommand('copy'); document.body.removeChild(ta);
          ok ? res() : rej(new Error('copie'));
        } catch (e) { rej(e); }
      });
    }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(fallback);
    return fallback();
  }

  function bindFiche(f) {
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
      if (a === 'f-new') { if (G.newRdv && d) G.newRdv({ cle: d.cle, prenom: d.prenom, nom: d.nom }); }
      else if (a === 'f-retry') { f.el.innerHTML = ficheSkeleton(); loadFiche(f); }
      else if (a === 'f-reco') { f.recoErr = null; var bb = f.el.querySelector('[data-r="recos-body"]'); if (bb) bb.innerHTML = recosHtml(f); loadRecos(f); }
      else if (a === 'f-past') { f.showPast += 20; renderFiche(f); }
      else if (a === 'f-copy' && d) {
        var go = function () {
          var txt = relanceText(f);
          copy(txt).then(function () { if (G.toast) G.toast('Message copié : ' + txt, { type: 'ok' }); })
            .catch(function () { if (G.toast) G.toast('Copie impossible sur cet appareil. ' + txt, { type: 'err' }); });
        };
        if (!f.recos && f.recoLoading) {
          // attendre les recommandations (une seconde max) pour proposer un créneau dans le message
          var n = 0, iv = setInterval(function () { if (!f.recoLoading || ++n > 10) { clearInterval(iv); go(); } }, 100);
        } else go();
      }
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
    G.on('config', function () { if (mounted) renderList(); });
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

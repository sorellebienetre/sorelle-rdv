/* Sorelle Bien-Être, interface de gestion : vue « Statistiques ».
 * Module autonome (contrat window.G : docs/GESTION-V2-SPEC.md §1 et §3).
 * Tout est calculé dans le navigateur à partir de G.historique() (+ G.clientes() pour les clientes à risque).
 * Graphiques en SVG faits main, bulles d'info au survol (souris) ou au toucher (mobile).
 */
(function () {
  'use strict';
  var G = window.G;
  if (!G || typeof G.register !== 'function') return;

  var ACTIVE = { confirme: 1, en_attente: 1 };
  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_L = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JC = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  var JL = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  var JF = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var PERIODES = [['semaine', 'Semaine', 'Cette semaine'], ['mois', 'Mois', 'Ce mois'], ['moisDernier', 'Mois dernier', 'Mois dernier'], ['3mois', '3 mois', '3 derniers mois'], ['annee', 'Année', 'Année'], ['perso', 'Dates', 'Dates personnalisées…']];
  var SF = [['actifs', 'Réalisés et à venir'], ['realise', 'Réalisés'], ['avenir', 'À venir'], ['annule', 'Annulés'], ['absente', 'Absences'], ['tous', 'Tous']];
  var SVGNS = 'http://www.w3.org/2000/svg';
  var LSK = 'sorelle.stats.';

  function lsGet(k, def) { try { var v = window.localStorage.getItem(LSK + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } }
  function lsSet(k, v) { try { window.localStorage.setItem(LSK + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }

  var st = {
    period: lsGet('period', 'mois'), du: lsGet('du', ''), au: lsGet('au', ''), cle: null, cleNom: '',
    stat: 'actifs', svc: '', grp: 'auto', stack: lsGet('stack', 'prat'), bk: null, lq: '', ln: 30,
    hm: 'occ', hstep: 0, risk: !!lsGet('risk', false)
  };
  if (!PERIODES.some(function (p) { return p[0] === st.period; })) st.period = 'mois';
  if (['prat', 'presta', 'statut'].indexOf(st.stack) < 0) st.stack = 'prat';
  var root = null, mounted = false, hooked = false, tok = 0, ro = null, lastW = 0, data = null, model = null, err = null;
  var TIPS = {}, tipEl = null, tipFrom = null, hovEl = null;

  /* ---------------- outils ---------------- */
  function U() { return G.U || (window.SorelleCore && window.SorelleCore._); }
  function esc(s) { return G.esc ? G.esc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(n) { try { return G.icon ? G.icon(n) : ''; } catch (e) { return ''; } }
  function today() { return G.today ? G.today() : U().addDays('2026-01-01', 0); }
  function add(d, n) { return U().addDays(d, n); }
  function diff(a, b) { return U().diffDays(a, b); }
  function wd(d) { return U().weekday(d); }
  function toMin(h) { return U().toMin(h); }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim(); }
  function nf(n, dec) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: dec || 0, minimumFractionDigits: 0 }); }
  function pct(x) { return x == null || isNaN(x) ? '—' : nf(Math.round(x * 100)) + ' %'; }
  function hours(h) { return nf(Math.round(h * 10) / 10, 1) + ' h'; }
  function fDur(h) { var m = Math.round(h * 60), hh = Math.floor(m / 60), mm = m % 60; return hh ? hh + ' h' + (mm ? ' ' + (mm < 10 ? '0' : '') + mm : '') : mm + ' min'; }
  function monthStart(d) { return d.slice(0, 8) + '01'; }
  function addMonths(d, n) { var y = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return y + '-' + (m < 9 ? '0' : '') + (m + 1) + '-01'; }
  function monthEnd(d) { return add(addMonths(monthStart(d), 1), -1); }
  function weekStart(d) { return add(d, -((wd(d) + 6) % 7)); }
  function dayNum(d) { var j = +d.slice(8, 10); return j === 1 ? '1er' : String(j); }
  function fDate(d) { return JC[wd(d)] + ' ' + dayNum(d) + ' ' + MOIS[+d.slice(5, 7) - 1]; }
  function fDM(d) { return dayNum(d) + ' ' + MOIS[+d.slice(5, 7) - 1]; }
  function fMonth(d, long) { return (long ? MOIS_L : MOIS)[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fH(h) { if (!h) return ''; var p = h.split(':'); return (+p[0]) + 'h' + (p[1] === '00' ? '' : p[1]); }
  function fMin(m) { var h = Math.floor(m / 60), r = m % 60; return h + 'h' + (r ? (r < 10 ? '0' : '') + r : ''); }
  /** Heure d'un RDV selon le réglage Apparence (début seul par défaut, plage si activée). */
  function fHR(h, fin) { try { if (G.heure) return G.heure(h, fin); } catch (e) { /* repli */ } return fH(h); }
  function dur(r) { var a = toMin(r.debut), b = toMin(r.fin); return isNaN(a) || isNaN(b) ? 0 : Math.max(0, b - a) / 60; }
  function key(r) { return U().clientKey(r.prenom || '', r.nom || ''); }
  function fullName(r) { return ((r.prenom || '') + ' ' + (r.nom || '')).trim() || 'Sans nom'; }
  function pcol(id) { try { return G.pratColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function pname(id) { try { return G.pratName(id) || id; } catch (e) { return id; } }
  function scol(id) { try { return G.svcColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function sname(id, court) { try { return G.svcName(id, court) || id; } catch (e) { return id; } }
  function textOn(c) { try { return G.textOn(c); } catch (e) { return '#fff'; } }
  function filtrePrat() { var p = G.filtre && G.filtre.prat; return p === 'laurie' || p === 'lea' ? p : 'tous'; }
  function allPrats() { try { return G.prats() || []; } catch (e) { return []; } }
  function prats() { var f = filtrePrat(), all = allPrats(); return f === 'tous' ? all : all.filter(function (p) { return p.id === f; }); }
  function svcList() { try { return G.svcs ? G.svcs() : []; } catch (e) { return []; } }
  function niceMax(v) {
    if (!(v > 0)) return 4;
    var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var steps = p >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 3, 4, 5, 6, 8, 10], m = 10;
    for (var i = 0; i < steps.length; i++) if (n <= steps[i]) { m = steps[i]; break; }
    var r = Math.max(1, m * p) * 4; return r < 4 ? 4 : r;
  }
  function verb() { try { return window.matchMedia('(hover: hover)').matches ? 'Cliquez' : 'Touchez'; } catch (e) { return 'Touchez'; } }
  function isOpen(cfg, d) { try { return !!U().dayRules(cfg, d); } catch (e) { return false; } }
  /** Statut « métier » d'un RDV : realise, avenir, annule, absente ou autre (demande passée jamais validée). */
  function stOf(r, t) {
    if (r.statut === 'annule' || r.statut === 'refuse') return 'annule';
    if (r.statut === 'absente') return 'absente';
    if (ACTIVE[r.statut] && r.date >= t) return 'avenir';
    if (r.statut === 'confirme') return 'realise';
    return 'autre';
  }
  function statMatch(r, f, t) {
    var s = stOf(r, t);
    if (f === 'actifs') return s === 'realise' || s === 'avenir';
    if (f === 'tous') return true;
    return s === f;
  }
  function svcMatch(r) {
    if (!st.svc) return true;
    var ids = r.services || [];
    if (st.svc.indexOf('cat:') === 0) { var c = st.svc.slice(4), L = svcList(); return ids.some(function (id) { return L.some(function (s) { return s.id === id && s.categorie === c; }); }); }
    return ids.indexOf(st.svc) >= 0;
  }
  function primarySvc(r) {
    var ids = r.services || [], L = svcList(), main = ids.filter(function (id) { return L.some(function (s) { return s.id === id && s.categorie === 'main'; }); })[0];
    return main || ids[0] || '?';
  }

  /* ---------------- périodes ---------------- */
  function range(kind) {
    var t = today(), du, au, pdu, pau, label, plabel, pshort;
    if (kind === 'semaine') {
      du = weekStart(t); au = add(du, 6); pdu = add(du, -7); pau = add(du, -1);
      label = 'Semaine du ' + fDM(du) + ' au ' + fDM(au); plabel = 'à la semaine précédente'; pshort = 'sem. préc.';
    } else if (kind === 'moisDernier') {
      du = addMonths(t, -1); au = monthEnd(du); pdu = addMonths(t, -2); pau = monthEnd(pdu);
      label = cap(fMonth(du, true)); plabel = 'à ' + fMonth(pdu, true); pshort = MOIS[+pdu.slice(5, 7) - 1];
    } else if (kind === '3mois') {
      du = addMonths(t, -2); au = monthEnd(t); pdu = addMonths(t, -5); pau = add(du, -1);
      label = cap(MOIS_L[+du.slice(5, 7) - 1]) + ' à ' + fMonth(au, true); plabel = 'aux 3 mois précédents'; pshort = '3 mois préc.';
    } else if (kind === 'annee') {
      var y = t.slice(0, 4); du = y + '-01-01'; au = y + '-12-31'; pdu = (y - 1) + '-01-01'; pau = (y - 1) + '-12-31';
      label = 'Année ' + y; plabel = 'à l’année ' + (y - 1); pshort = String(y - 1);
    } else if (kind === 'perso') {
      du = st.du || monthStart(t); au = st.au || t; if (au < du) { var x = du; du = au; au = x; }
      if (diff(du, au) > 800) au = add(du, 800);
      var len = diff(du, au) + 1; pau = add(du, -1); pdu = add(pau, -(len - 1));
      label = 'Du ' + fDM(du) + ' au ' + fDM(au) + ' ' + au.slice(0, 4); plabel = 'aux ' + len + ' jours précédents'; pshort = 'période préc.';
    } else {
      du = monthStart(t); au = monthEnd(t); pdu = addMonths(t, -1); pau = monthEnd(pdu);
      label = cap(fMonth(du, true)); plabel = 'à ' + fMonth(pdu, true); pshort = MOIS[+pdu.slice(5, 7) - 1];
    }
    return { du: du, au: au, pdu: pdu, pau: pau, label: label, plabel: plabel, pshort: pshort, len: diff(du, au) + 1 };
  }

  /* ---------------- calculs ---------------- */
  function openDays(cfg, du, au, until) {
    var n = 0, nPast = 0;
    for (var d = du, g = 0; d <= au && g < 900; d = add(d, 1), g++) if (isOpen(cfg, d)) { n++; if (d < until) nPast++; }
    return { all: n, past: nPast };
  }

  /** Indicateurs d'une période. base = RDV clients déjà filtrés (praticienne, cliente). */
  function kpis(base, du, au, ctx) {
    var t = ctx.today, cfg = ctx.cfg, max = cfg.maxClientesJour || 6;
    var list = base.filter(function (r) { return r.date >= du && r.date <= au; });
    var k = { total: list.length, done: 0, upcoming: 0, h: 0, annul: 0, abs: 0, uniq: 0, nouv: 0, freq: null, freqN: 0, fill: null, fillAll: null, perPrat: {} };
    var uniq = {}, gaps = [];
    list.forEach(function (r) {
      var done = r.statut === 'confirme' && r.date < t, up = ACTIVE[r.statut] && r.date >= t;
      if (done) { k.done++; k.h += dur(r); }
      if (up) k.upcoming++;
      if (r.statut === 'annule' || r.statut === 'refuse') k.annul++;
      if (r.statut === 'absente') k.abs++;
      if (done || up) { var c = key(r); uniq[c] = 1; if (ctx.first[c] === r.id) k.nouv++; }
      if (done && ctx.prevGap[r.id] != null) gaps.push(ctx.prevGap[r.id]);
    });
    k.uniq = Object.keys(uniq).length;
    k.freqN = gaps.length;
    k.freq = gaps.length ? gaps.reduce(function (a, b) { return a + b; }, 0) / gaps.length : null;
    var od = openDays(cfg, du, au, t), sumDone = 0, sumBooked = 0, capPast = 0, capAll = 0;
    ctx.prats.forEach(function (p) {
      var d = 0, b = 0;
      list.forEach(function (r) {
        if (r.praticienne !== p.id) return;
        if (r.statut === 'confirme' && r.date < t) d++;
        else if (ACTIVE[r.statut] && r.date >= t) b++;
      });
      k.perPrat[p.id] = { done: d, booked: b, fill: od.past ? d / (od.past * max) : null, fillAll: od.all ? (d + b) / (od.all * max) : null };
      sumDone += d; sumBooked += b; capPast += od.past * max; capAll += od.all * max;
    });
    k.fill = capPast ? sumDone / capPast : null;
    k.fillAll = capAll ? (sumDone + sumBooked) / capAll : null;
    k.open = od; k.max = max;
    return k;
  }

  /** Contexte calculé une fois sur tout l'historique : 1re visite, écart avec la visite précédente. */
  function history(all) {
    var by = {}, first = {}, prevGap = {};
    all.forEach(function (r) {
      if (!(r.statut === 'confirme' || ACTIVE[r.statut])) return;
      (by[key(r)] = by[key(r)] || []).push(r);
    });
    Object.keys(by).forEach(function (c) {
      var l = by[c].sort(function (a, b) { return (a.date + a.debut).localeCompare(b.date + b.debut); });
      first[c] = l[0].id;
      var last = null;
      l.forEach(function (r) {
        if (last && r.date !== last) { var g = diff(last, r.date); if (g >= 7 && g <= 120) prevGap[r.id] = g; }
        if (r.date !== last) last = r.date;
      });
    });
    return { first: first, prevGap: prevGap };
  }

  /** Découpage d'une plage en tranches (jour, semaine, mois). */
  function buckets(du, au, g, cfg, openOnly) {
    var out = [], x, n = 0;
    if (g === 'jour') { for (x = du; x <= au && n < 900; x = add(x, 1), n++) if (!openOnly || isOpen(cfg, x)) out.push({ du: x, au: x }); }
    else if (g === 'semaine') { for (x = weekStart(du); x <= au && n < 200; x = add(x, 7), n++) out.push({ du: x, au: add(x, 6) }); }
    else { for (x = monthStart(du); x <= au && n < 60; x = addMonths(x, 1), n++) out.push({ du: x, au: monthEnd(x) }); }
    return out;
  }

  /** Mini-courbes des indicateurs : tranches écoulées de la période (au moins 6 points, quitte à remonter avant). */
  function sparkSeries(m) {
    var R = m.R, t = m.t, g = R.len <= 10 ? 'jour' : R.len <= 100 ? 'semaine' : 'mois';
    var end = R.au < t ? R.au : add(t, -1);
    var bs = buckets(R.du <= end ? R.du : end, end, g, m.cfg, true), guard = 0;
    while (bs.length < 6 && guard++ < 40) {
      var f = bs.length ? bs[0].du : end, p;
      if (g === 'jour') { p = add(f, -1); while (!isOpen(m.cfg, p) && guard++ < 60) p = add(p, -1); bs.unshift({ du: p, au: p }); }
      else if (g === 'semaine') { p = add(weekStart(f), -7); bs.unshift({ du: p, au: add(p, 6) }); }
      else { p = addMonths(f, -1); bs.unshift({ du: p, au: monthEnd(p) }); }
    }
    bs = bs.filter(function (b) { return b.au >= m.dataStart; });
    return bs.map(function (b) { var e = b.au > end ? end : b.au; var k = kpis(m.base, b.du, e, m.ctx); k.bdu = b.du; k.bau = e; return k; });
  }

  function buildModel() {
    var cfg = (G.cfg && G.cfg()) || (window.SorelleCore && SorelleCore.DEFAULT_CONFIG);
    var t = today(), P = prats(), pids = {}; P.forEach(function (p) { pids[p.id] = 1; });
    var all = (data.hist || []).filter(function (r) { return r && r.type !== 'massage' && r.date; });
    var massages = (data.hist || []).filter(function (r) { return r && r.type === 'massage' && r.statut === 'confirme' && r.date < t && (filtrePrat() === 'tous' || r.praticienne === filtrePrat()); });
    var h = history(all);
    var base = all.filter(function (r) { return pids[r.praticienne] && (!st.cle || key(r) === st.cle); });
    var R = range(st.period);
    var ctx = { today: t, cfg: cfg, prats: P, first: h.first, prevGap: h.prevGap };
    var dataStart = all.reduce(function (mn, r) { return r.date < mn ? r.date : mn; }, '9999');
    var cur = kpis(base, R.du, R.au, ctx);
    // Période en cours : on compare ce qui est comparable (jours déjà écoulés) à la même durée de la période précédente
    var partial = R.au >= t && R.du < t, elapsed = partial ? diff(R.du, t) : 0;
    var cmpCur = partial ? kpis(base, R.du, add(t, -1), ctx) : cur;
    var prev = null;
    if (R.du < t && R.pau >= dataStart) prev = partial ? kpis(base, R.pdu, add(R.pdu, elapsed - 1), ctx) : kpis(base, R.pdu, R.pau, ctx);
    if (partial && !(cmpCur.open && cmpCur.open.past)) prev = null;
    var inP = base.filter(function (r) { return r.date >= R.du && r.date <= R.au; });
    var m = { cfg: cfg, t: t, P: P, all: all, base: base, R: R, cur: cur, prev: prev, cc: cmpCur, partial: partial, inP: inP, ctx: ctx, dataStart: dataStart,
      modelages: massages.filter(function (r) { return r.date >= R.du && r.date <= R.au; }).length };
    m.spark = sparkSeries(m);
    return m;
  }

  /* ---------------- CSS ---------------- */
  var CSS = [
    '.mod-stats{container-type:inline-size;position:relative;color:var(--text);font-family:var(--sans,Outfit,-apple-system,system-ui,sans-serif);padding:14px 16px 96px;max-width:1500px;margin:0 auto;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}',
    '.mod-stats *{box-sizing:border-box}',
    '.mod-stats button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.mod-stats input,.mod-stats select{font:inherit;font-size:16px;color:var(--text)}',
    '.mod-stats :focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
    /* en-tête */
    '.mod-stats .st-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:2px 16px;margin:0 0 12px}',
    '.mod-stats .st-title{font-family:var(--serif);font-size:30px;font-weight:600;line-height:1.05;margin:0;color:var(--text);letter-spacing:0}',
    '.mod-stats .st-sub{color:var(--muted);font-size:13px;margin:0 0 3px}',
    /* barre outils : recherche + période sur la même ligne */
    '.mod-stats .st-tools{display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:nowrap}',
    '.mod-stats .st-cli{position:relative;flex:1 1 auto;min-width:0;max-width:440px}',
    '.mod-stats .st-in{min-height:42px;border:1px solid var(--line);border-radius:999px;background:var(--surface);padding:0 14px;color-scheme:light dark;min-width:0;width:100%}',
    '.mod-stats .st-in:focus{outline:none;border-color:var(--accent)}',
    '.mod-stats .st-cli .st-in{padding-left:40px}',
    '.mod-stats .st-cli>.ico{position:absolute;left:13px;top:11px;color:var(--muted);pointer-events:none;width:20px;height:20px}',
    '.mod-stats .ico svg{width:20px;height:20px;display:block}',
    '.mod-stats .st-grow{flex:1 1 0;min-width:0}',
    '.mod-stats .st-sugg{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);max-height:300px;overflow:auto;padding:4px}',
    '.mod-stats .st-sugg button{display:flex;width:100%;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border-radius:10px;text-align:left}',
    '.mod-stats .st-sugg button:hover,.mod-stats .st-sugg button.on{background:var(--surface-2)}',
    '.mod-stats .st-sugg small{color:var(--muted);margin-left:auto;font-size:12px}',
    '.mod-stats .seg{display:inline-flex;background:var(--surface-2);border-radius:999px;padding:3px;gap:2px;max-width:100%;box-shadow:inset 0 0 0 1px var(--line);flex:0 0 auto}',
    '.mod-stats .seg button{min-height:34px;padding:0 13px;border-radius:999px;font-size:13.5px;font-weight:500;color:var(--text-sub);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}',
    '.mod-stats .seg button:hover{color:var(--text)}',
    '.mod-stats .seg button[aria-pressed="true"]{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.14)}',
    '.mod-stats .seg button[disabled]{opacity:.38;pointer-events:none}',
    '.mod-stats .seg button svg{width:15px;height:15px}',
    '.mod-stats .seg.sm button{min-height:30px;padding:0 10px;font-size:12.5px}',
    '.mod-stats .st-per-seg{display:none}',
    '.mod-stats .st-sel{-webkit-appearance:none;appearance:none;min-height:42px;border:1px solid var(--line);border-radius:999px;background:var(--surface) url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%238E9583%27 stroke-width=%272.5%27 stroke-linecap=%27round%27%3E%3Cpath d=%27M6 9l6 6 6-6%27/%3E%3C/svg%3E") no-repeat right 12px center;padding:0 32px 0 14px;font-size:14px!important;font-weight:500;color:var(--text);max-width:100%;min-width:0;color-scheme:light dark;cursor:pointer;text-overflow:ellipsis}',
    '.mod-stats .st-sel:focus{outline:none;border-color:var(--accent)}',
    '.mod-stats .st-sel.sm{min-height:36px;font-size:13px!important}',
    '.mod-stats .st-per-sel{flex:0 0 auto;width:auto;max-width:48%}',
    '@container (min-width:860px){.mod-stats .st-per-seg{display:inline-flex}.mod-stats .st-per-sel{display:none}}',
    '.mod-stats .st-dates{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:-2px 0 12px;justify-content:flex-end}',
    '.mod-stats .st-dates label{display:flex;align-items:center;font-size:13px;color:var(--text-sub);gap:6px}',
    '.mod-stats .st-dates input{min-height:38px;border:1px solid var(--line);border-radius:999px;background:var(--surface);padding:0 12px;color-scheme:light dark;font-size:14px}',
    '.mod-stats .pill{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 6px 0 14px;border-radius:999px;background:var(--sage-bg,var(--surface-2));color:var(--sage-fg,var(--text));border:1px solid var(--line);font-weight:500;font-size:14px;min-width:0;max-width:100%}',
    '.mod-stats .pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.mod-stats .pill button{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:inherit;flex:0 0 auto}',
    '.mod-stats .pill button svg{width:16px;height:16px}',
    '.mod-stats .pill.sm{min-height:32px;font-size:13px;padding-left:12px}',
    '.mod-stats .pill.sm button{width:26px;height:26px}',
    '.mod-stats .lnk{color:var(--accent);font-weight:500;font-size:14px;min-height:40px;padding:0 6px;white-space:nowrap}',
    '.mod-stats .dot{display:inline-block;width:9px;height:9px;border-radius:50%;flex:0 0 auto}',
    /* indicateurs */
    '.mod-stats .st-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}',
    '@container (min-width:760px){.mod-stats .st-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}}',
    '.mod-stats .kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:13px 14px 10px;min-width:0;display:flex;flex-direction:column;gap:3px;position:relative;overflow:hidden}',
    '.mod-stats .kpi .k-l{font-size:12.5px;color:var(--text-sub);font-weight:500;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .kpi .k-v{font-size:30px;font-weight:600;line-height:1.08;color:var(--text);letter-spacing:-.02em;white-space:nowrap}',
    '.mod-stats .kpi .k-v small{font-size:15px;font-weight:500;color:var(--text-sub);letter-spacing:0;margin-left:2px}',
    '.mod-stats .kpi .k-d{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:22px}',
    '.mod-stats .kpi .k-s{font-size:12px;color:var(--muted);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .kpi .k-s b{font-weight:600;color:var(--text-sub)}',
    '.mod-stats .kpi [data-chart]{min-height:34px;margin:4px -2px 0}',
    '.mod-stats .dl{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:600;white-space:nowrap;padding:2px 7px 2px 6px;border-radius:999px;line-height:1.3}',
    '.mod-stats .dl.up{color:var(--ok);background:color-mix(in srgb,var(--ok) 13%,transparent)}',
    '.mod-stats .dl.down{color:var(--danger);background:color-mix(in srgb,var(--danger) 12%,transparent)}',
    '.mod-stats .dl.eq{color:var(--text-sub);background:var(--surface-2)}',
    '.mod-stats .dl-vs{font-size:11.5px;color:var(--muted);white-space:nowrap}',
    '@container (max-width:420px){.mod-stats .st-title{font-size:26px}.mod-stats .kpi{padding:11px 12px 8px}.mod-stats .kpi .k-v{font-size:26px}.mod-stats .dl-vs{display:none}}',
    /* cartes */
    '.mod-stats .st-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-bottom:14px}',
    '@container (min-width:760px){.mod-stats .st-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mod-stats .span2{grid-column:1/-1}}',
    '.mod-stats .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:15px 16px 13px;min-width:0;margin-bottom:14px}',
    '.mod-stats .st-grid>.card{margin-bottom:0}',
    '.mod-stats .c-h{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:8px 12px}',
    '.mod-stats .c-h>div:first-child{min-width:0}',
    '.mod-stats .card h3{font-family:var(--serif);font-size:21px;font-weight:600;margin:0;color:var(--text);line-height:1.15;letter-spacing:0}',
    '.mod-stats .card .c-sub{font-size:12.5px;color:var(--muted);margin:2px 0 10px}',
    '.mod-stats .card .c-sub b{color:var(--text-sub);font-weight:600}',
    '.mod-stats .c-ctl{display:flex;flex-wrap:wrap;gap:6px;align-items:center}',
    '.mod-stats .f-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 10px}',
    '.mod-stats .f-row .st-sel{flex:0 1 auto;max-width:280px}',
    '@container (max-width:520px){.mod-stats .f-row{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}.mod-stats .f-row .st-sel{width:100%}}',
    '.mod-stats .chips{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:2px 16px}',
    '.mod-stats .chips::-webkit-scrollbar{display:none}',
    '.mod-stats .chip{flex:0 0 auto;min-height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--text-sub);font-size:13px;font-weight:500;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}',
    '.mod-stats .chip:hover{border-color:var(--sage-line,var(--line))}',
    '.mod-stats .chip[aria-pressed="true"]{background:var(--accent);color:var(--accent-text);border-color:var(--accent)}',
    '.mod-stats .chip .n{font-size:11.5px;opacity:.72}',
    '.mod-stats .sumry{display:flex;flex-wrap:wrap;gap:4px 18px;font-size:12.5px;color:var(--muted);margin:8px 0 0}',
    '.mod-stats .sumry b{color:var(--text);font-weight:600;font-size:13.5px}',
    '.mod-stats .legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--text-sub);margin:8px 0 0;align-items:center}',
    '.mod-stats .legend span{display:inline-flex;align-items:center;gap:6px}',
    '.mod-stats .legend i{width:11px;height:11px;border-radius:3px;display:inline-block}',
    '.mod-stats .legend i.dash{height:0;border-top:1.5px dashed var(--text-sub);width:14px;border-radius:0}',
    '.mod-stats .legend i.hatch{background:repeating-linear-gradient(135deg,var(--line) 0 2px,transparent 2px 5px);box-shadow:inset 0 0 0 1px var(--line)}',
    '.mod-stats .legend i.free{background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line)}',
    '.mod-stats .legend .hm-scale{display:inline-flex;align-items:flex-start;gap:8px}',
    '.mod-stats .legend .hm-scale>b{font-weight:500;padding-top:0;line-height:12px}',
    '.mod-stats .legend .hm-sw{display:inline-flex;gap:2px;align-items:flex-start}',
    '.mod-stats .legend .hm-sw em{display:inline-flex;flex-direction:column;align-items:stretch;gap:3px;font-style:normal;font-size:10.5px;line-height:1.1;color:var(--muted);min-width:40px;text-align:center;white-space:nowrap}',
    '.mod-stats .legend .hm-sw em i{width:auto;height:10px;border-radius:3px;display:block}',
    '.mod-stats [data-chart]{width:100%;min-height:40px;position:relative}',
    '.mod-stats [data-chart] svg{display:block;overflow:visible}',
    '.mod-stats .cw{display:flex;width:100%;min-width:0}',
    '.mod-stats .cw>svg{flex:0 0 auto}',
    '.mod-stats .sc{flex:1 1 auto;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}',
    '.mod-stats svg .ax{fill:var(--muted);font-size:11px;font-family:inherit}',
    '.mod-stats svg .ax2{fill:var(--text-sub);font-size:10.5px;font-family:inherit;font-weight:600}',
    '.mod-stats svg .axs{fill:var(--text-sub);font-size:12px;font-family:inherit}',
    '.mod-stats svg .vl{fill:var(--text);font-size:11px;font-weight:600;font-family:inherit}',
    '.mod-stats svg .gl{stroke:var(--line);stroke-width:1}',
    '.mod-stats svg .bl{stroke:var(--line-3,var(--line));stroke-width:1}',
    '.mod-stats svg .avg{stroke:var(--text-sub);stroke-width:1.2;stroke-dasharray:3 4}',
    '.mod-stats svg .thr{stroke:var(--text-sub);stroke-width:1.2;stroke-dasharray:3 4}',
    '.mod-stats svg .bgc{fill:var(--surface-2)}',
    '.mod-stats svg .fut{fill:var(--surface-2);opacity:.55}',
    '.mod-stats svg .hit{fill:transparent;cursor:pointer}',
    '.mod-stats svg .bk{transition:opacity .15s}',
    '.mod-stats svg.dim .bk:not(.hov):not(.sel){opacity:.42}',
    '.mod-stats svg .bk.hov .hit,.mod-stats svg .ln-hit.hov{fill:var(--text);fill-opacity:.045}',
    '.mod-stats svg .bk.sel .hit{fill:var(--accent);fill-opacity:.09}',
    '.mod-stats svg .hc{cursor:pointer}',
    '.mod-stats svg .hc.hov rect{stroke:var(--text);stroke-width:1.6}',
    '.mod-stats svg .pr.hov .bgc{fill:color-mix(in srgb,var(--text) 9%,var(--surface-2))}',
    /* bulle */
    '.mod-stats .st-tip{position:absolute;z-index:40;pointer-events:none;background:var(--inv-bg,var(--text));color:var(--inv-fg,var(--bg));border-radius:12px;padding:9px 11px;font-size:12.5px;line-height:1.4;box-shadow:0 8px 24px rgba(0,0,0,.22);min-width:140px;max-width:250px;opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s}',
    '.mod-stats .st-tip.on{opacity:1;transform:none}',
    '.mod-stats .st-tip b.t{display:block;font-weight:600;font-size:13px;margin-bottom:4px}',
    '.mod-stats .st-tip .r{display:flex;align-items:center;gap:7px;justify-content:space-between}',
    '.mod-stats .st-tip .r span{display:inline-flex;align-items:center;gap:6px;opacity:.85}',
    '.mod-stats .st-tip .r i{width:8px;height:8px;border-radius:2px;display:inline-block}',
    '.mod-stats .st-tip .r b{font-weight:600}',
    '.mod-stats .st-tip .r.tot{border-top:1px solid color-mix(in srgb,currentColor 22%,transparent);margin-top:4px;padding-top:4px}',
    '.mod-stats .st-tip .f{display:block;opacity:.66;font-size:11.5px;margin-top:4px}',
    /* listes */
    '.mod-stats .empty-c{color:var(--muted);font-size:14px;padding:24px 0;text-align:center}',
    '.mod-stats .rk{list-style:none;margin:0;padding:0}',
    '.mod-stats .rk li{border-top:1px solid var(--line)}',
    '.mod-stats .rk li:first-child{border-top:0}',
    '.mod-stats .rk button,.mod-stats .rk .row{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:6px 2px;text-align:left}',
    '.mod-stats .rk .nm{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.mod-stats .rk .nm small{display:block;font-weight:400;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .rk .v{font-weight:600;white-space:nowrap}',
    '.mod-stats .rk .rnk{width:20px;color:var(--muted);font-size:13px;text-align:right;flex:0 0 auto}',
    '.mod-stats .rk .mbar{width:64px;height:5px;border-radius:9px;background:var(--surface-2);overflow:hidden;flex:0 0 auto}',
    '.mod-stats .rk .mbar i{display:block;height:100%;border-radius:9px}',
    '@container (max-width:420px){.mod-stats .rk .mbar{display:none}}',
    '.mod-stats .av{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:13px;font-weight:600;flex:0 0 auto}',
    '.mod-stats .tag{display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--surface-2);color:var(--text-sub)}',
    '.mod-stats .tag.warn{color:var(--warn)}.mod-stats .tag.danger{color:var(--danger)}.mod-stats .tag.ok{color:var(--ok)}',
    '.mod-stats .tbl-w{overflow-x:auto;margin:0 -4px}',
    '.mod-stats table{width:100%;border-collapse:collapse;font-size:14px}',
    '.mod-stats th{font-weight:500;color:var(--muted);font-size:12.5px;text-align:right;padding:6px 6px;border-bottom:1px solid var(--line);white-space:nowrap}',
    '.mod-stats td{padding:9px 6px;text-align:right;border-bottom:1px solid var(--line);white-space:nowrap}',
    '.mod-stats th:first-child,.mod-stats td:first-child{text-align:left}',
    '.mod-stats tr.cur td{font-weight:600}',
    '.mod-stats tr.fut td{color:var(--text-sub)}',
    '.mod-stats .fbar{display:inline-block;vertical-align:middle;width:44px;height:6px;border-radius:9px;background:var(--surface-2);margin-left:6px;overflow:hidden}',
    '.mod-stats .fbar i{display:block;height:100%;background:var(--accent);border-radius:9px}',
    '@container (max-width:420px){.mod-stats .fbar{display:none}.mod-stats td,.mod-stats th{padding-left:4px;padding-right:4px}}',
    '.mod-stats .ls{border-top:1px solid var(--line);margin:14px -16px 0;padding:12px 16px 0}',
    '.mod-stats .ls-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 4px}',
    '.mod-stats .ls-h h4{font-size:14px;font-weight:600;margin:0;color:var(--text);flex:0 0 auto}',
    '.mod-stats .ls-h h4 small{font-weight:400;color:var(--muted);font-size:12.5px;margin-left:4px}',
    '.mod-stats .ls-h .st-in{flex:1 1 180px;max-width:300px;min-height:36px;font-size:14px!important;margin-left:auto}',
    '.mod-stats .rl{list-style:none;margin:0;padding:0}',
    '.mod-stats .rl li{border-top:1px solid var(--line)}',
    '.mod-stats .rl li:first-child{border-top:0}',
    '.mod-stats .rl button{display:grid;grid-template-columns:88px minmax(0,1fr) auto;gap:4px 10px;align-items:center;width:100%;min-height:52px;padding:8px 2px;text-align:left}',
    '.mod-stats .rl .d{font-size:13px;color:var(--text-sub);line-height:1.25}',
    '.mod-stats .rl .d b{display:block;color:var(--text);font-weight:600;font-size:13.5px}',
    '.mod-stats .rl .w{min-width:0}',
    '.mod-stats .rl .w b{display:flex;align-items:center;gap:7px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .rl .w small{display:block;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .more{display:block;margin:10px auto 2px;min-height:40px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text-sub);font-weight:500;font-size:14px}',
    '.mod-stats .note{font-size:12.5px;color:var(--muted);margin:10px 0 0}',
    /* interrupteur clientes à risque */
    '.mod-stats .st-foot{display:flex;justify-content:center;margin:22px 0 10px}',
    '.mod-stats .sw-btn{display:inline-flex;align-items:center;gap:10px;min-height:44px;padding:0 6px;font-size:13.5px;color:var(--text-sub)}',
    '.mod-stats .sw-btn .st-sw{width:36px;height:22px;border-radius:99px;background:var(--surface-2);box-shadow:inset 0 0 0 1px var(--line-3,var(--line));position:relative;transition:background .2s;flex:0 0 auto}',
    '.mod-stats .sw-btn .st-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s}',
    '.mod-stats .sw-btn[aria-checked="true"] .st-sw{background:var(--accent);box-shadow:none}',
    '.mod-stats .sw-btn[aria-checked="true"] .st-sw::after{transform:translateX(14px)}',
    /* états */
    '.mod-stats .st-empty{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:40px 20px;text-align:center;color:var(--text-sub)}',
    '.mod-stats .st-empty .big{width:48px;height:48px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center;margin:0 auto 12px;color:var(--muted)}',
    '.mod-stats .st-empty h3{color:var(--text);font-size:17px;margin:0 0 6px}',
    '.mod-stats .btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 20px;border-radius:999px;background:var(--accent);color:var(--accent-text);font-weight:500;margin-top:12px}',
    '.mod-stats .sk{background:var(--surface-2);border-radius:8px;position:relative;overflow:hidden}',
    '.mod-stats .sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--surface) 60%,transparent),transparent);animation:mst-sh 1.3s infinite}',
    '@keyframes mst-sh{100%{transform:translateX(100%)}}',
    '@media (prefers-reduced-motion:reduce){.mod-stats .sk::after{animation:none}.mod-stats .st-tip,.mod-stats .sw-btn .st-sw::after{transition:none}}'
  ].join('\n');

  function injectCss() {
    var old = document.querySelector('style[data-module="stats"]');
    if (old && old.textContent === CSS) return;
    if (old) old.parentNode.removeChild(old);
    var s = document.createElement('style'); s.setAttribute('data-module', 'stats'); s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- rendu ---------------- */
  function skeleton() {
    var k = ''; for (var i = 0; i < 4; i++) k += '<div class="kpi"><div class="sk" style="height:12px;width:55%"></div><div class="sk" style="height:30px;width:45%;margin-top:8px"></div><div class="sk" style="height:30px;margin-top:10px"></div></div>';
    return '<div class="st-kpis" aria-busy="true">' + k + '</div><div class="card"><div class="sk" style="height:18px;width:40%"></div><div class="sk" style="height:220px;margin-top:14px;border-radius:12px"></div></div>';
  }

  function render() {
    if (!root) return;
    hideTip();
    root.innerHTML = '<div class="st-head" data-r="head"></div><div class="st-tools" data-r="tools"></div><div data-r="dates"></div><div data-r="body"></div><div class="st-tip" role="tooltip" aria-hidden="true"></div>';
    tipEl = root.querySelector('.st-tip');
    renderTools();
    renderBody();
  }

  function renderHead() {
    var el = root && root.querySelector('[data-r="head"]'); if (!el) return;
    var R = model ? model.R : range(st.period), f = filtrePrat();
    var sub = (f !== 'tous' ? pname(f) + ' · ' : '') + (model && model.prev ? 'Comparé ' + R.plabel + (model.partial ? ', à nombre de jours égal' : '') : (model && model.partial ? 'Période en cours' : ''));
    el.innerHTML = '<h2 class="st-title">' + esc(R.label) + '</h2>' + (sub ? '<p class="st-sub">' + esc(sub) + '</p>' : '');
  }

  function renderTools() {
    var el = root && root.querySelector('[data-r="tools"]'); if (!el) return;
    var t = today(), R = range(st.period);
    var h = '';
    if (st.cle) {
      h += '<span class="pill"><span>' + esc(st.cleNom) + '</span><button data-act="clear-cli" aria-label="Retirer le filtre cliente">' + icon('x') + '</button></span>' +
        (G.openClient || (G.modules && G.modules.clientes) ? '<button class="lnk" data-act="fiche">Fiche</button>' : '') + '<span class="st-grow"></span>';
    } else {
      h += '<div class="st-cli"><span class="ico">' + icon('search') + '</span><input class="st-in" data-r="cli" type="search" autocomplete="off" placeholder="Une cliente…" aria-label="Filtrer par cliente"><div class="st-sugg" data-r="sugg" hidden></div></div><span class="st-grow"></span>';
    }
    h += '<div class="seg st-per-seg" role="group" aria-label="Période">' + PERIODES.map(function (p) {
      var lb = p[0] === 'annee' ? t.slice(0, 4) : p[1];
      return '<button data-period="' + p[0] + '" aria-pressed="' + (st.period === p[0]) + '">' + (p[0] === 'perso' ? icon('calendar') : '') + esc(lb) + '</button>';
    }).join('') + '</div>';
    h += '<select class="st-sel st-per-sel" data-sel="period" aria-label="Période">' + PERIODES.map(function (p) {
      var lb = p[0] === 'annee' ? 'Année ' + t.slice(0, 4) : p[2];
      return '<option value="' + p[0] + '"' + (st.period === p[0] ? ' selected' : '') + '>' + esc(lb) + '</option>';
    }).join('') + '</select>';
    el.innerHTML = h;
    var d = root.querySelector('[data-r="dates"]');
    if (d) d.innerHTML = st.period === 'perso' ? '<div class="st-dates"><label>Du<input type="date" data-date="du" value="' + esc(st.du || R.du) + '" min="2024-01-01" max="2030-12-31"></label>' +
      '<label>au<input type="date" data-date="au" value="' + esc(st.au || R.au) + '" min="2024-01-01" max="2030-12-31"></label></div>' : '';
  }

  /* ----- indicateurs ----- */
  function delta(cur, prev, opts) {
    opts = opts || {};
    if (prev == null || cur == null || !model.prev) return '';
    var d, txt;
    if (opts.points) { d = Math.round((cur - prev) * 100); txt = Math.abs(d) + ' pt'; }
    else {
      if (!prev) return cur ? '<span class="dl eq">nouveau</span>' : '';
      d = Math.round((cur - prev) / prev * 100); txt = Math.abs(d) + ' %';
    }
    var cls = d === 0 || opts.neutral ? 'eq' : (d > 0) !== !!opts.invert ? 'up' : 'down';
    var arrow = d > 0 ? '▲' : d < 0 ? '▼' : '=';
    var lab = (d > 0 ? 'Hausse de ' : d < 0 ? 'Baisse de ' : 'Stable, ') + txt;
    return '<span class="dl ' + cls + '" title="' + esc(lab + ' · période précédente : ' + (opts.fmt ? opts.fmt(prev) : nf(prev))) + '"><span aria-hidden="true" style="font-size:9px">' + arrow + '</span>' + (d === 0 ? '' : txt) + '</span><span class="dl-vs">vs ' + esc(model.R.pshort) + '</span>';
  }

  function kpiDefs(m) {
    var c = m.cur, p = m.prev || {}, q = m.cc, P = m.P, out = [];
    var subDone = [c.upcoming ? '<b>+ ' + nf(c.upcoming) + '</b> à venir' : '', (c.annul + c.abs) ? nf(c.annul) + ' annul. · ' + nf(c.abs) + ' abs.' : ''].filter(Boolean).join(' · ') || (c.open.past ? nf(c.open.past) + ' jours ouverts écoulés' : 'Période à venir');
    out.push({ l: 'RDV réalisés', v: nf(c.done), d: delta(q.done, p.done), s: subDone, f: function (k) { return k.done; }, fmt: function (v) { return nf(v) + ' RDV'; } });
    if (!st.cle) {
      var v = c.fill != null ? c.fill : c.fillAll;
      var parts = P.length > 1 ? P.map(function (x) { var z = c.perPrat[x.id]; return esc(x.nom) + ' <b>' + pct(c.fill != null ? z.fill : z.fillAll) + '</b>'; }).join(' · ') : nf(c.open.past || c.open.all) + ' j × ' + c.max + ' clientes';
      out.push({ l: 'Taux de remplissage', v: v == null ? '—' : nf(Math.round(v * 100)) + '<small>%</small>', d: c.fill != null ? delta(q.fill, p.fill, { points: true, fmt: pct }) : '', s: c.fill == null ? 'Réservé à ce jour · ' + parts : parts, f: function (k) { return k.fill == null ? null : k.fill * 100; }, fmt: function (v) { return nf(Math.round(v)) + ' %'; } });
      out.push({ l: 'Clientes venues', v: nf(c.uniq), d: delta(q.uniq, p.uniq), s: c.nouv ? 'dont <b>' + nf(c.nouv) + '</b> nouvelle' + (c.nouv > 1 ? 's' : '') : 'Aucune nouvelle cliente', f: function (k) { return k.uniq; }, fmt: function (v) { return nf(v) + ' clientes'; } });
    }
    out.push({ l: 'Heures de soins', v: nf(Math.round(c.h * 10) / 10, 1) + '<small>h</small>', d: delta(q.h, p.h, { fmt: hours }), s: c.done ? '≈ <b>' + fDur(c.h / c.done) + '</b> par RDV' + (m.modelages ? ' · hors modelages' : '') : 'Aucun soin réalisé', f: function (k) { return Math.round(k.h * 10) / 10; }, fmt: hours });
    if (st.cle) {
      out.push({ l: 'Revient tous les', v: c.freq != null ? nf(Math.round(c.freq)) + '<small>j</small>' : '—', d: '', s: c.freqN ? 'Moyenne sur ' + c.freqN + ' retour' + (c.freqN > 1 ? 's' : '') : 'Pas assez de visites', f: function (k) { return k.done; }, fmt: function (v) { return nf(v) + ' RDV'; }, nospark: true });
      out.push({ l: 'Annulations', v: nf(c.annul + c.abs), d: delta(q.annul + q.abs, p.annul != null ? p.annul + p.abs : null, { invert: true }), s: nf(c.annul) + ' annulé' + (c.annul > 1 ? 's' : '') + ' · ' + nf(c.abs) + ' absence' + (c.abs > 1 ? 's' : ''), f: function (k) { return k.annul + k.abs; }, fmt: function (v) { return nf(v); } });
    }
    return out;
  }

  function renderKpis(m) {
    m.kdefs = kpiDefs(m);
    return '<div class="st-kpis">' + m.kdefs.map(function (k, i) {
      return '<div class="kpi"><span class="k-l">' + esc(k.l) + '</span><span class="k-v">' + k.v + '</span><span class="k-d">' + (k.d || '<span class="dl-vs">' + (model.partial && !model.prev ? 'Comparaison dès le 1er jour ouvert' : '&nbsp;') + '</span>') + '</span>' +
        '<span class="k-s">' + k.s + '</span>' + (k.nospark ? '' : '<div data-chart="spark-' + i + '"></div>') + '</div>';
    }).join('') + '</div>';
  }

  function chartSpark(m, W, i) {
    var k = m.kdefs[i], S = m.spark, vals = S.map(function (x) { return k.f(x); });
    var pts = []; vals.forEach(function (v, j) { if (v != null) pts.push([j, v]); });
    if (pts.length < 2) return '';
    var H = 34, pad = 4, mx = Math.max.apply(null, pts.map(function (p) { return p[1]; })), mn = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    if (mx === mn) { mx += 1; mn = Math.max(0, mn - 1); }
    mn = Math.min(mn, mx - (mx - mn) * 1.25 < 0 ? 0 : mn);
    var n = vals.length, x = function (j) { return pad + (n <= 1 ? 0 : j * (W - pad * 2) / (n - 1)); }, y = function (v) { return pad + (H - pad * 2) * (1 - (v - mn) / (mx - mn)); };
    var d = '', a = '';
    pts.forEach(function (p, j) { d += (j ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1); });
    a = d + 'L' + x(pts[pts.length - 1][0]).toFixed(1) + ' ' + H + 'L' + x(pts[0][0]).toFixed(1) + ' ' + H + 'Z';
    var last = pts[pts.length - 1], id = 'spark-' + i, tips = TIPS[id] = [], s = '';
    s += '<path d="' + a + '" style="fill:var(--accent);fill-opacity:.08"/>';
    s += '<path d="' + d + '" fill="none" style="stroke:var(--accent)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>';
    s += '<circle cx="' + x(last[0]).toFixed(1) + '" cy="' + y(last[1]).toFixed(1) + '" r="3" style="fill:var(--accent);stroke:var(--surface)" stroke-width="1.5"/>';
    var slot = (W - pad * 2) / Math.max(1, n - 1);
    S.forEach(function (b, j) {
      if (vals[j] == null) return;
      var g = S.length <= 10 && b.bdu === b.bau ? cap(fDate(b.bdu)) : b.bdu.slice(8) === '01' && b.bau === monthEnd(b.bdu) ? cap(fMonth(b.bdu, true)) : 'Semaine du ' + fDM(b.bdu);
      tips.push('<b class="t">' + esc(g) + '</b><span class="r"><span>' + esc(k.l) + '</span><b>' + esc(k.fmt(vals[j])) + '</b></span>');
      s += '<rect class="hit ln-hit" data-ti="' + id + ':' + (tips.length - 1) + '" x="' + (x(j) - slot / 2).toFixed(1) + '" y="0" width="' + slot.toFixed(1) + '" height="' + H + '"/>';
    });
    return svg(W, H, s, 'Évolution : ' + k.l);
  }

  function cardHead(title, subTxt, ctl) {
    return '<div class="c-h"><div><h3>' + esc(title) + '</h3>' + (subTxt ? '<p class="c-sub">' + subTxt + '</p>' : '') + '</div>' + (ctl ? '<div class="c-ctl">' + ctl + '</div>' : '') + '</div>';
  }
  function seg(attr, opts, cur, sm, label) {
    return '<div class="seg' + (sm ? ' sm' : '') + '" role="group" aria-label="' + esc(label || '') + '">' + opts.map(function (o) {
      return '<button data-' + attr + '="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '"' + (o[2] ? ' disabled' : '') + '>' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function renderBody() {
    var el = root && root.querySelector('[data-r="body"]'); if (!el) return;
    hideTip();
    if (err) {
      el.innerHTML = '<div class="st-empty"><div class="big">' + icon('alert') + '</div><h3>Impossible de charger les statistiques</h3><p>' + esc(err) + '</p><button class="btn" data-act="retry">Réessayer</button></div>';
      return;
    }
    if (!data) { renderHead(); el.innerHTML = skeleton(); return; }
    model = buildModel(); renderHead();
    var m = model;
    if (!m.all.length) {
      el.innerHTML = '<div class="st-empty"><div class="big">' + icon('chart') + '</div><h3>Pas encore de statistiques</h3><p>Les chiffres apparaîtront ici dès les premiers rendez-vous enregistrés.</p></div>';
      return;
    }
    TIPS = {};
    var h = renderKpis(m);
    h += '<section class="card" data-r="rdv"></section>';
    h += '<div class="st-grid">';
    if (!st.cle) {
      var seuil = (m.cfg.magie && m.cfg.magie.seuilRemplissage) || 50;
      h += '<section class="card">' + cardHead('Remplissage par semaine', 'RDV ÷ (jours ouverts × ' + (m.cfg.maxClientesJour || 6) + ' clientes) · semaines à venir : déjà réservé') + '<div data-chart="remplissage"></div>' +
        legendHTML(m.P.map(function (p) { return [pcol(p.id), p.nom]; }), '<span><i class="dash"></i>Seuil ' + seuil + ' %</span>') + '</section>';
    }
    h += '<section class="card">' + cardHead('Par prestation', 'RDV réalisés et à venir sur la période') + '<div data-chart="presta"></div></section>';
    h += '</div>';
    h += '<section class="card" data-r="heat"></section>';
    h += '<div class="st-grid">' + topClients(m) + recap(m) + '</div>';
    if (!st.cle) {
      h += '<div class="st-foot"><button class="sw-btn" role="switch" data-act="risk" aria-checked="' + st.risk + '"><span class="st-sw" aria-hidden="true"></span>Afficher les clientes à risque</button></div>';
      if (st.risk) h += riskClients(m);
    }
    el.innerHTML = h;
    renderRdv();
    renderHeat();
    drawCharts();
  }

  function legendHTML(items, extra) {
    return '<div class="legend">' + items.map(function (x) { return '<span><i style="background:' + x[0] + (x[2] ? ';opacity:' + x[2] : '') + '"></i>' + esc(x[1]) + '</span>'; }).join('') + (extra || '') + '</div>';
  }

  /* ----- Rendez-vous sur la période : graphique + liste ----- */
  function autoGrp(R) { return R.len <= 35 ? 'jour' : R.len <= 124 ? 'semaine' : 'mois'; }
  function curGrp(R) { var g = st.grp === 'auto' ? autoGrp(R) : st.grp; if (g === 'jour' && R.len > 124) g = 'semaine'; return g; }
  function curStack(m) { return st.stack === 'prat' && m.P.length < 2 ? 'statut' : st.stack; }

  /** Catégories empilées selon le mode « Couleurs ». */
  function cats(m, list) {
    var mode = curStack(m), t = m.t, out = [];
    if (mode === 'prat') {
      m.P.forEach(function (p) { out.push({ id: p.id, label: p.nom, col: pcol(p.id), op: 1 }); });
      var fut = list.some(function (r) { return stOf(r, t) === 'avenir'; });
      if (fut) m.P.forEach(function (p) { out.push({ id: p.id + '~', label: p.nom + ' · à venir', col: pcol(p.id), op: 0.45, fut: 1 }); });
      return { mode: mode, list: out, of: function (r) { return r.praticienne + (stOf(r, t) === 'avenir' ? '~' : ''); } };
    }
    if (mode === 'statut') {
      out = [{ id: 'realise', label: 'Réalisés', col: 'var(--accent)', op: 1 }, { id: 'avenir', label: 'À venir', col: 'var(--accent)', op: 0.42 }, { id: 'annule', label: 'Annulés', col: 'var(--clay)', op: 1 }, { id: 'absente', label: 'Absences', col: 'var(--text-sub)', op: 0.75 }, { id: 'autre', label: 'Non validés', col: 'var(--muted)', op: 0.5 }];
      var seen = {}; list.forEach(function (r) { seen[stOf(r, t)] = 1; });
      return { mode: mode, list: out.filter(function (c) { return seen[c.id]; }), of: function (r) { return stOf(r, t); } };
    }
    var cnt = {}; list.forEach(function (r) { var s = primarySvc(r); cnt[s] = (cnt[s] || 0) + 1; });
    var ids = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }), top = ids.slice(0, ids.length > 6 ? 5 : 6), tm = {};
    top.forEach(function (id) { tm[id] = 1; out.push({ id: id, label: sname(id, true), full: sname(id), col: scol(id), op: 1 }); });
    if (ids.length > top.length) out.push({ id: '_autres', label: 'Autres', col: 'var(--muted)', op: 0.6 });
    return { mode: mode, list: out, of: function (r) { var s = primarySvc(r); return tm[s] ? s : '_autres'; } };
  }

  function rdvList(m) { var t = m.t; return m.inP.filter(function (r) { return statMatch(r, st.stat, t) && svcMatch(r); }); }

  function rdvSeries(m) {
    var R = m.R, g = curGrp(R), list = rdvList(m), C = cats(m, list);
    var bs = buckets(R.du, R.au, g, m.cfg, false), idx = {};
    if (g === 'jour') bs = bs.filter(function (b) { return isOpen(m.cfg, b.du) || list.some(function (r) { return r.date === b.du; }); });
    bs.forEach(function (b, i) { b.v = {}; b.tot = 0; idx[g === 'jour' ? b.du : g === 'semaine' ? b.du : b.du.slice(0, 7)] = i; });
    list.forEach(function (r) {
      var k = g === 'jour' ? r.date : g === 'semaine' ? weekStart(r.date) : r.date.slice(0, 7), i = idx[k];
      if (i == null) return;
      var c = C.of(r), b = bs[i]; b.v[c] = (b.v[c] || 0) + 1; b.tot++;
    });
    return { g: g, bs: bs, C: C, list: list };
  }

  function bucketLabel(b, g, long) {
    if (g === 'jour') return long ? cap(JF[wd(b.du)]) + ' ' + fDM(b.du) : cap(fDate(b.du));
    if (g === 'semaine') return 'Semaine du ' + fDM(b.du) + ' au ' + fDM(b.au);
    return cap(fMonth(b.du, true));
  }

  function renderRdv() {
    var el = root && root.querySelector('[data-r="rdv"]'); if (!el || !model) return;
    var m = model, R = m.R, t = m.t, g = curGrp(R), P = allPrats(), f = filtrePrat();
    var counts = {}; SF.forEach(function (x) { counts[x[0]] = 0; });
    m.inP.forEach(function (r) { if (!svcMatch(r)) return; SF.forEach(function (x) { if (statMatch(r, x[0], t)) counts[x[0]]++; }); });
    var ctl = seg('grp', [['jour', 'Jour', R.len > 124], ['semaine', 'Semaine'], ['mois', 'Mois']], g, true, 'Regrouper par');
    var h = cardHead('Rendez-vous sur la période', '', ctl);
    h += '<div class="chips" role="group" aria-label="Statut">' + SF.map(function (x) {
      return '<button class="chip" data-stat="' + x[0] + '" aria-pressed="' + (st.stat === x[0]) + '">' + esc(x[1]) + ' <span class="n">' + nf(counts[x[0]]) + '</span></button>';
    }).join('') + '</div>';
    var svcs = svcList(), cats2 = {};
    svcs.forEach(function (s) { (cats2[s.categorie] = cats2[s.categorie] || []).push(s); });
    var CATL = { main: 'Mains', pied: 'Pieds' };
    h += '<div class="f-row">';
    // Praticienne : filtre global du planning (sélecteur « Les deux / Laurie / Léa » juste au-dessus)
    h += '<select class="st-sel sm" data-sel="svc" aria-label="Prestation"><option value="">Toutes prestations</option>' + Object.keys(cats2).map(function (c) {
      return '<option value="cat:' + esc(c) + '"' + (st.svc === 'cat:' + c ? ' selected' : '') + '>' + esc(CATL[c] || cap(c)) + ' (toutes)</option><optgroup label="' + esc(CATL[c] || cap(c)) + '">' + cats2[c].map(function (s) { return '<option value="' + esc(s.id) + '"' + (st.svc === s.id ? ' selected' : '') + '>' + esc(s.nom) + '</option>'; }).join('') + '</optgroup>';
    }).join('') + '</select>';
    h += '<select class="st-sel sm" data-sel="stack" aria-label="Couleurs des barres">' + [['prat', 'Par praticienne'], ['presta', 'Par prestation'], ['statut', 'Par statut']].map(function (o) {
      return '<option value="' + o[0] + '"' + (curStack(m) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select></div>';
    h += '<div data-chart="rdv"></div><div data-r="rdv-leg"></div>';
    h += '<div class="ls" data-r="liste"></div>';
    el.innerHTML = h;
    renderList();
  }

  function rdvLegend(S) {
    var el = root && root.querySelector('[data-r="rdv-leg"]'); if (!el) return;
    var C = S.C, items = C.list.filter(function (c) { return !c.fut; }).map(function (c) { return [c.col, c.label, c.op < 1 ? c.op : 0]; });
    var extra = C.list.some(function (c) { return c.fut; }) ? '<span><i style="background:var(--text-sub);opacity:.35"></i>Teinte claire : à venir</span>' : '';
    extra += '<span><i class="dash"></i>Moyenne</span>';
    var tot = S.list.length, bs = S.bs, peak = null;
    bs.forEach(function (b) { if (!peak || b.tot > peak.tot) peak = b; });
    var unit = S.g === 'jour' ? 'jour ouvert' : S.g === 'semaine' ? 'semaine' : 'mois';
    var sum = '<div class="sumry"><span><b>' + nf(tot) + '</b> RDV</span>' + (bs.length > 1 ? '<span><b>' + nf(tot / bs.length, 1) + '</b> par ' + unit + ' en moyenne</span>' : '') + (peak && peak.tot && bs.length > 1 ? '<span>Pic : <b>' + nf(peak.tot) + '</b> ' + esc(S.g === 'jour' ? 'le ' + fDate(peak.du) : S.g === 'semaine' ? 'sem. du ' + fDM(peak.du) : 'en ' + fMonth(peak.du, true)) + '</span>' : '') + '</div>';
    el.innerHTML = legendHTML(items, extra) + sum;
  }

  function renderList() {
    var el = root && root.querySelector('[data-r="liste"]'); if (!el || !model) return;
    var m = model, t = m.t, q = norm(st.lq);
    var list = rdvList(m).filter(function (r) {
      if (st.bk && (r.date < st.bk.du || r.date > st.bk.au)) return false;
      if (q && norm(fullName(r) + ' ' + (r.code || '')).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.date + b.debut).localeCompare(a.date + a.debut); });
    var keepFocus = document.activeElement && document.activeElement.getAttribute('data-r') === 'lq';
    var head = '<div class="ls-h"><h4>Détail<small>' + nf(list.length) + ' RDV</small></h4>' +
      (st.bk ? '<span class="pill sm"><span>' + esc(st.bk.label) + '</span><button data-act="clear-bk" aria-label="Retirer le filtre de date">' + icon('x') + '</button></span>' : '') +
      (st.cle ? '' : '<input class="st-in" data-r="lq" type="search" placeholder="Nom ou code" aria-label="Rechercher dans les RDV" value="' + esc(st.lq) + '">') + '</div>' +
      (st.bk ? '' : '<p class="c-sub" style="margin:0 0 4px">' + verb() + ' une barre pour ne voir que ses rendez-vous.</p>');
    var rows = list.slice(0, st.ln).map(function (r) {
      var s = stOf(r, t), col = pcol(r.praticienne);
      var tag = { realise: ['Réalisé', ''], avenir: [r.statut === 'en_attente' ? 'À valider' : 'À venir', r.statut === 'en_attente' ? 'warn' : 'ok'], annule: [r.statut === 'refuse' ? 'Refusé' : 'Annulé', 'danger'], absente: ['Absente', 'danger'], autre: ['Non validé', 'warn'] }[s];
      var svc = (r.services || []).map(function (id) { return sname(id, true); }).join(' + ');
      return '<li><button data-rdv="' + esc(r.id) + '"><span class="d"><b>' + esc(fDate(r.date)) + '</b>' + esc(fHR(r.debut, r.fin)) + '</span><span class="w"><b><span class="dot" style="background:' + col + '"></span>' + esc(fullName(r)) + '</b><small>' + esc(pname(r.praticienne)) + ' · ' + esc(svc) + '</small></span><span class="tag ' + tag[1] + '">' + tag[0] + '</span></button></li>';
    }).join('');
    el.innerHTML = head + (rows ? '<ul class="rl">' + rows + '</ul>' : '<p class="empty-c">Aucun rendez-vous' + (q ? ' pour « ' + esc(st.lq) + ' »' : '') + '</p>') +
      (list.length > st.ln ? '<button class="more" data-act="more">Afficher plus (' + (list.length - st.ln) + ' restants)</button>' : '');
    if (keepFocus) { var i = el.querySelector('[data-r="lq"]'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* type search */ } } }
  }

  /* ----- clientes ----- */
  function topClients(m) {
    var by = {};
    m.inP.forEach(function (r) {
      if (!(r.statut === 'confirme' && r.date < m.t)) return;
      var k = key(r), o = by[k] = by[k] || { k: k, nom: fullName(r), n: 0, h: 0, p: {} };
      o.n++; o.h += dur(r); o.p[r.praticienne] = (o.p[r.praticienne] || 0) + 1;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n || b.h - a.h || a.nom.localeCompare(b.nom); });
    if (st.cle) {
      var o = list[0];
      return '<section class="card">' + cardHead('Ses visites', 'Sur la période') + (o ? '<ul class="rk"><li><div class="row"><span class="nm">' + esc(o.nom) + '<small>' + hours(o.h) + ' de soins</small></span><span class="v">' + o.n + ' visite' + (o.n > 1 ? 's' : '') + '</span></div></li></ul>' : '<p class="empty-c">Aucune visite réalisée sur la période</p>') + '</section>';
    }
    var mx = list.length ? list[0].n : 1;
    var rows = list.slice(0, 8).map(function (o, i) {
      var pid = Object.keys(o.p).sort(function (a, b) { return o.p[b] - o.p[a]; })[0], col = pcol(pid);
      return '<li><button data-cli="' + esc(o.k) + '"><span class="rnk">' + (i + 1) + '</span><span class="av" style="background:' + col + ';color:' + textOn(col) + '">' + esc(o.nom.charAt(0)) + '</span><span class="nm">' + esc(o.nom) + '<small>' + esc(pname(pid)) + ' · ' + hours(o.h) + '</small></span><span class="mbar" aria-hidden="true"><i style="width:' + Math.round(o.n / mx * 100) + '%;background:' + col + '"></i></span><span class="v">' + o.n + ' visite' + (o.n > 1 ? 's' : '') + '</span></button></li>';
    }).join('');
    return '<section class="card">' + cardHead('Clientes fidèles', 'Visites réalisées sur la période') + (rows ? '<ul class="rk">' + rows + '</ul>' : '<p class="empty-c">Aucune visite réalisée sur la période</p>') + '</section>';
  }

  function riskClients(m) {
    var f = filtrePrat(), t = m.t;
    var list = (data.profils || []).filter(function (p) {
      var h = p.habitude || {}, fq = h.frequenceJours;
      if (!p.derniere || !fq || p.aVenir > 0) return false;
      if (f !== 'tous' && p.praticienne !== f) return false;
      return diff(p.derniere, t) > 1.5 * fq;
    }).map(function (p) { var d = diff(p.derniere, t); return { p: p, d: d, r: d / p.habitude.frequenceJours }; })
      .filter(function (x) { return x.d <= 365; })
      .sort(function (a, b) { return b.r - a.r; });
    var rows = list.slice(0, 8).map(function (x) {
      var p = x.p, col = pcol(p.praticienne);
      return '<li><button data-cli="' + esc(p.cle) + '"><span class="av" style="background:' + col + ';color:' + textOn(col) + '">' + esc((p.prenom || '?').charAt(0)) + '</span><span class="nm">' + esc((p.prenom + ' ' + p.nom).trim()) + '<small>Vient tous les ' + p.habitude.frequenceJours + ' j · dernière visite le ' + fDM(p.derniere) + '</small></span><span class="tag ' + (x.r >= 2.5 ? 'danger' : 'warn') + '">' + x.d + ' j</span></button></li>';
    }).join('');
    return '<section class="card" data-r="risk">' + cardHead('Clientes à risque', list.length ? list.length + ' cliente' + (list.length > 1 ? 's' : '') + ' sans RDV prévu, absente' + (list.length > 1 ? 's' : '') + ' depuis plus de 1,5 × leur rythme habituel' : 'Sans RDV prévu depuis plus de 1,5 × leur rythme habituel') +
      (rows ? '<ul class="rk">' + rows + '</ul>' + (list.length > 8 ? '<p class="note">Et ' + (list.length - 8) + ' autre' + (list.length - 8 > 1 ? 's' : '') + ' : voir l’onglet « Nos clientes ».</p>' : '') : '<p class="empty-c">Aucune cliente à risque, bravo.</p>') + '</section>';
  }

  function recap(m) {
    var cfg = m.cfg, max = cfg.maxClientesJour || 6, t = m.t, by = {};
    m.base.forEach(function (r) {
      var k = r.date.slice(0, 7), o = by[k] = by[k] || { rdv: 0, h: 0, an: 0, ab: 0, done: 0, booked: 0 };
      if (r.statut === 'confirme' && r.date < t) { o.rdv++; o.h += dur(r); o.done++; }
      else if (ACTIVE[r.statut] && r.date >= t) { o.rdv++; o.booked++; }
      else if (r.statut === 'annule' || r.statut === 'refuse') o.an++;
      else if (r.statut === 'absente') o.ab++;
    });
    var months = Object.keys(by).sort().reverse();
    if (!months.length) return '';
    var rows = months.map(function (k) {
      var o = by[k], d0 = k + '-01', od = openDays(cfg, d0, monthEnd(d0), t);
      var capa = od.all * max * Math.max(1, m.P.length), f = capa ? (o.done + o.booked) / capa : null;
      var cls = k === t.slice(0, 7) ? 'cur' : k > t.slice(0, 7) ? 'fut' : '';
      return '<tr class="' + cls + '"><td>' + cap(fMonth(d0)) + (cls === 'fut' ? ' <span class="tag">prévu</span>' : '') + '</td><td>' + nf(o.rdv) + '</td><td>' + nf(Math.round(o.h)) + ' h</td><td>' + nf(o.an) + (o.ab ? ' <small style="color:var(--muted)">+' + o.ab + ' abs.</small>' : '') + '</td><td>' + (st.cle ? '—' : pct(f) + '<span class="fbar"><i style="width:' + Math.min(100, Math.round((f || 0) * 100)) + '%"></i></span>') + '</td></tr>';
    }).join('');
    return '<section class="card">' + cardHead('Récapitulatif par mois', 'RDV réalisés et à venir, heures, annulations' + (st.cle ? '' : ', remplissage')) + '<div class="tbl-w"><table><thead><tr><th>Mois</th><th>RDV</th><th>Heures</th><th>Annul.</th><th>Rempl.</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  /* ---------------- graphiques SVG ---------------- */
  function svg(w, h, inner, label, cls) {
    return '<svg xmlns="' + SVGNS + '"' + (cls ? ' class="' + cls + '"' : '') + ' width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label || '') + '">' + inner + '</svg>';
  }
  function step(slot, minPx) { return Math.max(1, Math.ceil(minPx / Math.max(1, slot))); }
  function topRound(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return 'M' + x.toFixed(1) + ' ' + (y + h).toFixed(1) + 'V' + (y + r).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + r).toFixed(1) + ' ' + y.toFixed(1) + 'H' + (x + w - r).toFixed(1) + 'Q' + (x + w).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + w).toFixed(1) + ' ' + (y + r).toFixed(1) + 'V' + (y + h).toFixed(1) + 'Z';
  }
  function tipRows(title, rows, tot, foot) {
    return '<b class="t">' + esc(title) + '</b>' + rows.map(function (r) { return '<span class="r"><span><i style="background:' + r[0] + (r[3] ? ';opacity:' + r[3] : '') + '"></i>' + esc(r[1]) + '</span><b>' + esc(r[2]) + '</b></span>'; }).join('') +
      (tot ? '<span class="r tot"><span>' + esc(tot[0]) + '</span><b>' + esc(tot[1]) + '</b></span>' : '') + (foot ? '<span class="f">' + esc(foot) + '</span>' : '');
  }

  function drawCharts() {
    if (!root || !model) return;
    var m = model;
    root.querySelectorAll('[data-chart]').forEach(function (el) {
      var w = Math.floor(el.clientWidth) || 300, id = el.getAttribute('data-chart');
      try {
        if (id === 'rdv') { el.innerHTML = chartRdv(m, w); var sc = el.querySelector('.sc'); if (sc && sc.getAttribute('data-x')) sc.scrollLeft = +sc.getAttribute('data-x'); }
        else if (id === 'remplissage') el.innerHTML = chartFill(m, w);
        else if (id === 'presta') el.innerHTML = chartSvc(m, w);
        else if (id === 'heat') { el.innerHTML = chartHeat(m, w); var s2 = el.querySelector('.sc'); if (s2 && s2.getAttribute('data-x')) s2.scrollLeft = +s2.getAttribute('data-x'); }
        else if (id.indexOf('spark-') === 0) el.innerHTML = chartSpark(m, w, +id.slice(6));
      } catch (e) { el.innerHTML = '<p class="empty-c">Graphique indisponible</p>'; if (window.console) console.warn(e); }
    });
    lastW = root.clientWidth;
  }

  /** Axe Y fixe (à gauche) + zone de tracé qui défile si elle est trop large. */
  function axisSvg(L, H, T, ph, max, fmt) {
    var s = '';
    for (var i = 0; i <= 4; i++) { var y = Math.round(T + ph - ph * i / 4) + 0.5; s += '<text class="ax" x="' + (L - 7) + '" y="' + (y + 4) + '" text-anchor="end">' + fmt(max * i / 4) + '</text>'; }
    return svg(L, H, s, '');
  }
  function grid(W, T, ph) {
    var s = '';
    for (var i = 1; i <= 4; i++) { var y = Math.round(T + ph - ph * i / 4) + 0.5; s += '<line class="gl" x1="0" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>'; }
    return s + '<line class="bl" x1="0" x2="' + W + '" y1="' + (T + ph + 0.5) + '" y2="' + (T + ph + 0.5) + '"/>';
  }

  function chartRdv(m, W) {
    var S = rdvSeries(m), bs = S.bs, C = S.C, g = S.g, t = m.t;
    rdvLegend(S);
    if (!S.list.length) return '<p class="empty-c">Aucun rendez-vous pour ces filtres</p>';
    var mobile = W < 520, H = mobile ? 216 : 260, L = 30, T = 16, B = g === 'jour' ? 36 : 26, ph = H - T - B, n = bs.length;
    var minSlot = g === 'jour' ? (mobile ? 13 : 18) : g === 'semaine' ? 30 : 34;
    var avail = W - L, pw = Math.max(avail, n * minSlot), slot = pw / n, scroll = pw > avail + 1;
    var maxV = niceMax(Math.max.apply(null, bs.map(function (b) { return b.tot; }).concat([1])));
    var bw = Math.max(6, Math.min(g === 'jour' ? 26 : 44, slot * 0.64));
    var s = grid(pw, T, ph), id = 'rdv', tips = TIPS[id] = [];
    // zone « à venir »
    var fi = -1; for (var i = 0; i < n; i++) if (bs[i].au >= t) { fi = i; break; }
    if (fi > 0) { var fx = slot * fi; s += '<rect class="fut" x="' + fx.toFixed(1) + '" y="' + T + '" width="' + (pw - fx).toFixed(1) + '" height="' + ph + '"/><text class="ax" x="' + (fx + 6).toFixed(1) + '" y="' + (T + 11) + '">à venir</text>'; }
    var k = step(slot, g === 'jour' ? 22 : g === 'semaine' ? 46 : 36), sel = st.bk;
    bs.forEach(function (b, j) {
      var x = slot * j + (slot - bw) / 2, y = T + ph, segs = C.list.filter(function (c) { return b.v[c.id]; });
      var isSel = sel && sel.du === b.du && sel.au === b.au;
      s += '<g class="bk' + (isSel ? ' sel' : '') + '" data-ti="' + id + ':' + j + '" data-bk="' + j + '">';
      s += '<rect class="hit" x="' + (slot * j).toFixed(1) + '" y="' + T + '" width="' + slot.toFixed(1) + '" height="' + (ph + B) + '"/>';
      segs.forEach(function (c, si) {
        var v = b.v[c.id], hh = v / maxV * ph, top = si === segs.length - 1;
        y -= hh;
        var h2 = Math.max(1, hh - (si ? 0 : 0) - (top ? 0 : 2));
        if (top) s += '<path d="' + topRound(x, y, bw, h2, 4) + '" style="fill:' + c.col + '" fill-opacity="' + c.op + '"/>';
        else s += '<rect x="' + x.toFixed(1) + '" y="' + (y + 2).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, hh - 2).toFixed(1) + '" style="fill:' + c.col + '" fill-opacity="' + c.op + '"/>';
      });
      if (b.tot && (bw >= 16 || isSel)) s += '<text class="vl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + b.tot + '</text>';
      // libellés d'axe
      var cx = (slot * j + slot / 2).toFixed(1);
      if (g === 'jour') {
        if (j % k === 0) s += '<text class="ax" x="' + cx + '" y="' + (T + ph + 14) + '" text-anchor="middle">' + (+b.du.slice(8)) + '</text>';
        if (j === 0 || b.du.slice(5, 7) !== bs[j - 1].du.slice(5, 7)) s += '<text class="ax2" x="' + (slot * j + 2).toFixed(1) + '" y="' + (T + ph + 29) + '">' + esc(MOIS[+b.du.slice(5, 7) - 1]) + '</text>';
      } else if (g === 'semaine') {
        if (j % k === 0) s += '<text class="ax" x="' + cx + '" y="' + (T + ph + 15) + '" text-anchor="middle">' + esc(fDM(b.du).replace('1er', '1')) + '</text>';
      } else if (j % k === 0) {
        s += '<text class="ax" x="' + cx + '" y="' + (T + ph + 15) + '" text-anchor="middle">' + esc(MOIS[+b.du.slice(5, 7) - 1]) + (j === 0 || b.du.slice(0, 4) !== bs[j - 1].du.slice(0, 4) ? ' ' + b.du.slice(2, 4) : '') + '</text>';
      }
      s += '</g>';
      var rows = C.list.filter(function (c) { return b.v[c.id]; }).slice().reverse().map(function (c) { return [c.col, c.full || c.label, nf(b.v[c.id]), c.op < 1 ? c.op : 0]; });
      tips.push(tipRows(bucketLabel(b, g, true), rows, ['Total', nf(b.tot) + ' RDV'], isSel ? verb() + ' à nouveau pour tout afficher' : verb() + ' pour voir le détail'));
    });
    // moyenne
    if (n > 1) {
      var avg = S.list.length / n, ay = T + ph - avg / maxV * ph;
      s += '<line class="avg" x1="0" x2="' + pw + '" y1="' + ay.toFixed(1) + '" y2="' + ay.toFixed(1) + '"/>';
    }
    var fmt = function (v) { return nf(v); };
    var plot = svg(pw, H, s, 'Rendez-vous ' + (g === 'jour' ? 'par jour' : g === 'semaine' ? 'par semaine' : 'par mois'));
    var sx = 0;
    if (scroll) { var ti = fi > 0 ? fi : n; sx = Math.max(0, slot * ti - avail * 0.75); }
    return '<div class="cw">' + axisSvg(L, H, T, ph, maxV, fmt) + '<div class="sc"' + (scroll ? ' data-x="' + Math.round(sx) + '"' : '') + '>' + plot + '</div></div>';
  }

  function lineChart(W, o) {
    var H = o.h || 200, L = 38, R = 10, T = 14, B = 24, pw = W - L - R, ph = H - T - B, n = o.labels.length;
    var maxV = o.max || niceMax(Math.max.apply(null, [1].concat.apply([], o.series.map(function (s) { return s.values.filter(function (v) { return v != null; }); }))));
    var x = function (i) { return L + (n <= 1 ? pw / 2 : i * pw / (n - 1)); };
    var y = function (v) { return T + ph - Math.min(v, maxV) / maxV * ph; };
    var s = '';
    for (var i = 0; i <= 4; i++) { var yy = Math.round(T + ph - ph * i / 4) + 0.5; s += '<line class="' + (i ? 'gl' : 'bl') + '" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="ax" x="' + (L - 7) + '" y="' + (yy + 4) + '" text-anchor="end">' + o.fmt(maxV * i / 4) + '</text>'; }
    if (o.nowIdx != null && o.nowIdx >= 0 && o.nowIdx < n) s += '<rect class="fut" x="' + x(o.nowIdx).toFixed(1) + '" y="' + T + '" width="' + Math.max(0, (W - R) - x(o.nowIdx)).toFixed(1) + '" height="' + ph + '"/>';
    if (o.thr != null) s += '<line class="thr" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(o.thr).toFixed(1) + '" y2="' + y(o.thr).toFixed(1) + '"/>';
    var k = step(pw / Math.max(1, n - 1), 46);
    o.labels.forEach(function (lb, i) { if (i % k === 0) s += '<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(lb) + '</text>'; });
    o.series.forEach(function (se) {
      var pts = [], d = '';
      se.values.forEach(function (v, i) { if (v == null) return; pts.push([x(i), y(v), v, i]); });
      pts.forEach(function (p, i) { d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
      if (d) s += '<path d="' + d + '" fill="none" style="stroke:' + se.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      if (pts.length && n <= 30) { var lp = pts[pts.length - 1]; s += '<circle cx="' + lp[0].toFixed(1) + '" cy="' + lp[1].toFixed(1) + '" r="3.5" style="fill:' + se.color + ';stroke:var(--surface)" stroke-width="2"/>'; }
    });
    var tips = TIPS[o.id] = [], sl = pw / Math.max(1, n - 1);
    o.labels.forEach(function (lb, i) {
      tips.push(tipRows(o.tips[i], o.series.map(function (se) { return [se.color, se.name, se.values[i] == null ? '—' : o.fmt(se.values[i])]; }), null, o.nowIdx != null && i >= o.nowIdx ? 'Déjà réservé à ce jour' : ''));
      s += '<rect class="hit ln-hit" data-ti="' + o.id + ':' + i + '" x="' + (x(i) - sl / 2).toFixed(1) + '" y="' + T + '" width="' + sl.toFixed(1) + '" height="' + ph + '"/>';
    });
    return svg(W, H, s, o.label);
  }

  function weeksWin(m) {
    var a = weekStart(m.R.du), b = weekStart(m.R.au), out = [];
    for (var x = a, n = 0; x <= b && n < 120; x = add(x, 7), n++) out.push(x);
    if (out.length < 6) {
      out = []; var s = add(b, -7 * 7), ds = weekStart(m.dataStart < '9999' ? m.dataStart : b);
      if (s < ds) s = ds;
      for (x = s; x <= b; x = add(x, 7)) out.push(x);
    }
    return out;
  }
  function nowIdx(ww, t) { for (var i = 0; i < ww.length; i++) if (ww[i] <= t && t <= add(ww[i], 6)) return i; return ww[ww.length - 1] < t ? null : 0; }

  function chartFill(m, W) {
    var ww = weeksWin(m), max = m.cfg.maxClientesJour || 6, cfg = m.cfg, P = m.P, t = m.t;
    var vals = ww.map(function (w) {
      var end = add(w, 6), o = {}, od = openDays(cfg, w, end, '0000').all;
      P.forEach(function (p) { o[p.id] = 0; });
      m.base.forEach(function (r) {
        if (r.date < w || r.date > end || o[r.praticienne] == null) return;
        if ((r.statut === 'confirme' && r.date < t) || (ACTIVE[r.statut] && r.date >= t)) o[r.praticienne]++;
      });
      var res = {}; P.forEach(function (p) { res[p.id] = od ? Math.round(o[p.id] / (od * max) * 100) : null; });
      return res;
    });
    var seuil = (cfg.magie && cfg.magie.seuilRemplissage) || 50;
    var series = P.map(function (p) { return { name: p.nom, color: pcol(p.id), values: vals.map(function (o) { return o[p.id]; }) }; });
    return lineChart(W, { id: 'remplissage', labels: ww.map(function (w) { return fDM(w).replace('1er', '1'); }), tips: ww.map(function (w) { return 'Semaine du ' + fDM(w); }), series: series, max: 100, thr: seuil, fmt: function (v) { return nf(Math.round(v)) + ' %'; }, nowIdx: nowIdx(ww, t), label: 'Remplissage par semaine' });
  }

  function chartSvc(m, W) {
    var cnt = {}, t = m.t;
    m.inP.forEach(function (r) { if ((r.statut === 'confirme' && r.date < t) || (ACTIVE[r.statut] && r.date >= t)) (r.services || []).forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; }); });
    var rows = Object.keys(cnt).map(function (id) { return { id: id, n: cnt[id] }; }).sort(function (a, b) { return b.n - a.n; });
    if (!rows.length) return '<p class="empty-c">Aucune prestation sur la période</p>';
    var tot = rows.reduce(function (a, b) { return a + b.n; }, 0);
    var rowH = 32, H = rows.length * rowH + 2, lw = Math.min(150, Math.max(96, W * 0.34)), vw = 70, bw = W - lw - vw, maxV = rows[0].n, s = '', tips = TIPS.presta = [];
    rows.forEach(function (r, i) {
      var y = i * rowH + 2, col = scol(r.id), w = Math.max(4, r.n / maxV * bw);
      tips.push(tipRows(sname(r.id), [[col, 'Prestations', nf(r.n)]], ['Part', Math.round(r.n / tot * 100) + ' %']));
      s += '<g class="pr" data-ti="presta:' + i + '"><rect class="hit" x="0" y="' + y + '" width="' + W + '" height="' + rowH + '"/>';
      s += '<text class="axs" x="0" y="' + (y + 19) + '">' + esc(sname(r.id, true)) + '</text>';
      s += '<rect class="bgc" x="' + lw + '" y="' + (y + 8) + '" width="' + bw.toFixed(1) + '" height="14" rx="4"/>';
      s += '<rect x="' + lw + '" y="' + (y + 8) + '" width="' + w.toFixed(1) + '" height="14" rx="4" fill="' + col + '"/>';
      s += '<text class="vl" x="' + (lw + bw + 8) + '" y="' + (y + 19) + '">' + r.n + ' <tspan class="ax">· ' + Math.round(r.n / tot * 100) + ' %</tspan></text></g>';
    });
    return svg(W, H, s, 'Prestations');
  }

  /* ----- Jour et heure ----- */
  var HM_COL = [18, 36, 56, 78, 100];
  function hmFill(level) { return level ? 'color-mix(in srgb,var(--accent) ' + HM_COL[level - 1] + '%,var(--surface-2))' : 'var(--surface-2)'; }

  function heatModel(m, stepMin) {
    var cfg = m.cfg, t = m.t, R = m.R, past = R.du < t;
    var du = R.du, au = past ? (R.au < t ? R.au : add(t, -1)) : R.au, nP = Math.max(1, m.P.length);
    var dates = {}, nOpen = {}, wk = cfg.semaine || {};
    for (var d = du, g = 0; d <= au && g < 900; d = add(d, 1), g++) if (isOpen(cfg, d)) nOpen[wd(d)] = (nOpen[wd(d)] || 0) + 1;
    var list = m.inP.filter(function (r) { if (r.date < du || r.date > au) return false; var s = stOf(r, t); return past ? s === 'realise' : (s === 'realise' || s === 'avenir'); }).filter(svcMatch);
    var hS = 24 * 60, hE = 0;
    [1, 2, 3, 4, 5, 6, 0].forEach(function (x) { var r = wk[String(x)]; if (r && r.ouvert) { hS = Math.min(hS, toMin(r.debut)); hE = Math.max(hE, toMin(r.fin || '20:00')); } });
    list.forEach(function (r) { var a = toMin(r.debut), b = toMin(r.fin); if (!isNaN(a)) { hS = Math.min(hS, a); hE = Math.max(hE, isNaN(b) ? a + 60 : b); } });
    if (hS >= hE) { hS = 540; hE = 1200; }
    hS = Math.floor(hS / stepMin) * stepMin; hE = Math.ceil(hE / stepMin) * stepMin;
    var slots = []; for (var x = hS; x < hE; x += stepMin) slots.push(x);
    var occ = {}, arr = {}, hasDay = {}, dayDates = {};
    list.forEach(function (r) {
      var w = wd(r.date), a = toMin(r.debut), b = toMin(r.fin); if (isNaN(a)) return; if (isNaN(b) || b <= a) b = a + 30;
      hasDay[w] = 1; (dayDates[w] = dayDates[w] || {})[r.date] = 1;
      slots.forEach(function (sl) { if (a < sl + stepMin && b > sl) occ[w + '-' + sl] = (occ[w + '-' + sl] || 0) + 1; });
      var si = Math.floor((a - hS) / stepMin) * stepMin + hS; arr[w + '-' + si] = (arr[w + '-' + si] || 0) + 1;
    });
    var days = [1, 2, 3, 4, 5, 6, 0].filter(function (x) { return (wk[String(x)] && wk[String(x)].ouvert) || hasDay[x]; });
    days.forEach(function (x) { if (!nOpen[x]) nOpen[x] = Object.keys(dayDates[x] || {}).length; });
    return { past: past, list: list, slots: slots, step: stepMin, days: days, occ: occ, arr: arr, nOpen: nOpen, nP: nP, wk: wk, total: list.length };
  }

  function renderHeat() {
    var el = root && root.querySelector('[data-r="heat"]'); if (!el || !model) return;
    var m = model, mobile = root.clientWidth < 560;
    if (!st.hstep) st.hstep = mobile ? 60 : 30;
    var H = heatModel(m, st.hstep), occ = st.hm === 'occ';
    // case la plus chargée
    var best = null;
    H.days.forEach(function (d) { H.slots.forEach(function (sl) { var v = (occ ? H.occ : H.arr)[d + '-' + sl] || 0; var r = occ ? (H.nOpen[d] ? v / (H.nOpen[d] * H.nP) : 0) : v; if (v && (!best || r > best.r)) best = { d: d, sl: sl, r: r }; }); });
    var sub = H.total ? (H.past ? 'RDV réalisés' : 'RDV réservés') + ' · ' + (occ ? 'part du temps où les praticiennes sont occupées' : 'heures d’arrivée des clientes') : '';
    if (best) sub += '<br>Le plus chargé : <b>' + esc(JF[best.d] + ' ' + fMin(best.sl) + '–' + fMin(best.sl + H.step)) + '</b> (' + (occ ? Math.round(Math.min(1, best.r) * 100) + ' %' : nf(best.r) + ' arrivée' + (best.r > 1 ? 's' : '')) + ')';
    var ctl = seg('hm', [['occ', 'Occupation'], ['arr', 'Arrivées']], st.hm, true, 'Mesure') + seg('hstep', [['60', '1 h'], ['30', '30 min']], String(st.hstep), true, 'Précision');
    var mx = 1; if (!occ) Object.keys(H.arr).forEach(function (k) { if (H.arr[k] > mx) mx = H.arr[k]; });
    var labs = occ ? ['< 20 %', '20–40', '40–60', '60–80', '≥ 80 %'] : [0, 1, 2, 3, 4].map(function (i) { var a = Math.floor(mx * i / 5) + 1, b = Math.max(a, Math.round(mx * (i + 1) / 5)); return a === b ? String(a) : a + '–' + b; });
    var leg = '<div class="legend" data-r="heat-leg" style="align-items:flex-start"><span class="hm-scale"><b>' + (occ ? 'Occupation' : 'Arrivées') + '</b><span class="hm-sw">' + HM_COL.map(function (c, i) { return '<em><i style="background:' + hmFill(i + 1) + '"></i>' + labs[i] + '</em>'; }).join('') + '</span></span>' +
      '<span><i class="free"></i>' + (occ ? 'Libre' : 'Aucune') + '</span><span><i class="hatch"></i>Fermé</span></div>';
    el.innerHTML = cardHead('Jour et heure', sub, ctl) + '<div data-chart="heat"></div>' + leg;
  }

  function chartHeat(m, W) {
    var H = heatModel(m, st.hstep || 60), occ = st.hm === 'occ', id = 'heat', tips = TIPS[id] = [];
    if (!H.total) return '<p class="empty-c">Aucun rendez-vous sur la période</p>';
    var mx = 1; if (!occ) Object.keys(H.arr).forEach(function (k) { if (H.arr[k] > mx) mx = H.arr[k]; });
    var mobile = W < 520, L = mobile ? 34 : 40, Rc = mobile ? 40 : 46, T = 20, ncol = H.slots.length;
    var minCw = H.step === 30 ? 17 : (mobile ? 19 : 24), avail = W - L, cw = Math.max(minCw, Math.min(56, (avail - Rc) / ncol)), pw = cw * ncol + Rc, scroll = pw > avail + 1;
    var ch = mobile ? 32 : 36, Hh = T + H.days.length * ch + 2, gap = 2, s = '', lab = '';
    var hatch = '<defs><pattern id="st-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" style="fill:var(--surface)"/><line x1="0" y1="0" x2="0" y2="6" style="stroke:var(--line)" stroke-width="2.4"/></pattern></defs>';
    var k = step(cw, H.step === 30 ? 34 : 26);
    H.slots.forEach(function (sl, j) { if (sl % 60 === 0 && Math.round(sl / 60) % (H.step === 30 ? Math.max(1, Math.ceil(k / 2)) : k) === 0) s += '<text class="ax" x="' + (j * cw + 2).toFixed(1) + '" y="12">' + (sl / 60) + 'h</text>'; });
    s += '<text class="ax" x="' + (ncol * cw + Rc - 4).toFixed(1) + '" y="12" text-anchor="end">' + (occ ? 'moy.' : 'total') + '</text>';
    H.days.forEach(function (d, i) {
      var y = T + i * ch, r = H.wk[String(d)], oa = r && r.ouvert ? toMin(r.debut) : -1, ob = r && r.ouvert ? toMin(r.fin || '20:00') : -1;
      lab += '<text class="axs" x="0" y="' + (y + ch / 2 + 4).toFixed(1) + '">' + JL[d] + '</text>';
      var sumO = 0, nO = 0, sumA = 0, denom = (H.nOpen[d] || 0) * H.nP;
      H.slots.forEach(function (sl, j) {
        var x = j * cw, v = (occ ? H.occ : H.arr)[d + '-' + sl] || 0, closed = !(sl >= oa && sl < ob);
        var ratio = occ ? (denom ? Math.min(1, v / denom) : 0) : v / mx;
        var lvl = !v ? 0 : occ ? Math.min(5, Math.floor(ratio * 5) + 1) : Math.max(1, Math.ceil(ratio * 5));
        if (!closed) { sumO += denom ? Math.min(1, (H.occ[d + '-' + sl] || 0) / denom) : 0; nO++; }
        sumA += H.arr[d + '-' + sl] || 0;
        var fill = closed && !v ? 'url(#st-hatch)' : hmFill(lvl);
        var slotLab = cap(JF[d]) + ' · ' + fMin(sl) + '–' + fMin(sl + H.step);
        var rows;
        if (closed && !v) rows = tipRows(slotLab, [], null, 'Institut fermé');
        else if (occ) rows = tipRows(slotLab, [[hmFill(Math.max(1, lvl)), 'Occupation', Math.round(ratio * 100) + ' %']], ['RDV en cours', nf(v)], 'Sur ' + (H.nOpen[d] || 0) + ' ' + JF[d] + (H.nOpen[d] > 1 ? 's' : '') + ' ouvert' + (H.nOpen[d] > 1 ? 's' : '') + (H.nP > 1 ? ' × ' + H.nP + ' praticiennes' : ''));
        else rows = tipRows(slotLab, [[hmFill(Math.max(1, lvl)), 'Arrivées', nf(v)]], ['Part des RDV', (H.total ? Math.round(v / H.total * 100) : 0) + ' %']);
        tips.push(rows);
        s += '<g class="hc" data-ti="' + id + ':' + (tips.length - 1) + '"><rect x="' + (x + gap / 2).toFixed(1) + '" y="' + (y + gap / 2).toFixed(1) + '" width="' + (cw - gap).toFixed(1) + '" height="' + (ch - gap).toFixed(1) + '" rx="4" style="fill:' + fill + '"/>';
        if (v && cw >= 30) s += '<text x="' + (x + cw / 2).toFixed(1) + '" y="' + (y + ch / 2 + 4).toFixed(1) + '" text-anchor="middle" style="font-size:10.5px;font-weight:600;pointer-events:none;fill:' + (lvl >= 4 ? 'var(--accent-text)' : 'var(--text-sub)') + '">' + (occ ? Math.round(ratio * 100) : v) + '</text>';
        s += '</g>';
      });
      s += '<text class="vl" x="' + (ncol * cw + Rc - 4).toFixed(1) + '" y="' + (y + ch / 2 + 4).toFixed(1) + '" text-anchor="end">' + (occ ? (nO ? Math.round(sumO / nO * 100) + ' %' : '—') : nf(sumA)) + '</text>';
    });
    var plot = svg(pw, Hh, hatch + s, 'Carte de chaleur jour et heure');
    return '<div class="cw">' + svg(L, Hh, lab, '') + '<div class="sc">' + plot + '</div></div>';
  }

  /* ---------------- bulles d'info ---------------- */
  function hideTip() {
    if (tipEl) { tipEl.classList.remove('on'); tipEl.setAttribute('aria-hidden', 'true'); }
    if (hovEl) { hovEl.classList.remove('hov'); var sv = hovEl.closest('svg'); if (sv) sv.classList.remove('dim'); }
    hovEl = null; tipFrom = null;
  }
  function showTip(target, cx, cy) {
    if (!tipEl || !root) return;
    var ref = target.getAttribute('data-ti'), p = ref.split(':'), html = TIPS[p[0]] && TIPS[p[0]][+p[1]];
    if (!html) { hideTip(); return; }
    if (hovEl !== target) {
      if (hovEl) { hovEl.classList.remove('hov'); var o = hovEl.closest('svg'); if (o) o.classList.remove('dim'); }
      hovEl = target; target.classList.add('hov');
      var sv = target.closest('svg'); if (sv && target.classList.contains('bk')) sv.classList.add('dim');
    }
    if (tipFrom !== ref) { tipEl.innerHTML = html; tipFrom = ref; }
    var rr = root.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    var x = cx - rr.left - tw / 2, y = cy - rr.top - th - 14;
    x = Math.max(6, Math.min(rr.width - tw - 6, x));
    if (cy - th - 14 < 8) y = cy - rr.top + 18;
    tipEl.style.left = Math.round(x) + 'px'; tipEl.style.top = Math.round(y) + 'px';
    tipEl.classList.add('on'); tipEl.setAttribute('aria-hidden', 'false');
  }

  /* ---------------- autocomplétion cliente ---------------- */
  var sugg = [], suggIdx = 0;
  function showSugg(q) {
    var box = root && root.querySelector('[data-r="sugg"]'); if (!box) return;
    q = norm(q);
    if (!q) { box.hidden = true; sugg = []; return; }
    var f = filtrePrat();
    sugg = (data && data.profils || []).filter(function (p) {
      var n = norm(p.prenom + ' ' + p.nom), n2 = norm(p.nom + ' ' + p.prenom);
      return n.indexOf(q) >= 0 || n2.indexOf(q) >= 0;
    }).sort(function (a, b) { return (f !== 'tous' ? (b.praticienne === f) - (a.praticienne === f) : 0) || (b.realises || 0) - (a.realises || 0); }).slice(0, 8);
    suggIdx = 0;
    box.innerHTML = sugg.length ? sugg.map(function (p, i) {
      return '<button data-pick="' + i + '" class="' + (i === 0 ? 'on' : '') + '"><span class="dot" style="background:' + pcol(p.praticienne) + '"></span>' + esc((p.prenom + ' ' + p.nom).trim()) + '<small>' + (p.realises || 0) + ' visite' + ((p.realises || 0) > 1 ? 's' : '') + '</small></button>';
    }).join('') : '<p class="empty-c" style="padding:12px">Aucune cliente trouvée</p>';
    box.hidden = false;
  }
  function pick(p) {
    if (!p) return;
    st.cle = p.cle; st.cleNom = (p.prenom + ' ' + p.nom).trim(); st.ln = 30; st.stat = 'actifs'; st.lq = ''; st.bk = null;
    render();
  }

  /* ---------------- événements ---------------- */
  function setPeriod(a) {
    if (a === 'perso' && !st.du) { var R = range(st.period); st.du = R.du; st.au = R.au > today() ? today() : R.au; if (st.au < st.du) st.au = st.du; lsSet('du', st.du); lsSet('au', st.au); }
    st.period = a; st.ln = 30; st.bk = null; lsSet('period', a); render();
  }
  function redrawRdv() { hideTip(); renderRdv(); var el = root.querySelector('[data-chart="rdv"]'); if (el) { el.innerHTML = chartRdv(model, Math.floor(el.clientWidth) || 300); var sc = el.querySelector('.sc'); if (sc && sc.getAttribute('data-x')) sc.scrollLeft = +sc.getAttribute('data-x'); } }
  function redrawHeat() { hideTip(); renderHeat(); var el = root.querySelector('[data-chart="heat"]'); if (el) el.innerHTML = chartHeat(model, Math.floor(el.clientWidth) || 300); }

  var qTimer = null, quiet = 0;
  function bind(el) {
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var t = e.target.closest && e.target.closest('[data-ti]');
      if (t && el.contains(t)) showTip(t, e.clientX, e.clientY); else if (hovEl) hideTip();
    });
    el.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') hideTip(); });
    el.addEventListener('scroll', function () { if (Date.now() > quiet) hideTip(); }, true);
    el.addEventListener('click', function (e) {
      var ti = e.target.closest && e.target.closest('[data-ti]');
      if (ti && el.contains(ti)) {
        var bkI = ti.getAttribute('data-bk');
        if (bkI != null && model) {
          var S = rdvSeries(model), b = S.bs[+bkI];
          if (b) {
            var same = st.bk && st.bk.du === b.du && st.bk.au === b.au;
            st.bk = same ? null : { du: b.du, au: b.au, label: bucketLabel(b, S.g, false).replace('Semaine du ', 'Sem. du ') };
            st.ln = 30;
            var r = ti.getBoundingClientRect(), cx = e.clientX || (r.left + r.width / 2), cy = e.clientY || r.top;
            var chartEl = root.querySelector('[data-chart="rdv"]'), sc = chartEl && chartEl.querySelector('.sc'), keep = sc ? sc.scrollLeft : 0;
            hideTip(); renderList(); quiet = Date.now() + 400;
            if (chartEl) { chartEl.innerHTML = chartRdv(model, Math.floor(chartEl.clientWidth) || 300); var sc2 = chartEl.querySelector('.sc'); if (sc2) sc2.scrollLeft = keep; }
            var nt = root.querySelector('[data-chart="rdv"] [data-bk="' + bkI + '"]');
            if (nt && e.pointerType !== 'mouse') showTip(nt, cx, cy); else if (nt) showTip(nt, cx, cy);
          }
          return;
        }
        var rc = ti.getBoundingClientRect();
        if (hovEl === ti && tipEl && tipEl.classList.contains('on') && e.pointerType !== 'mouse') hideTip();
        else showTip(ti, e.clientX || rc.left + rc.width / 2, e.clientY || rc.top);
        return;
      }
      if (hovEl && (!e.pointerType || e.pointerType === 'touch')) hideTip();
      var b = e.target.closest('button'); if (!b || !el.contains(b)) return;
      var a;
      if ((a = b.getAttribute('data-period'))) { setPeriod(a); return; }
      if ((a = b.getAttribute('data-stat'))) { st.stat = a; st.ln = 30; redrawRdv(); return; }
      if ((a = b.getAttribute('data-grp'))) { st.grp = a; st.bk = null; redrawRdv(); return; }
      if ((a = b.getAttribute('data-hm'))) { st.hm = a; redrawHeat(); return; }
      if ((a = b.getAttribute('data-hstep'))) { st.hstep = +a; redrawHeat(); return; }
      if ((a = b.getAttribute('data-rdv'))) { if (G.openRdv) G.openRdv(a); return; }
      if ((a = b.getAttribute('data-cli'))) { openCli(a); return; }
      if ((a = b.getAttribute('data-pick')) != null && a !== '') { pick(sugg[+a]); return; }
      a = b.getAttribute('data-act');
      if (a === 'more') { st.ln += 30; renderList(); }
      else if (a === 'clear-bk') { st.bk = null; st.ln = 30; redrawRdv(); }
      else if (a === 'clear-cli') { st.cle = null; st.cleNom = ''; st.bk = null; render(); }
      else if (a === 'fiche') openCli(st.cle);
      else if (a === 'retry') load();
      else if (a === 'risk') {
        st.risk = !st.risk; lsSet('risk', st.risk);
        b.setAttribute('aria-checked', String(st.risk));
        var cur = root.querySelector('[data-r="risk"]');
        if (cur) cur.parentNode.removeChild(cur);
        if (st.risk && model) { b.parentNode.insertAdjacentHTML('afterend', riskClients(model)); var nr = root.querySelector('[data-r="risk"]'); if (nr && nr.scrollIntoView) try { nr.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (x) { /* ancien navigateur */ } }
      }
    });
    el.addEventListener('input', function (e) {
      var r = e.target.getAttribute('data-r');
      if (r === 'cli') showSugg(e.target.value);
      else if (r === 'lq') { st.lq = e.target.value; clearTimeout(qTimer); qTimer = setTimeout(function () { st.ln = 30; renderList(); }, 120); }
    });
    el.addEventListener('keydown', function (e) {
      if (e.target.getAttribute('data-r') !== 'cli') return;
      var box = root.querySelector('[data-r="sugg"]');
      if (e.key === 'Escape') { e.target.value = ''; showSugg(''); }
      else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sugg.length) {
        e.preventDefault(); suggIdx = (suggIdx + (e.key === 'ArrowDown' ? 1 : sugg.length - 1)) % sugg.length;
        box.querySelectorAll('[data-pick]').forEach(function (x, i) { x.classList.toggle('on', i === suggIdx); });
      } else if (e.key === 'Enter' && sugg.length) { e.preventDefault(); pick(sugg[suggIdx]); }
    });
    el.addEventListener('change', function (e) {
      var s = e.target.getAttribute('data-sel');
      if (s === 'period') { setPeriod(e.target.value); return; }
      if (s === 'svc') { st.svc = e.target.value; st.ln = 30; redrawRdv(); redrawHeat(); return; }
      if (s === 'stack') { st.stack = e.target.value; lsSet('stack', st.stack); redrawRdv(); return; }
      if (s === 'prat') { if (G.setFiltre) G.setFiltre({ prat: e.target.value }); else { G.filtre.prat = e.target.value; render(); } return; }
      var d = e.target.getAttribute('data-date'); if (!d || !e.target.value) return;
      st[d] = e.target.value;
      if (st.du && st.au && st.au < st.du) { if (d === 'du') st.au = st.du; else st.du = st.au; }
      lsSet('du', st.du); lsSet('au', st.au); st.bk = null;
      renderBody();
      var o = root.querySelector('[data-date="' + (d === 'du' ? 'au' : 'du') + '"]'); if (o) o.value = st[d === 'du' ? 'au' : 'du'];
    });
    el.addEventListener('focusout', function (e) {
      if (e.target.getAttribute('data-r') !== 'cli') return;
      setTimeout(function () { var box = root && root.querySelector('[data-r="sugg"]'); if (box && !box.contains(document.activeElement)) box.hidden = true; }, 150);
    });
  }
  function docDown(e) { if (root && hovEl && !root.contains(e.target)) hideTip(); }
  function openCli(cle) {
    if (!cle) return;
    if (G.openClient) G.openClient(cle);
    else if (G.modules && G.modules.clientes && G.modules.clientes.openClient) G.modules.clientes.openClient(cle);
  }

  function load() {
    var my = ++tok; err = null;
    if (!data) renderBody();
    var hp = Promise.resolve().then(function () { return G.historique(); });
    var cp = Promise.resolve().then(function () { return G.clientes ? G.clientes() : []; }).catch(function () { return []; });
    Promise.all([hp, cp]).then(function (res) {
      if (my !== tok || !mounted) return;
      data = { hist: Array.isArray(res[0]) ? res[0] : (res[0] && res[0].rdvs) || [], profils: Array.isArray(res[1]) ? res[1] : [] };
      renderBody();
    }).catch(function (e) {
      if (my !== tok || !mounted) return;
      err = (e && e.message) || 'Erreur inattendue.';
      if (!data) renderBody(); else if (G.toast) G.toast(err, { type: 'err' });
    });
  }

  function hook() {
    if (hooked || !G.on) return; hooked = true;
    G.on('change', function () { if (mounted) load(); });
    G.on('filtre', function () { if (mounted) { st.ln = 30; st.bk = null; render(); } });
    G.on('theme', function () { if (mounted) renderBody(); });
    G.on('config', function () { if (mounted) renderBody(); });
    G.on('login', function () { if (mounted) { data = null; load(); } });
  }

  G.register('stats', {
    mount: function (container) {
      if (!container) return;
      injectCss(); hook();
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = document.createElement('div'); root.className = 'mod-stats';
      container.innerHTML = ''; container.appendChild(root);
      mounted = true; bind(root);
      document.addEventListener('pointerdown', docDown, true);
      data = null; render(); load();
      if (window.ResizeObserver) {
        var timer = null;
        ro = new ResizeObserver(function () {
          clearTimeout(timer);
          timer = setTimeout(function () { if (root && Math.abs(root.clientWidth - lastW) > 8) { hideTip(); drawCharts(); } }, 120);
        });
        ro.observe(root);
      }
    },
    unmount: function () {
      mounted = false; tok++;
      document.removeEventListener('pointerdown', docDown, true);
      if (ro) { ro.disconnect(); ro = null; }
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null; model = null; tipEl = null; hovEl = null; tipFrom = null;
    }
  });
})();

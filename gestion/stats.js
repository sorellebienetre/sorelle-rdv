/* Sorelle Bien-Être, interface de gestion : vue « Statistiques ».
 * Module autonome (contrat window.G : docs/GESTION-V2-SPEC.md §1 et §3).
 * Tout est calculé dans le navigateur à partir de G.historique() (+ G.clientes() pour les clientes à risque).
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
  var PERIODES = [['semaine', 'Cette semaine'], ['mois', 'Ce mois'], ['moisDernier', 'Mois dernier'], ['3mois', '3 derniers mois'], ['annee', 'Année'], ['perso', 'Personnalisé']];
  var SVGNS = 'http://www.w3.org/2000/svg';

  var st = { period: 'mois', du: '', au: '', cle: null, cleNom: '', lf: 'tous', lq: '', ln: 30 };
  var root = null, mounted = false, hooked = false, tok = 0, ro = null, lastW = 0, data = null, model = null, err = null;

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
  function dur(r) { var a = toMin(r.debut), b = toMin(r.fin); return isNaN(a) || isNaN(b) ? 0 : Math.max(0, b - a) / 60; }
  function key(r) { return U().clientKey(r.prenom || '', r.nom || ''); }
  function fullName(r) { return ((r.prenom || '') + ' ' + (r.nom || '')).trim() || 'Sans nom'; }
  function pcol(id) { try { return G.pratColor(id) || '#8E9583'; } catch (e) { return '#8E9583'; } }
  function pname(id) { try { return G.pratName(id) || id; } catch (e) { return id; } }
  function tint(hex, a) { try { return G.tint ? G.tint(hex, a) : hex; } catch (e) { return hex; } }
  function filtrePrat() { var p = G.filtre && G.filtre.prat; return p === 'laurie' || p === 'lea' ? p : 'tous'; }
  function prats() {
    var all = [];
    try { all = G.prats() || []; } catch (e) { all = []; }
    var f = filtrePrat();
    return f === 'tous' ? all : all.filter(function (p) { return p.id === f; });
  }
  function niceMax(v) {
    if (!(v > 0)) return 4;
    var raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    var steps = p >= 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 3, 4, 5, 6, 8, 10], m = 10;
    for (var i = 0; i < steps.length; i++) if (n <= steps[i]) { m = steps[i]; break; }
    var r = Math.max(1, m * p) * 4; return r < 4 ? 4 : r;
  }

  /* ---------------- périodes ---------------- */
  function range(kind) {
    var t = today(), du, au, pdu, pau, label, plabel;
    if (kind === 'semaine') {
      du = weekStart(t); au = add(du, 6); pdu = add(du, -7); pau = add(du, -1);
      label = 'Semaine du ' + fDM(du) + ' au ' + fDM(au); plabel = 'à la semaine précédente';
    } else if (kind === 'moisDernier') {
      du = addMonths(t, -1); au = monthEnd(du); pdu = addMonths(t, -2); pau = monthEnd(pdu);
      label = cap(fMonth(du, true)); plabel = 'à ' + fMonth(pdu, true);
    } else if (kind === '3mois') {
      du = addMonths(t, -2); au = monthEnd(t); pdu = addMonths(t, -5); pau = add(du, -1);
      label = cap(MOIS[+du.slice(5, 7) - 1]) + ' à ' + fMonth(au, false); plabel = 'aux 3 mois précédents';
    } else if (kind === 'annee') {
      var y = t.slice(0, 4); du = y + '-01-01'; au = y + '-12-31'; pdu = (y - 1) + '-01-01'; pau = (y - 1) + '-12-31';
      label = 'Année ' + y; plabel = 'à l’année ' + (y - 1);
    } else if (kind === 'perso') {
      du = st.du || monthStart(t); au = st.au || t; if (au < du) { var x = du; du = au; au = x; }
      if (diff(du, au) > 800) au = add(du, 800);
      var len = diff(du, au) + 1; pau = add(du, -1); pdu = add(pau, -(len - 1));
      label = 'Du ' + fDM(du) + ' au ' + fDM(au) + ' ' + au.slice(0, 4); plabel = 'aux ' + len + ' jours précédents';
    } else {
      du = monthStart(t); au = monthEnd(t); pdu = addMonths(t, -1); pau = monthEnd(pdu);
      label = cap(fMonth(du, true)); plabel = 'à ' + fMonth(pdu, true);
    }
    return { du: du, au: au, pdu: pdu, pau: pau, label: label, plabel: plabel };
  }

  /* ---------------- calculs ---------------- */
  function openDays(cfg, du, au, until) {
    var n = 0, nPast = 0, f = U().dayRules;
    for (var d = du, g = 0; d <= au && g < 900; d = add(d, 1), g++) {
      var ok = false; try { ok = !!f(cfg, d); } catch (e) { ok = false; }
      if (ok) { n++; if (d < until) nPast++; }
    }
    return { all: n, past: nPast };
  }

  /** Indicateurs d'une période. base = RDV clients déjà filtrés (praticienne, cliente). */
  function kpis(base, du, au, ctx) {
    var t = ctx.today, cfg = ctx.cfg, max = cfg.maxClientesJour || 6;
    var list = base.filter(function (r) { return r.date >= du && r.date <= au; });
    var k = { total: list.length, done: 0, upcoming: 0, h: 0, annul: 0, abs: 0, src: { story: 0, en_ligne: 0, manuel: 0, agenda: 0 }, uniq: 0, nouv: 0, freq: null, freqN: 0, fill: null, fillAll: null, perPrat: {} };
    var uniq = {}, gaps = [];
    list.forEach(function (r) {
      var done = r.statut === 'confirme' && r.date < t, up = ACTIVE[r.statut] && r.date >= t;
      if (done) { k.done++; k.h += dur(r); }
      if (up) k.upcoming++;
      if (r.statut === 'annule' || r.statut === 'refuse') k.annul++;
      if (r.statut === 'absente') k.abs++;
      if (done || up) {
        var s = r.source === 'story' ? 'story' : r.source === 'en_ligne' ? 'en_ligne' : r.source === 'agenda' ? 'agenda' : 'manuel';
        k.src[s]++;
        var c = key(r); uniq[c] = 1;
        if (ctx.first[c] === r.id) k.nouv++;
      }
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
    k.annulPct = k.total ? k.annul / k.total : null;
    k.absPct = k.total ? k.abs / k.total : null;
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

  function buildModel() {
    var cfg = (G.cfg && G.cfg()) || (window.SorelleCore && SorelleCore.DEFAULT_CONFIG);
    var t = today(), P = prats(), pids = {}; P.forEach(function (p) { pids[p.id] = 1; });
    var all = (data.hist || []).filter(function (r) { return r && r.type !== 'massage' && r.date; });
    var massages = (data.hist || []).filter(function (r) { return r && r.type === 'massage' && r.statut === 'confirme' && r.date < t && (filtrePrat() === 'tous' || r.praticienne === filtrePrat()); });
    var h = history(all);
    var base = all.filter(function (r) { return pids[r.praticienne] && (!st.cle || key(r) === st.cle); });
    var R = range(st.period);
    var ctx = { today: t, cfg: cfg, prats: P, first: h.first, prevGap: h.prevGap };
    var dataStart = all.reduce(function (m, r) { return r.date < m ? r.date : m; }, '9999');
    var cur = kpis(base, R.du, R.au, ctx);
    // Période en cours : on compare ce qui est comparable (jours déjà écoulés) à la même durée de la période précédente
    var partial = R.au >= t && R.du < t, elapsed = partial ? diff(R.du, t) : 0;
    var cmpCur = partial ? kpis(base, R.du, add(t, -1), ctx) : cur;
    var prev = null;
    if (R.du < t && R.pau >= dataStart) prev = partial ? kpis(base, R.pdu, add(R.pdu, elapsed - 1), ctx) : kpis(base, R.pdu, R.pau, ctx);
    // Aucun jour ouvert encore écoulé dans la période : une comparaison afficherait « −100 % » à tort
    if (partial && !(cmpCur.open && cmpCur.open.past)) prev = null;
    var inP = base.filter(function (r) { return r.date >= R.du && r.date <= R.au; });
    return { cfg: cfg, t: t, P: P, all: all, base: base, R: R, cur: cur, prev: prev, cc: cmpCur, partial: partial, inP: inP, ctx: ctx, dataStart: dataStart,
      modelages: massages.filter(function (r) { return r.date >= R.du && r.date <= R.au; }).length };
  }

  /* ---------------- CSS ---------------- */
  var CSS = [
    '.mod-stats{container-type:inline-size;color:var(--text);font-family:Outfit,-apple-system,system-ui,sans-serif;padding:16px 16px 96px;max-width:1500px;margin:0 auto;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}',
    '.mod-stats *{box-sizing:border-box}',
    '.mod-stats button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.mod-stats input{font:inherit;font-size:16px;color:var(--text)}',
    '.mod-stats :focus-visible{outline:2px solid var(--focus);outline-offset:2px}',
    '.mod-stats .st-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 16px;margin:0 0 12px}',
    '.mod-stats h2{font-size:22px;font-weight:600;margin:0;color:var(--text);letter-spacing:-.01em}',
    '.mod-stats .st-sub{color:var(--text-sub);font-size:14px;margin:0}',
    '.mod-stats .st-tools{display:flex;flex-direction:column;gap:10px;margin-bottom:16px}',
    '.mod-stats .st-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 -16px;padding:2px 16px}',
    '.mod-stats .st-chips::-webkit-scrollbar{display:none}',
    '.mod-stats .chip{flex:0 0 auto;min-height:40px;padding:0 15px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--text-sub);font-size:14px;font-weight:500;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}',
    '.mod-stats .chip[aria-pressed="true"]{background:var(--text);color:var(--bg);border-color:var(--text)}',
    '.mod-stats .chip .n{font-size:12px;opacity:.75}',
    '.mod-stats .st-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.mod-stats .st-dates{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '.mod-stats .st-dates label{display:flex;flex-direction:column;font-size:12px;color:var(--text-sub);gap:3px}',
    '.mod-stats input[type=date],.mod-stats .st-in{min-height:44px;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);padding:0 12px;color-scheme:light dark;min-width:0}',
    '.mod-stats .st-cli{position:relative;flex:1 1 260px;max-width:420px;min-width:0}',
    '.mod-stats .st-cli .st-in{width:100%;padding-left:40px}',
    '.mod-stats .st-cli>.ico{position:absolute;left:12px;top:12px;color:var(--muted);pointer-events:none;width:20px;height:20px}',
    '.mod-stats .ico svg{width:20px;height:20px;display:block}',
    '.mod-stats .st-sugg{position:absolute;z-index:30;left:0;right:0;top:calc(100% + 4px);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);max-height:300px;overflow:auto;padding:4px}',
    '.mod-stats .st-sugg button{display:flex;width:100%;align-items:center;gap:10px;min-height:44px;padding:6px 10px;border-radius:10px;text-align:left}',
    '.mod-stats .st-sugg button:hover,.mod-stats .st-sugg button.on{background:var(--surface-2)}',
    '.mod-stats .st-sugg small{color:var(--muted);margin-left:auto;font-size:12px}',
    '.mod-stats .pill{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 6px 0 14px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);font-weight:500;font-size:14px}',
    '.mod-stats .pill button{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:var(--text-sub)}',
    '.mod-stats .pill button svg{width:16px;height:16px}',
    '.mod-stats .lnk{color:var(--accent);font-weight:500;font-size:14px;min-height:40px;padding:0 6px}',
    '.mod-stats .dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:0 0 auto}',
    '.mod-stats .st-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}',
    '@container (min-width:640px){.mod-stats .st-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '@container (min-width:960px){.mod-stats .st-kpis{grid-template-columns:repeat(5,minmax(0,1fr))}}',
    '.mod-stats .kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:12px 14px;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.mod-stats .kpi .k-l{font-size:13px;color:var(--text-sub);font-weight:500}',
    '.mod-stats .kpi .k-v{font-size:26px;font-weight:600;line-height:1.15;color:var(--text);letter-spacing:-.01em;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap}',
    '.mod-stats .kpi .k-v small{font-size:14px;font-weight:500;color:var(--text-sub)}',
    '.mod-stats .kpi .k-s{font-size:12.5px;color:var(--muted);line-height:1.35}',
    '.mod-stats .kpi .k-s b{font-weight:600;color:var(--text-sub)}',
    '.mod-stats .cmp{font-size:12.5px;font-weight:600;white-space:nowrap}',
    '.mod-stats .cmp.up{color:var(--ok)}.mod-stats .cmp.down{color:var(--danger)}.mod-stats .cmp.eq{color:var(--muted)}',
    '.mod-stats .kpi.wide{grid-column:1/-1}',
    '@container (min-width:640px){.mod-stats .kpi.wide{grid-column:span 3}}',
    '@container (min-width:960px){.mod-stats .kpi.wide{grid-column:span 2}}',
    '.mod-stats .srcbar{display:flex;height:8px;border-radius:99px;overflow:hidden;background:var(--surface-2);margin:6px 0 4px}',
    '.mod-stats .srcs{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;color:var(--text-sub)}',
    '.mod-stats .srcs b{color:var(--text);font-weight:600}',
    '.mod-stats .st-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-bottom:14px}',
    '@container (min-width:720px){.mod-stats .st-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mod-stats .span2{grid-column:span 2}}',
    '@container (min-width:1160px){.mod-stats .st-grid.g3{grid-template-columns:repeat(3,minmax(0,1fr))}}',
    '.mod-stats .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:14px 16px 12px;min-width:0}',
    '.mod-stats .card h3{font-size:16px;font-weight:600;margin:0;color:var(--text)}',
    '.mod-stats .card .c-sub{font-size:13px;color:var(--muted);margin:2px 0 10px}',
    '.mod-stats .legend{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--text-sub);margin:8px 0 0}',
    '.mod-stats .legend span{display:inline-flex;align-items:center;gap:6px}',
    '.mod-stats .legend i{width:12px;height:12px;border-radius:3px;display:inline-block}',
    '.mod-stats .legend i.ln{height:3px;border-radius:2px}',
    '.mod-stats .legend i.dash{height:0;border-top:2px dashed var(--text-sub);width:14px;border-radius:0}',
    '.mod-stats [data-chart]{width:100%;min-height:60px;position:relative}',
    '.mod-stats [data-chart] svg{display:block;width:100%;overflow:visible}',
    '.mod-stats svg .ax{fill:var(--muted);font-size:11px;font-family:inherit}',
    '.mod-stats svg .axs{fill:var(--text-sub);font-size:12px;font-family:inherit}',
    '.mod-stats svg .vl{fill:var(--text);font-size:11.5px;font-weight:600;font-family:inherit}',
    '.mod-stats svg .gl{stroke:var(--line);stroke-width:1}',
    '.mod-stats svg .thr{stroke:var(--text-sub);stroke-width:1.5;stroke-dasharray:4 4}',
    '.mod-stats svg .bgc{fill:var(--surface-2)}',
    '.mod-stats .empty-c{color:var(--muted);font-size:14px;padding:24px 0;text-align:center}',
    '.mod-stats .rk{list-style:none;margin:0;padding:0}',
    '.mod-stats .rk li{border-top:1px solid var(--line)}',
    '.mod-stats .rk li:first-child{border-top:0}',
    '.mod-stats .rk button,.mod-stats .rk .row{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:6px 2px;text-align:left}',
    '.mod-stats .rk .nm{flex:1;min-width:0;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.mod-stats .rk .nm small{display:block;font-weight:400;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .rk .v{font-weight:600;white-space:nowrap}',
    '.mod-stats .rk .rnk{width:22px;color:var(--muted);font-size:13px;text-align:right;flex:0 0 auto}',
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
    '.mod-stats .ls-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 6px}',
    '.mod-stats .ls-tools .st-chips{flex:1 1 100%;margin:0 -16px}',
    '.mod-stats .ls-tools .st-in{flex:1 1 220px;max-width:360px}',
    '.mod-stats .rl{list-style:none;margin:0;padding:0}',
    '.mod-stats .rl li{border-top:1px solid var(--line)}',
    '.mod-stats .rl button{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:4px 10px;align-items:center;width:100%;min-height:52px;padding:8px 2px;text-align:left}',
    '.mod-stats .rl .d{font-size:13px;color:var(--text-sub);line-height:1.25}',
    '.mod-stats .rl .d b{display:block;color:var(--text);font-weight:600;font-size:14px}',
    '.mod-stats .rl .w{min-width:0}',
    '.mod-stats .rl .w b{display:flex;align-items:center;gap:7px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .rl .w small{display:block;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.mod-stats .more{display:block;margin:10px auto 2px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--line);color:var(--text-sub);font-weight:500}',
    '.mod-stats .note{font-size:12.5px;color:var(--muted);margin:10px 0 0}',
    '.mod-stats .st-empty{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);padding:40px 20px;text-align:center;color:var(--text-sub)}',
    '.mod-stats .st-empty .big{width:48px;height:48px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center;margin:0 auto 12px;color:var(--muted)}',
    '.mod-stats .st-empty h3{color:var(--text);font-size:17px;margin:0 0 6px}',
    '.mod-stats .btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 20px;border-radius:999px;background:var(--accent);color:var(--accent-text);font-weight:500;margin-top:12px}',
    '.mod-stats .sk{background:var(--surface-2);border-radius:8px;position:relative;overflow:hidden}',
    '.mod-stats .sk::after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--surface) 60%,transparent),transparent);animation:mst-sh 1.3s infinite}',
    '@keyframes mst-sh{100%{transform:translateX(100%)}}',
    '@media (prefers-reduced-motion:reduce){.mod-stats .sk::after{animation:none}}'
  ].join('\n');

  function injectCss() {
    if (document.querySelector('style[data-module="stats"]')) return;
    var s = document.createElement('style'); s.setAttribute('data-module', 'stats'); s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------------- rendu ---------------- */
  function skeleton() {
    var k = ''; for (var i = 0; i < 10; i++) k += '<div class="kpi"><div class="sk" style="height:13px;width:60%"></div><div class="sk" style="height:28px;width:45%;margin-top:8px"></div><div class="sk" style="height:11px;width:80%;margin-top:8px"></div></div>';
    var c = ''; for (var j = 0; j < 4; j++) c += '<div class="card"><div class="sk" style="height:16px;width:40%"></div><div class="sk" style="height:180px;margin-top:14px;border-radius:12px"></div></div>';
    return '<div class="st-kpis" aria-busy="true">' + k + '</div><div class="st-grid">' + c + '</div>';
  }

  function render() {
    if (!root) return;
    var html = '<div class="st-head"><h2>Statistiques</h2><p class="st-sub" data-r="sub"></p></div>' +
      '<div class="st-tools" data-r="tools"></div><div data-r="body"></div>';
    root.innerHTML = html;
    renderTools();
    renderBody();
  }

  function renderTools() {
    var el = root && root.querySelector('[data-r="tools"]'); if (!el) return;
    var t = today(), R = range(st.period);
    var h = '<div class="st-chips" role="group" aria-label="Période">' + PERIODES.map(function (p) {
      var lb = p[0] === 'annee' ? 'Année ' + t.slice(0, 4) : p[1];
      return '<button class="chip" data-period="' + p[0] + '" aria-pressed="' + (st.period === p[0]) + '">' + esc(lb) + '</button>';
    }).join('') + '</div>';
    if (st.period === 'perso') {
      h += '<div class="st-dates"><label>Du<input type="date" data-date="du" value="' + esc(st.du || R.du) + '" min="2024-01-01" max="2030-12-31"></label>' +
        '<label>Au<input type="date" data-date="au" value="' + esc(st.au || R.au) + '" min="2024-01-01" max="2030-12-31"></label></div>';
    }
    h += '<div class="st-row">';
    if (st.cle) {
      h += '<span class="pill">' + esc(st.cleNom) + '<button data-act="clear-cli" aria-label="Retirer le filtre cliente">' + icon('x') + '</button></span>' +
        (G.openClient || (G.modules && G.modules.clientes) ? '<button class="lnk" data-act="fiche">Voir la fiche</button>' : '');
    } else {
      h += '<div class="st-cli"><span class="ico">' + icon('search') + '</span><input class="st-in" data-r="cli" type="search" autocomplete="off" placeholder="Stats d’une cliente…" aria-label="Filtrer par cliente"><div class="st-sugg" data-r="sugg" hidden></div></div>';
    }
    h += '</div>';
    el.innerHTML = h;
  }

  function sub() {
    var s = root && root.querySelector('[data-r="sub"]'); if (!s || !model) return;
    var f = filtrePrat();
    s.textContent = model.R.label + (f !== 'tous' ? ' · ' + pname(f) : '') + (model.prev ? ' · comparé ' + model.R.plabel + (model.partial ? ' (même nombre de jours)' : '') : '');
  }

  function cmp(cur, prev, opts) {
    opts = opts || {};
    if (prev == null || cur == null || !model.prev) return '';
    var d, txt;
    if (opts.points) { d = Math.round((cur - prev) * 100); txt = (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' pt'; }
    else {
      if (!prev) return cur ? '<span class="cmp eq">nouveau</span>' : '';
      d = Math.round((cur - prev) / prev * 100); txt = (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + ' %';
    }
    var cls = d === 0 || opts.neutral ? 'eq' : (d > 0) !== !!opts.invert ? 'up' : 'down';
    return '<span class="cmp ' + cls + '" title="Période précédente : ' + esc(opts.fmt ? opts.fmt(prev) : nf(prev)) + '">' + txt + '</span>';
  }

  function kpi(label, value, extra, subTxt, cls) {
    return '<div class="kpi' + (cls ? ' ' + cls : '') + '"><span class="k-l">' + esc(label) + '</span><span class="k-v">' + value + (extra || '') + '</span>' + (subTxt ? '<span class="k-s">' + subTxt + '</span>' : '') + '</div>';
  }

  function renderKpis(m) {
    var c = m.cur, p = m.prev || {}, q = m.cc, P = m.P, h = '';
    h += kpi('RDV réalisés', nf(c.done), cmp(q.done, p.done), c.open.past ? nf(c.open.past) + ' jour' + (c.open.past > 1 ? 's' : '') + ' ouvert' + (c.open.past > 1 ? 's' : '') + ' écoulé' + (c.open.past > 1 ? 's' : '') : 'Période à venir');
    h += kpi('RDV à venir', nf(c.upcoming), '', c.upcoming ? 'Confirmés ou à valider' : 'Aucun RDV prévu');
    if (!st.cle) {
      var v = c.fill != null ? c.fill : c.fillAll;
      var parts = P.length > 1 ? P.map(function (x) { var q = c.perPrat[x.id]; return '<b>' + esc(x.nom) + '</b> ' + pct(c.fill != null ? q.fill : q.fillAll); }).join(' · ') : '';
      var s2 = c.fill == null ? 'Réservé à ce jour (' + nf(c.open.all) + ' j × ' + c.max + ')' : (c.upcoming ? 'Avec les RDV à venir : ' + pct(c.fillAll) : nf(c.open.past) + ' j ouverts × ' + c.max + ' clientes');
      h += kpi('Taux de remplissage', pct(v), c.fill != null ? cmp(q.fill, p.fill, { points: true, fmt: pct }) : '', (parts ? parts + '<br>' : '') + s2);
    }
    h += kpi('Heures réalisées', hours(c.h), cmp(q.h, p.h, { fmt: hours }), m.modelages ? 'Hors ' + m.modelages + ' modelage' + (m.modelages > 1 ? 's' : '') : (c.done ? 'Soit ' + hours(c.h / c.done).replace(' h', ' h') + ' par RDV' : ''));
    h += kpi('Annulations', nf(c.annul) + ' <small>' + pct(c.annulPct) + '</small>', cmp(q.annul, p.annul, { invert: true }), 'Sur ' + nf(c.total) + ' RDV pris');
    h += kpi('Absences', nf(c.abs) + ' <small>' + pct(c.absPct) + '</small>', cmp(q.abs, p.abs, { invert: true }), 'Clientes non venues');
    if (!st.cle) {
      h += kpi('Clientes', nf(c.uniq), cmp(q.uniq, p.uniq), 'Clientes différentes (réalisés et à venir)');
      h += kpi('Nouvelles clientes', nf(c.nouv), cmp(q.nouv, p.nouv), m.R.du <= add(m.dataStart, 31) ? 'Historique depuis le ' + fDM(m.dataStart) + ' ' + m.dataStart.slice(0, 4) : 'Première visite sur la période');
    }
    h += kpi('Retour moyen', c.freq != null ? nf(Math.round(c.freq)) + ' <small>jours</small>' : '—', q.freq != null && p.freq != null ? cmp(q.freq, p.freq, { neutral: true, fmt: function (x) { return nf(Math.round(x)) + ' j'; } }) : '', c.freqN ? 'Écart moyen entre deux visites (' + c.freqN + ' retour' + (c.freqN > 1 ? 's' : '') + ')' : 'Pas assez de visites');
    var s = c.src, tot = s.story + s.en_ligne + s.manuel + s.agenda;
    var segs = [['story', 'Story', 'var(--accent)'], ['en_ligne', 'En ligne', 'var(--sage)'], ['manuel', 'Manuel', 'var(--text-sub)'], ['agenda', 'Importés', 'var(--line)']].filter(function (x) { return x[0] !== 'agenda' || s.agenda; });
    var bar = '<div class="srcbar" aria-hidden="true">' + (tot ? segs.map(function (x) { return s[x[0]] ? '<i style="width:' + (s[x[0]] / tot * 100) + '%;background:' + x[2] + '"></i>' : ''; }).join('') : '') + '</div>';
    h += '<div class="kpi' + (st.cle ? '' : ' wide') + '"><span class="k-l">Origine des RDV</span>' + bar + '<div class="srcs">' + segs.map(function (x) {
      return '<span><span class="dot" style="background:' + x[2] + ';margin-right:5px"></span>' + x[1] + ' <b>' + nf(s[x[0]]) + '</b>' + (x[0] === 'story' && p.src ? ' ' + cmp(q.src.story, p.src.story) : '') + '</span>';
    }).join('') + '</div></div>';
    return '<div class="st-kpis">' + h + '</div>';
  }

  function cardHtml(id, title, subTxt, legend, cls) {
    return '<section class="card' + (cls ? ' ' + cls : '') + '"><h3>' + esc(title) + '</h3><p class="c-sub">' + subTxt + '</p><div data-chart="' + id + '"></div>' + (legend || '') + '</section>';
  }
  function pratLegend(P, extra) {
    return '<div class="legend">' + P.map(function (p) { return '<span><i style="background:' + pcol(p.id) + '"></i>' + esc(p.nom) + '</span>'; }).join('') + (extra || '') + '</div>';
  }

  /* fenêtres des graphiques mensuel et hebdomadaire */
  function monthsWin(m) {
    var a = monthStart(m.R.du), b = monthStart(m.R.au), out = [];
    var n = 0; for (var x = a; x <= b && n < 40; x = addMonths(x, 1), n++) out.push(x);
    if (out.length < 3) {
      out = []; var s = addMonths(b, -5); var ds = monthStart(m.dataStart < '9999' ? m.dataStart : b);
      if (s < ds) s = ds;
      for (x = s; x <= b; x = addMonths(x, 1)) out.push(x);
      var e2 = addMonths(b, 1); while (out.length < 6 && e2 <= addMonths(monthStart(m.t), 4)) { out.push(e2); e2 = addMonths(e2, 1); }
    }
    return out;
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

  function renderBody() {
    var el = root && root.querySelector('[data-r="body"]'); if (!el) return;
    if (err) {
      el.innerHTML = '<div class="st-empty"><div class="big">' + icon('alert') + '</div><h3>Impossible de charger les statistiques</h3><p>' + esc(err) + '</p><button class="btn" data-act="retry">Réessayer</button></div>';
      return;
    }
    if (!data) { el.innerHTML = skeleton(); return; }
    model = buildModel(); sub();
    var m = model;
    if (!m.all.length) {
      el.innerHTML = '<div class="st-empty"><div class="big">' + icon('chart') + '</div><h3>Pas encore de statistiques</h3><p>Les chiffres apparaîtront ici dès les premiers rendez-vous enregistrés.</p></div>';
      return;
    }
    var P = m.P, h = renderKpis(m);
    var mw = monthsWin(m), ww = weeksWin(m);
    var mSub = mw.length && (monthStart(m.R.du) !== mw[0] || monthStart(m.R.au) !== mw[mw.length - 1]) ? 'De ' + fMonth(mw[0]) + ' à ' + fMonth(mw[mw.length - 1]) + ' (période en gras)' : 'Réalisés en plein, à venir en atténué';
    var wSub = 'Semaines du ' + fDM(ww[0]) + ' au ' + fDM(add(ww[ww.length - 1], 6)) + ' (réalisés et à venir)';
    var lightLeg = '<span><i style="background:' + pcol(P[0] ? P[0].id : 'laurie') + ';opacity:.42"></i>À venir</span>';
    h += '<div class="st-grid">';
    h += cardHtml('mois', 'RDV par mois', esc(mSub), pratLegend(P, lightLeg));
    h += cardHtml('semaine', 'RDV par semaine', esc(wSub), pratLegend(P, P.length > 1 ? '<span><i class="dash"></i>Total</span>' : ''));
    if (!st.cle) {
      var seuil = (m.cfg.magie && m.cfg.magie.seuilRemplissage) || 50;
      h += cardHtml('remplissage', 'Remplissage par semaine', 'RDV ÷ (jours ouverts × ' + (m.cfg.maxClientesJour || 6) + ' clientes), semaines à venir : réservé à ce jour', pratLegend(P, '<span><i class="dash"></i>Seuil ' + seuil + ' %</span>'));
    }
    h += cardHtml('presta', 'Par prestation', 'Prestations des RDV réalisés et à venir sur la période', '');
    h += cardHtml('chaleur', 'Jours et heures', 'Nombre de RDV par jour et par heure de début, sur la période', '', st.cle ? '' : 'span2');
    h += '</div>';

    // Classements
    h += '<div class="st-grid">' + topClients(m) + (st.cle ? '' : riskClients(m)) + '</div>';
    // Récap mensuel
    h += recap(m);
    // Liste des RDV
    h += '<section class="card" data-r="liste"></section>';
    el.innerHTML = h;
    renderList();
    drawCharts();
  }

  function topClients(m) {
    var by = {};
    m.inP.forEach(function (r) {
      if (!(r.statut === 'confirme' && r.date < m.t)) return;
      var k = key(r), o = by[k] = by[k] || { k: k, nom: fullName(r), n: 0, h: 0, p: {} };
      o.n++; o.h += dur(r); o.p[r.praticienne] = (o.p[r.praticienne] || 0) + 1;
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n || b.h - a.h || a.nom.localeCompare(b.nom); });
    var title = st.cle ? 'Ses visites' : 'Top clientes';
    if (st.cle) {
      var o = list[0];
      return '<section class="card"><h3>' + title + '</h3><p class="c-sub">Sur la période</p>' + (o ? '<ul class="rk"><li><div class="row"><span class="nm">' + esc(o.nom) + '<small>' + hours(o.h) + ' de soins</small></span><span class="v">' + o.n + ' visite' + (o.n > 1 ? 's' : '') + '</span></div></li></ul>' : '<p class="empty-c">Aucune visite réalisée sur la période</p>') + '</section>';
    }
    var rows = list.slice(0, 8).map(function (o, i) {
      var pid = Object.keys(o.p).sort(function (a, b) { return o.p[b] - o.p[a]; })[0], col = pcol(pid);
      return '<li><button data-cli="' + esc(o.k) + '"><span class="rnk">' + (i + 1) + '</span><span class="av" style="background:' + col + ';color:' + G.textOn(col) + '">' + esc(o.nom.charAt(0)) + '</span><span class="nm">' + esc(o.nom) + '<small>' + esc(pname(pid)) + ' · ' + hours(o.h) + '</small></span><span class="v">' + o.n + ' visite' + (o.n > 1 ? 's' : '') + '</span></button></li>';
    }).join('');
    return '<section class="card"><h3>' + title + '</h3><p class="c-sub">Visites réalisées sur la période</p>' + (rows ? '<ul class="rk">' + rows + '</ul>' : '<p class="empty-c">Aucune visite réalisée sur la période</p>') + '</section>';
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
      return '<li><button data-cli="' + esc(p.cle) + '"><span class="av" style="background:' + col + ';color:' + G.textOn(col) + '">' + esc((p.prenom || '?').charAt(0)) + '</span><span class="nm">' + esc((p.prenom + ' ' + p.nom).trim()) + '<small>Vient tous les ' + p.habitude.frequenceJours + ' j · dernière le ' + fDM(p.derniere) + '</small></span><span class="tag ' + (x.r >= 2.5 ? 'danger' : 'warn') + '">' + x.d + ' j</span></button></li>';
    }).join('');
    return '<section class="card"><h3>Clientes à risque</h3><p class="c-sub">' + (list.length ? list.length + ' cliente' + (list.length > 1 ? 's' : '') + ' sans RDV, absente' + (list.length > 1 ? 's' : '') + ' depuis plus de 1,5 × leur rythme habituel' : 'Pas revenues depuis plus de 1,5 × leur rythme habituel') + '</p>' +
      (rows ? '<ul class="rk">' + rows + '</ul>' + (list.length > 8 ? '<p class="note">Et ' + (list.length - 8) + ' autre' + (list.length - 8 > 1 ? 's' : '') + ' : voir « Nos clientes », filtre À relancer.</p>' : '') : '<p class="empty-c">Aucune cliente à risque, bravo.</p>') + '</section>';
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
    return '<section class="card" style="margin-bottom:14px"><h3>Récapitulatif par mois</h3><p class="c-sub">RDV réalisés et à venir, heures réalisées, annulations' + (st.cle ? '' : ', remplissage') + '</p><div class="tbl-w"><table><thead><tr><th>Mois</th><th>RDV</th><th>Heures</th><th>Annul.</th><th>Rempl.</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  var LF = [['tous', 'Tous'], ['realise', 'Réalisés'], ['avenir', 'À venir'], ['annule', 'Annulés'], ['absente', 'Absences']];
  function lfMatch(r, f, t) {
    if (f === 'realise') return r.statut === 'confirme' && r.date < t;
    if (f === 'avenir') return !!ACTIVE[r.statut] && r.date >= t;
    if (f === 'annule') return r.statut === 'annule' || r.statut === 'refuse';
    if (f === 'absente') return r.statut === 'absente';
    return true;
  }
  var STATUT = { confirme: ['Confirmé', 'ok'], en_attente: ['À valider', 'warn'], annule: ['Annulé', 'danger'], refuse: ['Refusé', 'danger'], absente: ['Absente', 'danger'] };

  function renderList() {
    var el = root && root.querySelector('[data-r="liste"]'); if (!el || !model) return;
    var m = model, t = m.t, q = norm(st.lq);
    var counts = {}; LF.forEach(function (f) { counts[f[0]] = 0; });
    m.inP.forEach(function (r) { LF.forEach(function (f) { if (lfMatch(r, f[0], t)) counts[f[0]]++; }); });
    var list = m.inP.filter(function (r) {
      if (!lfMatch(r, st.lf, t)) return false;
      if (q && norm(fullName(r) + ' ' + (r.code || '')).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (b.date + b.debut).localeCompare(a.date + a.debut); });
    var keepFocus = document.activeElement && document.activeElement.getAttribute('data-r') === 'lq';
    var head = '<h3>Rendez-vous de la période</h3><p class="c-sub">' + nf(m.inP.length) + ' RDV au total, tous statuts</p>' +
      '<div class="ls-tools"><div class="st-chips" role="group" aria-label="Statut">' + LF.map(function (f) {
        return '<button class="chip" data-lf="' + f[0] + '" aria-pressed="' + (st.lf === f[0]) + '">' + f[1] + ' <span class="n">' + counts[f[0]] + '</span></button>';
      }).join('') + '</div>' + (st.cle ? '' : '<input class="st-in" data-r="lq" type="search" placeholder="Rechercher un nom ou un code" aria-label="Rechercher dans les RDV" value="' + esc(st.lq) + '">') + '</div>';
    var rows = list.slice(0, st.ln).map(function (r) {
      var stt = STATUT[r.statut] || [r.statut, ''], col = pcol(r.praticienne);
      var realise = r.statut === 'confirme' && r.date < t;
      var svc = (r.services || []).map(function (id) { try { return G.svcName(id, true); } catch (e) { return id; } }).join(' + ');
      return '<li><button data-rdv="' + esc(r.id) + '"><span class="d"><b>' + esc(fDate(r.date)) + '</b>' + esc(fH(r.debut)) + '</span><span class="w"><b><span class="dot" style="background:' + col + '"></span>' + esc(fullName(r)) + '</b><small>' + esc(pname(r.praticienne)) + ' · ' + esc(svc) + '</small></span><span class="tag ' + (realise ? '' : stt[1]) + '">' + (realise ? 'Réalisé' : stt[0]) + '</span></button></li>';
    }).join('');
    el.innerHTML = head + (rows ? '<ul class="rl">' + rows + '</ul>' : '<p class="empty-c">Aucun rendez-vous' + (q ? ' pour « ' + esc(st.lq) + ' »' : '') + '</p>') +
      (list.length > st.ln ? '<button class="more" data-act="more">Afficher plus (' + (list.length - st.ln) + ' restants)</button>' : '');
    if (keepFocus) { var i = el.querySelector('[data-r="lq"]'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* type search */ } } }
  }

  /* ---------------- graphiques SVG ---------------- */
  function svg(w, h, inner, label) {
    return '<svg xmlns="' + SVGNS + '" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + esc(label || '') + '">' + inner + '</svg>';
  }
  function soft(col) { return 'color-mix(in srgb,' + col + ' 82%,var(--text))'; }
  function step(n, slot, minPx) { return Math.max(1, Math.ceil(minPx / Math.max(1, slot))); }

  function drawCharts() {
    if (!root || !model) return;
    var m = model;
    root.querySelectorAll('[data-chart]').forEach(function (el) {
      var w = Math.floor(el.clientWidth) || 300, id = el.getAttribute('data-chart');
      try {
        if (id === 'mois') el.innerHTML = chartMonths(m, w);
        else if (id === 'semaine') el.innerHTML = chartWeeks(m, w);
        else if (id === 'remplissage') el.innerHTML = chartFill(m, w);
        else if (id === 'presta') el.innerHTML = chartSvc(m, w);
        else if (id === 'chaleur') el.innerHTML = chartHeat(m, w);
      } catch (e) { el.innerHTML = '<p class="empty-c">Graphique indisponible</p>'; if (window.console) console.warn(e); }
    });
    lastW = root.clientWidth;
  }

  function yGrid(L, W, T, ph, max, fmt) {
    var s = '';
    for (var i = 0; i <= 4; i++) {
      var v = max * i / 4, y = Math.round(T + ph - ph * i / 4) + 0.5;
      s += '<line class="gl" x1="' + L + '" x2="' + W + '" y1="' + y + '" y2="' + y + '"/>';
      s += '<text class="ax" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (fmt ? fmt(v) : nf(v, 1)) + '</text>';
    }
    return s;
  }

  function chartMonths(m, W) {
    var months = monthsWin(m), t = m.t, P = m.P;
    var vals = months.map(function (mo) {
      var end = monthEnd(mo), o = {};
      P.forEach(function (p) { o[p.id] = { d: 0, b: 0 }; });
      m.base.forEach(function (r) {
        if (r.date < mo || r.date > end || !o[r.praticienne]) return;
        if (r.statut === 'confirme' && r.date < t) o[r.praticienne].d++;
        else if (ACTIVE[r.statut] && r.date >= t) o[r.praticienne].b++;
      });
      var tot = 0; P.forEach(function (p) { tot += o[p.id].d + o[p.id].b; });
      return { mo: mo, o: o, tot: tot, inP: mo >= monthStart(m.R.du) && mo <= monthStart(m.R.au) };
    });
    var maxV = niceMax(Math.max.apply(null, vals.map(function (v) { return v.tot; }).concat([1])));
    var H = 220, L = 34, R = 6, T = 18, B = 26, pw = W - L - R, ph = H - T - B, n = months.length, slot = pw / n;
    var bw = Math.min(46, slot * 0.66), s = yGrid(L, W - R, T, ph, maxV, function (v) { return nf(v); });
    var k = step(n, slot, 38);
    vals.forEach(function (v, i) {
      var x = L + slot * i + (slot - bw) / 2, y = T + ph, op = v.inP ? 1 : 0.55;
      var tip = cap(fMonth(v.mo, true)) + ' : ' + v.tot + ' RDV';
      s += '<g opacity="' + op + '"><title>' + esc(tip + P.map(function (p) { return ', ' + p.nom + ' ' + (v.o[p.id].d + v.o[p.id].b); }).join('')) + '</title>';
      P.forEach(function (p) {
        var col = pcol(p.id), a = v.o[p.id];
        [[a.d, 1], [a.b, 0.42]].forEach(function (seg) {
          if (!seg[0]) return;
          var hh = seg[0] / maxV * ph; y -= hh;
          s += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, hh - 1).toFixed(1) + '" rx="2" fill="' + col + '" fill-opacity="' + seg[1] + '"/>';
        });
      });
      if (v.tot && bw >= 16) s += '<text class="vl" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" text-anchor="middle">' + v.tot + '</text>';
      s += '</g>';
      if (i % k === 0) s += '<text class="' + (v.inP && vals.some(function (z) { return !z.inP; }) ? 'axs' : 'ax') + '" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle"' + (v.inP && vals.some(function (z) { return !z.inP; }) ? ' font-weight="600"' : '') + '>' + esc(MOIS[+v.mo.slice(5, 7) - 1]) + '</text>';
    });
    return svg(W, H, s, 'RDV par mois');
  }

  function lineChart(W, o) {
    var H = o.h || 210, L = 38, R = 12, T = 16, B = 26, pw = W - L - R, ph = H - T - B, n = o.labels.length;
    var maxV = o.max || niceMax(Math.max.apply(null, [1].concat.apply([], o.series.map(function (s) { return s.values.filter(function (v) { return v != null; }); }))));
    var x = function (i) { return L + (n <= 1 ? pw / 2 : i * pw / (n - 1)); };
    var y = function (v) { return T + ph - Math.min(v, maxV) / maxV * ph; };
    var s = yGrid(L, W - R, T, ph, maxV, o.fmt);
    if (o.thr != null) s += '<line class="thr" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(o.thr).toFixed(1) + '" y2="' + y(o.thr).toFixed(1) + '"/>';
    if (o.nowIdx != null && o.nowIdx >= 0 && o.nowIdx < n) s += '<rect class="bgc" x="' + x(o.nowIdx).toFixed(1) + '" y="' + T + '" width="' + Math.max(0, (W - R) - x(o.nowIdx)).toFixed(1) + '" height="' + ph + '" opacity=".6"/>';
    var k = step(n, pw / Math.max(1, n - 1), 46);
    o.labels.forEach(function (lb, i) { if (i % k === 0 || (i === n - 1 && (n - 1) % k > k / 2)) s += '<text class="ax" x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(lb) + '</text>'; });
    o.series.forEach(function (se) {
      var pts = [], d = '';
      se.values.forEach(function (v, i) { if (v == null) return; pts.push([x(i), y(v), v, i]); });
      pts.forEach(function (p, i) { d += (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); });
      var stroke = se.dash ? 'var(--text-sub)' : soft(se.color);
      if (d) s += '<path d="' + d + '" fill="none" style="stroke:' + stroke + '" stroke-width="' + (se.dash ? 1.5 : 2.5) + '" stroke-linejoin="round" stroke-linecap="round"' + (se.dash ? ' stroke-dasharray="4 4"' : '') + '/>';
      if (!se.dash && n <= 30) pts.forEach(function (p) {
        s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="' + se.color + '" style="stroke:var(--surface)" stroke-width="1.5"><title>' + esc(se.name + ', ' + o.tips[p[3]] + ' : ' + (o.fmt ? o.fmt(p[2]) : p[2])) + '</title></circle>';
      });
    });
    return svg(W, H, s, o.label);
  }

  function weekVals(m, ww, fn) {
    var t = m.t;
    return ww.map(function (w) {
      var end = add(w, 6), o = {};
      m.P.forEach(function (p) { o[p.id] = 0; });
      m.base.forEach(function (r) {
        if (r.date < w || r.date > end || o[r.praticienne] == null) return;
        if ((r.statut === 'confirme' && r.date < t) || (ACTIVE[r.statut] && r.date >= t)) o[r.praticienne]++;
      });
      return fn ? fn(o, w, end) : o;
    });
  }
  function nowIdx(ww, t) { for (var i = 0; i < ww.length; i++) if (ww[i] <= t && t <= add(ww[i], 6)) return i; return ww[ww.length - 1] < t ? null : 0; }

  function chartWeeks(m, W) {
    var ww = weeksWin(m), vals = weekVals(m, ww), P = m.P;
    var series = P.map(function (p) { return { name: p.nom, color: pcol(p.id), values: vals.map(function (o) { return o[p.id]; }) }; });
    if (P.length > 1) series.push({ name: 'Total', dash: true, values: vals.map(function (o) { var s = 0; P.forEach(function (p) { s += o[p.id]; }); return s; }) });
    return lineChart(W, { labels: ww.map(fDM), tips: ww.map(function (w) { return 'semaine du ' + fDM(w); }), series: series, fmt: function (v) { return nf(v); }, nowIdx: nowIdx(ww, m.t), label: 'RDV par semaine' });
  }

  function chartFill(m, W) {
    var ww = weeksWin(m), max = m.cfg.maxClientesJour || 6, cfg = m.cfg, P = m.P;
    var vals = weekVals(m, ww, function (o, w, end) {
      var od = openDays(cfg, w, end, '0000').all, r = {};
      P.forEach(function (p) { r[p.id] = od ? o[p.id] / (od * max) * 100 : null; });
      return r;
    });
    var seuil = (cfg.magie && cfg.magie.seuilRemplissage) || 50;
    var series = P.map(function (p) { return { name: p.nom, color: pcol(p.id), values: vals.map(function (o) { return o[p.id] == null ? null : Math.round(o[p.id]); }) }; });
    return lineChart(W, { labels: ww.map(fDM), tips: ww.map(function (w) { return 'semaine du ' + fDM(w); }), series: series, max: 100, thr: seuil, fmt: function (v) { return nf(Math.round(v)) + ' %'; }, nowIdx: nowIdx(ww, m.t), label: 'Remplissage par semaine' });
  }

  function chartSvc(m, W) {
    var cnt = {}, t = m.t;
    m.inP.forEach(function (r) { if ((r.statut === 'confirme' && r.date < t) || (ACTIVE[r.statut] && r.date >= t)) (r.services || []).forEach(function (id) { cnt[id] = (cnt[id] || 0) + 1; }); });
    var rows = Object.keys(cnt).map(function (id) { return { id: id, n: cnt[id] }; }).sort(function (a, b) { return b.n - a.n; });
    if (!rows.length) return '<p class="empty-c">Aucune prestation sur la période</p>';
    var tot = rows.reduce(function (a, b) { return a + b.n; }, 0);
    var rowH = 32, H = rows.length * rowH + 4, lw = Math.min(140, Math.max(96, W * 0.34)), vw = 64, bw = W - lw - vw, maxV = rows[0].n, s = '';
    rows.forEach(function (r, i) {
      var y = i * rowH + 4, col; try { col = G.svcColor(r.id); } catch (e) { col = '#8E9583'; }
      var name; try { name = G.svcName(r.id, true); } catch (e) { name = r.id; }
      var w = Math.max(3, r.n / maxV * bw);
      s += '<g><title>' + esc((function () { try { return G.svcName(r.id); } catch (e) { return r.id; } })() + ' : ' + r.n) + '</title>';
      s += '<text class="axs" x="0" y="' + (y + 17) + '">' + esc(name) + '</text>';
      s += '<rect class="bgc" x="' + lw + '" y="' + (y + 5) + '" width="' + bw.toFixed(1) + '" height="18" rx="5"/>';
      s += '<rect x="' + lw + '" y="' + (y + 5) + '" width="' + w.toFixed(1) + '" height="18" rx="5" fill="' + col + '"/>';
      s += '<text class="vl" x="' + (lw + bw + 8) + '" y="' + (y + 18) + '">' + r.n + ' <tspan class="ax">' + Math.round(r.n / tot * 100) + ' %</tspan></text></g>';
    });
    return svg(W, H, s, 'Prestations');
  }

  function chartHeat(m, W) {
    var cfg = m.cfg, t = m.t, days = [1, 2, 3, 4, 5, 6, 0], grid = {}, hasDay = {}, hMin = 24, hMax = 0;
    days.forEach(function (d) { var r = cfg.semaine && cfg.semaine[String(d)]; if (r && r.ouvert) { hasDay[d] = 1; hMin = Math.min(hMin, Math.floor(toMin(r.debut) / 60)); hMax = Math.max(hMax, Math.ceil(toMin(r.fin || '20:00') / 60) - 1); } });
    var any = 0;
    m.inP.forEach(function (r) {
      if (!((r.statut === 'confirme' && r.date < t) || (ACTIVE[r.statut] && r.date >= t))) return;
      var d = wd(r.date), h = Math.floor(toMin(r.debut) / 60); if (isNaN(h)) return;
      hasDay[d] = 1; hMin = Math.min(hMin, h); hMax = Math.max(hMax, h);
      grid[d + '-' + h] = (grid[d + '-' + h] || 0) + 1; any++;
    });
    if (!any) return '<p class="empty-c">Aucun rendez-vous sur la période</p>';
    if (hMin > hMax) { hMin = 9; hMax = 19; }
    var rows = days.filter(function (d) { return hasDay[d]; }), cols = [];
    for (var h = hMin; h <= hMax; h++) cols.push(h);
    var maxV = 1; Object.keys(grid).forEach(function (k) { if (grid[k] > maxV) maxV = grid[k]; });
    var L = 36, T = 18, gap = 3, cw = (W - L) / cols.length, ch = Math.max(26, Math.min(40, cw * 0.8)), H = T + rows.length * ch + 4, s = '';
    var showN = cw >= 22;
    var k = step(cols.length, cw, 28);
    cols.forEach(function (hh, j) { if (j % k === 0) s += '<text class="ax" x="' + (L + j * cw + cw / 2).toFixed(1) + '" y="12" text-anchor="middle">' + hh + 'h</text>'; });
    var totDay = {};
    rows.forEach(function (d, i) {
      var y = T + i * ch;
      s += '<text class="axs" x="0" y="' + (y + ch / 2 + 4).toFixed(1) + '">' + JL[d] + '</text>';
      cols.forEach(function (hh, j) {
        var v = grid[d + '-' + hh] || 0, x = L + j * cw, a = v ? 0.16 + 0.84 * v / maxV : 0;
        totDay[d] = (totDay[d] || 0) + v;
        s += '<g><title>' + esc(JL[d] + ' ' + hh + 'h : ' + v + ' RDV') + '</title>';
        s += v ? '<rect x="' + (x + gap / 2).toFixed(1) + '" y="' + (y + gap / 2).toFixed(1) + '" width="' + (cw - gap).toFixed(1) + '" height="' + (ch - gap).toFixed(1) + '" rx="4" style="fill:var(--accent);fill-opacity:' + a.toFixed(2) + '"/>'
          : '<rect class="bgc" x="' + (x + gap / 2).toFixed(1) + '" y="' + (y + gap / 2).toFixed(1) + '" width="' + (cw - gap).toFixed(1) + '" height="' + (ch - gap).toFixed(1) + '" rx="4"/>';
        if (v && showN) s += '<text x="' + (x + cw / 2).toFixed(1) + '" y="' + (y + ch / 2 + 4).toFixed(1) + '" text-anchor="middle" style="font-size:11.5px;font-weight:600;fill:' + (a > 0.55 ? 'var(--accent-text)' : 'var(--text)') + '">' + v + '</text>';
        s += '</g>';
      });
    });
    return svg(W, H, s, 'Carte de chaleur jour et heure');
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
    st.cle = p.cle; st.cleNom = (p.prenom + ' ' + p.nom).trim(); st.ln = 30; st.lf = 'tous'; st.lq = '';
    render();
  }

  /* ---------------- événements ---------------- */
  var qTimer = null;
  function bind(el) {
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !el.contains(b)) return;
      var a;
      if ((a = b.getAttribute('data-period'))) {
        if (a === 'perso' && !st.du) { var R = range(st.period); st.du = R.du; st.au = R.au > today() ? today() : R.au; if (st.au < st.du) st.au = st.du; }
        st.period = a; st.ln = 30; render(); return;
      }
      if ((a = b.getAttribute('data-lf'))) { st.lf = a; st.ln = 30; renderList(); return; }
      if ((a = b.getAttribute('data-rdv'))) { if (G.openRdv) G.openRdv(a); return; }
      if ((a = b.getAttribute('data-cli'))) { openCli(a); return; }
      if ((a = b.getAttribute('data-pick')) != null && a !== '') { pick(sugg[+a]); return; }
      a = b.getAttribute('data-act');
      if (a === 'more') { st.ln += 30; renderList(); }
      else if (a === 'clear-cli') { st.cle = null; st.cleNom = ''; render(); }
      else if (a === 'fiche') openCli(st.cle);
      else if (a === 'retry') load();
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
      var d = e.target.getAttribute('data-date'); if (!d || !e.target.value) return;
      st[d] = e.target.value;
      if (st.du && st.au && st.au < st.du) { if (d === 'du') st.au = st.du; else st.du = st.au; }
      renderBody();
      var o = root.querySelector('[data-date="' + (d === 'du' ? 'au' : 'du') + '"]'); if (o) o.value = st[d === 'du' ? 'au' : 'du'];
    });
    el.addEventListener('focusout', function (e) {
      if (e.target.getAttribute('data-r') !== 'cli') return;
      setTimeout(function () { var box = root && root.querySelector('[data-r="sugg"]'); if (box && !box.contains(document.activeElement)) box.hidden = true; }, 150);
    });
  }
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
    G.on('filtre', function () { if (mounted) { st.ln = 30; render(); } });
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
      data = null; render(); load();
      if (window.ResizeObserver) {
        var timer = null;
        ro = new ResizeObserver(function () {
          clearTimeout(timer);
          timer = setTimeout(function () { if (root && Math.abs(root.clientWidth - lastW) > 8) drawCharts(); }, 120);
        });
        ro.observe(root);
      }
    },
    unmount: function () {
      mounted = false; tok++;
      if (ro) { ro.disconnect(); ro = null; }
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null; model = null;
    }
  });
})();

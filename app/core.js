/**
 * ============================================================================
 *  SORELLE BIEN-ÊTRE — CŒUR MÉTIER (moteur de planning + API)
 * ============================================================================
 *  Ce fichier est IDENTIQUE dans :
 *    - apps-script/Core.gs   (production, Google Apps Script)
 *    - site/app/core.js      (mode démo dans le navigateur)
 *  Il ne dépend d'aucune API Google : le stockage et l'environnement
 *  (date du jour, hash, verrou...) sont injectés.
 * ============================================================================
 */
var SorelleCore = (function () {
  'use strict';

  var VERSION = '1.3.0';

  /* ------------------------------------------------------------------------
   * CONFIGURATION PAR DÉFAUT (modifiable depuis l'écran Réglages)
   * ---------------------------------------------------------------------- */
  var DEFAULT_CONFIG = {
    version: 1,
    salon: {
      nom: 'Sorelle Bien-Être',
      adresse: "4 Rue de l'École, 69360 Saint-Symphorien-d'Ozon"
    },
    praticiennes: [
      { id: 'laurie', nom: 'Laurie', telephone: '07 78 38 76 14', active: true },
      { id: 'lea', nom: 'Léa', telephone: '07 78 34 72 95', active: true }
    ],
    // Clé = jour de la semaine (0 = dimanche ... 6 = samedi)
    // dernierGel / dernierSemi = heure de début maximale d'une prestation
    semaine: {
      '0': { ouvert: false },
      '1': { ouvert: false },
      '2': { ouvert: true, debut: '09:00', fin: '20:00', dernierGel: '18:30', dernierSemi: '19:00' },
      '3': { ouvert: true, debut: '09:00', fin: '20:00', dernierGel: '18:30', dernierSemi: '19:00' },
      '4': { ouvert: false },
      '5': { ouvert: true, debut: '09:00', fin: '20:00', dernierGel: '18:30', dernierSemi: '19:00' },
      '6': { ouvert: true, debut: '09:00', fin: '17:00', dernierGel: '16:30', dernierSemi: '16:30' }
    },
    // Horaires exceptionnels par date : { '2026-12-21': { ouvert:true, debut:..., ... } }
    exceptions: {},
    dejeuner: { actif: true, debut: '11:30', fin: '14:00', duree: 60 },
    repriseApresMidi: '13:30',
    battement: 15,               // minutes de pause après CHAQUE rendez-vous
    pauseEntrePrestations: 0,    // minutes entre mains et pieds d'un même RDV
    maxClientesJour: 6,          // par praticienne
    pasMinutes: 15,              // grille de calcul
    horizonJours: 60,            // réservation possible jusqu'à J+60
    validation: 'auto',          // 'auto' | 'nouvelles' | 'toutes'
    minCreneauxParfaits: 2,      // sous ce nombre, on élargit (mode souple)
    trouMax: 30,                 // trou "maîtrisé" toléré en dernier recours (min)
    maxRdvParCliente: 2,         // RDV futurs actifs max par nom (en ligne)
    retentionMois: 24,           // purge des RDV passés au-delà (24 mois : statistiques)
    magie: { horizonJours: 7, services: ['remplissage'], seuilRemplissage: 50, retardMaxRelance: 30, afficherPriorites: true, afficherRelances: false },
    affichage: { heureFin: false }, // planning : seulement l'heure de début (la plage complète en option) // « Remplir l'agenda »
    services: [
      { id: 'remplissage',      nom: 'Remplissage gel',                     categorie: 'main',    duree: 120, famille: 'gel',  enLigne: true, info: 'Vous avez déjà du gel posé chez nous.' },
      { id: 'extension',        nom: 'Extension gel',                       categorie: 'main',    duree: 135, famille: 'gel',  enLigne: true, info: 'Ongles naturels, sans rien dessus.' },
      { id: 'renfort',          nom: 'Renfort sur ongle naturel',           categorie: 'main',    duree: 90,  famille: 'gel',  enLigne: true, info: 'Gel sur vos ongles, sans allongement.' },
      { id: 'semi',             nom: 'Semi-permanent',                      categorie: 'main',    duree: 60,  famille: 'semi', enLigne: true, info: 'Rien sur les ongles actuellement.' },
      { id: 'depose_pose_semi', nom: 'Dépose + pose semi-permanent',        categorie: 'main',    duree: 75,  famille: 'semi', enLigne: true, info: 'Vous avez déjà du semi-permanent.' },
      { id: 'depose_gel',       nom: 'Dépose gel',                          categorie: 'main',    duree: 45,  famille: 'gel',  enLigne: true, info: 'Retrait seul, sans nouvelle pose.' },
      { id: 'depose_semi',      nom: 'Dépose semi-permanent',               categorie: 'main',    duree: 30,  famille: 'semi', enLigne: true, info: 'Retrait seul, sans nouvelle pose.' },
      { id: 'yumi',             nom: 'YUMI FEET — soin callosités',         categorie: 'pied',    duree: 50,  famille: 'semi', enLigne: true, info: 'Soin anti-callosités.' },
      { id: 'yumi_semi',        nom: 'YUMI FEET + semi-permanent',          categorie: 'pied',    duree: 75,  famille: 'semi', enLigne: true, info: 'Soin + pose semi sur les pieds.' },
      { id: 'yumi_depose_semi', nom: 'YUMI FEET + dépose + semi-permanent', categorie: 'pied',    duree: 90,  famille: 'semi', enLigne: true, info: 'Soin complet, retrait et nouvelle pose.' },
      { id: 'massage',          nom: 'Modelage californien',                categorie: 'massage', duree: 80,  famille: 'semi', enLigne: false, info: '' },
      { id: 'massage_zone',     nom: 'Modelage zone',                       categorie: 'massage', duree: 45,  famille: 'semi', enLigne: false, info: '' },
      { id: 'massage_visage',   nom: 'Modelage visage',                     categorie: 'massage', duree: 30,  famille: 'semi', enLigne: false, info: '' }
    ],
    textes: {
      annulation: "Annulation ou modification uniquement par téléphone ou SMS auprès de votre praticienne, au plus tard 48 h avant le rendez-vous. Aucune annulation n'est possible moins de 48 h avant.",
      nouvelleCliente: "Nous acceptons uniquement les ongles naturels, le gel ou le semi-permanent. Si vous avez de la résine ou de la porcelaine, merci de la faire retirer avant votre rendez-vous.",
      porcelaine: "Nous ne pouvons pas travailler sur de la résine ou de la porcelaine. Faites-la retirer chez votre prothésiste actuelle, puis réservez une extension gel ou un renfort.",
      enAttente: "Votre demande est enregistrée. Elle sera validée par votre praticienne : vérifiez son statut avec votre code de réservation d'ici 24 h."
    }
  };

  var ACTIVE = { confirme: true, en_attente: true };
  var ONGLES = ['rien', 'gel', 'semi', 'porcelaine'];

  /* ------------------------------------------------------------------------
   * OUTILS
   * ---------------------------------------------------------------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toMin(hhmm) {
    if (typeof hhmm !== 'string' || !/^\d{1,2}:\d{2}$/.test(hhmm)) return NaN;
    var p = hhmm.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }
  function toHHMM(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function isDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  function isTime(s) { return !isNaN(toMin(s)); }
  function parseDate(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) {
    var d = new Date(parseDate(s) + n * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function weekday(s) { return new Date(parseDate(s)).getUTCDay(); }
  function overlaps(a, b) { return a.s < b.e && b.s < a.e; }
  function err(code, message, extra) {
    var e = new Error(message);
    e.code = code; e.extra = extra || null;
    return e;
  }
  function cleanName(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }
  // Prénom / nom : lettres, espaces, tiret, apostrophe. Pas de chiffres ni @ :
  // empêche de glisser un téléphone ou un email dans les champs.
  var NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿŒœ' .\-]{1,40}$/; // le point autorise les initiales (« Alexia B. »)
  function normKey(s) {
    return cleanName(s).toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[ç]/g, 'c').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u');
  }

  /* ------------------------------------------------------------------------
   * CONFIG
   * ---------------------------------------------------------------------- */
  function mergeConfig(stored) {
    var cfg = clone(DEFAULT_CONFIG);
    if (!stored) return cfg;
    Object.keys(stored).forEach(function (k) { cfg[k] = stored[k]; });
    if (!cfg.exceptions) cfg.exceptions = {};
    if (!cfg.textes) cfg.textes = clone(DEFAULT_CONFIG.textes);
    Object.keys(DEFAULT_CONFIG.textes).forEach(function (k) {
      if (cfg.textes[k] == null) cfg.textes[k] = DEFAULT_CONFIG.textes[k];
    });
    return cfg;
  }

  function validateConfig(cfg) {
    var errors = [];
    function chkTime(v, label) { if (!isTime(v)) errors.push(label + ' : heure invalide'); }
    if (!cfg.semaine) errors.push('Semaine manquante');
    else for (var d = 0; d < 7; d++) {
      var j = cfg.semaine[String(d)];
      if (!j) { errors.push('Jour ' + d + ' manquant'); continue; }
      if (j.ouvert) {
        chkTime(j.debut, 'Jour ' + d + ' début');
        chkTime(j.fin, 'Jour ' + d + ' fin');
        chkTime(j.dernierGel, 'Jour ' + d + ' dernier gel');
        chkTime(j.dernierSemi, 'Jour ' + d + ' dernier semi');
      }
    }
    Object.keys(cfg.exceptions || {}).forEach(function (date) {
      if (!isDate(date)) errors.push('Exception : date invalide ' + date);
      var j = cfg.exceptions[date];
      if (j && j.ouvert) {
        chkTime(j.debut, date + ' début'); chkTime(j.fin, date + ' fin');
        chkTime(j.dernierGel, date + ' dernier gel'); chkTime(j.dernierSemi, date + ' dernier semi');
      }
    });
    if (cfg.dejeuner && cfg.dejeuner.actif) {
      chkTime(cfg.dejeuner.debut, 'Déjeuner début'); chkTime(cfg.dejeuner.fin, 'Déjeuner fin');
      if (!(cfg.dejeuner.duree > 0)) errors.push('Durée du déjeuner invalide');
    }
    if (cfg.repriseApresMidi) chkTime(cfg.repriseApresMidi, 'Reprise après-midi');
    ['battement', 'pauseEntrePrestations', 'maxClientesJour', 'pasMinutes', 'horizonJours', 'minCreneauxParfaits', 'trouMax', 'maxRdvParCliente', 'retentionMois']
      .forEach(function (k) {
        if (typeof cfg[k] !== 'number' || cfg[k] < 0 || cfg[k] !== Math.floor(cfg[k])) errors.push(k + ' : nombre entier attendu');
      });
    if (!(cfg.pasMinutes >= 5)) errors.push('pasMinutes doit être ≥ 5');
    if (['auto', 'nouvelles', 'toutes'].indexOf(cfg.validation) < 0) errors.push('Mode de validation invalide');
    if (!Array.isArray(cfg.services) || !cfg.services.length) errors.push('Aucune prestation');
    else cfg.services.forEach(function (s) {
      if (!s.id || !s.nom) errors.push('Prestation sans identifiant ou nom');
      if (['main', 'pied', 'massage'].indexOf(s.categorie) < 0) errors.push(s.nom + ' : catégorie invalide');
      if (!(s.duree > 0)) errors.push(s.nom + ' : durée invalide');
      if (['gel', 'semi'].indexOf(s.famille) < 0) errors.push(s.nom + ' : famille invalide');
    });
    if (!Array.isArray(cfg.praticiennes) || !cfg.praticiennes.length) errors.push('Aucune praticienne');
    return errors;
  }

  function serviceMap(cfg) {
    var m = {};
    cfg.services.forEach(function (s) { m[s.id] = s; });
    return m;
  }
  function pratIds(cfg) { return cfg.praticiennes.map(function (p) { return p.id; }); }
  function pratById(cfg, id) {
    for (var i = 0; i < cfg.praticiennes.length; i++) if (cfg.praticiennes[i].id === id) return cfg.praticiennes[i];
    return null;
  }

  /* ------------------------------------------------------------------------
   * MOTEUR DE PLANNING
   * ---------------------------------------------------------------------- */

  /** Règles horaires d'une date, en minutes. null si fermé. */
  function dayRules(cfg, date) {
    var r = (cfg.exceptions && cfg.exceptions[date]) || cfg.semaine[String(weekday(date))];
    if (!r || !r.ouvert) return null;
    return {
      debut: toMin(r.debut),
      fin: toMin(r.fin || '20:00'),
      dernierGel: toMin(r.dernierGel),
      dernierSemi: toMin(r.dernierSemi)
    };
  }

  /** Une indisponibilité couvre-t-elle cette date ? Renvoie l'intervalle (min) ou null. */
  function blockInterval(b, date) {
    if (date < b.du || date > b.au) return null;
    var s = b.heureDebut ? toMin(b.heureDebut) : 0;
    var e = b.heureFin ? toMin(b.heureFin) : 24 * 60;
    if (!(e > s)) return null;
    return { s: s, e: e };
  }

  /**
   * Construit l'état d'occupation d'une journée.
   *  prat[id].busy      : tout ce qui empêche la praticienne de prendre une cliente
   *  prat[id].lunchBusy : ce qui l'empêche de déjeuner (ses RDV + ses massages)
   *  cabine             : occupation de la cabine (pieds + massages)
   */
  function buildDay(cfg, date, rdvs, blocages, excludeId) {
    var rules = dayRules(cfg, date);
    var b = cfg.battement;
    var day = { date: date, rules: rules, prat: {}, cabine: [] };
    pratIds(cfg).forEach(function (id) { day.prat[id] = { busy: [], lunchBusy: [], count: 0 }; });

    rdvs.forEach(function (r) {
      if (r.date !== date || !ACTIVE[r.statut] || r.id === excludeId) return;
      var s = toMin(r.debut), e = toMin(r.fin);
      if (r.type === 'massage') {
        // Un massage bloque TOUT l'institut
        Object.keys(day.prat).forEach(function (p) {
          day.prat[p].busy.push({ s: s, e: e + b, kind: 'massage', ref: r.id });
        });
        if (day.prat[r.praticienne]) day.prat[r.praticienne].lunchBusy.push({ s: s, e: e + b });
        day.cabine.push({ s: s, e: e + b, ref: r.id });
        return;
      }
      var P = day.prat[r.praticienne];
      if (!P) return;
      P.busy.push({ s: s, e: e + b, kind: 'rdv', ref: r.id });
      P.lunchBusy.push({ s: s, e: e + b });
      P.count++;
      (r.segments || []).forEach(function (seg) {
        if (seg.lieu === 'cabine') day.cabine.push({ s: toMin(seg.debut), e: toMin(seg.fin) + b, ref: r.id });
      });
    });

    blocages.forEach(function (bl) {
      var iv = blockInterval(bl, date);
      if (!iv) return;
      var targets = bl.praticienne === 'tous' ? Object.keys(day.prat) : [bl.praticienne];
      targets.forEach(function (p) {
        if (day.prat[p]) day.prat[p].busy.push({ s: iv.s, e: iv.e, kind: 'blocage', ref: bl.id });
      });
    });

    cfg.praticiennes.forEach(function (p) {
      if (p.active === false && day.prat[p.id]) day.prat[p.id].busy.push({ s: 0, e: 24 * 60, kind: 'inactive', ref: null });
    });
    return day;
  }

  /** La praticienne peut-elle encore déjeuner (créneau libre de X min dans la fenêtre) ? */
  function lunchOk(cfg, intervals) {
    var dj = cfg.dejeuner;
    if (!dj || !dj.actif) return true;
    var ws = toMin(dj.debut), we = toMin(dj.fin), need = dj.duree;
    var ivs = intervals.slice().sort(function (a, b) { return a.s - b.s; });
    var cursor = ws;
    for (var i = 0; i < ivs.length; i++) {
      var iv = ivs[i];
      if (iv.e <= cursor) continue;
      if (iv.s >= we) break;
      if (Math.min(iv.s, we) - cursor >= need) return true;
      cursor = Math.max(cursor, iv.e);
    }
    return we - cursor >= need;
  }

  /** Vérifie si la combinaison est autorisée. Renvoie la liste d'objets service. */
  function resolveServices(cfg, ids, opts) {
    opts = opts || {};
    if (!Array.isArray(ids) || !ids.length) throw err('prestation_requise', 'Choisissez au moins une prestation.');
    var map = serviceMap(cfg), list = [], mains = 0, pieds = 0;
    var seen = {};
    ids.forEach(function (id) {
      if (seen[id]) throw err('combinaison', 'Prestation en double.');
      seen[id] = true;
      var s = map[id];
      if (!s) throw err('prestation_inconnue', 'Prestation inconnue : ' + id);
      if (s.categorie === 'massage') throw err('combinaison', 'Les modelages se réservent uniquement par téléphone.');
      if (opts.public && !s.enLigne) throw err('prestation_indisponible', s.nom + " n'est pas réservable en ligne.");
      if (s.categorie === 'main') mains++;
      if (s.categorie === 'pied') pieds++;
      list.push(s);
    });
    if (mains > 1) throw err('combinaison', 'Une seule prestation pour les mains par rendez-vous.');
    if (pieds > 1) throw err('combinaison', 'Une seule prestation pour les pieds par rendez-vous.');
    return list;
  }

  /** Ordres possibles : 1 prestation = 1 ordre ; mains + pieds = les deux ordres (mains d'abord en priorité). */
  function orders(list) {
    if (list.length < 2) return [list];
    var main = list.filter(function (s) { return s.categorie === 'main'; })[0];
    var pied = list.filter(function (s) { return s.categorie === 'pied'; })[0];
    return [[main, pied], [pied, main]];
  }

  /**
   * Tente de placer un RDV (services dans un ordre donné) à l'heure `start` (min).
   * Renvoie { ok, reasons[], segments[], debut, fin }.
   */
  function place(cfg, day, praticienne, ordered, start, opts) {
    opts = opts || {};
    var reasons = [];
    var rules = day.rules;
    var P = day.prat[praticienne];
    if (!rules) return { ok: false, reasons: ['ferme'] };
    if (!P) return { ok: false, reasons: ['praticienne_inconnue'] };
    var b = cfg.battement, t = start, segs = [];
    for (var i = 0; i < ordered.length; i++) {
      var svc = ordered[i];
      var last = svc.famille === 'gel' ? rules.dernierGel : rules.dernierSemi;
      if (t < rules.debut || t > last) { if (reasons.indexOf('hors_horaires') < 0) reasons.push('hors_horaires'); }
      segs.push({ service: svc.id, s: t, e: t + svc.duree, lieu: svc.categorie === 'pied' ? 'cabine' : 'poste' });
      t = t + svc.duree + (i < ordered.length - 1 ? (cfg.pauseEntrePrestations || 0) : 0);
    }
    var end = segs[segs.length - 1].e;
    var pi = { s: start, e: end + b };
    var conflicts = [];
    P.busy.forEach(function (iv) { if (overlaps(pi, iv)) conflicts.push(iv); });
    if (conflicts.length) reasons.push(conflicts.some(function (c) { return c.kind === 'blocage' || c.kind === 'inactive'; }) ? 'indisponible' :
      conflicts.some(function (c) { return c.kind === 'massage'; }) ? 'massage' : 'praticienne_occupee');
    segs.forEach(function (seg) {
      if (seg.lieu !== 'cabine') return;
      var ci = { s: seg.s, e: seg.e + b };
      if (day.cabine.some(function (iv) { return overlaps(ci, iv); }) && reasons.indexOf('cabine_occupee') < 0) reasons.push('cabine_occupee');
    });
    if (!lunchOk(cfg, P.lunchBusy.concat([pi]))) reasons.push('pause_dejeuner');
    if (!opts.ignoreCap && P.count >= cfg.maxClientesJour) reasons.push('journee_complete');
    return {
      ok: reasons.length === 0,
      reasons: reasons,
      debut: start,
      fin: end,
      segments: segs.map(function (sg) { return { service: sg.service, debut: toHHMM(sg.s), fin: toHHMM(sg.e), lieu: sg.lieu }; })
    };
  }

  function minUsefulGap(cfg) {
    var m = Infinity;
    cfg.services.forEach(function (s) { if (s.categorie !== 'massage' && s.duree < m) m = s.duree; });
    return (m === Infinity ? 30 : m) + cfg.battement;
  }

  /** Trou effectif : si le trou peut accueillir la pause déjeuner, on la déduit. */
  function effectiveGap(cfg, from, to) {
    var g = to - from;
    var dj = cfg.dejeuner;
    if (!dj || !dj.actif || g <= 0) return g;
    var ov = Math.min(to, toMin(dj.fin)) - Math.max(from, toMin(dj.debut));
    return ov >= dj.duree ? g - dj.duree : g;
  }

  /**
   * CALCUL DES CRÉNEAUX
   * mode 'public' : sélection compressée (le moins de trous possible)
   * mode 'all'    : tous les créneaux faisables, classés (pour l'admin)
   *
   * Classes :
   *   A = collé à quelque chose (début de journée, RDV, blocage, reprise 13h30,
   *       fin de journée) sans créer de trou inutilisable
   *   B = ne crée pas de trou inutilisable mais n'est collé à rien
   *   C = crée un petit trou (≤ trouMax) — dernier recours
   */
  function computeSlots(cfg, day, praticienne, list, mode) {
    var rules = day.rules;
    if (!rules || !day.prat[praticienne]) return [];
    var P = day.prat[praticienne];
    var step = cfg.pasMinutes || 15;
    var b = cfg.battement;
    var minUseful = minUsefulGap(cfg);
    var reprise = cfg.repriseApresMidi ? toMin(cfg.repriseApresMidi) : -1;
    var ords = orders(list);
    var maxLast = Math.max(rules.dernierGel, rules.dernierSemi);

    // Passe 1 : placements faisables
    var feas = [];
    for (var s = rules.debut; s <= maxLast; s += step) {
      ords.forEach(function (ord, oi) {
        var pl = place(cfg, day, praticienne, ord, s);
        if (!pl.ok) return;
        var endBuf = pl.fin + b;
        var prevEnd = rules.debut, nextStart = null;
        P.busy.forEach(function (iv) {
          if (iv.e <= s && iv.e > prevEnd) prevEnd = iv.e;
          if (iv.s >= endBuf && (nextStart === null || iv.s < nextStart)) nextStart = iv.s;
        });
        feas.push({
          s: s, oi: oi, ord: ord, pl: pl, endBuf: endBuf,
          gB: effectiveGap(cfg, prevEnd, s),
          gA: nextStart === null ? null : effectiveGap(cfg, endBuf, nextStart)
        });
      });
    }
    // Ancre "fin de journée" : le dernier départ possible quand rien n'est prévu après
    var latestOpen = -1;
    feas.forEach(function (f) { if (f.gA === null && f.s > latestOpen) latestOpen = f.s; });

    function dead(g) { return g !== null && g > 0 && g < minUseful; }
    var rank = { A: 0, B: 1, C: 2 };
    var best = {};
    feas.forEach(function (f) {
      var adj = f.gB === 0 || f.s === reprise || f.gA === 0 || f.s === latestOpen;
      var trou = (dead(f.gB) ? f.gB : 0) + (dead(f.gA) ? f.gA : 0);
      var cls = trou === 0 ? (adj ? 'A' : 'B') : 'C';
      var tight = Math.min(f.gB, f.gA === null ? Infinity : f.gA);
      var cand = { s: f.s, cls: cls, trou: trou, tight: tight, ord: f.ord, pl: f.pl };
      var cur = best[f.s];
      if (!cur || rank[cls] < rank[cur.cls] || (cls === cur.cls && trou < cur.trou)) best[f.s] = cand;
    });
    var all = Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b2) { return a.s - b2.s; });

    var out;
    if (mode === 'all') out = all;
    else {
      var A = all.filter(function (c) { return c.cls === 'A'; });
      var need = cfg.minCreneauxParfaits || 0;
      out = A.slice();
      if (out.length < need) {
        var B = all.filter(function (c) { return c.cls === 'B'; })
          .sort(function (x, y) { return x.tight - y.tight || x.s - y.s; });
        out = out.concat(B.slice(0, need - out.length));
      }
      if (out.length === 0) {
        var C = all.filter(function (c) { return c.cls === 'C' && c.trou <= cfg.trouMax; })
          .sort(function (x, y) { return x.trou - y.trou || x.s - y.s; });
        out = C.slice(0, Math.max(1, need));
      }
      out.sort(function (a, b2) { return a.s - b2.s; });
    }
    return out.map(function (c) {
      return {
        debut: toHHMM(c.s),
        fin: toHHMM(c.pl.fin),
        classe: c.cls,
        trou: c.trou,
        ordre: c.ord.map(function (x) { return x.id; }),
        segments: c.pl.segments
      };
    });
  }

  /**
   * TROUS À COMBLER : fenêtres libres d'une praticienne sur une journée, avec
   * pour chaque prestation l'heure de début possible la plus tôt dans la fenêtre.
   * fromMin : ne rien proposer avant cette minute (aujourd'hui = maintenant).
   */
  function freeWindows(cfg, day, praticienne, fromMin) {
    var rules = day.rules, P = day.prat[praticienne];
    if (!rules || !P) return [];
    if (P.count >= cfg.maxClientesJour) return [];
    var step = cfg.pasMinutes || 15;
    var start = Math.max(rules.debut, Math.ceil((fromMin || 0) / step) * step);
    var maxLast = Math.max(rules.dernierGel, rules.dernierSemi);
    var busy = P.busy.slice().sort(function (a, b) { return a.s - b.s; });
    var gaps = [], cur = start;
    busy.forEach(function (iv) {
      if (iv.e <= cur) return;
      if (iv.s > cur) gaps.push({ s: cur, e: Math.min(iv.s, 24 * 60) });
      cur = Math.max(cur, iv.e);
    });
    if (cur <= maxLast) gaps.push({ s: cur, e: Math.max(rules.fin, maxLast) });
    var svcs = cfg.services.filter(function (s) { return s.categorie !== 'massage'; });
    var slotsBySvc = {};
    svcs.forEach(function (s) { slotsBySvc[s.id] = computeSlots(cfg, day, praticienne, [s], 'all'); });
    var out = [];
    gaps.forEach(function (g) {
      if (g.e - g.s <= 0 || g.s > maxLast) return;
      var fits = [];
      svcs.forEach(function (s) {
        var first = slotsBySvc[s.id].filter(function (c) { var m = toMin(c.debut); return m >= g.s && m < g.e; })[0];
        if (first) fits.push({ service: s.id, debut: first.debut, fin: first.fin });
      });
      if (!fits.length) return;
      var premier = fits.reduce(function (m, f) { return f.debut < m ? f.debut : m; }, '99:99');
      out.push({ debut: premier, fin: toHHMM(g.e), libreMin: g.e - toMin(premier), prestations: fits });
    });
    return out;
  }

  /* ------------------------------------------------------------------------
   * CLIENTES & HABITUDES
   * ---------------------------------------------------------------------- */
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function clientKey(prenom, nom) { return normKey(prenom) + '|' + normKey(nom); }
  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; }), m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
  }
  function momentOf(min) { return min < 12 * 60 ? 'matin' : min < 14 * 60 ? 'midi' : min < 17 * 60 ? 'après-midi' : 'soir'; }

  /** Construit le profil de chaque cliente à partir de ses rendez-vous (toutes périodes). */
  function clientProfiles(cfg, rdvs, today) {
    var map = {};
    rdvs.forEach(function (r) {
      if (!cleanName(r.prenom) && !cleanName(r.nom)) return;
      var k = clientKey(r.prenom, r.nom);
      if (k === 'cliente|agenda') return; // nom introuvable à l'import
      (map[k] = map[k] || { cle: k, prenom: cleanName(r.prenom), nom: cleanName(r.nom), rdvs: [] }).rdvs.push(r);
    });
    return Object.keys(map).map(function (k) { return buildProfile(cfg, map[k], today); });
  }

  function buildProfile(cfg, c, today) {
    var list = c.rdvs.slice().sort(function (a, b) { return (a.date + a.debut).localeCompare(b.date + b.debut); });
    var realises = list.filter(function (r) { return r.statut === 'confirme' && r.date < today; });
    var aVenir = list.filter(function (r) { return ACTIVE[r.statut] && r.date >= today; });
    var actifs = realises.concat(aVenir);
    var count = function (arr, f) { var m = {}; arr.forEach(function (x) { var k = f(x); if (k != null) m[k] = (m[k] || 0) + 1; }); return m; };
    var top = function (m) { var best = null, n = -1; Object.keys(m).forEach(function (k) { if (m[k] > n) { n = m[k]; best = k; } }); return best; };
    var pratCounts = count(actifs, function (r) { return r.type === 'massage' ? null : r.praticienne; });
    var svcCounts = {};
    actifs.forEach(function (r) { (r.services || []).forEach(function (id) { svcCounts[id] = (svcCounts[id] || 0) + 1; }); });
    var comboCounts = count(actifs.filter(function (r) { return r.type !== 'massage'; }), function (r) {
      return (r.services || []).slice().sort().join('+') || null;
    });
    var base = realises.length ? realises : actifs;
    var jourCounts = count(base, function (r) { return weekday(r.date); });
    var jours = Object.keys(jourCounts).map(function (wd) { return { jour: +wd, nom: JOURS[+wd], n: jourCounts[wd] }; })
      .sort(function (a, b) { return b.n - a.n; });
    var hMed = median(base.map(function (r) { return toMin(r.debut); }));
    var heure = hMed == null ? null : toHHMM(Math.round(hMed / 15) * 15);
    var dates = []; realises.forEach(function (r) { if (dates.indexOf(r.date) < 0) dates.push(r.date); });
    var gaps = []; for (var i = 1; i < dates.length; i++) gaps.push(diffDays(dates[i - 1], dates[i]));
    var freq = median(gaps.filter(function (g) { return g >= 7 && g <= 120; }));
    var derniere = realises.length ? realises[realises.length - 1].date : null;
    var habituel = top(comboCounts);
    var svcHab = habituel ? habituel.split('+') : [];
    // Ordre mains puis pieds
    var smap = serviceMap(cfg);
    svcHab.sort(function (a, b) { return ((smap[a] || {}).categorie === 'pied') - ((smap[b] || {}).categorie === 'pied'); });
    var prevue = derniere ? addDays(derniere, freq || (svcHab.indexOf('remplissage') >= 0 ? 28 : 35)) : null;
    var heures = 0;
    realises.forEach(function (r) { heures += Math.max(0, toMin(r.fin) - toMin(r.debut)) / 60; });
    var prochain = aVenir[0] || null;
    return {
      cle: c.cle, prenom: c.prenom, nom: c.nom,
      praticienne: top(pratCounts) || (list[list.length - 1] || {}).praticienne || null,
      praticiennes: pratCounts,
      total: list.length, realises: realises.length, aVenir: aVenir.length,
      annules: list.filter(function (r) { return r.statut === 'annule' || r.statut === 'refuse'; }).length,
      absentes: list.filter(function (r) { return r.statut === 'absente'; }).length,
      premiere: list.length ? list[0].date : null, derniere: derniere,
      prochain: prochain ? { date: prochain.date, debut: prochain.debut, praticienne: prochain.praticienne, services: prochain.services, id: prochain.id } : null,
      services: Object.keys(svcCounts).map(function (id) { return { id: id, n: svcCounts[id] }; }).sort(function (a, b) { return b.n - a.n; }),
      heures: Math.round(heures * 10) / 10,
      habitude: {
        services: svcHab, praticienne: top(pratCounts), jours: jours, heure: heure,
        moment: hMed == null ? null : momentOf(hMed), frequenceJours: freq, prochaineVisitePrevue: prevue
      }
    };
  }

  /**
   * Recommandations de créneaux, classées par score (plus bas = meilleur).
   * Combine : compression du planning (classe A/B/C), habitudes de la cliente
   * (jour, heure, praticienne, date de son prochain soin) et proximité dans le temps.
   */
  function recommendSlots(cfg, rdvs, bls, o) {
    var list = resolveServices(cfg, o.services);
    var prof = o.profil || null, h = prof && prof.habitude;
    var out = [];
    for (var d = o.du; d <= o.au; d = addDays(d, 1)) {
      var day = buildDay(cfg, d, rdvs, bls, o.excludeId);
      if (!day.rules) continue;
      o.praticiennes.forEach(function (pid) {
        computeSlots(cfg, day, pid, list, 'all').forEach(function (c) {
          var m = toMin(c.debut);
          if (d === o.today && m < o.fromMin) return;
          var score = c.classe === 'A' ? 0 : c.classe === 'B' ? 8 : 18 + c.trou / 5;
          var raisons = [];
          if (c.classe === 'A') raisons.push('Sans trou dans le planning');
          if (h) {
            var wd = weekday(d), rank = -1;
            h.jours.forEach(function (j, i) { if (j.jour === wd && rank < 0) rank = i; });
            if (h.jours.length) {
              if (rank === 0) raisons.push('Son jour habituel (' + JOURS[wd] + ')');
              score += rank === 0 ? 0 : rank > 0 ? 4 : 9;
            }
            if (h.heure) {
              var diff = Math.abs(m - toMin(h.heure));
              score += Math.min(diff / 30 * 2.5, 15);
              if (diff <= 45) raisons.push('Proche de son heure habituelle (' + h.heure.replace(':', 'h') + ')');
            }
            if (h.prochaineVisitePrevue) {
              var dd = Math.abs(diffDays(h.prochaineVisitePrevue, d));
              score += Math.min(dd * 1.2, 15);
              if (dd <= 3) raisons.push('Au bon moment pour son prochain soin');
            }
            if (h.praticienne && pid !== h.praticienne) score += 6;
          }
          score += diffDays(o.today, d) * 0.3;
          out.push({ date: d, praticienne: pid, debut: c.debut, fin: c.fin, classe: c.classe, ordre: c.ordre,
            score: Math.round(score * 10) / 10, raisons: raisons });
        });
      });
    }
    out.sort(function (a, b) { return a.score - b.score || (a.date + a.debut).localeCompare(b.date + b.debut); });
    var perDay = {}, res = [];
    for (var i = 0; i < out.length && res.length < (o.limit || 8); i++) {
      var k = out[i].date + out[i].praticienne;
      if ((perDay[k] = (perDay[k] || 0) + 1) > 2) continue; // 2 propositions max par jour et praticienne
      res.push(out[i]);
    }
    return res;
  }

  /** Combien de clientes (pour ces soins) peuvent encore rentrer dans la journée : simulation gloutonne. */
  function capacityFor(cfg, day, pid, list, fromMin) {
    // Simulation : on place une cliente sur le MEILLEUR créneau (classe A d'abord, puis le plus tôt),
    // on recalcule, et ainsi de suite. Les heures obtenues sont compatibles entre elles :
    // un trou qui ne peut accueillir qu'une cliente ne donne qu'une seule heure.
    var d = JSON.parse(JSON.stringify(day)), picks = [], b = cfg.battement, rank = { A: 0, B: 1, C: 2 };
    for (var guard = 0; guard < 12; guard++) {
      var all = computeSlots(cfg, d, pid, list, 'all').filter(function (x) { return toMin(x.debut) >= fromMin && x.trou <= (cfg.trouMax || 30); });
      if (!all.length) break;
      var c = all.slice().sort(function (x, y) { return rank[x.classe] - rank[y.classe] || x.trou - y.trou || toMin(x.debut) - toMin(y.debut); })[0];
      picks.push({ debut: c.debut, fin: c.fin, classe: c.classe, ordre: c.ordre });
      var s = toMin(c.debut), e = toMin(c.fin);
      d.prat[pid].busy.push({ s: s, e: e + b, kind: 'rdv' });
      d.prat[pid].lunchBusy.push({ s: s, e: e + b });
      d.prat[pid].count++;
      c.segments.forEach(function (sg) { if (sg.lieu === 'cabine') d.cabine.push({ s: toMin(sg.debut), e: toMin(sg.fin) + b }); });
    }
    picks.sort(function (x, y) { return toMin(x.debut) - toMin(y.debut); });
    return { n: picks.length, heures: picks.map(function (x) { return x.debut; }), creneaux: picks };
  }

  /** Trous inutilisables (trop courts pour la plus petite prestation) entre deux rendez-vous. */
  function deadGaps(cfg, day, pid, fromMin) {
    var P = day.prat[pid], rules = day.rules, minUseful = minUsefulGap(cfg), out = [];
    var busy = P.busy.filter(function (x) { return x.kind === 'rdv' || x.kind === 'massage'; }).sort(function (a, b) { return a.s - b.s; });
    for (var i = 1; i < busy.length; i++) {
      var g = effectiveGap(cfg, busy[i - 1].e, busy[i].s);
      if (g > 0 && g < minUseful && busy[i - 1].e >= Math.max(fromMin, rules.debut)) out.push({ debut: toHHMM(busy[i - 1].e), minutes: g });
    }
    return out;
  }

  /* ------------------------------------------------------------------------
   * APPLICATION (actions API) — store + env injectés
   * ---------------------------------------------------------------------- */
  function createApp(store, env) {

    function config() { return mergeConfig(store.getConfig()); }

    function activeRdvsAround(date) {
      return store.listRdv({ du: date, au: date });
    }

    function publicPraticiennes(cfg) {
      return cfg.praticiennes.filter(function (p) { return p.active !== false; })
        .map(function (p) { return { id: p.id, nom: p.nom, telephone: p.telephone }; });
    }

    function checkDateWindow(cfg, date) {
      var today = env.today();
      if (!isDate(date)) throw err('date_invalide', 'Date invalide.');
      if (date <= today) throw err('date_trop_proche', "La réservation en ligne n'est pas possible pour aujourd'hui. Appelez-nous directement.");
      if (diffDays(today, date) > cfg.horizonJours) throw err('date_trop_loin', 'Cette date n\'est pas encore ouverte à la réservation.');
    }

    function servicesLabel(cfg, ids) {
      var m = serviceMap(cfg);
      return ids.map(function (id) { return m[id] ? m[id].nom : id; });
    }

    function publicRdvView(cfg, r) {
      var p = pratById(cfg, r.praticienne);
      return {
        code: r.code, date: r.date, debut: r.debut, fin: r.fin, statut: r.statut,
        praticienne: r.praticienne, praticienneNom: p ? p.nom : r.praticienne,
        telephone: p ? p.telephone : '',
        prestations: servicesLabel(cfg, r.services),
        prenom: r.prenom
      };
    }

    /* ---------------- Auth ---------------- */
    function pinHash(pin) {
      var salt = store.getSecret('salt');
      if (!salt) { salt = env.uuid(); store.setSecret('salt', salt); }
      return env.sha256(salt + ':' + String(pin));
    }
    function tokenSecret() {
      var s = store.getSecret('tokenSecret');
      if (!s) { s = env.uuid() + env.uuid(); store.setSecret('tokenSecret', s); }
      return s;
    }
    function makeToken() {
      var exp = env.nowMs() + 30 * 86400000; // 30 jours
      var sig = env.hmac(tokenSecret(), exp + '|' + (store.getSecret('pinHash') || ''));
      return exp + '.' + sig;
    }
    function requireAdmin(token) {
      if (!token || typeof token !== 'string') throw err('non_autorise', 'Session expirée, reconnectez-vous.');
      var parts = token.split('.');
      var exp = parseInt(parts[0], 10);
      if (!(exp > env.nowMs())) throw err('non_autorise', 'Session expirée, reconnectez-vous.');
      var sig = env.hmac(tokenSecret(), exp + '|' + (store.getSecret('pinHash') || ''));
      if (sig !== parts[1]) throw err('non_autorise', 'Session expirée, reconnectez-vous.');
    }

    /* ---------------- Validation RDV admin ---------------- */
    function readRdvInput(cfg, p, opts) {
      if (!pratById(cfg, p.praticienne)) throw err('praticienne_inconnue', 'Praticienne inconnue.');
      if (!isDate(p.date)) throw err('date_invalide', 'Date invalide.');
      if (!isTime(p.debut)) throw err('heure_invalide', 'Heure invalide.');
      var prenom = cleanName(p.prenom), nom = cleanName(p.nom);
      if (opts.requireName && (!prenom || !nom)) throw err('nom_requis', 'Prénom et nom obligatoires.');
      if ((prenom && !NAME_RE.test(prenom)) || (nom && !NAME_RE.test(nom))) throw err('nom_invalide', 'Prénom / nom : lettres uniquement.');
      return { prenom: prenom, nom: nom };
    }

    var REASON_TXT = {
      ferme: 'Le salon est fermé ce jour-là',
      hors_horaires: 'En dehors des horaires de prise de rendez-vous',
      praticienne_occupee: 'La praticienne a déjà un rendez-vous (pause entre clientes incluse)',
      indisponible: 'La praticienne est indisponible (congé / blocage)',
      massage: 'Un modelage est prévu sur ce créneau (institut bloqué)',
      cabine_occupee: 'La cabine pieds/massage est déjà occupée',
      pause_dejeuner: 'Plus de place pour la pause déjeuner',
      journee_complete: 'Nombre maximum de clientes atteint pour la journée'
    };
    function reasonsText(rs) { return rs.map(function (r) { return REASON_TXT[r] || r; }); }

    /* ---------------- Actions ---------------- */
    var actions = {

      /* ===== PUBLIC ===== */
      'public.config': function () {
        var cfg = config();
        var jours = {};
        for (var d = 0; d < 7; d++) jours[d] = !!(cfg.semaine[String(d)] && cfg.semaine[String(d)].ouvert);
        return {
          salon: cfg.salon,
          praticiennes: publicPraticiennes(cfg),
          prestations: cfg.services.filter(function (s) { return s.enLigne && s.categorie !== 'massage'; })
            .map(function (s) { return { id: s.id, nom: s.nom, categorie: s.categorie, duree: s.duree, info: s.info || '' }; }),
          textes: cfg.textes,
          horizonJours: cfg.horizonJours,
          joursOuverts: jours,
          aujourdhui: env.today(),
          version: VERSION
        };
      },

      'public.disponibilites': function (p) {
        var cfg = config();
        if (!pratById(cfg, p.praticienne) || pratById(cfg, p.praticienne).active === false) throw err('praticienne_inconnue', 'Praticienne inconnue.');
        var list = resolveServices(cfg, p.services, { public: true });
        var today = env.today();
        var first = addDays(today, 1);
        var last = addDays(today, cfg.horizonJours);
        var du = isDate(p.du) && p.du > first ? p.du : first;
        var au = isDate(p.au) && p.au < last ? p.au : last;
        if (diffDays(du, au) > 45) au = addDays(du, 45);
        var rdvs = du <= au ? store.listRdv({ du: du, au: au }) : [];
        var bls = store.listBlocages();
        var jours = {};
        for (var d = du; d <= au; d = addDays(d, 1)) {
          var day = buildDay(cfg, d, rdvs, bls);
          jours[d] = day.rules ? computeSlots(cfg, day, p.praticienne, list, 'public').map(function (c) {
            return { debut: c.debut, fin: c.fin };
          }) : [];
        }
        return { du: du, au: au, jours: jours };
      },

      'public.reserver': function (p) {
        if (p.website) throw err('refuse', 'Demande refusée.'); // pot de miel anti-robot
        var cfg = config();
        var prat = pratById(cfg, p.praticienne);
        if (!prat || prat.active === false) throw err('praticienne_inconnue', 'Praticienne inconnue.');
        var list = resolveServices(cfg, p.services, { public: true });
        checkDateWindow(cfg, p.date);
        if (!isTime(p.debut)) throw err('heure_invalide', 'Heure invalide.');
        var prenom = cleanName(p.prenom), nom = cleanName(p.nom);
        if (!prenom || !nom) throw err('nom_requis', 'Merci d\'indiquer votre prénom et votre nom.');
        if (!NAME_RE.test(prenom) || !NAME_RE.test(nom)) throw err('nom_invalide', 'Prénom et nom : lettres uniquement (pas de chiffres, pas d\'email).');
        var nouvelle = !!p.nouvelle;
        var ongles = nouvelle ? p.ongles : '';
        if (nouvelle && ONGLES.indexOf(ongles) < 0) throw err('ongles_requis', 'Indiquez ce que vous avez actuellement sur les ongles.');
        if (nouvelle && ongles === 'porcelaine') throw err('porcelaine', cfg.textes.porcelaine);
        if (!env.rateLimit('reserver', 30, 600)) throw err('trop_de_demandes', 'Trop de demandes en ce moment, réessayez dans quelques minutes.');

        return env.withLock(function () {
          var today = env.today();
          var key = normKey(prenom) + '|' + normKey(nom);
          var future = store.listRdv({ du: addDays(today, 1), au: addDays(today, 400) }).filter(function (r) {
            return ACTIVE[r.statut] && r.type !== 'massage' && (normKey(r.prenom) + '|' + normKey(r.nom)) === key;
          });
          if (future.some(function (r) { return r.date === p.date; })) throw err('doublon', 'Vous avez déjà un rendez-vous ce jour-là.');
          if (future.length >= cfg.maxRdvParCliente) throw err('trop_de_rdv', 'Vous avez déjà ' + future.length + ' rendez-vous à venir. Contactez votre praticienne pour en ajouter.');

          var rdvs = store.listRdv({ du: p.date, au: p.date });
          var day = buildDay(cfg, p.date, rdvs, store.listBlocages());
          var slots = computeSlots(cfg, day, p.praticienne, list, 'public');
          var chosen = slots.filter(function (s) { return s.debut === p.debut; })[0];
          if (!chosen) throw err('creneau_indisponible', 'Ce créneau vient d\'être pris. Choisissez un autre horaire.', {
            creneaux: slots.map(function (c) { return { debut: c.debut, fin: c.fin }; })
          });
          var statut = cfg.validation === 'toutes' || (cfg.validation === 'nouvelles' && nouvelle) ? 'en_attente' : 'confirme';
          var now = env.nowIso();
          var r = {
            id: env.uuid(), code: env.code(), type: 'client', date: p.date,
            debut: chosen.debut, fin: chosen.fin, praticienne: p.praticienne,
            services: chosen.ordre, segments: chosen.segments,
            prenom: prenom, nom: nom, nouvelle: nouvelle, ongles: ongles || '',
            statut: statut, source: 'en_ligne', note: '', creeLe: now, majLe: now
          };
          store.insertRdv(r);
          return publicRdvView(cfg, r);
        });
      },

      'public.suivi': function (p) {
        var code = String(p.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (code.length < 6) throw err('code_invalide', 'Code de réservation invalide.');
        if (!env.rateLimit('suivi', 60, 600)) throw err('trop_de_demandes', 'Trop de demandes, réessayez plus tard.');
        var cfg = config();
        var r = store.findRdvByCode(code);
        if (!r || r.type === 'massage') throw err('introuvable', 'Aucune réservation avec ce code.');
        return publicRdvView(cfg, r);
      },

      /* ===== ADMIN ===== */
      'admin.login': function (p) {
        if (!env.rateLimitPeek('login_fail', 10)) throw err('bloque', 'Trop de tentatives. Réessayez dans 15 minutes.');
        var stored = store.getSecret('pinHash');
        if (!stored) throw err('non_installe', 'Code PIN non défini : lancez installer() dans Apps Script.');
        if (pinHash(p.pin) !== stored) {
          env.rateLimit('login_fail', 10, 900);
          throw err('pin_incorrect', 'Code incorrect.');
        }
        return { token: makeToken() };
      },

      'admin.planning': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        if (!isDate(p.du) || !isDate(p.au) || p.au < p.du) throw err('date_invalide', 'Période invalide.');
        if (diffDays(p.du, p.au) > 62) throw err('periode_trop_longue', 'Période trop longue (max 2 mois).');
        var rdvs = store.listRdv({ du: p.du, au: p.au });
        var bls = store.listBlocages().filter(function (b) { return !(b.au < p.du || b.du > p.au); });
        var jours = {};
        for (var d = p.du; d <= p.au; d = addDays(d, 1)) {
          var r = dayRules(cfg, d);
          jours[d] = r ? { ouvert: true, debut: toHHMM(r.debut), fin: toHHMM(r.fin), dernierGel: toHHMM(r.dernierGel), dernierSemi: toHHMM(r.dernierSemi), exception: !!cfg.exceptions[d] } : { ouvert: false, exception: !!cfg.exceptions[d] };
        }
        var today = env.today();
        var attente = store.listRdv({ du: today, au: addDays(today, 400) }).filter(function (x) { return x.statut === 'en_attente'; }).length;
        return { config: cfg, rdvs: rdvs, blocages: bls, jours: jours, enAttente: attente, aujourdhui: today };
      },

      'admin.enAttente': function (p, token) {
        requireAdmin(token);
        var today = env.today();
        return store.listRdv({ du: today, au: addDays(today, 400) })
          .filter(function (x) { return x.statut === 'en_attente'; })
          .sort(function (a, b) { return (a.date + a.debut).localeCompare(b.date + b.debut); });
      },

      'admin.recherche': function (p, token) {
        requireAdmin(token);
        var q = normKey(p.q || '');
        if (q.length < 2) return [];
        var today = env.today();
        return store.listRdv({ du: addDays(today, -90), au: addDays(today, 400) })
          .filter(function (r) { return (normKey(r.prenom + ' ' + r.nom) + ' ' + String(r.code).toLowerCase()).indexOf(q) >= 0; })
          .sort(function (a, b) { return (b.date + b.debut).localeCompare(a.date + a.debut); })
          .slice(0, 50);
      },

      'admin.creneaux': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        var list = resolveServices(cfg, p.services);
        var rdvs = store.listRdv({ du: p.date, au: p.date });
        var day = buildDay(cfg, p.date, rdvs, store.listBlocages(), p.excludeId);
        return computeSlots(cfg, day, p.praticienne, list, 'all');
      },

      'admin.verifier': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        return checkPlacement(cfg, p, p.excludeId);
      },

      'admin.creerRdv': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () {
          var cfg = config();
          var names = readRdvInput(cfg, p, { requireName: true });
          var res = checkPlacement(cfg, p, null);
          if (!res.ok && !p.forcer) throw err('conflit', res.messages.join(' · '), res);
          var now = env.nowIso();
          var r = {
            id: env.uuid(), code: env.code(), type: 'client', date: p.date,
            debut: res.debut, fin: res.fin, praticienne: p.praticienne,
            services: res.ordre, segments: res.segments,
            prenom: names.prenom, nom: names.nom, nouvelle: !!p.nouvelle, ongles: p.ongles || '',
            statut: 'confirme', source: 'manuel', note: String(p.note || '').slice(0, 300), creeLe: now, majLe: now
          };
          store.insertRdv(r);
          return r;
        });
      },

      'admin.creerMassage': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () {
          var cfg = config();
          var names = readRdvInput(cfg, p, { requireName: false });
          var svc = serviceMap(cfg)[p.service];
          if (!svc || svc.categorie !== 'massage') throw err('prestation_inconnue', 'Choisissez un modelage.');
          var res = checkMassage(cfg, p, null, svc);
          if (!res.ok && !p.forcer) throw err('conflit', res.messages.join(' · '), res);
          var now = env.nowIso();
          var r = {
            id: env.uuid(), code: env.code(), type: 'massage', date: p.date,
            debut: p.debut, fin: toHHMM(toMin(p.debut) + svc.duree), praticienne: p.praticienne,
            services: [svc.id], segments: [{ service: svc.id, debut: p.debut, fin: toHHMM(toMin(p.debut) + svc.duree), lieu: 'cabine' }],
            prenom: names.prenom, nom: names.nom, nouvelle: false, ongles: '',
            statut: 'confirme', source: 'manuel', note: String(p.note || '').slice(0, 300), creeLe: now, majLe: now
          };
          store.insertRdv(r);
          return r;
        });
      },

      'admin.modifierRdv': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () {
          var cfg = config();
          var r = store.getRdv(p.id);
          if (!r) throw err('introuvable', 'Rendez-vous introuvable.');
          var merged = {
            praticienne: p.praticienne || r.praticienne,
            date: p.date || r.date,
            debut: p.debut || r.debut,
            services: p.services || r.services,
            service: (p.services && p.services[0]) || r.services[0],
            prenom: p.prenom != null ? p.prenom : r.prenom,
            nom: p.nom != null ? p.nom : r.nom
          };
          var names = readRdvInput(cfg, merged, { requireName: r.type !== 'massage' });
          var res;
          if (r.type === 'massage') {
            var svc = serviceMap(cfg)[merged.service];
            if (!svc || svc.categorie !== 'massage') throw err('prestation_inconnue', 'Choisissez un modelage.');
            res = checkMassage(cfg, merged, r.id, svc);
            res.segments = [{ service: svc.id, debut: merged.debut, fin: toHHMM(toMin(merged.debut) + svc.duree), lieu: 'cabine' }];
            res.ordre = [svc.id]; res.debut = merged.debut; res.fin = res.segments[0].fin;
          } else {
            res = checkPlacement(cfg, merged, r.id);
          }
          var reactivate = p.statut && ACTIVE[p.statut];
          if (!res.ok && !p.forcer && (ACTIVE[r.statut] || reactivate)) throw err('conflit', res.messages.join(' · '), res);
          r.praticienne = merged.praticienne; r.date = merged.date; r.debut = res.debut; r.fin = res.fin;
          r.services = res.ordre; r.segments = res.segments;
          r.prenom = names.prenom; r.nom = names.nom;
          if (p.note != null) r.note = String(p.note).slice(0, 300);
          if (p.statut && ['confirme', 'en_attente', 'annule', 'refuse', 'absente'].indexOf(p.statut) >= 0) r.statut = p.statut;
          r.majLe = env.nowIso();
          store.updateRdv(r);
          return r;
        });
      },

      'admin.statut': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () {
          var r = store.getRdv(p.id);
          if (!r) throw err('introuvable', 'Rendez-vous introuvable.');
          if (['confirme', 'en_attente', 'annule', 'refuse', 'absente'].indexOf(p.statut) < 0) throw err('statut_invalide', 'Statut invalide.');
          if (ACTIVE[p.statut] && !ACTIVE[r.statut] && !p.forcer) {
            // Réactivation : vérifier que la place est toujours libre
            var cfg = config();
            var res = r.type === 'massage'
              ? checkMassage(cfg, { praticienne: r.praticienne, date: r.date, debut: r.debut }, r.id, serviceMap(cfg)[r.services[0]])
              : checkPlacement(cfg, { praticienne: r.praticienne, date: r.date, debut: r.debut, services: r.services, ordreFixe: true }, r.id);
            if (!res.ok) throw err('conflit', res.messages.join(' · '), res);
          }
          r.statut = p.statut;
          r.majLe = env.nowIso();
          store.updateRdv(r);
          return r;
        });
      },

      'admin.supprimerRdv': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () {
          if (!store.getRdv(p.id)) throw err('introuvable', 'Rendez-vous introuvable.');
          store.deleteRdv(p.id);
          return { id: p.id };
        });
      },

      'admin.blocages': function (p, token) {
        requireAdmin(token);
        var today = env.today();
        return store.listBlocages().filter(function (b) { return b.au >= today; })
          .sort(function (a, b) { return a.du.localeCompare(b.du); });
      },

      'admin.creerBlocage': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        if (p.praticienne !== 'tous' && !pratById(cfg, p.praticienne)) throw err('praticienne_inconnue', 'Praticienne inconnue.');
        if (!isDate(p.du) || !isDate(p.au) || p.au < p.du) throw err('date_invalide', 'Dates invalides.');
        if (p.heureDebut && !isTime(p.heureDebut)) throw err('heure_invalide', 'Heure de début invalide.');
        if (p.heureFin && !isTime(p.heureFin)) throw err('heure_invalide', 'Heure de fin invalide.');
        if (p.heureDebut && p.heureFin && toMin(p.heureFin) <= toMin(p.heureDebut)) throw err('heure_invalide', 'La fin doit être après le début.');
        return env.withLock(function () {
          var bl = {
            id: env.uuid(), praticienne: p.praticienne, du: p.du, au: p.au,
            heureDebut: p.heureDebut || '', heureFin: p.heureFin || '',
            motif: String(p.motif || '').slice(0, 120), creeLe: env.nowIso()
          };
          // RDV déjà pris qui tombent dans le blocage : on les signale (ils ne sont pas supprimés)
          var touches = store.listRdv({ du: bl.du, au: bl.au }).filter(function (r) {
            if (!ACTIVE[r.statut]) return false;
            if (bl.praticienne !== 'tous' && r.praticienne !== bl.praticienne && r.type !== 'massage') return false;
            var iv = blockInterval(bl, r.date);
            return iv && overlaps(iv, { s: toMin(r.debut), e: toMin(r.fin) });
          });
          store.insertBlocage(bl);
          return { blocage: bl, rdvConcernes: touches };
        });
      },

      'admin.supprimerBlocage': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () { store.deleteBlocage(p.id); return { id: p.id }; });
      },

      /* ===== TROUS À COMBLER & OFFRES "LIEN ÉCLAIR" ===== */

      // Fenêtres libres à venir, par jour et par praticienne (aujourd'hui compris, à partir de maintenant)
      'admin.trous': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        var today = env.today();
        var du = isDate(p.du) && p.du > today ? p.du : today;
        var au = isDate(p.au) ? p.au : addDays(du, 6);
        if (diffDays(du, au) > 31) au = addDays(du, 31);
        var prats = p.praticienne && p.praticienne !== 'tous' ? [p.praticienne] : pratIds(cfg);
        var rdvs = store.listRdv({ du: du, au: au });
        var bls = store.listBlocages();
        var jours = [];
        for (var d = du; d <= au; d = addDays(d, 1)) {
          var day = buildDay(cfg, d, rdvs, bls);
          if (!day.rules) continue;
          var entry = { date: d, praticiennes: {} };
          prats.forEach(function (pid) {
            if (!day.prat[pid]) return;
            entry.praticiennes[pid] = {
              clientes: day.prat[pid].count,
              max: cfg.maxClientesJour,
              fenetres: freeWindows(cfg, day, pid, d === today ? nowMin() + 30 : 0)
            };
          });
          jours.push(entry);
        }
        return { du: du, au: au, aujourdhui: today, jours: jours };
      },

      // Crée (ou met à jour si id fourni) une offre : liste de créneaux publiés en story
      'admin.creerOffre': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        if (!Array.isArray(p.creneaux) || !p.creneaux.length) throw err('offre_vide', 'Sélectionnez au moins un créneau.');
        if (p.creneaux.length > 200) throw err('offre_trop_grande', 'Maximum 200 créneaux par story.');
        var creneaux = p.creneaux.map(function (c, i) {
          if (!pratById(cfg, c.praticienne) || !isDate(c.date) || !isTime(c.debut) || !isTime(c.fin)) throw err('offre_invalide', 'Créneau invalide.');
          return { id: c.id || ('c' + i + env.code().toLowerCase()), praticienne: c.praticienne, date: c.date, debut: c.debut, fin: c.fin };
        });
        var heures = Math.min(Math.max(parseInt(p.heures, 10) || 24, 1), 168);
        return env.withLock(function () {
          var list = loadOffres();
          var o = p.id ? list.filter(function (x) { return x.id === p.id; })[0] : null;
          if (!o) {
            o = { id: env.uuid(), token: (env.code() + env.code()).toLowerCase(), creeLe: env.nowIso() };
            list.push(o);
          }
          o.creneaux = creneaux;
          o.titre = String(p.titre || '').slice(0, 60);
          o.expire = env.nowMs() + heures * 3600000;
          o.majLe = env.nowIso();
          saveOffres(list);
          return o;
        });
      },

      'admin.offres': function (p, token) {
        requireAdmin(token);
        return loadOffres();
      },

      'admin.fermerOffre': function (p, token) {
        requireAdmin(token);
        return env.withLock(function () {
          saveOffres(loadOffres().filter(function (x) { return x.id !== p.id; }));
          return { id: p.id };
        });
      },

      // Page cliente : contenu d'un lien éclair, avec l'état en direct de chaque créneau
      'public.offre': function (p) {
        if (!env.rateLimit('offre', 120, 600)) throw err('trop_de_demandes', 'Trop de demandes, réessayez plus tard.');
        var cfg = config();
        var o = findOffre(p.token);
        var today = env.today();
        var dates = o.creneaux.map(function (c) { return c.date; }).sort();
        var rdvs = dates.length ? store.listRdv({ du: dates[0], au: dates[dates.length - 1] }) : [];
        var bls = store.listBlocages();
        var enLigne = {};
        cfg.services.forEach(function (s) { if (s.enLigne && s.categorie !== 'massage') enLigne[s.id] = true; });
        var creneaux = o.creneaux.filter(function (c) { return c.date >= today; }).map(function (c) {
          var fits = offerFits(cfg, c, rdvs, bls, today).filter(function (f) { return enLigne[f.service]; });
          return { id: c.id, praticienne: c.praticienne, date: c.date, debut: c.debut, fin: c.fin, libre: fits.length > 0, prestations: fits };
        });
        return {
          titre: o.titre, expire: o.expire, creneaux: creneaux,
          praticiennes: publicPraticiennes(cfg).map(function (pr) {
            var col = cfg.couleurs && cfg.couleurs.praticiennes && cfg.couleurs.praticiennes[pr.id];
            if (typeof col === 'string' && /^#[0-9a-fA-F]{6}$/.test(col)) pr.couleur = col;
            return pr;
          }),
          prestations: cfg.services.filter(function (s) { return enLigne[s.id]; })
            .map(function (s) { return { id: s.id, nom: s.nom, categorie: s.categorie, duree: s.duree }; }),
          textes: cfg.textes, aujourdhui: today
        };
      },

      // Réservation d'un créneau de lien éclair (jour même autorisé)
      'public.reserverOffre': function (p) {
        if (p.website) throw err('refuse', 'Demande refusée.');
        var cfg = config();
        var o = findOffre(p.token);
        var c = o.creneaux.filter(function (x) { return x.id === p.creneau; })[0];
        if (!c) throw err('creneau_inconnu', 'Ce créneau ne fait pas partie de l\'offre.');
        var list = resolveServices(cfg, p.services, { public: true });
        var prenom = cleanName(p.prenom), nom = cleanName(p.nom);
        if (!prenom || !nom) throw err('nom_requis', 'Merci d\'indiquer votre prénom et votre nom.');
        if (!NAME_RE.test(prenom) || !NAME_RE.test(nom)) throw err('nom_invalide', 'Prénom et nom : lettres uniquement (pas de chiffres, pas d\'email).');
        if (!env.rateLimit('reserver', 30, 600)) throw err('trop_de_demandes', 'Trop de demandes en ce moment, réessayez dans quelques minutes.');
        return env.withLock(function () {
          var today = env.today();
          if (c.date < today) throw err('creneau_passe', 'Ce créneau est passé.');
          var key = normKey(prenom) + '|' + normKey(nom);
          var dejaCeJour = store.listRdv({ du: c.date, au: c.date }).some(function (r) {
            return ACTIVE[r.statut] && r.type !== 'massage' && (normKey(r.prenom) + '|' + normKey(r.nom)) === key;
          });
          if (dejaCeJour) throw err('doublon', 'Vous avez déjà un rendez-vous ce jour-là.');
          var rdvs = store.listRdv({ du: c.date, au: c.date });
          var day = buildDay(cfg, c.date, rdvs, store.listBlocages());
          var from = c.date === today ? nowMin() + 30 : 0;
          var cand = computeSlots(cfg, day, c.praticienne, list, 'all').filter(function (s) {
            var m = toMin(s.debut);
            return m >= toMin(c.debut) && m < toMin(c.fin) && m >= from;
          })[0];
          if (!cand) throw err('creneau_pris', 'Ce créneau vient d\'être pris ou ne convient pas à ces soins. Choisissez-en un autre.');
          var statut = cfg.validation === 'toutes' ? 'en_attente' : 'confirme';
          var now = env.nowIso();
          var r = {
            id: env.uuid(), code: env.code(), type: 'client', date: c.date,
            debut: cand.debut, fin: cand.fin, praticienne: c.praticienne,
            services: cand.ordre, segments: cand.segments,
            prenom: prenom, nom: nom, nouvelle: false, ongles: '',
            statut: statut, source: 'story', note: 'Réservé via le lien story', creeLe: now, majLe: now
          };
          store.insertRdv(r);
          return publicRdvView(cfg, r);
        });
      },

      /* ===== v1.2 : HISTORIQUE, CLIENTES, RECOMMANDATIONS, MAGIE, PHOTOS ===== */

      // Tous les rendez-vous d'une période (statistiques), sans le détail des segments
      'admin.historique': function (p, token) {
        requireAdmin(token);
        var today = env.today();
        var du = isDate(p.du) ? p.du : addDays(today, -365);
        var au = isDate(p.au) ? p.au : addDays(today, 90);
        if (au < du) throw err('date_invalide', 'Période invalide.');
        if (diffDays(du, au) > 800) throw err('periode_trop_longue', 'Période trop longue (max 2 ans).');
        return {
          du: du, au: au, aujourdhui: today,
          rdvs: store.listRdv({ du: du, au: au }).map(function (r) {
            return { id: r.id, code: r.code, type: r.type, date: r.date, debut: r.debut, fin: r.fin, praticienne: r.praticienne,
              services: r.services, prenom: r.prenom, nom: r.nom, statut: r.statut, source: r.source, note: r.note, creeLe: r.creeLe };
          })
        };
      },

      // Base clientes (profils et habitudes), sans la liste des rendez-vous
      'admin.clientes': function (p, token) {
        requireAdmin(token);
        var cfg = config(), today = env.today();
        return clientProfiles(cfg, store.listRdv({ du: addDays(today, -730), au: addDays(today, 400) }), today)
          .sort(function (a, b) { return (b.derniere || b.premiere || '').localeCompare(a.derniere || a.premiere || ''); });
      },

      // Fiche d'une cliente : profil + tous ses rendez-vous
      'admin.client': function (p, token) {
        requireAdmin(token);
        var cfg = config(), today = env.today();
        var all = store.listRdv({ du: addDays(today, -730), au: addDays(today, 400) });
        var mine = all.filter(function (r) { return clientKey(r.prenom, r.nom) === p.cle; });
        if (!mine.length) throw err('introuvable', 'Cliente introuvable.');
        var prof = buildProfile(cfg, { cle: p.cle, prenom: cleanName(mine[0].prenom), nom: cleanName(mine[0].nom), rdvs: mine }, today);
        prof.rdvs = mine.sort(function (a, b) { return (b.date + b.debut).localeCompare(a.date + a.debut); });
        return prof;
      },

      // Renommer une cliente sur tous ses rendez-vous (et fusionner deux fiches si le nouveau nom existe déjà)
      'admin.renommerCliente': function (p, token) {
        requireAdmin(token);
        var prenom = cleanName(p.prenom), nom = cleanName(p.nom) || '-';
        if (!prenom) throw err('nom_requis', 'Le prénom est obligatoire.');
        if (!NAME_RE.test(prenom) || !NAME_RE.test(nom)) throw err('nom_invalide', 'Prénom / nom : lettres uniquement.');
        var nouvelle = clientKey(prenom, nom);
        return env.withLock(function () {
          var today = env.today();
          var all = store.listRdv({ du: '0000-00-00', au: '9999-99-99' });
          var mine = all.filter(function (r) { return clientKey(r.prenom, r.nom) === p.cle; });
          if (!mine.length) throw err('introuvable', 'Cliente introuvable.');
          if (nouvelle !== p.cle && !p.fusionner) {
            var autres = all.filter(function (r) { return clientKey(r.prenom, r.nom) === nouvelle; });
            if (autres.length) throw err('cliente_existante', 'Une cliente « ' + prenom + ' ' + nom + ' » existe déjà (' + autres.length +
              ' rendez-vous). Confirmez pour fusionner les deux fiches.', { rdvs: autres.length });
          }
          var now = env.nowIso();
          mine.forEach(function (r) { r.prenom = prenom; r.nom = nom; r.majLe = now; store.updateRdv(r); });
          return { cle: nouvelle, prenom: prenom, nom: nom, modifies: mine.length, aujourdhui: today };
        });
      },

      // Créneaux recommandés : pour une cliente (habitudes) ou pour des soins donnés
      'admin.recommander': function (p, token) {
        requireAdmin(token);
        var cfg = config(), today = env.today();
        var prof = null;
        if (p.cle) {
          var mine = store.listRdv({ du: addDays(today, -730), au: addDays(today, 400) })
            .filter(function (r) { return clientKey(r.prenom, r.nom) === p.cle; });
          if (mine.length) prof = buildProfile(cfg, { cle: p.cle, prenom: cleanName(mine[0].prenom), nom: cleanName(mine[0].nom), rdvs: mine }, today);
        }
        var services = (Array.isArray(p.services) && p.services.length) ? p.services
          : (prof && prof.habitude.services.length ? prof.habitude.services : (cfg.magie && cfg.magie.services) || ['remplissage']);
        var prats = p.praticienne && p.praticienne !== 'tous' ? [p.praticienne]
          : (prof && prof.habitude.praticienne && !p.praticienne ? [prof.habitude.praticienne] : pratIds(cfg));
        var du = isDate(p.du) && p.du >= today ? p.du : today;
        var au = isDate(p.au) ? p.au : addDays(du, 21);
        if (diffDays(du, au) > 62) au = addDays(du, 62);
        var res = recommendSlots(cfg, store.listRdv({ du: du, au: au }), store.listBlocages(), {
          services: services, praticiennes: prats, du: du, au: au, today: today, fromMin: nowMin() + 15,
          profil: prof, limit: Math.min(parseInt(p.limit, 10) || 8, 30), excludeId: p.excludeId
        });
        return { profil: prof, services: services, praticiennes: prats, creneaux: res };
      },

      // « Remplir l'agenda » : analyse de remplissage, créneaux à proposer, alertes et clientes à relancer
      'admin.remplir': function (p, token) {
        requireAdmin(token);
        var cfg = config(), today = env.today();
        var mg = cfg.magie || {};
        var services = (Array.isArray(p.services) && p.services.length) ? p.services : (mg.services && mg.services.length ? mg.services : ['remplissage']);
        var list = resolveServices(cfg, services);
        var prats = p.praticienne && p.praticienne !== 'tous' ? [p.praticienne] : pratIds(cfg);
        var du = isDate(p.du) && p.du >= today ? p.du : today;
        var au = isDate(p.au) ? p.au : addDays(du, (mg.horizonJours || 7) - 1);
        if (diffDays(du, au) > 31) au = addDays(du, 31);
        // Jours choisis un par un (non contigus) : 31 jours au plus, passés ignorés
        var choix = null;
        if (Array.isArray(p.jours)) {
          choix = p.jours.filter(function (x, i, a) { return isDate(x) && x >= today && a.indexOf(x) === i; }).sort().slice(0, 31);
          if (!choix.length) throw err('date_invalide', 'Choisissez au moins un jour à venir.');
          du = choix[0]; au = choix[choix.length - 1];
        }
        var seuil = typeof mg.seuilRemplissage === 'number' ? mg.seuilRemplissage : 50;
        var rdvs = store.listRdv({ du: du, au: au }), bls = store.listBlocages();
        var nm = nowMin();
        var smap = serviceMap(cfg);
        var label = list.map(function (s) { return s.nom; }).join(' + ');
        var jours = [], resume = {};
        prats.forEach(function (pid) { resume[pid] = { places: 0, capacite: 0, clientes: 0, max: 0 }; });
        var dates = choix || [];
        if (!choix) for (var d0 = du; d0 <= au; d0 = addDays(d0, 1)) dates.push(d0);
        dates.forEach(function (d) {
          var day = buildDay(cfg, d, rdvs, bls);
          if (!day.rules) return;
          var from = d === today ? nm + 30 : 0;
          var demain = d === addDays(today, 1);
          var entry = { date: d, praticiennes: {} };
          prats.forEach(function (pid) {
            var P = day.prat[pid];
            if (!P) return;
            var blocked = P.busy.some(function (x) { return (x.kind === 'blocage' || x.kind === 'inactive') && x.s <= day.rules.debut && x.e >= day.rules.fin; });
            var max = cfg.maxClientesJour, places = blocked ? 0 : Math.max(0, max - P.count);
            var cap = places ? capacityFor(cfg, day, pid, list, from) : { n: 0, heures: [], creneaux: [] };
            // Soin choisi impossible mais place restante : proposer un soin plus court qui rentre encore
            var alternatives = [];
            if (places && !cap.n) {
              cfg.services.filter(function (x) { return x.categorie !== 'massage' && list.indexOf(x) < 0; })
                .sort(function (x, y) { return y.duree - x.duree; })
                .forEach(function (x) {
                  if (alternatives.length >= 2) return;
                  var c1 = capacityFor(cfg, day, pid, [x], from);
                  if (c1.n) alternatives.push({ service: x.id, nom: x.nom, debut: c1.creneaux[0].debut, fin: c1.creneaux[0].fin });
                });
            }
            var alertes = [];
            if (blocked) alertes.push({ niveau: 'info', texte: 'Indisponible ce jour-là' });
            else if (P.count >= max) alertes.push({ niveau: 'ok', texte: 'Complet (' + P.count + '/' + max + ')' });
            else if (cap.n > 0) {
              // Uniquement des alertes sur lesquelles on peut agir : il reste de la place pour une cliente
              var taux = Math.round(P.count / max * 100);
              var nb = cap.n + ' place' + (cap.n > 1 ? 's' : '');
              if (d === today || demain) alertes.push({ niveau: 'critique', texte: (d === today ? "Aujourd'hui" : 'Demain') + ' : ' + nb + ' à remplir' });
              else if (P.count === 0) alertes.push({ niveau: 'critique', texte: 'Journée vide : ' + nb });
              else if (taux < seuil) alertes.push({ niveau: 'attention', texte: 'Remplie à ' + taux + ' % : ' + nb });
            }
            // Toutes les heures de début valides (grille du moteur), qui peuvent se chevaucher :
            // à proposer aux clientes (la réservation revérifie). ideal = heure retenue par la simulation.
            var idealH = {}; cap.creneaux.forEach(function (c) { idealH[c.debut] = true; });
            var toutes = places ? computeSlots(cfg, day, pid, list, 'all').filter(function (c) { return toMin(c.debut) >= from; }).map(function (c) {
              return { debut: c.debut, fin: c.fin, classe: c.classe, trou: c.trou, ordre: c.ordre, ideal: !!idealH[c.debut] };
            }) : [];
            entry.praticiennes[pid] = {
              clientes: P.count, max: max, placesRestantes: places, capacite: cap.n, heuresPossibles: cap.heures,
              creneaux: cap.creneaux, toutes: toutes, alternatives: alternatives,
              fenetres: places ? freeWindows(cfg, day, pid, from) : [], alertes: alertes,
              trousPerdus: places ? deadGaps(cfg, day, pid, from) : []
            };
            resume[pid].places += places; resume[pid].capacite += cap.n; resume[pid].clientes += P.count; resume[pid].max += max;
          });
          jours.push(entry);
        });
        // Clientes à relancer : soin prévu bientôt (ou en retard), aucun RDV à venir
        var all = store.listRdv({ du: addDays(today, -730), au: addDays(today, 400) });
        var relances = clientProfiles(cfg, all, today).filter(function (c) {
          var h = c.habitude;
          // Soin dû bientôt, ou en retard de moins de 30 j (au-delà : cliente probablement perdue → « Nos clientes »)
          return !c.prochain && c.derniere && h.prochaineVisitePrevue && h.prochaineVisitePrevue <= addDays(au, 3)
            && diffDays(h.prochaineVisitePrevue, today) <= (mg.retardMaxRelance || 30)
            && c.realises >= 2 && prats.indexOf(h.praticienne) >= 0 && h.services.length;
        }).sort(function (a, b) {
          return Math.abs(diffDays(today, a.habitude.prochaineVisitePrevue)) - Math.abs(diffDays(today, b.habitude.prochaineVisitePrevue));
        }).slice(0, 15).map(function (c) {
            var h = c.habitude, sug = null;
            var svcs = h.services.filter(function (id) { return smap[id] && smap[id].categorie !== 'massage'; });
            if (svcs.length) {
              try {
                var rdu = h.prochaineVisitePrevue > du ? (addDays(h.prochaineVisitePrevue, -3) > du ? addDays(h.prochaineVisitePrevue, -3) : du) : du;
                sug = recommendSlots(cfg, store.listRdv({ du: rdu, au: addDays(au, 7) }), bls, {
                  services: svcs, praticiennes: [h.praticienne], du: rdu, au: addDays(au, 7), today: today, fromMin: nm + 30, profil: c, limit: 1
                })[0] || null;
              } catch (e) { sug = null; }
            }
            return { cle: c.cle, prenom: c.prenom, nom: c.nom, praticienne: h.praticienne, derniere: c.derniere,
              prevue: h.prochaineVisitePrevue, retardJours: diffDays(h.prochaineVisitePrevue, today), services: svcs,
              frequenceJours: h.frequenceJours, suggestion: sug };
          });
        return { du: du, au: au, aujourdhui: today, services: services, jours: jours, resume: resume, relances: relances };
      },

      // Photo de profil d'une praticienne (data URL JPEG/PNG/WebP, compressée côté appareil)
      'admin.setPhoto': function (p, token) {
        requireAdmin(token);
        var cfg = config();
        if (!pratById(cfg, p.praticienne)) throw err('praticienne_inconnue', 'Praticienne inconnue.');
        if (!store.setMedia) throw err('maj_requise', 'Mettez à jour Code.gs pour enregistrer les photos.');
        var img = String(p.image || '');
        if (img && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(img)) throw err('image_invalide', 'Format d\'image non pris en charge.');
        if (img.length > 140000) throw err('image_trop_lourde', 'Image trop lourde : choisissez une photo plus petite.');
        store.setMedia('photo_' + p.praticienne, img);
        return { praticienne: p.praticienne, ok: true };
      },

      'public.photos': function () {
        var cfg = config(), out = {};
        cfg.praticiennes.forEach(function (pr) { out[pr.id] = store.getMedia ? (store.getMedia('photo_' + pr.id) || null) : null; });
        return out;
      },

      'admin.config': function (p, token) {
        requireAdmin(token);
        return config();
      },

      'admin.sauverConfig': function (p, token) {
        requireAdmin(token);
        var cfg = mergeConfig(p.config);
        var errors = validateConfig(cfg);
        if (errors.length) throw err('config_invalide', errors.join(' · '), { erreurs: errors });
        store.saveConfig(cfg);
        return cfg;
      },

      'admin.reinitialiserConfig': function (p, token) {
        requireAdmin(token);
        store.saveConfig(clone(DEFAULT_CONFIG));
        return config();
      },

      'admin.changerPin': function (p, token) {
        requireAdmin(token);
        if (pinHash(p.ancien) !== store.getSecret('pinHash')) throw err('pin_incorrect', 'Ancien code incorrect.');
        if (!/^\d{4,8}$/.test(String(p.nouveau || ''))) throw err('pin_invalide', 'Le code doit faire 4 à 8 chiffres.');
        store.setSecret('pinHash', pinHash(p.nouveau));
        return { token: makeToken() };
      }
    };

    /* ---------------- Offres (lien éclair) ---------------- */
    // Heure actuelle à Paris, en minutes (env.nowIso renvoie l'heure locale de Paris)
    function nowMin() {
      var m = /T(\d{2}):(\d{2})/.exec(env.nowIso() || '');
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : 0;
    }
    function loadOffres() {
      var raw = store.getSecret('offres');
      var list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch (e) { list = []; }
      var now = env.nowMs();
      return list.filter(function (o) { return o && o.expire > now; });
    }
    function saveOffres(list) { store.setSecret('offres', JSON.stringify(list.slice(-6))); } // 6 offres actives max
    function findOffre(tok) {
      var t = String(tok || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      var o = t.length >= 8 ? loadOffres().filter(function (x) { return x.token === t; })[0] : null;
      if (!o) throw err('offre_expiree', 'Cette offre est terminée. Contactez-nous pour connaître les prochaines disponibilités.');
      return o;
    }
    function offerFits(cfg, c, rdvs, bls, today) {
      var day = buildDay(cfg, c.date, rdvs, bls);
      if (!day.rules) return [];
      var from = c.date === today ? nowMin() + 30 : 0;
      var a = toMin(c.debut), b = toMin(c.fin), out = [];
      cfg.services.forEach(function (s) {
        if (s.categorie === 'massage') return;
        var first = computeSlots(cfg, day, c.praticienne, [s], 'all').filter(function (x) {
          var m = toMin(x.debut); return m >= a && m < b && m >= from;
        })[0];
        if (first) out.push({ service: s.id, debut: first.debut, fin: first.fin });
      });
      return out;
    }

    function checkPlacement(cfg, p, excludeId) {
      var list = resolveServices(cfg, p.services);
      if (!isDate(p.date)) throw err('date_invalide', 'Date invalide.');
      if (!isTime(p.debut)) throw err('heure_invalide', 'Heure invalide.');
      var rdvs = store.listRdv({ du: p.date, au: p.date });
      var day = buildDay(cfg, p.date, rdvs, store.listBlocages(), excludeId);
      var ords = p.ordreFixe ? [list.slice().sort(function (a, b) { return p.services.indexOf(a.id) - p.services.indexOf(b.id); })] : orders(list);
      var bestPl = null, bestOrd = null;
      ords.forEach(function (ord) {
        var pl = place(cfg, day, p.praticienne, ord, toMin(p.debut));
        if (!bestPl || (pl.ok && !bestPl.ok) || (pl.ok === bestPl.ok && pl.reasons.length < bestPl.reasons.length)) { bestPl = pl; bestOrd = ord; }
      });
      return {
        ok: bestPl.ok, raisons: bestPl.reasons, messages: reasonsText(bestPl.reasons),
        debut: toHHMM(bestPl.debut), fin: toHHMM(bestPl.fin), segments: bestPl.segments,
        ordre: bestOrd.map(function (s) { return s.id; })
      };
    }

    function checkMassage(cfg, p, excludeId, svc) {
      if (!isDate(p.date)) throw err('date_invalide', 'Date invalide.');
      if (!isTime(p.debut)) throw err('heure_invalide', 'Heure invalide.');
      var s = toMin(p.debut), e = s + svc.duree, b = cfg.battement;
      var day = buildDay(cfg, p.date, store.listRdv({ du: p.date, au: p.date }), store.listBlocages(), excludeId);
      var reasons = [];
      if (!day.rules) reasons.push('ferme');
      var iv = { s: s, e: e + b };
      // Le massage bloque l'institut : aucune des deux ne doit avoir de cliente
      Object.keys(day.prat).forEach(function (pid) {
        day.prat[pid].busy.forEach(function (x) {
          if (!overlaps(iv, x)) return;
          if (x.kind === 'blocage' || x.kind === 'inactive') { if (pid === p.praticienne && reasons.indexOf('indisponible') < 0) reasons.push('indisponible'); }
          else if (reasons.indexOf('praticienne_occupee') < 0) reasons.push('praticienne_occupee');
        });
      });
      if (day.cabine.some(function (x) { return overlaps(iv, x); }) && reasons.indexOf('cabine_occupee') < 0) reasons.push('cabine_occupee');
      var msgs = reasonsText(reasons).map(function (m) { return m.replace('La praticienne a déjà', 'Une cliente est déjà prévue sur ce créneau : le modelage bloque tout l\'institut —'); });
      return { ok: reasons.length === 0, raisons: reasons, messages: msgs, debut: p.debut, fin: toHHMM(e) };
    }

    function handle(action, payload, token) {
      var fn = actions[action];
      if (!fn) return { ok: false, error: { code: 'action_inconnue', message: 'Action inconnue : ' + action } };
      try {
        return { ok: true, data: fn(payload || {}, token) };
      } catch (e) {
        if (e && e.code) return { ok: false, error: { code: e.code, message: e.message, details: e.extra } };
        if (env.log) env.log(e);
        return { ok: false, error: { code: 'erreur_serveur', message: 'Erreur inattendue. Réessayez.' } };
      }
    }

    /** Purge : supprime les RDV passés depuis plus de `retentionMois` et les blocages terminés. */
    function purge() {
      var cfg = config();
      var limit = addDays(env.today(), -Math.round(cfg.retentionMois * 30.5));
      var n = store.purgeRdvBefore(limit);
      var m = store.purgeBlocagesBefore(addDays(env.today(), -1));
      return { rdvSupprimes: n, blocagesSupprimes: m };
    }

    function setPin(pin) {
      if (!/^\d{4,8}$/.test(String(pin))) throw new Error('Le code PIN doit faire 4 à 8 chiffres.');
      store.setSecret('pinHash', pinHash(pin));
    }

    return { handle: handle, purge: purge, setPin: setPin, actions: actions };
  }

  return {
    VERSION: VERSION,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    createApp: createApp,
    // exposés pour les tests et l'interface
    _: {
      toMin: toMin, toHHMM: toHHMM, addDays: addDays, weekday: weekday, dayRules: dayRules,
      buildDay: buildDay, computeSlots: computeSlots, place: place, resolveServices: resolveServices,
      mergeConfig: mergeConfig, validateConfig: validateConfig, lunchOk: lunchOk, diffDays: diffDays,
      freeWindows: freeWindows, clientKey: clientKey, clientProfiles: clientProfiles, buildProfile: buildProfile,
      recommendSlots: recommendSlots, capacityFor: capacityFor, JOURS: JOURS
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SorelleCore;

/**
 * Client API Sorelle — utilisé par /rdv/ et /gestion/.
 *   SorelleAPI.call(action, payload)   → Promise<data>  (actions public.*)
 *   SorelleAPI.admin(action, payload)  → Promise<data>  (actions admin.*, token auto)
 *   SorelleAPI.login(pin) / logout() / isLoggedIn()
 *   SorelleAPI.isDemo / resetDemo()
 * Les erreurs sont des Error avec .code, .message (texte prêt à afficher), .details
 */
window.SorelleAPI = (function () {
  'use strict';
  var CFG = window.SORELLE_CONFIG || {};
  var API_URL = (CFG.API_URL || '').trim();
  var isDemo = !API_URL;
  var TOKEN_KEY = 'sorelle_admin_token';

  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  // Date du jour à Paris au format YYYY-MM-DD, construite pièce par pièce :
  // certains navigateurs (Safari notamment) ne formatent pas 'en-CA' en AAAA-MM-JJ.
  function parisToday() {
    var d = new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      var g = function (t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value; return ''; };
      var s = g('year') + '-' + g('month') + '-' + g('day');
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    } catch (e) { /* repli ci-dessous */ }
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  /* ---------------- MODE DÉMO : même moteur, stockage navigateur ---------------- */
  var demoApp = null;
  var DEMO_KEY = 'sorelle_demo_v2';
  var memDb = null;

  function loadDb() {
    if (memDb) return memDb;
    var raw = safeGet(DEMO_KEY);
    try { memDb = raw ? JSON.parse(raw) : null; } catch (e) { memDb = null; }
    if (!memDb) memDb = { config: null, rdv: [], bl: [], secrets: {}, media: {}, seeded: false };
    if (!memDb.media) memDb.media = {};
    return memDb;
  }
  function saveDb() { safeSet(DEMO_KEY, JSON.stringify(memDb)); }
  function c(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  // Un autre onglet (ex. la page cliente ouverte depuis le lien éclair) a modifié la démo :
  // on relira le stockage au prochain accès, sinon ses réservations seraient invisibles puis écrasées.
  try { window.addEventListener('storage', function (e) { if (!e || e.key === DEMO_KEY || e.key === null) memDb = null; }); } catch (e) { /* ignore */ }

  function demoStore() {
    var D = loadDb; // toujours la version courante (rechargée si un autre onglet a écrit)
    return {
      getConfig: function () { return c(D().config); },
      saveConfig: function (cfg) { D().config = c(cfg); saveDb(); },
      listRdv: function (q) { return D().rdv.filter(function (r) { return r.date >= q.du && r.date <= q.au; }).map(c); },
      getRdv: function (id) { return c(D().rdv.filter(function (r) { return r.id === id; })[0] || null); },
      findRdvByCode: function (code) { return c(D().rdv.filter(function (r) { return r.code === code; })[0] || null); },
      insertRdv: function (r) { D().rdv.push(c(r)); saveDb(); },
      updateRdv: function (r) { var db = D(); for (var i = 0; i < db.rdv.length; i++) if (db.rdv[i].id === r.id) db.rdv[i] = c(r); saveDb(); },
      deleteRdv: function (id) { var db = D(); db.rdv = db.rdv.filter(function (r) { return r.id !== id; }); saveDb(); },
      listBlocages: function () { return D().bl.map(c); },
      insertBlocage: function (b) { D().bl.push(c(b)); saveDb(); },
      deleteBlocage: function (id) { var db = D(); db.bl = db.bl.filter(function (b) { return b.id !== id; }); saveDb(); },
      getMedia: function (k) { return D().media[k] || null; },
      setMedia: function (k, v) { var db = D(); if (v) db.media[k] = v; else delete db.media[k]; saveDb(); },
      getSecret: function (k) { return D().secrets[k] || null; },
      setSecret: function (k, v) { D().secrets[k] = v; saveDb(); },
      purgeRdvBefore: function (d) { var db = D(), n = db.rdv.length; db.rdv = db.rdv.filter(function (r) { return r.date >= d; }); saveDb(); return n - db.rdv.length; },
      purgeBlocagesBefore: function (d) { var db = D(), n = db.bl.length; db.bl = db.bl.filter(function (b) { return b.au >= d; }); saveDb(); return n - db.bl.length; }
    };
  }

  // Hash non cryptographique : suffisant pour une démo locale, jamais utilisé en production.
  function fnv(s) {
    var h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < s.length; i++) { h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619); h2 = Math.imul(h2 ^ s.charCodeAt(i), 2246822519); }
    return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16);
  }
  function rid(n) {
    var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  function demoEnv() {
    return {
      today: parisToday,
      // Heure locale de Paris "AAAA-MM-JJTHH:MM:SS" (même format que le back-end Google)
      nowIso: function () {
        try {
          var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
          var g = function (t) { for (var i = 0; i < p.length; i++) if (p[i].type === t) return p[i].value; return '00'; };
          return parisToday() + 'T' + g('hour') + ':' + g('minute') + ':' + g('second');
        } catch (e) { return new Date().toISOString().slice(0, 19); }
      },
      nowMs: function () { return Date.now(); },
      uuid: function () { return rid(16); },
      code: function () { return rid(6); },
      sha256: function (s) { return fnv(s); },
      hmac: function (k, m) { return fnv(k + '|' + m); },
      rateLimit: function () { return true; },
      rateLimitPeek: function () { return true; },
      withLock: function (fn) { return fn(); },
      log: function (e) { console.error(e); }
    };
  }

  function getDemoApp() {
    if (demoApp) return demoApp;
    demoApp = SorelleCore.createApp(demoStore(), demoEnv());
    var db = loadDb();
    if (!db.secrets.pinHash) demoApp.setPin('0000');
    if (!db.seeded) { seedHistory(db); seedDemo(demoApp); db.seeded = true; saveDb(); }
    return demoApp;
  }

  /* Historique fictif depuis le 1er janvier 2026 : 26 clientes régulières avec leurs habitudes
     (praticienne, jour, heure, soin, fréquence), quelques annulations et absences. */
  function seedHistory(db) {
    var U = SorelleCore._, cfg = SorelleCore.DEFAULT_CONFIG, today = parisToday();
    var rnd = (function () { var x = 20260101; return function () { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; })();
    var pren = ['Sandra', 'Julie', 'Nelly', 'Camille', 'Inès', 'Chloé', 'Manon', 'Sarah', 'Emma', 'Léna', 'Zoé', 'Lucie', 'Clara', 'Jade', 'Louise', 'Alice',
      'Margaux', 'Pauline', 'Océane', 'Marine', 'Laura', 'Élodie', 'Justine', 'Mélanie', 'Audrey', 'Céline'];
    var noms = ['Morel', 'Bernard', 'Petit', 'Roux', 'Garcia', 'Faure', 'Blanc', 'Girard', 'Lopez', 'Fontaine', 'Mercier', 'Dupuis', 'Lambert', 'Bonnet',
      'François', 'Martinez', 'Legrand', 'Garnier', 'Chevalier', 'Robin', 'Gauthier', 'Perrin', 'Morin', 'Henry', 'Roussel', 'Masson'];
    var svcs = [['remplissage'], ['remplissage'], ['remplissage'], ['remplissage', 'yumi_semi'], ['extension'], ['depose_pose_semi'], ['semi'], ['renfort'], ['yumi_semi'], ['remplissage']];
    var jours = [2, 3, 5, 6], heures = ['09:00', '09:00', '10:30', '13:30', '14:00', '16:00', '17:30'];
    var smap = {}; cfg.services.forEach(function (x) { smap[x.id] = x; });
    var clientes = []; for (var ci = 0; ci < 72; ci++) clientes.push(ci);
    clientes = clientes.map(function (i) {
      return { prenom: pren[i % 26], nom: noms[(i * 7 + Math.floor(i / 26)) % 26], prat: i % 2 ? 'lea' : 'laurie', jour: jours[(i + Math.floor(i / 4)) % 4], heure: heures[(i * 3 + Math.floor(i / 7)) % heures.length],
        services: svcs[(i * 3) % svcs.length], freq: [21, 21, 28, 28, 35, 42][i % 6], next: 2 + (i * 5) % 28 };
    });
    var busy = {};
    function free(prat, date, s, e) {
      var k = prat + date; var l = busy[k] || [];
      for (var i = 0; i < l.length; i++) if (s < l[i][1] + 15 && l[i][0] < e + 15) return false;
      return l.length < 6;
    }
    var id = 0;
    clientes.forEach(function (c) {
      var d = U.addDays('2026-01-01', c.next);
      while (d < U.addDays(today, 14)) {
        // aller au jour habituel le plus proche
        var guard = 0; while (U.weekday(d) !== c.jour && guard++ < 7) d = U.addDays(d, 1);
        var dur = c.services.reduce(function (m, x) { return m + smap[x].duree; }, 0);
        var opts = [c.heure, '09:00', '11:15', '13:30', '15:00', '16:30'], placed = false;
        for (var j = 0; j < opts.length && !placed; j++) {
          var s = U.toMin(opts[j]), e = s + dur;
          if (e > 20 * 60 || !free(c.prat, d, s, e)) continue;
          (busy[c.prat + d] = busy[c.prat + d] || []).push([s, e]);
          var r = rnd(), past = d < today;
          var statut = past ? (r < 0.05 ? 'annule' : r < 0.07 ? 'absente' : 'confirme') : 'confirme';
          var segs = [], t = s;
          c.services.forEach(function (x) { segs.push({ service: x, debut: U.toHHMM(t), fin: U.toHHMM(t + smap[x].duree), lieu: smap[x].categorie === 'pied' ? 'cabine' : 'poste' }); t += smap[x].duree; });
          db.rdv.push({ id: 'demo' + (++id), code: 'D' + (100000 + id), type: 'client', date: d, debut: U.toHHMM(s), fin: U.toHHMM(e),
            praticienne: c.prat, services: c.services.slice(), segments: segs, prenom: c.prenom, nom: c.nom, nouvelle: false, ongles: '',
            statut: statut, source: past ? 'agenda' : 'manuel', note: '', creeLe: d + 'T08:00:00', majLe: d + 'T08:00:00' });
          placed = true;
        }
        d = U.addDays(d, c.freq + (rnd() < 0.3 ? 7 : 0));
      }
    });
  }

  function seedDemo(app) {
    var tok = app.handle('admin.login', { pin: '0000' }).data.token;
    var U = SorelleCore._;
    var today = parisToday();
    var noms = [['Sandra', 'Morel'], ['Julie', 'Bernard'], ['Nelly', 'Petit'], ['Camille', 'Roux'], ['Inès', 'Garcia'],
      ['Chloé', 'Faure'], ['Manon', 'Blanc'], ['Sarah', 'Girard'], ['Emma', 'Lopez'], ['Léna', 'Fontaine'], ['Zoé', 'Mercier'], ['Lucie', 'Dupuis']];
    var plan = [
      ['laurie', ['remplissage'], '09:00'], ['laurie', ['semi'], '11:15'], ['laurie', ['extension'], '13:30'],
      ['lea', ['depose_pose_semi'], '09:00'], ['lea', ['yumi_semi'], '10:30'], ['lea', ['remplissage'], '14:00'], ['lea', ['semi', 'yumi'], '16:30']
    ];
    var k = 0, days = 0;
    for (var i = 0; i < 14 && days < 5; i++) {
      var d = U.addDays(today, i);
      if (!U.dayRules(SorelleCore.DEFAULT_CONFIG, d)) continue;
      days++;
      plan.forEach(function (p, j) {
        if ((i + j) % 3 === 2) return; // varier les journées
        var n = noms[k++ % noms.length];
        app.handle('admin.creerRdv', { praticienne: p[0], services: p[1], date: d, debut: p[2], prenom: n[0], nom: n[1] }, tok);
      });
      if (days === 2) app.handle('admin.creerMassage', { praticienne: 'laurie', service: 'massage', date: d, debut: '16:00', prenom: 'Marion', nom: 'Leroy', forcer: true }, tok);
    }
    // Une demande en attente pour montrer le flux de validation
    var d2 = U.addDays(today, 8);
    for (var g2 = 0; g2 < 14 && !U.dayRules(SorelleCore.DEFAULT_CONFIG, d2); g2++) d2 = U.addDays(d2, 1);
    var r = app.handle('admin.creerRdv', { praticienne: 'lea', services: ['extension'], date: d2, debut: '09:00', prenom: 'Anaïs', nom: 'Nouvelle', forcer: true }, tok);
    if (r.ok) app.handle('admin.statut', { id: r.data.id, statut: 'en_attente' }, tok);
  }

  /* ---------------- Transport ---------------- */
  function toError(e) {
    var x = new Error(e && e.message ? e.message : 'Erreur inattendue.');
    x.code = (e && e.code) || 'erreur';
    x.details = (e && e.details) || null;
    return x;
  }

  function send(action, payload, token) {
    if (isDemo) {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try {
            var res = getDemoApp().handle(action, c(payload || {}), token);
            if (res.ok) resolve(res.data); else reject(toError(res.error));
          } catch (e) {
            console.error(e);
            reject(toError({ code: 'erreur_demo', message: 'Erreur du mode démo : réinitialisez la démo dans Réglages.' }));
          }
        }, 180);
      });
    }
    // Délai max 40 s (Google peut être lent au premier appel) : jamais de chargement infini
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 40000) : null;
    return fetch(API_URL, {
      signal: ctrl ? ctrl.signal : undefined,
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // évite le pré-contrôle CORS
      body: JSON.stringify({ action: action, payload: payload || {}, token: token || null })
    }).then(function (r) {
      if (!r.ok) throw toError({ code: 'reseau', message: 'Le serveur ne répond pas (' + r.status + '). Réessayez.' });
      return r.json();
    }, function () {
      throw toError({ code: 'reseau', message: 'Connexion impossible. Vérifiez votre réseau et réessayez.' });
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (res && res.ok) return res.data;
      throw toError(res && res.error);
    });
  }

  function call(action, payload) { return send(action, payload, null); }

  function admin(action, payload) {
    return send(action, payload, safeGet(TOKEN_KEY)).catch(function (e) {
      if (e.code === 'non_autorise') {
        safeSet(TOKEN_KEY, null);
        try { window.dispatchEvent(new CustomEvent('sorelle:logout')); } catch (x) { /* ignore */ }
      }
      throw e;
    });
  }

  function login(pin) {
    return send('admin.login', { pin: String(pin) }).then(function (d) { safeSet(TOKEN_KEY, d.token); return true; });
  }
  function logout() { safeSet(TOKEN_KEY, null); }
  function isLoggedIn() { return !!safeGet(TOKEN_KEY); }
  function setToken(t) { safeSet(TOKEN_KEY, t); }

  function resetDemo() {
    safeSet(DEMO_KEY, null); safeSet(TOKEN_KEY, null);
    memDb = null; demoApp = null;
  }

  return {
    isDemo: isDemo, call: call, admin: admin, login: login, logout: logout,
    isLoggedIn: isLoggedIn, setToken: setToken, resetDemo: resetDemo, today: parisToday
  };
})();

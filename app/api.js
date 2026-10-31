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
  var DEMO_KEY = 'sorelle_demo_v1';
  var memDb = null;

  function loadDb() {
    if (memDb) return memDb;
    var raw = safeGet(DEMO_KEY);
    try { memDb = raw ? JSON.parse(raw) : null; } catch (e) { memDb = null; }
    if (!memDb) memDb = { config: null, rdv: [], bl: [], secrets: {}, seeded: false };
    return memDb;
  }
  function saveDb() { safeSet(DEMO_KEY, JSON.stringify(memDb)); }
  function c(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function demoStore() {
    var db = loadDb();
    return {
      getConfig: function () { return c(db.config); },
      saveConfig: function (cfg) { db.config = c(cfg); saveDb(); },
      listRdv: function (q) { return db.rdv.filter(function (r) { return r.date >= q.du && r.date <= q.au; }).map(c); },
      getRdv: function (id) { return c(db.rdv.filter(function (r) { return r.id === id; })[0] || null); },
      findRdvByCode: function (code) { return c(db.rdv.filter(function (r) { return r.code === code; })[0] || null); },
      insertRdv: function (r) { db.rdv.push(c(r)); saveDb(); },
      updateRdv: function (r) { for (var i = 0; i < db.rdv.length; i++) if (db.rdv[i].id === r.id) db.rdv[i] = c(r); saveDb(); },
      deleteRdv: function (id) { db.rdv = db.rdv.filter(function (r) { return r.id !== id; }); saveDb(); },
      listBlocages: function () { return db.bl.map(c); },
      insertBlocage: function (b) { db.bl.push(c(b)); saveDb(); },
      deleteBlocage: function (id) { db.bl = db.bl.filter(function (b) { return b.id !== id; }); saveDb(); },
      getSecret: function (k) { return db.secrets[k] || null; },
      setSecret: function (k, v) { db.secrets[k] = v; saveDb(); },
      purgeRdvBefore: function (d) { var n = db.rdv.length; db.rdv = db.rdv.filter(function (r) { return r.date >= d; }); saveDb(); return n - db.rdv.length; },
      purgeBlocagesBefore: function (d) { var n = db.bl.length; db.bl = db.bl.filter(function (b) { return b.au >= d; }); saveDb(); return n - db.bl.length; }
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
      nowIso: function () { return new Date().toISOString(); },
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
    if (!db.seeded) { seedDemo(demoApp); db.seeded = true; saveDb(); }
    return demoApp;
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
    var r = app.handle('admin.creerRdv', { praticienne: 'lea', services: ['extension'], date: d2, debut: '09:00', prenom: 'Anaïs', nom: 'Nouvelle', nouvelle: true, ongles: 'rien' }, tok);
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

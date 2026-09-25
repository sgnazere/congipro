// Test de charge EcoGec — comptes fictifs @charge.test (mot de passe commun)
// node charge.js <phase> [utilisateurs] [durée_s]   phases : login | usage | lourd
const { Client } = require('pg');
const B = process.env.API || 'http://localhost:3002/api';
const PW = process.env.CHARGE_PASSWORD;
if (!PW) { console.error('Définir CHARGE_PASSWORD (mot de passe des comptes @charge.test)'); process.exit(1); }
const [phase = 'usage', nArg = '300', durArg = '120'] = process.argv.slice(2);

const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
function report(label, lat, errs, seconds) {
  lat.sort((x, y) => x - y);
  const n = lat.length;
  console.log(`${label.padEnd(34)} ${String(n).padStart(6)} req  ${(n / seconds).toFixed(1).padStart(6)} req/s  ` +
    `p50 ${pct(lat, .5).toFixed(0).padStart(5)} ms  p95 ${pct(lat, .95).toFixed(0).padStart(5)} ms  p99 ${pct(lat, .99).toFixed(0).padStart(5)} ms  ` +
    `max ${(lat[n - 1] || 0).toFixed(0).padStart(5)} ms  erreurs ${errs.total}${errs.total ? ' ' + JSON.stringify(errs.byCode) : ''}`);
}
const newErrs = () => ({ total: 0, byCode: {} });
const perPath = {};
async function call(tok, method, path, body, errs) {
  const t = performance.now();
  let status = 0;
  try {
    const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    status = r.status; const txt = await r.text();
    const ms = performance.now() - t;
    const key = method + ' ' + path.replace(/[0-9a-f-]{36}/g, ':id').replace(/\?.*/, '');
    (perPath[key] ||= []).push(ms);
    if (status >= 400 && !(status === 409 || status === 422)) { errs.total++; errs.byCode[status] = (errs.byCode[status] || 0) + 1; }
    let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = { csvBytes: txt.length }; }
    return { status, ms, data };
  } catch (e) {
    errs.total++; const c = 'reseau:' + (e.cause?.code || e.name); errs.byCode[c] = (errs.byCode[c] || 0) + 1;
    return { status: 0, ms: performance.now() - t, data: null };
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

async function accounts(n) {
  const db = new Client({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS, database: process.env.DB_NAME || 'congipro' });
  await db.connect();
  const rows = (await db.query(`SELECT email, role FROM users WHERE email LIKE '%@charge.test' ORDER BY role DESC, email LIMIT $1`, [n])).rows;
  await db.end();
  return rows;
}
async function dbStats() {
  const db = new Client({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'postgres', password: process.env.DB_PASS, database: process.env.DB_NAME || 'congipro' });
  await db.connect();
  const r = (await db.query(`SELECT count(*) FILTER (WHERE datname='congipro') AS conn, count(*) FILTER (WHERE datname='congipro' AND state='active') AS actives FROM pg_stat_activity`)).rows[0];
  await db.end(); return r;
}

async function loginAll(accs, concurrency, label) {
  const lat = [], errs = newErrs(), tokens = {};
  let i = 0; const t0 = performance.now();
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < accs.length) {
      const a = accs[i++];
      const r = await call(null, 'POST', '/auth/login', { email: a.email, password: PW }, errs);
      lat.push(r.ms);
      if (r.data?.accessToken) tokens[a.email] = r.data.accessToken;
    }
  }));
  report(label, lat, errs, (performance.now() - t0) / 1000);
  return tokens;
}

// Parcours d'un utilisateur : écrans tels que l'interface les appelle, avec temps de lecture
async function user(a, tok, until, lat, errs, stats) {
  const mgr = a.role === 'manager';
  const g = async (p) => { const r = await call(tok, 'GET', p, null, errs); lat.push(r.ms); return r; };
  await sleep(rnd(0, 5000));   // arrivées étalées
  while (performance.now() < until) {
    // Tableau de bord (+ compteurs du menu)
    await Promise.all([g('/notifications/unread-count'), g('/balances/me'), g('/requests/all'),
      ...(mgr ? [g('/requests/to-validate'), g('/returns/to-process')] : [])]);
    await sleep(rnd(2000, 5000));
    const roll = Math.random();
    if (mgr && roll < 0.4) {
      const q = await g('/requests/to-validate');
      const r = q.data?.[0];
      if (r) {
        const x = await call(tok, 'PATCH', `/requests/${r.id}/approve`, { action: 'approved', comment: 'Charge' }, errs);
        lat.push(x.ms); if (x.status === 200) stats.approvals++;
      }
    } else if (roll < 0.35) {
      const r = await g('/requests/all');
      if (r.data?.[0]) await g(`/requests/${r.data[0].id}/steps`);
    } else if (roll < 0.6) {
      await Promise.all([g('/requests?from=2026-11-01&to=2026-11-30'), g('/holidays?year=2026')]);
    } else if (roll < 0.8) {
      await g('/notifications');
    } else {
      await Promise.all([g('/leave-types'), g('/balances/me?year=2026')]);
      if (!mgr && Math.random() < 0.3) {
        // Dépôt d'une demande (jour ouvré aléatoire de décembre, sans chevauchement garanti)
        const d = 1 + Math.floor(Math.random() * 20);
        const day = `2026-12-${String(d).padStart(2, '0')}`;
        const types = stats.types;
        const x = await call(tok, 'POST', '/requests', { leave_type_id: types.SPECIAL, start_date: day, end_date: day, reason: 'Charge' }, errs);
        lat.push(x.ms); if (x.status === 201) stats.created++;
      }
    }
    await sleep(rnd(2000, 5000));
  }
}

(async () => {
  if (phase === 'login') {
    const accs = await accounts(parseInt(nArg));
    for (const c of [10, 50]) await loginAll(accs.slice(0, 500), c, `Connexions (concurrence ${c})`);
    return;
  }
  if (phase === 'usage') {
    const n = parseInt(nArg), dur = parseInt(durArg);
    const accs = await accounts(n);
    // Répartition réelle : managers inclus proportionnellement (1 pour ~19 employés)
    const tokens = await loginAll(accs, 50, `Connexion préalable de ${n} comptes`);
    const any = Object.values(tokens)[0];
    const types = Object.fromEntries((await call(any, 'GET', '/leave-types', null, newErrs())).data.map(t => [t.code, t.id]));
    const lat = [], errs = newErrs(), stats = { approvals: 0, created: 0, types };
    for (const k in perPath) delete perPath[k];
    const t0 = performance.now(), until = t0 + dur * 1000;
    const samples = [];
    const sampler = setInterval(async () => samples.push(await dbStats()), 3000);
    await Promise.all(accs.filter(a => tokens[a.email]).map(a => user(a, tokens[a.email], until, lat, errs, stats)));
    clearInterval(sampler);
    const secs = (performance.now() - t0) / 1000;
    report(`Usage réaliste : ${n} utilisateurs actifs`, lat, errs, secs);
    console.log(`  écritures : ${stats.created} demandes déposées, ${stats.approvals} validations ; connexions PostgreSQL max ${Math.max(...samples.map(s => +s.conn))}, requêtes actives max ${Math.max(...samples.map(s => +s.actives))}`);
    console.log('  par route (p95) :', Object.entries(perPath).map(([k, v]) => { v.sort((a, b) => a - b); return `${k} ${pct(v, .95).toFixed(0)} ms`; }).join(' | '));
    return;
  }
  if (phase === 'lourd') {
    const errs = newErrs();
    const rh = (await call(null, 'POST', '/auth/login', { email: process.env.RH_EMAIL, password: process.env.RH_PASSWORD }, errs)).data.accessToken;
    for (const [label, p] of [['Utilisateurs (page 1, 50 lignes)', '/users?page=1&limit=50'], ['Utilisateurs (recherche)', '/users?page=1&limit=50&search=charge-09'],
      ['Encadrants (liste complète)', '/users?roles=manager,rh,director,board,admin'], ['Journal d’audit (page 1)', '/audit-logs?page=1&limit=50'],
      ['Journal d’audit (filtre LOGIN)', '/audit-logs?page=20&limit=50&action=LOGIN'], ['Statistiques 2026', '/stats?year=2026'],
      ['Export CSV 2026', '/stats/export?year=2026'], ['Demandes en attente (comptage)', '/requests?status=pending&count=1'],
      ['Calendrier RH (novembre)', '/requests?from=2026-11-01&to=2026-11-30'], ['File des retours (RH)', '/returns/to-process'],
      ['Relances (passage complet)', 'POST /returns/run-reminders']]) {
      const lat = [], e = newErrs();
      const [m, path] = p.startsWith('POST ') ? ['POST', p.slice(5)] : ['GET', p];
      let size = 0;
      for (let i = 0; i < (m === 'POST' ? 1 : 5); i++) { const r = await call(rh, m, path, null, e); lat.push(r.ms); size = JSON.stringify(r.data || '').length; }
      if (path.includes('export')) size = 0;
      report(`${label} (${(size / 1024).toFixed(0)} Ko)`, lat, e, lat.reduce((a, b) => a + b, 0) / 1000);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });

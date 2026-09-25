// Test du retour effectif (déclaration, confirmation, anticipé, tardif, régularisation, relances)
// Comptes fictifs TEST-AUDIT (nettoyage : tests/cleanup_test_data.sql).
// Dates écrites pour une exécution le 24/09/2026 : à rendre relatives avant usage en CI.
const B = process.env.API_URL || 'http://localhost:3001/api';
const RH_EMAIL = process.env.TEST_RH_EMAIL, RH_PASSWORD = process.env.TEST_RH_PASSWORD;
if (!RH_EMAIL || !RH_PASSWORD) { console.error('Définir TEST_RH_EMAIL et TEST_RH_PASSWORD (compte RH de test)'); process.exit(1); }
let pass = 0, fail = 0;
async function call(token, method, path, body) {
  const r = await fetch(B + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let data; try { data = JSON.parse(t) } catch { data = t }
  return { status: r.status, data };
}
const login = async (e, p) => (await call(null, 'POST', '/auth/login', { email: e, password: p })).data.accessToken;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅', label) } else { fail++; console.log('  ❌', label, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : '') } };
const bal = async (tok, code) => { const b = (await call(tok, 'GET', '/balances/me')).data.find(x => x.code === code); return b && { used: +b.used_days, pending: +b.pending_days } };

(async () => {
  const rh = await login(RH_EMAIL, RH_PASSWORD);
  const me = (await call(rh, 'GET', '/users/me')).data;
  const T = Object.fromEntries((await call(rh, 'GET', '/leave-types')).data.map(t => [t.code, t]));
  // Type dédié aux tests (1 niveau, 30 j) : ne dépend pas du paramétrage de l'organisation
  T.TESTN1 = (await call(rh, 'POST', '/leave-types', { code: 'TESTN1', label: 'Test 1 niveau', max_days_per_year: 30, approval_levels: 1 })).data;
  const pw = 'TestAudit2026!';
  const mgr = (await call(rh, 'POST', '/users', { email: 'test-audit.manager@ecogec.test', password: pw, first_name: 'Koffi', last_name: 'TEST-AUDIT', role: 'manager', manager_id: me.id })).data;
  const emp = (await call(rh, 'POST', '/users', { email: 'test-audit.employe@ecogec.test', password: pw, first_name: 'Aya', last_name: 'TEST-AUDIT', role: 'employee', manager_id: mgr.id })).data;
  await call(rh, 'POST', '/users', { email: 'test-audit.autre@ecogec.test', password: pw, first_name: 'Yao', last_name: 'TEST-AUDIT', role: 'manager', manager_id: me.id });
  const E = await login('test-audit.employe@ecogec.test', pw), M = await login('test-audit.manager@ecogec.test', pw), O = await login('test-audit.autre@ecogec.test', pw);

  // Crée une demande passée puis la fait approuver (1 ou 2 niveaux)
  const approved = async (code, start, end, reason) => {
    const r = (await call(E, 'POST', '/requests', { leave_type_id: T[code].id, start_date: start, end_date: end, reason })).data;
    await call(M, 'PATCH', `/requests/${r.id}/approve`, { action: 'approved' });
    if (T[code].approval_levels === 2) await call(rh, 'PATCH', `/requests/${r.id}/approve`, { action: 'approved' });
    return r;
  };

  console.log('— Retour à l’heure (1 niveau 21-23/09, retour prévu 24/09)');
  const a = await approved('TESTN1', '2026-09-21', '2026-09-23', 'Test retour à l’heure');
  let list = (await call(E, 'GET', '/requests/all')).data;
  const ra = list.find(x => x.id === a.id);
  check('Retour prévu calculé : 24/09', ra.planned_return_date === '2026-09-24', ra.planned_return_date);
  let x = await call(E, 'POST', `/requests/${a.id}/return`, { actual_return_date: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
  check('Date future refusée (422)', x.status === 422, x);
  x = await call(E, 'POST', `/requests/${a.id}/return`, { actual_return_date: '2026-09-24', comment: 'De retour ce matin' });
  check('Employé déclare → declared, écart 0', x.data.status === 'declared' && x.data.gap_days === 0, x);
  check('Manager : retour « à confirmer » dans sa file', (await call(M, 'GET', '/returns/to-process')).data.some(r => r.id === a.id && r.action === 'confirm'));
  check('Autre manager ne le voit pas', !(await call(O, 'GET', '/returns/to-process')).data.some(r => r.id === a.id));
  check('Autre manager ne peut pas confirmer (403)', (await call(O, 'PATCH', `/requests/${a.id}/return/confirm`, {})).status === 403);
  check('Employé ne peut pas confirmer (403)', (await call(E, 'PATCH', `/requests/${a.id}/return/confirm`, {})).status === 403);
  check('Notification au manager', (await call(M, 'GET', '/notifications')).data.some(n => n.request_id === a.id && n.title.includes('Retour')));
  x = await call(M, 'PATCH', `/requests/${a.id}/return/confirm`, { comment: 'Bon retour' });
  check('Manager confirme → closed', x.data.status === 'closed', x);
  check('Solde 1 niveau : 3 j pris', (await bal(E, 'TESTN1')).used === 3);
  check('Nouvelle déclaration sur un congé clôturé refusée (409)', (await call(E, 'POST', `/requests/${a.id}/return`, { actual_return_date: '2026-09-24' })).status === 409);
  const det = (await call(E, 'GET', `/requests/${a.id}/return`)).data;
  check('Trace : déclarant, confirmateur, horodatages', det.declared_by_name === 'Aya TEST-AUDIT' && det.confirmed_by_name === 'Koffi TEST-AUDIT' && det.declared_at && det.confirmed_at, det);

  console.log('— Retour anticipé (CP 14-18/09, 5 j, retour le 17/09)');
  const b = await approved('CP', '2026-09-14', '2026-09-18', 'Test retour anticipé');
  x = await call(E, 'POST', `/requests/${b.id}/return`, { actual_return_date: '2026-09-17' });
  check('Écart sans motif refusé (400)', x.status === 400, x);
  x = await call(E, 'POST', `/requests/${b.id}/return`, { actual_return_date: '2026-09-17', reason: 'Besoin du service' });
  check('Déclaré avec écart −2', x.data.gap_days === -2 && x.data.actual_days === 3, x);
  x = await call(M, 'PATCH', `/requests/${b.id}/return/confirm`, {});
  check('Confirmé → clôturé', x.data.status === 'closed', x);
  check('Solde CP : 3 j pris (2 rendus)', (await bal(E, 'CP')).used === 3);
  const team = (await call(M, 'GET', '/users/team?from=2026-09-14&to=2026-09-18')).data;
  check('Planning : absence écourtée au 16/09', team.leaves.find(l => l.id === b.id)?.end_date === '2026-09-16', team.leaves);

  console.log('— Retour tardif enregistré par le manager (CP 07-09/09, retour le 14/09 au lieu du 10/09)');
  const c = await approved('CP', '2026-09-07', '2026-09-09', 'Test retour tardif');
  x = await call(M, 'POST', `/requests/${c.id}/return`, { actual_return_date: '2026-09-14', reason: 'Prolongation raison familiale' });
  check('Enregistré par le manager → to_regularize, +2 j', x.data.status === 'to_regularize' && x.data.gap_days === 2, x);
  check('RH : « à régulariser » dans sa file', (await call(rh, 'GET', '/returns/to-process')).data.some(r => r.id === c.id && r.action === 'regularize'));
  check('RH notifiés', (await call(rh, 'GET', '/notifications')).data.some(n => n.request_id === c.id && n.title.includes('tardif')));
  check('Manager ne peut pas régulariser (403)', (await call(M, 'PATCH', `/requests/${c.id}/return/regularize`, { regularization: 'sans_solde' })).status === 403);
  check('Régularisation invalide (400)', (await call(rh, 'PATCH', `/requests/${c.id}/return/regularize`, { regularization: 'n_importe_quoi' })).status === 400);
  x = await call(rh, 'PATCH', `/requests/${c.id}/return/regularize`, { regularization: 'deduire_conge', comment: 'Accord exceptionnel' });
  check('RH : déduire du congé → clôturé, 5 j imputés', x.data.status === 'closed' && x.data.charged_days === 5, x);
  check('Solde CP : 3 + 5 = 8 j pris', (await bal(E, 'CP')).used === 8);

  console.log('— Retour tardif déclaré par l’employé, régularisé sans solde (1 niveau 31/08-01/09, retour le 04/09)');
  const d = await approved('TESTN1', '2026-08-31', '2026-09-01', 'Test sans solde');
  x = await call(E, 'POST', `/requests/${d.id}/return`, { actual_return_date: '2026-09-04', reason: 'Transport bloqué' });
  check('Déclaré, +2 j', x.data.status === 'declared' && x.data.gap_days === 2, x);
  x = await call(M, 'PATCH', `/requests/${d.id}/return/confirm`, {});
  check('Confirmé → à régulariser', x.data.status === 'to_regularize', x);
  x = await call(rh, 'PATCH', `/requests/${d.id}/return/regularize`, { regularization: 'sans_solde' });
  check('Sans solde → 2 j imputés seulement', x.data.charged_days === 2, x);
  check('Solde 1 niveau : 3 + 2 = 5 j pris', (await bal(E, 'TESTN1')).used === 5);

  console.log('— Relances (1 niveau 24-25/08 approuvé, jamais déclaré)');
  const e = await approved('TESTN1', '2026-08-24', '2026-08-25', 'Test relance');
  x = await call(rh, 'POST', '/returns/run-reminders');
  check('Relances envoyées', x.status === 200 && /[1-9]/.test(x.data.message), x);
  check('Employé relancé', (await call(E, 'GET', '/notifications')).data.some(n => n.request_id === e.id && n.type === 'reminder'));
  check('Manager relancé', (await call(M, 'GET', '/notifications')).data.some(n => n.request_id === e.id && n.type === 'reminder'));
  check('RH alertés (J+3)', (await call(rh, 'GET', '/notifications')).data.some(n => n.request_id === e.id && n.title.startsWith('Retour non confirmé')));
  const before = (await call(E, 'GET', '/notifications')).data.length;
  await call(rh, 'POST', '/returns/run-reminders');
  check('Pas de relance en double', (await call(E, 'GET', '/notifications')).data.length === before);
  check('Manager : retour « non déclaré » à enregistrer', (await call(M, 'GET', '/returns/to-process')).data.some(r => r.id === e.id && r.action === 'record' && r.overdue_days > 0));

  console.log('— Divers');
  const p = (await call(E, 'POST', '/requests', { leave_type_id: T.TESTN1.id, start_date: '2026-09-02', end_date: '2026-09-02', reason: 'en attente' })).data;
  check('Retour sur demande non approuvée refusé (409)', (await call(E, 'POST', `/requests/${p.id}/return`, { actual_return_date: '2026-09-03' })).status === 409);
  const csv = await (await fetch(`${B}/stats/export?year=2026`, { headers: { Authorization: 'Bearer ' + rh } })).text();
  check('Export CSV : colonnes et statut de retour', csv.includes('Retour effectif') && csv.includes('Clôturé') && csv.includes('Déduit du congé'));
  const anomalies = (await call(rh, 'GET', '/audit-logs')).data.filter(l => ['DECLARE_RETURN', 'CONFIRM_RETURN', 'RECORD_RETURN', 'REGULARIZE_RETURN', 'RETURN_REMINDER'].includes(l.action));
  check('Audit : déclarations, confirmations, régularisations, relances tracées', new Set(anomalies.map(l => l.action)).size === 5, [...new Set(anomalies.map(l => l.action))]);

  console.log(`\n${pass} réussis, ${fail} échoués`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });

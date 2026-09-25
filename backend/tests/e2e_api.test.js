// Test de bout en bout du circuit de validation (données fictives, préfixe TEST-AUDIT)

const B = process.env.API_URL || 'http://localhost:3001/api';
const RH_EMAIL = process.env.TEST_RH_EMAIL, RH_PASSWORD = process.env.TEST_RH_PASSWORD;
if (!RH_EMAIL || !RH_PASSWORD) { console.error('Définir TEST_RH_EMAIL et TEST_RH_PASSWORD (compte RH de test)'); process.exit(1); }

let pass = 0, fail = 0;

async function call(token, method, path, body) {
  const r = await fetch(B + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}
const login = async (email, password) => (await call(null, 'POST', '/auth/login', { email, password })).data.accessToken;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); }
}
const bal = async (tok, code) => {
  const b = (await call(tok, 'GET', '/balances/me')).data.find(x => x.code === code);
  return b && { total: +b.total_days, used: +b.used_days, pending: +b.pending_days };
};

(async () => {
  const rh = await login(RH_EMAIL, RH_PASSWORD);
  const me = (await call(rh, 'GET', '/users/me')).data;
  const types = (await call(rh, 'GET', '/leave-types')).data;
  const T = Object.fromEntries(types.map(t => [t.code, t]));
  // Type dédié aux tests (1 niveau, 30 j) : ne dépend pas du paramétrage de l'organisation
  T.TESTN1 = (await call(rh, 'POST', '/leave-types', { code: 'TESTN1', label: 'Test 1 niveau', max_days_per_year: 30, approval_levels: 1 })).data;

  console.log('— Préparation');
  const pw = 'TestAudit2026!';
  const mgr = (await call(rh, 'POST', '/users', { email: 'test-audit.manager@ecogec.test', password: pw, first_name: 'Koffi', last_name: 'TEST-AUDIT', role: 'manager', manager_id: me.id })).data;
  check('RH crée un manager fictif', mgr.id, mgr);
  const emp = (await call(rh, 'POST', '/users', { email: 'test-audit.employe@ecogec.test', password: pw, first_name: 'Aya', last_name: 'TEST-AUDIT', role: 'employee', manager_id: mgr.id })).data;
  check('RH crée un employé fictif', emp.id, emp);
  const other = (await call(rh, 'POST', '/users', { email: 'test-audit.autre@ecogec.test', password: pw, first_name: 'Yao', last_name: 'TEST-AUDIT', role: 'manager', manager_id: me.id })).data;

  const admCreate = await call(rh, 'POST', '/users', { email: 'test-audit.admin@ecogec.test', password: pw, first_name: 'X', last_name: 'TEST-AUDIT', role: 'admin' });
  check('RH ne peut PAS créer un super admin (403)', admCreate.status === 403, admCreate);
  const noSup = await call(rh, 'POST', '/users', { email: 'test-audit.nosup@ecogec.test', password: pw, first_name: 'X', last_name: 'TEST-AUDIT', role: 'employee' });
  check('Employé sans superviseur refusé (400)', noSup.status === 400, noSup.status);

  const E = await login('test-audit.employe@ecogec.test', pw);
  const M = await login('test-audit.manager@ecogec.test', pw);
  const O = await login('test-audit.autre@ecogec.test', pw);
  check('Soldes initialisés à la création', (await call(E, 'GET', '/balances/me')).data.length >= 5);

  console.log('— Circuit 2 niveaux (Congés payés)');
  const cp0 = await bal(E, 'CP');
  const r1 = (await call(E, 'POST', '/requests', { leave_type_id: T.CP.id, start_date: '2026-11-02', end_date: '2026-11-06', reason: 'Test audit CP' })).data;
  check('Employé soumet 5 j de CP', r1.id && +r1.days_count === 5, r1);
  check('Solde : 5 j passent en « en attente »', (await bal(E, 'CP')).pending === cp0.pending + 5);
  const ov = await call(E, 'POST', '/requests', { leave_type_id: T.TESTN1.id, start_date: '2026-11-04', end_date: '2026-11-04', reason: 'chevauchement' });
  check('Chevauchement refusé (409)', ov.status === 409, ov);
  check('Manager voit la demande dans « à valider »', (await call(M, 'GET', '/requests/to-validate')).data.some(r => r.id === r1.id));
  check('Autre manager ne la voit PAS', !(await call(O, 'GET', '/requests/to-validate')).data.some(r => r.id === r1.id));
  check('RH ne la voit PAS à l’étape 1', !(await call(rh, 'GET', '/requests/to-validate')).data.some(r => r.id === r1.id));
  let x = await call(O, 'PATCH', `/requests/${r1.id}/approve`, { action: 'approved' });
  check('Autre manager ne peut PAS valider (403)', x.status === 403, x);
  x = await call(rh, 'PATCH', `/requests/${r1.id}/approve`, { action: 'approved' });
  check('RH ne peut PAS sauter l’étape 1 (403)', x.status === 403, x);
  x = await call(E, 'PATCH', `/requests/${r1.id}/approve`, { action: 'approved' });
  check('Employé ne peut PAS valider (403)', x.status === 403, x);
  check('Notification reçue par le manager', (await call(M, 'GET', '/notifications/unread-count')).data.count >= 1);
  x = await call(M, 'PATCH', `/requests/${r1.id}/approve`, { action: 'approved', comment: 'OK côté équipe' });
  check('Manager valide → passe à l’étape 2', x.status === 200 && x.data.status === 'pending' && x.data.current_level === 2, x);
  x = await call(M, 'PATCH', `/requests/${r1.id}/approve`, { action: 'approved' });
  check('Manager ne peut PAS valider l’étape RH (403)', x.status === 403, x);
  check('RH la voit maintenant dans « à valider »', (await call(rh, 'GET', '/requests/to-validate')).data.some(r => r.id === r1.id));
  x = await call(rh, 'PATCH', `/requests/${r1.id}/approve`, { action: 'approved' });
  check('RH valide → approuvée', x.data.status === 'approved', x);
  const cp1 = await bal(E, 'CP');
  check('Solde : 5 j « pris », plus rien en attente', cp1.used === cp0.used + 5 && cp1.pending === cp0.pending, cp1);
  const steps = (await call(E, 'GET', `/requests/${r1.id}/steps`)).data;
  check('Historique : 2 étapes visibles par l’employé', steps.length === 2 && steps[0].comment === 'OK côté équipe', steps);
  check('Autre manager ne voit pas l’historique (403)', (await call(O, 'GET', `/requests/${r1.id}/steps`)).status === 403);
  const notifs = (await call(E, 'GET', '/notifications')).data.map(n => n.type);
  check('Employé notifié (étape 1 franchie + approbation)', notifs.includes('system') && notifs.includes('request_approved'), notifs);

  console.log('— Rejet (type 1 niveau)');
  const rtt0 = await bal(E, 'TESTN1');
  const r2 = (await call(E, 'POST', '/requests', { leave_type_id: T.TESTN1.id, start_date: '2026-11-09', end_date: '2026-11-10', reason: 'Test audit rejet' })).data;
  x = await call(M, 'PATCH', `/requests/${r2.id}/approve`, { action: 'rejected' });
  check('Rejet sans motif refusé (400)', x.status === 400, x);
  x = await call(M, 'PATCH', `/requests/${r2.id}/approve`, { action: 'rejected', comment: 'Période chargée' });
  check('Rejet avec motif', x.data.status === 'rejected' && x.data.rejection_note === 'Période chargée', x);
  check('Solde 1 niveau : jours en attente rendus', (await bal(E, 'TESTN1')).pending === rtt0.pending);

  console.log('— Validation automatique (Arrêt maladie, 0 niveau)');
  const mal0 = await bal(E, 'MALADIE');
  const r3 = (await call(E, 'POST', '/requests', { leave_type_id: T.MALADIE.id, start_date: '2026-11-16', end_date: '2026-11-17', reason: 'Test audit maladie' })).data;
  check('Enregistrée directement (approved, auto_approved)', r3.status === 'approved' && r3.auto_approved === true, r3);
  const mal1 = await bal(E, 'MALADIE');
  check('Solde maladie : 2 j pris', mal1.used === (mal0?.used || 0) + 2 && mal1.pending === (mal0?.pending || 0), mal1);
  check('Manager informé', (await call(M, 'GET', '/notifications')).data.some(n => n.request_id === r3.id));

  console.log('— Annulation');
  const r4 = (await call(E, 'POST', '/requests', { leave_type_id: T.CP.id, start_date: '2026-12-01', end_date: '2026-12-02', reason: 'Test audit annulation' })).data;
  x = await call(E, 'DELETE', `/requests/${r4.id}`);
  check('Employé annule sa demande en attente', x.status === 200, x);
  check('Solde CP : jours rendus', (await bal(E, 'CP')).pending === cp1.pending);
  check('Demande annulée absente de « à valider »', !(await call(M, 'GET', '/requests/to-validate')).data.some(r => r.id === r4.id));
  x = await call(E, 'DELETE', `/requests/${r1.id}`);
  check('Impossible d’annuler une demande approuvée (409)', x.status === 409, x);

  console.log('— Auto-validation interdite');
  const r5 = (await call(M, 'POST', '/requests', { leave_type_id: T.TESTN1.id, start_date: '2026-11-23', end_date: '2026-11-23', reason: 'Test audit manager' })).data;
  check('Le manager ne voit pas SA demande à valider', !(await call(M, 'GET', '/requests/to-validate')).data.some(r => r.id === r5.id));
  x = await call(M, 'PATCH', `/requests/${r5.id}/approve`, { action: 'approved' });
  check('Le manager ne peut pas valider SA demande (403)', x.status === 403, x);
  check('Son superviseur (RH) la voit à l’étape 1', (await call(rh, 'GET', '/requests/to-validate')).data.some(r => r.id === r5.id));

  console.log('— Justificatif obligatoire');
  const td = (await call(rh, 'POST', '/leave-types', { code: 'TESTAUDIT', label: 'Test audit justificatif', max_days_per_year: 5, requires_document: true, approval_levels: 1 })).data;

  x = await call(E, 'POST', '/requests', { leave_type_id: td.id, start_date: '2026-11-24', end_date: '2026-11-24', reason: 'sans doc' });
  check('Sans justificatif → refusé (422)', x.status === 422, x);
  x = await call(E, 'POST', '/requests', { leave_type_id: td.id, start_date: '2026-11-24', end_date: '2026-11-24', reason: 'mauvais format',
    document: { name: 'a.exe', type: 'application/x-msdownload', data: Buffer.from('MZ').toString('base64') } });
  check('Format interdit → refusé (422)', x.status === 422, x);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  const r6 = (await call(E, 'POST', '/requests', { leave_type_id: td.id, start_date: '2026-11-24', end_date: '2026-11-24', reason: 'avec doc',
    document: { name: 'certificat.pdf', type: 'application/pdf', data: pdf.toString('base64') } })).data;
  check('Avec PDF → acceptée', r6.id && r6.document_url, r6);
  let d = await fetch(`${B}/requests/${r6.id}/document`, { headers: { Authorization: 'Bearer ' + M } });
  check('Le manager télécharge le justificatif', d.status === 200 && (await d.text()).startsWith('%PDF'));
  d = await fetch(`${B}/requests/${r6.id}/document`, { headers: { Authorization: 'Bearer ' + O } });
  check('Un autre manager ne peut PAS (403)', d.status === 403);


  console.log('— Divers');
  check('Solde insuffisant détecté', (await call(E, 'POST', '/requests', { leave_type_id: T.SPECIAL.id, start_date: '2026-12-07', end_date: '2026-12-18', reason: 'trop long' })).status === 422);
  check('Demande à cheval sur 2 années refusée', (await call(E, 'POST', '/requests', { leave_type_id: T.CP.id, start_date: '2026-12-30', end_date: '2027-01-05', reason: 'x' })).status === 422);
  const team = (await call(M, 'GET', '/users/team?from=2026-11-01&to=2026-11-30')).data;
  check('Planning équipe : l’employé et ses absences', team.members.some(m => m.id === emp.id) && team.leaves.length >= 2, team);
  check('Employé : accès à /users refusé (403)', (await call(E, 'GET', '/users')).status === 403);
  const logs = (await call(rh, 'GET', '/audit-logs')).data;
  check('Audit : aucun champ sensible renvoyé', !JSON.stringify(logs).match(/password_hash|refresh_token|new_value|old_value/));
  x = await call(rh, 'PATCH', `/users/${me.id}`, { is_active: false });
  check('Impossible de se désactiver soi-même (400)', x.status === 400, x);

  console.log('— Conseil d’administration (superviseur du directeur)');
  const board = (await call(rh, 'POST', '/users', { email: 'test-audit.ca@ecogec.test', password: pw, first_name: 'Conseil', last_name: 'TEST-AUDIT', role: 'board' })).data;
  check('Compte « board » créé sans superviseur', board.role === 'board', board);
  const dir = (await call(rh, 'POST', '/users', { email: 'test-audit.de@ecogec.test', password: pw, first_name: 'Direction', last_name: 'TEST-AUDIT', role: 'director', manager_id: board.id })).data;
  check('Directeur rattaché au Conseil', dir.id, dir);
  const CA = await login('test-audit.ca@ecogec.test', pw), DE = await login('test-audit.de@ecogec.test', pw);
  const rd = (await call(DE, 'POST', '/requests', { leave_type_id: T.TESTN1.id, start_date: '2026-12-14', end_date: '2026-12-15', reason: 'Test directeur' })).data;
  check('Le Conseil voit la demande du directeur', (await call(CA, 'GET', '/requests/to-validate')).data.some(r => r.id === rd.id));
  x = await call(CA, 'PATCH', `/requests/${rd.id}/approve`, { action: 'approved' });
  check('Le Conseil valide → approuvée', x.data.status === 'approved', x);
  check('Conseil : pas d’accès aux utilisateurs (403)', (await call(CA, 'GET', '/users')).status === 403);
  check('Conseil : pas d’accès aux statistiques (403)', (await call(CA, 'GET', '/stats')).status === 403);

  console.log('— Modification de compte');
  x = await call(rh, 'PATCH', `/users/${emp.id}`, { email: 'test-audit.employe2@ecogec.test', last_name: 'TEST-AUDIT' });
  check('RH change l’email', x.status === 200 && x.data.email === 'test-audit.employe2@ecogec.test', x);
  check('Connexion avec le nouvel email', !!(await login('test-audit.employe2@ecogec.test', pw)));
  check('Email déjà utilisé refusé (409)', (await call(rh, 'PATCH', `/users/${emp.id}`, { email: 'test-audit.manager@ecogec.test' })).status === 409);
  check('RH ne peut pas promouvoir super admin (403)', (await call(rh, 'PATCH', `/users/${emp.id}`, { role: 'admin' })).status === 403);
  check('Email invalide refusé (400)', (await call(rh, 'PATCH', `/users/${emp.id}`, { email: 'pas-un-email' })).status === 400);

  console.log(`\n${pass} réussis, ${fail} échoués`);
  process.exitCode = fail ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });

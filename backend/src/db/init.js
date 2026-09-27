// ════════════════════════════════════════════════════════════
//  EcoGec — Initialisation d'une installation (npm run db:init)
//
//  1. Schéma de référence (schema.sql) si la base est vide
//  2. Migrations manquantes
//  3. Types de congés et jours fériés de Côte d'Ivoire (sans écraser l'existant)
//  4. Premier super administrateur (seulement s'il n'en existe aucun actif)
//  5. Licence (si --license-file ou --license-key est fourni)
//
//  Relançable sans risque : chaque étape ne fait que ce qui manque.
//
//  npm run db:init -- --admin-email prenom.nom@exemple.org --admin-first Prénom --admin-last NOM
//                     [--admin-password 'MotDePasse2026'] [--license-file chemin/licence.json]
//                     [--license-key ECGC-…] [--holidays 2026,2027] [--no-holidays]
// ════════════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Client } = require('pg');
const { runMigrations, dbConfig } = require('./migrate');

// ── Arguments ───────────────────────────────────────────────
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true;
  else { args[a.slice(2)] = next; i++; }
}
if (args.help) {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 16).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

// ── Référentiels de départ ──────────────────────────────────
// Types en usage à Espace Confiance (les RTT ne sont pas pratiqués)
const LEAVE_TYPES = [
  { code: 'CP',        label: 'Congés Payés',       color: '#3B82F6', max: 30,  levels: 2 },
  { code: 'FORMATION', label: 'Formation',          color: '#F59E0B', max: 10,  levels: 2 },
  { code: 'SPECIAL',   label: 'Événement Familial', color: '#10B981', max: 5,   levels: 1 },
  { code: 'MALADIE',   label: 'Arrêt Maladie',      color: '#EF4444', max: 90,  levels: 0 },
  { code: 'MATERNITE', label: 'Congé Maternité',    color: '#EC4899', max: 112, levels: 0 },
];

// Dimanche de Pâques (Meeus/Jones/Butcher) — même calcul que l'écran Jours fériés
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
const plus = (d, n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
function ivorianHolidays(year) {
  const e = easter(year);
  return [
    [`${year}-01-01`, "Jour de l'An"], [plus(e, 1), 'Lundi de Pâques'], [`${year}-05-01`, 'Fête du Travail'],
    [plus(e, 39), 'Ascension'], [plus(e, 50), 'Lundi de Pentecôte'], [`${year}-08-07`, "Fête de l'Indépendance"],
    [`${year}-08-15`, 'Assomption'], [`${year}-11-01`, 'Toussaint'], [`${year}-11-15`, 'Journée nationale de la Paix'],
    [`${year}-12-25`, 'Noël'],
  ];
}

// Mot de passe aléatoire : 16 caractères, au moins une lettre et un chiffre
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const body = Array.from(crypto.randomBytes(14), b => chars[b % chars.length]).join('');
  return body + 'a' + (crypto.randomBytes(1)[0] % 10);
}

const ok   = (m) => console.log(`✅ ${m}`);
const info = (m) => console.log(`ℹ️  ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);

async function main() {
  const cfg = dbConfig();
  console.log(`\n⟡ EcoGec — initialisation de la base « ${cfg.database} » sur ${cfg.host}:${cfg.port}\n`);

  const db = new Client(cfg);
  await db.connect();
  try {
    return await initialize(db, cfg);
  } finally {
    await db.end();
  }
}

async function initialize(db, cfg) {
  // ── 1. Schéma ─────────────────────────────────────────────
  const { rows: [t] } = await db.query(`SELECT to_regclass('public.users') IS NOT NULL AS exists`);
  if (!t.exists) {
    // Connexion dédiée : schema.sql (pg_dump) vide le search_path de la session
    const schema = new Client(cfg);
    await schema.connect();
    try {
      // Les méta-commandes psql (\restrict, \unrestrict…) ne passent pas par le driver
      const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').replace(/^\\.*$/gm, '');
      await schema.query(sql);
    } finally { await schema.end(); }
    ok('Schéma de référence créé (schema.sql)');
  } else {
    info('Schéma déjà présent');
  }

  // ── 2. Migrations ─────────────────────────────────────────
  const applied = await runMigrations(db, (m) => console.log(`   ${m}`));
  applied.length ? ok(`${applied.length} migration(s) appliquée(s)`) : info('Migrations déjà à jour');

  // ── 3. Référentiels ───────────────────────────────────────
  let created = 0;
  for (const lt of LEAVE_TYPES) {
    const r = await db.query(
      `INSERT INTO leave_types (code, label, color, max_days_per_year, requires_approval, requires_document, approval_levels)
       VALUES ($1,$2,$3,$4,$5,FALSE,$6) ON CONFLICT (code) DO NOTHING`,
      [lt.code, lt.label, lt.color, lt.max, lt.levels > 0, lt.levels]);
    created += r.rowCount;
  }
  created ? ok(`${created} type(s) de congé créé(s)`) : info('Types de congé déjà présents (inchangés)');

  if (!args['no-holidays']) {
    const now = new Date().getFullYear();
    const years = String(args.holidays || `${now},${now + 1}`).split(',').map(y => parseInt(y)).filter(Boolean);
    let h = 0;
    for (const y of years) for (const [date, label] of ivorianHolidays(y)) {
      h += (await db.query('INSERT INTO holidays (date, label) VALUES ($1,$2) ON CONFLICT (date) DO NOTHING', [date, label])).rowCount;
    }
    ok(`Jours fériés ${years.join(', ')} : ${h} ajouté(s) — les fêtes musulmanes (dates par décret) sont à saisir dans l'écran Jours fériés`);
  }

  // ── 4. Premier super administrateur ───────────────────────
  const { rows: admins } = await db.query(`SELECT email FROM users WHERE role='admin' AND is_active`);
  let adminPassword = null;
  if (admins.length) {
    info(`Super administrateur déjà présent (${admins.map(a => a.email).join(', ')}) : aucun compte créé`);
  } else {
    const email = String(args['admin-email'] || '').trim().toLowerCase();
    const first = String(args['admin-first'] || '').trim();
    const last  = String(args['admin-last'] || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !first || !last) {
      throw new Error('Aucun super administrateur : fournir --admin-email, --admin-first et --admin-last');
    }
    adminPassword = args['admin-password'] ? String(args['admin-password']) : generatePassword();
    if (adminPassword.length < 8 || !/[A-Za-z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)) {
      throw new Error('Mot de passe : 8 caractères minimum, dont au moins une lettre et un chiffre');
    }
    const hash = await bcrypt.hash(adminPassword, 12);
    const { rows: [u] } = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES ($1,$2,$3,$4,'admin')
       ON CONFLICT (email) DO UPDATE SET role='admin', is_active=TRUE, password_hash=EXCLUDED.password_hash
       RETURNING id`, [email, hash, first, last]);
    await db.query(`INSERT INTO audit_logs (action, entity_type, entity_id, new_value) VALUES ('INIT_ADMIN','user',$1,$2)`,
      [u.id, JSON.stringify({ email, source: 'npm run db:init' })]);
    ok(`Super administrateur créé : ${first} ${last} <${email}>`);
  }

  // ── 5. Licence ────────────────────────────────────────────
  let key = args['license-key'] ? String(args['license-key']).trim() : null;
  if (args['license-file']) key = JSON.parse(fs.readFileSync(path.resolve(String(args['license-file'])), 'utf8')).licenseKey;
  if (key) {
    const { validateLicenseKey } = require('../license/validator');
    const v = validateLicenseKey(key);
    if (!v.valid) throw new Error(`Licence refusée : ${v.error}${process.env.LICENSE_MASTER_KEY ? '' : ' (LICENSE_MASTER_KEY absente du .env)'}`);
    if (v.demo) throw new Error('Licence de démonstration refusée : utiliser la licence fournie par l’éditeur');
    const p = v.payload;
    try {
      await db.query('BEGIN');
      await db.query('UPDATE licenses SET is_active = FALSE');
      await db.query(
        `INSERT INTO licenses (license_key, client_name, client_email, issued_at, expires_at, max_users, features, is_active, activated_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW(),$8)
         ON CONFLICT (license_key) DO UPDATE SET is_active = TRUE, activated_at = NOW()`,
        [key, p.clientName, p.clientEmail, p.issuedAt, p.expiresAt, p.maxUsers, p.features, p.notes || '']);
      await db.query('COMMIT');
    } catch (err) { await db.query('ROLLBACK'); throw err; }
    ok(`Licence activée : ${p.clientName}, ${p.maxUsers} utilisateurs, jusqu'au ${p.expiresAt}`);
  } else {
    const { rows: [l] } = await db.query(`SELECT client_name, max_users, expires_at FROM licenses WHERE is_active LIMIT 1`);
    l ? info(`Licence active : ${l.client_name}, ${l.max_users} utilisateurs, jusqu'au ${l.expires_at.toISOString?.().slice(0, 10) || l.expires_at}`)
      : warn('Aucune licence active : l’API refusera les requêtes (402). Relancer avec --license-file ou --license-key.');
  }

  if (adminPassword && !args['admin-password']) {
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  Mot de passe du super administrateur (affiché UNE SEULE FOIS) :');
    console.log(`     ${adminPassword}`);
    console.log('  À conserver en lieu sûr ; le changer après la première connexion.');
    console.log('══════════════════════════════════════════════════════════════');
  }
  console.log('\nInitialisation terminée.\n');
}

main().catch(err => { console.error(`\n❌ ${err.message}\n`); process.exitCode = 1; });

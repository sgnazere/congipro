// ════════════════════════════════════════════════════════════
//  EcoGec — Migrations SQL
//  Applique dans l'ordre les fichiers migrations/NNN_*.sql
//  pas encore enregistrés dans schema_migrations.
//  Installation neuve : npm run db:init (schéma + migrations + données de départ)
// ════════════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'migrations');

const dbConfig = () => ({
  host:     process.env.DB_HOST || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'congipro',
  user:     process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Applique les migrations manquantes ; renvoie la liste des fichiers appliqués.
// Lève une erreur (après ROLLBACK de la migration fautive) si l'une échoue.
async function runMigrations(client, log = console.log) {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);

  const done  = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const files = fs.readdirSync(DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
  const applied = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`✅ ${file}`);
      applied.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`${file} : ${err.message}`);
    }
  }
  return applied;
}

async function main() {
  const client = new Client(dbConfig());
  await client.connect();
  try {
    const applied = await runMigrations(client);
    if (!applied.length) console.log('Base à jour : aucune migration à appliquer.');
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (require.main === module) main();
module.exports = { runMigrations, dbConfig };

// ════════════════════════════════════════════════════════════
//  EcoGec — Migrations SQL
//  Applique dans l'ordre les fichiers migrations/NNN_*.sql
//  pas encore enregistrés dans schema_migrations.
//  Installation neuve : psql -f schema.sql puis npm run db:migrate
// ════════════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, 'migrations');

async function main() {
  const client = new Client({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'congipro',
    user:     process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || '',
    ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);

  const done  = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const files = fs.readdirSync(DIR).filter(f => /^\d+_.*\.sql$/.test(f)).sort();

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✅ ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ ${file} : ${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  await client.end();
}

main();

// ════════════════════════════════════════════════════════════
//  EcoGec — Générateur de Licences v2 (HMAC-SHA256)
// ════════════════════════════════════════════════════════════

const crypto   = require('crypto');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

// Clé maîtresse lue uniquement depuis l'environnement : jamais dans le code source
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const MASTER_KEY = process.env.LICENSE_MASTER_KEY;
if (!MASTER_KEY) {
  console.error('❌ LICENSE_MASTER_KEY absente : renseignez-la dans backend/.env');
  process.exit(1);
}

// ── GÉNÉRER CODE LISIBLE ─────────────────────────────────────
function generateLicenseCode(clientName, expiresAt) {
  const hash = crypto
    .createHmac('sha256', MASTER_KEY)
    .update(`${clientName}:${expiresAt}:${Date.now()}`)
    .digest('hex')
    .toUpperCase();
  return `ECGC-${hash.slice(0,4)}-${hash.slice(4,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}`;
}

// ── SIGNER ───────────────────────────────────────────────────
function signPayload(payload) {
  const data = [
    payload.licenseCode,
    payload.clientName,
    payload.clientEmail,
    payload.issuedAt,
    payload.expiresAt,
    String(payload.maxUsers),
    [...payload.features].sort().join(','),
  ].join('|');
  return crypto.createHmac('sha256', MASTER_KEY).update(data).digest('hex');
}

// ── GÉNÉRER LICENCE COMPLÈTE ─────────────────────────────────
function generateLicense({ clientName, clientEmail, expiresAt, maxUsers = 50,
  features = ['basic','pdf','stats'], notes = '' }) {

  const issuedAt    = new Date().toISOString().slice(0, 10);
  const licenseCode = generateLicenseCode(clientName, expiresAt);

  const payload = {
    licenseCode,
    clientName,
    clientEmail,
    issuedAt,
    expiresAt,
    maxUsers,
    features,
    notes,
    version: '2.0',
  };

  // Signer
  payload.signature = signPayload(payload);

  // Encoder en base64url (pas de chiffrement — la signature suffit)
  const encoded     = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const finalKey    = `${licenseCode}.${encoded}`;

  return {
    licenseKey: finalKey,
    licenseCode,
    payload,
    summary: {
      client:   clientName,
      email:    clientEmail,
      issuedAt,
      expiresAt,
      maxUsers,
      features,
      daysValid: Math.ceil((new Date(expiresAt) - new Date(issuedAt)) / (1000*60*60*24)),
    }
  };
}

// ── AFFICHAGE ────────────────────────────────────────────────
function printLicense(result) {
  const { licenseKey, summary } = result;
  console.log('\n' + '═'.repeat(65));
  console.log('  ⟡  ECOGEC — LICENCE GÉNÉRÉE v2');
  console.log('═'.repeat(65));
  console.log(`  Client       : ${summary.client}`);
  console.log(`  Email        : ${summary.email}`);
  console.log(`  Émise le     : ${summary.issuedAt}`);
  console.log(`  Expire le    : ${summary.expiresAt}`);
  console.log(`  Durée        : ${summary.daysValid} jours`);
  console.log(`  Max users    : ${summary.maxUsers}`);
  console.log(`  Fonctions    : ${summary.features.join(', ')}`);
  console.log('─'.repeat(65));
  console.log('  CLÉ DE LICENCE :');
  console.log('');
  licenseKey.match(/.{1,60}/g).forEach(p => console.log(`  ${p}`));
  console.log('');
  console.log('═'.repeat(65));

  // SQL prêt à copier
  console.log('\n  📋 SQL pgAdmin :');
  console.log('─'.repeat(65));
  console.log(`UPDATE licenses SET`);
  console.log(`  license_key  = '${licenseKey}',`);
  console.log(`  client_name  = '${summary.client}',`);
  console.log(`  client_email = '${summary.email}',`);
  console.log(`  issued_at    = '${summary.issuedAt}',`);
  console.log(`  expires_at   = '${summary.expiresAt}',`);
  console.log(`  max_users    = ${summary.maxUsers},`);
  console.log(`  features     = ARRAY[${summary.features.map(f=>`'${f}'`).join(',')}],`);
  console.log(`  is_active    = TRUE,`);
  console.log(`  activated_at = NOW()`);
  console.log(`WHERE is_active = TRUE;`);
  console.log('─'.repeat(65) + '\n');
}

// ── SAUVEGARDER ──────────────────────────────────────────────
function saveLicense(result) {
  const dir = path.join(__dirname, '../../../licenses');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `license_${result.summary.client.replace(/\s+/g,'_')}_${result.summary.expiresAt}.json`);
  fs.writeFileSync(file, JSON.stringify({ generated: new Date().toISOString(), ...result.summary, licenseKey: result.licenseKey }, null, 2));
  console.log(`  💾 Sauvegardé : ${file}\n`);
}

// ── INTERACTIF ───────────────────────────────────────────────
async function run() {
  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(r => rl.question(q, r));

  console.log('\n⟡  EcoGec — Générateur de Licences v2\n');
  const clientName  = await ask('  Nom du client          : ');
  const clientEmail = await ask('  Email du client        : ');
  const duration    = await ask('  Durée en jours [365]   : ') || '365';
  const maxUsers    = await ask('  Max utilisateurs [50]  : ') || '50';
  const featInput   = await ask('  Features [basic,pdf,stats,admin] : ') || 'basic,pdf,stats,admin';
  const notes       = await ask('  Notes (optionnel)      : ');
  rl.close();

  const expDate = new Date();
  expDate.setDate(expDate.getDate() + parseInt(duration));

  const result = generateLicense({
    clientName:  clientName.trim(),
    clientEmail: clientEmail.trim(),
    expiresAt:   expDate.toISOString().slice(0, 10),
    maxUsers:    parseInt(maxUsers),
    features:    featInput.split(',').map(f => f.trim()),
    notes:       notes.trim(),
  });

  printLicense(result);
  saveLicense(result);
}

run().catch(console.error);
module.exports = { generateLicense, signPayload };
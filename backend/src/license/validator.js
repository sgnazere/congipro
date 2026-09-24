// ════════════════════════════════════════════════════════════
//  EcoGec — Validateur de Licences v2 (HMAC-SHA256)
// ════════════════════════════════════════════════════════════

const crypto = require('crypto');

const MASTER_KEY = process.env.LICENSE_MASTER_KEY; // [valeur par défaut retirée avant publication]

// ── VÉRIFICATION SIGNATURE ───────────────────────────────────
function verifySignature(payload, signature) {
  const data = [
    payload.licenseCode,
    payload.clientName,
    payload.clientEmail,
    payload.issuedAt,
    payload.expiresAt,
    String(payload.maxUsers),
    [...payload.features].sort().join(','),
  ].join('|');

  const expected = crypto
    .createHmac('sha256', MASTER_KEY)
    .update(data)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected.padEnd(64, '0')),
      Buffer.from(signature.padEnd(64, '0'))
    );
  } catch { return expected === signature; }
}

// ── VALIDATION CLÉE ──────────────────────────────────────────
function validateLicenseKey(licenseKey) {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { valid: false, error: 'Clé de licence manquante' };
  }

  // Clé DEMO — autorisée en développement
  if (licenseKey === 'DEMO-LICENSE-KEY-WILL-BE-REPLACED') {
    return {
      valid:      true,
      demo:       true,
      daysLeft:   365,
      warning:    true,
      warningMsg: '⚠️ Licence de démonstration — générez une vraie licence',
      payload: {
        clientName:  'Demo',
        clientEmail: 'demo@ecogec.fr',
        expiresAt:   new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        maxUsers:    50,
        features:    ['basic', 'pdf', 'stats', 'admin'],
      }
    };
  }

  // Séparer code et payload
  const dotIndex = licenseKey.indexOf('.');
  if (dotIndex === -1) {
    return { valid: false, error: 'Format de licence invalide' };
  }

  const licenseCode    = licenseKey.slice(0, dotIndex);
  const encodedPayload = licenseKey.slice(dotIndex + 1);

  // Vérifier format du code
  if (!/^ECGC-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/.test(licenseCode)) {
    return { valid: false, error: 'Code de licence malformé' };
  }

  // Décoder le payload (base64url → JSON)
  let payload;
  try {
    const json = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    payload    = JSON.parse(json);
  } catch {
    return { valid: false, error: 'Payload de licence illisible' };
  }

  // Vérifier cohérence
  if (payload.licenseCode !== licenseCode) {
    return { valid: false, error: 'Licence corrompue' };
  }

  // Vérifier signature
  if (!verifySignature(payload, payload.signature)) {
    return { valid: false, error: 'Signature invalide — licence falsifiée' };
  }

  // Vérifier expiration
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const expiresAt = new Date(payload.expiresAt); expiresAt.setHours(23, 59, 59, 999);

  if (today > expiresAt) {
    const daysExpired = Math.ceil((today - expiresAt) / (1000 * 60 * 60 * 24));
    return {
      valid:     false,
      expired:   true,
      error:     `Licence expirée depuis ${daysExpired} jour(s)`,
      expiredAt: payload.expiresAt,
      payload,
    };
  }

  const daysLeft = Math.ceil((expiresAt - today) / (1000 * 60 * 60 * 24));

  return {
    valid:      true,
    daysLeft,
    warning:    daysLeft <= 30,
    warningMsg: daysLeft <= 30 ? `⚠️ Licence expire dans ${daysLeft} jour(s)` : null,
    payload,
  };
}

// ── VÉRIFICATION DEPUIS DB ───────────────────────────────────
async function checkLicenseFromDB(db) {
  try {
    const license = await db.one(
      `SELECT * FROM licenses WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1`
    );
    if (!license) return { valid: false, error: 'Aucune licence active' };

    const result    = validateLicenseKey(license.license_key);
    result.license  = license;
    result.clientName = license.client_name;
    result.maxUsers = license.max_users;
    result.features = license.features;
    return result;
  } catch (err) {
    console.error('Erreur vérification licence DB:', err.message);
    return { valid: false, error: 'Erreur vérification licence' };
  }
}

// ── CACHE ────────────────────────────────────────────────────
let licenseCache = null;
let cacheTime    = null;
const CACHE_TTL  = 60 * 60 * 1000;

async function getCachedLicense(db) {
  const now = Date.now();
  if (licenseCache && cacheTime && (now - cacheTime) < CACHE_TTL) {
    return licenseCache;
  }
  licenseCache = await checkLicenseFromDB(db);
  cacheTime    = now;
  return licenseCache;
}

function invalidateCache() {
  licenseCache = null;
  cacheTime    = null;
}

module.exports = {
  validateLicenseKey,
  checkLicenseFromDB,
  getCachedLicense,
  invalidateCache,
};
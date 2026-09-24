// ════════════════════════════════════════════════════════════
//  EcoGec — Backend Express + PostgreSQL
//  JWT · RBAC · bcrypt · Audit Logs · Validation
// ════════════════════════════════════════════════════════════

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { getCachedLicense, checkLicenseFromDB, validateLicenseKey, invalidateCache } = require('./license/validator');

const fs        = require('fs');
const path      = require('path');
const crypto    = require('crypto');
const express   = require('express');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const { Pool, types } = require('pg');

// DATE (oid 1082) renvoyée telle quelle ('AAAA-MM-JJ') : sans cela pg crée un Date à minuit
// heure locale du serveur, ce qui décale les dates d'un jour hors fuseau UTC
types.setTypeParser(1082, v => v);
const bcrypt    = require('bcrypt');
const jwt       = require('jsonwebtoken');
const { z }     = require('zod');

// ════════════════════════════════════════════════════════════
//  CONFIG
// ════════════════════════════════════════════════════════════
const config = {
  port:          process.env.PORT || 3001,
  jwtSecret:     process.env.JWT_SECRET,
  jwtRefresh:    process.env.JWT_REFRESH,
  jwtExpiry:     '15m',
  jwtRefreshExp: '7d',
  bcryptRounds:  12,
  // Origines autorisées (séparées par des virgules) ; localhost toujours accepté hors production
  corsOrigins:   (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean),
  uploadDir:     process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'),
  maxUploadBytes: 3 * 1024 * 1024,
  db: {
    host:                   process.env.DB_HOST     || 'localhost',
    port:                   parseInt(process.env.DB_PORT) || 5432,
    database:               process.env.DB_NAME     || 'congipro',
    user:                   process.env.DB_USER     || 'postgres',
    password:               process.env.DB_PASS     || '',
    ssl:                    process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max:                    20,
    idleTimeoutMillis:      30000,
    connectionTimeoutMillis:2000,
  }
};

// ════════════════════════════════════════════════════════════
//  BASE DE DONNÉES
// ════════════════════════════════════════════════════════════
const pool = new Pool(config.db);
pool.on('connect', () => console.log('✅ PostgreSQL connecté'));
pool.on('error',   (err) => console.error('❌ DB pool error:', err));

const db = {
  query: (sql, params) => pool.query(sql, params),
  one:   async (sql, params) => { const r = await pool.query(sql, params); return r.rows[0] || null; },
  many:  async (sql, params) => { const r = await pool.query(sql, params); return r.rows; },
  run:   (sql, params) => pool.query(sql, params),
};

// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════

// Audit log
async function audit(userId, action, entityType, entityId, oldVal, newVal, req) {
  try {
    await db.run(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [userId, action, entityType, entityId,
       oldVal ? JSON.stringify(oldVal) : null,
       newVal ? JSON.stringify(newVal) : null,
       req?.ip, req?.headers?.['user-agent']]
    );
  } catch (e) { console.error('Audit error:', e.message); }
}

// JWT tokens
const makeTokens = (user) => ({
  accessToken:  jwt.sign({ id: user.id, role: user.role, email: user.email }, config.jwtSecret, { expiresIn: config.jwtExpiry }),
  refreshToken: jwt.sign({ id: user.id }, config.jwtRefresh, { expiresIn: config.jwtRefreshExp }),
});

// Calcul jours ouvrés (lundi→vendredi, hors fériés)
async function calcBusinessDays(start, end) {
  if (!start || !end) return 0;
  const holidays = await db.many('SELECT date FROM holidays WHERE date BETWEEN $1 AND $2', [start, end]);
  const hSet = new Set(holidays.map(h => h.date));
  let count = 0;
  // Calcul en UTC : 'AAAA-MM-JJ' est interprété à minuit UTC, getDay() local décalerait les jours
  const d = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  while (d <= e) {
    const dow = d.getUTCDay();
    const ds  = d.toISOString().slice(0, 10);
    if (dow >= 1 && dow <= 5 && !hSet.has(ds)) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// Crée le solde (user, type, année) s'il n'existe pas, à partir du plafond du type
async function ensureBalance(userId, leaveTypeId, year) {
  await db.run(
    `INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, pending_days)
     SELECT $1, lt.id, $3, lt.max_days_per_year, 0, 0 FROM leave_types lt WHERE lt.id=$2
     ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
    [userId, leaveTypeId, year]
  );
  return db.one('SELECT * FROM leave_balances WHERE user_id=$1 AND leave_type_id=$2 AND year=$3',
    [userId, leaveTypeId, year]);
}

// Notifie tous les utilisateurs actifs des rôles donnés
async function notifyRoles(roles, type, title, message, requestId) {
  await db.run(
    `INSERT INTO notifications (user_id, type, title, message, request_id)
     SELECT id, $2, $3, $4, $5 FROM users WHERE is_active=TRUE AND role = ANY($1::user_role[])`,
    [roles, type, title, message, requestId]
  );
}

async function notify(userId, type, title, message, requestId) {
  await db.run(
    'INSERT INTO notifications (user_id, type, title, message, request_id) VALUES ($1,$2,$3,$4,$5)',
    [userId, type, title, message, requestId]
  );
}

// Justificatifs : PDF / JPEG / PNG, 3 Mo max, stockés hors webroot
const DOC_TYPES = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

function saveDocument(doc) {
  const ext = DOC_TYPES[doc.type];
  if (!ext) throw Object.assign(new Error('Format de justificatif non accepté (PDF, JPG ou PNG)'), { status: 422 });
  const buf = Buffer.from(doc.data, 'base64');
  if (buf.length === 0 || buf.length > config.maxUploadBytes) {
    throw Object.assign(new Error('Justificatif vide ou trop volumineux (3 Mo maximum)'), { status: 422 });
  }
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = crypto.randomUUID() + ext;
  fs.writeFileSync(path.join(config.uploadDir, name), buf);
  return name;
}

// Qui peut agir sur une demande en attente ?
//  niveau 1 : le superviseur direct du demandeur (ou un admin)
//  niveau 2 : RH ou admin
//  personne ne valide sa propre demande
function canValidate(user, request, requesterManagerId) {
  if (request.status !== 'pending' || request.user_id === user.id) return false;
  if (user.role === 'admin') return true;
  if (request.current_level === 1) return requesterManagerId === user.id;
  if (request.current_level === 2) return user.role === 'rh';
  return false;
}

// ════════════════════════════════════════════════════════════
//  MIDDLEWARES
// ════════════════════════════════════════════════════════════

// Auth JWT
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token manquant' });
  try {
    req.user = jwt.verify(header.slice(7), config.jwtSecret);
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'TOKEN_EXPIRED' });
    res.status(401).json({ error: 'Token invalide' });
  }
};

// RBAC
const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
  next();
};

// Validation Zod
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Données invalides', details: result.error.flatten() });
  req.body = result.data;
  next();
};

// ════════════════════════════════════════════════════════════
//  APP SETUP — ordre obligatoire
// ════════════════════════════════════════════════════════════
const app = express();

// Derrière un reverse proxy (nginx, IIS…), nécessaire pour l'IP réelle et le rate limiting
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);

app.use(helmet());

// CORS — origines de FRONTEND_URL, plus localhost hors production
const isProd = process.env.NODE_ENV === 'production';
app.use(cors({
  origin: (origin, callback) => {
    if (!origin
      || config.corsOrigins.includes(origin)
      || (!isProd && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// ⚠️ express.json() DOIT être ici avant toutes les routes
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
// ════════════════════════════════════════════════════════════
//  MIDDLEWARE LICENCE — Vérifie la validité à chaque requête
// ════════════════════════════════════════════════════════════

// Routes exemptées de la vérification de licence
const LICENSE_EXEMPT = [
  '/health',
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/license/status',
  '/api/license/activate',
];

app.use(async (req, res, next) => {
  // Exempter certaines routes
  if (LICENSE_EXEMPT.some(path => req.path.startsWith(path))) {
    return next();
  }

  try {
    const result = await getCachedLicense(db);

    if (!result.valid) {
      return res.status(402).json({
        error:      'LICENSE_EXPIRED',
        message:    result.error || 'Licence invalide ou expirée',
        expiredAt:  result.expiredAt || null,
        expired:    result.expired || false,
      });
    }

    // Avertissement si expiration proche
    if (result.warning) {
      res.setHeader('X-License-Warning', result.warningMsg);
      res.setHeader('X-License-Days-Left', result.daysLeft);
    }

    // Injecter les infos licence dans la requête
    req.license = result;
    next();
  } catch (err) {
    console.error('Erreur middleware licence:', err);
    next(); // Ne pas bloquer en cas d'erreur technique
  }
});
// Rate limiting
// Limite générale large (une page = 2 à 4 appels) ; limite stricte sur la seule connexion,
// le rafraîchissement de token ne doit pas épuiser le quota de tentatives
app.use('/api/',           rateLimit({ windowMs: 15*60*1000, max: 1000, message: { error: 'Trop de requêtes' } }));
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 10,   message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' } }));

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════

const loginSchema = z.object({
  email:    z.string().email('Email invalide'),
  password: z.string().min(8, 'Minimum 8 caractères'),
});

// POST /api/auth/login
app.post('/api/auth/login', validate(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.one(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name,
              u.role, u.is_active, p.name AS project
       FROM users u
       LEFT JOIN projects p ON u.project_id = p.id
       WHERE u.email = $1`,
      [email.toLowerCase()]
    );
    if (!user || !user.is_active) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    const tokens = makeTokens(user);
    await db.run('UPDATE users SET refresh_token=$1, last_login=NOW() WHERE id=$2', [tokens.refreshToken, user.id]);
    await audit(user.id, 'LOGIN', 'user', user.id, null, { email }, req);
    delete user.password_hash;
    res.json({ user, ...tokens });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/refresh
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Refresh token manquant' });
    const decoded = jwt.verify(refreshToken, config.jwtRefresh);
    const user = await db.one('SELECT id, email, role FROM users WHERE id=$1 AND refresh_token=$2', [decoded.id, refreshToken]);
    if (!user) return res.status(401).json({ error: 'Session invalide ou expirée' });
    const tokens = makeTokens(user);
    await db.run('UPDATE users SET refresh_token=$1 WHERE id=$2', [tokens.refreshToken, user.id]);
    res.json(tokens);
  } catch { res.status(401).json({ error: 'Refresh token invalide' }); }
});

// POST /api/auth/logout
app.post('/api/auth/logout', authenticate, async (req, res) => {
  await db.run('UPDATE users SET refresh_token=NULL WHERE id=$1', [req.user.id]);
  await audit(req.user.id, 'LOGOUT', 'user', req.user.id, null, null, req);
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════
//  UTILISATEURS
// ════════════════════════════════════════════════════════════

// GET /api/users/me
app.get('/api/users/me', authenticate, async (req, res) => {
  try {
    const user = await db.one(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.hire_date, u.avatar_url,
              p.name AS project, p.code AS project_code,
              m.first_name||' '||m.last_name AS manager_name
       FROM users u
       LEFT JOIN projects p ON u.project_id = p.id
       LEFT JOIN users m    ON u.manager_id = m.id
       WHERE u.id=$1`,
      [req.user.id]
    );
    res.json(user);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/users
app.get('/api/users', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const users = await db.many(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
              u.is_active, u.hire_date, u.manager_id,
              p.name AS project, p.code AS project_code,
              m.first_name||' '||m.last_name AS manager_name
       FROM users u
       LEFT JOIN projects p ON u.project_id = p.id
       LEFT JOIN users m    ON u.manager_id = m.id
       ORDER BY u.last_name, u.first_name`
    );
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/users/team — collaborateurs directs et leurs absences à venir (planning équipe)
app.get('/api/users/team', authenticate, authorize('manager', 'director', 'rh', 'admin'), async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to   = req.query.to   || new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
    const members = await db.many(
      `SELECT u.id, u.first_name, u.last_name, u.role, u.email, p.name AS project
       FROM users u LEFT JOIN projects p ON u.project_id = p.id
       WHERE u.manager_id=$1 AND u.is_active=TRUE ORDER BY u.last_name, u.first_name`,
      [req.user.id]
    );
    const leaves = await db.many(
      `SELECT lr.id, lr.user_id, lr.start_date, lr.end_date, lr.days_count, lr.status,
              lt.label AS type_label, lt.color
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN users u        ON lr.user_id = u.id
       WHERE u.manager_id=$1 AND lr.status IN ('pending','approved')
         AND NOT (lr.end_date < $2 OR lr.start_date > $3)
       ORDER BY lr.start_date`,
      [req.user.id, from, to]
    );
    res.json({ from, to, members, leaves });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/users
const createUserSchema = z.object({
  email:      z.string().email(),
  password:   z.string().min(8),
  first_name: z.string().min(1).max(100),
  last_name:  z.string().min(1).max(100),
  role:       z.enum(['employee', 'manager', 'rh', 'director', 'admin']),
  project_id: z.string().uuid().optional(),
  manager_id: z.string().uuid().optional(),
  hire_date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).superRefine((data, ctx) => {
  if (['employee', 'manager'].includes(data.role) && !data.manager_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['manager_id'], message: 'Un superviseur est obligatoire pour ce rôle' });
  }
});

const managerIdSchema = z.object({
  manager_id: z.string().uuid(),
});

const ensureManager = async (managerId) => {
  const manager = await db.one(
    `SELECT id FROM users
     WHERE id=$1 AND is_active=TRUE AND role IN ('manager', 'rh', 'admin', 'director')`,
    [managerId]
  );
  return manager;
};

app.post('/api/users', authenticate, authorize('rh', 'admin'), validate(createUserSchema), async (req, res) => {
  try {
    const { password, ...data } = req.body;
    if (data.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Seul un super administrateur peut créer un compte administrateur' });
    }
    if (data.manager_id && !(await ensureManager(data.manager_id))) {
      return res.status(400).json({ error: 'Le superviseur sélectionné est invalide ou inactif' });
    }
    if (req.license?.maxUsers) {
      const { count } = await db.one('SELECT COUNT(*) AS count FROM users WHERE is_active=TRUE');
      if (parseInt(count) >= req.license.maxUsers) {
        return res.status(402).json({ error: `Limite de licence atteinte (${req.license.maxUsers} utilisateurs actifs)` });
      }
    }
    const hash = await bcrypt.hash(password, config.bcryptRounds);
    const user = await db.one(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, project_id, manager_id, hire_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date, CURRENT_DATE)) RETURNING id, email, first_name, last_name, role`,
      [data.email.toLowerCase(), hash, data.first_name, data.last_name,
       data.role, data.project_id || null, data.manager_id || null, data.hire_date || null]
    );
    // Soldes de l'année en cours pour tous les types actifs
    await db.run(
      `INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, pending_days)
       SELECT $1, id, EXTRACT(YEAR FROM CURRENT_DATE)::int, max_days_per_year, 0, 0
       FROM leave_types WHERE is_active=TRUE
       ON CONFLICT (user_id, leave_type_id, year) DO NOTHING`,
      [user.id]
    );
    await audit(req.user.id, 'CREATE_USER', 'user', user.id, null, user, req);
    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/users/:id
app.patch('/api/users/:id', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    if (req.body.manager_id !== undefined) {
      const result = managerIdSchema.safeParse({ manager_id: req.body.manager_id });
      if (!result.success) return res.status(400).json({ error: 'Superviseur invalide' });
      if (!(await ensureManager(result.data.manager_id))) {
        return res.status(400).json({ error: 'Le superviseur sélectionné est invalide ou inactif' });
      }
      if (result.data.manager_id === req.params.id) {
        return res.status(400).json({ error: 'Un utilisateur ne peut pas être son propre superviseur' });
      }
      const user = await db.one(
        'UPDATE users SET manager_id=$1, updated_at=NOW() WHERE id=$2 RETURNING id, manager_id',
        [result.data.manager_id, req.params.id]
      );
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
      await audit(req.user.id, 'ASSIGN_MANAGER', 'user', user.id, null, user, req);
      return res.json(user);
    }
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'Statut invalide' });
    if (req.params.id === req.user.id && !is_active) {
      return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
    }
    const target = await db.one('SELECT role FROM users WHERE id=$1', [req.params.id]);
    if (target?.role === 'admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Seul un super administrateur peut modifier ce compte' });
    }
    const user = await db.one(
      // Un compte désactivé perd aussi sa session
      `UPDATE users SET is_active=$1, refresh_token=CASE WHEN $1 THEN refresh_token END, updated_at=NOW()
       WHERE id=$2 RETURNING id, email, is_active`,
      [is_active, req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    await audit(req.user.id, 'UPDATE_USER', 'user', user.id, null, user, req);
    res.json(user);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// PATCH /api/users/:id/assign-project
app.patch('/api/users/:id/assign-project', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const { project_id } = req.body;
    const user = await db.one(
      'UPDATE users SET project_id=$1, updated_at=NOW() WHERE id=$2 RETURNING id, first_name, last_name, project_id',
      [project_id || null, req.params.id]
    );
    res.json(user);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  PROJETS
// ════════════════════════════════════════════════════════════

// GET /api/projects
app.get('/api/projects', authenticate, async (req, res) => {
  try {
    const projects = await db.many(
      `SELECT p.*,
              u.first_name||' '||u.last_name AS manager_name,
              COUNT(emp.id) AS employee_count
       FROM projects p
       LEFT JOIN users u   ON p.manager_id = u.id
       LEFT JOIN users emp ON emp.project_id = p.id
       WHERE p.is_active = TRUE
       GROUP BY p.id, u.first_name, u.last_name
       ORDER BY p.name`
    );
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/projects
app.post('/api/projects', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const { name, code, description, manager_id, start_date, end_date } = req.body;
    if (!name || !code) return res.status(400).json({ error: 'Nom et code obligatoires' });
    const project = await db.one(
      `INSERT INTO projects (name, code, description, manager_id, start_date, end_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, code.toUpperCase(), description || null, manager_id || null, start_date || null, end_date || null]
    );
    await audit(req.user.id, 'CREATE_PROJECT', 'project', project.id, null, project, req);
    res.status(201).json(project);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce code projet existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/projects/:id
app.patch('/api/projects/:id', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const { name, description, manager_id, start_date, end_date, is_active } = req.body;
    const project = await db.one(
      `UPDATE projects SET name=$1, description=$2, manager_id=$3,
       start_date=$4, end_date=$5, is_active=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [name, description, manager_id || null, start_date || null, end_date || null, is_active, req.params.id]
    );
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });
    await audit(req.user.id, 'UPDATE_PROJECT', 'project', project.id, null, project, req);
    res.json(project);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/projects/:id/members
app.get('/api/projects/:id/members', authenticate, async (req, res) => {
  try {
    const members = await db.many(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.is_active, u.hire_date
       FROM users u WHERE u.project_id = $1 ORDER BY u.last_name`,
      [req.params.id]
    );
    res.json(members);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  SOLDES
// ════════════════════════════════════════════════════════════

// GET /api/balances/me
app.get('/api/balances/me', authenticate, async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const balances = await db.many(
      `SELECT lb.id, lb.total_days, lb.used_days, lb.pending_days, lb.carried_days, lb.adjusted_days, lb.adjustment_note,
              lt.label, lt.color, lt.code, lt.max_days_per_year
       FROM leave_balances lb
       JOIN leave_types lt ON lb.leave_type_id = lt.id
       WHERE lb.user_id=$1 AND lb.year=$2 ORDER BY lt.label`,
      [req.user.id, year]
    );
    res.json(balances);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  DEMANDES DE CONGÉS
// ════════════════════════════════════════════════════════════

// Colonnes communes aux listes de demandes
const REQUEST_SELECT = `
  SELECT lr.id, lr.user_id, lr.start_date, lr.end_date, lr.days_count, lr.reason,
         lr.status, lr.current_level, lr.is_emergency, lr.rejection_note, lr.created_at,
         (lr.document_url IS NOT NULL) AS has_document,
         lt.label AS type_label, lt.color, lt.code AS type_code, lt.approval_levels,
         u.first_name||' '||u.last_name AS user_name,
         m.first_name||' '||m.last_name AS manager_name,
         p.name AS department
  FROM leave_requests lr
  JOIN leave_types lt  ON lr.leave_type_id = lt.id
  JOIN users u         ON lr.user_id = u.id
  LEFT JOIN users m    ON u.manager_id = m.id
  LEFT JOIN projects p ON u.project_id = p.id`;

// GET /api/requests — demandes visibles (calendrier, tableaux de bord)
//  employee : les siennes · manager : les siennes + son équipe directe · rh/admin/director : toutes
app.get('/api/requests', authenticate, async (req, res) => {
  try {
    const { status, from, to } = req.query;
    let sql = REQUEST_SELECT + ' WHERE 1=1';
    const params = [];
    let pi = 1;

    if (req.user.role === 'employee') {
      sql += ` AND lr.user_id=$${pi++}`; params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      sql += ` AND (lr.user_id=$${pi} OR u.manager_id=$${pi})`; pi++; params.push(req.user.id);
    }

    if (status) { sql += ` AND lr.status=$${pi++}`; params.push(status); }
    if (from)   { sql += ` AND lr.end_date>=$${pi++}`; params.push(from); }
    if (to)     { sql += ` AND lr.start_date<=$${pi++}`; params.push(to); }

    sql += ' ORDER BY lr.created_at DESC';
    res.json(await db.many(sql, params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/requests/to-validate — uniquement les demandes sur lesquelles l'utilisateur peut agir
app.get('/api/requests/to-validate', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'employee') return res.json([]);
    const rows = await db.many(
      REQUEST_SELECT.replace('FROM leave_requests lr', `,
         (SELECT b.total_days - b.used_days - b.pending_days FROM leave_balances b
          WHERE b.user_id = lr.user_id AND b.leave_type_id = lr.leave_type_id
            AND b.year = EXTRACT(YEAR FROM lr.start_date)) AS balance_after
       FROM leave_requests lr`) + `
      WHERE lr.status='pending' AND lr.user_id <> $1
        AND ( $2 = 'admin'
           OR (lr.current_level=1 AND u.manager_id=$1)
           OR (lr.current_level=2 AND $2 = 'rh') )
      ORDER BY lr.is_emergency DESC, lr.start_date`,
      [req.user.id, req.user.role]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/requests/all — historique complet de l'utilisateur connecté
app.get('/api/requests/all', authenticate, async (req, res) => {
  try {
    const rows = await db.many(
      REQUEST_SELECT.replace('FROM leave_requests lr', `,
         (SELECT d.first_name||' '||d.last_name FROM users d
          WHERE d.role='director' AND d.is_active=TRUE ORDER BY d.created_at LIMIT 1) AS director_name
       FROM leave_requests lr`) + `
      WHERE lr.user_id=$1
      ORDER BY lr.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/requests/:id/steps — historique du circuit de validation
app.get('/api/requests/:id/steps', authenticate, async (req, res) => {
  try {
    const request = await db.one(
      `SELECT lr.user_id, u.manager_id FROM leave_requests lr JOIN users u ON lr.user_id=u.id WHERE lr.id=$1`,
      [req.params.id]
    );
    if (!request) return res.status(404).json({ error: 'Demande introuvable' });
    const allowed = request.user_id === req.user.id || request.manager_id === req.user.id
      || ['rh', 'admin', 'director'].includes(req.user.role);
    if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    res.json(await db.many(
      `SELECT s.level, s.action, s.comment, s.acted_at, u.first_name||' '||u.last_name AS approver_name, u.role
       FROM approval_steps s JOIN users u ON s.approver_id=u.id
       WHERE s.request_id=$1 ORDER BY s.acted_at`,
      [req.params.id]
    ));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/requests/:id/document — justificatif (demandeur, valideurs, RH, direction)
app.get('/api/requests/:id/document', authenticate, async (req, res) => {
  try {
    const request = await db.one(
      `SELECT lr.user_id, lr.document_url, u.manager_id
       FROM leave_requests lr JOIN users u ON lr.user_id=u.id WHERE lr.id=$1`,
      [req.params.id]
    );
    if (!request?.document_url) return res.status(404).json({ error: 'Aucun justificatif' });
    const allowed = request.user_id === req.user.id || request.manager_id === req.user.id
      || ['rh', 'admin', 'director'].includes(req.user.role);
    if (!allowed) return res.status(403).json({ error: 'Accès refusé' });
    const file = path.join(config.uploadDir, path.basename(request.document_url));
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fichier introuvable' });
    res.sendFile(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/requests
const requestSchema = z.object({
  leave_type_id: z.string().uuid(),
  start_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:        z.string().max(1000).optional(),
  is_emergency:  z.boolean().default(false),
  document:      z.object({
    name: z.string().max(255),
    type: z.string(),
    data: z.string().max(5 * 1024 * 1024),
  }).optional(),
}).refine(d => new Date(d.end_date) >= new Date(d.start_date), {
  message: 'La date de fin doit être après la date de début',
});

app.post('/api/requests', authenticate, validate(requestSchema), async (req, res) => {
  try {
    const { leave_type_id, start_date, end_date, reason, is_emergency, document } = req.body;
    if (start_date.slice(0, 4) !== end_date.slice(0, 4)) {
      return res.status(422).json({ error: 'Une demande ne peut pas chevaucher deux années : faites deux demandes' });
    }
    const type = await db.one('SELECT * FROM leave_types WHERE id=$1 AND is_active=TRUE', [leave_type_id]);
    if (!type) return res.status(422).json({ error: 'Type de congé invalide ou inactif' });
    if (type.requires_document && !document) {
      return res.status(422).json({ error: `Un justificatif est obligatoire pour « ${type.label} »` });
    }

    const year = parseInt(start_date.slice(0, 4));
    const days = await calcBusinessDays(start_date, end_date);
    if (days === 0) return res.status(422).json({ error: 'Aucun jour ouvré dans la période sélectionnée' });

    const balance   = await ensureBalance(req.user.id, leave_type_id, year);
    const available = parseFloat(balance.total_days) - parseFloat(balance.used_days) - parseFloat(balance.pending_days);
    if (available < days) {
      return res.status(422).json({ error: `Solde insuffisant : ${available} j disponible(s), ${days} j demandé(s)`, available, requested: days });
    }

    const autoApprove = !type.requires_approval || type.approval_levels === 0;
    const user = await db.one('SELECT manager_id, first_name, last_name FROM users WHERE id=$1', [req.user.id]);
    if (!autoApprove && !user?.manager_id) {
      return res.status(422).json({ error: 'Aucun superviseur n’est affecté à votre compte. Contactez les RH.' });
    }

    const overlap = await db.one(
      `SELECT id FROM leave_requests WHERE user_id=$1
       AND status NOT IN ('rejected','cancelled')
       AND NOT (end_date < $2 OR start_date > $3)`,
      [req.user.id, start_date, end_date]
    );
    if (overlap) return res.status(409).json({ error: 'Cette période chevauche une demande existante' });

    const documentName = document ? saveDocument(document) : null;

    let request = await db.one(
      `INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, days_count, reason, is_emergency, document_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, leave_type_id, start_date, end_date, days, reason || null, is_emergency, documentName]
    );
    await db.run('UPDATE leave_balances SET pending_days=pending_days+$1 WHERE id=$2', [days, balance.id]);

    const who = `${user.first_name} ${user.last_name}`;
    if (autoApprove) {
      // Passage pending → approved : le trigger update_balance_on_approval bascule les jours en "utilisés"
      request = await db.one(
        `UPDATE leave_requests SET status='approved', updated_at=NOW() WHERE id=$1 RETURNING *`, [request.id]
      );
      await notify(req.user.id, 'request_approved', '✓ Absence enregistrée',
        `Votre ${type.label.toLowerCase()} de ${days} jour(s) est enregistrée (validation automatique).`, request.id);
      if (user.manager_id) {
        await notify(user.manager_id, 'system', 'Absence déclarée',
          `${who} a déclaré ${days} jour(s) de ${type.label.toLowerCase()}.`, request.id);
      }
    } else {
      await notify(user.manager_id, 'request_submitted', 'Nouvelle demande de congé',
        `${who} a soumis une demande de ${days} jour(s)${is_emergency ? ' (urgence)' : ''}`, request.id);
    }

    await audit(req.user.id, 'CREATE_REQUEST', 'leave_request', request.id, null, request, req);
    res.status(201).json({ ...request, auto_approved: autoApprove });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PATCH /api/requests/:id/approve
app.patch('/api/requests/:id/approve', authenticate, authorize('manager', 'rh', 'admin', 'director'), async (req, res) => {
  try {
    const { action, comment } = req.body;
    if (!['approved', 'rejected'].includes(action)) return res.status(400).json({ error: 'Action invalide' });
    if (action === 'rejected' && !comment?.trim()) return res.status(400).json({ error: 'Le motif du rejet est obligatoire' });

    const request = await db.one(
      `SELECT lr.*, lt.approval_levels, u.manager_id AS requester_manager_id
       FROM leave_requests lr
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       JOIN users u        ON lr.user_id = u.id
       WHERE lr.id=$1`,
      [req.params.id]
    );
    if (!request) return res.status(404).json({ error: 'Demande introuvable' });
    if (request.status !== 'pending') return res.status(409).json({ error: 'Demande déjà traitée' });
    if (!canValidate(req.user, request, request.requester_manager_id)) {
      return res.status(403).json({ error: 'Vous n’êtes pas le valideur attendu pour cette étape' });
    }

    await db.run(
      `INSERT INTO approval_steps (request_id, approver_id, level, action, comment, acted_at)
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [request.id, req.user.id, request.current_level, action, comment || null]
    );

    let newStatus = 'pending';
    let newLevel  = request.current_level;
    if (action === 'rejected')                                  newStatus = 'rejected';
    else if (request.current_level < request.approval_levels)   newLevel  = request.current_level + 1;
    else                                                        newStatus = 'approved';

    const updated = await db.one(
      `UPDATE leave_requests SET status=$1, current_level=$2, rejection_note=$3, updated_at=NOW()
       WHERE id=$4 AND status='pending' RETURNING *`,
      [newStatus, newLevel, action === 'rejected' ? comment : null, request.id]
    );
    if (!updated) return res.status(409).json({ error: 'Demande déjà traitée' });

    if (newStatus === 'approved') {
      await notify(request.user_id, 'request_approved', '✓ Demande approuvée',
        `Votre demande du ${request.start_date.split('-').reverse().join('/')} (${parseFloat(request.days_count)} j) a été approuvée.`
        + (comment ? ` Commentaire : ${comment}` : ''), request.id);
    } else if (newStatus === 'rejected') {
      await notify(request.user_id, 'request_rejected', 'Demande rejetée', `Refusée. Motif : ${comment}`, request.id);
    } else {
      await notify(request.user_id, 'system', 'Demande validée par votre superviseur',
        'Votre demande est maintenant en attente de validation RH.', request.id);
      await notifyRoles(['rh'], 'request_submitted', 'Validation RH requise',
        'Une demande validée par le superviseur attend votre validation RH.', request.id);
    }

    await audit(req.user.id, action.toUpperCase() + '_REQUEST', 'leave_request', request.id, request, updated, req);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/requests/:id — annulation par le demandeur (tant que non traitée)
app.delete('/api/requests/:id', authenticate, async (req, res) => {
  try {
    const request = await db.one('SELECT * FROM leave_requests WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!request) return res.status(404).json({ error: 'Demande introuvable' });
    if (!['pending', 'draft'].includes(request.status)) return res.status(409).json({ error: 'Impossible d\'annuler une demande traitée' });
    await db.run(`UPDATE leave_requests SET status='cancelled', updated_at=NOW() WHERE id=$1`, [request.id]);
    await audit(req.user.id, 'CANCEL_REQUEST', 'leave_request', request.id, request, { status: 'cancelled' }, req);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  TYPES DE CONGÉS
// ════════════════════════════════════════════════════════════

app.get('/api/leave-types', authenticate, async (req, res) => {
  try {
    res.json(await db.many('SELECT * FROM leave_types WHERE is_active=TRUE ORDER BY label'));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/leave-types', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const { code, label, color, max_days_per_year, requires_approval, requires_document, approval_levels } = req.body;
    if (!code?.trim() || !label?.trim()) return res.status(400).json({ error: 'Code et libellé obligatoires' });
    const levels = [0, 1, 2].includes(approval_levels) ? approval_levels : 1;
    const t = await db.one(
      `INSERT INTO leave_types (code, label, color, max_days_per_year, requires_approval, requires_document, approval_levels)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      // 0 niveau ⇔ pas de validation : les deux champs restent cohérents
      [code.trim().toUpperCase(), label.trim(), color || '#3B82F6', max_days_per_year || 25,
       levels > 0 && (requires_approval ?? true), requires_document ?? false, levels]
    );
    await audit(req.user.id, 'CREATE_LEAVE_TYPE', 'leave_type', t.id, null, t, req);
    res.status(201).json(t);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce code existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.patch('/api/leave-types/:id', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') return res.status(400).json({ error: 'Statut invalide' });
    const t = await db.one('UPDATE leave_types SET is_active=$1 WHERE id=$2 RETURNING *', [is_active, req.params.id]);
    if (!t) return res.status(404).json({ error: 'Type introuvable' });
    await audit(req.user.id, 'UPDATE_LEAVE_TYPE', 'leave_type', t.id, null, { is_active }, req);
    res.json(t);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  JOURS FÉRIÉS
// ════════════════════════════════════════════════════════════

app.get('/api/holidays', authenticate, async (req, res) => {
  try {
    const { year } = req.query;
    const rows = year
      ? await db.many('SELECT * FROM holidays WHERE EXTRACT(YEAR FROM date)=$1 ORDER BY date', [year])
      : await db.many('SELECT * FROM holidays ORDER BY date');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.post('/api/holidays', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const { date, label } = req.body;
    if (!date || !label) return res.status(400).json({ error: 'Date et libellé requis' });
    const h = await db.one(
      'INSERT INTO holidays (date, label, created_by) VALUES ($1,$2,$3) RETURNING *',
      [date, label.trim(), req.user.id]
    );
    await audit(req.user.id, 'CREATE_HOLIDAY', 'holiday', h.id, null, h, req);
    res.status(201).json(h);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce jour férié existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.delete('/api/holidays/:id', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    const h = await db.one('DELETE FROM holidays WHERE id=$1 RETURNING *', [req.params.id]);
    if (!h) return res.status(404).json({ error: 'Jour férié introuvable' });
    await audit(req.user.id, 'DELETE_HOLIDAY', 'holiday', h.id, h, null, req);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  STATISTIQUES
// ════════════════════════════════════════════════════════════

app.get('/api/stats', authenticate, authorize('rh', 'admin', 'director'), async (req, res) => {
  try {
    const year = req.query.year || new Date().getFullYear();
    const [byType, byStatus, byMonth, topUsers] = await Promise.all([
      db.many(`SELECT lt.label, lt.color, COUNT(*) AS count, SUM(lr.days_count) AS total_days
               FROM leave_requests lr JOIN leave_types lt ON lr.leave_type_id=lt.id
               WHERE lr.status='approved' AND EXTRACT(YEAR FROM lr.start_date)=$1
               GROUP BY lt.label, lt.color ORDER BY total_days DESC`, [year]),
      db.many(`SELECT status, COUNT(*) AS count FROM leave_requests
               WHERE EXTRACT(YEAR FROM start_date)=$1 GROUP BY status`, [year]),
      db.many(`SELECT EXTRACT(MONTH FROM start_date) AS month, COUNT(*) AS count
               FROM leave_requests WHERE status='approved' AND EXTRACT(YEAR FROM start_date)=$1
               GROUP BY month ORDER BY month`, [year]),
      db.many(`SELECT u.first_name||' '||u.last_name AS name, SUM(lr.days_count) AS total_days
               FROM leave_requests lr JOIN users u ON lr.user_id=u.id
               WHERE lr.status='approved' AND EXTRACT(YEAR FROM lr.start_date)=$1
               GROUP BY u.id, name ORDER BY total_days DESC LIMIT 10`, [year]),
    ]);
    res.json({ year, byType, byStatus, byMonth, topUsers });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// GET /api/stats/export?year= — toutes les demandes de l'année en CSV (ouvrable dans Excel)
app.get('/api/stats/export', authenticate, authorize('rh', 'admin', 'director'), async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const rows = await db.many(
      `SELECT u.last_name, u.first_name, u.email, p.name AS project, lt.label AS type,
              lr.start_date, lr.end_date, lr.days_count, lr.status, lr.is_emergency,
              lr.reason, lr.rejection_note, lr.created_at
       FROM leave_requests lr
       JOIN users u        ON lr.user_id = u.id
       JOIN leave_types lt ON lr.leave_type_id = lt.id
       LEFT JOIN projects p ON u.project_id = p.id
       WHERE EXTRACT(YEAR FROM lr.start_date)=$1
       ORDER BY lr.start_date, u.last_name`,
      [year]
    );
    const STATUS = { pending: 'En attente', approved: 'Approuvée', rejected: 'Rejetée', cancelled: 'Annulée', draft: 'Brouillon' };
    const d   = (v) => v ? new Date(v).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '';
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Nom', 'Prénom', 'Email', 'Projet', 'Type', 'Début', 'Fin', 'Jours ouvrés', 'Statut', 'Urgence', 'Motif', 'Motif de rejet', 'Soumise le'];
    const lines = rows.map(r => [
      r.last_name, r.first_name, r.email, r.project, r.type, d(r.start_date), d(r.end_date),
      String(r.days_count).replace('.', ','), STATUS[r.status] || r.status, r.is_emergency ? 'Oui' : 'Non',
      r.reason, r.rejection_note, d(r.created_at),
    ].map(esc).join(';'));
    await audit(req.user.id, 'EXPORT_STATS', 'leave_request', null, null, { year, rows: rows.length }, req);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ecogec_absences_${year}.csv"`);
    // BOM + « ; » : Excel en français ouvre le fichier directement avec les accents
    res.send('﻿' + [header.map(esc).join(';'), ...lines].join('\r\n'));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════════════════════════

app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    res.json(await db.many(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    ));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.get('/api/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const r = await db.one('SELECT COUNT(*) AS count FROM notifications WHERE user_id=$1 AND is_read=FALSE', [req.user.id]);
    res.json({ count: parseInt(r.count) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.patch('/api/notifications/read-all', authenticate, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read=TRUE WHERE user_id=$1 AND is_read=FALSE', [req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

app.patch('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await db.run('UPDATE notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  AUDIT LOGS
// ════════════════════════════════════════════════════════════

app.get('/api/audit-logs', authenticate, authorize('rh', 'admin'), async (req, res) => {
  try {
    res.json(await db.many(
      // Pas d'old_value/new_value ni de user_agent : l'écran n'en a pas besoin
      `SELECT al.id, al.user_id, al.action, al.entity_type, al.entity_id, al.ip_address, al.created_at,
              u.first_name||' '||u.last_name AS user_name
       FROM audit_logs al LEFT JOIN users u ON al.user_id=u.id
       ORDER BY al.created_at DESC LIMIT 500`
    ));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ════════════════════════════════════════════════════════════
//  ADMIN — Super Admin uniquement
// ════════════════════════════════════════════════════════════

app.get('/api/admin/db-stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [counts, pgVersion, dbSize, tables, queryStats, activeConn] = await Promise.all([
      db.one(`SELECT
        (SELECT COUNT(*) FROM users)          AS users_count,
        (SELECT COUNT(*) FROM leave_requests) AS requests_count,
        (SELECT COUNT(*) FROM leave_types)    AS types_count,
        (SELECT COUNT(*) FROM audit_logs)     AS audit_count`),
      db.one('SELECT version() AS version'),
      db.one(`SELECT pg_size_pretty(pg_database_size($1)) AS size`, [process.env.DB_NAME || 'congipro']),
      db.many(`SELECT relname AS table_name, n_live_tup AS row_count,
               pg_size_pretty(pg_total_relation_size(relid)) AS size
               FROM pg_stat_user_tables ORDER BY n_live_tup DESC`),
      db.many(`SELECT relname AS table_name, seq_scan, idx_scan, n_live_tup
               FROM pg_stat_user_tables ORDER BY seq_scan DESC LIMIT 8`),
      db.one('SELECT COUNT(*) AS count FROM pg_stat_activity'),
    ]);
    const balance_anomalies = await db.many(
      `SELECT u.first_name||' '||u.last_name AS user_name, lt.label AS type_label, v.year, v.anomalie,
              v.total_days, v.used_days, v.pending_days, v.adjusted_days, v.approved_days, v.pending_calc
       FROM v_balance_check v JOIN users u ON u.id=v.user_id JOIN leave_types lt ON lt.id=v.leave_type_id
       ORDER BY u.last_name, v.year`
    );
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    res.json({
      ...counts,
      pg_version:         pgVersion.version.split(' ').slice(0, 2).join(' '),
      db_size:            dbSize.size,
      db_name:            process.env.DB_NAME || 'congipro',
      db_host:            process.env.DB_HOST || 'localhost',
      db_port:            process.env.DB_PORT || '5432',
      node_version:       process.version,
      env:                process.env.NODE_ENV || 'development',
      uptime:             `${h}h ${m}min`,
      tables,
      query_stats:        queryStats,
      active_connections: activeConn.count,
      balance_anomalies,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.post('/api/admin/maintenance', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { action } = req.body;
    let message = '';
    switch (action) {
      case 'clean_tokens':
        await db.run(`UPDATE users SET refresh_token=NULL WHERE refresh_token IS NOT NULL AND is_active=FALSE`);
        message = 'Tokens expirés nettoyés.'; break;
      case 'vacuum':
        await db.run('VACUUM ANALYZE');
        message = 'VACUUM ANALYZE exécuté.'; break;
      case 'clean_notifications':
        const rn = await db.one(`WITH d AS (DELETE FROM notifications WHERE is_read=TRUE AND created_at < NOW() - INTERVAL '30 days' RETURNING 1) SELECT COUNT(*) AS count FROM d`);
        message = `${rn?.count || 0} notification(s) supprimée(s).`; break;
      case 'archive_logs':
        const ra = await db.one(`WITH d AS (DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days' RETURNING 1) SELECT COUNT(*) AS count FROM d`);
        message = `${ra?.count || 0} log(s) archivé(s).`; break;
      case 'generate_balances':
        // Année demandée (par défaut l'année suivante) ; les soldes existants ne sont pas modifiés
        const target = parseInt(req.body.year) || new Date().getFullYear() + 1;
        const rg = await db.one(
          `WITH ins AS (
             INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, pending_days)
             SELECT u.id, lt.id, $1, lt.max_days_per_year, 0, 0
             FROM users u CROSS JOIN leave_types lt
             WHERE u.is_active=TRUE AND lt.is_active=TRUE
             ON CONFLICT (user_id, leave_type_id, year) DO NOTHING RETURNING 1)
           SELECT COUNT(*) AS count FROM ins`,
          [target]
        );
        message = `${rg.count} solde(s) créé(s) pour ${target} (les soldes existants sont conservés).`; break;
      case 'recompute_balances':
        const rb = await db.one('SELECT recompute_balances() AS count');
        message = `${rb.count} solde(s) recalculé(s) à partir des demandes (ajustements de reprise conservés).`; break;
      case 'revoke_all_sessions':
        await db.run(`UPDATE users SET refresh_token=NULL`);
        message = 'Toutes les sessions révoquées.'; break;
      default:
        return res.status(400).json({ error: 'Action inconnue' });
    }
    await audit(req.user.id, 'ADMIN_MAINTENANCE', 'system', null, null, { action }, req);
    res.json({ ok: true, message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur maintenance : ' + err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  LICENCE — Routes publiques et admin
// ════════════════════════════════════════════════════════════

// GET /api/license/status — statut public (pas besoin d'auth)
app.get('/api/license/status', async (req, res) => {
  try {
    const license = await db.one(
      `SELECT
         id, client_name, client_email,
         issued_at, expires_at, max_users,
         features, is_active, activated_at,
         expires_at - CURRENT_DATE AS days_left,
         CURRENT_DATE > expires_at  AS is_expired
       FROM licenses
       WHERE is_active = TRUE
       ORDER BY created_at DESC LIMIT 1`
    );

    if (!license) {
      return res.status(402).json({
        valid:   false,
        error:   'Aucune licence active',
      });
    }

    const daysLeft  = parseInt(license.days_left) || 0;
    const isExpired = license.is_expired;
    const isDemo    = license.license_key === 'DEMO-LICENSE-KEY-WILL-BE-REPLACED';

    // Compter les utilisateurs actifs
    const userCount = await db.one('SELECT COUNT(*) AS count FROM users WHERE is_active = TRUE');

    res.json({
      valid:       !isExpired,
      demo:        isDemo,
      expired:     isExpired,
      warning:     daysLeft <= 30 && !isExpired,
      clientName:  license.client_name,
      clientEmail: license.client_email,
      issuedAt:    license.issued_at,
      expiresAt:   license.expires_at,
      daysLeft:    Math.max(0, daysLeft),
      maxUsers:    license.max_users,
      activeUsers: parseInt(userCount.count),
      features:    license.features,
      activatedAt: license.activated_at,
    });
  } catch (err) {
    console.error('License status error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/license/activate — activer une nouvelle licence
app.post('/api/license/activate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { licenseKey } = req.body;
    if (!licenseKey) {
      return res.status(400).json({ error: 'Clé de licence manquante' });
    }

    // Valider cryptographiquement la clé
    const validation = validateLicenseKey(licenseKey);

    if (validation.expired) {
      return res.status(422).json({
        error:     'Cette licence est déjà expirée',
        expiredAt: validation.payload?.expiresAt,
      });
    }

    if (!validation.valid && !validation.expired) {
      return res.status(422).json({
        error: validation.error || 'Clé de licence invalide',
      });
    }

    const { payload } = validation;

    // Désactiver les anciennes licences
    await db.run('UPDATE licenses SET is_active = FALSE');

    // Insérer ou mettre à jour la nouvelle licence
    const license = await db.one(
      `INSERT INTO licenses
         (license_key, client_name, client_email, issued_at, expires_at,
          max_users, features, is_active, activated_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,NOW(),$8)
       ON CONFLICT (license_key) DO UPDATE SET
         is_active    = TRUE,
         activated_at = NOW()
       RETURNING *`,
      [
        licenseKey,
        payload.clientName,
        payload.clientEmail,
        payload.issuedAt,
        payload.expiresAt,
        payload.maxUsers,
        payload.features,
        payload.notes || '',
      ]
    );

    // Invalider le cache de licence
    invalidateCache();

    await audit(req.user.id, 'ACTIVATE_LICENSE', 'licenses', license.id, null, {
      clientName: payload.clientName,
      expiresAt:  payload.expiresAt,
    }, req);

    res.json({
      ok:          true,
      message:     'Licence activée avec succès !',
      clientName:  license.client_name,
      expiresAt:   license.expires_at,
      daysLeft:    validation.daysLeft,
      maxUsers:    license.max_users,
      features:    license.features,
    });
  } catch (err) {
    console.error('License activation error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'activation' });
  }
});

// GET /api/license/history — historique des licences (admin)
app.get('/api/license/history', authenticate, authorize('admin'), async (req, res) => {
  try {
    const history = await db.many(
      `SELECT
         id, client_name, client_email, issued_at, expires_at,
         max_users, features, is_active, activated_at, notes, created_at,
         expires_at - CURRENT_DATE AS days_left
       FROM licenses
       ORDER BY created_at DESC`
    );
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/license/:id — révoquer une licence (admin)
app.delete('/api/license/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await db.run(
      'UPDATE licenses SET is_active = FALSE WHERE id = $1',
      [req.params.id]
    );
    invalidateCache();
    await audit(req.user.id, 'REVOKE_LICENSE', 'licenses', req.params.id, null, null, req);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ════════════════════════════════════════════════════════════

app.get(['/health', '/api/health'], async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', app: 'EcoGec', timestamp: new Date() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected' });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} introuvable` });
});

// Erreurs globales
app.use((err, req, res, next) => {
  console.error('❌ Erreur non gérée:', err.stack);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erreur serveur interne' : err.message
  });
});

// ── VÉRIFICATION LICENCE AU DÉMARRAGE ───────────────────────
async function checkLicenseOnStartup() {
  try {
    const result = await checkLicenseFromDB(db);
    if (!result.valid) {
      console.log('\n⚠️  ════════════════════════════════════════');
      console.log('⚠️  LICENCE INVALIDE OU EXPIRÉE');
      console.log(`⚠️  ${result.error}`);
      console.log('⚠️  L\'application fonctionne mais les');
      console.log('⚠️  utilisateurs ne pourront pas se connecter.');
      console.log('⚠️  ════════════════════════════════════════\n');
    } else if (result.demo) {
      console.log('\n⚠️  Licence DEMO active — générez une vraie licence');
      console.log(`⚠️  Expire le : ${result.license?.expires_at}`);
      console.log(`⚠️  Jours restants : ${result.daysLeft}\n`);
    } else if (result.warning) {
      console.log(`\n⚠️  ${result.warningMsg}`);
      console.log(`⚠️  Expire le : ${result.license?.expires_at}\n`);
    } else {
      console.log(`✅ Licence valide — ${result.clientName || result.license?.client_name}`);
      console.log(`   Expire le : ${result.license?.expires_at} (${result.daysLeft} jours restants)\n`);
    }
  } catch (err) {
    console.error('Erreur vérification licence au démarrage:', err.message);
  }
}

// ── DÉMARRAGE ────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`\n⟡ EcoGec API démarrée`);
  console.log(`  → http://localhost:${config.port}`);
  console.log(`  → Health: http://localhost:${config.port}/health\n`);
  checkLicenseOnStartup().catch(err => console.error('Licence check error:', err));
});

module.exports = { app, pool };
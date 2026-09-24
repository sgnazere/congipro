# EcoGec — gestion des congés et absences

Application web de demande, validation et suivi des congés (projet « Congipro »).

- Demandes en ligne avec décompte en jours ouvrés (hors week-ends et fériés), justificatifs, annulation
- Circuit de validation à 0, 1 ou 2 niveaux (superviseur direct puis RH)
- Soldes annuels par type de congé, calendrier, planning équipe, notifications internes
- Référentiels (utilisateurs, projets, types de congés, jours fériés), statistiques et export CSV, journal d'audit
- 5 rôles : employé, manager, RH, directeur, super administrateur

## Pile technique

| Couche | Technologie |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Zustand, pdfmake |
| API | Node.js, Express 5, JWT, bcrypt, Zod, Helmet |
| Base | PostgreSQL (≥ 14) |

## Installation (développement)

```bash
# Base de données
createdb congipro
psql -d congipro -f backend/src/db/schema.sql

# API
cd backend
cp .env.example .env        # puis renseigner DB_*, JWT_*, LICENSE_MASTER_KEY
npm ci
npm run db:migrate
npm run dev                 # http://localhost:3001

# Interface
cd ../frontend
cp .env.example .env
npm ci
npm run dev                 # http://localhost:5173 (proxy /api → 3001)
```

## Base de données

- `backend/src/db/schema.sql` : schéma de référence
- `backend/src/db/migrations/NNN_*.sql` : évolutions, appliquées dans l'ordre par `npm run db:migrate` (suivi dans la table `schema_migrations`)
- Contrôle de cohérence des soldes : vue `v_balance_check`, recalcul par `SELECT recompute_balances();`

## Sécurité

Ne jamais commiter `.env`, les fichiers de licence (`licenses/`), les justificatifs (`backend/uploads/`) ni les sauvegardes de base : ils sont exclus par `.gitignore`.

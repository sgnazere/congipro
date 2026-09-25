# EcoGec — gestion des congés et absences

Application web de demande, validation et suivi des congés (projet « Congipro »).

- Demandes en ligne avec décompte en jours ouvrés (hors week-ends et fériés), justificatifs, annulation
- Circuit de validation à 0, 1 ou 2 niveaux (superviseur direct puis RH)
- Retour effectif : l'employé déclare sa reprise, le superviseur la confirme ; retour anticipé (jours rendus) ou tardif (régularisation RH) ; relances automatiques J+1 puis J+3 (RH)
- Soldes annuels par type de congé (un dépassement est déduit des droits de l’année suivante), calendrier, planning équipe, notifications internes
- Référentiels (utilisateurs, projets, types de congés, jours fériés), statistiques et export CSV, journal d'audit
- 6 rôles : employé, manager, RH, directeur, Conseil d’administration (valide les congés du directeur), super administrateur

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

## Tests de bout en bout

Scénarios API avec comptes fictifs (`test-audit.*@ecogec.test`), sur une base de développement :

```bash
cd backend
export TEST_RH_EMAIL=... TEST_RH_PASSWORD=...     # compte RH de test
npm run test:e2e:circuit                          # circuit, Conseil, modification de comptes (58 contrôles)
psql -d congipro -f tests/cleanup_test_data.sql   # nettoyage entre deux scénarios
npm run test:e2e:retours                          # retours, relances, report du dépassement (40 contrôles)
psql -d congipro -f tests/cleanup_test_data.sql
```

La connexion est limitée à 10 tentatives / 15 min / IP : redémarrer l'API entre deux séries si nécessaire.

## Sécurité

Ne jamais commiter `.env`, les fichiers de licence (`licenses/`), les justificatifs (`backend/uploads/`) ni les sauvegardes de base : ils sont exclus par `.gitignore`.

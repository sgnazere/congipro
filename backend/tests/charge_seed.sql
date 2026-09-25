\set ON_ERROR_STOP on
-- Usage : psql -d congipro -v hash="<empreinte bcrypt du mot de passe de test>" -f tests/charge_seed.sql
-- À lancer UNIQUEMENT sur une base de test (sauvegarde puis restauration recommandées)
-- Jeu de données de charge : 50 managers + 944 employés fictifs (@charge.test), un an d'historique
BEGIN;
-- Accélère l'import : pas de journal d'audit automatique pendant le chargement
ALTER TABLE leave_requests DISABLE TRIGGER trg_audit_leave_requests;
ALTER TABLE users DISABLE TRIGGER trg_audit_users;

INSERT INTO users (email, password_hash, first_name, last_name, role, manager_id, project_id, hire_date)
SELECT format('charge.mgr%s@charge.test', lpad(i::text, 3, '0')), :'hash', 'Manager', format('CHARGE-%s', lpad(i::text, 3, '0')),
       'manager', (SELECT id FROM users WHERE email = 'de@ec-ci.org'),
       (SELECT id FROM projects ORDER BY name LIMIT 1 OFFSET (i % 4)), '2024-01-15'
FROM generate_series(1, 50) i;

INSERT INTO users (email, password_hash, first_name, last_name, role, manager_id, project_id, hire_date)
SELECT format('charge.emp%s@charge.test', lpad(i::text, 4, '0')), :'hash', 'Employe', format('CHARGE-%s', lpad(i::text, 4, '0')),
       'employee', (SELECT id FROM users WHERE email = format('charge.mgr%s@charge.test', lpad((((i - 1) % 50) + 1)::text, 3, '0'))),
       (SELECT id FROM projects ORDER BY name LIMIT 1 OFFSET (i % 4)), '2024-03-01'
FROM generate_series(1, 944) i;

-- Soldes 2026 et 2027 pour tous les types actifs
INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, pending_days)
SELECT u.id, lt.id, y, lt.max_days_per_year, 0, 0
FROM users u CROSS JOIN leave_types lt CROSS JOIN (VALUES (2026), (2027)) v(y)
WHERE u.email LIKE '%@charge.test' AND lt.is_active
ON CONFLICT DO NOTHING;
COMMIT;
ANALYZE users; ANALYZE leave_balances;
BEGIN;
ALTER TABLE leave_requests DISABLE TRIGGER trg_audit_leave_requests;

-- Historique 2026 : 8 absences par employé (janvier à août) + 1 demande en attente en novembre
-- mois 1-6 : approuvées (retour clôturé) ; 7 : rejetée ; 8 : approuvée, retour à déclarer
INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, days_count, reason, status, current_level, created_at)
SELECT u.id,
       (SELECT id FROM leave_types WHERE code = CASE WHEN m IN (3, 7) THEN 'SPECIAL' WHEN m = 5 THEN 'MALADIE' ELSE 'CP' END),
       make_date(2026, m, 12), make_date(2026, m, 12) + 1, 2,
       'Absence de charge', CASE WHEN m = 7 THEN 'rejected' ELSE 'approved' END::leave_status, 1,
       make_date(2026, m, 1)
FROM users u CROSS JOIN generate_series(1, 8) m
WHERE u.email LIKE 'charge.emp%';

INSERT INTO leave_requests (user_id, leave_type_id, start_date, end_date, days_count, reason, status, current_level, created_at)
SELECT u.id, (SELECT id FROM leave_types WHERE code = 'CP'), '2026-11-16', '2026-11-18', 3, 'Congés de fin d’année (charge)', 'pending', 1, NOW()
FROM users u WHERE u.email LIKE 'charge.emp%';

INSERT INTO leave_returns (request_id, planned_return_date, actual_return_date, actual_days, gap_days, status, regularization, charged_days, confirmed_at)
SELECT lr.id, lr.planned_return_date, lr.planned_return_date, lr.days_count, 0, 'closed', 'historique', lr.days_count, lr.end_date + 3
FROM leave_requests lr JOIN users u ON u.id = lr.user_id
WHERE u.email LIKE 'charge.emp%' AND lr.status = 'approved' AND lr.start_date < '2026-08-01';

INSERT INTO approval_steps (request_id, approver_id, level, action, comment, acted_at)
SELECT lr.id, u.manager_id, 1, CASE WHEN lr.status = 'rejected' THEN 'rejected' ELSE 'approved' END::approval_action,
       CASE WHEN lr.status = 'rejected' THEN 'Période chargée' END, lr.created_at + INTERVAL '1 day'
FROM leave_requests lr JOIN users u ON u.id = lr.user_id
WHERE u.email LIKE 'charge.emp%' AND lr.status IN ('approved', 'rejected');

COMMIT;
ANALYZE leave_requests;
BEGIN;
-- Notifications : ~20 par compte
INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
SELECT u.id, 'system', 'Notification de charge', 'Message fictif n°' || n, n > 3, NOW() - (n || ' days')::interval
FROM users u CROSS JOIN generate_series(1, 20) n WHERE u.email LIKE '%@charge.test';

-- Journal d'audit : ~300 000 événements sur un an
INSERT INTO audit_logs (user_id, action, entity_type, entity_id, ip_address, created_at)
SELECT u.id, (ARRAY['LOGIN','CREATE_REQUEST','APPROVED_REQUEST','LOGOUT','DECLARE_RETURN'])[1 + (n % 5)], 'user', u.id,
       '10.0.0.1', NOW() - ((n * 29) || ' minutes')::interval
FROM users u CROSS JOIN generate_series(1, 300) n WHERE u.email LIKE '%@charge.test';

COMMIT;
ALTER TABLE leave_requests ENABLE TRIGGER trg_audit_leave_requests;
ALTER TABLE users ENABLE TRIGGER trg_audit_users;

SELECT recompute_balances() AS soldes_recalcules;
ANALYZE;
SELECT (SELECT count(*) FROM users) AS utilisateurs, (SELECT count(*) FROM leave_requests) AS demandes,
       (SELECT count(*) FROM notifications) AS notifications, (SELECT count(*) FROM audit_logs) AS audit,
       (SELECT count(*) FROM leave_balances) AS soldes, pg_size_pretty(pg_database_size('congipro')) AS taille;

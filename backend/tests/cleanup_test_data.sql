-- Supprime les comptes et données créés par les tests (emails test-audit.*@ecogec.test)
BEGIN;
CREATE TEMP TABLE tu AS SELECT id FROM users WHERE email LIKE 'test-audit.%@ecogec.test';
CREATE TEMP TABLE tr AS SELECT id FROM leave_requests WHERE user_id IN (SELECT id FROM tu);
CREATE TEMP TABLE tt AS SELECT id FROM leave_types WHERE code IN ('TESTAUDIT', 'TESTN1', 'TESTDEF');
DELETE FROM notifications WHERE request_id IN (SELECT id FROM tr) OR user_id IN (SELECT id FROM tu);
DELETE FROM approval_steps WHERE request_id IN (SELECT id FROM tr) OR approver_id IN (SELECT id FROM tu);
DELETE FROM leave_returns WHERE request_id IN (SELECT id FROM tr);
DELETE FROM leave_requests WHERE id IN (SELECT id FROM tr);
DELETE FROM leave_balances WHERE user_id IN (SELECT id FROM tu) OR leave_type_id IN (SELECT id FROM tt);
DELETE FROM audit_logs WHERE user_id IN (SELECT id FROM tu);
DELETE FROM users WHERE id IN (SELECT id FROM tu);
DELETE FROM leave_types WHERE id IN (SELECT id FROM tt);
DELETE FROM audit_logs WHERE entity_id IN (SELECT id FROM tu UNION SELECT id FROM tr UNION SELECT id FROM tt);
COMMIT;
SELECT (SELECT count(*) FROM users) users, (SELECT count(*) FROM leave_requests) demandes, (SELECT count(*) FROM leave_returns) retours, (SELECT count(*) FROM v_balance_check) anomalies;

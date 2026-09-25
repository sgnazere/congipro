-- ════════════════════════════════════════════════════════════
--  006 — Tenue de charge (1000 utilisateurs)
--   · index sur les colonnes filtrées ou triées à chaque écran
--   · date de retour prévue STOCKÉE (auparavant recalculée ligne par ligne
--     à chaque lecture de la file des retours et à chaque relance)
-- ════════════════════════════════════════════════════════════

-- Files de validation, retours, planning équipe : WHERE u.manager_id = …
CREATE INDEX IF NOT EXISTS idx_users_manager ON users (manager_id);
-- Journal d'audit : ORDER BY created_at DESC LIMIT … (sinon tri de toute la table)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
-- Notifications d'un utilisateur, les plus récentes d'abord
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
-- Soldes et contrôles par type ; notifications liées à une demande
CREATE INDEX IF NOT EXISTS idx_leave_requests_type ON leave_requests (leave_type_id);
CREATE INDEX IF NOT EXISTS idx_notifications_request ON notifications (request_id);
CREATE INDEX IF NOT EXISTS idx_approval_steps_approver ON approval_steps (approver_id);

-- ── Date de retour prévue ───────────────────────────────────
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS planned_return_date DATE;

CREATE OR REPLACE FUNCTION set_planned_return_date() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.planned_return_date := add_business_days(NEW.end_date, 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planned_return ON leave_requests;
CREATE TRIGGER trg_planned_return BEFORE INSERT OR UPDATE OF end_date ON leave_requests
  FOR EACH ROW EXECUTE FUNCTION set_planned_return_date();

-- Un jour férié ajouté ou retiré peut décaler le retour des absences qui finissent juste avant
CREATE OR REPLACE FUNCTION refresh_planned_returns() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d DATE := COALESCE(NEW.date, OLD.date);
BEGIN
  UPDATE leave_requests SET planned_return_date = add_business_days(end_date, 1)
  WHERE end_date BETWEEN d - 30 AND d
    AND planned_return_date IS DISTINCT FROM add_business_days(end_date, 1);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_holidays_planned_return ON holidays;
CREATE TRIGGER trg_holidays_planned_return AFTER INSERT OR DELETE OR UPDATE OF date ON holidays
  FOR EACH ROW EXECUTE FUNCTION refresh_planned_returns();

UPDATE leave_requests SET planned_return_date = add_business_days(end_date, 1)
WHERE planned_return_date IS DISTINCT FROM add_business_days(end_date, 1);

ALTER TABLE leave_requests ALTER COLUMN planned_return_date SET NOT NULL;

-- Candidats aux relances et à la file des retours : absences approuvées par date de retour
CREATE INDEX IF NOT EXISTS idx_leave_requests_approved_return
  ON leave_requests (planned_return_date) WHERE status = 'approved';

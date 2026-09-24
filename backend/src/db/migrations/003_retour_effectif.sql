-- ════════════════════════════════════════════════════════════
--  003 — Retour effectif de congé (reprise de service) et relances
--
--  Circuit : l'employé déclare son retour → son superviseur confirme
--  (ou l'enregistre lui-même) → retour à l'heure / anticipé : clôture ;
--  retour tardif : régularisation par les RH, puis clôture.
--  La demande reste « approved » : la clôture est portée par leave_returns.
-- ════════════════════════════════════════════════════════════

-- ── Jours ouvrés (lundi-vendredi hors table holidays) ───────
CREATE OR REPLACE FUNCTION is_business_day(d DATE) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXTRACT(ISODOW FROM d) < 6 AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.date = d)
$$;

-- n-ième jour ouvré après d (n ≥ 1)
CREATE OR REPLACE FUNCTION add_business_days(d DATE, n INTEGER) RETURNS DATE LANGUAGE plpgsql STABLE AS $$
DECLARE r DATE := d; k INTEGER := 0;
BEGIN
  WHILE k < n LOOP
    r := r + 1;
    IF is_business_day(r) THEN k := k + 1; END IF;
  END LOOP;
  RETURN r;
END;
$$;

-- Nombre de jours ouvrés dans [a, b] (0 si b < a)
CREATE OR REPLACE FUNCTION business_days_between(a DATE, b DATE) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int FROM generate_series(a, b, INTERVAL '1 day') g(d) WHERE b >= a AND is_business_day(g.d::date)
$$;

-- ── Retours ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_returns (
  request_id             UUID PRIMARY KEY REFERENCES leave_requests(id) ON DELETE CASCADE,
  planned_return_date    DATE NOT NULL,
  actual_return_date     DATE NOT NULL,
  actual_days            NUMERIC NOT NULL,              -- jours ouvrés réellement absents
  gap_days               NUMERIC NOT NULL DEFAULT 0,    -- actual_days − days_count (< 0 anticipé, > 0 tardif)
  gap_reason             TEXT,
  status                 VARCHAR(20) NOT NULL CHECK (status IN ('declared', 'to_regularize', 'closed')),
  regularization         VARCHAR(20) CHECK (regularization IN ('deduire_conge', 'sans_solde', 'maladie', 'injustifiee', 'historique')),
  charged_days           NUMERIC,                       -- jours imputés au solde du type une fois clôturé
  declared_by            UUID REFERENCES users(id),
  declared_at            TIMESTAMPTZ,
  declaration_comment    TEXT,
  confirmed_by           UUID REFERENCES users(id),
  confirmed_at           TIMESTAMPTZ,
  confirmation_comment   TEXT,
  regularized_by         UUID REFERENCES users(id),
  regularized_at         TIMESTAMPTZ,
  regularization_comment TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_returns_status ON leave_returns (status);

DROP TRIGGER IF EXISTS trg_leave_returns_updated ON leave_returns;
CREATE TRIGGER trg_leave_returns_updated BEFORE UPDATE ON leave_returns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- auto_audit utilise NEW.id : leave_returns a pour clé request_id → audit applicatif uniquement

ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS return_reminder_level SMALLINT NOT NULL DEFAULT 0;

-- ── Soldes : un congé clôturé compte pour ses jours imputés ─
CREATE OR REPLACE VIEW v_balance_check AS
WITH calc AS (
  SELECT lr.user_id, lr.leave_type_id, EXTRACT(YEAR FROM lr.start_date)::int AS year,
         COALESCE(SUM(COALESCE(ret.charged_days, lr.days_count)) FILTER (WHERE lr.status = 'approved'), 0) AS approved_days,
         COALESCE(SUM(lr.days_count) FILTER (WHERE lr.status = 'pending'), 0) AS pending_calc
  FROM leave_requests lr LEFT JOIN leave_returns ret ON ret.request_id = lr.id
  GROUP BY 1, 2, 3
)
SELECT COALESCE(b.user_id, c.user_id)             AS user_id,
       COALESCE(b.leave_type_id, c.leave_type_id) AS leave_type_id,
       COALESCE(b.year, c.year)                   AS year,
       b.id AS balance_id, b.total_days, b.used_days, b.pending_days, b.adjusted_days,
       COALESCE(c.approved_days, 0) AS approved_days,
       COALESCE(c.pending_calc, 0)  AS pending_calc,
       CASE WHEN b.id IS NULL THEN 'solde_absent'
            WHEN b.used_days <> COALESCE(c.approved_days, 0) + b.adjusted_days THEN 'pris_incoherent'
            WHEN b.pending_days <> COALESCE(c.pending_calc, 0) THEN 'attente_incoherent'
            WHEN b.total_days - b.used_days - b.pending_days < 0 THEN 'solde_negatif'
       END AS anomalie
FROM leave_balances b
FULL JOIN calc c ON c.user_id = b.user_id AND c.leave_type_id = b.leave_type_id AND c.year = b.year
WHERE b.id IS NULL
   OR b.used_days <> COALESCE(c.approved_days, 0) + b.adjusted_days
   OR b.pending_days <> COALESCE(c.pending_calc, 0)
   OR b.total_days - b.used_days - b.pending_days < 0;

CREATE OR REPLACE FUNCTION recompute_balances() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER;
BEGIN
  INSERT INTO leave_balances (user_id, leave_type_id, year, total_days, used_days, pending_days)
  SELECT DISTINCT lr.user_id, lr.leave_type_id, EXTRACT(YEAR FROM lr.start_date)::int,
         COALESCE((SELECT b.total_days FROM leave_balances b
                   WHERE b.user_id = lr.user_id AND b.leave_type_id = lr.leave_type_id
                   ORDER BY b.year DESC LIMIT 1), lt.max_days_per_year),
         0, 0
  FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
  WHERE lr.status IN ('pending', 'approved')
  ON CONFLICT (user_id, leave_type_id, year) DO NOTHING;

  WITH calc AS (
    SELECT b.id,
           COALESCE(SUM(COALESCE(ret.charged_days, lr.days_count)) FILTER (WHERE lr.status = 'approved'), 0) + b.adjusted_days AS used,
           COALESCE(SUM(lr.days_count) FILTER (WHERE lr.status = 'pending'), 0) AS pending
    FROM leave_balances b
    LEFT JOIN leave_requests lr ON lr.user_id = b.user_id AND lr.leave_type_id = b.leave_type_id
                               AND EXTRACT(YEAR FROM lr.start_date) = b.year
    LEFT JOIN leave_returns ret ON ret.request_id = lr.id
    GROUP BY b.id, b.adjusted_days
  )
  UPDATE leave_balances b SET used_days = c.used, pending_days = c.pending, updated_at = NOW()
  FROM calc c WHERE c.id = b.id AND (b.used_days <> c.used OR b.pending_days <> c.pending);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Historique : congés approuvés dont le retour est antérieur à aujourd'hui ──
-- Clôturés d'office pour ne pas déclencher de relances sur des congés passés
INSERT INTO leave_returns (request_id, planned_return_date, actual_return_date, actual_days, gap_days,
                           status, regularization, charged_days, confirmed_at, confirmation_comment)
SELECT lr.id, add_business_days(lr.end_date, 1), add_business_days(lr.end_date, 1), lr.days_count, 0,
       'closed', 'historique', lr.days_count, NOW(),
       'Clôture automatique : congé terminé avant la mise en place du suivi des retours'
FROM leave_requests lr
WHERE lr.status = 'approved' AND add_business_days(lr.end_date, 1) < CURRENT_DATE
ON CONFLICT (request_id) DO NOTHING;

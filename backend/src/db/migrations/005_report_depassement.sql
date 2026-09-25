-- ════════════════════════════════════════════════════════════
--  005 — Report du dépassement de solde sur l'année suivante
--
--  Les droits sont attribués par année. Si les jours PRIS d'une année
--  dépassent les droits de cette année (retour tardif déduit, accord
--  exceptionnel…), le dépassement est dû à l'organisation et déduit
--  automatiquement du solde de l'année suivante, même type de congé.
--
--  carried_days (colonne existante, jusqu'ici inutilisée) = report reçu
--  de l'année précédente (≤ 0). Disponible = acquis + report − pris − en attente.
--  Seuls les jours pris comptent : une demande en attente ne crée pas de dette.
--  Le report est recalculé à chaque mouvement (chaînage année par année).
-- ════════════════════════════════════════════════════════════

-- Report dû à l'année suivante pour un solde donné (≤ 0)
CREATE OR REPLACE FUNCTION balance_deficit(b leave_balances) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(0, b.total_days + b.carried_days - b.used_days)
$$;

-- À la création d'un solde : reprendre le dépassement de l'année précédente
CREATE OR REPLACE FUNCTION balance_carry_in() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(balance_deficit(p), 0) INTO NEW.carried_days
  FROM leave_balances p
  WHERE p.user_id = NEW.user_id AND p.leave_type_id = NEW.leave_type_id AND p.year = NEW.year - 1;
  NEW.carried_days := COALESCE(NEW.carried_days, 0);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_balance_carry_in ON leave_balances;
CREATE TRIGGER trg_balance_carry_in BEFORE INSERT ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION balance_carry_in();

-- À chaque mouvement : répercuter le dépassement sur l'année suivante (qui répercute à son tour)
CREATE OR REPLACE FUNCTION balance_carry_out() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF balance_deficit(NEW) IS DISTINCT FROM balance_deficit(OLD) THEN
    UPDATE leave_balances SET carried_days = balance_deficit(NEW), updated_at = NOW()
    WHERE user_id = NEW.user_id AND leave_type_id = NEW.leave_type_id AND year = NEW.year + 1
      AND carried_days IS DISTINCT FROM balance_deficit(NEW);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_balance_carry_out ON leave_balances;
CREATE TRIGGER trg_balance_carry_out AFTER UPDATE OF total_days, carried_days, used_days ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION balance_carry_out();

-- Contrôle de cohérence : un solde négatif n'est plus une anomalie s'il est reporté
DROP VIEW IF EXISTS v_balance_check;
CREATE VIEW v_balance_check AS
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
       b.id AS balance_id, b.total_days, b.carried_days, b.used_days, b.pending_days, b.adjusted_days,
       COALESCE(c.approved_days, 0) AS approved_days,
       COALESCE(c.pending_calc, 0)  AS pending_calc,
       CASE WHEN b.id IS NULL THEN 'solde_absent'
            WHEN b.used_days <> COALESCE(c.approved_days, 0) + b.adjusted_days THEN 'pris_incoherent'
            WHEN b.pending_days <> COALESCE(c.pending_calc, 0) THEN 'attente_incoherent'
            ELSE 'solde_negatif'
       END AS anomalie
FROM leave_balances b
FULL JOIN calc c ON c.user_id = b.user_id AND c.leave_type_id = b.leave_type_id AND c.year = b.year
WHERE b.id IS NULL
   OR b.used_days <> COALESCE(c.approved_days, 0) + b.adjusted_days
   OR b.pending_days <> COALESCE(c.pending_calc, 0)
   -- dépassement non couvert : ni report possible (pas de solde l'an prochain) ni jours pris seulement
   OR (b.total_days + b.carried_days - b.used_days - b.pending_days < 0
       AND NOT EXISTS (SELECT 1 FROM leave_balances n WHERE n.user_id = b.user_id
                        AND n.leave_type_id = b.leave_type_id AND n.year = b.year + 1));

-- Recalcul : inclut désormais la propagation des reports, de l'année la plus ancienne à la plus récente
CREATE OR REPLACE FUNCTION recompute_balances() RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE n INTEGER; m INTEGER := 0; y INTEGER;
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

  FOR y IN SELECT DISTINCT year FROM leave_balances ORDER BY year LOOP
    UPDATE leave_balances b SET carried_days = COALESCE((
             SELECT balance_deficit(p) FROM leave_balances p
             WHERE p.user_id = b.user_id AND p.leave_type_id = b.leave_type_id AND p.year = b.year - 1), 0),
           updated_at = NOW()
    WHERE b.year = y AND b.carried_days IS DISTINCT FROM COALESCE((
             SELECT balance_deficit(p) FROM leave_balances p
             WHERE p.user_id = b.user_id AND p.leave_type_id = b.leave_type_id AND p.year = b.year - 1), 0);
    GET DIAGNOSTICS m = ROW_COUNT;
    n := n + m;
  END LOOP;
  RETURN n;
END;
$$;

SELECT recompute_balances();

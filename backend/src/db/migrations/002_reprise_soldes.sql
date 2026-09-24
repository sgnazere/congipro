-- ════════════════════════════════════════════════════════════
--  002 — Soldes justifiables + reprise des données héritées
--
--  Partie générique (toute installation) :
--   · leave_balances.adjusted_days / adjustment_note : jours « pris » hors EcoGec
--     (reprise d'historique, régularisation) → used_days = demandes approuvées + ajustement
--   · v_balance_check : écarts entre soldes et demandes
--   · recompute_balances() : recalcule used/pending depuis les demandes
--
--  Partie données (sans effet si les comptes n'existent pas) — décisions RH du 24/09/2026 :
--   A. Claire Leroy : 2 demandes non prises → annulées ; superviseure = Camille ANOMA
--   B. Serges GNAZERE : 3 « arrêts maladie » à motif de vacances → requalifiés en CP
--   C. Jours pris sans demande → reprise d'historique tracée
--   D. Acquis individuels (25 CP / 10 RTT) conservés
-- ════════════════════════════════════════════════════════════

ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS adjusted_days   NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_note TEXT;

COMMENT ON COLUMN leave_balances.adjusted_days IS
  'Jours comptés dans used_days sans demande EcoGec (reprise d''historique, régularisation)';

-- Écarts soldes / demandes (vide = cohérent)
CREATE OR REPLACE VIEW v_balance_check AS
WITH calc AS (
  SELECT user_id, leave_type_id, EXTRACT(YEAR FROM start_date)::int AS year,
         COALESCE(SUM(days_count) FILTER (WHERE status = 'approved'), 0) AS approved_days,
         COALESCE(SUM(days_count) FILTER (WHERE status = 'pending'),  0) AS pending_calc
  FROM leave_requests GROUP BY 1, 2, 3
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

-- Recalcul : crée les soldes manquants puis aligne used/pending sur les demandes.
-- Acquis d'un solde créé : celui de la dernière année connue pour ce couple, sinon le plafond du type.
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
           COALESCE(SUM(lr.days_count) FILTER (WHERE lr.status = 'approved'), 0) + b.adjusted_days AS used,
           COALESCE(SUM(lr.days_count) FILTER (WHERE lr.status = 'pending'),  0)                  AS pending
    FROM leave_balances b
    LEFT JOIN leave_requests lr ON lr.user_id = b.user_id AND lr.leave_type_id = b.leave_type_id
                               AND EXTRACT(YEAR FROM lr.start_date) = b.year
    GROUP BY b.id, b.adjusted_days
  )
  UPDATE leave_balances b SET used_days = c.used, pending_days = c.pending, updated_at = NOW()
  FROM calc c WHERE c.id = b.id AND (b.used_days <> c.used OR b.pending_days <> c.pending);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Données héritées ────────────────────────────────────────
DO $$
DECLARE
  claire  UUID := (SELECT id FROM users WHERE email = 'admin@congipro.fr');
  camille UUID := (SELECT id FROM users WHERE email = 'directeur@ecogec.fr');
  serges  UUID := (SELECT id FROM users WHERE email = 'employe@congipro.fr');
  cp      UUID := (SELECT id FROM leave_types WHERE code = 'CP');
  maladie UUID := (SELECT id FROM leave_types WHERE code = 'MALADIE');
  r       RECORD;
BEGIN
  -- C. Reprise : jours « pris » non couverts par des demandes approuvées (avant toute autre modification)
  UPDATE leave_balances b
  SET adjusted_days   = b.used_days - x.approved,
      adjustment_note = 'Reprise d''historique : congés pris avant la mise en service d''EcoGec (décision RH du 24/09/2026)'
  FROM (
    SELECT b2.id, COALESCE(SUM(lr.days_count) FILTER (WHERE lr.status = 'approved'), 0) AS approved
    FROM leave_balances b2
    LEFT JOIN leave_requests lr ON lr.user_id = b2.user_id AND lr.leave_type_id = b2.leave_type_id
                               AND EXTRACT(YEAR FROM lr.start_date) = b2.year
    GROUP BY b2.id
  ) x
  WHERE x.id = b.id AND b.used_days > x.approved AND b.adjusted_days = 0;

  -- A. Claire Leroy : superviseure + annulation des demandes non prises
  IF claire IS NOT NULL AND camille IS NOT NULL THEN
    UPDATE users SET manager_id = camille WHERE id = claire AND manager_id IS NULL;
    FOR r IN SELECT id, start_date, days_count FROM leave_requests
             WHERE user_id = claire AND status = 'pending' AND end_date < CURRENT_DATE LOOP
      UPDATE leave_requests SET status = 'cancelled', updated_at = NOW() WHERE id = r.id;
      INSERT INTO notifications (user_id, type, title, message, request_id)
      VALUES (claire, 'system', 'Demande annulée (régularisation)',
              'Votre demande du ' || to_char(r.start_date, 'DD/MM/YYYY') || ' restée sans superviseur a été annulée : congés non pris.', r.id);
      INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
      VALUES ('REPRISE_DONNEES', 'leave_request', r.id,
              jsonb_build_object('decision', 'A', 'motif', 'Demande orpheline (aucun superviseur), congés non pris : annulée'));
    END LOOP;
  END IF;

  -- B. Serges GNAZERE : arrêts maladie à motif de vacances → Congés payés
  IF serges IS NOT NULL AND cp IS NOT NULL THEN
    FOR r IN SELECT id, start_date, status FROM leave_requests
             WHERE user_id = serges AND leave_type_id = maladie
               AND (reason ILIKE '%cong%annuel%' OR reason ILIKE '%vacance%') LOOP
      UPDATE leave_requests SET leave_type_id = cp, updated_at = NOW() WHERE id = r.id;
      INSERT INTO audit_logs (action, entity_type, entity_id, new_value)
      VALUES ('REPRISE_DONNEES', 'leave_request', r.id,
              jsonb_build_object('decision', 'B', 'motif', 'Requalifiée Arrêt maladie → Congés payés (type présélectionné par erreur)', 'statut', r.status));
      INSERT INTO notifications (user_id, type, title, message, request_id)
      VALUES (serges, 'system', 'Demande requalifiée en Congés payés',
              'Votre demande du ' || to_char(r.start_date, 'DD/MM/YYYY') || ' avait été saisie en « Arrêt maladie » ; elle est désormais en « Congés payés »'
              || CASE WHEN r.status = 'pending' THEN ' et suit le circuit de validation des congés payés.' ELSE '.' END, r.id);
    END LOOP;
    -- Décision d'étape 1 annulée à la main en base le 28/04/2026 : on l'indique dans l'historique
    UPDATE approval_steps s SET comment = 'Décision annulée manuellement le 28/04/2026 ; demande remise en attente (régularisation du 24/09/2026)'
    FROM leave_requests lr
    WHERE lr.id = s.request_id AND lr.user_id = serges AND lr.status = 'pending' AND s.comment IS NULL;
  END IF;

  -- Soldes alignés sur les demandes (+ reprise) ; D : acquis individuels conservés
  PERFORM recompute_balances();
END;
$$;

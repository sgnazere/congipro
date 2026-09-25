-- ════════════════════════════════════════════════════════════
--  004 — Rôle « Conseil d'administration » (board)
--  Superviseur du Directeur exécutif : valide ses congés et confirme ses
--  retours, sans accès aux référentiels ni aux statistiques.
-- ════════════════════════════════════════════════════════════

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'board';

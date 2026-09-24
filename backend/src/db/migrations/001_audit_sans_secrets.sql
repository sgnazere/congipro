-- ════════════════════════════════════════════════════════════
--  001 — Le journal d'audit ne doit contenir aucun secret
--  Avant : auto_audit() copiait la ligne complète (password_hash,
--  refresh_token, license_key) dans audit_logs, lisible par les RH.
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_audit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO audit_logs (action, entity_type, entity_id, old_value, new_value)
  VALUES (
    TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP != 'INSERT'
      THEN row_to_json(OLD)::jsonb - 'password_hash' - 'refresh_token' - 'license_key' END,
    CASE WHEN TG_OP != 'DELETE'
      THEN row_to_json(NEW)::jsonb - 'password_hash' - 'refresh_token' - 'license_key' END
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Purge des secrets déjà journalisés
UPDATE audit_logs
SET old_value = old_value - 'password_hash' - 'refresh_token' - 'license_key',
    new_value = new_value - 'password_hash' - 'refresh_token' - 'license_key'
WHERE old_value ?| ARRAY['password_hash','refresh_token','license_key']
   OR new_value ?| ARRAY['password_hash','refresh_token','license_key'];

-- Les refresh tokens ont été exposés : on révoque toutes les sessions
UPDATE users SET refresh_token = NULL WHERE refresh_token IS NOT NULL;

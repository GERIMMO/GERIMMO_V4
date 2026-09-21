-- La migration précédente a créé une fonction déclencheur. PostgreSQL accorde
-- EXECUTE à PUBLIC par défaut ; elle n'est appelée que par son trigger.
revoke execute on function public.proteger_mentions_edl_signe() from public, anon, authenticated;

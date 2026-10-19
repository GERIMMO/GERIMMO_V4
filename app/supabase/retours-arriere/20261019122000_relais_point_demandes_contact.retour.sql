-- Retour M16 (19/10/2026) : les demandes de contact du site vitrine ne sont plus comptées dans l'e-mail de 5 h.
--
-- REMETTRE D'ABORD LE CODE PRÉCÉDENT (src/lib/relais-alerte-envoi.ts, src/lib/relais-alerte.ts) : avec le code M16 et
-- sans la fonction, chaque passage de 5 h compterait « Les demandes de contact du site vitrine n’ont pas pu être
-- comptées. » comme contrôle impossible et ferait partir un e-mail par jour (dégradé, sans perte de donnée, mais bruyant).
--
-- La migration n'a créé qu'une fonction nouvelle (aucune définition antérieure à restaurer : la fonction n'existait pas en
-- production le 19/10, relevé par to_regprocedure) et n'a touché ni table, ni politique, ni donnée, ni tâche : le retour
-- la supprime et retire sa seule version d'historique. Rejouable (« if exists »). Aucune donnée à restituer.
--
-- Se joue dans une transaction contrôlée, sans COMMIT interne : psql --single-transaction -v ON_ERROR_STOP=1 -f <ce fichier>.
-- L'attente de verrou est bornée (relecture du 19/10) : un passage de 5 h ou un passage des urgences qui exécuterait la
-- fonction au même instant ne fait pas attendre le retour indéfiniment ; au-delà de 10 s, le retour échoue et se rejoue.

set local lock_timeout = '10s';

drop function if exists public.demandes_contact_en_attente();

-- Même transaction externe que le retour ; permettre une réapplication tracée.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261019122000';
  end if;
end $historique$;

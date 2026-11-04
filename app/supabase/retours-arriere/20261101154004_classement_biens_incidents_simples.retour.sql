-- Retour d'interface : conserver tous les incidents, leurs colonnes et leurs contraintes.
-- Retirer les nouveaux points d'entrée uniquement après restauration du code précédent.
do $retour_atomique$ begin
 drop function if exists public.declarer_incident_bien_simple(uuid,uuid,uuid,text,date,text,uuid);
 drop function if exists public.documents_du_bien(uuid,uuid,uuid[]);
 delete from supabase_migrations.schema_migrations where version='20261101154004';
end $retour_atomique$;

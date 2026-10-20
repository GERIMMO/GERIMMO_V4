-- Supprimer la liste d'attente des agences si elle est VIDE ; refuser sans rien modifier dès qu'une agence s'y est inscrite (décision du dirigeant requise).
do $retour_atomique$
declare n bigint;
begin
 if to_regclass('public.liste_attente_agences') is not null then
  execute 'select count(*) from public.liste_attente_agences' into n;
  if n > 0 then
   raise exception 'Retour arrière refusé : public.liste_attente_agences contient % inscription(s) d''agence ; décision du dirigeant requise avant toute suppression.', n using errcode = 'P0001';
  end if;
 end if;
 execute $retour$
 set local lock_timeout='10s';
 drop trigger if exists liste_attente_agences_limiter on public.liste_attente_agences;
 drop trigger if exists diagnostic_artisan_lecture on public.liste_attente_agences;
 drop table if exists public.liste_attente_agences;
 drop function if exists public.liste_attente_agences_limiter();
 delete from supabase_migrations.schema_migrations where version='20261020120000';
 $retour$;
end $retour_atomique$;

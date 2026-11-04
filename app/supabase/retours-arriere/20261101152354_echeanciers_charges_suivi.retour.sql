-- Rétablir le code précédent avant ce retour. Aucun historique financier n'est effacé.
do $retour_atomique$ begin
 if to_regclass('public.echeanciers_charges') is not null then
  lock table public.echeanciers_charges in access exclusive mode;
  if exists(select 1 from public.echeanciers_charges) then raise exception 'Retour refusé : conserver les échéanciers et leurs réceptions. Utiliser une migration corrective.'; end if;
 end if;
 drop function if exists public.synchroniser_rappels_echeanciers_charges(uuid);
 drop function if exists public.agir_echeancier_charges(uuid,text,integer,bigint,date);
 drop function if exists public.publier_echeancier_charges(uuid,text,text,bigint,text);
 drop function if exists public.preparer_echeancier_charges(uuid,integer,date);
 drop table if exists public.rappels_echeanciers_charges;
 drop table if exists public.echeanciers_charges;
 drop function if exists public.acces_echeancier_charges(uuid,boolean);
 delete from supabase_migrations.schema_migrations where version='20261101152354';
end $retour_atomique$;

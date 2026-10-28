-- Retour avant utilisation uniquement. Aucun brouillon ni décompte n’est effacé.
-- Le bloc atomique vérifie les données avant de retirer la moindre routine.
do $$
begin
 if to_regclass('public.brouillons_regularisation_fourniture') is not null then
  lock table public.brouillons_regularisation_fourniture in access exclusive mode;
  if exists(select 1 from public.brouillons_regularisation_fourniture) then
   raise exception 'Retour refusé : des brouillons ou décomptes de charges sont conservés. Corriger en avant.';
  end if;
 end if;
 drop function if exists public.emettre_regularisation_fourniture(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text);
 drop function if exists public.preparer_regularisation_fourniture(uuid,uuid,integer);
 drop function if exists consommations_interne.emettre_regularisation(uuid,uuid,text,boolean,boolean,boolean,text,text,bigint,text);
 drop function if exists consommations_interne.preparer_regularisation(uuid,uuid,integer);
 drop function if exists consommations_interne.source_regularisation(uuid,uuid,integer);
 drop table if exists public.brouillons_regularisation_fourniture;
end $$;

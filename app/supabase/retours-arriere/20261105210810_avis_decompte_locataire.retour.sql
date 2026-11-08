-- Retour avant utilisation uniquement. Aucune donnée métier ne peut être supprimée.
do $retour$
begin
 if to_regclass('public.brouillons_regularisation_fourniture') is null then return; end if;
 if to_regclass('public.reglages_avis_decompte') is not null then
 lock table public.reglages_avis_decompte in access exclusive mode;
 if exists(select 1 from public.reglages_avis_decompte) then raise exception 'Retour refusé : des données de reglages_avis_decompte sont conservées. Corriger en avant.'; end if;
 end if;
 if to_regclass('public.brouillons_regularisation_fourniture') is not null then
 lock table public.brouillons_regularisation_fourniture in access exclusive mode;
 if exists(select 1 from public.brouillons_regularisation_fourniture where avis_le is not null or consulte_le is not null) then raise exception 'Retour refusé : des avis ou consultations sont conservés.'; end if;
 end if;
 drop trigger if exists acces_decompte on public.acces_pieces_log;
 drop trigger if exists avant_empreinte_principaux on public.repartitions_fourniture;
 drop trigger if exists avis_apres_validation on public.brouillons_regularisation_fourniture;
 drop function if exists public.notifier_decompte(uuid,uuid), public.mes_avis_decompte(uuid), public.regler_avis_decompte(uuid,uuid,boolean), public.demander_index_facture(uuid,uuid,uuid,date);
 drop function if exists consommations_interne.notifier_decompte(uuid,uuid), consommations_interne.mes_avis_decompte(uuid), consommations_interne.regler_avis(uuid,uuid,boolean), consommations_interne.demander_index_facture(uuid,uuid,uuid,date), consommations_interne.tracer_acces_decompte(), consommations_interne.verifier_compteurs_principaux(), consommations_interne.avis_apres_validation();
 if to_regprocedure('consommations_interne.source_regularisation_montants(uuid,uuid,integer)') is not null then
 drop function if exists consommations_interne.source_regularisation(uuid,uuid,integer);
 alter function consommations_interne.source_regularisation_montants(uuid,uuid,integer) rename to source_regularisation;
 end if;
 alter table public.brouillons_regularisation_fourniture drop column if exists avis_le, drop column if exists consulte_le;
 drop table if exists public.reglages_avis_decompte;
 delete from supabase_migrations.schema_migrations where version='20261105210810';
end $retour$;

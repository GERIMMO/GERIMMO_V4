-- Retour avant utilisation uniquement. Les relevés et répartitions existants ne sont jamais détruits.
do $$ declare t text; n bigint; begin
 perform set_config('lock_timeout','10s',true);
 if to_regclass('public.paiements_factures_fourniture') is not null or to_regclass('public.brouillons_regularisation_fourniture') is not null then
  raise exception 'Retour refusé : jouez d’abord les retours des régularisations puis des paiements de fournitures.';
 end if;
 foreach t in array array['compteurs_consommation','contrats_fourniture','factures_fourniture','demandes_releves','releves_consommation','depots_photos_releve','repartitions_fourniture'] loop
  if to_regclass('public.'||t) is not null then
   execute format('lock table public.%I in access exclusive mode',t);
   execute format('select count(*) from public.%I',t) into n;
   if n>0 then raise exception 'Retour refusé : % contient des données. Conserver la migration et corriger en avant.',t; end if;
  end if;
 end loop;
drop function if exists public.synchroniser_demandes_releves(uuid);
drop function if exists public.mes_releves_consommation(uuid);
drop function if exists public.soumettre_releve_consommation(uuid,numeric,date,uuid);
drop function if exists public.preparer_photo_releve(uuid,text,text,bigint);
drop function if exists public.finaliser_photo_releve(uuid);
drop function if exists public.enregistrer_releve_compteur(uuid,uuid,numeric,date);
drop function if exists public.preparer_repartition_fourniture(uuid,jsonb,text);
drop function if exists public.preparer_repartition_fourniture(uuid,jsonb,text,text);
drop function if exists public.preparer_repartition_fourniture(uuid,jsonb,text,text,jsonb);
drop function if exists public.valider_repartition_fourniture(uuid);
drop function if exists public.valider_repartition_fourniture(uuid,text);
drop function if exists public.planifier_releves_consommation();
drop policy if exists releve_photo_depot on storage.objects;
drop policy if exists releve_photo_lecture on storage.objects;
drop table if exists public.repartitions_fourniture;
drop table if exists public.depots_photos_releve;
drop table if exists public.releves_consommation;
drop table if exists public.demandes_releves;
drop table if exists public.compteurs_consommation;
drop table if exists public.factures_fourniture;
drop table if exists public.contrats_fourniture;
drop schema if exists consommations_interne cascade;
end $$;

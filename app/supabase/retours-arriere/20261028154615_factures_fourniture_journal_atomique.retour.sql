-- Retour avant utilisation uniquement. Les paiements et leur journal sont des preuves.
-- Un refus ne modifie ni les droits, ni les gardes, ni les fonctions existantes.
do $$
declare t text; utilise boolean;
begin
 foreach t in array array['paiements_factures_fourniture','ecritures_factures_fourniture'] loop
  if to_regclass('public.'||t) is not null then
   execute format('lock table public.%I in access exclusive mode',t);
   execute format('select exists(select 1 from public.%I)',t) into utilise;
   if utilise then raise exception 'Retour refusé : % contient des preuves financières. Corriger en avant.',t; end if;
  end if;
 end loop;
 if to_regclass('public.repartitions_fourniture') is not null then
  drop trigger if exists z_paiement_repartition on public.repartitions_fourniture;
 end if;
 if to_regclass('public.factures_fourniture') is not null then
  drop trigger if exists conso_paiement_facture on public.factures_fourniture;
 end if;
 drop function if exists public.payer_facture_fourniture(uuid,uuid,date);
 drop function if exists consommations_interne.payer_facture(uuid,uuid,date);
 drop function if exists consommations_interne.rattacher_paiement_valide();
 drop function if exists consommations_interne.garder_paiement_facture();
 drop function if exists consommations_interne.ventiler_paiement_facture(uuid,uuid,date,text);
 drop function if exists consommations_interne.ecrire_facture(uuid,uuid,bigint,text,text,uuid,uuid,date);
 drop table if exists public.ecritures_factures_fourniture;
 drop table if exists public.paiements_factures_fourniture;
end $$;

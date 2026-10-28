-- Ne retire pas la protection d'un historique financier déjà utilisé.
do $$ begin
 if to_regclass('public.factures_fourniture') is null then return; end if;
 lock table public.factures_fourniture,public.contrats_fourniture in access exclusive mode;
 if exists(select 1 from public.factures_fourniture) then
  raise exception 'Retour refusé : des factures utilisent la protection de leur contrat. Conservez cette protection.';
 end if;
 drop trigger if exists conso_verrou_contrat_facture on public.factures_fourniture;
 drop trigger if exists conso_historique_contrat on public.contrats_fourniture;
 drop function if exists consommations_interne.garder_historique_contrat();
end $$;

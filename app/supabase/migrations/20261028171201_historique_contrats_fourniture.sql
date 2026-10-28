-- Le contrat décrit l'origine des factures déjà conservées. Modifier leur
-- bâtiment, logement ou catégorie réécrirait l'historique financier.
create or replace function consommations_interne.garder_historique_contrat()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='factures_fourniture' then
  -- Sérialise le premier dépôt et un changement du contrat : aucun dépôt ne
  -- peut être validé entre le contrôle d'absence de facture et la modification.
  perform 1 from public.contrats_fourniture c
   where c.id=new.contrat_id and c.organization_id=new.organization_id for share;
  return new;
 end if;
 if (new.bien_id,new.lot_id,new.categorie) is distinct from (old.bien_id,old.lot_id,old.categorie)
  and exists(select 1 from public.factures_fourniture f where f.contrat_id=old.id) then
  raise exception 'Ce contrat comporte des factures : son rattachement et son type sont conservés. Archivez-le puis créez un nouveau contrat pour les changer.';
 end if;
 return new;
end $$;
revoke all on function consommations_interne.garder_historique_contrat() from public,anon,authenticated,service_role;

drop trigger if exists conso_historique_contrat on public.contrats_fourniture;
create trigger conso_historique_contrat before update of bien_id,lot_id,categorie on public.contrats_fourniture
 for each row execute function consommations_interne.garder_historique_contrat();
drop trigger if exists conso_verrou_contrat_facture on public.factures_fourniture;
create trigger conso_verrou_contrat_facture before insert or update of contrat_id on public.factures_fourniture
 for each row execute function consommations_interne.garder_historique_contrat();

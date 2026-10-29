-- Un mandat sur un seul lot ne donne aucun droit sur les factures, relevés
-- généraux et répartitions JSON de tout l'immeuble. Le garde de portefeuille
-- sait déjà refuser un lot NULL à un agent restreint : ne pas le court-circuiter.
-- Les objets rattachés à son lot restent autorisés ; les opérations globales
-- sont réservées aux rôles qui ne sont pas restreints à un portefeuille.
create or replace function consommations_interne.gerant(p_org uuid,p_bien uuid,p_lot uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select auth.uid() is not null and p_org in(select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
 and not public.bien_hors_portefeuille(p_org,p_bien)
 and not public.lot_hors_portefeuille(p_org,p_lot);
$$;
revoke all on function consommations_interne.gerant(uuid,uuid,uuid) from public,anon;
grant execute on function consommations_interne.gerant(uuid,uuid,uuid) to authenticated;

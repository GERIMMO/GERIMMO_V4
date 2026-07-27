-- Correctif : autoriser les comptes Propriétaire (rôle 'proprietaire') à créer et modifier
-- leurs patrimoines, résidences et biens. Avant, seuls 'administrateur_agence' et
-- 'agent_immobilier' étaient autorisés en insert/update → un propriétaire ne pouvait rien créer.
-- SELECT autorise déjà tout membre actif ; DELETE reste réservé au super-admin (les biens
-- se retirent par archivage/update, pas par suppression).

-- patrimoines
drop policy if exists patrimoines_insert_policy on public.patrimoines;
create policy patrimoines_insert_policy on public.patrimoines for insert
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

drop policy if exists patrimoines_update_policy on public.patrimoines;
create policy patrimoines_update_policy on public.patrimoines for update
  using (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']))
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

-- residences
drop policy if exists residences_insert_policy on public.residences;
create policy residences_insert_policy on public.residences for insert
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

drop policy if exists residences_update_policy on public.residences;
create policy residences_update_policy on public.residences for update
  using (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']))
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

-- biens
drop policy if exists biens_insert_policy on public.biens;
create policy biens_insert_policy on public.biens for insert
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

drop policy if exists biens_update_policy on public.biens;
create policy biens_update_policy on public.biens for update
  using (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']))
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

-- Suite du correctif propriétaire : permettre au rôle 'proprietaire' de gérer les
-- détails de ses biens — occupants (locataires) et échéances de paiement.
-- Même classe de bug que 20260718130000 : les policies insert/update n'autorisaient
-- que les rôles agence. SELECT (can_access_bien) et DELETE (super_admin) inchangés.

-- bien_echeances
drop policy if exists bien_echeances_insert_policy on public.bien_echeances;
create policy bien_echeances_insert_policy on public.bien_echeances for insert
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

drop policy if exists bien_echeances_update_policy on public.bien_echeances;
create policy bien_echeances_update_policy on public.bien_echeances for update
  using (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']))
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

-- bien_occupants
drop policy if exists bien_occupants_insert_policy on public.bien_occupants;
create policy bien_occupants_insert_policy on public.bien_occupants for insert
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

drop policy if exists bien_occupants_update_policy on public.bien_occupants;
create policy bien_occupants_update_policy on public.bien_occupants for update
  using (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']))
  with check (has_organization_role(organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire']));

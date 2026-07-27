-- Un propriétaire bailleur ne voyait que lui-même dans sa propre organisation.
--
-- organization_members_select_policy accordait la lecture au super admin, à soi-même et
-- aux rôles 'administrateur_agence' / 'agent_immobilier'. Le rôle 'proprietaire' en était
-- absent : un bailleur qui gère seul son parc (membre 'owner' de sa propre organisation
-- avec le rôle 'proprietaire') ne voyait donc AUCUN de ses locataires dans la gestion des
-- utilisateurs, alors qu'il en a la charge (cf. can_manage_profile, 20260720130000).
--
-- La condition reste évaluée sur les colonnes de la ligne (organization_id, profile_id) :
-- pas de re-interrogation de organization_members, donc pas de retour du piège corrigé par
-- 20260719140000 (une policy qui relit sa propre table casse INSERT/UPDATE ... RETURNING).
drop policy if exists organization_members_select_policy on public.organization_members;
create policy organization_members_select_policy on public.organization_members
  for select
  using (
    public.is_super_admin()
    or profile_id = auth.uid()
    or public.has_organization_role(
         organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire'])
  );

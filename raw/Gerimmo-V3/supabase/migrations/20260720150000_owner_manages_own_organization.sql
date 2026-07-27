-- Un propriétaire bailleur ne pouvait rien administrer, pas même sa propre organisation.
--
-- can_manage_organization() se limitait aux rôles 'super_admin' et 'administrateur_agence'.
-- Elle gouverne organizations (UPDATE), organization_members (INSERT/UPDATE) et
-- member_role_assignments (INSERT/UPDATE) : un propriétaire indépendant — qui crée sa
-- propre organisation en s'inscrivant (parcours 'independent_owner') — ne pouvait donc ni
-- la renommer, ni inviter, ni suspendre ou archiver un de ses locataires. Cela contredit la
-- hiérarchie retenue (2026-07-20) : « le propriétaire bailleur gère ses locataires ».
--
-- ⚠️ Distinction essentielle : un propriétaire peut aussi être membre de l'organisation
-- d'une AGENCE (parc confié en gestion). Lui accorder l'administration de cette
-- organisation serait une faille. Le droit est donc réservé au propriétaire qui est
-- lui-même 'owner' de l'organisation concernée — c'est-à-dire la sienne.
create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.has_organization_role(target_organization_id, array['super_admin', 'administrateur_agence'])
    or (
      public.has_organization_role(target_organization_id, array['proprietaire'])
      and exists (
        select 1
        from public.organization_members om
        where om.organization_id = target_organization_id
          and om.profile_id = auth.uid()
          and om.member_type = 'owner'
          and om.status = 'active'
          and om.archived_at is null
      )
    );
$function$;

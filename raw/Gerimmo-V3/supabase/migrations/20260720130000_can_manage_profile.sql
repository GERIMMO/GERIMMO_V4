-- Les gérants doivent pouvoir GÉRER (et pas seulement lire) les utilisateurs dont ils ont
-- la charge. Jusqu'ici, profiles_update_policy n'autorisait que `id = auth.uid()` ou le
-- super admin : un administrateur d'agence ne pouvait même pas corriger le téléphone d'un
-- de ses locataires.
--
-- Hiérarchie retenue (décision produit 2026-07-20) :
--   - super admin            → tout le monde
--   - administrateur agence  → les membres de son organisation (dont ses agents) ET les
--                              occupants des biens de son organisation
--   - agent immobilier       → les occupants des biens de son organisation
--                              (le découpage par portefeuille est reporté : aujourd'hui un
--                               agent voit tout le périmètre de son agence)
--   - propriétaire bailleur  → les locataires de SES biens (biens où il est lui-même
--                              enregistré comme occupant de type 'proprietaire')
--   - chacun                 → son propre profil
--
-- ⚠️ Ces clauses interrogent organization_members / bien_occupants / biens, JAMAIS profiles :
-- elles ne reproduisent pas le piège d'auto-interrogation corrigé par 20260719130000 et
-- 20260719140000 (une policy qui relit sa propre table casse UPDATE ... RETURNING).
create or replace function public.can_manage_profile(target_profile_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    public.is_super_admin()
    or target_profile_id = auth.uid()
    -- Administrateur d'agence : les membres de son organisation.
    or exists (
      select 1
      from public.organization_members target_member
      where target_member.profile_id = target_profile_id
        and target_member.archived_at is null
        and public.has_organization_role(target_member.organization_id, array['administrateur_agence'])
    )
    -- Administrateur, agent ou propriétaire bailleur : les occupants des biens de son
    -- organisation. Un propriétaire bailleur qui gère seul son parc est membre de sa propre
    -- organisation avec le rôle 'proprietaire' — ses biens sont ceux de cette organisation.
    or exists (
      select 1
      from public.bien_occupants occupant
      join public.biens bien on bien.id = occupant.bien_id
      where occupant.profile_id = target_profile_id
        and occupant.archived_at is null
        and public.has_organization_role(
              bien.organization_id, array['administrateur_agence', 'agent_immobilier', 'proprietaire'])
    )
    -- Cas complémentaire : bailleur enregistré comme occupant 'proprietaire' d'un bien
    -- précis (parc détenu au sein d'une agence tierce) → les locataires de ce bien.
    or exists (
      select 1
      from public.bien_occupants locataire
      join public.bien_occupants bailleur on bailleur.bien_id = locataire.bien_id
      where locataire.profile_id = target_profile_id
        and locataire.occupant_type = 'locataire'
        and locataire.archived_at is null
        and bailleur.profile_id = auth.uid()
        and bailleur.occupant_type = 'proprietaire'
        and bailleur.archived_at is null
    );
$function$;

-- La lecture suit la gestion : qui peut gérer peut lire. On conserve en plus les règles de
-- visibilité entre membres d'une même organisation et l'accès aux occupants introduit par
-- 20260720120000 (un membre actif peut lire les occupants des biens de son organisation,
-- nécessaire par exemple pour envoyer une quittance).
create or replace function public.can_access_profile(target_profile_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.can_manage_profile(target_profile_id)
    or coalesce((
      select true from public.organization_members target_member
      where target_member.profile_id = target_profile_id and target_member.archived_at is null
        and (
          public.has_organization_role(target_member.organization_id, array['administrateur_agence', 'agent_immobilier'])
          or exists (
            select 1 from public.organization_members current_member
            where current_member.organization_id = target_member.organization_id
              and current_member.profile_id = auth.uid()
              and current_member.id = target_member.id
              and current_member.status = 'active'
              and current_member.archived_at is null
          )
        ) limit 1
    ), false)
    or exists (
      select 1
      from public.bien_occupants occupant
      join public.biens bien on bien.id = occupant.bien_id
      where occupant.profile_id = target_profile_id
        and occupant.archived_at is null
        and public.is_active_organization_member(bien.organization_id)
    );
$function$;

-- Ouvrir la modification aux gérants.
drop policy if exists profiles_update_policy on public.profiles;
create policy profiles_update_policy on public.profiles
  for update
  using (public.can_manage_profile(id))
  with check (public.can_manage_profile(id));

-- GARDE-FOU INDISPENSABLE : sans lui, autoriser un administrateur d'agence à modifier le
-- profil d'autrui lui permettrait de se hisser (ou de hisser quelqu'un) au rang de super
-- administrateur, donc de prendre le contrôle de toute la plateforme. La RLS ne sait pas
-- protéger une colonne en particulier : il faut un trigger.
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.is_super_admin is distinct from old.is_super_admin and not public.is_super_admin() then
    raise exception 'Seul un super administrateur peut accorder ou retirer ce privilege.';
  end if;
  return new;
end;
$function$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Note : la CRÉATION de comptes (profiles_insert_policy) reste inchangée. Un profil est
-- adossé à un compte auth.users : la création passe par le flux d'invitation côté serveur
-- (client service role), pas par une insertion directe depuis le navigateur.

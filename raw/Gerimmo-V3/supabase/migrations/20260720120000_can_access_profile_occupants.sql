-- Un gestionnaire ne pouvait pas lire le profil de ses propres locataires.
--
-- can_access_profile n'accordait l'accès qu'aux profils MEMBRES d'une organisation
-- (organization_members). Or un locataire n'est pas membre : il est *occupant* d'un bien
-- (bien_occupants). Conséquence : toute fonctionnalité qui a besoin de l'e-mail ou du
-- téléphone d'un locataire lisait 0 ligne.
--
-- Impact constaté (révélé par le test E2E loyers) : à la validation d'une quittance,
-- validateQuittance lit le profil du locataire pour l'e-mailer ; ne trouvant pas d'adresse,
-- il passe l'envoi SANS erreur. La quittance restait au statut 'validee' au lieu de
-- 'envoyee' et le locataire ne recevait jamais rien — un échec silencieux sur un document
-- à valeur légale. Le même angle mort touche les relances et toute notification locataire.
--
-- Correctif : autoriser un membre actif de l'organisation propriétaire du bien à lire le
-- profil des personnes qui occupent ce bien. La condition interroge bien_occupants/biens,
-- jamais profiles : elle ne reproduit donc pas le piège d'auto-interrogation corrigé par
-- les migrations 20260719130000 / 20260719140000.
create or replace function public.can_access_profile(target_profile_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $function$
  select public.is_super_admin()
    or target_profile_id = auth.uid()
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
    -- Occupants (locataires) des biens de mon organisation.
    or exists (
      select 1
      from public.bien_occupants occupant
      join public.biens bien on bien.id = occupant.bien_id
      where occupant.profile_id = target_profile_id
        and occupant.archived_at is null
        and public.is_active_organization_member(bien.organization_id)
    );
$function$;

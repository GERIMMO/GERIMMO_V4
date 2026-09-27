-- AUDIT SÉCURITÉ DU 27/09 — MINEUR : LES CHANGEMENTS DE RÔLE N'ÉTAIENT PAS TRACÉS.
--
-- Le Socle de sécurité demande que les « modifications de rôle » aillent au
-- journal d'audit (3 ans). Aucun déclencheur ne suivait `memberships`, et les
-- politiques `memberships_insert/update` laissaient un admin d'agence, par
-- l'API, ajouter N'IMPORTE QUEL compte (UUID) à son agence ou changer le
-- compte ou l'organisation d'une adhésion.
--
-- LA CORRECTION.
--  · Tout ajout, changement (rôle, statut, compte, organisation) ou retrait
--    d'adhésion est inscrit dans `audit_log` par un déclencheur — quel que
--    soit le chemin (fonction de la base, supervision, API).
--  · L'application n'écrit jamais `memberships` directement : toutes les
--    créations passent par des fonctions de la base (ouverture d'organisation,
--    invitation, espace propriétaire, artisan, fin de bail). Le droit INSERT
--    direct est retiré à `authenticated` ; l'UPDATE direct est ramené aux
--    seules colonnes `role` et `status` (plus jamais `account_id` ni
--    `organization_id`).
--
-- Idempotent : CREATE OR REPLACE, DROP TRIGGER IF EXISTS, REVOKE/GRANT.

create or replace function public.journaliser_adhesion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
    v_action := 'adhesion_creee';
    v_details := jsonb_build_object('membership_id', new.id, 'compte', new.account_id,
                                    'role', new.role, 'statut', new.status);
  elsif tg_op = 'UPDATE' then
    if new.role is not distinct from old.role and new.status is not distinct from old.status
       and new.account_id is not distinct from old.account_id
       and new.organization_id is not distinct from old.organization_id then
      return new;
    end if;
    v_action := case when new.role is distinct from old.role then 'role_modifie' else 'adhesion_modifiee' end;
    v_details := jsonb_build_object('membership_id', new.id, 'compte', new.account_id,
                                    'role_avant', old.role, 'role', new.role,
                                    'statut_avant', old.status, 'statut', new.status)
                 || case when new.account_id is distinct from old.account_id
                         then jsonb_build_object('compte_avant', old.account_id) else '{}'::jsonb end
                 || case when new.organization_id is distinct from old.organization_id
                         then jsonb_build_object('organisation_avant', old.organization_id) else '{}'::jsonb end;
  else
    v_action := 'adhesion_retiree';
    v_details := jsonb_build_object('membership_id', old.id, 'compte', old.account_id,
                                    'role', old.role, 'statut', old.status);
  end if;

  insert into public.audit_log (account_id, organization_id, action, details)
  values ((select auth.uid()),
          case when tg_op = 'DELETE' then old.organization_id else new.organization_id end,
          v_action, v_details);
  return coalesce(new, old);
end $$;

revoke execute on function public.journaliser_adhesion() from public, anon, authenticated;

drop trigger if exists memberships_audit on public.memberships;
create trigger memberships_audit
  after insert or update or delete on public.memberships
  for each row execute function public.journaliser_adhesion();

revoke insert, update on public.memberships from authenticated;
grant update (role, status) on public.memberships to authenticated;

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();

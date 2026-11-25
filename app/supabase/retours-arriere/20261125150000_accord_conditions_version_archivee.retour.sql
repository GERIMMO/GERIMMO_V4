-- RETOUR ARRIÈRE de 20261125150000_accord_conditions_version_archivee.sql (décisions du 24/11, lot D4, reprise :
-- relecture D4R, défauts D4R-01 et D4R-03 ; migration réécrite le 25/11, relecture de la fusion, R-01).
--
-- 1. Rend à `abonnements_sans_accord_conditions(text)` son texte exact de 20261024100000 (et son commentaire) : la
--    non-reconduction compte de nouveau tout accord à la version, même sans empreinte du texte archivé. Mêmes droits
--    (clé de service seulement).
-- 2. `accepter_cgu(text, text, text)` : la migration (réécrite) ne la modifie plus ; ce retour repose son texte exact de
--    20261024090000, le même, ce qui défait aussi la première écriture de la migration si elle avait été jouée sur un
--    banc. Mêmes droits (authenticated).
-- 3. Retire le déclencheur `relance_loyer_manuelle_sans_reprise` et sa fonction : une relance de loyer envoyée à la
--    main redevient reprise d'elle-même pendant 15 minutes après un échec (état du lot D4). Les lignes déjà en file
--    gardent « sans reprise » (leur copie chiffrée est effacée) : rien n'est renvoyé du fait de ce retour.
--
-- RIEN N'EST EFFACÉ : les acceptations enregistrées restent (ajout seul), les courriels et leurs journaux aussi.
-- ORDRE : avant les retours de 20261024100000 (qui retire `abonnements_sans_accord_conditions`) et de 20261024090000
-- (qui retire `accepter_cgu(text, text, text)`). Indépendant de la chaîne des e-mails (aucune tête touchée) et de la
-- chaîne « Ordre complet » du jour de Paris (rien ne cite la fonction du jour). Le code reste correct sans la
-- migration : la preuve d'accord de l'application ignore une ligne sans empreinte.
-- Rejouable : sur un schéma déjà revenu, les textes reposés sont les mêmes et le déclencheur est déjà absent.
do $retour_atomique$
begin
  perform set_config('lock_timeout', '10s', true);
  if to_regclass('public.courriels_durables') is not null then
    drop trigger if exists relance_loyer_manuelle_sans_reprise on public.courriels_durables;
  end if;
  drop function if exists public.courriels_relance_manuelle_sans_reprise();
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where left(version, 14) = '20261125150000';
  end if;
  if to_regprocedure('public.abonnements_sans_accord_conditions(text)') is not null then
    execute $sql$
create or replace function public.abonnements_sans_accord_conditions(p_version text)
returns table (organization_id uuid, organisation text, stripe_subscription_id text, periode_fin timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'Accès réservé au traitement' using errcode = '42501';
  end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  return query
    select a.organization_id, o.name::text, a.stripe_subscription_id, a.periode_fin
      from public.abonnements a
      join public.organizations o on o.id = a.organization_id
     where a.stripe_subscription_id is not null
       and not coalesce(a.annulation_demandee, false)
       and coalesce(a.stripe_statut, '') in ('active', 'trialing', 'past_due', 'unpaid')
       and o.status <> 'archivee'
       -- Au moins un responsable a accepté une version des conditions clients : l'écran a pu lui être montré.
       and exists (
         select 1
           from public.memberships m
           join public.acceptations_cgu c on c.account_id = m.account_id
          where m.organization_id = a.organization_id
            and m.status = 'active'
            and m.role in ('admin_agence', 'proprietaire_direct')
            and c.document = 'conditions_clients')
       -- Aucun responsable n'a accepté cette version.
       and not exists (
         select 1
           from public.memberships m
           join public.acceptations_cgu c on c.account_id = m.account_id
          where m.organization_id = a.organization_id
            and m.status = 'active'
            and m.role in ('admin_agence', 'proprietaire_direct')
            and c.document = 'conditions_clients'
            and c.version = btrim(p_version))
     order by a.periode_fin nulls last, a.organization_id;
end $$;
    $sql$;
    revoke all on function public.abonnements_sans_accord_conditions(text) from public, anon, authenticated;
    grant execute on function public.abonnements_sans_accord_conditions(text) to service_role;
    comment on function public.abonnements_sans_accord_conditions(text) is
      'Abonnements vivants dont aucun responsable n''a accepté cette version des conditions clients (mais une autre, oui) : la tâche quotidienne les programme pour ne pas être reconduits (24/10/2026, plan de conformité R19). Clé de service seulement.';
  end if;
  if to_regprocedure('public.accepter_cgu(text, text, text)') is null then return; end if;
  execute $sql$
create or replace function public.accepter_cgu(
  p_version text,
  p_source text default 'compte',
  p_document text default 'conditions_clients'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  if p_document is null or p_document not in ('conditions_clients', 'conditions_artisans', 'regles_invites') then
    raise exception 'Document des conditions invalide' using errcode = '22023';
  end if;
  -- L'ouverture d'un espace propriétaire fait accepter les conditions clients, rien d'autre.
  if p_source = 'espace_proprietaire' and p_document <> 'conditions_clients' then
    raise exception 'Document des conditions invalide pour un espace propriétaire' using errcode = '22023';
  end if;
  insert into public.acceptations_cgu (account_id, version, source, document)
  values (v_uid, btrim(p_version),
          case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end,
          p_document);
end $$;
  $sql$;
  revoke execute on function public.accepter_cgu(text, text, text) from public, anon;
  grant execute on function public.accepter_cgu(text, text, text) to authenticated;
end $retour_atomique$;

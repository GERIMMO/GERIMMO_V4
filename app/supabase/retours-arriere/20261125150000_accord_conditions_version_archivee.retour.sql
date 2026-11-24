-- RETOUR ARRIÈRE de 20261125150000_accord_conditions_version_archivee.sql (décisions du 24/11, lot D4, reprise :
-- relecture D4R, défauts D4R-01 et D4R-03).
--
-- 1. Rend à `accepter_cgu(text, text, text)` son texte exact de 20261024090000 : une version des conditions clients
--    non archivée s'enregistre de nouveau pour la source « compte » (ligne sans empreinte). Mêmes droits.
-- 2. Retire le déclencheur `relance_loyer_manuelle_sans_reprise` et sa fonction : une relance de loyer envoyée à la
--    main redevient reprise d'elle-même pendant 15 minutes après un échec (état du lot D4). Les lignes déjà en file
--    gardent « sans reprise » (leur copie chiffrée est effacée) : rien n'est renvoyé du fait de ce retour.
--
-- RIEN N'EST EFFACÉ : les acceptations enregistrées restent (ajout seul), les courriels et leurs journaux aussi.
-- ORDRE : avant le retour de 20261024090000 (qui retire `accepter_cgu(text, text, text)`). Indépendant de la chaîne
-- des e-mails (aucune tête touchée) et de la chaîne « Ordre complet » du jour de Paris (rien ne cite la fonction du
-- jour). Le code de la reprise D4 reste correct sans la migration : la preuve d'accord ignore une ligne sans empreinte.
-- Rejouable : sur un schéma déjà revenu, le texte reposé est le même et le déclencheur est déjà absent.
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

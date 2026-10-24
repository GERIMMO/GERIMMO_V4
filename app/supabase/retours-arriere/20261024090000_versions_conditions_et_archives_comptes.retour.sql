-- Retour de 20261024090000 (conformité V1, lot 1A : archive des versions des conditions, document et empreinte des
-- acceptations, archive des comptes). Remettre d'abord le code précédent : les pages /conditions/versions, le bouton
-- d'archivage de /admin/sante et son contrôle lisent les objets retirés ici (le code précédent n'appelle
-- `accepter_cgu` qu'avec p_version et p_source, que la fonction rétablie accepte).
--
-- Ce qui est défait :
--  · `accepter_cgu(text, text, text)` redevient `accepter_cgu(text, text)`, texte exact de 20260927148000 (mêmes
--    droits : authenticated, jamais public ni anon) ;
--  · le contrôle `acceptations_sans_version_archivee()`, la fonction `archiver_version_conditions(…)` et sa forme sans
--    présentation `versions_conditions_sans_presentation(text)`, la purge
--    `purger_archives_comptes()` et le déclencheur qui pose l'empreinte des acceptations ;
--  · les tables `versions_conditions` et `archives_comptes`, avec leurs déclencheurs et leurs fonctions, SEULEMENT SI
--    ELLES SONT VIDES. Une table qui porte une version archivée ou l'archive d'un compte est CONSERVÉE telle quelle
--    (ajout seul, droits et politiques compris) : ce sont des preuves ; leur sort revient au dirigeant. Le script dit
--    alors ce qu'il garde.
-- Ce qui est conservé : les colonnes `acceptations_cgu.document` et `acceptations_cgu.empreinte_sha256` et leurs
-- contraintes (elles portent la nature des acceptations déjà enregistrées ; le code précédent les ignore).
--
-- Une seule instruction DO atomique : seule en autocommit, ou intégralement annulable dans une transaction externe,
-- qu'elle ne valide jamais. Rejouée, elle ne fait rien de plus. Dernier des retours du plan de conformité dans la chaîne « Ordre complet » du LISEZ-MOI, bien que la
-- migration ne cite pas `aujourdhui_paris()` (retours du plan de conformité du 24/10, ordre inverse du manifeste : 140000,
-- 130000, 120000, 110000, 100000, 090000). La marche avant se rejoue ensuite sans rien perdre.
do $retour_atomique$
declare
  v_versions bigint := 0;
  v_archives bigint := 0;
begin
  perform set_config('lock_timeout', '10s', true);

  -- Finitions du 24/10 (relecture transverse, point 4) : jamais hors de son ordre. Tant qu'une migration plus récente
  -- du plan de conformité (jusqu'à 20261024140000) est inscrite, son retour passe d'abord ; joué seul, celui-ci
  -- réussissait et cassait les purges de nuit, qui citent encore ce qu'il retire.
  if to_regclass('supabase_migrations.schema_migrations') is not null
     and exists (select 1 from supabase_migrations.schema_migrations
                  where left(version, 14) > '20261024090000' and left(version, 14) <= '20261024140000') then
    raise exception 'Retour 20261024090000 refusé : migration(s) plus récente(s) du plan de conformité encore inscrite(s) (%) ; jouer d''abord leur retour, dans l''ordre inverse (140000, 130000, 120000, 110000, 100000, 090000)',
      (select string_agg(version, ', ' order by version) from supabase_migrations.schema_migrations
        where left(version, 14) > '20261024090000' and left(version, 14) <= '20261024140000') using errcode = '55000';
  end if;

  -- 1. accepter_cgu à deux paramètres.
  drop function if exists public.accepter_cgu(text, text, text);
  create or replace function public.accepter_cgu(p_version text, p_source text default 'compte')
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $fonction$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_version is null or btrim(p_version) = '' or length(p_version) > 40 then
    raise exception 'Version des conditions invalide' using errcode = '22023';
  end if;
  insert into public.acceptations_cgu (account_id, version, source)
  values (v_uid, btrim(p_version),
          case when p_source in ('espace_proprietaire', 'compte') then p_source else 'compte' end);
end $fonction$;
  revoke execute on function public.accepter_cgu(text, text) from public, anon;
  grant execute on function public.accepter_cgu(text, text) to authenticated;

  -- 2. Contrôle, archivage, purge, empreinte des acceptations.
  drop function if exists public.acceptations_sans_version_archivee();
  drop function if exists public.archiver_version_conditions(text, text, date, text, text, jsonb, text, text);
  drop function if exists public.versions_conditions_sans_presentation(text);
  drop function if exists public.purger_archives_comptes();
  drop trigger if exists acceptations_cgu_empreinte_archivee on public.acceptations_cgu;
  drop function if exists public.acceptations_cgu_empreinte();
  drop index if exists public.acceptations_cgu_document_version_idx;

  -- 3. Les deux tables, si elles sont vides.
  if to_regclass('public.versions_conditions') is not null then
    execute 'select count(*) from public.versions_conditions' into v_versions;
    if v_versions = 0 then
      drop table public.versions_conditions;
      drop function if exists public.versions_conditions_empreinte();
      drop function if exists public.versions_conditions_ajout_seul();
    else
      raise notice 'public.versions_conditions conservée : % version(s) archivée(s) (preuves ; décision du dirigeant requise avant toute suppression).', v_versions;
    end if;
  end if;
  if to_regclass('public.archives_comptes') is not null then
    execute 'select count(*) from public.archives_comptes' into v_archives;
    if v_archives = 0 then
      drop table public.archives_comptes;
      drop function if exists public.archives_comptes_echeances();
      drop function if exists public.archives_comptes_garde();
    else
      raise notice 'public.archives_comptes conservée : % archive(s) de compte (preuves ; décision du dirigeant requise avant toute suppression).', v_archives;
    end if;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where left(version, 14) = '20261024090000';  -- les deux formes : production (14 chiffres) et CI (nom du fichier)
  end if;
end;
$retour_atomique$;

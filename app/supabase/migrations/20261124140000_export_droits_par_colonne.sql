-- Décisions du dirigeant du 24/11/2026, lot D1 (seconde reprise) — l'export complet d'un espace retrouve la table des
-- notes d'artisans (constat C1 de la relecture du commit 46be3a92).
--
-- CE QUI N'ALLAIT PAS. La migration 20261124120000 a remplacé, sur `artisan_evaluations`, le droit de lecture de la
-- TABLE par un droit sur chacune de ses colonnes sauf `retrait_motif` (le motif du retrait d'une note n'est lu que par
-- son auteur). Or `lignes_lisibles_par`, qui prépare l'export complet d'un espace et l'export d'un artisan, ne rendait
-- rien dès que le rôle des comptes connectés n'avait pas le droit de lecture de la table ENTIÈRE : la table des notes
-- avait disparu de l'archive du gérant (11 tables au lieu de 12 dans la sonde du relecteur).
--
-- CE QUE POSE CETTE MIGRATION. Une seule ligne de `lignes_lisibles_par` change : le test « le rôle lit la table
-- entière » devient « le rôle lit au moins une colonne de la table ». Le reste de la fonction est recopié à
-- l'identique : la liste des colonnes rendues reste filtrée colonne par colonne (donc `retrait_motif` ne sort pas),
-- les règles de lecture (RLS) de la table sont toujours rejouées avec le jeton du demandeur, la fonction reste
-- fermée à tous les rôles (seules les deux fonctions d'export l'appellent). Aucune règle de lecture n'est touchée,
-- aucune donnée n'est modifiée.
--
-- LES TABLES POUR LESQUELLES CE TEST CHANGE DE RÉPONSE (relevé du 24/11 sur les deux bases du banc : ce sont les
-- seules tables où les comptes connectés ont un droit de lecture par colonne sans droit sur la table entière) :
--   · artisan_evaluations     : revient dans l'export de l'espace, sans `retrait_motif`. C'est le but.
--   · courriels_durables      : file d'envoi des courriels. Sa seule règle de lecture est réservée à la supervision
--   · notification_intentions   avec double authentification ; l'export rejoue les règles avec un jeton simple (aal1) :
--                               aucune ligne n'est rendue, ces deux tables restent donc hors de l'archive.
--   · artisans                : jamais lue par `lignes_lisibles_par` (ni colonne `organization_id`, ni clé vers une
--   · supervision_identite      table d'un espace ou vers la fiche d'un artisan) : rien ne change.
-- Le test tests/export-droits-par-colonne-base.test.ts tient cette liste : une sixième table à droits par colonne le
-- fait échouer, pour qu'on la relise avant qu'elle n'entre dans une archive.
--
-- DEUX POINTS NOTÉS ICI PARCE QU'ILS NE PEUVENT PAS L'ÊTRE DANS LES MIGRATIONS DÉJÀ RELUES (constats M-b et M-c).
--   · M-b, 20261124120000 : un ANCIEN locataire (adhésion inactive ou retirée) lit encore, par
--     `retraits_de_mes_notes`, le motif du retrait de SA note. C'est voulu (décision du pilote du 24/11) : c'est sa
--     propre note, et l'écran qui appelle la fonction reste gardé par l'accès à l'espace. Le cas est tenu par
--     tests/motif-retrait-auteur-base.test.ts.
--   · M-c, 20261124110000 : rejouer SEULE l'ancienne migration 20261019121000 retire puis rend au visiteur le droit
--     de lire les colonnes des articles, sans la colonne `origine` : la page publique d'un article ne peut alors plus
--     être lue. Après un tel rejeu, rejouer 20261124110000 (elle rend le droit sur `origine`). La page affiche
--     désormais un écran d'erreur dans ce cas, et non plus « Article introuvable ».
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261124140000_export_droits_par_colonne.retour.sql
set local lock_timeout = '10s';

create or replace function public.lignes_lisibles_par(p_table regclass, p_filtre text, p_valeur uuid, p_compte uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_role text := current_setting('request.jwt.claim.role', true);
  v_cols text;
  v_permissives text;
  v_restrictives text;
  v_rls boolean;
  v_nom text;
  v_res jsonb;
begin
  if p_table is null or p_compte is null or p_filtre is null then return '[]'::jsonb; end if;
  -- Au moins une colonne lisible (et non plus la table entière) : une table dont une colonne est fermée reste exportée,
  -- sans cette colonne (la liste v_cols, juste dessous, ne retient que les colonnes accordées).
  if not pg_catalog.has_any_column_privilege('authenticated', p_table, 'SELECT') then return '[]'::jsonb; end if;
  select pg_catalog.quote_ident(c.relname) into v_nom from pg_catalog.pg_class c where c.oid = p_table;
  select string_agg(format('%s.%I', v_nom, a.attname), ', ' order by a.attnum) into v_cols
    from pg_catalog.pg_attribute a
   where a.attrelid = p_table and a.attnum > 0 and not a.attisdropped
     and pg_catalog.has_column_privilege('authenticated', p_table, a.attnum, 'SELECT');
  if v_cols is null then return '[]'::jsonb; end if;
  select c.relrowsecurity into v_rls from pg_catalog.pg_class c where c.oid = p_table;
  if v_rls then
    select string_agg('(' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true') || ')', ' or ')
             filter (where p.polpermissive),
           string_agg('(' || coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), 'true') || ')', ' and ')
             filter (where not p.polpermissive)
      into v_permissives, v_restrictives
      from pg_catalog.pg_policy p
     where p.polrelid = p_table and p.polcmd in ('r', '*')
       and (0::oid = any(p.polroles) or 'authenticated'::regrole::oid = any(p.polroles));
    if v_permissives is null then return '[]'::jsonb; end if;
  end if;
  perform pg_catalog.set_config('request.jwt.claims',
    jsonb_build_object('sub', p_compte, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', p_compte::text, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true); end if;
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text), ''[]''::jsonb) from (select %s from %s where (%s) and (%s) and (%s)) x',
                 v_cols, p_table, replace(p_filtre, '$T', v_nom), coalesce(v_permissives, 'true'), coalesce(v_restrictives, 'true'))
    into v_res using p_valeur;
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', v_sub, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', v_role, true); end if;
  return v_res;
exception when others then
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_sub is not null then perform pg_catalog.set_config('request.jwt.claim.sub', v_sub, true); end if;
  if v_role is not null then perform pg_catalog.set_config('request.jwt.claim.role', v_role, true); end if;
  raise;
end $$;
revoke all on function public.lignes_lisibles_par(regclass, text, uuid, uuid) from public, anon, authenticated, service_role;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';

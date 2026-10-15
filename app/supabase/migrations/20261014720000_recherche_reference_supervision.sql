-- X18 (fiche SA-09), décision du dirigeant du 14/10/2026 (recommandation ratifiée) : la recherche de la console de
-- supervision retrouve un bien, un lot ou un incident PAR SA RÉFÉRENCE ; le résultat est un lien vers la fiche de
-- l'organisation concernée, jamais vers la donnée elle-même. Entrer dans l'espace client reste le geste tracé existant
-- (D08 : `traversee_espace` / `traversee_action`, `log_sa_access`).
--
-- Constat (audit du 13/10, S-RECHERCHE) : « INC-2026-0003 » et « Lot 1 » répondaient « Aucun client trouvé ». La recherche
-- ne couvrait que les organisations, les artisans et les comptes ; un incident ne s'atteignait que par une alerte ou en
-- entrant dans l'espace de l'organisation.
--
-- Ce que fait cette migration : elle CRÉE une fonction, `rechercher_reference_supervision(texte)`. Aucune table, aucune
-- politique, aucun droit existant, aucune ligne existante n'est modifié ; aucune donnée financière n'est lue.
--
--   · Réservée au superviseur actif, en second facteur : mêmes gardes que la console (`is_super_admin()` : adhésion
--     super_admin active ET session AAL2). anon n'a pas le droit d'exécution ; un compte authentifié quelconque est refusé.
--   · La référence est EXACTE, jamais un début ni un motif : un identifiant complet (bien, lot, incident), un numéro
--     d'incident complet (« INC-2026-0003 », casse indifférente) ou le nom complet d'un bien (sa « référence interne ») ou
--     d'un lot (casse et espaces indifférents). Une référence partielle ne trouve rien : aucune organisation ne fuit.
--     Les comparaisons sont des égalités, `%` et `_` n'y sont que des caractères.
--   · Le résultat ne dit que le TYPE d'objet trouvé et l'ORGANISATION (identifiant, nom), avec le nombre d'objets de ce
--     type qui portent cette référence dans cette organisation : ni adresse, ni nom de bien ou de lot, ni locataire, ni
--     identifiant de l'objet. Au plus huit lignes ; `groupes` dit combien il y en a en tout.
--   · La recherche est tracée au journal de supervision (`audit_log`, action `recherche_reference`) dans la même
--     transaction : pas de résultat sans trace. Le détail garde la forme de la saisie, le nombre d'objets trouvés et leurs
--     identifiants (organisations, objets : au plus vingt de chaque), DANS L'ORDRE DE L'ÉCRAN : les groupes rendus sont
--     calculés avant la trace, si bien que toute organisation affichée y figure, même quand la référence (« Lot unique »,
--     « INC-2026-0001 ») se retrouve dans plus de vingt organisations (relecture du 15/10). Il ne recopie le texte saisi
--     que lorsqu'il est un identifiant ou un numéro d'incident (ni l'un ni l'autre n'est une donnée personnelle), JAMAIS
--     un nom, qui est souvent une adresse. La ligne est rattachée à l'organisation quand une seule est trouvée. La même recherche refaite dans la
--     minute (même compte, même détail) n'écrit pas de seconde ligne, comme les consultations (`log_sa_access`) : la
--     fenêtre de recherche interroge la base à mesure de la saisie.
--   · Un texte de moins de 2 ou de plus de 120 caractères ne lit rien et n'écrit rien.
--
-- Rejouable sans effet : le bloc cherche la marque de cette décision dans la définition en vigueur et, si elle y est, ne
-- fait rien (une modification ultérieure de la fonction, faite en relisant sa définition, n'est donc jamais écrasée) ; si
-- une fonction du même nom existe SANS la marque, la migration s'arrête.
--
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration. Retour arrière :
-- app/supabase/retours-arriere/20261014720000_recherche_reference_supervision.retour.sql.

do $correctif$
declare v_def text;
begin
  if to_regprocedure('public.rechercher_reference_supervision(text)') is not null then
    select pg_get_functiondef('public.rechercher_reference_supervision(text)'::regprocedure) into v_def;
    if position('Décision X18 du 14/10 (SA-09)' in v_def) > 0 then return; end if;
    raise exception 'X18 : une fonction rechercher_reference_supervision(text) existe déjà sans la marque de cette décision';
  end if;

  execute $fonction$
create function public.rechercher_reference_supervision(p_reference text)
returns table (type_objet text, organisation_id uuid, organisation_nom text, nombre integer, groupes integer)
language plpgsql volatile security definer set search_path = '' as $corps$
#variable_conflict use_column
-- Décision X18 du 14/10 (SA-09) : recherche d'un bien, d'un lot ou d'un incident par sa référence exacte, réservée à la
-- supervision ; résultat = type d'objet et organisation, sans contenu ; chaque recherche est tracée au journal.
declare
  v_moi uuid := (select auth.uid());
  v_ref text := btrim(regexp_replace(coalesce(p_reference, ''), '\s+', ' ', 'g'));
  v_forme text;
  v_id uuid;
  v_numero text;
  v_trouves jsonb;
  v_groupes jsonb;
  v_orgs jsonb;
  v_nb_orgs integer;
  v_nb_groupes integer;
  v_org uuid;
  v_details jsonb;
begin
  if v_moi is null or public.is_super_admin() is not true then
    raise exception 'Accès réservé à la supervision' using errcode = '42501';
  end if;
  if char_length(v_ref) < 2 or char_length(v_ref) > 120 then
    return;
  end if;

  if v_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_forme := 'identifiant';
    v_id := v_ref::uuid;
    select coalesce(jsonb_agg(jsonb_build_object('t', t.t, 'id', t.id, 'org', t.org) order by t.t, t.id), '[]'::jsonb) into v_trouves
      from (select 'bien'::text as t, b.id, b.organization_id as org from public.biens b where b.id = v_id
            union all
            select 'lot'::text, l.id, l.organization_id from public.lots l where l.id = v_id
            union all
            select 'incident'::text, i.id, i.organization_id from public.incidents i where i.id = v_id) t;
  elsif v_ref ~* '^INC-[0-9]{4}-[0-9]{4,}$' then
    v_forme := 'numero';
    v_numero := upper(v_ref);
    select coalesce(jsonb_agg(jsonb_build_object('t', 'incident', 'id', i.id, 'org', i.organization_id) order by i.id), '[]'::jsonb) into v_trouves
      from public.incidents i where i.numero = v_numero;
  else
    v_forme := 'libelle';
    v_ref := lower(v_ref);
    select coalesce(jsonb_agg(jsonb_build_object('t', t.t, 'id', t.id, 'org', t.org) order by t.t, t.id), '[]'::jsonb) into v_trouves
      from (select 'bien'::text as t, b.id, b.organization_id as org from public.biens b
             where lower(btrim(regexp_replace(b.nom, '\s+', ' ', 'g'))) = v_ref
            union all
            select 'lot'::text, l.id, l.organization_id from public.lots l
             where lower(btrim(regexp_replace(l.nom, '\s+', ' ', 'g'))) = v_ref) t;
  end if;

  -- Les groupes (type d'objet × organisation) dans l'ordre de l'écran, calculés UNE fois, avant la trace : la réponse en
  -- rend les huit premiers, la trace suit le même ordre. Une organisation affichée est donc toujours tracée.
  select coalesce(jsonb_agg(jsonb_build_object('t', g.t, 'org', g.org, 'nom', o.name, 'nombre', g.nombre)
                   order by array_position(array['bien', 'lot', 'incident'], g.t), o.name, o.id), '[]'::jsonb),
         count(*)::integer
    into v_groupes, v_nb_groupes
    from (select e->>'t' as t, (e->>'org')::uuid as org, count(*)::integer as nombre
            from jsonb_array_elements(v_trouves) e group by 1, 2) g
    join public.organizations o on o.id = g.org;
  -- Chaque organisation au rang de son premier groupe : celles qui sont affichées viennent en tête.
  select coalesce(jsonb_agg(to_jsonb(r.org) order by r.rang), '[]'::jsonb), count(*)::integer into v_orgs, v_nb_orgs
    from (select (a.x->>'org')::uuid as org, min(a.n) as rang
            from jsonb_array_elements(v_groupes) with ordinality a(x, n) group by 1) r;
  v_org := case when v_nb_orgs = 1 then (v_orgs->>0)::uuid end;

  -- La trace : jamais le texte d'un nom (souvent une adresse) ; des identifiants, des nombres, des codes courts.
  v_details := jsonb_build_object(
      'forme', v_forme,
      'resultats', jsonb_array_length(v_trouves),
      'organisations', (select coalesce(jsonb_agg(a.x order by a.n), '[]'::jsonb) from jsonb_array_elements(v_orgs) with ordinality a(x, n) where a.n <= 20),
      'objets', (select coalesce(jsonb_agg(z.id order by z.k), '[]'::jsonb)
                   from (select e->'id' as id, row_number() over (order by g.n, (e->>'id')::uuid) as k
                           from jsonb_array_elements(v_trouves) e
                           join jsonb_array_elements(v_groupes) with ordinality g(x, n)
                             on g.x->>'t' = e->>'t' and g.x->>'org' = e->>'org') z
                  where z.k <= 20))
    || case v_forme when 'identifiant' then jsonb_build_object('reference', v_id::text)
                    when 'numero' then jsonb_build_object('reference', v_numero)
                    else '{}'::jsonb end;
  if not exists (
    select 1 from public.audit_log l
     where l.account_id = v_moi and l.action = 'recherche_reference'
       and l.organization_id is not distinct from v_org
       and l.details = v_details
       and l.created_at > now() - interval '1 minute') then
    insert into public.audit_log (account_id, organization_id, action, details)
    values (v_moi, v_org, 'recherche_reference', v_details);
  end if;

  return query
    select g.x->>'t', (g.x->>'org')::uuid, g.x->>'nom', (g.x->>'nombre')::integer, v_nb_groupes
      from jsonb_array_elements(v_groupes) with ordinality g(x, n)
     order by g.n
     limit 8;
end
$corps$
$fonction$;
end $correctif$;

comment on function public.rechercher_reference_supervision(text) is
  'Décision X18 (SA-09) : un bien, un lot ou un incident par sa référence exacte (identifiant, numéro d''incident, nom complet). Rend le type d''objet et l''organisation, sans contenu ; trace la recherche (audit_log, recherche_reference). Superviseur actif en AAL2 seulement.';
revoke all on function public.rechercher_reference_supervision(text) from public, anon;
grant execute on function public.rechercher_reference_supervision(text) to authenticated;

select public.fermer_fonctions_a_anon();

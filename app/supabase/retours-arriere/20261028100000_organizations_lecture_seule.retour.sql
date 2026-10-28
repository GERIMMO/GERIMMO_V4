-- Retour arrière de 20261028100000_organizations_lecture_seule.sql — audit final du 27/10/2026 (DRT-V01, DRT-04, PUB-01).
-- REMETTRE D'ABORD LE CODE PRÉCÉDENT : le bandeau et la page Abonnement appellent org_suspendue_par_supervision.
-- Défait, dans l'ordre : la politique restrictive « second_facteur » (toutes les tables de public, storage.objects),
-- auth.uid() rendu aux fonctions SECURITY DEFINER (remplacement inverse de public.uid_second_facteur()), abonnement_appliquer (texte en vigueur avant la
-- migration : un événement Stripe lève de nouveau une suspension de la supervision), puis les fonctions ajoutées et le
-- déclencheur abonnement_organizations. Aucune donnée n'est touchée ; les lignes « abonnement_statut_retenu » du
-- journal sont conservées. RÉINTRODUIT : PUB-01 côté données (un mot de passe seul lit tout par l'API pour un compte
-- à second facteur), DRT-V01 et la levée d'une suspension par Stripe. La garde centrale de l'API (pgrst.db_pre_request,
-- exiger_second_facteur) est retirée en premier ; fermer_fonctions_a_anon, demander_export_complet et
-- lignes_lisibles_par retrouvent leur texte d'avant (la preuve récente redevient « second facteur ou mot de passe de
-- moins de quinze minutes »).
begin;
set local lock_timeout = '10s';
-- D'abord la garde centrale de l'API : PostgREST cesse d'appeler exiger_second_facteur (relue au « reload config »,
-- envoyé à la validation de cette transaction) avant qu'elle ne disparaisse plus bas.
do $retour_garde$
begin
  if to_regrole('authenticator') is not null then
    alter role authenticator reset pgrst.db_pre_request;
  end if;
end $retour_garde$;
notify pgrst, 'reload config';
do $retour$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_policy p on p.polrelid = c.oid
            where c.relnamespace = 'public'::regnamespace and p.polname = 'second_facteur' loop
    execute format('drop policy if exists second_facteur on public.%I', t.relname);
  end loop;
end $retour$;
drop policy if exists second_facteur on storage.objects;
do $retour_uid$
declare f record;
begin
  -- Les fonctions SECURITY DEFINER retrouvent auth.uid() (opération inverse exacte de poser_gardes_second_facteur).
  for f in select p.oid from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prosrc like '%public.uid_second_facteur()%'
              and p.proname <> 'uid_second_facteur' loop
    execute replace(pg_get_functiondef(f.oid), 'public.uid_second_facteur()', 'auth.uid()');
  end loop;
end $retour_uid$;
CREATE OR REPLACE FUNCTION public.abonnement_appliquer(p_customer text, p_subscription text, p_statut text, p_quantite integer, p_periode_fin timestamp with time zone, p_annulation boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_type public.organization_type;
  v_grille text;
  v_statut_actuel public.organization_status;
  v_essai_fin date;
  v_cible public.organization_status;
  v_defaut_avant date;
  v_premiere boolean;
begin
  select a.organization_id, a.paiement_en_defaut_depuis, a.premiere_facture_payee
    into v_org, v_defaut_avant, v_premiere
  from public.abonnements a where a.stripe_customer_id = btrim(p_customer);
  if v_org is null then
    return null;
  end if;
  select o.type, o.status, o.essai_fin, o.grille_tarifaire
    into v_type, v_statut_actuel, v_essai_fin, v_grille
  from public.organizations o where o.id = v_org;

  update public.abonnements set
    stripe_subscription_id = coalesce(nullif(btrim(coalesce(p_subscription,'')),''), stripe_subscription_id),
    stripe_statut = p_statut,
    quantite = coalesce(p_quantite, quantite),
    montant_mensuel_cents = case when v_grille = 'historique'
      then public.montant_abonnement_cents(v_type, coalesce(p_quantite, quantite))
      else montant_mensuel_cents end,
    periode_fin = coalesce(p_periode_fin, periode_fin),
    annulation_demandee = coalesce(p_annulation, false),
    paiement_en_defaut_depuis = case
      when p_statut in ('past_due', 'unpaid')
        then coalesce(paiement_en_defaut_depuis, public.aujourdhui_paris())
      when p_statut in ('active', 'trialing') then null
      else paiement_en_defaut_depuis
    end,
    relances_paiement = case
      when p_statut in ('active', 'trialing') then 0 else relances_paiement end,
    derniere_relance_le = case
      when p_statut in ('active', 'trialing') then null else derniere_relance_le end,
    derniere_synchro = now(),
    derniere_erreur = null,
    updated_at = now()
  where organization_id = v_org;

  if v_statut_actuel = 'archivee' then
    return v_org;
  end if;

  v_cible := case
    when p_statut in ('active', 'trialing') then 'active'::public.organization_status
    -- AUDIT 29/09, point 7 : le délai de quinze jours protège un client qui a
    -- déjà payé et dont la carte expire. Celui dont le PREMIER prélèvement
    -- échoue n'a jamais payé : il suit la règle de l'essai échu — ouvert tant
    -- que son essai court, gelé ensuite.
    when p_statut in ('past_due', 'unpaid') and not coalesce(v_premiere, false) then
      case when v_essai_fin is not null and v_essai_fin >= public.aujourdhui_paris()
           then 'essai'::public.organization_status
           else 'suspendue'::public.organization_status end
    -- Plan du 23/10 (R07) : un client qui a déjà payé garde son statut en « unpaid » comme en « past_due » ; la lecture
    -- seule vient de la date (J+15, org_ecriture_ouverte), la résiliation d'un geste humain, au plus tôt à J+30.
    when p_statut = 'unpaid' then v_statut_actuel
    when p_statut = 'past_due' then v_statut_actuel
    when p_statut = 'incomplete' then v_statut_actuel
    when p_statut in ('canceled', 'unpaid', 'incomplete_expired', 'paused') then
      case when v_essai_fin is not null and v_essai_fin >= public.aujourdhui_paris()
           then 'essai'::public.organization_status
           else 'suspendue'::public.organization_status end
    else v_statut_actuel
  end;

  if v_cible is distinct from v_statut_actuel then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set status = v_cible, updated_at = now()
    where id = v_org;
    perform set_config('gerimmo.systeme', '', true);

    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_statut',
            jsonb_build_object('stripe', p_statut, 'avant', v_statut_actuel,
                               'apres', v_cible, 'souscription', p_subscription));
  end if;

  -- AUDIT 29/09, point 10 : la grille historique ne survit pas à sa
  -- souscription. Terminée, l'organisation relève de la grille du 28/09 —
  -- une nouvelle souscription se fera aux formules actuelles.
  if v_grille = 'historique' and p_statut in ('canceled', 'incomplete_expired') then
    perform set_config('gerimmo.systeme', 'on', true);
    update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
     where id = v_org;
    perform set_config('gerimmo.systeme', '', true);
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'grille_tarifaire_basculee',
            jsonb_build_object('vers', '2026-09-28', 'motif', 'fin_souscription_historique',
                               'souscription', p_subscription));
  end if;

  if v_defaut_avant is null and p_statut in ('past_due', 'unpaid') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_en_defaut',
            jsonb_build_object('stripe', p_statut,
                               'premiere_facture_payee', coalesce(v_premiere, false),
                               'lecture_seule_le', case when coalesce(v_premiere, false)
                                 then public.aujourdhui_paris() + public.delai_defaut_paiement_jours()
                                 else public.aujourdhui_paris() end));
  elsif v_defaut_avant is not null and p_statut in ('active', 'trialing') then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'paiement_regularise',
            jsonb_build_object('en_defaut_depuis', v_defaut_avant));
  end if;

  return v_org;
end;
$function$;
-- fermer_fonctions_a_anon, demander_export_complet et lignes_lisibles_par retrouvent leur texte d'avant (20260911290000,
-- 20261024130000).
create or replace function public.fermer_fonctions_a_anon()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f record;
  -- Aucune fonction du produit n'a besoin d'être appelée sans être connecté :
  -- le seul geste public du site — la demande de devis — écrit dans une table,
  -- sous politique RLS, pas par RPC. Si un jour il en faut une (un webhook
  -- signé, par exemple), elle s'ajoute ICI, avec la raison en commentaire —
  -- et le test cesse alors de la compter.
  v_publiques text[] := array[]::text[];
  v_auth boolean;
  v_svc boolean;
  v_n integer := 0;
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
    order by p.proname
  loop
    if f.proname = any(v_publiques) then continue; end if;

    -- CE QUI SE PASSE AVANT DE RETIRER, ET POURQUOI. Le droit de `anon` peut
    -- venir de deux endroits : une mention explicite, ou le droit de PUBLIC —
    -- celui que PostgreSQL accorde d'office et qui revient après un DROP. Il
    -- faut retirer les deux, sinon on ne ferme rien. Mais PUBLIC couvre AUSSI
    -- `authenticated` et `service_role` : sur une fonction dont c'est la seule
    -- source de droit, le retirer les mettrait dehors avec `anon`, et la moitié
    -- du produit tomberait. On note donc ce qu'ils peuvent AVANT, et on le leur
    -- rend nommément APRÈS. Le droit ne change pour personne sauf `anon`.
    v_auth := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    v_svc := has_function_privilege('service_role', f.oid, 'EXECUTE');

    execute format('revoke execute on function public.%I(%s) from public, anon',
                   f.proname, f.args);
    if v_auth then
      execute format('grant execute on function public.%I(%s) to authenticated',
                     f.proname, f.args);
    end if;
    if v_svc then
      execute format('grant execute on function public.%I(%s) to service_role',
                     f.proname, f.args);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
comment on function public.fermer_fonctions_a_anon() is
  'Retire à anon et à PUBLIC le droit d''exécuter toute fonction du schéma public. À APPELER EN FIN DE TOUTE MIGRATION qui crée ou REFAIT (drop/create) une fonction : un DROP rend les droits par défaut, et la fonction renaît ouverte.';
revoke execute on function public.fermer_fonctions_a_anon() from public, anon, authenticated;
create or replace function public.demander_export_complet(p_org uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_recent boolean;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not exists (select 1 from public.memberships m
                  where m.account_id = v_uid and m.organization_id = p_org and m.status = 'active'
                    and m.role in ('admin_agence', 'proprietaire_direct')) then
    raise exception 'Réservé au titulaire de l''espace' using errcode = '42501';
  end if;
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      or exists (select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) e
                  where e ->> 'method' = 'password'
                    and coalesce((e ->> 'timestamp')::bigint, 0) >= extract(epoch from now())::bigint - 900)
    into v_recent;
  if not v_recent then
    raise exception 'Confirmez votre identité : second facteur, ou nouvelle connexion avec votre mot de passe'
      using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(620240, pg_catalog.hashtext(p_org::text));
  if exists (select 1 from public.exports_complets x
              where x.organisation_id_export = p_org and x.statut in ('demande', 'en_cours')
                and x.demande_le > now() - interval '1 hour') then
    raise exception 'Une archive est déjà en préparation pour cet espace' using errcode = '23505';
  end if;
  if (select count(*) from public.exports_complets x
       where x.organisation_id_export = p_org and x.demande_le > now() - interval '24 hours') >= 3 then
    raise exception 'Trois archives au plus par jour : réessayez demain' using errcode = '54000';
  end if;
  insert into public.exports_complets (organisation_id_export, demande_par) values (p_org, v_uid) returning id into v_id;
  insert into public.audit_log (account_id, organization_id, action, details)
  values (v_uid, p_org, 'export_complet_demande', jsonb_build_object('export_id', v_id));
  return v_id;
end $$;
revoke all on function public.demander_export_complet(uuid) from public, anon;
grant execute on function public.demander_export_complet(uuid) to authenticated;
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
  if not pg_catalog.has_table_privilege('authenticated', p_table, 'SELECT') then return '[]'::jsonb; end if;
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
drop function if exists public.exiger_second_facteur();
drop function if exists public.poser_gardes_second_facteur();
drop function if exists public.uid_second_facteur();
drop function if exists public.niveau_assurance_suffisant();
drop trigger if exists abonnement_organizations on public.organizations;
drop function if exists public.organizations_refuser_ecriture_si_fermee();
drop function if exists public.org_suspendue_par_supervision(uuid);
drop function if exists public.suspension_par_supervision(uuid);
delete from supabase_migrations.schema_migrations where version = '20261028100000';
commit;

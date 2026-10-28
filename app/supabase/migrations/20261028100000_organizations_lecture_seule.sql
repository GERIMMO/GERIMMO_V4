-- La fiche de l'organisation suit la lecture seule — audit final du 27/10/2026 (DRT-V01)
--
-- LE DÉFAUT. `refuser_ecriture_si_fermee` (20260911190000) garde les 84 tables qui portent `organization_id`, mais pas
-- `organizations` elle-même (sa colonne est `id`) : pendant la suspension prononcée par la supervision, ou une fois
-- l'écriture fermée pour impayé, l'administrateur modifiait encore l'IBAN, l'adresse d'expédition des courriers et les
-- envois automatiques par l'API REST, sous le bandeau « lecture seule » (PATCH → 204).
--
-- LA CORRECTION. Un déclencheur propre à la table, dans l'esprit de la garde des autres tables (même code d'erreur
-- 23514) : la mise à jour est refusée quand l'écriture de l'organisation est fermée (`org_ecriture_ouverte`) ET que
-- l'auteur est un gestionnaire de cette organisation (admin d'agence, agent, propriétaire direct) qui n'est pas la
-- supervision. Tout le reste passe comme avant : les tâches du service (`gerimmo.systeme = on`), Stripe et la
-- supervision (`controler_organisation`, `abonnement_appliquer`, `offrir_mois_abonnement`…, exécutés sous une identité
-- qui n'est pas membre gestionnaire ou qui est super-administrateur), et les colonnes de plateforme (statut, type,
-- essai, grille) restent réservées au super-administrateur par `organizations_champs_reserves_sa`.
--
-- La fonction org_suspendue_par_supervision (fin de fichier, DRT-04) dit aux gestionnaires si la fermeture vient de la
-- supervision plutôt que de l'impayé, pour que l'écran ne leur propose pas de « choisir une formule ».
--
-- Second facteur (PUB-01, fin de fichier) : niveau_assurance_suffisant(), politique restrictive « second_facteur » sur
-- toutes les tables de public sous RLS et sur storage.objects, et identité neutralisée (uid_second_facteur) dans les
-- fonctions SECURITY DEFINER appelables par authenticated — poser_gardes_second_facteur(), à rappeler après toute
-- migration qui crée une table ou (re)définit une telle fonction. Et surtout, devant toute l'API (seconde relecture du
-- 28/10) : exiger_second_facteur(), fonction de pré-requête de PostgREST (pgrst.db_pre_request du rôle authenticator),
-- qui refuse toute requête REST, RPC ou GraphQL d'un compte à facteur resté en aal1 ; demander_export_complet exige le
-- second facteur d'un compte qui en a un. Stripe
-- (DRT-04) : abonnement_appliquer ne lève plus une suspension décidée par la supervision.
--
-- Rejouable (create or replace, drop … if exists) ; aucune donnée lue ni réécrite.
-- Retour arrière : supabase/retours-arriere/20261028100000_organizations_lecture_seule.retour.sql

create or replace function public.organizations_refuser_ecriture_si_fermee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Les tâches planifiées et le service se signalent par un réglage local à leur transaction (20260911190000).
  if coalesce(current_setting('gerimmo.systeme', true), '') = 'on' then
    return new;
  end if;
  if not public.org_ecriture_ouverte(new.id)
     and not public.is_super_admin()
     and new.id in (select public.org_ids_avec_roles(
         array['admin_agence','agent','proprietaire_direct']::public.membership_role[])) then
    raise exception
      'Votre espace est en lecture seule : la fiche de l''organisation ne se modifie pas pour le moment. Vos données restent consultables et exportables.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
comment on function public.organizations_refuser_ecriture_si_fermee() is
  'Garde de lecture seule de la table organizations (audit final du 27/10/2026, DRT-V01) : un gestionnaire ne modifie pas la fiche quand l''écriture est fermée ; service, Stripe et supervision passent.';
-- Comme pour la garde des autres tables : jamais exécutable ni posable par anon ou authenticated.
revoke all on function public.organizations_refuser_ecriture_si_fermee() from public, anon, authenticated;

drop trigger if exists abonnement_organizations on public.organizations;
create trigger abonnement_organizations before update on public.organizations
  for each row execute function public.organizations_refuser_ecriture_si_fermee();

-- ── Une suspension décidée par la supervision se dit comme telle (DRT-04) ─────────────────────────────────────────
-- Le statut « suspendue » sert aussi à l'impayé (abonnement_appliquer) : l'écran ne peut pas le lire seul. Une
-- suspension ou un archivage par la supervision (controler_organisation) laisse sa trace dans audit_log, que les
-- gestionnaires ne lisent pas ; cette fonction leur rend la seule réponse utile, oui ou non, pour LEUR organisation :
-- statut suspendu ou archivé ET dernier geste de contrôle (suspendre, archiver, réactiver) = suspendre ou archiver.
-- Même lecture que la réactivation de controler_organisation. Hors de l'organisation : faux, sans rien révéler.
-- La lecture, sans condition d'appelant, réservée au service et aux fonctions (abonnement_appliquer).
create or replace function public.suspension_par_supervision(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select o.status in ('suspendue', 'archivee')
       and (select l.action from public.audit_log l
             where l.organization_id = o.id
               and l.action in ('organisation_suspendue', 'organisation_archivee', 'organisation_reactivee')
             order by l.created_at desc limit 1) in ('organisation_suspendue', 'organisation_archivee')
      from public.organizations o
     where o.id = p_org
  ), false);
$$;
revoke all on function public.suspension_par_supervision(uuid) from public, anon, authenticated;
grant execute on function public.suspension_par_supervision(uuid) to service_role;

-- Pour l'écran : la même réponse, aux seuls gestionnaires de l'organisation.
create or replace function public.org_suspendue_par_supervision(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org in (select public.org_ids_avec_roles(
           array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
     and public.suspension_par_supervision(p_org);
$$;
comment on function public.org_suspendue_par_supervision(uuid) is
  'Vrai si l''organisation (dont l''appelant est gestionnaire) est suspendue ou archivée par la supervision, et non par l''impayé (audit final du 27/10/2026, DRT-04).';
revoke all on function public.org_suspendue_par_supervision(uuid) from public, anon;
grant execute on function public.org_suspendue_par_supervision(uuid) to authenticated;


-- ── Le second facteur activé protège aussi les DONNÉES (audit final, PUB-01 ; décision déléguée du dirigeant) ──────
-- Le sas /securite ne gardait que les écrans Next.js : avec le mot de passe seul, un jeton aal1 obtenu par l'API
-- publique (URL et clé publiable sont dans le site) lisait et écrivait tout ce que la RLS ouvre au titulaire. Schéma
-- documenté par Supabase (« Enforce MFA for users who opted in ») : une politique RESTRICTIVE sur chaque table exige
-- aal2 de tout compte qui possède un facteur vérifié ; un compte sans facteur, anon et le service ne changent pas.
create or replace function public.niveau_assurance_suffisant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f
                      where f.user_id = (select auth.uid()) and f.status = 'verified');
$$;
comment on function public.niveau_assurance_suffisant() is
  'Vrai si la session est en aal2 ou si le compte n''a aucun second facteur vérifié (audit final du 27/10/2026, PUB-01).';
revoke all on function public.niveau_assurance_suffisant() from public, anon;
grant execute on function public.niveau_assurance_suffisant() to authenticated, service_role;

-- L'identité vue par les fonctions SECURITY DEFINER. Elles contournent la RLS et reconnaissent l'appelant par
-- auth.uid() : un compte à facteur resté en aal1 y est remplacé par un identifiant qui ne désigne personne (jamais NULL :
-- plusieurs fonctions traitent un appelant sans identité comme une tâche du système). Le service (sans identité) et
-- tout compte au niveau suffisant gardent leur auth.uid().
create or replace function public.uid_second_facteur()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    when (select public.niveau_assurance_suffisant()) then (select auth.uid())
    else '00000000-0000-0000-0000-000000000000'::uuid
  end;
$$;
revoke all on function public.uid_second_facteur() from public, anon;
grant execute on function public.uid_second_facteur() to authenticated, service_role;

-- La pose, rejouable — À RAPPELER EN FIN DE TOUTE MIGRATION qui crée une table sous RLS ou (re)définit une fonction
-- SECURITY DEFINER appelable par authenticated, comme poser_gardes_abonnement :
--  1. politique restrictive « second_facteur » sur chaque table de public sous RLS qu'au moins une politique
--     permissive ouvre aux comptes connectés hors supervision (une table sans politique, ou réservée à la supervision —
--     qui exige déjà aal2 —, n'a rien à garder) ; `memberships` garde les propres lignes du compte lisibles en aal1 (le
--     proxy et la page du sas y lisent ses rôles avant le code) ;
--  2. dans les fonctions SECURITY DEFINER par lesquelles un compte se reconnaît (les portes communes : organisations,
--     fiche et bail du locataire, fiche de l'artisan) et dans celles qui rendent au locataire ses propres données
--     sans passer par elles, auth.uid() devient public.uid_second_facteur(). Liste nommée ci-dessous : les autres
--     fonctions passent par ces portes, ou exigent déjà la supervision (aal2) ; ma_session_active, lue par le proxy
--     avant le code, garde auth.uid() (elle ne rend que l'identifiant et la date de la session courante).
create or replace function public.poser_gardes_second_facteur()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  v_def text;
  v_n integer := 0;
  v_identite text[] := array[
    -- portes communes
    'org_ids_avec_roles', 'has_org_role', 'user_org_ids', 'is_active_member', 'lots_de_mon_portefeuille',
    'ma_personne_locataire', 'ma_personne_espace', 'mon_dernier_bail_locataire', 'pieces_bail_locataire',
    'mon_artisan_id', 'artisan_identite_reelle', 'exiger_artisan_reel', 'verifier_declarant_photo',
    'reseau_verifier_acces_bien',
    -- données du locataire rendues sans passer par une porte commune
    'mon_espace_locataire', 'mon_bail_locataire', 'mon_bail_document_locataire', 'mon_depot_locataire',
    'mon_dossier_locataire', 'mon_gestionnaire_locataire', 'mes_relances_locataire', 'mes_infos_pratiques_locataire',
    'mes_invitations_locataire', 'mes_incidents_locataire', 'mon_suivi_intervention', 'attestation_emetteur_locataire'];
begin
  -- Repartir de zéro : une table qui ne remplit plus la condition perd sa politique.
  for t in select c.relname from pg_class c join pg_policy p on p.polrelid = c.oid
            where c.relnamespace = 'public'::regnamespace and p.polname = 'second_facteur' loop
    execute format('drop policy if exists second_facteur on public.%I', t.relname);
  end loop;
  for t in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relrowsecurity
       and exists (
         select 1 from pg_policy p
          where p.polrelid = c.oid and p.polpermissive
            and (p.polroles = '{0}'::oid[] or 'authenticated'::regrole = any (p.polroles))
            and coalesce(pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid), 'true')
                !~ '^\(*\s*SELECT (public\.)?(is_super_admin|is_permanent_super_admin|has_supervision_power)\(\) AS [a-z_]+\)*$')
     order by c.relname
  loop
    if t.relname = 'memberships' then
      execute 'create policy second_facteur on public.memberships as restrictive for all to authenticated '
           || 'using ((select public.niveau_assurance_suffisant()) or account_id = (select auth.uid())) '
           || 'with check ((select public.niveau_assurance_suffisant()))';
    else
      execute format('create policy second_facteur on public.%I as restrictive for all to authenticated '
                  || 'using ((select public.niveau_assurance_suffisant())) with check ((select public.niveau_assurance_suffisant()))',
                     t.relname);
    end if;
    v_n := v_n + 1;
  end loop;
  for t in
    select p.oid from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f'
       and p.proname = any (v_identite)
       and p.prosrc like '%auth.uid()%'
  loop
    v_def := replace(pg_get_functiondef(t.oid), 'auth.uid()', 'public.uid_second_facteur()');
    execute v_def;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.poser_gardes_second_facteur() from public, anon, authenticated;

drop policy if exists second_facteur on storage.objects;
create policy second_facteur on storage.objects as restrictive for all to authenticated
  using ((select public.niveau_assurance_suffisant())) with check ((select public.niveau_assurance_suffisant()));

-- ── Un événement Stripe ne lève pas une suspension décidée par la supervision (DRT-04, décision déléguée) ─────────
-- Reprise de la définition en vigueur d'abonnement_appliquer (20260929100000, puis jour de Paris : aujourdhui_paris()),
-- une garde en plus avant la mise à jour du statut.
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

  -- Audit final du 27/10/2026 (décision déléguée du dirigeant, DRT-04) : un événement Stripe ne lève JAMAIS une
  -- suspension décidée par la supervision. Seul controler_organisation (réactiver) la lève ; le paiement, lui, reste
  -- enregistré (abonnements, plus haut) et le statut voulu par Stripe s'appliquera au prochain événement suivant la
  -- réactivation.
  if v_cible is distinct from v_statut_actuel and v_statut_actuel = 'suspendue'
     and public.suspension_par_supervision(v_org) then
    insert into public.audit_log (organization_id, action, details)
    values (v_org, 'abonnement_statut_retenu',
            jsonb_build_object('stripe', p_statut, 'statut', v_statut_actuel, 'ignore', v_cible,
                               'motif', 'suspension_supervision', 'souscription', p_subscription));
    v_cible := v_statut_actuel;
  end if;

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

-- ── La garde CENTRALE de l'API : toute requête d'un compte à facteur resté en aal1 est refusée (seconde relecture du
-- 28/10, PUB-01 ; décision du dirigeant) ──────────────────────────────────────────────────────────────────────────
-- La politique restrictive ne garde que les tables : les fonctions SECURITY DEFINER contournent la RLS. Hors de la
-- liste nommée de poser_gardes_second_facteur, plus de deux cents d'entre elles reconnaissent l'appelant par auth.uid() :
-- avec le mot de passe seul, un jeton aal1 lisait encore l'échéancier et les quittances du locataire, l'export de
-- l'artisan, le périmètre des personnes du gérant, et ÉCRIVAIT (declarer_reception_loyer créait un encaissement,
-- preparer_invitation_artisan une invitation, demander_export_complet une archive). Les réécrire toutes, et tenir à jour
-- celles de demain, n'est pas tenable. La porte est donc posée DEVANT l'API, une fois : PostgREST appelle la fonction de
-- pré-requête (`pgrst.db_pre_request`, méthode documentée par Supabase, « Securing your API », « Enforce additional
-- rules on each request ») avant chaque requête REST, RPC et GraphQL (/graphql/v1 est servi par PostgREST, /rpc/graphql),
-- sous le rôle de la requête. Elle ne s'applique ni au stockage ni au temps réel (documentation Supabase) : la politique
-- restrictive reste posée, en défense en profondeur, sur les tables et sur storage.objects.
--
-- Laissés passer, et eux seuls, avant le code : ce que le proxy et la page du sas lisent pour décider (src/proxy.ts,
-- src/app/securite/page.tsx, lib/autorisation-nouveau-mot-de-passe.ts) — la lecture des adhésions (la politique
-- restrictive n'y laisse voir que les lignes du compte) et la session courante (ma_session_active, qui ne rend que son
-- identifiant et sa date). Sans eux, le proxy répondrait « vérification de votre session indisponible » au lieu
-- d'ouvrir le sas. Le code lui-même (enroll, challenge, verify), la déconnexion et le mot de passe passent par le
-- serveur d'authentification, pas par cette API.
--
-- Rien ne change pour anon, le service et les tâches planifiées (aucune identité), ni pour une session aal2, ni pour un
-- compte sans facteur vérifié (une lecture de auth.mfa_factors par l'index de user_id ; aucune pour aal2 et anon).
-- 42501 : PostgREST répond 403 à un compte connecté.
create or replace function public.exiger_second_facteur()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_chemin text;
  v_methode text;
begin
  if v_uid is null or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2' then
    return;
  end if;
  if not exists (select 1 from auth.mfa_factors f where f.user_id = v_uid and f.status = 'verified') then
    return;
  end if;
  -- PostgREST pose request.path sans le préfixe /rest/v1 que retire la passerelle (« /memberships », « /rpc/… »).
  v_chemin := regexp_replace(coalesce(current_setting('request.path', true), ''), '^/*(rest/v1/)?', '');
  v_methode := upper(coalesce(current_setting('request.method', true), ''));
  if (v_chemin = 'memberships' and v_methode in ('GET', 'HEAD'))
     or (v_chemin = 'rpc/ma_session_active' and v_methode in ('GET', 'HEAD', 'POST')) then
    return;
  end if;
  raise exception 'Second facteur requis : saisissez le code de votre application d’authentification pour continuer.'
    using errcode = '42501',
          hint = 'Votre compte a activé la double authentification ; le mot de passe seul n’ouvre pas ses données.';
end;
$$;
comment on function public.exiger_second_facteur() is
  'Fonction de pré-requête de PostgREST (pgrst.db_pre_request) : refuse toute requête d''un compte à second facteur vérifié resté en aal1, sauf la lecture de ses adhésions et de sa session par le sas (audit final, PUB-01).';
-- PostgREST l'appelle sous le rôle de la requête, anon compris : sans ce droit, toute requête anonyme échouerait. Elle
-- ne rend rien et ne fait rien pour anon (aucune identité). Inscrite à ce titre dans les exceptions de
-- fermer_fonctions_a_anon (ci-dessous), seul endroit où une fonction peut rester ouverte à anon.
revoke all on function public.exiger_second_facteur() from public;
grant execute on function public.exiger_second_facteur() to anon, authenticated, service_role;

-- fermer_fonctions_a_anon, reprise de sa définition en vigueur (20260911290000), avec sa première exception.
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
  --  · exiger_second_facteur (audit final du 27/10/2026, PUB-01) : la fonction de pré-requête de PostgREST, appelée
  --    sous le rôle de CHAQUE requête, anonyme comprise. Elle ne fait rien sans identité.
  v_publiques text[] := array['exiger_second_facteur']::text[];
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

-- L'enregistrement auprès de PostgREST. Une autre fonction de pré-requête déjà configurée n'est pas écrasée en silence :
-- la migration s'arrête, il faut les chaîner (aucune dans ce dépôt au 28/10). Base sans le rôle `authenticator` (base
-- de test montée sans le bootstrap du banc) : rien à configurer.
do $garde$
declare
  v_actuelle text;
begin
  if to_regrole('authenticator') is null then
    raise notice 'Rôle authenticator absent : pgrst.db_pre_request non configuré.';
    return;
  end if;
  select substr(s, length('pgrst.db_pre_request=') + 1) into v_actuelle
    from pg_catalog.pg_db_role_setting r, unnest(r.setconfig) s
   where r.setrole = 'authenticator'::regrole and r.setdatabase = 0 and s like 'pgrst.db_pre_request=%';
  if coalesce(v_actuelle, '') not in ('', 'public.exiger_second_facteur') then
    raise exception 'pgrst.db_pre_request vaut déjà « % » : chaîner cette fonction avec public.exiger_second_facteur avant de migrer', v_actuelle;
  end if;
  alter role authenticator set pgrst.db_pre_request = 'public.exiger_second_facteur';
end $garde$;
notify pgrst, 'reload config';

-- La demande d'archive complète exigeait « second facteur, ou mot de passe saisi il y a moins de quinze minutes » :
-- pour un compte qui a un facteur, le mot de passe récent ne suffit plus. Reprise de la définition en vigueur
-- (20261024130000), seule la preuve récente change.
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
  if not (select public.niveau_assurance_suffisant()) then
    raise exception 'Confirmez votre identité avec le code de votre application d’authentification'
      using errcode = '42501';
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

-- En dernier : toutes les fonctions ci-dessus existent (abonnement_appliquer, org_suspendue_par_supervision…).
select public.poser_gardes_second_facteur();

select public.fermer_fonctions_a_anon();

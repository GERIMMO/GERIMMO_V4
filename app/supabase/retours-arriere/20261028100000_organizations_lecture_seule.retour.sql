-- Retour arrière de 20261028100000_organizations_lecture_seule.sql — audit final du 27/10/2026 (DRT-V01, DRT-04, PUB-01).
-- REMETTRE D'ABORD LE CODE PRÉCÉDENT : le bandeau et la page Abonnement appellent org_suspendue_par_supervision.
-- Défait, dans l'ordre : la politique restrictive « second_facteur » (toutes les tables de public, storage.objects),
-- auth.uid() rendu aux fonctions SECURITY DEFINER (remplacement inverse de public.uid_second_facteur()), abonnement_appliquer (texte en vigueur avant la
-- migration : un événement Stripe lève de nouveau une suspension de la supervision), puis les fonctions ajoutées et le
-- déclencheur abonnement_organizations. Aucune donnée n'est touchée ; les lignes « abonnement_statut_retenu » du
-- journal sont conservées. RÉINTRODUIT : PUB-01 côté données (un mot de passe seul lit tout par l'API pour un compte
-- à second facteur), DRT-V01 et la levée d'une suspension par Stripe.
begin;
set local lock_timeout = '10s';
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
drop function if exists public.poser_gardes_second_facteur();
drop function if exists public.uid_second_facteur();
drop function if exists public.niveau_assurance_suffisant();
drop trigger if exists abonnement_organizations on public.organizations;
drop function if exists public.organizations_refuser_ecriture_si_fermee();
drop function if exists public.org_suspendue_par_supervision(uuid);
drop function if exists public.suspension_par_supervision(uuid);
delete from supabase_migrations.schema_migrations where version = '20261028100000';
commit;

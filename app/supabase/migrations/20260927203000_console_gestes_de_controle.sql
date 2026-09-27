-- AUDIT CONSOLE DU 27/09 — MAJEUR 8 : LES GESTES DE CONTRÔLE DE LA CONSOLE.
--
-- Le super administrateur garde le contrôle sans jamais emprunter l'identité
-- d'un utilisateur : chaque geste est fait à SON nom, confirmé à l'écran,
-- motivé quand il retire un droit, et journalisé dans la même transaction.
--
-- 1. Organisation (wiki « Cycle de vie de l'abonnement » R3–R6, « Archivage
--    plutôt que suppression ») : suspendre, réactiver, prolonger l'essai
--    (1 à 90 jours), archiver. Aucune suppression.
-- 2. Artisan : suspendre une validation (retour « à examiner », motif
--    communiqué) ; une validation exige au moins une décennale valide ou une
--    RC pro en cours (« une inscription sans décennale ni RC pro ne peut pas
--    être validée », décision du 04/09 : l'artisan dépose RC pro + décennale).
--
-- Idempotent : create or replace.

-- ── 1. L'organisation ──────────────────────────────────────────────────────
create or replace function public.controler_organisation(p_org uuid, p_geste text, p_jours integer default null, p_motif text default null)
returns text language plpgsql security definer set search_path='' as $$
declare
  v_org public.organizations%rowtype;
  v_cible public.organization_status;
  v_essai date;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_avant text;
begin
  if (select auth.uid()) is null or public.is_permanent_super_admin() is not true then
    raise exception 'Ce geste demande votre compte de supervision et sa double vérification';
  end if;
  if p_geste is null or p_geste not in ('suspendre', 'reactiver', 'prolonger_essai', 'archiver') then
    raise exception 'Geste inconnu';
  end if;
  select * into v_org from public.organizations where id = p_org for update;
  if not found then raise exception 'Organisation introuvable'; end if;
  v_essai := v_org.essai_fin;

  if p_geste in ('suspendre', 'archiver') and (v_motif is null or length(v_motif) < 5) then
    raise exception 'Motivez ce geste en quelques mots : le motif est conservé au journal';
  end if;

  if p_geste = 'suspendre' then
    if v_org.status not in ('essai', 'active') then raise exception 'Seule une organisation en essai ou active se suspend'; end if;
    v_cible := 'suspendue';
  elsif p_geste = 'archiver' then
    if v_org.status = 'archivee' then raise exception 'Cette organisation est déjà archivée'; end if;
    v_cible := 'archivee';
  elsif p_geste = 'reactiver' then
    if v_org.status not in ('suspendue', 'archivee') then raise exception 'Seule une organisation suspendue ou archivée se réactive'; end if;
    -- Retour à l'état d'avant la suspension ou l'archivage, tel que le journal
    -- l'a gardé ; à défaut : active si Stripe dit l'abonnement en cours, sinon essai.
    select l.details->>'avant' into v_avant from public.audit_log l
     where l.organization_id = p_org and l.action in ('organisation_suspendue', 'organisation_archivee')
     order by l.created_at desc limit 1;
    v_cible := case
      when v_avant in ('essai', 'active') then v_avant::public.organization_status
      when exists (select 1 from public.abonnements a where a.organization_id = p_org and a.stripe_statut in ('active', 'trialing')) then 'active'
      else 'essai' end;
  else -- prolonger_essai
    if p_jours is null or p_jours not between 1 and 90 then raise exception 'Prolongez l’essai de 1 à 90 jours'; end if;
    if v_org.status not in ('essai', 'suspendue') then raise exception 'Seule une organisation en essai (ou suspendue après son essai) se prolonge'; end if;
    v_cible := 'essai';
    v_essai := greatest(coalesce(v_org.essai_fin, current_date), current_date) + p_jours;
  end if;

  update public.organizations set status = v_cible, essai_fin = v_essai where id = p_org;
  insert into public.audit_log(account_id, organization_id, action, details)
  values ((select auth.uid()), p_org,
    case p_geste when 'suspendre' then 'organisation_suspendue' when 'archiver' then 'organisation_archivee'
      when 'reactiver' then 'organisation_reactivee' else 'essai_prolonge' end,
    jsonb_strip_nulls(jsonb_build_object('avant', v_org.status::text, 'apres', v_cible::text, 'jours', p_jours,
      'essai_fin', case when p_geste = 'prolonger_essai' then v_essai end, 'motif', left(v_motif, 500))));
  return v_cible::text;
end $$;
revoke all on function public.controler_organisation(uuid, text, integer, text) from public, anon;
grant execute on function public.controler_organisation(uuid, text, integer, text) to authenticated;

-- ── 2. L'artisan ───────────────────────────────────────────────────────────
create or replace function public.artisan_decider_plateforme(p_artisan uuid, p_decision public.artisan_decision_plateforme, p_motif text)
returns void language plpgsql security definer set search_path='' as $$
declare v_en_cours integer;
begin
  if not public.is_super_admin() then
    raise exception 'Accès refusé — la validation plateforme appartient au super admin seul (RM-8.5.3)';
  end if;
  if p_decision in ('refus', 'blacklist_globale', 'suspension')
     and length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Un refus, une suspension et une liste noire globale se motivent sur des faits objectifs';
  end if;
  -- « Vérifié » est le seul état de SIRET affectable (RM-A1.9, corrigée le
  -- 2026-09-04). Valider un artisan dont le SIRET ne l'est pas le rendrait
  -- « valide » et pourtant proposable nulle part, sans que rien ne le dise :
  -- une impasse silencieuse. On la refuse avec le geste qui manque.
  if p_decision = 'validation'
     and (select a.siret_etat from public.artisans a where a.id = p_artisan) <> 'verifie' then
    raise exception 'Vérifiez d''abord le SIRET : un artisan validé dont le SIRET ne l''est pas ne serait proposé à aucune agence (RM-A1.9)';
  end if;
  -- 27/09 : une suspension ne vise qu'une inscription validée.
  if p_decision = 'suspension'
     and (select a.statut_plateforme from public.artisans a where a.id = p_artisan) is distinct from 'valide' then
    raise exception 'Seule une inscription validée se suspend';
  end if;

  if p_decision = 'blacklist_globale' then
    select count(*) into v_en_cours from public.incident_interventions i
    where i.artisan_id = p_artisan and i.statut in ('acceptee', 'planifiee', 'en_cours');
    if v_en_cours > 0 then
      raise exception 'Cet artisan a % intervention(s) en cours — une intervention en cours n''est jamais interrompue (RM-8.2.7)', v_en_cours;
    end if;
  end if;

  update public.artisans a set
    statut_plateforme = case p_decision
      when 'validation' then 'valide'
      when 'refus' then 'refuse'
      when 'remise_en_attente' then 'en_attente'
      -- Suspendue : l'inscription redevient « à examiner » ; elle n'est plus
      -- proposée à de nouvelles affectations jusqu'à une nouvelle validation.
      when 'suspension' then 'en_attente'
      else a.statut_plateforme end::public.artisan_statut_plateforme,
    statut_motif = case when p_decision in ('validation','refus','remise_en_attente','suspension')
      then nullif(trim(coalesce(p_motif, '')), '') else a.statut_motif end,
    statut_decide_le = case when p_decision in ('validation','refus','remise_en_attente','suspension')
      then now() else a.statut_decide_le end,
    statut_decide_par = case when p_decision in ('validation','refus','remise_en_attente','suspension')
      then (select auth.uid()) else a.statut_decide_par end,
    blacklist_globale_le = case p_decision
      when 'blacklist_globale' then now()
      when 'levee_blacklist' then null else a.blacklist_globale_le end,
    blacklist_globale_motif = case p_decision
      when 'blacklist_globale' then trim(p_motif)
      when 'levee_blacklist' then null else a.blacklist_globale_motif end,
    blacklist_globale_par = case p_decision
      when 'blacklist_globale' then (select auth.uid())
      when 'levee_blacklist' then null else a.blacklist_globale_par end,
    -- A2 corrige RM-8.5.6 : le motif d'une blacklist globale se conserve
    -- 5 ans, « la sanction la plus lourde justifiant la trace la plus
    -- longue » — pas indéfiniment.
    purge_motif_le = case p_decision
      when 'blacklist_globale' then (current_date + interval '5 years')::date
      when 'levee_blacklist' then null else a.purge_motif_le end,
    -- Une validation solde la purge des inscriptions sans suite.
    purge_prevue_le = case when p_decision = 'validation' then null else a.purge_prevue_le end
  where a.id = p_artisan;
  if not found then raise exception 'Artisan introuvable'; end if;

  if p_decision = 'blacklist_globale' then
    update public.incident_devis set statut = 'annule'
    where artisan_id = p_artisan and statut = 'depose';
    update public.incident_sollicitations set statut = 'annulee', repondue_le = now()
    where artisan_id = p_artisan and statut in ('envoyee', 'devis_depose');
  end if;

  insert into public.artisan_validations (artisan_id, decision, motif, decide_par)
  values (p_artisan, p_decision, nullif(trim(coalesce(p_motif, '')), ''), (select auth.uid()));
end;
$$;

-- Au moins un justificatif d’assurance en cours : décennale valide ou RC pro non échue.
-- Fonction interne : appelée par traiter_inscription_artisan_atomique (définie
-- par le propriétaire), jamais exposée à un compte connecté.
create or replace function public.artisan_assurance_deposee(p_artisan uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.artisan_decennale_valide(p_artisan) or exists (
    select 1 from public.artisan_pieces p
    where p.artisan_id = p_artisan and p.type = 'rc_pro' and p.retiree_le is null
      and (p.expire_le is null or p.expire_le >= current_date));
$$;
revoke all on function public.artisan_assurance_deposee(uuid) from public, anon, authenticated;
grant execute on function public.artisan_assurance_deposee(uuid) to service_role;

create or replace function public.traiter_inscription_artisan_atomique(
  p_artisan uuid, p_operation text, p_motif text default null,
  p_verification_effectuee boolean default false, p_pieces_relues boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_statut public.artisan_statut_plateforme;
  v_siret public.artisan_siret_etat;
  v_attendu public.artisan_statut_plateforme;
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé à la supervision Gerimmo.';
  end if;
  if p_operation is null or p_operation not in
    ('verifier_siret', 'validation', 'refus', 'remise_en_attente', 'suspension') then
    raise exception 'Choisissez une décision proposée sur cet écran.';
  end if;

  select a.statut_plateforme, a.siret_etat
    into v_statut, v_siret
    from public.artisans a
    where a.id = p_artisan
    for update;
  if not found then
    raise exception 'Inscription introuvable.';
  end if;
  v_attendu := case p_operation when 'remise_en_attente' then 'refuse'
    when 'suspension' then 'valide' else 'en_attente' end;
  if v_statut <> v_attendu then
    raise exception 'Cette inscription a déjà changé d’état. Rechargez la page.';
  end if;
  if p_operation = 'verifier_siret' and p_verification_effectuee is distinct from true then
    raise exception 'Confirmez avoir vérifié le SIRET avant d’enregistrer ce constat.';
  end if;
  if p_operation = 'validation' then
    if v_siret <> 'verifie' then
      raise exception 'Vérifiez d’abord le SIRET.';
    end if;
    if p_pieces_relues is distinct from true then
      raise exception 'Confirmez avoir relu les justificatifs avant de valider l’inscription.';
    end if;
    -- 27/09 (audit console) : l'écran le promettait, la base le tient.
    if public.artisan_assurance_deposee(p_artisan) is not true then
      raise exception 'Une inscription sans décennale ni RC pro en cours ne peut pas être validée : demandez les justificatifs à l’artisan.';
    end if;
  end if;
  if p_operation in ('refus', 'suspension') and length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Indiquez le motif objectif : il sera visible par l’artisan.';
  end if;

  -- La trace et la décision sont validées ensemble. Une panne de la trace
  -- empêche la mutation ; une décision refusée ne laisse pas de faux succès.
  perform public.log_sa_access(null, 'examen_inscription_artisan',
    jsonb_build_object('artisan_id', p_artisan, 'operation_demandee', p_operation));
  if p_operation = 'verifier_siret' then
    perform public.artisan_definir_siret_etat(p_artisan, 'verifie');
  else
    perform public.artisan_decider_plateforme(p_artisan,
      p_operation::public.artisan_decision_plateforme, nullif(trim(coalesce(p_motif, '')), ''));
  end if;
end;
$$;

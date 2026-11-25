-- Audit palier 1, P1-07 — Évaluation d'artisan contestée : la supervision examine, puis retire.
--
-- CE QUI MANQUAIT, VÉRIFIÉ. L'écran de l'artisan promet qu'« une évaluation retirée est exclue du calcul ». Or :
--   · aucun écran n'appelait `retirer_evaluation` ;
--   · depuis D08-C (20261016172453), les pouvoirs de supervision n'écrivent plus dans les tables d'une
--     organisation : l'appel de `retirer_evaluation` par un super admin est refusé (« Traversée en lecture
--     seule ») — sonde du 22/11 sur base fictive. La fonction était morte, et aucun test ne l'exerçait.
--
-- CE QUE POSE CETTE MIGRATION, d'après le référentiel (module 11, §11.4, circuit de contestation) :
--   1. `evaluations_contestation(p_retour)` — le détail des évaluations de l'artisan, commentaires compris,
--      DANS LE SEUL CADRE d'une contestation (RM-11.4.5) ; chaque lecture laisse sa ligne au journal (RM-11.4.6).
--   2. `retirer_evaluation_contestee(p_retour, p_evaluation, p_motif)` — le retrait motivé (RM-11.4.4), par le
--      permis de plateforme de D08-C : une mutation décrite à l'avance, consommée par le garde. La moyenne se
--      recalcule d'elle-même (`artisan_note` ignore les évaluations retirées, RM-11.4.7). L'artisan le lit dans
--      le suivi de sa contestation ; l'organisation qui avait noté reçoit une alerte (variante V2, étape 8).
--   3. L'ancienne `retirer_evaluation(uuid, text)` n'est plus exécutable par un compte connecté : le référentiel
--      ne prévoit pas de retrait hors contestation.
--
-- CE QUE CHACUN APPREND, ET PAS PLUS. L'organisation n'a pas le motif (il peut reprendre ce que l'artisan a confié
-- à la supervision : « privé entre l'artisan et la plateforme ») ; l'artisan n'apprend ni l'auteur ni
-- l'intervention (RM-11.4.3). Tout se lit dans l'application : cette fonction n'envoie aucun e-mail.
--
-- Rejouable. Retour arrière : supabase/retours-arriere/20261122150000_evaluation_contestee.retour.sql

-- ── 1. Lire le détail, dans le cadre d'une contestation ─────────────────────────────────────────────────────────
create or replace function public.evaluations_contestation(p_retour uuid)
returns table (
  evaluation_id uuid, deposee_le timestamptz, source public.evaluation_source,
  note_globale smallint, note_qualite smallint, note_delai smallint, note_prix smallint,
  commentaire text, organisation text, incident_numero text,
  retiree_le timestamptz, retrait_motif text)
language plpgsql security definer set search_path = '' as $$
declare v_artisan uuid;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Lecture réservée à la supervision';
  end if;
  select r.artisan_id into v_artisan from public.retours_utilisateurs r
  where r.id = p_retour and r.nature = 'contestation';
  if v_artisan is null then raise exception 'Contestation introuvable'; end if;
  -- RM-11.4.6 : l'accès déroge à la confidentialité de RM-11.2.2, il est donc tracé. `log_sa_access` ne répète
  -- pas une même consultation dans la minute (rechargement de page).
  perform public.log_sa_access(null, 'consultation_evaluations_contestation',
    jsonb_build_object('retour_id', p_retour, 'artisan_id', v_artisan));
  return query
  select e.id, e.created_at, e.source, e.note_globale, e.note_qualite, e.note_delai, e.note_prix,
         e.commentaire, o.name, inc.numero, e.retiree_le, e.retrait_motif
  from public.artisan_evaluations e
  join public.organizations o on o.id = e.organization_id
  join public.incident_interventions i on i.id = e.intervention_id
  join public.incidents inc on inc.id = i.incident_id
  where e.artisan_id = v_artisan
  order by e.created_at desc, e.id;
end;
$$;
revoke all on function public.evaluations_contestation(uuid) from public, anon;
grant execute on function public.evaluations_contestation(uuid) to authenticated;
comment on function public.evaluations_contestation(uuid) is
  'Détail des évaluations de l''artisan d''une contestation (RM-11.4.5), réservé au super admin, accès tracé (RM-11.4.6).';

-- ── 2. Retirer une évaluation contestée ─────────────────────────────────────────────────────────────────────────
create or replace function public.retirer_evaluation_contestee(p_retour uuid, p_evaluation uuid, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_artisan uuid;
  e public.artisan_evaluations;
  v_incident uuid; v_numero text; v_lot uuid;
  v_motif text := btrim(coalesce(p_motif, ''));
  v_alerte jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès refusé — le retrait d''une note appartient au super admin (RM-11.4.4)';
  end if;
  select r.artisan_id into v_artisan from public.retours_utilisateurs r
  where r.id = p_retour and r.nature = 'contestation' for update;
  if v_artisan is null then raise exception 'Contestation introuvable'; end if;
  if length(v_motif) not between 10 and 1000 then
    raise exception 'Précisez le motif du retrait (10 à 1 000 caractères)';
  end if;
  select x.* into e from public.artisan_evaluations x
  where x.id = p_evaluation and x.artisan_id = v_artisan for update;
  if not found then
    raise exception 'Cette évaluation ne concerne pas l''artisan de cette contestation';
  end if;
  if e.retiree_le is not null then raise exception 'Évaluation déjà retirée'; end if;
  -- Un permis resté actif dans cette transaction ne se réutilise pas (même règle que la maintenance, D08-C).
  if exists (select 1 from support_interne.maintenance_lignes
             where transaction_id = txid_current() and auteur = auth.uid()) then
    raise exception 'Opération de plateforme déjà active';
  end if;

  select i.incident_id, inc.numero, inc.lot_id into v_incident, v_numero, v_lot
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  where i.id = e.intervention_id;

  -- Le retrait : UNE ligne, décrite avant d'être écrite ; le garde de traversée consomme le permis.
  insert into support_interne.maintenance_lignes values (
    txid_current(), auth.uid(), 'artisan_evaluations', e.id, to_jsonb(e),
    to_jsonb(e) || jsonb_build_object('retiree_le', now(), 'retrait_motif', v_motif, 'retiree_par', auth.uid()));
  update public.artisan_evaluations
  set retiree_le = now(), retrait_motif = v_motif, retiree_par = auth.uid()
  where id = e.id;

  -- L'organisation est informée (variante V2) : une alerte informative, sans le motif.
  v_alerte := to_jsonb(jsonb_populate_record(null::public.alerts, jsonb_build_object(
    'organization_id', e.organization_id, 'type', 'evaluation_retiree', 'criticite', 'informative',
    'titre', 'Évaluation d''artisan retirée — ' || coalesce(v_numero, 'intervention'),
    'statut', 'ouverte', 'escalades', '[]'::jsonb, 'assigned_all', true,
    'details', jsonb_build_object(
      'incident_id', v_incident, 'lot_id', v_lot, 'intervention_id', e.intervention_id,
      'source', e.source,
      'libelle', case when e.source = 'gerant'
        then 'Après examen d''une contestation de l''artisan, Gerimmo a retiré votre évaluation de cette intervention : elle ne compte plus dans sa moyenne.'
        else 'Après examen d''une contestation de l''artisan, Gerimmo a retiré l''évaluation donnée par le locataire pour cette intervention : elle ne compte plus dans sa moyenne.'
      end)))) - array['id', 'created_at', 'updated_at'];
  insert into support_interne.maintenance_lignes values (
    txid_current(), auth.uid(), 'alerts', e.id, null, v_alerte);
  insert into public.alerts (organization_id, type, criticite, titre, statut, escalades, assigned_all, details)
  values (e.organization_id, 'evaluation_retiree', 'informative', v_alerte->>'titre', 'ouverte', '[]'::jsonb, true,
          v_alerte->'details');
  delete from support_interne.maintenance_lignes
  where transaction_id = txid_current() and auteur = auth.uid();

  -- L'artisan est informé là où il suit sa contestation, sans auteur ni intervention (RM-11.4.3).
  insert into public.retours_historique (retour_id, acteur_id, evenement, message)
  values (p_retour, auth.uid(), 'evaluation_retiree',
          'Après examen de votre contestation, une évaluation a été retirée. Elle ne compte plus dans votre moyenne, qui est recalculée.');

  -- « support_ » : un geste de la supervision dans les données d'une organisation, gardé trois ans au journal
  -- (action_audit_controle_interne, 20261024140000), comme les autres gestes de support motivés.
  perform public.log_sa_access(e.organization_id, 'support_evaluation_retiree', jsonb_build_object(
    'retour_id', p_retour, 'evaluation_id', e.id, 'artisan_id', v_artisan, 'source', e.source));
end;
$$;
revoke all on function public.retirer_evaluation_contestee(uuid, uuid, text) from public, anon;
grant execute on function public.retirer_evaluation_contestee(uuid, uuid, text) to authenticated;
comment on function public.retirer_evaluation_contestee(uuid, uuid, text) is
  'Retrait motivé d''une évaluation dans le cadre d''une contestation (RM-11.4.4) : super admin seulement, journal, suivi de l''artisan, alerte à l''organisation.';

-- ── 3. L'ancien chemin, sans contestation, se ferme ─────────────────────────────────────────────────────────────
revoke execute on function public.retirer_evaluation(uuid, text) from authenticated;

select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';

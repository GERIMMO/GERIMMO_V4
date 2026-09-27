-- ══════════════════════════════════════════════════════════════════════════
-- La contre-proposition du locataire arrive à l'artisan (audit du 27/09)
-- ══════════════════════════════════════════════════════════════════════════
--
-- LES DÉFAUTS.
--  1. Le locataire qui refuse les dates de l'artisan en propose trois
--     (`contre_proposer_creneaux`, RM-10.2.2) ; on lui répond qu'elles
--     « attendent l'accord de l'artisan ». Mais aucune RPC de l'artisan ne
--     lisait ni n'acceptait ces dates : il voyait « à planifier » et, s'il
--     reproposait, `proposer_creneaux` rendait caduques les dates du
--     locataire sans que personne ne les ait regardées.
--  2. L'artisan ne voyait pas non plus les dates qu'IL avait proposées — un
--     simple compteur — alors qu'il doit les garder libres jusqu'à la réponse.
--
-- CE QUE DIT LE WIKI. processus/Planification d'intervention, « Machine à
-- états cible du rendez-vous » (Livrable A5, module 10) : « contre-proposé →
-- confirmé ou arbitrage (refus artisan) ». L'artisan confirme donc l'une des
-- dates du locataire, ou les refuse — et le refus renvoie à l'arbitrage du
-- gérant (RM-10.4.1 : réglé au téléphone, rendez-vous saisi par le gérant via
-- `fixer_creneau_arbitrage`). Les créneaux refusés restent en base (RM-10.4.4).
--
-- CE QUE FAIT CETTE MIGRATION.
--  · `mes_creneaux_artisan(intervention)` : les créneaux vivants (proposés ou
--    retenu) de SA mission, avec leur auteur — les siens comme ceux du
--    locataire ;
--  · `accepter_creneau_locataire(creneau)` : confirme une date du locataire
--    (même effet que `choisir_creneau` côté locataire : rendez-vous posé) ;
--  · `refuser_creneaux_locataire(intervention, motif)` : refuse les dates du
--    locataire et ouvre l'alerte d'arbitrage du gérant ;
--  · `proposer_creneaux` refuse désormais de passer par-dessus une
--    contre-proposition en attente : il faut d'abord y répondre.
--
-- Rejouable : `create or replace` partout, mêmes signatures pour l'existant.

-- ── 0. Deux événements de plus dans la chronologie du dossier ────────────
-- `creneaux_refuses` (ci-dessous) et `facture_deposee` (migration suivante,
-- 20260927123000) : la liste fermée des types s'élargit une fois pour les deux.
alter table public.incident_evenements drop constraint if exists incident_evenements_type_check;
alter table public.incident_evenements add constraint incident_evenements_type_check
  check (type = any (array[
    'declaration', 'qualification', 'contestation', 'cloture', 'reouverture',
    'attribution', 'photo', 'consultation', 'sollicitation', 'devis',
    'selection_devis', 'mission_confiee', 'mission_acceptee', 'mission_refusee',
    'creneaux_proposes', 'creneau_retenu', 'arbitrage_creneau',
    'intervention_demarree', 'compte_rendu', 'revision_imputation', 'evaluation',
    'creneaux_refuses', 'facture_deposee'
  ]::text[]));

-- ── 1. Lire les créneaux de sa mission ───────────────────────────────────
create or replace function public.mes_creneaux_artisan(p_intervention uuid)
returns table (
  creneau_id uuid,
  propose_par public.creneau_auteur,
  tour integer,
  debut timestamptz,
  fin timestamptz,
  statut public.creneau_statut
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.propose_par, c.tour, c.debut, c.fin, c.statut
  from public.intervention_creneaux c
  join public.incident_interventions i on i.id = c.intervention_id
  where c.intervention_id = p_intervention
    and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    -- Un créneau proposé déjà commencé ne se retient plus (même règle que
    -- côté locataire, migration 20260927160000) : il n'est plus montré.
    and (c.statut = 'retenu' or (c.statut = 'propose' and c.debut > now()))
  order by c.debut;
$$;

revoke execute on function public.mes_creneaux_artisan(uuid) from public, anon;
grant execute on function public.mes_creneaux_artisan(uuid) to authenticated;

-- ── 2. Confirmer une date du locataire ───────────────────────────────────
create or replace function public.accepter_creneau_locataire(p_creneau uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v record;
begin
  select c.*, i.incident_id, i.statut as statut_intervention, i.artisan_id
    into v
  from public.intervention_creneaux c
  join public.incident_interventions i on i.id = c.intervention_id
  where c.id = p_creneau
    and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update of c;
  if not found then raise exception 'Accès refusé'; end if;
  if v.propose_par <> 'locataire' then
    raise exception 'Cette date n''est pas une proposition du locataire';
  end if;
  if v.statut <> 'propose' then
    raise exception 'Cette date n''est plus proposée';
  end if;
  if v.statut_intervention not in ('acceptee', 'planifiee') then
    raise exception 'Cette mission n''attend pas de rendez-vous (état : %)', v.statut_intervention;
  end if;
  if v.debut <= now() then
    raise exception 'Cette date est passée : proposez vos propres créneaux, ou refusez celles du locataire pour que le gérant arbitre';
  end if;

  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'artisan'));
end;
$$;

revoke execute on function public.accepter_creneau_locataire(uuid) from public, anon;
grant execute on function public.accepter_creneau_locataire(uuid) to authenticated;

-- ── 3. Refuser les dates du locataire : l'arbitrage du gérant ────────────
create or replace function public.refuser_creneaux_locataire(p_intervention uuid, p_motif text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v record; v_nb integer; v_numero text;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Dites pourquoi aucune de ces dates ne vous convient : le gérant arbitrera avec cette information';
  end if;

  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose' and propose_par = 'locataire';
  get diagnostics v_nb = row_count;
  if v_nb = 0 then
    raise exception 'Le locataire n''a aucune date en attente de votre réponse';
  end if;

  select numero into v_numero from public.incidents where id = v.incident_id;
  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneaux_refuses', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'artisan',
                             'nombre', v_nb, 'motif', trim(p_motif)));

  -- A5 : contre-proposé → arbitrage (refus artisan). Même alerte que celle du
  -- sixième refus (RM-10.4.1), que `fixer_creneau_arbitrage` referme.
  if not exists (select 1 from public.alerts
                 where organization_id = v.organization_id and statut = 'ouverte'
                   and type = 'creneaux_arbitrage'
                   and details->>'intervention_id' = p_intervention::text) then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (v.organization_id, 'creneaux_arbitrage', 'critique',
            'Rendez-vous à arbitrer — ' || v_numero,
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'libelle', 'L''artisan ne peut à aucune des dates du locataire : '
                                          || trim(p_motif)
                                          || '. Réglez le rendez-vous par téléphone.'),
            'intervention', p_intervention);
  end if;
  return v_nb;
end;
$$;

revoke execute on function public.refuser_creneaux_locataire(uuid, text) from public, anon;
grant execute on function public.refuser_creneaux_locataire(uuid, text) to authenticated;

-- ── 4. Reproposer ne passe plus par-dessus une contre-proposition ────────
create or replace function public.proposer_creneaux(p_intervention uuid, p_creneaux jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v record; v_nb integer; v_refuses integer; v_tour integer; c jsonb;
begin
  select i.* into v from public.incident_interventions i
  where i.id = p_intervention and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
  for update;
  if not found then raise exception 'Accès refusé'; end if;
  if v.statut not in ('acceptee', 'planifiee') then
    raise exception 'Acceptez la mission avant de proposer des créneaux (état : %)', v.statut;
  end if;
  -- A5 : une contre-proposition se confirme ou part à l'arbitrage. La rendre
  -- caduque en silence effaçait la réponse du locataire.
  if exists (select 1 from public.intervention_creneaux
             where intervention_id = p_intervention and statut = 'propose'
               and propose_par = 'locataire' and debut > now()) then
    raise exception 'Le locataire vous a proposé des dates : retenez-en une, ou refusez-les pour que le gérant arbitre';
  end if;
  v_nb := jsonb_array_length(coalesce(p_creneaux, '[]'::jsonb));
  if v_nb < 3 then
    raise exception 'Proposez au moins trois créneaux (RM-10.1.1) — vous en avez proposé %', v_nb;
  end if;

  select count(*) into v_refuses from public.intervention_creneaux
  where intervention_id = p_intervention and statut = 'refuse';
  if v_refuses >= 6 then
    raise exception 'Six créneaux ont déjà été refusés : le rendez-vous se règle désormais avec le gérant (RM-10.4.1)';
  end if;

  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut = 'propose';

  -- Le rendez-vous en cours tombe AVEC sa date : sans cela, le prochain choix
  -- du locataire heurterait « un seul créneau retenu » et l'intervention
  -- resterait bloquée pour toujours.
  if v.statut = 'planifiee' then
    update public.intervention_creneaux set statut = 'caduc'
    where intervention_id = p_intervention and statut = 'retenu';
    update public.incident_interventions
    set statut = 'acceptee', debut_prevu = null, fin_prevue = null
    where id = p_intervention;
  end if;

  for c in select jsonb_array_elements(p_creneaux) loop
    insert into public.intervention_creneaux
      (organization_id, intervention_id, propose_par, tour, debut, fin, created_by)
    values (v.organization_id, p_intervention, 'artisan', v_tour,
            (c->>'debut')::timestamptz, (c->>'fin')::timestamptz, (select auth.uid()));
  end loop;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (v.organization_id, v.incident_id, 'creneaux_proposes', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'artisan',
                             'tour', v_tour, 'nombre', v_nb,
                             'rendez_vous_defait', v.statut = 'planifiee'));
  return v_nb;
end;
$$;

select public.fermer_fonctions_a_anon();

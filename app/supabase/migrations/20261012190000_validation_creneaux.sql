-- Audit mission du12/10/2026 : mêmes gardes de saisie au point d’entrée SQL.
-- LOC004/LOC005 et doublons artisan : aucune proposition invalide/passée/
-- répétée, et négociation locataire seulement sur une mission acceptée.
-- Les droits, l’arbitrage et le report artisan depuis planifiee sont conservés.
-- CREATE OR REPLACE préserve les signatures et privilèges existants.
-- Références originales :20260927122000(proposer),20260911180000(contre).

create or replace function public.proposer_creneaux(p_intervention uuid, p_creneaux jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v record; v_nb integer; v_refuses integer; v_tour integer; c jsonb; v_debut timestamptz; v_fin timestamptz;
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
  if jsonb_typeof(p_creneaux) is distinct from 'array' then
    raise exception 'Les créneaux doivent être une liste de propositions';
  end if;
  v_nb := jsonb_array_length(p_creneaux);
  if v_nb < 3 then
    raise exception 'Proposez au moins trois créneaux (RM-10.1.1) — vous en avez proposé %', v_nb;
  end if;

  -- Valider tout le lot avant de rendre un ancien créneau caduc/refusé.
  -- Comparer les instants, pas leur écriture : +02:00 et Z peuvent désigner
  -- exactement la même proposition.
  for c in select jsonb_array_elements(p_creneaux) loop
    if jsonb_typeof(c) is distinct from 'object'
       or jsonb_typeof(c->'debut') is distinct from 'string'
       or jsonb_typeof(c->'fin') is distinct from 'string' then
      raise exception 'Chaque créneau doit contenir une date de début et une date de fin';
    end if;
    begin
      v_debut := (c->>'debut')::timestamptz;
      v_fin := (c->>'fin')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Les dates du créneau sont invalides';
    end;
    if not isfinite(v_debut) or not isfinite(v_fin) then
      raise exception 'Les dates du créneau doivent être finies';
    end if;
    if v_fin <= v_debut then
      raise exception 'Chaque créneau doit se terminer après avoir commencé';
    end if;
    if v_debut <= now() then
      raise exception 'Un créneau doit commencer dans le futur';
    end if;
  end loop;
  if (select count(*) from (
        select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz
        from jsonb_array_elements(p_creneaux) x
        group by 1, 2
      ) distincts) <> v_nb then
    raise exception 'Vos propositions de créneaux doivent être différentes';
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

create or replace function public.contre_proposer_creneaux(
  p_org uuid, p_intervention uuid, p_creneaux jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v record; v_nb integer; v_refuses integer; v_tour integer; c jsonb; v_debut timestamptz; v_fin timestamptz; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select iv.* into v from public.incident_interventions iv
  where iv.id = p_intervention and iv.organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;

  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;
  if v.statut <> 'acceptee' then
    raise exception 'Cette mission n''attend pas de contre-proposition (état : %)', v.statut;
  end if;

  if jsonb_typeof(p_creneaux) is distinct from 'array' then
    raise exception 'Les créneaux doivent être une liste de propositions';
  end if;
  v_nb := jsonb_array_length(p_creneaux);
  if v_nb < 3 then
    raise exception 'Si aucun créneau ne convient, proposez-en trois à votre tour (RM-10.2.2) — vous en avez proposé %', v_nb;
  end if;

  -- Valider tout le lot avant de rendre un ancien créneau caduc/refusé.
  -- Comparer les instants, pas leur écriture : +02:00 et Z peuvent désigner
  -- exactement la même proposition.
  for c in select jsonb_array_elements(p_creneaux) loop
    if jsonb_typeof(c) is distinct from 'object'
       or jsonb_typeof(c->'debut') is distinct from 'string'
       or jsonb_typeof(c->'fin') is distinct from 'string' then
      raise exception 'Chaque créneau doit contenir une date de début et une date de fin';
    end if;
    begin
      v_debut := (c->>'debut')::timestamptz;
      v_fin := (c->>'fin')::timestamptz;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'Les dates du créneau sont invalides';
    end;
    if not isfinite(v_debut) or not isfinite(v_fin) then
      raise exception 'Les dates du créneau doivent être finies';
    end if;
    if v_fin <= v_debut then
      raise exception 'Chaque créneau doit se terminer après avoir commencé';
    end if;
    if v_debut <= now() then
      raise exception 'Un créneau doit commencer dans le futur';
    end if;
  end loop;
  if (select count(*) from (
        select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz
        from jsonb_array_elements(p_creneaux) x
        group by 1, 2
      ) distincts) <> v_nb then
    raise exception 'Vos propositions de créneaux doivent être différentes';
  end if;

  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose';

  select count(*) into v_refuses from public.intervention_creneaux
  where intervention_id = p_intervention and statut = 'refuse';
  select coalesce(max(tour), 0) + 1 into v_tour
  from public.intervention_creneaux where intervention_id = p_intervention;

  for c in select jsonb_array_elements(p_creneaux) loop
    insert into public.intervention_creneaux
      (organization_id, intervention_id, propose_par, tour, debut, fin, created_by)
    values (p_org, p_intervention, 'locataire', v_tour,
            (c->>'debut')::timestamptz, (c->>'fin')::timestamptz, (select auth.uid()));
  end loop;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneaux_proposes', (select auth.uid()),
          jsonb_build_object('intervention_id', p_intervention, 'par', 'locataire',
                             'tour', v_tour, 'nombre', v_nb, 'refuses_cumules', v_refuses));

  -- RM-10.4.1 : au sixième refus, le gérant reprend la main. Les créneaux
  -- refusés restent en base — RM-10.4.4, le refus persistant est opposable.
  if v_refuses >= 6 then
    insert into public.alerts (organization_id, type, criticite, titre, details,
                               origine_type, origine_id)
    values (p_org, 'creneaux_arbitrage', 'critique',
            'Rendez-vous à arbitrer — ' ||
              (select numero from public.incidents where id = v.incident_id),
            jsonb_build_object('incident_id', v.incident_id,
                               'lot_id', (select i2.lot_id from public.incidents i2
                                          where i2.id = v.incident_id),
                               'intervention_id', p_intervention,
                               'libelle', v_refuses || ' créneaux refusés : réglez le rendez-vous par téléphone (RM-10.4.1)'),
            'intervention', p_intervention);
  end if;
  return v_nb;
end;
$$;

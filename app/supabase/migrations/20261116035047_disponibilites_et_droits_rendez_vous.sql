-- La liste est lue sans verrou. La confirmation revérifie le même planning
-- sous le verrou transactionnel de l’artisan avant toute écriture.
create function public.plage_artisan_occupee(p_artisan uuid, p_debut timestamptz, p_fin timestamptz,
  p_intervention uuid, p_chantier uuid)
returns boolean language sql stable security invoker set search_path = '' as $planning$
  select exists(select 1 from public.incident_interventions i
  where i.artisan_id=p_artisan and i.id is distinct from p_intervention
    and i.statut in ('planifiee','en_cours') and i.debut_prevu<p_fin and i.fin_prevue>p_debut)
 or exists(select 1 from public.artisan_rendez_vous r
  join public.artisan_chantiers h on h.id=r.chantier_id and h.artisan_id=r.artisan_id
  where r.artisan_id=p_artisan and r.chantier_id is distinct from p_chantier
    and r.statut='retenu' and h.statut in ('planifie','en_cours') and r.debut<p_fin and r.fin>p_debut);
$planning$;
revoke all on function public.plage_artisan_occupee(uuid,timestamptz,timestamptz,uuid,uuid)
  from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.conflit_planning_artisan(p_artisan uuid, p_debut timestamp with time zone, p_fin timestamp with time zone, p_intervention uuid DEFAULT NULL::uuid, p_chantier uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if p_artisan is null or p_debut is null or p_fin is null
    or not isfinite(p_debut) or not isfinite(p_fin) or p_fin<=p_debut then
  raise exception 'Le rendez-vous doit avoir un début et une fin valides';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_artisan::text,0));
 return public.plage_artisan_occupee(p_artisan,p_debut,p_fin,p_intervention,p_chantier);
end $function$;

CREATE OR REPLACE FUNCTION public.choisir_creneau(p_org uuid, p_creneau uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select cr.*, iv.incident_id, iv.statut as statut_intervention, iv.artisan_id
  into v from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  where cr.id = p_creneau and cr.organization_id = p_org;
  if not found then raise exception 'Créneau introuvable'; end if;
  -- Le créneau doit porter sur SON incident : la garde d'appartenance.
  select exists (
    select 1 from public.incidents i
    join public.baux b on b.id = i.bail_id
    where i.id = v.incident_id and i.organization_id = p_org
      and b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
    for share of b
  ) into v_autorise;
  if not v_autorise then raise exception 'Accès refusé'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v.artisan_id::text,0));
  -- Même mission : sérialiser également les deux choix de dates différents.
  perform 1 from public.incident_interventions where id=v.intervention_id for update;
  select cr.*, iv.incident_id, iv.statut as statut_intervention, iv.artisan_id
    into v from public.intervention_creneaux cr
    join public.incident_interventions iv on iv.id=cr.intervention_id
    where cr.id=p_creneau and cr.organization_id=p_org for update of cr;
  if v.statut_intervention not in ('acceptee','planifiee') then
    raise exception 'Cette mission n’attend pas de rendez-vous';
  end if;
  if v.statut <> 'propose' then
    if v.statut = 'retenu' and v.statut_intervention = 'planifiee' then return; end if; -- Décision D22 (LOC-21) : rejeu (REP-04)
    raise exception 'Ce créneau n''est plus proposé';
  end if;
  -- La garde manquante : on ne retient pas sa propre proposition.
  if v.propose_par = 'locataire' then
    raise exception 'Cette date est celle que vous avez proposée : elle attend l''accord de l''artisan, vous ne pouvez pas la retenir vous-même';
  end if;
  -- Un rendez-vous ne se fixe pas dans le passé (27/09).
  if v.debut <= now() then
    raise exception 'Ce créneau est passé : proposez vos disponibilités';
  end if;


  if public.conflit_planning_artisan(v.artisan_id,v.debut,v.fin,v.intervention_id,null) then
    raise exception 'Ce créneau chevauche un rendez-vous déjà confirmé de l’artisan. Choisissez une autre date ou contactez votre interlocuteur pour un arbitrage';
  end if;


  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  -- Audit du 13/10 (CHN-01) : les autres dates ne sont pas refusées, elles sont écartées par
  -- ce choix. « caduc » ne compte pas dans les six refus qui déclenchent l'arbitrage.
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = v.intervention_id and id <> p_creneau and statut = 'propose';
  update public.incident_interventions
  set statut = 'planifiee', debut_prevu = v.debut, fin_prevue = v.fin
  where id = v.intervention_id;

  insert into public.incident_evenements
    (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, v.incident_id, 'creneau_retenu', (select auth.uid()),
          jsonb_build_object('intervention_id', v.intervention_id,
                             'creneau_id', p_creneau, 'debut', v.debut, 'par', 'locataire'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.contre_proposer_creneaux(p_org uuid, p_intervention uuid, p_creneaux jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal = public.ma_personne_locataire(p_org)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id = public.ma_personne_locataire(p_org)))
    for share of b
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

  -- Audit du 13/10 (REP-01) : la même liste déjà en attente (réponse perdue,
  -- double envoi) ne change rien : ni refus fantôme, ni alerte d'arbitrage. Elle
  -- renvoie 0 (aucun créneau enregistré par cet appel) pour que l'action ne
  -- prévienne pas l'artisan une seconde fois (VER-SQL-03).
  if exists (select 1 from public.intervention_creneaux
             where intervention_id = p_intervention and propose_par = 'locataire' and statut = 'propose')
     and not exists (
       (select debut, fin from public.intervention_creneaux
        where intervention_id = p_intervention and propose_par = 'locataire' and statut = 'propose'
        except
        select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz from jsonb_array_elements(p_creneaux) x)
       union all
       (select (x->>'debut')::timestamptz, (x->>'fin')::timestamptz from jsonb_array_elements(p_creneaux) x
        except
        select debut, fin from public.intervention_creneaux
        where intervention_id = p_intervention and propose_par = 'locataire' and statut = 'propose')) then
    return 0;
  end if;

  -- Seules les propositions de l'artisan sont refusées par cette contre-proposition ;
  -- une liste précédente du locataire, remplacée par la nouvelle, devient caduque
  -- (elle n'a pas été refusée, donc elle ne compte pas dans les six refus).
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
  where intervention_id = p_intervention and statut = 'propose' and propose_par is distinct from 'locataire';
  update public.intervention_creneaux
  set statut = 'caduc'
  where intervention_id = p_intervention and statut = 'propose' and propose_par = 'locataire';

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
$function$;

CREATE OR REPLACE FUNCTION public.mes_creneaux_locataire(p_org uuid)
 RETURNS TABLE(creneau_id uuid, intervention_id uuid, incident_numero text, categorie text, debut timestamp with time zone, fin timestamp with time zone, tour integer, propose_par creneau_auteur, artisan_raison_sociale text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select cr.id, cr.intervention_id, i.numero, i.categorie, cr.debut, cr.fin,
         cr.tour, cr.propose_par, a.raison_sociale
  from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  join public.incidents i on i.id = iv.incident_id
  join public.artisans a on a.id = iv.artisan_id
  where cr.organization_id = p_org and cr.statut = 'propose'
    and cr.propose_par = 'artisan'
    -- Un créneau commencé n'est plus un choix (27/09).
    and cr.debut > now()
    and iv.statut in ('acceptee','planifiee')
    and not public.plage_artisan_occupee(iv.artisan_id,cr.debut,cr.fin,iv.id,null)
    and i.bail_id in (
      select b.id from public.baux b
      where b.organization_id = p_org and b.etat in ('actif', 'preavis')
        and (b.locataire_principal = public.ma_personne_locataire(p_org)
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.role = 'colocataire'
                          and bp.person_id = public.ma_personne_locataire(p_org))))
    and public.ma_personne_locataire(p_org) is not null
  order by cr.debut;
$function$;

CREATE OR REPLACE FUNCTION public.mes_creneaux_artisan(p_intervention uuid)
 RETURNS TABLE(creneau_id uuid, propose_par creneau_auteur, tour integer, debut timestamp with time zone, fin timestamp with time zone, statut creneau_statut)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.id, c.propose_par, c.tour, c.debut, c.fin, c.statut
  from public.intervention_creneaux c
  join public.incident_interventions i on i.id = c.intervention_id
  where c.intervention_id = p_intervention
    and i.artisan_id = public.mon_artisan_id()
    and public.mon_artisan_id() is not null
    -- Un créneau proposé déjà commencé ne se retient plus (même règle que
    -- côté locataire, migration 20260927160000) : il n'est plus montré.
    and (c.statut = 'retenu' or (c.statut = 'propose' and c.debut > now()
      and i.statut in ('acceptee','planifiee')
      and not public.plage_artisan_occupee(i.artisan_id,c.debut,c.fin,i.id,null)))
  order by c.debut;
$function$;

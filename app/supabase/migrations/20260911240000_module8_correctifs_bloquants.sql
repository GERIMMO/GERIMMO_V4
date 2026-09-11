-- Module 8 — quatre impasses trouvées par la vérification adversariale (11/09).
--
-- Chacune a été REPRODUITE en SQL avant d'être corrigée ici. Toutes ont la même
-- forme : un écran propose un geste que la base refuse ensuite, ou pire,
-- l'accepte et laisse le dossier dans un état d'où l'on ne sort plus.

-- ── 1. Le locataire fixait le rendez-vous tout seul ────────────────────────
-- `choisir_creneau` vérifiait que le créneau portait bien sur SON incident,
-- jamais QUI l'avait proposé. Un locataire qui contre-propose trois dates
-- (RM-10.2.2) pouvait rappeler l'action avec l'identifiant de SA propre date :
-- acceptée. La mission passait « planifiee » à une date que l'artisan n'a
-- jamais acceptée, entrait dans son agenda — et son absence lui était comptée
-- comme un rendez-vous manqué (RM-10.5.3). La négociation en deux tours
-- n'était plus tenue que par l'écran.
--
-- On choisit ce qu'on nous a proposé. Une contre-proposition du locataire se
-- retient par l'artisan ou par le gérant, pas par son auteur.
create or replace function public.choisir_creneau(p_org uuid, p_creneau uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v record; v_autorise boolean;
begin
  if public.ma_personne_locataire(p_org) is null then
    raise exception 'Accès refusé';
  end if;
  select cr.*, iv.incident_id, iv.statut as statut_intervention
  into v from public.intervention_creneaux cr
  join public.incident_interventions iv on iv.id = cr.intervention_id
  where cr.id = p_creneau and cr.organization_id = p_org for update of cr;
  if not found then raise exception 'Créneau introuvable'; end if;
  if v.statut <> 'propose' then
    raise exception 'Ce créneau n''est plus proposé';
  end if;
  -- La garde manquante : on ne retient pas sa propre proposition.
  if v.propose_par = 'locataire' then
    raise exception 'Cette date est celle que vous avez proposée : elle attend l''accord de l''artisan, vous ne pouvez pas la retenir vous-même';
  end if;

  -- Le créneau doit porter sur SON incident : la garde d'appartenance.
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

  update public.intervention_creneaux set statut = 'retenu' where id = p_creneau;
  update public.intervention_creneaux
  set statut = 'refuse', refuse_le = now()
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
$$;

-- ── 2. Reproposer des dates tuait définitivement le rendez-vous ────────────
-- `proposer_creneaux` acceptait depuis « planifiee » et ne rendait caducs que
-- les créneaux `propose` — jamais le `retenu`. L'index unique partiel
-- « un seul retenu par intervention » faisait alors échouer TOUT choix
-- ultérieur du locataire, avec un message brut de contrainte. Le rendez-vous
-- n'était plus déplaçable par le parcours normal.
--
-- Reproposer, c'est défaire le rendez-vous en cours : on le dit, et on le fait.
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

-- ── 3. « Retirer la mission » rendait l'incident inaffectable à jamais ─────
-- `annuler_mission` laissait le devis au statut « retenu », alors que
-- `refuser_mission` le passe bien à « annule ». L'index unique
-- `incident_devis_un_retenu` interdisait ensuite TOUT nouveau devis retenu sur
-- l'incident : l'écran promettait « l'incident revient en attente
-- d'affectation », laissait rouvrir une consultation, solliciter, recevoir un
-- devis — et « Retenir ce devis » échouait sur un message de contrainte en
-- anglais. L'incident était mort.
create or replace function public.annuler_mission(p_org uuid, p_intervention uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Le motif d''annulation est obligatoire (RM-10.5)';
  end if;
  select * into v from public.incident_interventions
  where id = p_intervention and organization_id = p_org for update;
  if not found then raise exception 'Intervention introuvable'; end if;
  if v.statut in ('terminee', 'annulee', 'refusee') then
    raise exception 'Cette mission est déjà close (état : %)', v.statut;
  end if;

  update public.incident_interventions
  set statut = 'annulee', annulee_le = now(), annulation_motif = trim(p_motif)
  where id = p_intervention;
  -- Le devis retenu tombe avec la mission annulée : il ne désigne plus
  -- personne, et tant qu'il reste « retenu » aucun autre ne peut l'être.
  update public.incident_devis set statut = 'annule'
  where id = v.devis_id and statut = 'retenu';
  update public.intervention_creneaux set statut = 'caduc'
  where intervention_id = p_intervention and statut in ('propose', 'retenu');
  update public.incidents set etat = 'qualifie'
  where id = v.incident_id and etat in ('affecte', 'en_cours');
end;
$$;

-- ── 4. Le bandeau « interventions à noter » ne pouvait plus se vider ───────
-- La file excluait les évaluations `retiree_le is null` : une note RETIRÉE par
-- la plateforme après contestation y réinscrivait donc l'intervention. Mais
-- l'unicité `artisan_evaluations_une_par_source` ignore `retiree_le` : le
-- gérant ne peut pas en redéposer une. Le bandeau restait affiché pour
-- toujours et menait à un dossier où il n'y avait rien à faire.
--
-- La file dit ce qui est FAISABLE : une intervention déjà évaluée par l'agence
-- n'y revient pas, que la note ait été retirée ou non.
create or replace function public.interventions_a_evaluer(p_org uuid)
returns table (
  intervention_id uuid, incident_id uuid, incident_numero text, artisan_id uuid,
  raison_sociale text, terminee_le timestamptz, lot_nom text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.incident_id, inc.numero, i.artisan_id, a.raison_sociale,
         i.terminee_le, l.nom
  from public.incident_interventions i
  join public.incidents inc on inc.id = i.incident_id
  join public.lots l on l.id = inc.lot_id
  join public.artisans a on a.id = i.artisan_id
  where i.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and i.statut = 'terminee'
    and not exists (select 1 from public.artisan_evaluations e
                    where e.intervention_id = i.id and e.source = 'gerant')
  order by i.terminee_le;
$$;

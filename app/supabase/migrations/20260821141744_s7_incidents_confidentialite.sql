-- Sprint 7 — revue n°2 : confidentialité et cohérence du cycle.
-- 1. mes_incidents_locataire était scopée au LOT, pas au BAIL : un nouveau
--    locataire voyait les incidents de l'ancien locataire du même lot
--    (description, imputation, contestation — divulgation inter-locataires).
--    La branche lot devient une branche bail ; la fonction dit aussi qui est
--    le déclarant (l'UI réserve contestation et réouverture au déclarant,
--    les colocataires restent informés — module 7).
-- 2. contester_imputation acceptait un incident clos (alerte orpheline que
--    plus rien ne solde) et ne vérifiait pas l'adhésion locataire active.
-- 3. rouvrir_incident conservait l'ancienne imputation : le donut « par
--    payeur » et l'espace locataire affichaient une prise en charge périmée
--    pendant la requalification. La réouverture remet l'imputation à zéro —
--    l'historique reste dans incident_evenements.

drop function public.mes_incidents_locataire(uuid);
create function public.mes_incidents_locataire(p_org uuid)
returns table (
  id uuid, numero text, categorie text, piece text, description text,
  anciennete text, urgence public.incident_urgence, etat public.incident_etat,
  imputation public.incident_imputation, imputation_justification text,
  imputation_contestee_le timestamptz, cloture_motif public.incident_cloture,
  clos_le timestamptz, declare_le timestamptz, lot_nom text, nb_photos bigint,
  est_declarant boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  with mes_fiches as (
    select p.id from public.persons p
    where p.organization_id = p_org and p.account_id = (select auth.uid())
  ),
  mes_baux as (
    select b.id from public.baux b
    where b.organization_id = p_org and b.etat in ('actif', 'preavis')
      and (b.locataire_principal in (select id from mes_fiches)
           or exists (select 1 from public.bail_personnes bp
                      where bp.bail_id = b.id and bp.role = 'colocataire'
                        and bp.person_id in (select id from mes_fiches)))
  )
  select i.id, i.numero, i.categorie, i.piece, i.description, i.anciennete,
         i.urgence, i.etat, i.imputation, i.imputation_justification,
         i.imputation_contestee_le, i.cloture_motif, i.clos_le, i.created_at,
         l.nom,
         (select count(*) from public.document_liens dl
            join public.documents d on d.id = dl.document_id and d.purged_at is null
          where dl.organization_id = p_org
            and dl.entite = 'incident' and dl.entite_id = i.id),
         (i.declarant_person_id in (select id from mes_fiches))
  from public.incidents i
  join public.lots l on l.id = i.lot_id
  where i.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))
    -- Mes déclarations (historique conservé après la fin du bail) + les
    -- incidents de MON bail (colocataires tous informés) — jamais ceux d'un
    -- bail précédent sur le même lot.
    and (i.declarant_person_id in (select id from mes_fiches)
         or i.bail_id in (select id from mes_baux))
  order by (i.etat = 'clos'), i.created_at desc;
$$;
revoke execute on function public.mes_incidents_locataire(uuid) from public, anon;

create or replace function public.contester_imputation(p_org uuid, p_incident uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  -- Adhésion locataire active exigée (un ex-locataire ne conteste plus)
  if not (p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select i.* into v from public.incidents i
  join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org
    and p.account_id = (select auth.uid())
  for update of i;
  if not found then raise exception 'Incident introuvable'; end if;
  -- Un incident clos ne se conteste plus : l'alerte n'aurait plus de clôture
  -- pour la solder (RM-7.6.2) — il se rouvre si le désordre persiste.
  if v.etat = 'clos' then
    raise exception 'Cet incident est clos — rouvrez-le si le problème persiste';
  end if;
  if v.imputation is null then
    raise exception 'Cet incident n''est pas encore qualifié — il n''y a rien à contester';
  end if;
  if v.imputation_contestee_le is not null then
    raise exception 'Votre contestation a déjà été transmise';
  end if;
  if length(trim(coalesce(p_message, ''))) = 0 then
    raise exception 'Expliquez pourquoi vous contestez cette imputation';
  end if;

  update public.incidents
  set imputation_contestee_le = now(), imputation_contestation = trim(p_message)
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'contestation', (select auth.uid()),
          jsonb_build_object('imputation', v.imputation, 'message', trim(p_message)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_conteste', 'normale',
          'Imputation contestée par le locataire — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_message), 140)));
end;
$$;

create or replace function public.rouvrir_incident(p_org uuid, p_incident uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_gerant boolean;
  v_declarant boolean;
begin
  select i.*, p.account_id as declarant_account into v
  from public.incidents i
  left join public.persons p on p.id = i.declarant_person_id
  where i.id = p_incident and i.organization_id = p_org
  for update of i;
  if not found then raise exception 'Incident introuvable'; end if;

  v_gerant := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[]));
  v_declarant := v.declarant_account = (select auth.uid())
    and p_org in (select public.org_ids_avec_roles(array['locataire']::public.membership_role[]));
  if not (v_gerant or v_declarant) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'clos' then
    raise exception 'Seul un incident clos peut être rouvert';
  end if;
  if length(trim(coalesce(p_motif, ''))) = 0 then
    raise exception 'Dites pourquoi vous rouvrez — le désordre réapparu, par exemple';
  end if;

  -- La requalification repart de zéro : l'ancienne imputation ne préjuge pas
  -- de la nouvelle (elle reste dans l'événement de réouverture).
  update public.incidents
  set etat = 'rouvert',
      imputation = null, imputation_justification = null,
      imputation_contestee_le = null, imputation_contestation = null,
      cloture_motif = null, cloture_commentaire = null,
      clos_le = null, clos_par = null
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'reouverture', (select auth.uid()),
          jsonb_build_object('motif', trim(p_motif), 'cloture_precedente',
            jsonb_build_object('motif', v.cloture_motif, 'clos_le', v.clos_le,
                               'imputation', v.imputation)));

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (p_org, 'incident_a_qualifier',
          (case when v.urgence = 'urgente' then 'critique' else 'normale' end)::public.alerte_criticite,
          'Incident rouvert, à requalifier — ' || v.numero,
          jsonb_build_object('incident_id', p_incident, 'lot_id', v.lot_id,
                             'libelle', left(trim(p_motif), 140)));
end;
$$;

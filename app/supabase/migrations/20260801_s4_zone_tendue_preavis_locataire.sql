-- Zone tendue (loi 89-462 art. 15-I) : en zone d'urbanisation continue de plus
-- de 50 000 habitants avec déséquilibre offre/demande, le préavis du locataire
-- d'un logement NU est d'un mois DE PLEIN DROIT — sans justificatif, contrairement
-- aux motifs dérogatoires (mutation, santé, perte d'emploi…). La zone était
-- absente du modèle : tout préavis d'un mois exigeait à tort un justificatif.
alter table public.biens add column zone_tendue boolean not null default false;
comment on column public.biens.zone_tendue is
  'Commune en zone tendue : préavis locataire d''un mois de plein droit sur un bail nu';

-- La zone est FIGÉE au congé : c'est celle applicable au moment du congé qui
-- compte, un reclassement ultérieur ne rétroagit pas.
alter table public.conges add column zone_tendue boolean not null default false;

create or replace function public.enregistrer_conge(
  p_bail uuid, p_par public.conge_par, p_date_presentation date, p_preavis_mois smallint,
  p_motif text default null, p_justificatif uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
begin
  select b.organization_id, b.lot_id, b.type, b.etat, coalesce(bi.zone_tendue, false)
    into v_org, v_lot, v_type, v_etat, v_zone
  from public.baux b
  join public.lots l on l.id = b.lot_id
  join public.biens bi on bi.id = l.bien_id
  where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_type = 'meuble' then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_type = 'meuble' then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois hors zone tendue : un justificatif est obligatoire (mutation, santé, perte d''emploi, RSA/AAH…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, v_zone)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end $$;

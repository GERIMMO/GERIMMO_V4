-- Congé bailleur (correctif recette 2026-08-01) : préavis légal 6 mois (nu/colocation)
-- / 3 mois (meublé), dérivé du type de bail ; motif obligatoire pour le bailleur ;
-- le préavis réduit à 1 mois (locataire, nu) reste conditionné à un justificatif.
alter table public.conges drop constraint conges_preavis_mois_check;
alter table public.conges add constraint conges_preavis_mois_check check (preavis_mois between 1 and 6);

create or replace function public.enregistrer_conge(
  p_bail uuid, p_par public.conge_par, p_date_presentation date,
  p_preavis_mois smallint, p_motif text default null, p_justificatif uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
begin
  select organization_id, lot_id, type, etat into v_org, v_lot, v_type, v_etat
  from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;

  if p_par = 'bailleur' then
    -- Préavis légal : 6 mois (nu/colocation) / 3 mois (meublé). Au terme, motif obligatoire.
    v_preavis := case when v_type = 'meuble' then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, réductible à 1 mois sur justificatif.
    if v_type = 'meuble' then
      v_preavis := 1;
    elsif p_preavis_mois = 1 then
      if p_justificatif is null then
        raise exception 'Préavis réduit à 1 mois : un justificatif est obligatoire (zone tendue, mutation, santé, perte d''emploi…)';
      end if;
      v_preavis := 1;
    else
      v_preavis := 3;
    end if;
  end if;

  v_effet := (p_date_presentation + (v_preavis || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet, motif, justificatif_document)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end;
$$;
revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid) from public, anon;

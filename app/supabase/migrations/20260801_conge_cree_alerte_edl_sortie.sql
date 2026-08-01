-- Correctif recette 2026-08-01 : l'enregistrement d'un congé doit créer une alerte
-- « état des lieux de sortie à réaliser » (plan S4 + wiki/concepts/État des lieux),
-- de façon symétrique à activer_bail qui crée l'alerte d'entrée. Omission d'origine.
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
  v_etat public.bail_etat;
  v_effet date;
  v_conge uuid;
begin
  select organization_id, lot_id, etat into v_org, v_lot, v_etat from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'actif' then raise exception 'Seul un bail actif peut recevoir un congé'; end if;
  if p_preavis_mois < 3 and p_justificatif is null then
    raise exception 'Préavis réduit : un justificatif est obligatoire (RM-1.x)';
  end if;

  v_effet := (p_date_presentation + (p_preavis_mois || ' months')::interval)::date;
  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet, motif, justificatif_document)
  values
    (v_org, p_bail, p_par, p_date_presentation, p_preavis_mois, v_effet, p_motif, p_justificatif)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;

  -- Alerte d'état des lieux de sortie (symétrique à l'alerte d'entrée d'activer_bail)
  insert into public.alerts (organization_id, type, criticite, titre, details)
  values (v_org, 'edl_sortie', 'normale',
          'État des lieux de sortie à réaliser',
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  return v_conge;
end;
$$;
revoke execute on function public.enregistrer_conge(uuid, public.conge_par, date, smallint, text, uuid) from public, anon;

-- La régularisation d'un lot en copropriété est BLOQUÉE tant qu'aucun appel
-- n'est saisi et ventilé pour l'exercice (RM-3.9.2 / 0c.6.4). La part récupérable
-- est alors dérivée des appels (non saisie à la main) et les appels sont FIGÉS.
create or replace function public.regulariser_charges(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_lot uuid; v_copro boolean; v_reel numeric; v_prov numeric; v_ecart numeric; v_nb integer;
begin
  select b.organization_id, b.lot_id into v_org, v_lot from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_justificatif is null then
    raise exception 'Un justificatif est obligatoire pour la régularisation (décompte remis au locataire)';
  end if;

  select coalesce(bi.copropriete, false) into v_copro
    from public.lots l join public.biens bi on bi.id = l.bien_id where l.id = v_lot;

  if v_copro then
    select count(*) into v_nb from public.appels_charges
      where lot_id = v_lot and exercice = p_annee and statut in ('ventile', 'fige');
    if v_nb = 0 then
      raise exception 'Régularisation bloquée : aucun appel de charges saisi et ventilé pour l''exercice % (RM-3.9.2)', p_annee;
    end if;
    v_reel := public.charges_recuperables_exercice(v_lot, p_annee);
  else
    if p_charges_reelles is null or p_charges_reelles < 0 then raise exception 'Charges réelles invalides'; end if;
    v_reel := p_charges_reelles;
  end if;

  v_prov := public.provisions_charges_annee(p_bail, p_annee);
  v_ecart := round(v_prov - v_reel, 2);
  insert into public.regularisations_charges
    (organization_id, bail_id, annee, provisions, charges_reelles, ecart, justificatif_document, note)
  values (v_org, p_bail, p_annee, v_prov, v_reel, v_ecart, p_justificatif, p_note)
  on conflict (bail_id, annee) do update
    set charges_reelles = excluded.charges_reelles, provisions = excluded.provisions,
        ecart = excluded.ecart, justificatif_document = excluded.justificatif_document,
        note = excluded.note, date_emission = current_date;

  if v_copro then
    update public.appels_charges set statut = 'fige'
      where lot_id = v_lot and exercice = p_annee and statut = 'ventile';
  end if;
  return v_ecart;
end $$;

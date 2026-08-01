-- Correctifs d'audit (suite) : charges au forfait, reçu de paiement partiel,
-- écritures comptables du dépôt de garantie, verrou de réouverture de mois.
-- NB : encaisser_depot et finaliser_decompte sont redéfinies ensuite dans
-- 20260801_correctifs_audit_ecritures_depot_bail_id.sql (ajout de bail_id).

-- A) Charges au FORFAIT : aucune régularisation possible (RM-3.9.8, loi 89-462
--    art. 23-1 — le forfait est définitif). Le mode de charges manquait.
alter table public.baux
  add column charges_mode text not null default 'provision'
    check (charges_mode in ('provision', 'forfait'));
comment on column public.baux.charges_mode is
  'Provision (régularisable annuellement) ou forfait (définitif, jamais régularisé)';

create or replace function public.regulariser_charges(
  p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_lot uuid; v_mode text; v_copro boolean;
        v_reel numeric; v_prov numeric; v_ecart numeric; v_nb integer;
begin
  select b.organization_id, b.lot_id, b.charges_mode into v_org, v_lot, v_mode
    from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_mode = 'forfait' then
    raise exception 'Charges au forfait : aucune régularisation n''est possible, le forfait est définitif (RM-3.9.8)';
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

-- B) Paiement PARTIEL : le locataire a droit à un reçu (RM-3.4.2).
create or replace function public.emettre_quittances(p_bail uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_crees int := 0; r record;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  for r in
    select e.appel_id, e.montant_du, e.montant_couvert, e.statut
    from public.etat_loyers_bail(p_bail) e
    where e.statut in ('paye', 'partiel')
      and not exists (select 1 from public.quittances q where q.appel_id = e.appel_id)
  loop
    -- Intégral → quittance ; partiel → reçu du montant réellement encaissé
    insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
    values (v_org, p_bail, r.appel_id, r.statut = 'paye',
            case when r.statut = 'paye' then r.montant_du else r.montant_couvert end);
    v_crees := v_crees + 1;
  end loop;
  return v_crees;
end $$;

-- D) Réouverture d'un mois : impossible si un rapport de gestion a été envoyé
--    sur ce mois (RM-4.4.6) — le mandant a reçu des chiffres figés.
create or replace function public.rouvrir_mois(p_org uuid, p_mois date, p_motif text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence']::public.membership_role[]))) then
    raise exception 'Seul un administrateur d''agence peut rouvrir un mois';
  end if;
  if p_motif is null or btrim(p_motif) = '' then
    raise exception 'Un motif est obligatoire pour rouvrir un mois';
  end if;
  if exists (
    select 1 from public.rapports_gestion r
    where r.organization_id = p_org
      and date_trunc('month', r.mois) = date_trunc('month', p_mois)
      and r.statut = 'envoye'
  ) then
    raise exception 'Un rapport de gestion a déjà été envoyé sur ce mois : réouverture impossible, passez par une contre-écriture et un rectificatif (RM-4.4.6)';
  end if;
  delete from public.clotures_comptables
    where organization_id = p_org and date_trunc('month', mois) = date_trunc('month', p_mois);
end $$;

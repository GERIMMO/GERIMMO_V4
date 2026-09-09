-- Correctifs de l'audit hors documents du 09/09 (trois agents : finances,
-- vie du bail, transverse). Chaque fonction est recréée depuis sa définition
-- de PRODUCTION (pg_get_functiondef), jamais depuis un fichier périmé.

-- ============================================================
-- 1. FINANCES — C1 : ventiler sans clé DUPLIQUAIT la dépense sur chaque lot
--    (1 000 € × 3 lots = 3 000 € au journal). Sans clé de répartition, la
--    ventilation se refuse ; avec clé, la dernière quote-part rattrape la
--    dérive d'arrondi (999,99 € → 1 000,00 €).
-- ============================================================
create or replace function public.ventiler_depense_bien(p_bien uuid, p_categorie text, p_montant numeric, p_date_piece date, p_date_imputation date, p_libelle text)
returns integer
language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid;
  v_cle uuid;
  v_crees int := 0;
  v_montant numeric;
  v_cumul numeric := 0;
  v_total int;
  r record;
begin
  select organization_id into v_org from public.biens where id = p_bien;
  if v_org is null then raise exception 'Bien introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;
  if coalesce(btrim(p_categorie), '') = '' then raise exception 'Catégorie obligatoire'; end if;

  select id into v_cle from public.cles_repartition
  where bien_id = p_bien and invalidated_at is null limit 1;
  if v_cle is null then
    raise exception 'Aucune clé de répartition en vigueur pour ce bien — créez la clé avant de ventiler (la dépense serait sinon comptée en double)';
  end if;

  select count(*) into v_total from public.cle_repartition_lignes where cle_id = v_cle;
  for r in
    select lot_id, pourcentage,
           row_number() over (order by lot_id) as rang
    from public.cle_repartition_lignes where cle_id = v_cle
  loop
    if r.rang = v_total then
      -- Dernière quote-part : le reste exact, pour que la somme retombe
      -- au centime sur le montant de la pièce
      v_montant := round(p_montant - v_cumul, 2);
    else
      v_montant := round(p_montant * r.pourcentage / 100, 2);
    end if;
    v_cumul := v_cumul + v_montant;
    if v_montant > 0 then
      insert into public.ecritures
        (organization_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle)
      values (v_org, r.lot_id, p_categorie, 'depense', v_montant, p_date_piece, p_date_imputation,
              coalesce(p_libelle, '') || ' (quote-part ' || r.pourcentage || ' %)');
      v_crees := v_crees + 1;
    end if;
  end loop;

  if v_crees = 0 then raise exception 'Aucun lot à ventiler pour ce bien'; end if;
  return v_crees;
end;
$$;

-- ============================================================
-- 2. FINANCES — C2 : la restitution rendait le dépôt CONTRACTUEL, jamais le
--    dépôt ENCAISSÉ. Le décompte part désormais de ce qui a réellement été
--    reçu (depot_encaissements) — un dépôt jamais versé ne se « rend » plus.
-- ============================================================
create or replace function public.demarrer_restitution(p_bail uuid, p_date_remise date, p_conforme boolean)
returns uuid
language plpgsql security definer set search_path to '' as $$
declare v record; v_impayes numeric; v_sans_edl boolean; v_depot numeric; v_id uuid;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  v_sans_edl := not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  );
  v_impayes := greatest(0,
    coalesce((select sum(montant_du) from public.appels_loyer where bail_id = p_bail), 0)
    - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0));
  -- Le dépôt à restituer est celui qui a été ENCAISSÉ (audit 09/09)
  v_depot := coalesce((select sum(montant) from public.depot_encaissements where bail_id = p_bail), 0);

  insert into public.restitutions
    (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, sans_edl_entree)
  values (v.organization_id, p_bail, p_date_remise, case when p_conforme then 1 else 2 end,
          v_depot, v_impayes, v_sans_edl)
  on conflict (bail_id) do update
    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        depot = excluded.depot, impayes = excluded.impayes, sans_edl_entree = excluded.sans_edl_entree
    where public.restitutions.statut = 'en_cours'
  returning id into v_id;
  if v_id is null then raise exception 'Restitution déjà finalisée pour ce bail'; end if;
  return v_id;
end $$;

-- ============================================================
-- 3. FINANCES — C3 : supprimer un encaissement de dépôt laissait son écriture
--    au journal (RM-A6.4 : correction par contre-écriture, comme les loyers).
--    Les écritures de dépôt portent désormais leur encaissement, et un
--    trigger contre-passe à la suppression.
-- ============================================================
alter table public.ecritures
  add column depot_encaissement_id uuid references public.depot_encaissements(id) on delete set null;

create or replace function public.encaisser_depot(p_bail uuid, p_montant numeric, p_date date, p_moyen text, p_versant_person uuid default null::uuid, p_versant_libelle text default null::text)
returns numeric
language plpgsql security definer set search_path to '' as $$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer; v_meuble boolean; v_enc uuid;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;

  select coalesce(l.meuble, false) into v_meuble from public.lots l where l.id = v.lot_id;
  v_mois := case when v.type = 'meuble' or v_meuble then 2 else 1 end;
  v_plafond := coalesce(v.loyer_hc, 0) * v_mois;
  if coalesce(v.depot_garantie, 0) > v_plafond then
    raise exception 'Dépôt de % € supérieur au plafond légal de % € (% mois hors charges)',
      v.depot_garantie, v_plafond, v_mois;
  end if;

  select coalesce(sum(montant), 0) into v_cumul from public.depot_encaissements where bail_id = p_bail;
  if v_cumul + p_montant > coalesce(v.depot_garantie, 0) then
    raise exception 'Encaissement (% €) dépasse le dépôt dû restant (% €)',
      p_montant, coalesce(v.depot_garantie, 0) - v_cumul;
  end if;

  insert into public.depot_encaissements
    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle)
  returning id into v_enc;

  insert into public.ecritures
    (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme, depot_encaissement_id)
  values (v.organization_id, p_bail, v.lot_id, 'depot_garantie', 'recette', p_montant,
          coalesce(p_date, current_date), coalesce(p_date, current_date),
          'Encaissement du dépôt de garantie', true, v_enc);
  return v_cumul + p_montant;
end $$;

-- Suppression → contre-écriture (même patron que les loyers). Les
-- encaissements antérieurs à cette migration n'ont pas de lien : leur
-- suppression reste sans contre-passation automatique (état documenté).
create function public.contre_passer_depot_encaissement()
returns trigger
language plpgsql security definer set search_path to '' as $$
declare e record;
begin
  for e in
    select * from public.ecritures o
     where o.depot_encaissement_id = old.id
       and o.contre_ecriture_de is null
       and not exists (select 1 from public.ecritures c where c.contre_ecriture_de = o.id)
  loop
    insert into public.ecritures
      (organization_id, bail_id, lot_id, mandat_id, categorie, sens, montant,
       date_piece, date_imputation, libelle, systeme, contre_ecriture_de)
    values (e.organization_id, e.bail_id, e.lot_id, e.mandat_id, e.categorie,
            case when e.sens = 'recette' then 'depense' else 'recette' end,
            e.montant, current_date, current_date,
            'Annulation — encaissement de dépôt supprimé', true, e.id);
  end loop;
  return old;
end $$;
create trigger depot_encaissement_contre_passe
  before delete on public.depot_encaissements
  for each row execute function public.contre_passer_depot_encaissement();

-- ============================================================
-- 4. FINANCES — C4 + M9 : la régularisation comparait des provisions
--    PRORATISÉES à des charges réelles d'exercice ENTIER (RM-3.9.1 : quote-
--    part au prorata des jours d'occupation) ; et une régularisation émise
--    s'écrasait en silence (RM-3.9.7 : jamais de modification).
-- ============================================================
create or replace function public.regulariser_charges(p_bail uuid, p_annee integer, p_charges_reelles numeric, p_justificatif uuid, p_note text default null::text)
returns numeric
language plpgsql security definer set search_path to '' as $$
declare v_org uuid; v_lot uuid; v_mode text; v_copro boolean;
        v_debut date; v_fin date; v_jours integer; v_jours_annee integer;
        v_reel numeric; v_prov numeric; v_ecart numeric; v_nb integer;
begin
  select b.organization_id, b.lot_id, b.charges_mode,
         greatest(coalesce(b.date_debut, make_date(p_annee, 1, 1)), make_date(p_annee, 1, 1)),
         least(coalesce(b.date_fin, make_date(p_annee, 12, 31)), make_date(p_annee, 12, 31))
    into v_org, v_lot, v_mode, v_debut, v_fin
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
  -- RM-3.9.7 : une régularisation émise ne se modifie jamais
  if exists (select 1 from public.regularisations_charges
             where bail_id = p_bail and annee = p_annee) then
    raise exception 'Une régularisation existe déjà pour l''exercice % — émise, elle ne se modifie plus (la rectificative arrive avec un prochain chantier)', p_annee;
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

  -- RM-3.9.1 : la quote-part du locataire suit ses jours d'occupation
  v_jours := greatest(0, v_fin - v_debut + 1);
  v_jours_annee := make_date(p_annee, 12, 31) - make_date(p_annee, 1, 1) + 1;
  if v_jours = 0 then
    raise exception 'Le bail ne couvre aucun jour de l''exercice %', p_annee;
  end if;
  v_reel := round(v_reel * v_jours / v_jours_annee, 2);

  v_prov := public.provisions_charges_annee(p_bail, p_annee);
  v_ecart := round(v_prov - v_reel, 2);
  insert into public.regularisations_charges
    (organization_id, bail_id, annee, provisions, charges_reelles, ecart, justificatif_document, note)
  values (v_org, p_bail, p_annee, v_prov, v_reel, v_ecart, p_justificatif, p_note);

  if v_copro then
    update public.appels_charges set statut = 'fige'
      where lot_id = v_lot and exercice = p_annee and statut = 'ventile';
  end if;
  return v_ecart;
end $$;

-- ============================================================
-- 5. FINANCES — C5 : un agent pouvait s'attribuer n'importe quel mandat (ou
--    remettre les siens « à toute l'agence » et faire sauter son périmètre).
--    Le titulaire ne se change que par le responsable (RM-18.1.4).
-- ============================================================
create function public.mandat_titulaire_protege()
returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if new.agent_account_id is distinct from old.agent_account_id
     and not public.can_manage_organization(new.organization_id) then
    raise exception 'Seul le responsable de l''agence choisit le titulaire d''un mandat (RM-18.1.4)';
  end if;
  return new;
end $$;
create trigger mandats_titulaire_protege
  before update on public.mandats
  for each row execute function public.mandat_titulaire_protege();

-- ============================================================
-- 6. FINANCES — m4/m5 : versement seulement sur rapport envoyé ; âge de
--    vétusté négatif rejeté (sinon la retenue dépassait le coût).
-- ============================================================
create or replace function public.enregistrer_versement(p_rapport uuid, p_montant numeric, p_date date)
returns void
language plpgsql security definer set search_path to '' as $$
declare v record; v_motif text;
begin
  select * into v from public.rapports_gestion where id = p_rapport;
  if v.id is null then raise exception 'Rapport introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut <> 'envoye' then
    raise exception 'Le rapport doit être envoyé au mandant avant d''enregistrer son versement';
  end if;
  update public.rapports_gestion set versement_montant = p_montant, versement_date = p_date where id = p_rapport;

  v_motif := format('Versement de %s € enregistré le %s', coalesce(p_montant, 0), to_char(p_date, 'DD/MM/YYYY'));
  perform public.fermer_alertes_origine(v.organization_id, 'rapport', p_rapport, v_motif,
                                        array['versement_proprietaire']);
  if abs(coalesce(p_montant, 0) - v.net) > 0.01 then
    if exists (select 1 from public.alerts where organization_id = v.organization_id
                 and statut = 'ouverte' and type = 'ecart_versement' and origine_id = p_rapport) then
      update public.alerts
         set details = jsonb_build_object('rapport_id', p_rapport, 'net', v.net, 'verse', p_montant)
       where organization_id = v.organization_id and statut = 'ouverte'
         and type = 'ecart_versement' and origine_id = p_rapport;
    else
      insert into public.alerts (organization_id, type, criticite, titre, details)
      values (v.organization_id, 'ecart_versement', 'critique',
              'Écart entre le versement et le net du rapport',
              jsonb_build_object('rapport_id', p_rapport, 'net', v.net, 'verse', p_montant));
    end if;
  else
    perform public.fermer_alertes_origine(v.organization_id, 'rapport', p_rapport,
                                          'Écart régularisé — ' || v_motif, array['ecart_versement']);
  end if;
end $$;

create or replace function public.ajouter_retenue(p_restitution uuid, p_libelle text, p_cout numeric, p_duree_vie numeric, p_age numeric, p_justificatif uuid default null::uuid)
returns numeric
language plpgsql security definer set search_path to '' as $$
declare v record; v_montant numeric; v_retenue uuid;
begin
  select * into v from public.restitutions where id = p_restitution;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte finalisé — plus de retenue possible'; end if;
  if v.sans_edl_entree then
    raise exception 'Sans état des lieux d''entrée, aucune retenue n''est possible : restitution intégrale (RM-2.4.3)';
  end if;
  if p_cout is null or p_cout <= 0 then raise exception 'Coût de remise en état invalide'; end if;
  if p_age is not null and p_age < 0 then raise exception 'Âge de l''élément invalide'; end if;

  if p_duree_vie is null or p_duree_vie <= 0 or p_age is null then
    v_montant := round(p_cout, 2);
  else
    if p_age >= p_duree_vie then
      raise exception 'Élément entièrement amorti (% ans sur % ans) : aucune retenue possible (RM-2.4.5)',
        p_age, p_duree_vie;
    end if;
    v_montant := round(p_cout * ((p_duree_vie - p_age) / p_duree_vie), 2);
  end if;

  insert into public.retenues
    (organization_id, restitution_id, libelle, cout, duree_vie_ans, age_ans, montant_retenu,
     justificatif_document, sans_justificatif)
  values (v.organization_id, p_restitution, p_libelle, p_cout, p_duree_vie, p_age, v_montant,
          p_justificatif, p_justificatif is null)
  returning id into v_retenue;

  if p_justificatif is null then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v.organization_id, 'retenue_sans_justificatif', 'normale',
            'Retenue sans justificatif — difficilement défendable',
            jsonb_build_object('retenue_id', v_retenue, 'restitution_id', p_restitution,
                               'libelle', p_libelle, 'montant', v_montant));
  end if;
  return v_montant;
end $$;

-- ============================================================
-- 7. FINANCES — M4 : les KPI de la comptabilité se calculaient sur une page
--    de 200 écritures. Agrégat serveur, hors mouvements de dépôt de garantie
--    et hors paires contre-passées (exploitation réelle).
-- ============================================================
create function public.totaux_ecritures(p_org uuid, p_lots uuid[] default null)
returns table (recettes numeric, depenses numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(e.montant) filter (where e.sens = 'recette'), 0),
         coalesce(sum(e.montant) filter (where e.sens = 'depense'), 0)
  from public.ecritures e
  where e.organization_id = p_org
    and p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and e.categorie <> 'depot_garantie'
    and e.contre_ecriture_de is null
    and not exists (select 1 from public.ecritures c where c.contre_ecriture_de = e.id)
    and (p_lots is null or e.lot_id = any(p_lots));
$$;
revoke execute on function public.totaux_ecritures(uuid, uuid[]) from public, anon;

-- ============================================================
-- 8. VIE DU BAIL — C1 : un EDL de SORTIE se crée et se signe pendant le
--    préavis (ou après clôture), jamais avant — un EDL de sortie signé par
--    erreur rendait le congé définitivement inannulable.
-- ============================================================
create or replace function public.signer_edl(p_edl uuid)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v record;
  v_bail_etat public.bail_etat;
  v_manquantes int;
  v_total int;
begin
  select * into v from public.etats_des_lieux where id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'signe' then raise exception 'EDL déjà signé'; end if;
  select b.etat into v_bail_etat from public.baux b where b.id = v.bail_id;
  if v.type = 'sortie' and v_bail_etat not in ('preavis', 'termine') then
    raise exception 'Un état des lieux de sortie se signe pendant le préavis — enregistrez d''abord le congé';
  end if;

  select count(*) filter (where etat is null), count(*)
    into v_manquantes, v_total
  from public.edl_lignes where edl_id = p_edl;
  if v_total = 0 then
    raise exception 'Grille vide : générez la grille avant de signer';
  end if;
  if v_manquantes > 0 then
    raise exception 'Aucune ligne ne peut rester sans état (% à compléter)', v_manquantes;
  end if;

  update public.etats_des_lieux set etat = 'signe', signe_le = now() where id = p_edl;
end;
$$;

-- ============================================================
-- 9. VIE DU BAIL — M4 : la grille s'enregistrait ligne à ligne côté action
--    (sauvegarde partielle silencieuse au premier refus). Une RPC, une
--    transaction : tout passe ou rien.
-- ============================================================
create function public.enregistrer_grille_edl(p_edl uuid, p_lignes jsonb, p_signer boolean default false)
returns void
language plpgsql security definer set search_path to '' as $$
declare v record; l record;
begin
  select * into v from public.etats_des_lieux where id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat = 'signe' then
    raise exception 'EDL signé : les lignes sont figées';
  end if;

  for l in select * from jsonb_to_recordset(p_lignes)
           as x(id uuid, etat text, commentaire text)
  loop
    update public.edl_lignes
       set etat = nullif(l.etat, ''), commentaire = nullif(l.commentaire, '')
     where id = l.id and edl_id = p_edl;
  end loop;

  if p_signer then
    perform public.signer_edl(p_edl);
  end if;
end $$;
revoke execute on function public.enregistrer_grille_edl(uuid, jsonb, boolean) from public, anon;

-- ============================================================
-- 10. VIE DU BAIL — M7 : les équipements du lot se redéfinissent en une
--     transaction (la purge puis l'insert séparés pouvaient tout perdre).
-- ============================================================
create function public.definir_equipements_lot(p_lot uuid, p_equipements uuid[])
returns void
language plpgsql security definer set search_path to '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.lots where id = p_lot;
  if v_org is null then raise exception 'Lot introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_equipements, '{}'::uuid[])) as e(id)
    where not exists (select 1 from public.equipements_catalogue c
                      where c.id = e.id and c.organization_id = v_org)
  ) then
    raise exception 'Équipement inconnu du catalogue de l''agence';
  end if;

  delete from public.lot_equipements where lot_id = p_lot;
  insert into public.lot_equipements (lot_id, equipement_id)
  select p_lot, e.id from unnest(coalesce(p_equipements, '{}'::uuid[])) as e(id);
end $$;
revoke execute on function public.definir_equipements_lot(uuid, uuid[]) from public, anon;

-- ============================================================
-- 11. TRANSVERSE — M1 : le super admin était absent des listes de gérants
--     (impossible de se confier une alerte ou un incident) ; il apparaît
--     désormais comme membre « super_admin », et attribuer_incident
--     l'accepte comme responsable.
-- ============================================================
create or replace function public.org_membres_gerants(org uuid)
returns table(account_id uuid, email text, role public.membership_role)
language sql stable security definer set search_path to '' as $$
  select * from (
    select m.account_id, a.email, m.role
    from public.memberships m
    join public.accounts a on a.id = m.account_id
    where m.organization_id = org
      and m.status = 'active'
      and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
      and (
        org in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
        or public.is_super_admin()
      )
    union all
    select a.id, a.email, 'super_admin'::public.membership_role
    from public.accounts a
    where a.id = (select auth.uid()) and public.is_super_admin()
  ) t
  order by t.email;
$$;

create or replace function public.attribuer_incident(p_org uuid, p_incident uuid, p_responsable uuid)
returns void
language plpgsql security definer set search_path to '' as $$
declare
  v record;
  v_responsable_org boolean;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat = 'clos' then
    raise exception 'Un incident clos ne s''attribue plus';
  end if;

  v_responsable_org := p_org in (select public.org_ids_avec_roles(
    array['admin_agence','proprietaire_direct']::public.membership_role[]));
  if not v_responsable_org then
    if not ((p_responsable = (select auth.uid()) and v.responsable_account_id is null)
            or (p_responsable is null and v.responsable_account_id = (select auth.uid()))) then
      raise exception 'Ce dossier est suivi par quelqu''un d''autre — seul le responsable de l''agence peut le réattribuer';
    end if;
  end if;
  if p_responsable is not null and not exists (
    select 1 from public.memberships m
    where m.account_id = p_responsable
      and m.status = 'active'
      and (
        (m.organization_id = p_org
         and m.role in ('admin_agence', 'agent', 'proprietaire_direct'))
        or m.role = 'super_admin'
      )
  ) then
    raise exception 'Le responsable choisi n''est pas un gestionnaire actif de l''agence';
  end if;

  update public.incidents set responsable_account_id = p_responsable where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'attribution', (select auth.uid()),
          jsonb_build_object('responsable', p_responsable));
end;
$$;

-- ============================================================
-- 12. TRANSVERSE — m1/m2 : union all (pas de tri/dédoublonnage inutile dans
--     org_ids_avec_roles) ; policies demandes_devis limitées à authenticated.
-- ============================================================
create or replace function public.org_ids_avec_roles(roles public.membership_role[])
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.memberships m
  where m.account_id = (select auth.uid())
    and m.status = 'active'
    and m.organization_id is not null
    and m.role = any (roles)
  union all
  select o.id from public.organizations o where public.is_super_admin();
$$;

drop policy if exists demandes_devis_select_sa on public.demandes_devis;
create policy demandes_devis_select_sa on public.demandes_devis
  for select to authenticated using ((select public.is_super_admin()));
drop policy if exists demandes_devis_update_sa on public.demandes_devis;
create policy demandes_devis_update_sa on public.demandes_devis
  for update to authenticated using ((select public.is_super_admin()));

-- ============================================================
-- 13. FINANCES — M12 : envoyer_rapport (échéance J+15, RM-6.2.7) était
--     appliqué en production sans fichier de migration. Version identique à
--     la production, committée pour la reproductibilité.
-- ============================================================
create or replace function public.envoyer_rapport(p_rapport uuid, p_commentaire text default null::text)
returns void
language plpgsql security definer set search_path to '' as $$
declare v record;
begin
  select * into v from public.rapports_gestion where id = p_rapport;
  if v.id is null then raise exception 'Rapport introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'envoye' then raise exception 'Rapport déjà envoyé (figé)'; end if;
  update public.rapports_gestion
    set statut = 'envoye', envoye_le = now(), commentaire = coalesce(p_commentaire, commentaire)
    where id = p_rapport;
  -- Échéance : versement au mandant dans les quinze jours
  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (v.organization_id, 'versement_proprietaire', 'normale',
          'Versement au propriétaire à faire',
          jsonb_build_object('rapport_id', p_rapport, 'mandat_id', v.mandat_id, 'net', v.net),
          current_date + 15);
end $$;

-- Décision du 29/08 — le bail se VALIDE, il ne s'« active » plus.
--
-- 1. L'état des lieux d'entrée n'est plus une alerte créée APRÈS l'activation
--    (alerte edl_entree, jamais fermée automatiquement) : il devient une
--    CONDITION de la validation. Sans EDL d'entrée signé, le bail reste en
--    brouillon. L'alerte disparaît : l'événement qu'elle rappelait est
--    désormais un prérequis, pas une tâche à retenir.
-- 2. Un lot ne porte qu'un seul bail actif (ou en préavis) — mais un brouillon
--    peut coexister (préparation du bail suivant). Refus explicite, avant le
--    contrôle d'état du lot dont le message ne disait pas pourquoi.
-- 3. Règlement de copropriété : pièce facultative rattachée au bail (les
--    extraits du règlement sont annexés au bail en copropriété).

-- ------------------------------------------------------------
-- Règlement de copropriété : type GED + colonne sur le bail
-- ------------------------------------------------------------
alter type public.document_type add value if not exists 'reglement_copropriete';

alter table public.baux
  add column if not exists reglement_copropriete uuid;

alter table public.baux
  drop constraint if exists baux_reglement_meme_org_fk;
alter table public.baux
  add constraint baux_reglement_meme_org_fk
  foreign key (reglement_copropriete, organization_id)
  references public.documents (id, organization_id);

-- Conservation : annexe du bail, même règle que le bail (prescription des
-- actions nées du bail — hypothèse à confirmer, cf. journal du 29/08).
insert into public.retention_rules (data_type, libelle, finalite, declencheur, duree_mois, sort)
select 'document:reglement_copropriete', 'Règlements de copropriété (annexe du bail)',
       'Prescription des actions nées du bail', 'Fin du bail', 60, 'suppression'
where not exists (
  select 1 from public.retention_rules where data_type = 'document:reglement_copropriete'
);

-- ------------------------------------------------------------
-- Validation du bail
-- ------------------------------------------------------------
create or replace function public.activer_bail(p_bail uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être validé';
  end if;
  if v.locataire_principal is null then
    raise exception 'Le locataire principal est obligatoire';
  end if;
  if v.document_signe is null then
    raise exception 'Déposez le bail signé (PDF) avant de valider (V0 : signature hors plateforme)';
  end if;
  -- L'état des lieux d'entrée se fait à la remise des clés : il est signé
  -- AVANT que le bail ne soit validé — sinon aucune retenue possible à la
  -- sortie (RM-2.4.3), et l'agence l'oubliait une fois le lot loué.
  if not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  ) then
    raise exception 'L''état des lieux d''entrée doit être signé avant de valider le bail';
  end if;

  if v.loyer_hc is not null and v.depot_garantie is not null then
    v_plafond := (case when v.type = 'meuble' then 2 else 1 end) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        (case when v.type = 'meuble' then 2 else 1 end), v_plafond;
    end if;
  end if;

  -- Un seul bail actif par lot ; le brouillon suivant attend la fin du précédent
  if exists (
    select 1 from public.baux b
    where b.lot_id = v.lot_id and b.id <> p_bail and b.etat in ('actif', 'preavis')
  ) then
    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de valider celui-ci';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;

  update public.baux
     set etat = 'actif',
         date_debut = coalesce(date_debut, current_date),
         updated_at = now()
   where id = p_bail;
  update public.lots set etat = 'loue' where id = v.lot_id;
end;
$$;

-- Les alertes edl_entree encore ouvertes n'ont plus d'objet : la règle qui
-- les justifiait est retirée (un bail déjà actif sans EDL d'entrée reste
-- signalé dans la fiche du bail, carte « États des lieux »).
update public.alerts
   set statut = 'fermee',
       closed_at = now(),
       closed_action = 'Règle retirée le 29/08 : l''état des lieux d''entrée conditionne désormais la validation du bail'
 where type = 'edl_entree' and statut = 'ouverte';

-- Revue du 23/08 — correctifs issus de la passe de revue multi-angles.
-- (À partir de ce fichier, les migrations portent un horodatage complet :
-- l'ordre lexical des fichiers redevient l'ordre chronologique.)

-- ============================================================
-- 1. Un EDL signé est figé : compteurs et clés compris (M1)
--    Seules les lignes étaient verrouillées (edl_lignes_fige_trg) — un onglet
--    resté ouvert pouvait encore écrire un relevé ou retirer une clé.
-- ============================================================
create or replace function public.edl_annexe_verifier_non_signe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_edl uuid;
  v_etat public.edl_etat;
begin
  v_edl := coalesce(new.edl_id, old.edl_id);
  select etat into v_etat from public.etats_des_lieux where id = v_edl;
  if v_etat = 'signe' then
    raise exception 'État des lieux signé : il est figé, compteurs et clés compris';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists edl_compteurs_fige_trg on public.edl_compteurs;
create trigger edl_compteurs_fige_trg
  before insert or update or delete on public.edl_compteurs
  for each row execute function public.edl_annexe_verifier_non_signe();

drop trigger if exists edl_cles_fige_trg on public.edl_cles;
create trigger edl_cles_fige_trg
  before insert or update or delete on public.edl_cles
  for each row execute function public.edl_annexe_verifier_non_signe();

-- ============================================================
-- 2. Grille d'EDL de sortie : miroir de l'entrée signée (M3)
--    Le comparatif joint ligne à ligne sur (piece, libelle, categorie) : une
--    sortie régénérée depuis des pièces déclarées APRÈS l'entrée ne matchait
--    plus rien et tout sortait « écart ». La sortie copie désormais la
--    structure de l'entrée signée quand elle existe.
-- ============================================================
create or replace function public.generer_grille_edl(p_edl uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_crees int := 0;
  v_ordre int := 0;
  v_piece record;
  v_element text;
  v_equip record;
  v_a_pieces boolean;
  v_entree uuid;
  v_elements text[] := array['Sols','Murs','Plafonds','Fenêtres et volets','Portes','Prises électriques','Éclairage et interrupteurs'];
begin
  select e.organization_id, e.etat, e.type, e.bail_id, b.lot_id into v
  from public.etats_des_lieux e
  join public.baux b on b.id = e.bail_id
  where e.id = p_edl;
  if not found then raise exception 'EDL introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'La grille ne se régénère pas sur un EDL signé';
  end if;

  delete from public.edl_lignes where edl_id = p_edl;

  -- Sortie : la structure du comparatif est celle de l'entrée signée
  if v.type = 'sortie' then
    select e.id into v_entree from public.etats_des_lieux e
    where e.bail_id = v.bail_id and e.type = 'entree' and e.etat = 'signe'
    order by e.created_at desc limit 1;
    if v_entree is not null then
      insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
      select v.organization_id, p_edl, l.categorie, l.piece, l.libelle, l.ordre
      from public.edl_lignes l where l.edl_id = v_entree
      order by l.ordre;
      get diagnostics v_crees = row_count;
      return v_crees;
    end if;
  end if;

  select exists (select 1 from public.lot_pieces lp where lp.lot_id = v.lot_id) into v_a_pieces;

  if v_a_pieces then
    for v_piece in select nom from public.lot_pieces where lot_id = v.lot_id order by ordre, nom loop
      foreach v_element in array v_elements loop
        insert into public.edl_lignes (organization_id, edl_id, categorie, piece, libelle, ordre)
        values (v.organization_id, p_edl, 'piece', v_piece.nom, v_element, v_ordre);
        v_ordre := v_ordre + 1; v_crees := v_crees + 1;
      end loop;
    end loop;
  else
    foreach v_element in array v_elements loop
      insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
      values (v.organization_id, p_edl, 'general', v_element, v_ordre);
      v_ordre := v_ordre + 1; v_crees := v_crees + 1;
    end loop;
  end if;

  for v_equip in
    select ec.nom from public.lot_equipements le
    join public.equipements_catalogue ec on ec.id = le.equipement_id
    where le.lot_id = v.lot_id order by ec.nom
  loop
    insert into public.edl_lignes (organization_id, edl_id, categorie, libelle, ordre)
    values (v.organization_id, p_edl, 'equipement', v_equip.nom, v_ordre);
    v_ordre := v_ordre + 1; v_crees := v_crees + 1;
  end loop;

  return v_crees;
end;
$$;
revoke execute on function public.generer_grille_edl(uuid) from public, anon;

-- ============================================================
-- 3. Réponse à une contestation : la REqualification (R2)
--    L'alerte « imputation contestée » n'était soldable qu'en clôturant
--    l'incident. Un incident qualifié se requalifie désormais (maintien ou
--    changement d'imputation, justification opposable) — cela solde les
--    alertes « à qualifier » ET « contestée ».
-- ============================================================
create or replace function public.qualifier_incident(
  p_org uuid, p_incident uuid,
  p_imputation public.incident_imputation, p_justification text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v from public.incidents
  where id = p_incident and organization_id = p_org for update;
  if not found then raise exception 'Incident introuvable'; end if;
  if v.etat not in ('declare', 'rouvert', 'qualifie') then
    raise exception 'Cet incident ne se qualifie plus (état actuel : %) (RM-A5.1)', v.etat;
  end if;
  if length(trim(coalesce(p_justification, ''))) = 0 then
    raise exception 'La justification de l''imputation est obligatoire — elle est opposable (RM-7.2.3)';
  end if;

  update public.incidents
  set etat = 'qualifie', imputation = p_imputation,
      imputation_justification = trim(p_justification),
      -- Une (re)qualification remet la contestation à zéro : elle portait sur
      -- l'imputation précédente.
      imputation_contestee_le = null, imputation_contestation = null
  where id = p_incident;

  insert into public.incident_evenements (organization_id, incident_id, type, acteur_account_id, details)
  values (p_org, p_incident, 'qualification', (select auth.uid()),
          jsonb_build_object('imputation', p_imputation, 'justification', trim(p_justification),
                             'imputation_precedente', v.imputation,
                             'requalification', v.etat = 'qualifie'));

  -- Une transition, plusieurs effets (RM-A5.3) : la qualification solde
  -- « à qualifier » et, en réponse à une contestation, « contestée ».
  update public.alerts
  set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
      closed_action = case when v.etat = 'qualifie'
        then 'Incident ' || v.numero || ' requalifié — réponse à la contestation'
        else 'Incident ' || v.numero || ' qualifié' end
  where organization_id = p_org and statut = 'ouverte'
    and type in ('incident_a_qualifier', 'incident_conteste')
    and details->>'incident_id' = p_incident::text;
end;
$$;
revoke execute on function public.qualifier_incident(uuid, uuid, public.incident_imputation, text)
  from public, anon;

-- ============================================================
-- 4. Mandat vide hors brouillon : porte de sortie (B-1)
--    La garde du 23/08 figeait TOUT changement d'état d'un mandat vide — un
--    mandat vide déjà à signer/actif/préavis devenait une impasse (personne
--    inarchivable). Le retour en brouillon est désormais permis : on
--    recompose, ou on résilie une fois composé. Et sur un mandat résilié, on
--    laisse la garde « historisé » parler (message juste).
-- ============================================================
create or replace function public.mandat_verifier_contenu_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.etat is distinct from new.etat then
    -- Résilié : l'autre trigger répond « historisé — non modifiable »
    if old.etat = 'resilie' then return new; end if;
    -- Retour en brouillon : la porte de sortie d'un mandat vide
    if new.etat = 'brouillon' then return new; end if;
    if not exists (
      select 1 from public.mandat_lignes ml
      where ml.mandat_id = new.id and ml.date_fin is null
    ) then
      raise exception 'Un mandat sans lot ni taux ne change pas d''état : repassez-le en brouillon pour le composer (recette 23/08)';
    end if;
  end if;
  return new;
end;
$$;

-- ============================================================
-- 5. Espace locataire : le colocataire voit son bail (M2)
--    mon_bail / mon_depot / mon_echeancier ne regardaient que le locataire
--    principal — un colocataire (bail_personnes) voyait « aucun bail actif »
--    alors que mes_incidents_locataire le reconnaissait déjà.
-- ============================================================
create or replace function public.mon_bail_locataire(p_org uuid)
returns table (bail_id uuid, type public.bail_type, etat public.bail_etat,
               loyer_hc numeric, charges numeric, date_debut date, date_fin date, lot_nom text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.type, b.etat, b.loyer_hc, b.charges, b.date_debut, b.date_fin, l.nom
  from public.baux b
  join public.lots l on l.id = b.lot_id
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc;
$$;

create or replace function public.mon_depot_locataire(p_org uuid)
returns table (depot_du numeric, encaisse numeric, derniere_date date)
language sql stable security definer set search_path = '' as $$
  select coalesce(b.depot_garantie, 0),
         coalesce((select sum(d.montant) from public.depot_encaissements d where d.bail_id = b.id), 0),
         (select max(d.date_encaissement) from public.depot_encaissements d where d.bail_id = b.id)
  from public.baux b
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by b.created_at desc
  limit 1;
$$;

drop function if exists public.mon_echeancier_locataire(uuid);
create function public.mon_echeancier_locataire(p_org uuid)
returns table (periode date, montant_du numeric, montant_couvert numeric, statut text, quittance_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.periode, e.montant_du, e.montant_couvert, e.statut,
    (select q.id from public.quittances q where q.appel_id = e.appel_id) as quittance_id
  from public.baux b
  cross join lateral public.etat_loyers_bail(b.id) e
  where b.organization_id = p_org
    and b.etat in ('actif', 'preavis')
    and exists (
      select 1 from public.persons p
      where p.organization_id = p_org and p.account_id = (select auth.uid())
        and (p.id = b.locataire_principal
             or exists (select 1 from public.bail_personnes bp
                        where bp.bail_id = b.id and bp.person_id = p.id
                          and bp.role = 'colocataire')))
  order by e.periode;
$$;
revoke execute on function public.mon_bail_locataire(uuid) from public, anon;
revoke execute on function public.mon_depot_locataire(uuid) from public, anon;
revoke execute on function public.mon_echeancier_locataire(uuid) from public, anon;

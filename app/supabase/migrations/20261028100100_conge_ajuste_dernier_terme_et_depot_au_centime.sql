-- Audit final du 27/10 (chantier « loyers — calculs », constats LOY-01, LOY-V01 et COD-03).
--
-- 1. Le dernier terme suit le congé (LOY-01, LOY-V01).
--    Avant : `generer_appels_loyer_interne` ne crée que les périodes ABSENTES ; le prorata de sortie n'était calculé qu'à
--    la naissance de l'appel. Un congé enregistré APRÈS le cycle du 1er (congé reçu le 25/09, saisi le 27/10 : fin le
--    25/10) laissait l'appel d'octobre au mois plein (500,00 € au lieu de 403,22 €) : le locataire était compté
--    impayé pour des jours non dus, et la quittance couvrait tout le mois. Symétriquement, un congé ANNULÉ après la
--    génération de l'appel du mois de sortie (le locataire reste) laissait cet appel au prorata : mois sous-facturé,
--    quittance bornée « du 01/10 au 25/10 » pour un locataire qui occupe tout le mois.
--    Maintenant : `ajuster_appel_fin_de_bail(p_bail, p_ancienne_fin)` est appelée en fin d'`enregistrer_conge` (donc
--    aussi d'`enregistrer_conge_avec_justificatif`, qui l'enchaîne) et d'`annuler_conge`. Pour le mois de la nouvelle
--    date de fin et celui de l'ancienne, l'appel existant est recalculé avec la MÊME règle que la génération (bornes du
--    mois, un seul arrondi à la fin sur chaque composante, total = somme des composantes : `montants_appel_loyer`,
--    extraite de 20261014120000) ; `resynchroniser_quittances` remet ensuite quittance ou reçu en accord. Si une
--    quittance de cet appel a déjà été ENVOYÉE au locataire (`quittances.email_envoye_at`), rien n'est modifié : une
--    alerte « terme_a_regulariser » le dit au gérant (le document délivré ne se réécrit pas dans son dos). Un appel
--    POSTÉRIEUR au mois de sortie (congé saisi très tard) n'est jamais supprimé ni modifié : même alerte.
--    Le mois d'entrée et les autres mois ne sont jamais touchés, et la BASE du recalcul est la base mensuelle (loyer et
--    charges) qui a réellement servi à émettre l'appel, mémorisée sur `appels_loyer` (`base_loyer_hc`, `base_charges`,
--    seconde relecture du 28/10 : une révision datée dans le mois de sortie ne refacture plus ce mois au loyer révisé, et
--    congé puis annulation rend l'appel d'origine au centime). Un document déjà envoyé d'un autre terme que
--    l'imputation globale réécrit l'est comme avant (cohérent avec l'imputation, à renvoyer) : une alerte
--    « document_envoye_remplace » dit au gérant ce qui a été envoyé et ce qui le remplace, se met à jour quand
--    l'imputation bouge encore (encaissement) et se ferme quand le nouveau document part. Un avis d'échéance déjà
--    envoyé recalculé est signalé (montant de l'avis envoyé gardé, alerte fermée s'il y revient) ; les alertes devenues
--    sans objet (congé annulé) se ferment.
--    La clôture anticipée (`terminer_bail`, décision D34) laisse volontairement les montants : inchangée.
--
-- 2. Le dépôt de garantie s'exprime au centime (COD-03).
--    Avant : `encaisser_depot` (security definer, exécutable par un compte connecté) acceptait 10,005 € par appel RPC
--    direct ; `depot_encaissements` n'avait que `montant > 0`, alors que `encaissements` a sa contrainte du centime
--    depuis X09 (20261014412000). Les millièmes entraient dans le cumul du dépôt et la restitution.
--    Maintenant : garde dans `encaisser_depot` (même message que `lireMontant`, lib/saisie-montant.ts) et contrainte
--    CHECK (montant = round(montant, 2)) sur `depot_encaissements`, `retenues.montant_retenu`,
--    `appel_charges_postes.montant` et `ecritures.montant`, posées NOT VALID puis VALIDÉES seulement si aucune ligne
--    existante ne les viole (sinon elles restent NOT VALID et un `notice` le dit : rien n'est réécrit, rien n'est
--    refusé rétroactivement). Tous les écrivains de ces tables arrondissent déjà au centime (relevé du 27/10 :
--    ecrire_encaissement, contre_ecriture, contre_passer_*, ventiler_depense_bien, finaliser_decompte,
--    enregistrer_reglement_facture, retirer_reglement_facture, ajouter_retenue, reprendre_soldes ; côté application,
--    lireMontant et ventilerTeom).
--
-- `enregistrer_conge` repart de sa dernière définition (20260929150000), `annuler_conge` de 20260803_annuler_conge :
-- seul l'appel final est ajouté. `encaisser_depot` est réécrite en relisant sa définition en vigueur (pg_get_functiondef,
-- même patron que 20261014101000) : une ancre absente ou répétée arrête la migration sans rien modifier.
-- Aucune donnée existante n'est réécrite par la migration elle-même : les appels ne bougent qu'au prochain congé enregistré
-- ou annulé. Seules les deux colonnes AJOUTÉES (`base_loyer_hc`, `base_charges`) sont remplies pour les appels existants
-- (section 1 bis) ; aucune valeur existante n'est modifiée. Rejouable : create or replace, contraintes posées seulement si absentes, garde reconnue par son texte.
-- Retour arrière : supabase/retours-arriere/20261028100100_conge_ajuste_dernier_terme_et_depot_au_centime.retour.sql

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Les montants d'un terme, tels que la génération les calcule (20261014120000) : bornes du bail dans le mois, un seul
--    arrondi à la fin sur chaque composante, `montant_du` = loyer + charges. La BASE (loyer et charges mensuels) est
--    passée par l'appelant : celle EN VIGUEUR pendant la période, jamais le loyer révisé depuis (relecture du 28/10).
-- ---------------------------------------------------------------------------------------------------------------
-- Une première version (bancs d'essai seulement) prenait la base dans le bail : retirée.
drop function if exists public.montants_appel_loyer(uuid, date);
create or replace function public.montants_appel_loyer(p_bail uuid, p_mois date, p_loyer numeric, p_charges numeric)
returns table(loyer_hc numeric, charges numeric, montant_du numeric, prorata boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v record;
  v_mois date := date_trunc('month', p_mois)::date;
  v_jours_mois int;
  v_jours_dus int;
  v_premier int;
  v_dernier int;
  v_loyer numeric;
  v_charges numeric;
begin
  select b.date_debut, b.date_fin into v from public.baux b where b.id = p_bail;
  if v.date_debut is null then raise exception 'Le bail n''a pas de date de début'; end if;
  v_jours_mois := extract(day from (v_mois + interval '1 month' - interval '1 day'))::int;
  v_premier := case
    when v_mois = date_trunc('month', v.date_debut)::date then extract(day from v.date_debut)::int
    else 1 end;
  v_dernier := case
    when v.date_fin is not null and v_mois = date_trunc('month', v.date_fin)::date
      then extract(day from v.date_fin)::int
    else v_jours_mois end;
  v_jours_dus := greatest(0, v_dernier - v_premier + 1);
  if v_jours_dus = v_jours_mois then
    v_loyer := round(coalesce(p_loyer, 0), 2);
    v_charges := round(coalesce(p_charges, 0), 2);
  else
    v_loyer := round(coalesce(p_loyer, 0) * v_jours_dus / v_jours_mois, 2);
    v_charges := round(coalesce(p_charges, 0) * v_jours_dus / v_jours_mois, 2);
  end if;
  return query select v_loyer, v_charges, v_loyer + v_charges, v_jours_dus < v_jours_mois;
end;
$$;
comment on function public.montants_appel_loyer(uuid, date, numeric, numeric) is
  'Loyer, charges, total et prorata d''un terme selon les bornes du bail dans le mois, sur la base mensuelle donnée : la règle de generer_appels_loyer_interne (un seul arrondi par composante).';
revoke execute on function public.montants_appel_loyer(uuid, date, numeric, numeric) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 1 bis. La base mensuelle d'un appel : le loyer et les charges du MOIS PLEIN qui ont servi à l'émettre (seconde
--    relecture du 28/10). `reviser_loyer` ne touche pas les appels déjà émis ; un appel au prorata ne dit pas, à lui
--    seul, de quel loyer il est parti. Sans cette mémoire, congé puis annulation refacturait le mois de sortie au loyer
--    révisé dans le mois (500,00 → 403,22 → 532,14 €).
--    · Un appel au mois plein EST sa base (loyer_hc, charges), à l'émission comme après un recalcul.
--    · Un appel né au prorata prend la base du bail au moment de son émission : c'est celle que
--      `generer_appels_loyer_interne` vient d'utiliser. Un recalcul au prorata garde la base mémorisée.
--    · Appels existants (colonnes ajoutées, aucune autre valeur touchée) : mois plein = ses propres montants ; prorata =
--      ancien loyer de la première révision ENREGISTRÉE après l'appel, à défaut le loyer du bail ; charges du bail.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.appels_loyer add column if not exists base_loyer_hc numeric;
alter table public.appels_loyer add column if not exists base_charges numeric;
comment on column public.appels_loyer.base_loyer_hc is
  'Loyer hors charges du mois plein qui a servi à émettre l''appel (au prorata : avant réduction). Base du recalcul du dernier terme (ajuster_appel_fin_de_bail).';
comment on column public.appels_loyer.base_charges is
  'Charges du mois plein qui ont servi à émettre l''appel (au prorata : avant réduction).';

do $base$
begin
  -- Écriture de migration sur les seules colonnes ajoutées : le verrou d'abonnement (organisation suspendue) ne doit
  -- pas l'arrêter. Drapeau local à cette instruction.
  perform pg_catalog.set_config('gerimmo.systeme', 'on', true);
  update public.appels_loyer a
     set base_loyer_hc = case when not a.prorata then a.loyer_hc else coalesce(
           (select rv.ancien_loyer from public.revisions_loyer rv
             where rv.bail_id = a.bail_id and rv.created_at > a.created_at
             order by rv.created_at asc limit 1),
           (select b.loyer_hc from public.baux b where b.id = a.bail_id)) end,
         base_charges = case when not a.prorata then a.charges
           else (select b.charges from public.baux b where b.id = a.bail_id) end
   where a.base_loyer_hc is null or a.base_charges is null;
  perform pg_catalog.set_config('gerimmo.systeme', '', true);
end $base$;

create or replace function public.appel_loyer_fixe_base()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_loyer numeric;
  v_charges numeric;
begin
  if not new.prorata then
    new.base_loyer_hc := new.loyer_hc;
    new.base_charges := new.charges;
  elsif new.base_loyer_hc is null or new.base_charges is null then
    select b.loyer_hc, b.charges into v_loyer, v_charges from public.baux b where b.id = new.bail_id;
    new.base_loyer_hc := coalesce(new.base_loyer_hc, v_loyer);
    new.base_charges := coalesce(new.base_charges, v_charges);
  end if;
  return new;
end;
$$;
comment on function public.appel_loyer_fixe_base() is
  'Mémorise sur l''appel la base mensuelle qui l''a émis : le mois plein est sa propre base ; un prorata garde la sienne (à défaut, celle du bail à l''émission).';
revoke execute on function public.appel_loyer_fixe_base() from public, anon, authenticated;
drop trigger if exists appel_loyer_base_mensuelle on public.appels_loyer;
create trigger appel_loyer_base_mensuelle
  before insert or update of loyer_hc, charges, prorata, base_loyer_hc, base_charges on public.appels_loyer
  for each row execute function public.appel_loyer_fixe_base();

-- Le mois en toutes lettres, comme l'application (« octobre 2026 »), avec la préposition élidée (« d'octobre »).
create or replace function public.mois_de_periode(p_periode date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when extract(month from p_periode)::int in (4, 8, 10) then 'd’' else 'de ' end
      || (array['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'])
           [extract(month from p_periode)::int]
      || ' ' || extract(year from p_periode)::int::text;
$$;
comment on function public.mois_de_periode(date) is
  '« d’octobre 2026 », « de mars 2026 » : le mois d''un terme dans les titres d''alerte, comme l''écrit l''application.';
revoke execute on function public.mois_de_periode(date) from public, anon, authenticated;

-- Un montant en euros à la française (« 1 234,50 » sans séparateur de milliers, comme les autres titres d'alerte).
create or replace function public.montant_alerte(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select replace(to_char(coalesce(p, 0), 'FM999999990.00'), '.', ',') || ' €'; $$;
revoke execute on function public.montant_alerte(numeric) from public, anon, authenticated;

-- Pose ou met à jour l'alerte d'un terme (une alerte ouverte par type et par appel : un congé repassé la met à jour au
-- lieu de la doubler). Ancrée sur le bail : « Traiter » mène aux loyers du bail.
create or replace function public.poser_alerte_terme(p_org uuid, p_bail uuid, p_type text, p_criticite public.alerte_criticite,
  p_titre text, p_echeance date, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alerts
     set titre = p_titre, criticite = p_criticite, details = details || p_details, echeance = p_echeance, updated_at = now()
   where organization_id = p_org and statut = 'ouverte' and type = p_type
     and details ->> 'appel_id' = p_details ->> 'appel_id';
  if not found then
    insert into public.alerts (organization_id, type, criticite, titre, echeance, details, origine_type, origine_id)
    values (p_org, p_type, p_criticite, p_titre, p_echeance, p_details, 'bail', p_bail);
  end if;
end;
$$;
revoke execute on function public.poser_alerte_terme(uuid, uuid, text, public.alerte_criticite, text, date, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 2. Le document déjà envoyé qu'une resynchronisation a remplacé (seconde relecture du 28/10, voie décidée : rien n'est
--    remis en l'état). La resynchronisation réécrit quittance ou reçu selon l'imputation, comme toujours (document
--    cohérent avec l'écran du bail, `email_envoye_at` remis à NULL : à renvoyer). L'alerte « document_envoye_remplace »
--    garde ce qui a été ENVOYÉ (nature, montant, date : jamais écrasés) et dit par quoi c'est remplacé. Elle suit le
--    document à chaque écriture sur `quittances`, quel qu'en soit l'auteur (congé, encaissement, suppression) : mise à
--    jour quand le document change encore, fermée quand le nouveau document part au locataire ou quand il redevient
--    celui qui a été envoyé.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.suivre_document_remplace(p_org uuid, p_appel uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  al record;
  q record;
  v_trouve boolean;
  v_quittance boolean;
  v_montant numeric;
  v_le text;
  v_qui text;
  v_mois text;
  v_envoye text;
  v_remplace text;
begin
  for al in
    select x.id, x.details from public.alerts x
     where x.organization_id = p_org and x.statut = 'ouverte' and x.type = 'document_envoye_remplace'
       and x.details ->> 'appel_id' = p_appel::text
  loop
    select qq.est_quittance, qq.montant, qq.email_envoye_at into q from public.quittances qq where qq.appel_id = p_appel;
    v_trouve := found;
    v_quittance := (al.details ->> 'envoye_est_quittance')::boolean;
    v_montant := (al.details ->> 'montant_envoye')::numeric;
    if v_trouve and q.email_envoye_at is not null then
      update public.alerts set statut = 'fermee', closed_at = now(), closed_by = null,
             closed_action = 'Document à jour envoyé au locataire', updated_at = now()
       where id = al.id;
      continue;
    end if;
    if v_trouve and q.est_quittance = v_quittance and q.montant = v_montant then
      update public.alerts set statut = 'fermee', closed_at = now(), closed_by = null,
             closed_action = 'Document revenu à celui envoyé au locataire', updated_at = now()
       where id = al.id;
      continue;
    end if;

    v_le := al.details ->> 'envoye_le';
    v_mois := public.mois_de_periode((al.details ->> 'periode')::date);
    select p.nom || coalesce(' ' || p.prenom, '') || coalesce(' (' || l.nom || ')', '') into v_qui
      from public.baux b
      left join public.persons p on p.id = b.locataire_principal
      left join public.lots l on l.id = b.lot_id
     where b.id = (al.details ->> 'bail_id')::uuid;
    v_envoye := case when v_quittance then 'La quittance ' else 'Le reçu ' end || v_mois
      || case when v_quittance then ' envoyée le ' else ' envoyé le ' end || v_le
      || ' pour ' || public.montant_alerte(v_montant);
    if v_trouve then
      v_remplace := case when q.est_quittance then 'une quittance de ' else 'un reçu de ' end || public.montant_alerte(q.montant);
      update public.alerts
         set titre = v_envoye || case when v_quittance then ' est remplacée par ' else ' est remplacé par ' end || v_remplace
                     || ' — ' || coalesce(v_qui, 'locataire') || ' : envoyez le nouveau document au locataire',
             details = details || jsonb_build_object('nouveau_est_quittance', q.est_quittance, 'nouveau_montant', q.montant,
               'consigne', 'Envoyé le ' || v_le || ' : ' || case when v_quittance then 'quittance de ' else 'reçu de ' end
                 || public.montant_alerte(v_montant) || '. Les règlements imputés à ce terme ont changé depuis : le document à jour est '
                 || v_remplace || ', à envoyer au locataire.'),
             updated_at = now()
       where id = al.id;
    else
      update public.alerts
         set titre = v_envoye || case when v_quittance then ' n’est plus couverte' else ' n’est plus couvert' end
                     || ' par les règlements — ' || coalesce(v_qui, 'locataire') || ' : à régulariser avec le locataire',
             details = details || jsonb_build_object('nouveau_est_quittance', null, 'nouveau_montant', 0,
               'consigne', 'Envoyé le ' || v_le || ' : ' || case when v_quittance then 'quittance de ' else 'reçu de ' end
                 || public.montant_alerte(v_montant) || '. Les règlements ne couvrent plus ce terme : le document a été retiré. '
                 || 'À régulariser avec le locataire.'),
             updated_at = now()
       where id = al.id;
    end if;
  end loop;
end;
$$;
comment on function public.suivre_document_remplace(uuid, uuid) is
  'Met à jour ou ferme l''alerte document_envoye_remplace d''un terme selon son document actuel (envoyé, revenu à l''identique, remplacé, retiré).';
revoke execute on function public.suivre_document_remplace(uuid, uuid) from public, anon, authenticated;

create or replace function public.quittance_suit_document_remplace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_appel uuid := coalesce(new.appel_id, old.appel_id);
begin
  if exists (select 1 from public.alerts x
              where x.organization_id = v_org and x.statut = 'ouverte' and x.type = 'document_envoye_remplace'
                and x.details ->> 'appel_id' = v_appel::text) then
    perform public.suivre_document_remplace(v_org, v_appel);
  end if;
  return null; -- AFTER
end;
$$;
revoke execute on function public.quittance_suit_document_remplace() from public, anon, authenticated;
drop trigger if exists quittance_suit_document_remplace on public.quittances;
create trigger quittance_suit_document_remplace
  after insert or update or delete on public.quittances
  for each row execute function public.quittance_suit_document_remplace();

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Après un congé enregistré ou annulé : l'appel du mois de fin (nouveau et ancien) suit la date de fin du bail.
--    Rend le nombre d'appels recalculés.
--    · Base du recalcul : la base mensuelle qui a émis l'appel (section 1 bis), jamais le loyer révisé depuis.
--    · Une quittance ou un reçu déjà ENVOYÉ fige l'appel : alerte « terme_a_regulariser », jamais une réécriture
--      silencieuse. Un terme appelé après la fin du bail reste tel quel : même alerte. L'une et l'autre disent le
--      montant exact et quoi faire (aucun outil de régularisation dans l'application à ce jour).
--    · Un document déjà envoyé d'un AUTRE terme que la resynchronisation remplace : alerte « document_envoye_remplace »
--      (section 2).
--    · Un avis d'échéance déjà envoyé dont le montant change : alerte d'information « avis_echeance_recalcule », qui
--      garde le montant de l'avis ENVOYÉ et se ferme quand le terme y revient.
--    · Les alertes « terme_a_regulariser » du bail qui n'ont plus d'objet (congé annulé ou modifié) se ferment.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.ajuster_appel_fin_de_bail(p_bail uuid, p_ancienne_fin date default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  r record;
  m record;
  e record;
  q record;
  al record;
  v_mois date[];
  v_fin_mois date;
  v_recalcules integer := 0;
  v_fondees uuid[] := '{}';
  v_envoyes jsonb;
  v_base_loyer numeric;
  v_base_charges numeric;
  v_qui text;
  v_ecart numeric;
  v_avis numeric;
begin
  select b.id, b.organization_id, b.lot_id, b.date_debut, b.date_fin, b.loyer_hc, b.charges, b.locataire_principal,
         l.nom as lot_nom
    into v
  from public.baux b
  left join public.lots l on l.id = b.lot_id
  where b.id = p_bail;
  if v.id is null or v.date_debut is null then return 0; end if;

  -- Les mois concernés : celui de la date de fin actuelle (congé enregistré) et celui de l'ancienne (congé annulé,
  -- ou préavis modifié).
  v_mois := array_remove(array[
    case when v.date_fin is not null then date_trunc('month', v.date_fin)::date end,
    case when p_ancienne_fin is not null then date_trunc('month', p_ancienne_fin)::date end
  ], null);
  v_fin_mois := case when v.date_fin is not null then date_trunc('month', v.date_fin)::date end;

  select coalesce(p.nom || coalesce(' ' || p.prenom, ''), 'locataire') || coalesce(' (' || v.lot_nom || ')', '')
    into v_qui from public.persons p where p.id = v.locataire_principal;
  v_qui := coalesce(v_qui, 'locataire' || coalesce(' (' || v.lot_nom || ')', ''));

  -- Les documents déjà envoyés du bail, avant toute écriture : s'ils sont remplacés, le gérant le saura.
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_envoyes
  from public.quittances x where x.bail_id = p_bail and x.email_envoye_at is not null;

  for r in
    select a.id, a.periode, a.loyer_hc, a.charges, a.montant_du, a.prorata, a.email_envoye_at, a.created_at,
           a.base_loyer_hc, a.base_charges
    from public.appels_loyer a
    where a.bail_id = p_bail
      and (a.periode = any (v_mois) or (v_fin_mois is not null and a.periode > v_fin_mois))
    order by a.periode
  loop
    if v_fin_mois is not null and r.periode > v_fin_mois then
      -- Terme appelé pour un mois qui suit la fin du bail (congé saisi très tard) : il ne se supprime pas d'ici.
      perform public.poser_alerte_terme(v.organization_id, p_bail, 'terme_a_regulariser', 'normale',
        format('Terme %s appelé après la fin du bail (%s) — %s : %s à régulariser avec le locataire',
          public.mois_de_periode(r.periode), to_char(v.date_fin, 'DD/MM/YYYY'), v_qui, public.montant_alerte(r.montant_du)),
        v.date_fin,
        jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id, 'appel_id', r.id, 'periode', r.periode,
                           'montant_appele', r.montant_du, 'montant_du', 0, 'date_fin', v.date_fin, 'motif', 'appel_apres_fin',
                           'consigne', format('Ce terme suit la fin du bail (%s) : %s appelés sans être dus. Gerimmo ne supprime '
                             'pas un terme appelé ; à régulariser avec le locataire (remboursement, ou déduction au solde de '
                             'tout compte). Le décompte de sortie le compte encore comme dû.',
                             to_char(v.date_fin, 'DD/MM/YYYY'), public.montant_alerte(r.montant_du))));
      v_fondees := v_fondees || r.id;
      continue;
    end if;

    -- La base qui a émis l'appel (seconde relecture du 28/10) ; à défaut (appel antérieur sans base), la même règle que
    -- le remplissage de la section 1 bis.
    v_base_loyer := coalesce(r.base_loyer_hc,
      case when not coalesce(r.prorata, false) then r.loyer_hc end,
      (select rv.ancien_loyer from public.revisions_loyer rv
        where rv.bail_id = p_bail and rv.created_at > r.created_at order by rv.created_at asc limit 1),
      v.loyer_hc);
    v_base_charges := coalesce(r.base_charges, case when not coalesce(r.prorata, false) then r.charges end, v.charges);
    select * into m from public.montants_appel_loyer(p_bail, r.periode, v_base_loyer, v_base_charges);
    if r.loyer_hc = m.loyer_hc and r.charges = m.charges and r.montant_du = m.montant_du
       and coalesce(r.prorata, false) = m.prorata then
      continue;
    end if;

    if exists (select 1 from public.quittances x where x.appel_id = r.id and x.email_envoye_at is not null) then
      -- La quittance ou le reçu de ce terme est déjà parti : le document délivré ne se réécrit pas, le gérant régularise.
      v_ecart := r.montant_du - m.montant_du;
      perform public.poser_alerte_terme(v.organization_id, p_bail, 'terme_a_regulariser', 'normale',
        format('Terme %s appelé %s au lieu de %s — %s : %s %s',
          public.mois_de_periode(r.periode), public.montant_alerte(r.montant_du), public.montant_alerte(m.montant_du), v_qui,
          public.montant_alerte(abs(v_ecart)),
          case when v_ecart > 0 then 'appelés en trop, à régulariser avec le locataire'
               else 'non appelés, à régulariser avec le locataire' end),
        v.date_fin,
        jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id, 'appel_id', r.id, 'periode', r.periode,
                           'montant_appele', r.montant_du, 'montant_du', m.montant_du, 'date_fin', v.date_fin,
                           'motif', 'quittance_envoyee',
                           'consigne', case when v_ecart > 0 then
                             format('Document déjà envoyé : Gerimmo ne modifie pas ce terme. %s appelés en trop (%s appelés, '
                               '%s dus) ; à régulariser avec le locataire (remboursement, ou déduction au solde de tout '
                               'compte). Le décompte de sortie compte encore les %s appelés.',
                               public.montant_alerte(v_ecart), public.montant_alerte(r.montant_du),
                               public.montant_alerte(m.montant_du), public.montant_alerte(r.montant_du))
                           else
                             format('Document déjà envoyé : Gerimmo ne modifie pas ce terme. %s non appelés (%s appelés, '
                               '%s dus) ; à régulariser avec le locataire. Le décompte de sortie ne compte que les %s appelés.',
                               public.montant_alerte(-v_ecart), public.montant_alerte(r.montant_du),
                               public.montant_alerte(m.montant_du), public.montant_alerte(r.montant_du))
                           end));
      v_fondees := v_fondees || r.id;
      continue;
    end if;

    update public.appels_loyer
       set loyer_hc = m.loyer_hc, charges = m.charges, montant_du = m.montant_du, prorata = m.prorata
     where id = r.id;
    v_recalcules := v_recalcules + 1;

    if r.email_envoye_at is not null then
      -- L'avis d'échéance de ce terme est déjà parti : le montant de l'avis ENVOYÉ est gardé tel quel (premier montant
      -- noté), l'alerte se ferme si le terme y revient.
      select x.id, x.details into al from public.alerts x
       where x.organization_id = v.organization_id and x.statut = 'ouverte' and x.type = 'avis_echeance_recalcule'
         and x.details ->> 'appel_id' = r.id::text
       limit 1;
      v_avis := coalesce((al.details ->> 'montant_envoye')::numeric, (al.details ->> 'ancien_montant')::numeric,
                         r.montant_du);
      if m.montant_du = v_avis then
        if al.id is not null then
          update public.alerts set statut = 'fermee', closed_at = now(), closed_by = null,
                 closed_action = 'Montant revenu à celui de l’avis envoyé', updated_at = now()
           where id = al.id;
        end if;
      else
        perform public.poser_alerte_terme(v.organization_id, p_bail, 'avis_echeance_recalcule', 'informative',
          format('Avis d’échéance %s envoyé pour %s — %s : le terme est maintenant de %s, prévenez le locataire',
            public.mois_de_periode(r.periode), public.montant_alerte(v_avis), v_qui, public.montant_alerte(m.montant_du)),
          null,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id, 'appel_id', r.id, 'periode', r.periode,
                             'montant_envoye', v_avis, 'nouveau_montant', m.montant_du,
                             'consigne', format('Avis d’échéance envoyé pour %s ; le terme est maintenant de %s. Prévenez le '
                               'locataire du nouveau montant (avis d’échéance PDF de cette ligne).',
                               public.montant_alerte(v_avis), public.montant_alerte(m.montant_du))));
      end if;
    end if;
  end loop;

  if v_recalcules > 0 then
    -- Quittance ou reçu suivent le nouveau montant (une quittance de 500 € sur un appel de 403,22 € ne se laisse pas).
    -- L'imputation est globale : un document déjà envoyé d'un AUTRE terme peut être réécrit ou retiré. Il l'est (le
    -- document reste cohérent avec l'écran du bail), et le gérant est alerté de ce qui a été envoyé et le remplace.
    perform public.resynchroniser_quittances(p_bail);
    for e in select * from jsonb_populate_recordset(null::public.quittances, v_envoyes) loop
      select x.email_envoye_at into q from public.quittances x where x.id = e.id;
      if found and q.email_envoye_at is not distinct from e.email_envoye_at then
        continue; -- intact : la resynchronisation n'a pas touché ce document
      end if;
      select a.periode into r from public.appels_loyer a where a.id = e.appel_id;
      perform public.poser_alerte_terme(v.organization_id, p_bail, 'document_envoye_remplace', 'normale',
        'Document envoyé remplacé', null,
        jsonb_build_object('bail_id', p_bail, 'lot_id', v.lot_id, 'appel_id', e.appel_id, 'periode', r.periode,
                           'quittance_id', e.id, 'envoye_est_quittance', e.est_quittance, 'montant_envoye', e.montant,
                           'envoye_le', to_char((e.email_envoye_at at time zone 'Europe/Paris')::date, 'DD/MM/YYYY')));
      -- Le titre et la consigne se composent d'une seule main (section 2), d'après le document actuel.
      perform public.suivre_document_remplace(v.organization_id, e.appel_id);
    end loop;
    -- L'alerte d'impayé déjà ouverte suit le nouveau dû ; la nuit reste seule à en poser une nouvelle (27/10, LAT-01).
    if exists (select 1 from public.alerts a
                where a.organization_id = v.organization_id and a.type = 'loyer_impaye' and a.statut = 'ouverte'
                  and a.origine_type = 'bail' and a.origine_id = p_bail) then
      perform public.suivre_impayes_bail(p_bail);
    end if;
  end if;

  -- Les alertes de régularisation de ce bail qui n'ont plus d'objet (congé annulé ou modifié) se ferment d'elles-mêmes,
  -- sans auteur.
  update public.alerts a
     set statut = 'fermee', closed_at = now(), closed_by = null,
         closed_action = 'Congé annulé ou modifié : plus rien à régulariser', updated_at = now()
   where a.organization_id = v.organization_id and a.type = 'terme_a_regulariser' and a.statut = 'ouverte'
     and a.origine_type = 'bail' and a.origine_id = p_bail
     and not ((a.details ->> 'appel_id')::uuid = any (v_fondees));
  return v_recalcules;
end;
$$;
comment on function public.ajuster_appel_fin_de_bail(uuid, date) is
  'Après un congé enregistré ou annulé : recalcule l''appel du mois de fin (nouveau et ancien) sur la base mensuelle qui l''a émis, resynchronise les quittances ; alertes terme_a_regulariser (fermées quand elles n''ont plus d''objet), document_envoye_remplace et avis_echeance_recalcule.';
revoke execute on function public.ajuster_appel_fin_de_bail(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. enregistrer_conge : texte de 20260929150000, plus l'ajustement du dernier terme en fin de fonction.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.enregistrer_conge(p_bail uuid, p_par public.conge_par, p_date_presentation date, p_preavis_mois smallint, p_motif text default null::text, p_justificatif uuid default null::uuid, p_prix_vente numeric default null::numeric, p_beneficiaire text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_type public.bail_type;
  v_etat public.bail_etat;
  v_zone boolean;
  v_meuble boolean;
  v_preavis smallint;
  v_effet date;
  v_conge uuid;
  v_debut date;
  v_etudiant boolean;
  v_duree_reduite text;
  v_duree interval;
  v_reconduction interval;
  v_terme date;
  v_k integer;
  v_zone_a_verifier boolean := false;
begin
  select b.organization_id, b.lot_id, b.type, b.etat,
         -- Audit 27/09 : la zone figée au bail (RM-1.10.7), pas celle du bien.
         -- Audit 29/09 : inconnue = NULL, jamais « non ».
         coalesce(b.zone_tendue, bi.zone_tendue),
         (b.type = 'meuble' or (b.type = 'colocation' and coalesce(l.meuble, false))),
         b.date_debut, coalesce(b.meuble_etudiant, false), nullif(btrim(coalesce(b.duree_reduite_evenement, '')), '')
    into v_org, v_lot, v_type, v_etat, v_zone, v_meuble, v_debut, v_etudiant, v_duree_reduite
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
    -- Préavis légal : 6 mois (nu/colocation nue) / 3 mois (meublé). Motif obligatoire.
    v_preavis := case when v_meuble then 3 else 6 end;
    if coalesce(btrim(p_motif), '') = '' then
      raise exception 'Congé du bailleur : le motif est obligatoire (reprise, vente ou motif légitime et sérieux) — sinon le congé est nul';
    end if;
    if btrim(p_motif) ilike 'reprise%' and coalesce(btrim(p_beneficiaire), '') = '' then
      raise exception 'Congé pour reprise : indiquez le bénéficiaire de la reprise (nom et lien avec le bailleur)';
    end if;
    -- Audit 29/09 : le prix n'est exigé qu'en location NUE, où le congé pour
    -- vendre vaut offre de vente au locataire (art. 15 II). En meublé
    -- (art. 25-8), pas de droit de préemption : le prix reste facultatif.
    if btrim(p_motif) ilike 'vente%' and not v_meuble and (p_prix_vente is null or p_prix_vente <= 0) then
      raise exception 'Congé pour vente : le prix de vente proposé est obligatoire (le congé vaut offre de vente au locataire, art. 15 II)';
    end if;
    if p_prix_vente is not null and p_prix_vente <= 0 then
      raise exception 'Congé pour vente : le prix proposé doit être positif';
    end if;
  else
    -- Locataire : meublé = 1 mois ; nu = 3 mois, ramené à 1 mois de plein droit
    -- en zone tendue, ou sur justificatif dérogatoire hors zone tendue.
    if v_meuble then
      v_preavis := 1;
    elsif v_zone then
      v_preavis := 1;   -- de plein droit, aucun justificatif exigible
    elsif v_zone is null and p_preavis_mois = 1 then
      -- Audit 29/09 : zone tendue inconnue — le préavis d'un mois est
      -- accepté (choix protecteur du locataire), à vérifier par le gérant.
      v_preavis := 1;
      v_zone_a_verifier := p_justificatif is null;
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

  -- Audit 27/09 : le congé du bailleur se donne pour le TERME du bail
  -- (wiki [[Bail]] § 1.11), avec le préavis complet avant ce terme.
  if p_par = 'bailleur' and v_debut is not null
     and not (not v_meuble and v_duree_reduite is not null) then
    -- Audit 29/09 : une seule règle de durée (SCI familiale et indivision =
    -- 3 ans), partagée avec le bail PDF.
    v_terme := public.terme_bail_calcule(p_bail, p_date_presentation);
    if v_terme < p_date_presentation then
      raise exception 'Congé du bailleur impossible : le bail étudiant a pris fin le % (il n''est jamais reconduit)',
        to_char(v_terme, 'DD/MM/YYYY');
    end if;
    if v_effet > v_terme + 1 then
      raise exception 'Congé du bailleur tardif : le bail arrive à son terme le %, le congé devait être reçu au plus tard le % (préavis de % mois). Reçu le %, il serait nul (wiki Bail § 1.11)',
        to_char(v_terme, 'DD/MM/YYYY'),
        to_char(((v_terme + 1) - (v_preavis || ' months')::interval)::date, 'DD/MM/YYYY'),
        v_preavis, to_char(p_date_presentation, 'DD/MM/YYYY');
    end if;
    v_effet := v_terme;
  end if;

  insert into public.conges
    (organization_id, bail_id, par, date_premiere_presentation, preavis_mois, date_effet,
     motif, justificatif_document, zone_tendue, prix_vente, beneficiaire_reprise, zone_tendue_a_verifier)
  values
    (v_org, p_bail, p_par, p_date_presentation, v_preavis, v_effet,
     nullif(btrim(coalesce(p_motif, '')), ''), p_justificatif, coalesce(v_zone, false),
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'vente%' then p_prix_vente end,
     case when p_par = 'bailleur' and btrim(coalesce(p_motif, '')) ilike 'reprise%'
          then nullif(btrim(coalesce(p_beneficiaire, '')), '') end,
     v_zone_a_verifier)
  returning id into v_conge;

  update public.baux set etat = 'preavis', date_fin = v_effet, updated_at = now() where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  update public.intentions_conge
     set traitee_le = now(), conge_id = v_conge
   where bail_id = p_bail and traitee_le is null;
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Congé enregistré'
   where organization_id = v_org and statut = 'ouverte'
     and type = 'conge_intention' and (details ->> 'bail_id')::uuid = p_bail;

  insert into public.alerts (organization_id, type, criticite, titre, echeance, details)
  values (v_org, 'edl_sortie', 'normale', 'État des lieux de sortie à réaliser', v_effet,
          jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'date_effet', v_effet));

  if v_zone_a_verifier then
    insert into public.alerts (organization_id, type, criticite, titre, details)
    values (v_org, 'zone_tendue_a_verifier', 'normale',
            'Congé à 1 mois accepté, zone tendue non renseignée — à vérifier',
            jsonb_build_object('bail_id', p_bail, 'lot_id', v_lot, 'conge_id', v_conge));
  end if;

  -- Audit final du 27/10 (LOY-01) : l'appel du mois de sortie, s'il est déjà généré, passe au prorata.
  perform public.ajuster_appel_fin_de_bail(p_bail);

  return v_conge;
end $function$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. annuler_conge : texte de 20260803_annuler_conge, plus l'ajustement de l'ancien mois de sortie.
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.annuler_conge(p_bail uuid, p_motif text default null)
returns void language plpgsql security definer set search_path to '' as $function$
declare
  v_org uuid;
  v_lot uuid;
  v_etat public.bail_etat;
  v_conge uuid;
  v_ancienne_fin date;
begin
  select b.organization_id, b.lot_id, b.etat, b.date_fin into v_org, v_lot, v_etat, v_ancienne_fin
  from public.baux b where b.id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_etat <> 'preavis' then
    raise exception 'Ce bail n''est pas en préavis : il n''y a pas de congé à annuler';
  end if;

  if exists (select 1 from public.etats_des_lieux e
              where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'L''état des lieux de sortie est signé : le départ a eu lieu, le congé ne s''annule plus';
  end if;
  if exists (select 1 from public.restitutions r where r.bail_id = p_bail) then
    raise exception 'La restitution du dépôt est engagée : le congé ne s''annule plus';
  end if;

  select c.id into v_conge from public.conges c
   where c.bail_id = p_bail and c.annule_le is null
   order by c.created_at desc limit 1;
  if v_conge is null then
    raise exception 'Aucun congé en cours sur ce bail';
  end if;

  update public.conges
     set annule_le = now(),
         annulation_motif = nullif(btrim(coalesce(p_motif, '')), '')
   where id = v_conge;

  -- Le bail d'abord, le lot ensuite : le déclencheur du lot exige un bail
  -- vivant pour accepter « loué ».
  update public.baux set etat = 'actif', date_fin = null, updated_at = now()
   where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_lot) where id = v_lot and etat in ('loue','preavis');

  -- L'alerte d'état des lieux de sortie n'a plus d'objet.
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = auth.uid(),
         closed_action = 'Congé annulé — le locataire reste', updated_at = now()
   where organization_id = v_org
     and type = 'edl_sortie'
     and statut = 'ouverte'
     and details->>'bail_id' = p_bail::text;

  -- Un état des lieux de sortie commencé mais non signé redevient sans objet :
  -- on le laisse en brouillon, il resservira si un nouveau congé arrive.

  -- Audit final du 27/10 (LOY-V01) : l'appel de l'ancien mois de sortie, né au prorata, redevient un mois plein.
  perform public.ajuster_appel_fin_de_bail(p_bail, v_ancienne_fin);
end $function$;
revoke execute on function public.annuler_conge(uuid, text) from public, anon;

-- ---------------------------------------------------------------------------------------------------------------
-- 6. COD-03 : le dépôt de garantie s'exprime au centime près.
-- ---------------------------------------------------------------------------------------------------------------
do $correctif$
declare v_def text; v_ancre text;
begin
  select pg_get_functiondef('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)'::regprocedure) into v_def;
  -- Rejeu : la garde est déjà là (le corps relu garde ses apostrophes doublées : on cherche un fragment sans apostrophe).
  if position('au centime près : deux décimales au plus' in v_def) > 0 then return; end if;
  v_ancre := $ancre$  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;$ancre$;
  if (length(v_def) - length(replace(v_def, v_ancre, ''))) <> length(v_ancre) then
    raise exception 'Correctif COD-03 (dépôt au centime) : définition inattendue (ancre absente ou répétée)';
  end if;
  v_def := replace(v_def, v_ancre, $nouveau$  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;
  -- Audit final du 27/10 (COD-03) : même garde que lireMontant (lib/saisie-montant.ts) et que la contrainte de la table.
  if p_montant <> round(p_montant, 2) then
    raise exception 'Le montant s''exprime au centime près : deux décimales au plus.';
  end if;$nouveau$);
  execute v_def;
end $correctif$;

-- Les contraintes du centime : posées NOT VALID (aucune ligne existante relue ni modifiée), puis validées si et seulement
-- si aucune ligne ne les viole. Une table qui porterait un millième garde sa contrainte NOT VALID (les écritures
-- NOUVELLES sont déjà tenues) et le dit.
do $contraintes$
declare
  c record;
  v_hors bigint;
begin
  for c in
    select * from (values
      ('depot_encaissements', 'montant',        'depot_encaissements_montant_centime_check'),
      ('retenues',            'montant_retenu', 'retenues_montant_retenu_centime_check'),
      ('appel_charges_postes','montant',        'appel_charges_postes_montant_centime_check'),
      ('ecritures',           'montant',        'ecritures_montant_centime_check')
    ) as t(tbl, col, nom)
  loop
    if not exists (select 1 from pg_constraint
                   where conrelid = ('public.' || c.tbl)::regclass and conname = c.nom) then
      -- Une contre-écriture recopie le montant qu'elle annule : une écriture héritée à millièmes doit rester annulable.
      execute format('alter table public.%I add constraint %I check (%s%I = round(%I, 2)) not valid', c.tbl, c.nom,
        case when c.tbl = 'ecritures' then 'contre_ecriture_de is not null or ' else '' end, c.col, c.col);
    end if;
    if exists (select 1 from pg_constraint
               where conrelid = ('public.' || c.tbl)::regclass and conname = c.nom and not convalidated) then
      execute format('select count(*) from public.%I where %s%I <> round(%I, 2)', c.tbl,
        case when c.tbl = 'ecritures' then 'contre_ecriture_de is null and ' else '' end, c.col, c.col) into v_hors;
      if v_hors = 0 then
        execute format('alter table public.%I validate constraint %I', c.tbl, c.nom);
      else
        raise notice 'Audit final COD-03 : % ligne(s) de public.% au-delà du centime ; la contrainte % reste NOT VALID (rien n''est modifié).',
          v_hors, c.tbl, c.nom;
      end if;
    end if;
  end loop;
end $contraintes$;

comment on constraint depot_encaissements_montant_centime_check on public.depot_encaissements is
  'Un encaissement de dépôt s''exprime au centime près (audit final du 27/10, COD-03), comme encaissements_montant_centime_check.';
comment on constraint retenues_montant_retenu_centime_check on public.retenues is
  'Une retenue s''exprime au centime près (audit final du 27/10, COD-03).';
comment on constraint appel_charges_postes_montant_centime_check on public.appel_charges_postes is
  'Un poste de charges s''exprime au centime près (audit final du 27/10, COD-03).';
comment on constraint ecritures_montant_centime_check on public.ecritures is
  'Une écriture du journal s''exprime au centime près (audit final du 27/10, COD-03) : tous ses écrivains arrondissent déjà. Une contre-écriture, qui recopie le montant annulé, en est exemptée.';

-- Filet commun : aucune fonction de `public` ne reste ouverte à anon.
select public.fermer_fonctions_a_anon();

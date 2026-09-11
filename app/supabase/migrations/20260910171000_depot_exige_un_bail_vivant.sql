-- Audit du 2026-09-10 — le dépôt de garantie n'a pas d'état de bail.
--
-- LA RÈGLE. Le dépôt de garantie est « un montant ENCAISSÉ À L'ENTRÉE, puis
-- RESTITUÉ À LA SORTIE » (RM-2.1.3, wiki/concepts/Dépôt de garantie.md), somme
-- « versée par le locataire à la signature du bail ». Il n'a donc de sens que
-- tant que la location n'est pas soldée : passé la sortie, il ne s'encaisse
-- plus, il se rend (parcours 2.4, wiki/processus/Restitution du dépôt de
-- garantie.md).
--
-- LE DÉFAUT (rejoué en local sous l'identité d'un gérant, avant correction).
-- public.encaisser_depot ne lisait aucun état : l'appel passait sur un bail
-- 'termine' — état atteint seulement après congé ET état des lieux de sortie
-- signé (public.terminer_bail) — et créait une écriture 'depot_garantie' en
-- recette au journal (4.2). Autrement dit : de l'argent rouvert sur une
-- location finie, après la restitution, et un journal comptable qui l'atteste.
--
-- LES BORNES RETENUES — et pas plus.
--   • REFUS sur un bail 'termine'. Machine à états du bail
--     (wiki/concepts/Bail.md) : « terminé (EDL de sortie fait) », et
--     « terminé → actif interdit (nouveau bail requis) ». Il n'y a plus
--     d'entrée à garantir.
--   • REFUS dès que le décompte de restitution est FINALISÉ, même si le bail
--     est encore en préavis (la restitution se démarre dès la remise des
--     clés). Le décompte part du dépôt RÉELLEMENT ENCAISSÉ
--     (public.demarrer_restitution) et il est « figé après envoi — toute
--     correction produit un décompte rectificatif » (RM-2.7.3). Encaisser
--     après coup falsifierait un décompte arrêté.
--   • AUTORISÉ sur 'brouillon', 'actif' et 'preavis'. Le wiki ne subordonne
--     nulle part l'encaissement à l'activation du bail : le locataire verse
--     couramment avant la remise des clés, et l'encaissement partiel « laisse
--     le bail valide » (RM-2.1). Faute de règle qui tranche le cas du
--     brouillon, on ne l'invente pas — c'est un arbitrage humain.
--
-- Le reste de la fonction est repris à l'identique (plafond légal RM-2.1.1/2,
-- borne du dépôt dû, versant tiers RM-2.1.4, écriture au journal 4.2).

create or replace function public.encaisser_depot(
  p_bail uuid, p_montant numeric, p_date date, p_moyen text,
  p_versant_person uuid default null, p_versant_libelle text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer; v_meuble boolean; v_enc uuid;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  -- Le dépôt s'encaisse à l'entrée, il se restitue à la sortie (RM-2.1.3)
  if v.etat = 'termine' then
    raise exception 'Bail terminé : le dépôt de garantie ne s''encaisse plus, il se restitue';
  end if;
  -- Décompte figé après envoi (RM-2.7.3) : plus rien n'entre après l'arrêté
  if exists (select 1 from public.restitutions r
             where r.bail_id = p_bail and r.statut = 'finalise') then
    raise exception 'Décompte de restitution finalisé : le dépôt de ce bail ne s''encaisse plus';
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

comment on function public.encaisser_depot(uuid, numeric, date, text, uuid, text) is
  'Encaissement du dépôt de garantie (2.1). Refusé sur un bail terminé et après finalisation du décompte de restitution : le dépôt s''encaisse à l''entrée et se restitue à la sortie (RM-2.1.3, RM-2.7.3).';

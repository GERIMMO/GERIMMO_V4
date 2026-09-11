-- Restitution : le réarrêté des montants et la finalisation ne peuvent plus
-- se croiser.
--
-- Constat (rejoué en local, deux sessions). Depuis que le gérant dispose du
-- bouton « Réarrêter les montants à aujourd'hui », deux écritures concurrentes
-- visent la même ligne de restitution, et les deux boutons se touchent à
-- l'écran : le bandeau d'écart porte le réarrêté, « Finaliser le décompte »
-- est juste en dessous. Ce sont deux formulaires distincts, donc deux requêtes
-- serveur, donc deux transactions.
--
-- `rafraichir_montants_restitution` lisait `statut` SANS verrou puis mettait à
-- jour : entre la lecture et l'écriture, la finalisation peut passer. En
-- « read committed », l'UPDATE bloqué reprend la version fraîche de la ligne
-- et s'applique quand même — sur un décompte désormais figé. Trace du rejeu :
--
--   B : select finaliser_decompte(rst)          → solde 600,00 (impayés 300)
--   A : select rafraichir_montants_restitution  → 0, AUCUNE erreur
--   ligne finale : statut finalise | depot 900 | impayes 0 | solde 600,00
--
-- 900 − 0 ≠ 600 : le décompte figé ne s'additionne plus. Le PDF envoyé au
-- locataire et son espace en ligne (`ma_restitution_locataire`) affichent alors
-- un dépôt de 900 €, aucun impayé, et 600 € rendus — 300 € disparaissent sans
-- aucune imputation qui les justifie, sur le parcours le plus exposé du module
-- 2. C'est exactement ce que RM-2.7.3 interdit : une fois le décompte figé,
-- plus rien n'y bouge, et une correction passe par un rectificatif.
--
-- Le symétrique est vrai : `finaliser_decompte` lisait lui aussi `depot` et
-- `impayes` sans verrou, puis écrivait le solde. Un réarrêté validé entre les
-- deux lui faisait arrêter un solde calculé sur des montants périmés.
--
-- Correction : les deux fonctions prennent la ligne de restitution SOUS VERROU
-- avant de décider. Aucune règle métier ne change — c'est le même contrôle,
-- rendu indivisible. Celle qui arrive en second relit la ligne après le verrou
-- (« read committed » relit la version validée) et voit donc l'état réel : le
-- réarrêté trouve `finalise` et refuse, ou la finalisation trouve les montants
-- réarrêtés et arrête le bon solde. L'ordre des deux gestes appartient au
-- gérant ; ce qui n'est plus possible, c'est qu'ils se recouvrent.

-- ============================================================
-- 1. Le réarrêté décide sous verrou
-- ============================================================
create or replace function public.rafraichir_montants_restitution(p_restitution uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_m record;
begin
  -- `for update` : le contrôle de statut ci-dessous n'a de valeur que si la
  -- ligne ne peut pas être finalisée entre cette lecture et l'écriture.
  select * into v from public.restitutions where id = p_restitution for update;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then
    raise exception 'Décompte finalisé — les montants n''y bougent plus ; une correction passe par un décompte rectificatif';
  end if;

  select * into v_m from public.montants_reels_bail(v.bail_id);
  update public.restitutions
     set depot = v_m.depot, impayes = v_m.impayes, montants_arretes_le = now()
   where id = p_restitution;
  return v_m.impayes;
end $$;

-- ============================================================
-- 2. La finalisation arrête le solde sur des montants qui ne bougent plus
-- ============================================================
-- Identique à la version en place, au verrou près : le solde doit être calculé
-- sur les montants que la ligne porte encore au moment où il est écrit.
create or replace function public.finaliser_decompte(p_restitution uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_retenues numeric; v_solde numeric; v_lot uuid;
begin
  select * into v from public.restitutions where id = p_restitution for update;
  if v.id is null then raise exception 'Restitution introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.statut = 'finalise' then raise exception 'Décompte déjà finalisé'; end if;
  select coalesce(sum(montant_retenu), 0) into v_retenues from public.retenues where restitution_id = p_restitution;
  v_solde := round(v.depot - v.impayes - v_retenues, 2);
  update public.restitutions set statut = 'finalise', solde = v_solde, date_emission = current_date
    where id = p_restitution;

  select lot_id into v_lot from public.baux where id = v.bail_id;
  if v_solde > 0 then
    insert into public.ecritures
      (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme)
    values (v.organization_id, v.bail_id, v_lot, 'depot_garantie', 'depense', v_solde,
            current_date, current_date, 'Restitution du dépôt de garantie', true);
  end if;

  perform public.fermer_alertes_origine(v.organization_id, 'restitution', p_restitution,
    'Décompte finalisé', array['restitution_echeance']);

  insert into public.alerts (organization_id, type, criticite, titre, details, echeance)
  values (v.organization_id,
          case when v_retenues > 0 then 'decompte_lrar' else 'decompte' end, 'normale',
          case when v_solde < 0 then 'Solde de tout compte : créance sur le locataire'
               else 'Décompte de restitution à envoyer' end,
          jsonb_build_object('restitution_id', p_restitution, 'bail_id', v.bail_id, 'solde', v_solde),
          public.restitution_date_limite(v.date_remise_cles, v.delai_mois));
  return v_solde;
end $$;

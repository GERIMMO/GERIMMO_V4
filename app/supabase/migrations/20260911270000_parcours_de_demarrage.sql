-- « Par où je commence ? » — le chemin du compte au premier bail.
--
-- CE QUI SE PASSAIT. Une agence ouverte, ou un propriétaire qui vient de
-- s'inscrire, arrive sur un tableau de bord à zéro : des compteurs vides, un
-- lien « Créer mon premier bien », et ensuite plus rien. Or entre le premier
-- bien et le premier loyer appelé, il y a six gestes, chacun gardé par une
-- règle qui refuse tant que le précédent n'a pas eu lieu — la détention à
-- 100 %, le DPE en habitation, les mentions obligatoires du bail. Celui qui
-- découvre le produit les rencontre une par une, sous forme de refus.
--
-- CE QUE FAIT CETTE FONCTION. Elle répond à « où en suis-je, et quel est le
-- geste suivant ». Six étapes, dans l'ordre où la base les exige, chacune
-- CONSTATÉE SUR LES DONNÉES — aucune table de progression, aucun drapeau à
-- tenir à jour. Un parcours qu'on coche à la main finit toujours par affirmer
-- une étape que les données démentent.
--
-- L'ÉTAPE « LOT PRÊT » NE RÉINVENTE RIEN : elle interroge
-- `lot_blocages_location`, la fonction qui décide déjà si un lot peut être mis
-- en location. Deux listes de conditions finiraient par diverger, et c'est
-- l'écran d'accueil qui aurait tort.

create or replace function public.parcours_demarrage(p_org uuid)
returns table (
  etape text,
  faite boolean,
  detail text,
  -- Le lot à ouvrir pour faire le geste, et le bien qui le porte : le
  -- formulaire de création d'un bail vit sur la fiche du lot, dont l'adresse
  -- contient les deux. Sans eux, « Créer le bail » renverrait vers une liste
  -- où il faut retrouver le bon lot.
  lot_id uuid,
  bien_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.organization_type;
  v_profil boolean;
  v_biens integer;
  v_lot_pret uuid;
  v_bien_pret uuid;
  v_blocages text[];
  v_locataires integer;
  v_bail integer;
begin
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  select o.type,
         -- L'identité qui signera les documents : sans adresse, une quittance
         -- sort avec un émetteur incomplet.
         (length(btrim(coalesce(o.name, ''))) > 1
          and length(btrim(coalesce(o.address_line1, ''))) > 0
          and length(btrim(coalesce(o.city, ''))) > 0)
    into v_type, v_profil
  from public.organizations o where o.id = p_org;

  select count(*)::integer into v_biens from public.biens b where b.organization_id = p_org;

  -- Le premier lot qui n'a plus aucun blocage, s'il y en a un ; sinon les
  -- blocages du premier lot, pour dire CE QUI manque et pas seulement que
  -- quelque chose manque.
  select l.id, l.bien_id into v_lot_pret, v_bien_pret
  from public.lots l
  where l.organization_id = p_org
    and coalesce(array_length(public.lot_blocages_location(l.id), 1), 0) = 0
  order by l.created_at limit 1;
  if v_lot_pret is null then
    select public.lot_blocages_location(l.id) into v_blocages
    from public.lots l where l.organization_id = p_org
    order by l.created_at limit 1;
  end if;

  select count(*)::integer into v_locataires
  from public.persons p
  where p.organization_id = p_org and p.account_id is not null
    and exists (select 1 from public.memberships m
                where m.account_id = p.account_id and m.organization_id = p_org
                  and m.role = 'locataire');

  select count(*)::integer into v_bail
  from public.baux b where b.organization_id = p_org and b.etat in ('actif', 'preavis');

  return query
  select 'identite', v_profil,
         case when v_profil then null
              else 'Le nom et l''adresse figurent en tête de vos quittances et de vos baux.' end,
         null::uuid, null::uuid
  union all
  select 'bien', v_biens > 0,
         case when v_biens > 0 then format('%s bien%s', v_biens, case when v_biens > 1 then 's' else '' end)
              else 'Un bien, et son premier lot dans la foulée.' end,
         null::uuid, null::uuid
  union all
  select 'lot_pret', v_lot_pret is not null,
         case when v_lot_pret is not null then 'Au moins un lot peut être mis en location.'
              when v_biens = 0 then null
              when v_blocages is null then 'Aucun lot pour l''instant.'
              else array_to_string(v_blocages, ' · ') end,
         v_lot_pret, v_bien_pret
  union all
  select 'locataire', v_locataires > 0,
         case when v_locataires > 0
              then format('%s locataire%s avec un accès', v_locataires, case when v_locataires > 1 then 's' else '' end)
              else 'Créez sa fiche, puis invitez-le : il suivra son bail et ses quittances depuis son espace.' end,
         null::uuid, null::uuid
  union all
  select 'bail', v_bail > 0,
         case when v_bail > 0 then format('%s bail%s en cours', v_bail, case when v_bail > 1 then 'x' else '' end)
              else 'Le bail signé déposé, le loyer s''appelle tout seul le 1er de chaque mois.' end,
         v_lot_pret, v_bien_pret;
end;
$$;
comment on function public.parcours_demarrage(uuid) is
  'Les cinq étapes du démarrage, CONSTATÉES sur les données (aucune table de progression). L''étape « lot prêt » interroge lot_blocages_location : une seule liste de conditions dans le produit.';
revoke execute on function public.parcours_demarrage(uuid) from public, anon;

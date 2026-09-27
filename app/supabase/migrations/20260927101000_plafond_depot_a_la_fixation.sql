-- Audit métier du 27/09 — une révision IRL à la baisse était impossible
-- quand le dépôt valait exactement un mois de loyer.
--
-- Le déclencheur `plafond_depot_garantie` recontrôlait le plafond à CHAQUE
-- changement de loyer_hc. Bail nu à 650 € avec 650 € de dépôt, IRL en baisse :
-- `update baux set loyer_hc = 644,76` → « Dépôt de garantie trop élevé ».
-- Wiki [[Révision annuelle IRL]] (« IRL en baisse : le loyer baisse, légalement
-- dû » ; dépôt « jamais modifié par la révision », RM-3.8.8) et
-- [[Dépôt de garantie]] / [[Bail]] (RM-2.1.5 : jamais révisé en cours de bail).
--
-- Le plafond se contrôle à la FIXATION du dépôt : insertion, changement du
-- dépôt, du type ou du logement, et changement du loyer tant que le bail est
-- un brouillon (le loyer y est encore en cours de fixation). Sur un bail
-- engagé, l'évolution du loyer ne rouvre pas le dépôt.
--
-- `encaisser_depot` recontrôlait aussi contre le loyer COURANT : après une
-- baisse, le solde du dépôt ne pouvait plus s'encaisser. Il se contrôle
-- désormais contre le loyer fixé à la signature (ancien loyer de la première
-- révision, à défaut le loyer courant).
--
-- Idempotent : create or replace, trigger recréé.

create or replace function public.controler_plafond_depot_garantie()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare v_mois integer; v_plafond numeric;
begin
  if new.loyer_hc is null or new.depot_garantie is null then return new; end if;
  -- Audit 27/09 : sur un bail engagé, seul un changement du dépôt, du type ou
  -- du logement rouvre le contrôle — pas l'évolution du loyer (révision IRL,
  -- avenant à la baisse). RM-2.1.5 : le dépôt n'est jamais révisé.
  if tg_op = 'UPDATE'
     and old.etat is distinct from 'brouillon'::public.bail_etat
     and new.depot_garantie is not distinct from old.depot_garantie
     and new.type is not distinct from old.type
     and new.lot_id is not distinct from old.lot_id then
    return new;
  end if;
  v_mois := public.plafond_depot_mois(new.type::text, new.lot_id);
  v_plafond := v_mois * new.loyer_hc;
  if new.depot_garantie > v_plafond then
    raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €) pour un bail %',
      v_mois, v_plafond, new.type;
  end if;
  return new;
end;
$function$;

drop trigger if exists plafond_depot_garantie on public.baux;
create trigger plafond_depot_garantie
  before insert or update of type, lot_id, loyer_hc, depot_garantie on public.baux
  for each row execute function public.controler_plafond_depot_garantie();

create or replace function public.encaisser_depot(p_bail uuid, p_montant numeric, p_date date, p_moyen text, p_versant_person uuid default null::uuid, p_versant_libelle text default null::text)
 returns numeric
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer; v_meuble boolean; v_enc uuid;
        v_loyer_fixe numeric;
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
  v_mois := public.plafond_depot_mois(v.type::text, v.lot_id);
  -- Audit 27/09 : le plafond se mesure au loyer fixé à la signature, pas au
  -- loyer révisé depuis (RM-2.1.5).
  select r.ancien_loyer into v_loyer_fixe
    from public.revisions_loyer r where r.bail_id = p_bail
   order by r.date_effet asc limit 1;
  v_plafond := coalesce(v_loyer_fixe, v.loyer_hc, 0) * v_mois;
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
end $function$;

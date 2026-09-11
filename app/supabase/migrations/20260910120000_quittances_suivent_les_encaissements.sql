-- Audit du 2026-09-10 — P0 : une quittance libératoire survivait à la
-- disparition de l'encaissement qui la justifiait.
--
-- Constaté en production (bail e80312b4, Agence Alpha) : un encaissement de
-- 5 000 € saisi le 25/08 fait émettre 5 quittances (mars→juillet, 4 350 €),
-- puis l'encaissement est supprimé le même jour — la contre-écriture part
-- bien au journal, mais les quittances restent « libératoires ». L'agence
-- atteste par écrit de loyers jamais perçus : RM-3.4.1 (« la quittance n'est
-- émise qu'après encaissement intégral ») est violée de façon durable, et
-- « quittancer un partiel = renoncer au solde » (RM-3.4.2) est le risque
-- juridique exact que la règle voulait écarter.
--
-- Cause : emettre_quittances ne parcourait que les appels 'paye'/'partiel'.
-- Un appel redevenu 'impaye' n'était plus visité — donc jamais corrigé.
--
-- Correction en trois temps :
--   1. un état de loyers SANS garde de portefeuille, pour que la
--      resynchronisation fonctionne quel que soit l'appelant ;
--   2. resynchroniser_quittances(bail) : aligne TOUS les appels du bail sur
--      l'encaissé réel — promotion, rétrogradation, suppression ;
--   3. un déclencheur sur encaissements (insert/update/delete) : le document
--      suit l'argent, sans que l'appelant ait à y penser.

-- 1 ─ L'état brut, sans garde (usage interne : déclencheurs et RPC gardées) ──
create or replace function public.etat_loyers_bail_brut(p_bail uuid)
returns table (
  appel_id uuid, periode date, date_echeance date, montant_du numeric,
  cumul_du numeric, montant_couvert numeric, statut text
)
language sql stable security definer set search_path = ''
as $$
  with a as (
    select id, periode, date_echeance, montant_du,
      sum(montant_du) over (order by periode rows between unbounded preceding and current row) as cumul_du
    from public.appels_loyer where bail_id = p_bail
  ), tot as (
    select coalesce(sum(montant), 0) as encaisse from public.encaissements where bail_id = p_bail
  )
  select
    a.id, a.periode, a.date_echeance, a.montant_du, a.cumul_du,
    round(least(a.montant_du, greatest(0, tot.encaisse - (a.cumul_du - a.montant_du))), 2) as montant_couvert,
    case
      when tot.encaisse >= a.cumul_du then 'paye'
      when tot.encaisse > (a.cumul_du - a.montant_du) then 'partiel'
      when a.date_echeance < current_date then 'impaye'
      else 'attendu'
    end as statut
  from a, tot
  order by a.periode;
$$;
revoke execute on function public.etat_loyers_bail_brut(uuid) from public, anon, authenticated;

-- La RPC exposée garde son contrôle de portefeuille et délègue le calcul.
create or replace function public.etat_loyers_bail(p_bail uuid)
returns table (
  appel_id uuid, periode date, date_echeance date, montant_du numeric,
  cumul_du numeric, montant_couvert numeric, statut text
)
language sql stable security definer set search_path = ''
as $$
  select e.* from public.etat_loyers_bail_brut(p_bail) e
  where exists (
    select 1 from public.baux b
    where b.id = p_bail
      and not public.bail_hors_portefeuille(b.organization_id, b.id)
  );
$$;
revoke execute on function public.etat_loyers_bail(uuid) from public, anon;

-- 2 ─ Le document suit l'argent ──────────────────────────────────────────────
-- Rend le nombre de quittances, de reçus et de lignes retirées.
create or replace function public.resynchroniser_quittances(p_bail uuid)
returns table (quittances int, recus int, retirees int)
language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_quittances int := 0;
  v_recus int := 0;
  v_retirees int := 0;
  r record;
  v_maj int;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;

  for r in select * from public.etat_loyers_bail_brut(p_bail) loop
    if r.statut = 'paye' then
      -- Encaissement intégral : quittance libératoire du montant appelé
      if exists (select 1 from public.quittances q where q.appel_id = r.appel_id) then
        update public.quittances q
           set est_quittance = true, montant = r.montant_du,
               date_emission = current_date, email_envoye_at = null
         where q.appel_id = r.appel_id
           and (q.est_quittance is distinct from true or q.montant is distinct from r.montant_du);
        get diagnostics v_maj = row_count;
        v_quittances := v_quittances + v_maj;
      else
        insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
        values (v_org, p_bail, r.appel_id, true, r.montant_du);
        v_quittances := v_quittances + 1;
      end if;

    elsif r.montant_couvert > 0 then
      -- Paiement partiel : reçu qui CONSTATE, jamais quittance (RM-3.4.2)
      if exists (select 1 from public.quittances q where q.appel_id = r.appel_id) then
        update public.quittances q
           set est_quittance = false, montant = r.montant_couvert,
               date_emission = current_date, email_envoye_at = null
         where q.appel_id = r.appel_id
           and (q.est_quittance is distinct from false or q.montant is distinct from r.montant_couvert);
        get diagnostics v_maj = row_count;
        v_recus := v_recus + v_maj;
      else
        insert into public.quittances (organization_id, bail_id, appel_id, est_quittance, montant)
        values (v_org, p_bail, r.appel_id, false, r.montant_couvert);
        v_recus := v_recus + 1;
      end if;

    else
      -- Plus rien de perçu sur cette période : il n'y a plus rien à attester.
      -- La quittance n'est pas une écriture comptable (RM-A6.3 ne s'y applique
      -- pas) : c'est un document dérivé de l'encaissé, il disparaît avec lui.
      delete from public.quittances q where q.appel_id = r.appel_id;
      get diagnostics v_maj = row_count;
      v_retirees := v_retirees + v_maj;
    end if;
  end loop;

  return query select v_quittances, v_recus, v_retirees;
end;
$$;
revoke execute on function public.resynchroniser_quittances(uuid) from public, anon, authenticated;

-- emettre_quittances : même contrôle d'accès, resynchronisation complète.
-- Les noms de colonnes de sortie (nb_quittances, nb_recus) sont ceux que
-- lib/quittances.ts consomme — ils ne changent pas.
create or replace function public.emettre_quittances(p_bail uuid)
returns table (nb_quittances int, nb_recus int)
language plpgsql security definer set search_path = ''
as $$
declare v_org uuid; v_r record;
begin
  select organization_id into v_org from public.baux where id = p_bail;
  if v_org is null then raise exception 'Bail introuvable'; end if;
  if not (v_org in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  select * into v_r from public.resynchroniser_quittances(p_bail);
  return query select v_r.quittances, v_r.recus;
end;
$$;
revoke execute on function public.emettre_quittances(uuid) from public, anon;

-- 3 ─ Le déclencheur : aucune quittance ne survit à son encaissement ─────────
create or replace function public.encaissement_resynchronise_quittances()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_bail uuid;
begin
  v_bail := coalesce(new.bail_id, old.bail_id);
  if v_bail is not null then
    perform public.resynchroniser_quittances(v_bail);
  end if;
  return null; -- AFTER trigger
end;
$$;

drop trigger if exists encaissement_quittances on public.encaissements;
create trigger encaissement_quittances
  after insert or update or delete on public.encaissements
  for each row execute function public.encaissement_resynchronise_quittances();

-- 4 ─ Rattrapage des documents déjà incohérents ─────────────────────────────
do $$
declare b record;
begin
  for b in select distinct bail_id from public.quittances where bail_id is not null loop
    perform public.resynchroniser_quittances(b.bail_id);
  end loop;
end $$;

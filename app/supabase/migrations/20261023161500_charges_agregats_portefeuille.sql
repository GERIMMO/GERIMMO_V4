-- Audit du 23/10/2026, A03 (P1, cloisonnement) : deux agrégats de charges lisibles hors du portefeuille.
--
-- `charges_recuperables_exercice(lot, exercice)` et `provisions_charges_annee(bail, année)` sont SECURITY DEFINER : elles
-- contournent le RLS, et leur contrôle d'accès est entièrement à leur charge. Depuis 20260910130000, elles contrôlent
-- l'APPARTENANCE à l'agence du lot ou du bail (`org_ids_avec_roles`), mais pas le PORTEFEUILLE : un agent restreint
-- obtenait le total des charges récupérables d'un lot, ou celui des provisions d'un bail, confié à un collègue — des
-- montants que les politiques RESTRICTIVES de lecture lui refusent (`appels_charges_agent_portefeuille`,
-- `appels_loyer_agent_portefeuille`, `lots_agent_portefeuille`, `baux_agent_portefeuille`).
--
-- Correction : le MÊME contrôle que ces politiques et que `etat_loyers_bail` (20260910130000, § 1) — l'appartenance,
-- puis `not lot_hors_portefeuille(org, lot)` ou `not bail_hors_portefeuille(org, bail)`. Ces prédicats ne valent vrai
-- que pour un agent restreint devant un objet absent de son portefeuille (`lots_de_mon_portefeuille`) : administrateur
-- d'agence, propriétaire direct et super-administrateur ne sont pas concernés. Le refus garde la forme qu'avaient déjà
-- ces deux fonctions pour un compte d'une autre agence : 0.
--
-- Seule appelante en base : `regulariser_charges` (20260929130000), avec le lot et le bail d'un même bail. Un agent
-- restreint n'y aboutit que sur un bail de son portefeuille (le déclencheur `garde_portefeuille_agent` refuse sinon
-- l'écriture de la régularisation), et là les deux contrôles passent.
--
-- Rejouable : `create or replace`, même signature, même retour, `search_path = ''` ; droits inchangés (authenticated et
-- service_role, jamais public ni anon). Aucune donnée touchée.
-- Retour : supabase/retours-arriere/20261023161500_charges_agregats_portefeuille.retour.sql.

create or replace function public.charges_recuperables_exercice(p_lot uuid, p_exercice integer)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(p.montant), 0)
  from public.appel_charges_postes p
  join public.appels_charges a on a.id = p.appel_id
  join public.lots l on l.id = a.lot_id
  where a.lot_id = p_lot and a.exercice = p_exercice
    and a.statut in ('ventile', 'fige') and p.nature = 'recuperable'
    -- Appartenance : l'agence du lot est celle de l'appelant.
    and l.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    -- Portefeuille : et, pour un agent restreint, un lot qui lui est confié (A03, 23/10).
    and not public.lot_hors_portefeuille(l.organization_id, l.id);
$$;
revoke execute on function public.charges_recuperables_exercice(uuid, integer) from public, anon;

create or replace function public.provisions_charges_annee(p_bail uuid, p_annee integer)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(a.charges), 0)
  from public.appels_loyer a
  join public.baux b on b.id = a.bail_id
  where a.bail_id = p_bail
    and extract(year from a.periode) = p_annee
    -- Appartenance : l'agence du bail est celle de l'appelant.
    and b.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    -- Portefeuille : et, pour un agent restreint, un bail d'un lot qui lui est confié (A03, 23/10).
    and not public.bail_hors_portefeuille(b.organization_id, b.id);
$$;
revoke execute on function public.provisions_charges_annee(uuid, integer) from public, anon;

select public.fermer_fonctions_a_anon();

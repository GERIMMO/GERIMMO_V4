-- Sprint 2 — Découpage d'un bien contenant un lot loué (variante V3 du module 0).
--
-- Arbitrage humain du 2026-07-31 (interprétation B) : lever la contradiction du
-- référentiel entre la variante V3 (« Découpage avec un lot déjà loué : le lot
-- loué garde son bail, nouveaux lots en brouillon ») et RM-0.3.8 (« un lot loué
-- ne peut pas être redécoupé »).
--
-- Lecture retenue : les deux textes visent deux opérations différentes.
--   - RM-0.3.8 interdit de REDÉCOUPER le LOT loué lui-même (changer ses limites) ;
--   - la variante V3 AUTORISE de découper le BIEN qui contient un lot loué.
-- Ce modèle (ajout de lots, sans géométrie) ne scinde jamais un lot existant :
-- il ajoute de nouveaux lots. Le blocage total précédent rendait V3 impossible.
--
-- Changement : suppression du blocage « Lot loué » ; le lot loué n'est pas touché
-- (garde son état et son bail), les nouveaux lots naissent en brouillon, la clé
-- de répartition est invalidée (RM-0.3.3).
--
-- Suivi à traiter séparément : « alerte sur les régularisations en cours » (V3).

create or replace function public.decouper_bien(p_bien uuid, p_lots jsonb)
returns setof uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_bien record;
  v_origine record;
  v_lot jsonb;
  v_nouveau uuid;
begin
  select * into v_bien from public.biens where id = p_bien;
  if not found then raise exception 'Bien introuvable'; end if;

  select * into v_origine from public.lots
  where bien_id = p_bien and etat <> 'archive'
  order by created_at limit 1;
  if not found then
    raise exception 'Aucun lot actif : réactiver un lot avant de découper';
  end if;

  -- Interprétation B (V3) : un lot loué n'empêche plus le découpage du bien.
  -- Le lot loué conserve son bail ; il n'est jamais modifié ici. Seule la
  -- scission du lot loué lui-même reste interdite (RM-0.3.8), ce que cette
  -- fonction ne fait pas (elle ajoute des lots, elle n'en découpe aucun).

  if jsonb_typeof(p_lots) <> 'array' or jsonb_array_length(p_lots) = 0 then
    raise exception 'Aucun lot à créer';
  end if;

  for v_lot in select * from jsonb_array_elements(p_lots) loop
    insert into public.lots (bien_id, organization_id, nom, surface_m2, pieces)
    values (p_bien, v_bien.organization_id,
            v_lot->>'nom',
            nullif(v_lot->>'surface_m2', '')::numeric,
            nullif(v_lot->>'pieces', '')::integer)
    returning id into v_nouveau;
    -- Héritage du propriétaire d'origine (RM-0.3.6)
    insert into public.detentions (lot_id, organization_id, person_id, quote_part, date_debut)
    select v_nouveau, organization_id, person_id, quote_part, current_date
    from public.detentions
    where lot_id = v_origine.id and date_fin is null;
    return next v_nouveau;
  end loop;

  -- La clé en vigueur ne couvre plus la structure : invalidation (RM-0.3.3)
  update public.cles_repartition set invalidated_at = now()
  where bien_id = p_bien and invalidated_at is null;
  -- Les lots non loués retournent en brouillon ; le lot loué n'est pas concerné
  update public.lots set etat = 'brouillon'
  where bien_id = p_bien and etat = 'disponible';
end;
$$;

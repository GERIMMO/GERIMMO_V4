-- Restitution du dépôt : dire à quelle date les montants ont été arrêtés,
-- et permettre de les ré-arrêter tant que le décompte n'est pas figé.
--
-- Constat. `demarrer_restitution` prend un INSTANTANÉ du dépôt encaissé et des
-- impayés, puis `finaliser_decompte` calcule le solde sur cet instantané. Entre
-- les deux, la réalité bouge — et elle bouge précisément parce qu'on réclame :
-- le locataire règle son arriéré pour récupérer son dépôt. Rejoué en local :
-- 900 € de dépôt, 300 € d'impayés au démarrage, le locataire règle ses 300 €,
-- le décompte lui rend 600 € au lieu de 900 €. La correction suppose alors un
-- décompte rectificatif (RM-2.7.3), pour une dette qui n'existait plus.
--
-- Ce que cette migration NE tranche PAS. À quelle date les impayés DOIVENT
-- être arrêtés : au démarrage (le décompte reste stable pendant qu'on
-- l'établit, cohérent avec RM-2.6.2 — « le locataire voit le décompte quand il
-- est arrêté, pas pendant son élaboration ») ou à la finalisation (le décompte
-- dit la dette réelle du jour où il est émis). Le wiki ne tranche pas :
-- wiki/processus/Restitution du dépôt de garantie.md pose l'ORDRE d'imputation
-- (RM-2.4.7, impayés avant dégradations) et le moment du GEL (RM-2.7.3, après
-- envoi), jamais la date d'arrêté des impayés ; la synthèse
-- wiki/syntheses/État des lieux du design et des parcours.md le porte
-- elle-même en « point à trancher (humain) ». Aucune règle inventée ici : la
-- date d'arrêté reste choisie par le gérant, d'un geste explicite.
--
-- Ce qui est indiscutable et que cette migration apporte :
--   1. la date de l'instantané est ENREGISTRÉE, pour que l'écran puisse la
--      dire — un chiffre figé qu'on ne sait pas figé est un piège ;
--   2. le gérant peut RÉ-ARRÊTER les montants tant que le décompte est en
--      cours, sans avoir à redémarrer la restitution (ce qui remettrait aussi
--      en cause la date de remise des clés, donc le délai légal) ;
--   3. l'écran peut COMPARER l'instantané à la réalité du moment, via une
--      lecture qui applique exactement la même formule.

-- ============================================================
-- 1. La date de l'instantané
-- ============================================================
-- Nommée « montants » et non « impayés » : dépôt encaissé et impayés sont lus
-- au même instant, par la même fonction. Un solde qui mélangerait un dépôt du
-- 3 mars et des impayés du 28 mars serait plus faux que les deux pris ensemble.
alter table public.restitutions add column montants_arretes_le timestamptz;

-- Reprise de l'existant : l'écran ne propose « Démarrer la restitution » que
-- s'il n'y en a pas encore (formulaire-restitution.tsx), donc pour toutes les
-- lignes en place l'instantané a été pris à la création. `created_at` est la
-- date exacte, pas une approximation.
update public.restitutions set montants_arretes_le = created_at where montants_arretes_le is null;
alter table public.restitutions alter column montants_arretes_le set not null;
alter table public.restitutions alter column montants_arretes_le set default now();

comment on column public.restitutions.montants_arretes_le is
  'Date à laquelle depot et impayes ont été lus dans la réalité. Les deux sont un instantané, pas un calcul permanent : l''écran doit le dire.';

-- ============================================================
-- 2. La formule, énoncée une seule fois
-- ============================================================
-- Trois appelants (démarrage, ré-arrêté, lecture de comparaison) : recopier la
-- formule trois fois, c'est se garantir qu'un jour deux d'entre elles ne
-- diront plus la même chose et que l'écran accusera un écart qui n'existe pas.
-- Interne, sans contrôle d'accès : chaque appelant porte le sien.
create function public.montants_reels_bail(p_bail uuid)
returns table (depot numeric, impayes numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- Le dépôt à restituer est celui qui a été ENCAISSÉ (audit 09/09)
    coalesce((select sum(montant) from public.depot_encaissements where bail_id = p_bail), 0),
    -- Impayés : appelé moins encaissé, jamais négatif (un trop-perçu n'est pas
    -- une dette du bailleur au titre du dépôt, il relève du solde de tout compte)
    greatest(0,
      coalesce((select sum(montant_du) from public.appels_loyer where bail_id = p_bail), 0)
      - coalesce((select sum(montant) from public.encaissements where bail_id = p_bail), 0));
$$;
revoke execute on function public.montants_reels_bail(uuid) from public, anon, authenticated;

-- ============================================================
-- 3. Démarrage : inchangé, sauf qu'il date son instantané
-- ============================================================
create or replace function public.demarrer_restitution(p_bail uuid, p_date_remise date, p_conforme boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v record; v_m record; v_sans_edl boolean; v_id uuid;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  v_sans_edl := not exists (
    select 1 from public.etats_des_lieux e
    where e.bail_id = p_bail and e.type = 'entree' and e.etat = 'signe'
  );
  select * into v_m from public.montants_reels_bail(p_bail);

  insert into public.restitutions
    (organization_id, bail_id, date_remise_cles, delai_mois, depot, impayes, sans_edl_entree,
     montants_arretes_le)
  values (v.organization_id, p_bail, p_date_remise, case when p_conforme then 1 else 2 end,
          v_m.depot, v_m.impayes, v_sans_edl, now())
  on conflict (bail_id) do update
    set date_remise_cles = excluded.date_remise_cles, delai_mois = excluded.delai_mois,
        depot = excluded.depot, impayes = excluded.impayes, sans_edl_entree = excluded.sans_edl_entree,
        montants_arretes_le = excluded.montants_arretes_le
    where public.restitutions.statut = 'en_cours'
  returning id into v_id;
  if v_id is null then raise exception 'Restitution déjà finalisée pour ce bail'; end if;
  return v_id;
end $$;

-- ============================================================
-- 4. Ré-arrêter les montants — geste explicite du gérant
-- ============================================================
-- Ne décide rien à la place du gérant : c'est LUI qui constate que la réalité
-- a bougé et qui choisit de repartir dessus. Refusé une fois le décompte figé
-- (RM-2.7.3) : passé ce point, la correction s'appelle un rectificatif.
-- Renvoie le montant d'impayés désormais retenu, pour que l'écran le dise.
create function public.rafraichir_montants_restitution(p_restitution uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v record; v_m record;
begin
  select * into v from public.restitutions where id = p_restitution;
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
revoke execute on function public.rafraichir_montants_restitution(uuid) from public, anon;

-- ============================================================
-- 5. Lecture de comparaison, pour que l'écran sache quoi dire
-- ============================================================
-- Contrôle d'accès du produit pour une lecture (cf. `etat_loyers_bail`) :
-- appartenance à l'organisation ET portefeuille de l'agent restreint.
-- Prend le BAIL et non la restitution : la fiche du bail lit tout le reste par
-- bail, dans une seule vague de requêtes parallèles — passer par l'identifiant
-- de la restitution obligerait l'écran à attendre la première réponse pour
-- lancer celle-ci.
create function public.montants_restitution_a_jour(p_bail uuid)
returns table (depot numeric, impayes numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select m.depot, m.impayes
  from public.baux b
  cross join lateral public.montants_reels_bail(b.id) m
  where b.id = p_bail
    and b.organization_id in (select public.org_ids_avec_roles(
          array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
    and not public.bail_hors_portefeuille(b.organization_id, b.id);
$$;
revoke execute on function public.montants_restitution_a_jour(uuid) from public, anon;

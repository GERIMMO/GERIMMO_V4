-- PROCÉDURE DE MIGRATION VERS LA GRILLE DU 28/09/2026 — À NE PAS JOUER D'UN BLOC.
--
-- Ce fichier n'est PAS une migration : il ne figure pas dans
-- supabase/migrations et rien ne l'exécute automatiquement. La migration
-- 20260928090000_tarification_2026 laisse chaque organisation existante sur
-- la grille « historique » (premier bien offert, 5,99 €/bien, barème agence
-- du 12/09) avec tous ses mécanismes. Aucun client n'est migré en silence,
-- aucun débit rétroactif n'est possible.
--
-- DÉROULÉ
--   1. RECENSER (partie 1, lecture seule) — à jouer tel quel, en production,
--      par l'outil SQL de Supabase. Rien n'est écrit.
--   2. PRÉSENTER au porteur le recensement et les décisions listées en
--      partie 2 ; obtenir une réponse écrite pour chacune.
--   3. PRÉVENIR les clients concernés (préavis de l'article 8.8 des
--      conditions, dont la durée reste à fixer) AVANT tout changement.
--   4. APPLIQUER (partie 3) — uniquement les blocs décidés, un par un, dans
--      une transaction, après relecture du recensement du jour.
--
-- ─────────────────────────────────────────────────────────────────────────
-- PARTIE 1 — RECENSEMENT (lecture seule)
-- ─────────────────────────────────────────────────────────────────────────
begin transaction read only;

-- 1.a Vue d'ensemble : organisations par grille, type et statut.
select o.grille_tarifaire, o.type, o.status, count(*) as organisations
from public.organizations o
group by 1, 2, 3
order by 1, 2, 3;

-- 1.b Abonnements PAYANTS de la grille historique : ce qu'ils paient
--     aujourd'hui, et ce que la nouvelle grille leur ferait payer.
select o.id, o.name, o.type, o.status,
       a.stripe_statut, a.quantite as unites_facturees_historique,
       a.montant_mensuel_cents as mensuel_historique_cents,
       a.periode_fin, a.annulation_demandee,
       public.unites_a_couvrir(o.id) as unites_nouvelle_grille,
       case when o.type = 'agence' then 'agence'
            else public.formule_couvrante(public.unites_a_couvrir(o.id), 'mensuel') end as formule_proposee,
       public.montant_offre_cents(o.type, public.unites_a_couvrir(o.id), 'mensuel') as mensuel_nouveau_cents,
       public.montant_offre_cents(o.type, public.unites_a_couvrir(o.id), 'mensuel')
         - a.montant_mensuel_cents as ecart_mensuel_cents
from public.organizations o
join public.abonnements a on a.organization_id = o.id
where o.grille_tarifaire = 'historique'
  and a.stripe_subscription_id is not null
  and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid')
order by ecart_mensuel_cents desc;

-- 1.c Comptes GRATUITS de la grille historique : propriétaires qui n'ont
--     rien à payer (un seul bien) — leur écriture reste ouverte après l'essai.
select o.id, o.name, o.status, o.essai_fin,
       (select count(*) from public.biens b where b.organization_id = o.id and b.archived_at is null) as biens,
       public.unites_a_couvrir(o.id) as unites_nouvelle_grille,
       public.formule_couvrante(public.unites_a_couvrir(o.id), 'mensuel') as formule_proposee,
       public.montant_offre_cents(o.type, public.unites_a_couvrir(o.id), 'mensuel') as mensuel_nouveau_cents
from public.organizations o
left join public.abonnements a on a.organization_id = o.id
where o.grille_tarifaire = 'historique'
  and o.type = 'proprietaire_direct'
  and o.status <> 'archivee'
  and coalesce(a.stripe_statut, '') not in ('active', 'trialing', 'past_due', 'unpaid')
  and public.abonnement_quantite_cible(o.id) < 1;

-- 1.d Agences de la grille historique sans lot sous mandat (rien à payer
--     aujourd'hui ; le socle de 39 € HT s'appliquerait à la souscription).
select o.id, o.name, o.status, o.essai_fin
from public.organizations o
left join public.abonnements a on a.organization_id = o.id
where o.grille_tarifaire = 'historique'
  and o.type = 'agence'
  and o.status <> 'archivee'
  and coalesce(a.stripe_statut, '') not in ('active', 'trialing', 'past_due', 'unpaid')
  and public.abonnement_quantite_cible(o.id) < 1;

-- 1.e ESSAIS en cours sur la grille historique.
select o.id, o.name, o.type, o.essai_fin, (o.essai_fin - current_date) as jours_restants
from public.organizations o
where o.grille_tarifaire = 'historique' and o.status = 'essai'
order by o.essai_fin;

-- 1.f Organisations ACTIVES SANS souscription Stripe (ouvertes à la main :
--     contrat signé, geste de console) — un avantage à qualifier.
select o.id, o.name, o.type, o.created_at
from public.organizations o
left join public.abonnements a on a.organization_id = o.id
where o.status = 'active'
  and (a.stripe_subscription_id is null or a.stripe_statut is null);

-- 1.g AVANTAGES de parrainage : accordés, à appliquer, en attente d'arbitrage.
select ap.etat, ap.nature, o.grille_tarifaire, count(*) as nombre,
       sum(coalesce(ap.montant_cents, 0)) as montant_cents,
       sum(coalesce(ap.jours, 0)) as jours
from public.avantages_parrainage ap
join public.organizations o on o.id = ap.beneficiaire_organization_id
group by 1, 2, 3
order by 1, 2, 3;

-- 1.h Essais PROLONGÉS depuis la console (avantage accordé à la main).
select al.organization_id, o.name, al.created_at, al.details
from public.audit_log al
join public.organizations o on o.id = al.organization_id
where al.action = 'essai_prolonge'
order by al.created_at desc;

rollback;

-- ─────────────────────────────────────────────────────────────────────────
-- PARTIE 2 — DÉCISIONS À PRENDRE (porteur), AVANT TOUTE APPLICATION
-- ─────────────────────────────────────────────────────────────────────────
-- D1. Abonnés payants historiques (1.b) : les basculer, à quelle date, avec
--     quel préavis, et que faire de ceux dont le prix AUGMENTE (écart > 0) —
--     maintien du tarif historique jusqu'à une date, remise temporaire, ou
--     bascule au prix de la grille ? Ceux dont le prix baisse : bascule
--     immédiate ou à l'échéance ?
-- D2. Comptes gratuits historiques (1.c) : le premier bien offert « à vie »
--     leur a été promis (conditions du 11/09, art. 8.1). Maintien à vie,
--     maintien jusqu'à une date, ou bascule avec préavis ?
-- D3. Essais historiques en cours (1.e) : basculer sur la nouvelle grille
--     (l'essai continue, seule l'issue change) — recommandé — ou laisser
--     finir sur l'ancienne ?
-- D4. Organisations actives sans souscription (1.f) : quelle régularisation ?
-- D5. Parrainage : (a) le filleul garde-t-il 30 jours d'essai au lieu de 14 ?
--     (b) le « mois offert » du parrain : quel montant pour un abonnement
--     annuel (1/12 du montant annuel ? un mois de la formule mensuelle ?) ;
--     (c) cumul avec le paiement annuel (deux mois offerts) autorisé ?
--     Les avantages « en_attente » (1.g) seront appliqués ou annulés selon
--     cette décision ; les avantages déjà « appliqué » ou « a_appliquer »
--     sont conservés en tout état de cause.
-- D6. Régime de TVA de l'éditeur (REGIME_TVA, src/lib/editeur.ts) et préavis
--     de révision tarifaire (conditions, art. 8.8).
--
-- ─────────────────────────────────────────────────────────────────────────
-- PARTIE 3 — APPLICATION (blocs commentés : à décommenter UN PAR UN)
-- ─────────────────────────────────────────────────────────────────────────
-- Chaque bloc s'exécute seul, dans sa transaction, par un super admin. La
-- bascule d'une organisation ne touche PAS Stripe : un abonnement payant
-- historique continue d'être facturé à l'identique tant qu'il n'a pas été
-- remplacé par une souscription de la nouvelle grille, souscrite par le
-- client lui-même depuis « Mon abonnement » (aucun débit sans son accord).
--
-- D3 — Essais en cours → nouvelle grille :
-- begin;
-- select set_config('gerimmo.systeme', 'on', true);
-- update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
--  where grille_tarifaire = 'historique' and status = 'essai'
--    and not exists (select 1 from public.abonnements a where a.organization_id = organizations.id
--                    and a.stripe_statut in ('active', 'trialing', 'past_due', 'unpaid'))
-- returning id, name;
-- insert into public.audit_log (organization_id, action, details)
-- select id, 'grille_tarifaire_migree', jsonb_build_object('vers', '2026-09-28', 'decision', 'D3')
--   from public.organizations where grille_tarifaire = '2026-09-28' and status = 'essai'
--    and updated_at > now() - interval '1 minute';
-- commit;
--
-- D2 — Comptes gratuits historiques → nouvelle grille, à la date décidée
-- (le préavis donné) : ils passent en lecture seule tant qu'ils ne souscrivent
-- pas, données conservées.
-- begin;
-- select set_config('gerimmo.systeme', 'on', true);
-- update public.organizations set grille_tarifaire = '2026-09-28', updated_at = now()
--  where id in (/* identifiants retenus au recensement 1.c */)
-- returning id, name;
-- commit;
--
-- D1 — Abonnés payants historiques : pas de bascule en base tant qu'ils n'ont
-- pas souscrit l'offre de la nouvelle grille. Procédure : (1) préavis ;
-- (2) à la date décidée, le client souscrit depuis « Mon abonnement »
-- (montant affiché, confirmation) ; (3) l'ancienne souscription Stripe est
-- résiliée À SON ÉCHÉANCE depuis le tableau de bord Stripe ; (4) seulement
-- alors, bascule de la grille en base (même bloc que D2). Aucune écriture
-- ne modifie une souscription Stripe existante depuis ce fichier.
--
-- D5 — Avantages de parrainage en attente : après décision, soit les
-- appliquer (script dédié à écrire selon la règle retenue), soit :
-- begin;
-- update public.avantages_parrainage set etat = 'sans_objet', applique_le = now()
--  where etat = 'en_attente' and id in (/* identifiants */);
-- commit;

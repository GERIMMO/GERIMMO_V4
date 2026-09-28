-- PROCÉDURE DE MIGRATION VERS LA GRILLE DU 28/09/2026 — RECENSEMENT ET SUIVI.
--
-- Ce fichier n'est PAS une migration : rien ne l'exécute automatiquement.
-- Les décisions du porteur (partie 2) sont appliquées par la migration
-- 20260928090000_tarification_2026. Ce fichier sert à RECENSER (partie 1,
-- lecture seule, à jouer tel quel dans l'outil SQL de Supabase) avant et
-- après la mise en production, et à suivre les organisations qui paient
-- encore sur l'ancienne grille.
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
-- PARTIE 2 — DÉCISIONS DU PORTEUR (28/09/2026) — APPLIQUÉES PAR LA MIGRATION
-- ─────────────────────────────────────────────────────────────────────────
-- « 3 logements, c'est 3 biens. Le premier bien n'est plus offert : la seule
-- chose offerte, ce sont 14 jours, puis gel avec possibilité de visualiser
-- jusqu'au paiement. Bascule dès l'ajout de bien. Il n'y a pas de cumul. »
--
-- En conséquence, la migration 20260928090000_tarification_2026 :
--   · bascule d'office toute organisation SANS souscription en cours vers la
--     nouvelle grille (essais en cours : même date de fin ; essais échus et
--     comptes « premier bien offert » : lecture seule jusqu'au paiement) ;
--   · fait basculer une organisation qui paie encore sur l'ancienne grille
--     dès qu'elle ajoute un bien (déclencheur biens_bascule_grille) ;
--   · n'ouvre aucun avantage de parrainage pour la nouvelle grille (pas de
--     cumul) ; les avantages déjà accordés restent acquis.
-- Aucun débit n'est déclenché : rien ne touche Stripe.
--
-- RESTE À SUIVRE (organisations qui paient sur l'ancienne grille) : après la
-- bascule par ajout de bien, leur ancienne souscription Stripe continue d'être
-- prélevée à l'identique, sans resynchronisation de quantité. Les inviter à
-- souscrire l'offre de la nouvelle grille depuis « Mon abonnement », puis
-- résilier l'ancienne souscription À SON ÉCHÉANCE depuis le tableau de bord
-- Stripe. Au 28/09/2026 : aucune organisation dans ce cas en production.

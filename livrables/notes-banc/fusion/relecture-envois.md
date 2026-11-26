# Relecture E (envois, sécurité des accès, services externes) — commit 3aeeee94, base fde4cbb4

Rien de bloquant ni d'important. Deux défauts mineurs, issus d'un code antérieur à la fusion (D4 rend le second atteignable).
Base de sonde `gerimmo_ci_sonde_envois` (+ `_api`, 574 migrations). Elle est supprimée, comme `relecture-envois/src`.
Sondes conservées dans `relecture-envois/sondes/`.

## Mineurs
- E-01 : la première souscription d'une agence ne vérifie pas que l'identité des conditions archivées est celle en vigueur.
  Seul le particulier passe par `motifArchiveCommande` (`garde-souscription-serveur.ts:50`, `abonnement-2026.tsx:176`).
  Sonde vitest `zz-sonde-envois-archive-agence`, archive dont le siège diffère : le particulier est refusé, l'agence
  passe la garde et Stripe est appelé (`customers.retrieve`). Correction : tester l'archive pour toute première souscription.
- E-02 : une relance de loyer à la main peut partir au locataire sans jamais être consignée dans `relances`, puis repartir.
  La trace n'est écrite que si tous les destinataires sont acceptés (`reception-loyer.ts:156-160`). Un colocataire refusé
  pour de bon reste en « echec », jamais repris (`prendre_courriel`) : aucune trace. Après un paiement partiel, les montants
  donc la clé changent, et la preuve « même niveau » ne voit rien : une seconde « première relance » part au locataire.
  Preuves : sonde vitest `zz-sonde-envois-relance-partielle` (0 trace sur 3 essais, 2 clés envoyées au locataire) et sonde
  SQL `s2` (le niveau n'est bloqué que si une ligne `relances` existe). Correction : consigner dès un destinataire accepté.

## Vérifié sans défaut
- Interrupteurs : 5 fermés à la livraison. `anon` : `envois_automatiques_proposes`, `envoi_automatique_ouvert` et
  `accepter_cgu` refusés (42501). `authenticated` non superviseur : `empreinte_metier_courriel`, `envoi_automatique_ouvert`,
  `finaliser_courriel_metier` et `attacher_contexte_courriel` refusés (42501), réglage refusé (lecture, écriture, console).
- Preuve de la relance à la main (sonde `s2`) : nulle interrupteur fermé. Ouvert : valable pour le locataire, refusée pour
  l'acteur B, l'espace B, la caution, une adresse inconnue, une relance consignée, un arrêt, un compte inactif, et une fois
  refermé. Le compte B ne lit rien de A, et son insertion dans `relances` de A est refusée (RLS).
- `relance_report_rdv` : sans contexte si fermé (`relances-reports-rdv.ts:28,66`), preuve refaite par la base.
  Relance à la main réservée à `proprietaire_direct` (`reception-loyer.ts:91`), sans reprise autonome (déclencheur 150000).
  Aucune tâche planifiée ni appel HTTP ajoutés par les migrations du 25/11.
- Facebook : la mission (`marketing.ts:97-98`) et l'action (`publications.ts:152-153`) refusent avant toute parution,
  réservation ou envoi. Seul POST Graph : `facebook.ts:120`. « Publier maintenant » passe par la mission, écrans masqués.
- Stripe : `demarrerAbonnement` est le seul chemin vers une page de paiement, garde du vendeur appliquée à l'agence.
  Le portail ne permet ni changement ni résiliation (`stripe.ts:640-650`). Hausse, périodicité et reprise : `accordAvantActe`.
- Ancienne signature : les 3 fonctions sont refusées à `authenticated` (ACL et sonde), plus aucun appel dans src/e2e/scripts.
- `accepter_cgu` refuse une version non archivée (source « compte »). Un non-superviseur ne modifie pas la décision
  « vente sans médiateur » (UPDATE 0).
- 8 fichiers de test du lot rejoués sur ma base : 164/164 (`relecture-envois/vitest-cibles.log`).

## Non vérifié
Production ; Facebook et Stripe réels ; suite complète ; Playwright ; rejeu des retours. D4R-04 (périodicité appelable
directement) et la dépendance de D4R-03 à 150000 sont déjà écrits par les auteurs.

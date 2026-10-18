# Abonnements au jour de Paris — 19 octobre 2026

`20261018231827_abonnement_jour_paris.sql` harmonise cinq fonctions avec le calcul déjà utilisé par `org_ecriture_ouverte` : enregistrement du défaut, sélection et marquage des relances, état de l’essai et compteur avant lecture seule. Les 13 références au jour de session deviennent le jour de Paris. Aucun montant, aucune date historique ni permission ne change.

Le retour `20261018231827_abonnement_jour_paris.retour.sql` s’exécute dans une transaction externe et rétablit les cinq calculs au jour de session ; il retire sa version de l’historique dans cette même transaction. Il ne supprime aucun compte ni aucune opération. Une définition inattendue bloque l’aller comme le retour.

Validation : `abonnement-jour-paris-migration.test.ts` vérifie le rejeu, le retour, la réapplication, les droits inchangés et les jours J+7/J+14/J+15 quand le jour de Paris diffère du jour UTC. `relance-paiement.test.ts` force le fuseau UTC de la session de test.

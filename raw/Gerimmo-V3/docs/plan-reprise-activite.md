# Plan de reprise d’activité GERIMMO

## Objectifs

- RPO cible : 24 heures pour les données applicatives.
- RTO cible : 4 heures pour un incident majeur.
- Sauvegarde quotidienne gérée par Supabase et vérifiée par GERIMMO.
- Vérification hebdomadaire indépendante et test de restauration trimestriel.

## Procédure

1. Déclarer l’incident et geler les opérations sensibles.
2. Identifier la dernière sauvegarde saine dans Supabase.
3. Créer un projet de restauration isolé, jamais directement en production.
4. Vérifier les migrations, contraintes, RLS, Storage et volumes.
5. Exécuter les tests critiques et l’isolation multi-organisations.
6. Faire valider la bascule par un responsable humain.
7. Basculer, surveiller, puis consigner l’opération dans le registre.

La restauration, le SQL, les migrations, les permissions et Storage exigent toujours une validation humaine. Aucun bouton applicatif ne restaure directement la production.

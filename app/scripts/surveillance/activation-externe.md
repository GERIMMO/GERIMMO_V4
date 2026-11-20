# Surveillance indépendante

Configurer deux sondes HTTPS externes toutes les trois minutes pour https://www.gerimmo.app/ et https://www.gerimmo.app/api/sante. Exiger HTTP 200 et, sur la seconde, la présence de `"base":true`. Une indisponibilité de Gerimmo ou de GitHub ne doit pas empêcher le prestataire de prévenir le responsable. Utiliser les alertes e-mail privées et désactiver toute publication de l’état sur une page publique.

Configurer les huit signaux ci-dessous seulement après confirmation de l’éligibilité du compte Gerimmo à l’offre gratuite. Les valeurs de configuration sont les derniers segments opaques des URL fournis par le prestataire. Ne jamais saisir une clé d’administration du prestataire, une URL complète ou un secret Supabase.

| Signal | Lieu | Période et tolérance initiales | Vérification après alerte |
|---|---|---|---|
| GERIMMO_SIGNAL_APPELS, GERIMMO_SIGNAL_QUITTANCES, GERIMMO_SIGNAL_RELANCES, GERIMMO_SIGNAL_ABONNEMENTS, GERIMMO_SIGNAL_MARKETING | Vercel Production uniquement, un jeton par mission | 24 h + 2 h | Ouvrir Santé, vérifier la dernière passe et les suspensions délibérées. Respecter les décisions humaines en attente. |
| GERIMMO_SIGNAL_FACTURES | Vercel Production uniquement | 1 min + 5 min | Vérifier la file des factures, le rapprochement des courriels et les arrêts de supervision. |
| GERIMMO_SIGNAL_SAUVEGARDE | GitHub Actions | 24 h + 2 h | Lire le dernier passage planifié et l’étape de relecture Scaleway avant toute décision. |
| GERIMMO_SIGNAL_DISPONIBILITE | GitHub Actions | 30 min + 60 min | Examiner les retards GitHub et l’état des deux sondes externes. Un retard du planificateur et une panne du site appellent des interventions différentes. |

Pour la mise en service, vérifier que chaque capteur passe de Pending au premier passage authentique. Avant ce premier passage le prestataire ne surveille pas les retards. Simuler ensuite un signal en échec puis un silence sur un capteur de recette distinct, vérifier la réception de l’alerte puis sa clôture. Supprimer le capteur de recette après l’exercice. Ne pas simuler une panne sur le site des clients. Si le plan gratuit impose une limite, faire l’exercice avant d’armer les huit signaux de production.

Les passages manuels de sauvegarde et de surveillance GitHub ne réinitialisent pas les échéances planifiées. Le fournisseur reçoit le jeton de son propre capteur et l’état du passage, sans détail métier. Une panne du fournisseur ne rejoue jamais l’opération. Les fonctions de surveillance internes et le traitement manuel des incidents restent disponibles.

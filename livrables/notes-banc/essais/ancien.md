# Essai « ancien » : code 81740dec sur la base migrée à 89cb87ff (retour arrière, niveau 1). Banc local, 25/11/2026

**Verdict : réussi avec une réserve.** « Base compatible avec l'ancien code » est **vrai pour tout ce que la suite e2e de 81740dec exerce** (282 réussis, 0 échec au premier essai). C'est **faux sur un point trouvé hors de la suite** : la lettre de révision IRL peut devenir fausse. Ce cas est bloquant au sens strict pour le niveau 1, et une consigne suffit à le lever. Rien en production, aucun envoi, aucun test désactivé. Journaux : `essais/ancien/journaux/`.

## Vérifié (commande → sortie)
1. **Bases.** `preparer-ci.mjs` d'integ (89cb87ff) → « 576 migrations appliquées » (524 + 52), puis l'émulateur et `seed-parcours.mjs` de 89cb87ff (code 0). Matrice faite par le générateur de 81740dec (184 écrans).
2. **Construction de 81740dec.** Le lien symbolique vers node_modules est refusé par Turbopack (« Could not find the Next.js package »). J'ai fait une copie par liens physiques (`cp -al`) de `integ/app/node_modules` : package.json et package-lock.json sont identiques dans les deux commits (`git diff --quiet`). `npm run build` → code 0.
3. **Suite e2e complète de 81740dec** (`--retries=0 --workers=1`, exclusions de la CI) → **282 réussis, 3 ignorés, 0 échec** (17,1 min). Seule retouche du harnais : la garde `e2e/local/base-api-fictive.ts` accepte aussi `gerimmo_ci_essai_ancien(_temoin)_api` (`garde-base-api-fictive.diff`). Aucune assertion touchée. Le 1er passage a été arrêté (2 refus « Base API fictive locale obligatoire ») et les bases refaites à neuf.
4. **Témoin** (même code, base à 81740dec, jeu d'essai de 81740dec) → 279 réussis, 3 échecs, 3 ignorés. Les 3 échecs (abonnement:58, alias-espace:218, outils:171) passent au second lancement (4 réussis) : instabilité du banc, sans lien avec les migrations.
5. **Erreurs SQL du journal Postgres** : même profil sur les deux bases (558 « second facteur », 26 « Accès refusé », 3 « permission denied prendre_notification »…). Aucune erreur « function/column does not exist » ni de droit retiré. Écart : 1 « Bail introuvable » de plus (terme_bail, une lecture ; parcours vert ; non expliqué).
6. **Catalogue comparé** (fonctions, droits, politiques, déclencheurs, contraintes) :
   - `declarer_incident_bien_simple` passe de 7 à 9 arguments ; les 2 nouveaux ont une valeur par défaut, l'ancien appel est donc résolu.
   - Exécution retirée à authenticated : envoyer_pour_signature et retirer_evaluation (jamais appelées par l'ancien code) ; annuler_demande_signature et retourner_document_signe (appelées seulement sur une demande manuelle existante : aucune selon C1, et la migration s'arrête sinon).
   - `artisan_evaluations.retrait_motif` n'est plus lisible ; l'ancien code ne la lit pas.
   - 21 tables perdent des droits d'écriture, mais seulement là où aucune politique ne permettait d'écrire. Les écritures directes de l'ancien code gardent toutes leur droit.
   - Nouvelles signatures de reviser_loyer, regulariser_charges… : leur paramètre ajouté n'a pas de valeur par défaut, l'ancien appel n'est donc jamais ambigu.
7. **Sonde de révision IRL** (transaction annulée) : `reviser_loyer` à 4 paramètres, comme l'ancien code ; bail du 01/11/2025, demande du 01/11/2026. Nouvelle base : premier_terme = 2026-12-01, novembre appelé à 600,00 €. Témoin : novembre à 616,89 €.

## Classement
- **Refus propres et sûrs** (message de la base, filtré par `sansJargon` ; lus dans le code, non déclenchés par la suite) : ventilation avec un poste « récupérable » non confirmé ; révision au-delà d'un an ; 3e locataire sur un bail coché « époux ou partenaires de PACS » ; IA coupée ; ancienne signature manuelle.
- **Panne visible** : aucune observée.
- **Risque de donnée fausse, 1 cas.** Le modèle de 81740dec (`revision-irl.ts`, ligne 101) imprime « Loyer hors charges révisé, à compter du <date_effet> ». La lettre annoncerait donc 616,89 € au 01/11 alors que novembre est appelé à 600 € (PDF non rendu : lu dans le modèle). **Bloquant pour le niveau 1, sauf consigne écrite** dans le plan (É8→É10 et § 5.3) : aucune révision de loyer tant que 81740dec tourne sur la base migrée.

## Supposé ou non couvert
Non vérifié : les données créées par le nouveau code puis lues par l'ancien (avenants, factures refusées, absences, rendez-vous manqués). Seule la contestation du jeu d'essai était présente. Aucun essai avec l'IA réelle, les e-mails réels ou les tâches planifiées. L'émulateur n'est pas le vrai PostgREST/Supabase. La base est construite migration par migration ; l'essai « bloc » montre que le schéma est identique.

**Nettoyage vérifié.** 4 bases `gerimmo_ci_essai_ancien*` supprimées, arbre jetable et stockage supprimés, aucun serveur restant (ports 3100 et 54321 fermés). Integ et fusion sont inchangés (89cb87ff).

# Audit Gerimmo — cahier maître V3, 100 sections

État au 20 septembre 2026. Code de départ : `83da9b011b449c62a82d2f692d529e59e2287f6f`.

**Conclusion : toutes les fonctionnalités du PDF ne sont pas développées ni validées.** La gestion immobilière possède un socle important ; les moteurs avancés sont largement incomplets. Le PDF lui-même impose de terminer la V1 avant ces moteurs. Les exigences futures restent dans la matrice et ne sont pas effacées du périmètre.

Ce document distingue présence de code, règles testées localement et fonctionnement réel. « Partiel » porte sur toute la section, même lorsqu'une fonction particulière marche. « Absent identifié » signifie non trouvé dans le code inspecté ; une note wiki n'est pas une implémentation. « Non vérifié » concerne une preuve de résultat manquante. Une consigne appliquée à ce lot ne certifie pas tout l'historique du projet.

## Vérifications effectuées

- Dépôt distant actualisé, branche isolée, anciens travaux locaux préservés.
- 193 migrations rejouées dans des bases locales séparées pour SQL et API, avec données fictives. Aucun accès de test en écriture à la production.
- Première suite : 1 470 réussites, un échec de test dû à la conversion UTC d'une date civile, six tests PDF non exécutés. Le test lit désormais la date SQL stockée ; aucune règle de facturation n'a été changée.
- Vérification finale : **1 479 tests réussis dans 144 fichiers, aucun test sauté**, avec rendu PDF activé. Build, lint et types réussis ; npm audit signale 0 vulnérabilité au moment du contrôle. Les 35 épreuves du catalogue ont été générées (36 pages) ; la page dont le libellé a changé a été contrôlée visuellement. Cela ne vaut pas inspection visuelle de tous les documents.
- Les tests navigateur historiques sont recensés mais **ne constituent pas des tests tous rejoués aujourd'hui**. La recette navigateur de ce lot est relatée dans le bilan de publication.
- L'API locale utilise les politiques SQL réelles, mais émule Supabase Auth/PostgREST et ne lance pas pg_cron. Ce banc ne prouve ni délivrabilité des e-mails ni fonctionnement des prestataires externes.

## Corrections de ce lot

- Suppression du bon de visite des nouvelles générations, conformément au §4. Les documents déjà archivés restent conservés.
- Libellés documentaires centrés sur le locataire retenu.
- Attestations limitées aux baux actifs ou en préavis, dans la sélection et le contrôle serveur.
- Formulaire de génération : conservation de la saisie et du dossier, verrou de soumission et message utile en cas de confirmation réseau perdue, via le mécanisme existant.
- Accueil agence : la tuile des loyers conduit aux loyers ; les messages sans alerte ne déclarent plus globalement que tout est en ordre alors que des lots sont à compléter.

## Priorités avant de déclarer la V1 prête

1. **P0 — Preuves de lancement** : restauration isolée d'une sauvegarde réelle, configuration des services et réception des courriers, revue de sécurité et identité éditeur. Leur absence de preuve empêche la clôture ; elle ne signifie pas qu'une fuite ou une panne est démontrée.
2. **P1 — Recette complète par rôle** : location après sélection, dossier et documents, encaissement et quittance, incident jusqu'à clôture, messages, alertes et historique. Ajouter les cas erreurs, double clic, droits refusés, autre agence, mobile et session expirée.
3. **P2 — Compléments transverses** : recherche étendue, observabilité par parcours/version, décisions humaines et réduction des frictions.
4. **P3 — Après V1** : Brain, Founder Brief, études, radar, expériences, jauges économiques, croissance et expansion fondées sur des données réelles.

## Dépendances et décisions encore ouvertes

| Élément | Ce qui existe | Ce qui manque ou reste à prouver |
|---|---|---|
| Supabase | Base, Auth, stockage, RLS, migrations | Configuration actuelle, SMTP Auth, sauvegarde/restauration réelle et parcours avec le service réel. |
| Vercel | Déploiements, routes de tâches, région Paris | Contrôle de chaque variable et tâche réelle, alertes opérationnelles et retour arrière prouvé. |
| Resend | Code des envois et modèles | Domaine/expéditeur, SMTP et lecture des courriers réellement reçus. Présence d'une clé ≠ livraison. |
| Stripe | Code abonnement, webhook, factures internes | Configuration et test réel du cycle d'abonnement, soumis au niveau 3 pour les paiements et prix. Le suivi manuel des loyers doit fonctionner indépendamment. |
| Signature électronique | Documents et gestion de signature existants | Intégration Yousign opérationnelle non identifiée ; ce n'est pas seulement une clé à ajouter. |
| Réseaux sociaux | Journal et propositions de contenu | Intégrations officielles, attribution, calendrier et expériences ; aucune publication externe déclenchée. |
| Identité de l'éditeur | Champs centralisés dans `editeur.ts` | Faits encore vides dans le code consulté ; à fournir puis faire relire selon leur nature. |
| Antivirus | Contrôles de type et d'accès aux fichiers | Scanner opérationnel et traitement des résultats non identifiés ; décision de lancement à documenter. |

## Matrice des 100 sections

Les exigences complètes extraites du PDF sont conservées dans le JSON associé, avec numéro de page. Les références ci-dessous désignent du code et des tests, pas une déclaration de réussite de tous leurs parcours.

Répartition du relevé : 7 « Consigne appliquée à ce lot », 67 « Partiel », 8 « Non vérifié », 18 « Absent identifié ». **Ce n’est pas un pourcentage de conformité.**

### 1. RÈGLE ABSOLUE : NE PAS CASSER L’EXISTANT

PDF p. 3 · **Consigne appliquée à ce lot** · P1

Travail sur une branche isolée issue de main ; brouillons anciens préservés. Audit complet du comportement reste ouvert.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`.

### 2. COMPRENDRE GERIMMO

PDF p. 3 · **Partiel** · P1

Rôles et isolation présents ; compléter la recette de bout en bout des sept personas sur Supabase réel.

Éléments : `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`.

### 3. MODULES PRINCIPAUX

PDF p. 3 · **Partiel** · P1

Modules principaux présents. Présence de routes ne prouve pas chaque action ni chaque erreur.

Éléments : `app/src/app/agence/[orgId]`; `app/src/lib/import-parc.ts`; `app/tests/import-parc.test.ts`; `app/tests/portefeuille-lecture.test.ts`.

### 4. PARCOURS DE MISE EN LOCATION

PDF p. 3 · **Partiel** · P1

Parcours après sélection présent ; bon de visite retiré de la génération dans ce lot. Invitation réelle et récupération des pièces à vérifier jusqu'au destinataire.

Éléments : `app/src/app/actions/baux.ts`; `app/src/app/actions/personnes.ts`; `app/src/app/actions/parc.ts`; `app/tests/sprint4-bail.test.ts`; `app/e2e/local/seed-parcours.mjs`; `app/src/lib/documents`; `app/src/app/actions/documents-generes.ts`; `app/tests/catalogue-conformite-v3.test.ts`; `app/tests/catalogue-api.test.ts`.

### 5. GESTION DES LOYERS

PDF p. 3 · **Partiel** · P1

Suivi manuel, encaissement, quittance et relances présents ; vérifier rappel mensuel au gestionnaire et réception des courriers réels.

Éléments : `app/src/app/actions/loyers.ts`; `app/src/lib/quittancement-du-mois.ts`; `app/tests/cycle-mensuel.test.ts`; `app/tests/cron-relances-route.test.ts`.

### 6. INCIDENTS ET ARTISANS

PDF p. 4 · **Partiel** · P1

Cycle technique, urgence, devis et créneaux présents. Pas de parcours de conflits de voisinage identifié ; clauses de bail distinctes préservées. Clôture complète à retester.

Éléments : `app/src/lib/incidents.ts`; `app/src/app/locataire/[orgId]/reflexes-urgence.tsx`; `app/tests/sprint7-locataire-intervention.test.ts`; `app/tests/sprint7-artisans.test.ts`; `app/src/app/artisan`; `app/src/app/agence/[orgId]/artisans`.

### 7. SUPER ADMIN GERIMMO

PDF p. 4 · **Partiel** · P1

Console, accès support et journaux présents ; relecture exhaustive de toutes les actions sensibles et réversibilité restante.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`; `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`.

### 8. SÉCURITÉ ET CONFIDENTIALITÉ

PDF p. 4 · **Partiel** · P0

Tests SQL et API d'isolation disponibles et exécutés localement ; restauration de production, configuration et revue de sécurité complète non prouvées.

Éléments : `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`; `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`; `wiki/regles-metier/Plan de reprise d'activité.md`; `app/src/lib/edl-brouillon.ts`; `app/tests/edl-brouillon.test.ts`.

### 9. AUDIT INITIAL OBLIGATOIRE

PDF p. 4 · **Partiel** · P1

Matrice des 100 sections et audit initial produits ; audit interactif de tous les boutons et services externes encore incomplet.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`.

### 10. TRAVAILLER DE MANIÈRE AUTONOME

PDF p. 4 · **Consigne appliquée à ce lot** · P1

Corrections réversibles autonomes ; pas de modification financière, contractuelle, destructive ou d'extension de droits dans ce lot.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`.

### 11. QUALITÉ

PDF p. 5 · **Partiel** · P1

Suite locale passe ; chaîne UI → API → permissions → base → résultat → erreurs → historique pas intégralement prouvée pour chaque fonction.

Éléments : `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`; `app/src/lib/documents`; `app/src/app/actions/documents-generes.ts`; `app/tests/catalogue-conformite-v3.test.ts`; `app/tests/catalogue-api.test.ts`.

### 12. TESTS DE BOUT EN BOUT

PDF p. 5 · **Partiel** · P1

Fixtures API de parcours disponibles ; tests navigateur existants ne sont pas tous rejoués dans cet audit. Tous cas réseau/mobile et échecs à compléter.

Éléments : `app/src/app/actions/baux.ts`; `app/src/app/actions/personnes.ts`; `app/src/app/actions/parc.ts`; `app/tests/sprint4-bail.test.ts`; `app/e2e/local/seed-parcours.mjs`; `app/src/lib/incidents.ts`; `app/src/app/locataire/[orgId]/reflexes-urgence.tsx`; `app/tests/sprint7-locataire-intervention.test.ts`; `app/tests/sprint7-artisans.test.ts`.

### 13. UX

PDF p. 5 · **Partiel** · P1

Présentations par rôle et états utiles présents. Correction locale de la sélection documentaire et du lien des loyers ; revue de tous les écrans restante.

Éléments : `app/src/app/agence/[orgId]`; `app/src/lib/import-parc.ts`; `app/tests/import-parc.test.ts`; `app/tests/portefeuille-lecture.test.ts`; `app/src/app/locataire`; `app/tests/mes-documents-locataire.test.ts`; `app/e2e/parcours-locataire.spec.ts`.

### 14. MISE EN PRODUCTION

PDF p. 5 · **Partiel** · P0

CI, migrations et contrôles de configuration présents ; validation e-mails, sauvegarde/restauration et recette réelle exigée avant clôture V1.

Éléments : `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`.

### 15. GIT ET TRAÇABILITÉ

PDF p. 5 · **Consigne appliquée à ce lot** · P1

main récupéré et branche isolée ; preuves, diff, tests et publication tracés pour ce lot. Les anciens brouillons restent séparés.

Éléments : `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 16. DEFINITION OF DONE

PDF p. 5 · **Non vérifié** · P0

Définition de fin V1 non atteinte : preuve complète E2E/production, e-mails et restauration manquante.

Éléments : `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`; `wiki/regles-metier/Plan de reprise d'activité.md`; `app/src/lib/edl-brouillon.ts`; `app/tests/edl-brouillon.test.ts`; `app/src/lib/messagerie.ts`; `app/src/app/agence/[orgId]/messages`; `app/src/lib/email.ts`; `app/supabase/templates`.

### 17. RAPPORT FINAL V1

PDF p. 5 · **Partiel** · P1

Rapport intermédiaire daté ; rapport final V1 impossible tant que ses critères de fin ne sont pas satisfaits.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`.

### 18. OBJECTIF

PDF p. 5 · **Partiel** · P1

Socle immobilier développé, finition vérifiable et préparation au lancement encore nécessaires.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`.

### 19. BOUCLE D’AMÉLIORATION CONTINUE

PDF p. 6 · **Partiel** · P3

Signaux, journaux et CI constituent un début ; boucle observe → mesure → apprend reliée aux résultats non complète.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`; `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 20. GERIMMO CONTROL CENTER

PDF p. 6 · **Partiel** · P3

Console et santé présentes ; acquisition, rétention, études, expériences, actions Codex et décisions réunies restent à développer.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 21. FOUNDER BRIEF

PDF p. 6 · **Absent identifié** · P3

Pas de Founder Brief réunissant aujourd'hui, semaine, Codex, études, expansion et humain requis identifié.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 22. JAUGES GERIMMO

PDF p. 6 · **Partiel** · P3

Quelques comptes et indicateurs techniques ; pas de jeu complet de jauges avec MRR/ARR, marge, CAC/LTV, rétention, confiance et détail.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 23. CENTRE D’ÉTUDES

PDF p. 6 · **Absent identifié** · P3

Pas de centre d'études persistant avec méthode, sources, confiance, décision et résultat réel identifié dans l'application.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 24. USER SIGNALS

PDF p. 6 · **Partiel** · P2

Bugs, idées, contestations et regroupement présents ; abandons, fréquence et impacts conversion/rétention/revenu non instrumentés intégralement.

Éléments : `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 25. RADAR CONCURRENTIEL

PDF p. 7 · **Absent identifié** · P3

Notes de veille et journal ne constituent pas un radar concurrentiel applicatif avec suivi des opportunités.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`; `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`.

### 26. DÉVELOPPEMENT AUTONOME AVEC CODEX

PDF p. 7 · **Partiel** · P2

Branches, CI et retour utilisateur présents ; pipeline relié signal → livraison → mesure non complet dans le produit.

Éléments : `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 27. NIVEAUX D’AUTONOMIE

PDF p. 7 · **Partiel** · P1

Niveaux d'autonomie appliqués au travail ; aucun workflow applicatif complet de validation des décisions de niveau 3 identifié.

Éléments : `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`.

### 28. BUG AUTOPILOT

PDF p. 7 · **Absent identifié** · P3

Collecte des bugs présente ; pas de Bug Autopilot complet reproduisant, corrigeant, testant et déployant sous contrôles.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 29. MÉMOIRE DES DÉCISIONS

PDF p. 7 · **Absent identifié** · P3

Audit technique et historique wiki présents ; pas de Decision Log métier avec hypothèses, alternatives et résultats réels identifié.

Éléments : `app/src/app/admin/journaux`; `app/src/lib/tache.ts`; `app/src/lib/retours.ts`.

### 30. MOTEUR DE PRIORISATION

PDF p. 8 · **Absent identifié** · P3

Gravité de bugs disponible ; moteur de priorisation valeur/coût/risque/confiance avec hypothèses explicites absent.

Éléments : `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 31. GROWTH ENGINE

PDF p. 8 · **Absent identifié** · P3

Parrainage présent ; registre d'expériences de croissance avec comparaison, décision et apprentissage absent.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 32. ORDRE INITIAL D’ACQUISITION

PDF p. 9 · **Non vérifié** · P3

Ordre propriétaires → artisans → agences consigné comme hypothèse ; validation terrain de cette séquence non mesurée.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 33. ACQUISITION DES PROPRIÉTAIRES

PDF p. 9 · **Partiel** · P3

Inscription, contenu et parrainage présents ; attribution impressions → revenus/rétention et CAC/LTV non complète.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`; `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`.

### 34. ACQUISITION DES ARTISANS

PDF p. 9 · **Partiel** · P3

Réseau et métiers présents ; acquisition pilotée par capacité réelle et métriques locales à compléter.

Éléments : `app/src/app/artisan`; `app/src/app/agence/[orgId]/artisans`; `app/tests/sprint7-artisans.test.ts`; `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 35. ACQUISITION DES AGENCES

PDF p. 9 · **Partiel** · P2

Import, équipe, portefeuilles et reporting présents ; acquisition/activation/rétention/support des agences non mesurés complètement.

Éléments : `app/src/app/agence/[orgId]`; `app/src/lib/import-parc.ts`; `app/tests/import-parc.test.ts`; `app/tests/portefeuille-lecture.test.ts`; `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 36. OBJECTIF ÉCONOMIQUE

PDF p. 9 · **Partiel** · P3

Abonnements implémentés ; coûts infrastructure/IA/support, marge, CAC/LTV et payback non consolidés.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 37. CROISSANCE GÉOGRAPHIQUE

PDF p. 11 · **Partiel** · P3

Empreinte et recommandation départementale présentes ; protocole pilote → ville, rentabilité et transitions territoriales non complet.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 38. GERIMMO EXPANSION SCORE ET CARTE DE FRANCE

PDF p. 11 · **Partiel** · P3

Carte/empreinte et score pondéré présents ; pas les sept statuts ni toutes métriques. Une donnée absente compte zéro dans le score, ce qui exige une meilleure qualification de l'incertitude.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 39. EFFET RÉSEAU GERIMMO

PDF p. 11 · **Non vérifié** · P3

Réseau théorique cohérent ; effet réel sur délais, qualité, densité et rétention non démontré.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`; `app/src/app/artisan`; `app/src/app/agence/[orgId]/artisans`; `app/tests/sprint7-artisans.test.ts`.

### 40. OBJECTIF NATIONAL — GERIMMO FRANCE

PDF p. 12 · **Partiel** · P3

Premiers outils territoriaux ; progression nationale et rentabilité réelles non démontrées. Pas d'expansion internationale engagée dans cet audit.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`; `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 41. SCALABILITÉ

PDF p. 14 · **Partiel** · P2

Pagination et tâches disponibles ; tests de charge, goulets mesurés, files et capacité cible non documentés par preuves récentes.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`.

### 42. KILL SWITCH ET ROLLBACK

PDF p. 14 · **Partiel** · P2

Retour arrière Git possible ; pas de kill switch central pour fonctionnalités, expériences, campagnes et moteurs identifié.

Éléments : `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 43. CONFORMITÉ ET DROIT FRANÇAIS

PDF p. 14 · **Partiel** · P0

Conservation et pages présentes, identité éditeur encore vide. Revue juridique et configuration des sous-traitants non attestées ; aucune certification de conformité.

Éléments : `app/src/lib/editeur.ts`; `app/src/app/confidentialite/page.tsx`; `wiki/regles-metier/RGPD.md`; `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`.

### 44. TRANSPARENCE

PDF p. 14 · **Partiel** · P1

Valeurs manquantes signalées dans plusieurs modules ; score territorial transforme encore des valeurs inconnues en zéro, sans confiance agrégée explicite.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`.

### 45. RÔLE PERMANENT DE CODEX

PDF p. 14 · **Partiel** · P3

Capteurs et support existants ; supervision permanente et boucle de maintenance autorisée non configurées de bout en bout.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 46. DÉFINITION DE « GERIMMO AUTONOME »

PDF p. 15 · **Partiel** · P3

Autonomie partielle des tâches métier ; système complet d'apprentissage et d'action contrôlée absent.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 47. ORDRE D’EXÉCUTION IMMÉDIAT POUR CODEX

PDF p. 15 · **Consigne appliquée à ce lot** · P1

Audit et plan V1 avant développement avancé ; corrections du lot limitées au périmètre et aux défauts vérifiables.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`; `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 48. PRINCIPE DIRECTEUR

PDF p. 18 · **Consigne appliquée à ce lot** · P1

Priorité à la gestion locative ; pas de reconstruction ni de moteur de croissance développé au détriment de la V1 dans ce lot.

Éléments : `app/src/app/agence/[orgId]`; `app/src/lib/import-parc.ts`; `app/tests/import-parc.test.ts`; `app/tests/portefeuille-lecture.test.ts`.

### 49. GERIMMO BRAIN

PDF p. 18 · **Absent identifié** · P3

Pas de couche Brain intégrant signaux produit, business, territoires, conformité et tâches traçables identifiée.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 50. MOTEUR PROPRIÉTAIRE BAILLEUR

PDF p. 18 · **Partiel** · P1

Espace propriétaire et priorités présents ; parcours complet propriétaire autonome et propriétaire géré à valider séparément.

Éléments : `app/src/app/agence/[orgId]/accueil-proprietaire.tsx`; `app/src/lib/navigation-espace.ts`; `app/tests/navigation-espace.test.ts`; `app/src/app/actions/loyers.ts`; `app/src/lib/quittancement-du-mois.ts`; `app/tests/cycle-mensuel.test.ts`; `app/tests/cron-relances-route.test.ts`.

### 51. MOTEUR AGENCE IMMOBILIÈRE

PDF p. 18 · **Partiel** · P1

Structure, rôles, affectation, import et reporting présents ; traitements en masse et migration de portefeuille réel à éprouver.

Éléments : `app/src/app/agence/[orgId]`; `app/src/lib/import-parc.ts`; `app/tests/import-parc.test.ts`; `app/tests/portefeuille-lecture.test.ts`; `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`.

### 52. PORTAIL LOCATAIRE

PDF p. 18 · **Partiel** · P1

Portail, bail/documents, loyers, incidents et rendez-vous présents ; échanges et invitations réels restant à valider jusqu'au destinataire.

Éléments : `app/src/app/locataire`; `app/tests/mes-documents-locataire.test.ts`; `app/e2e/parcours-locataire.spec.ts`; `app/src/lib/incidents.ts`; `app/src/app/locataire/[orgId]/reflexes-urgence.tsx`; `app/tests/sprint7-locataire-intervention.test.ts`; `app/tests/sprint7-artisans.test.ts`; `app/src/lib/messagerie.ts`; `app/src/app/agence/[orgId]/messages`; `app/src/lib/email.ts`; `app/supabase/templates`.

### 53. MOTEUR DOCUMENTAIRE

PDF p. 18 · **Partiel** · P1

GED, types, rattachements, versions et pièces demandées présents ; transitions de tous statuts et provenance à recetter intégralement.

Éléments : `app/src/lib/documents`; `app/src/app/actions/documents-generes.ts`; `app/tests/catalogue-conformite-v3.test.ts`; `app/tests/catalogue-api.test.ts`.

### 54. GÉNÉRATION DE DOCUMENTS

PDF p. 19 · **Partiel** · P1

Génération et archivage présents ; prévisualisation/signature/distribution selon chaque document à valider. Yousign non identifié comme intégration opérationnelle.

Éléments : `app/src/lib/documents`; `app/src/app/actions/documents-generes.ts`; `app/tests/catalogue-conformite-v3.test.ts`; `app/tests/catalogue-api.test.ts`.

### 55. MOTEUR LOYERS, CHARGES ET IMPAYÉS

PDF p. 19 · **Partiel** · P1

Chronologie et contrôles SQL présents ; doubles actions, états incohérents et erreurs à compléter par les parcours navigateur réels.

Éléments : `app/src/app/actions/loyers.ts`; `app/src/lib/quittancement-du-mois.ts`; `app/tests/cycle-mensuel.test.ts`; `app/tests/cron-relances-route.test.ts`.

### 56. MOTEUR INCIDENTS

PDF p. 19 · **Partiel** · P1

Objet incident riche et transitions présentes ; chaîne complète et historique à vérifier pour chaque rôle et erreur.

Éléments : `app/src/lib/incidents.ts`; `app/src/app/locataire/[orgId]/reflexes-urgence.tsx`; `app/tests/sprint7-locataire-intervention.test.ts`; `app/tests/sprint7-artisans.test.ts`.

### 57. RÉSEAU ARTISANS

PDF p. 19 · **Partiel** · P1

Missions, pièces professionnelles, disponibilités et retours présents ; matching/couverture locale complète non démontrés.

Éléments : `app/src/app/artisan`; `app/src/app/agence/[orgId]/artisans`; `app/tests/sprint7-artisans.test.ts`.

### 58. DEVIS ET PRIX DE RÉFÉRENCE

PDF p. 19 · **Partiel** · P1

Devis déposés par artisans ; distinction systématique référence/estimation/devis et règles d'accès à recetter.

Éléments : `app/src/app/artisan`; `app/src/app/agence/[orgId]/artisans`; `app/tests/sprint7-artisans.test.ts`.

### 59. MESSAGERIE ET NOTIFICATIONS

PDF p. 19 · **Partiel** · P1

Messagerie et envois présents ; statuts de livraison réels, rebonds, doublons et bruit à valider avec prestataires.

Éléments : `app/src/lib/messagerie.ts`; `app/src/app/agence/[orgId]/messages`; `app/src/lib/email.ts`; `app/supabase/templates`.

### 60. AGENDA ET ALERTES

PDF p. 19 · **Partiel** · P1

Rendez-vous, échéances et alertes présents ; toutes les destinations et états de traitement à recetter.

Éléments : `app/src/lib/agenda-gestion.ts`; `app/src/lib/chemin-alerte.ts`; `app/tests/agenda-gestion.test.ts`; `app/tests/chemin-alerte.test.ts`.

### 61. COMPTABILITÉ ET FISCALITÉ

PDF p. 19 · **Partiel** · P1

Écritures, exports, synthèses et aide fiscale présentes ; complétude par régime et règles évolutives non certifiée.

Éléments : `app/src/lib/fiscal.ts`; `app/src/app/agence/[orgId]/comptabilite`; `app/src/lib/documents/modeles/facture-honoraires.ts`; `app/tests/facture-honoraires-base.test.ts`.

### 62. RECHERCHE GLOBALE

PDF p. 20 · **Partiel** · P2

Recherche actuelle : logements, personnes et baux. Documents, incidents, artisans, paiements et agences ne figurent pas dans cette recherche globale.

Éléments : `app/src/app/actions/recherche-espace.ts`; `app/src/components/recherche-espace.tsx`; `app/tests/recherche-espace.test.ts`.

### 63. AUDIT LOG

PDF p. 20 · **Partiel** · P1

Audit/tech log présents ; exhaustivité qui/quoi/avant/après/origine/contexte/résultat pour toutes actions non démontrée.

Éléments : `app/src/app/admin/journaux`; `app/src/lib/tache.ts`; `app/src/lib/retours.ts`.

### 64. SUPER ADMIN — ULTIMATE CONTROL CENTER

PDF p. 20 · **Partiel** · P3

Gestion/support et supervision présents ; flags, décisions niveau 3, métriques business, études, rollback centralisés manquent.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`; `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`.

### 65. SÉCURITÉ DU SUPER ADMIN

PDF p. 20 · **Partiel** · P0

MFA obligatoire supervision et tests d'isolation présents ; récupération, réauthentification de toutes actions critiques et alertes sensibles à éprouver.

Éléments : `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`.

### 66. GERIMMO SUPPORT

PDF p. 20 · **Partiel** · P2

Classification, réponse, regroupement et suivi présents ; suggestion, création automatique de tâches et mesures délais/satisfaction incomplètes.

Éléments : `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 67. OBSERVABILITÉ

PDF p. 20 · **Partiel** · P1

Santé, logs et dernières tâches présents ; latence, files, erreurs par version et surveillance réelle de chaque service à compléter.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`.

### 68. AUTO-DIAGNOSTIC

PDF p. 20 · **Partiel** · P2

Signaux et erreurs centralisés partiellement ; corrélation automatique, reproduction et hypothèses avec preuves non complètes.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 69. AUTO-AMÉLIORATION

PDF p. 20 · **Partiel** · P2

Corrections tracées ; métrique initiale, population, coût/risque et mesure après changement pas systématisés.

Éléments : `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`.

### 70. GROWTH CENTER

PDF p. 21 · **Absent identifié** · P3

Pas de Growth Center comparant canaux, coût et résultats réels identifié.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`; `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`.

### 71. RÉSEAUX SOCIAUX

PDF p. 21 · **Partiel** · P3

Propositions et publications du journal présentes ; calendrier multi-réseaux, API officielles et attribution non identifiés.

Éléments : `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`.

### 72. FACEBOOK / INSTAGRAM

PDF p. 21 · **Absent identifié** · P3

Pas de comparateur d'expériences Facebook/Instagram avec portée, leads, CAC/LTV et rétention identifié.

Éléments : `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`.

### 73. SEO ET CONTENU

PDF p. 21 · **Partiel** · P2

Journal et contenu utile présents ; attribution trafic qualifié → activation → revenus à développer et mesurer.

Éléments : `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`.

### 74. MONÉTISATION

PDF p. 21 · **Partiel** · P3

Abonnements présents ; études de monétisation tracées non complètes. Aucun changement de prix ou paiement déclenché dans ce lot.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 75. ÉCONOMIE UNITAIRE

PDF p. 21 · **Absent identifié** · P3

Pas de tableau consolidant marge, CAC/LTV, coûts support/infra/IA et payback par segment identifié.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 76. OBJECTIF FINANCIER

PDF p. 21 · **Non vérifié** · P3

Objectif économique adopté ; amélioration durable de marge/rétention et coûts non démontrée par données réelles.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 77. EXPANSION VILLE PAR VILLE

PDF p. 21 · **Partiel** · P3

Départements et marché présents ; états et critères d'activation ville par ville avec capacité artisan et économie incomplets.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 78. PLAYBOOK D’OUVERTURE D’UNE VILLE

PDF p. 22 · **Absent identifié** · P3

Pas de playbook applicatif d'ouverture de ville avec les dix étapes et décisions justifiées identifié.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 79. RÉPLICATION NATIONALE

PDF p. 22 · **Non vérifié** · P3

Aucun playbook gagnant répliqué avec comparabilité locale démontrée.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 80. SCALABILITÉ ÉCONOMIQUE ET OPÉRATIONNELLE

PDF p. 22 · **Partiel** · P2

Automatismes récurrents présents ; ratio croissance/charge humaine et coût des exceptions non mesurés.

Éléments : `app/src/app/actions/loyers.ts`; `app/src/lib/quittancement-du-mois.ts`; `app/tests/cycle-mensuel.test.ts`; `app/tests/cron-relances-route.test.ts`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`.

### 81. ARCHITECTURE ÉVOLUTIVE

PDF p. 22 · **Partiel** · P2

Tâches, limites, stockage et certains traitements idempotents présents ; charge, files et restauration bout en bout non prouvées.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`; `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `wiki/regles-metier/Plan de reprise d'activité.md`; `app/src/lib/edl-brouillon.ts`; `app/tests/edl-brouillon.test.ts`.

### 82. FEATURE FLAGS ET EXPÉRIMENTATION

PDF p. 22 · **Absent identifié** · P3

Pas de registre de flags/expériences par population/territoire avec métriques avant/après et décision identifié.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`.

### 83. QUALITÉ DES DONNÉES

PDF p. 22 · **Partiel** · P1

Contraintes et valeurs manquantes présentes ; métriques globales de qualité, déduplication et provenance complète à compléter.

Éléments : `app/src/lib/documents`; `app/src/app/actions/documents-generes.ts`; `app/tests/catalogue-conformite-v3.test.ts`; `app/tests/catalogue-api.test.ts`; `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`; `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 84. IA ET TRAÇABILITÉ

PDF p. 22 · **Partiel** · P2

Propositions éditoriales traçables partiellement ; registre commun des objectifs/données/version/confiance/action/validation pour IA non complet.

Éléments : `app/src/app/admin/publications`; `app/src/app/journal`; `app/tests/publications.test.ts`; `app/src/app/admin/journaux`; `app/src/lib/tache.ts`; `app/src/lib/retours.ts`.

### 85. VIE PRIVÉE PAR CONCEPTION

PDF p. 22 · **Partiel** · P0

RLS, conservation, export et anonymisation présents ; exercice des droits et sous-traitants réels à valider.

Éléments : `app/src/lib/editeur.ts`; `app/src/app/confidentialite/page.tsx`; `wiki/regles-metier/RGPD.md`; `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`.

### 86. RÉSILIENCE

PDF p. 23 · **Partiel** · P0

PRA et brouillons hors ligne présents ; restauration réelle, rollback opérationnel et communication incident non éprouvés dans cet audit.

Éléments : `wiki/regles-metier/Plan de reprise d'activité.md`; `app/src/lib/edl-brouillon.ts`; `app/tests/edl-brouillon.test.ts`; `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 87. TABLEAU « HUMAIN REQUIS »

PDF p. 23 · **Absent identifié** · P2

Pas de tableau de décisions bloquées réunissant urgence, données, options, conséquences d'attendre et action attendue identifié.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 88. AUTONOMIE RÉELLE MAIS CONTRÔLÉE

PDF p. 23 · **Partiel** · P2

Garde-fous appliqués au travail et aux accès ; entreprise numérique autonome contrôlée non complète.

Éléments : `app/src/lib/mfa.ts`; `app/src/lib/session-policy.ts`; `app/tests/mfa-base.test.ts`; `app/tests/signature-supervision-base.test.ts`; `app/tests/aucune-fonction-ouverte-a-anon.test.ts`; `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 89. GERIMMO WATCH

PDF p. 23 · **Partiel** · P2

Santé et journaux amorcent Watch ; corrélation transverse technique/sécurité/business et liaison aux autres moteurs absentes.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 90. GERIMMO DEV

PDF p. 23 · **Partiel** · P2

Bugs/retours et GitHub présents ; backlog applicatif unifié et priorisé depuis toutes sources manquant.

Éléments : `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`; `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.

### 91. GERIMMO LAB

PDF p. 23 · **Absent identifié** · P3

Pas de Lab centralisant hypothèse, protocole, population, durée, métriques et apprentissage identifié.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 92. GERIMMO EXPANSION

PDF p. 23 · **Partiel** · P3

Empreinte et recommandation existent ; études, playbooks, couverture et décisions d'ouverture restent incomplets.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 93. GERIMMO GROWTH

PDF p. 23 · **Absent identifié** · P3

Pas de moteur unifié d'acquisition/activation/rétention/revenus/attribution et expériences identifié.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 94. INTERACTION ENTRE LES MOTEURS

PDF p. 23 · **Absent identifié** · P3

Les briques existantes ne forment pas la chaîne Watch → Brain → Lab → Dev → Growth → Expansion contrôlée décrite.

Éléments : `app/src/lib/sante-service.ts`; `app/src/lib/tache.ts`; `app/src/app/api/sante/route.ts`; `app/tests/sante-service.test.ts`; `app/tests/sante-route.test.ts`; `app/src/lib/retours.ts`; `app/src/app/admin/retours`; `app/src/app/assistance`; `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 95. PRIORITÉ AUX VRAIS UTILISATEURS

PDF p. 24 · **Consigne appliquée à ce lot** · P1

Priorité V1 et problèmes réels maintenue ; acquisition de vrais utilisateurs encore à constater.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`.

### 96. DEFINITION OF DONE — PRODUIT MATURE

PDF p. 24 · **Non vérifié** · P1

Critères produit mature non atteints par les preuves réunies ; ne pas confondre existence du code et exploitation complète.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`; `app/src/lib/espace.ts`; `app/src/lib/portefeuille.ts`; `app/tests/rpc-etancheite-inter-agences.test.ts`; `app/tests/api-isolation.test.ts`.

### 97. DEFINITION OF DONE — CROISSANCE

PDF p. 24 · **Non vérifié** · P3

Activation, rétention, marge, satisfaction et coût maîtrisé non démontrés ; nombre d'inscrits insuffisant comme preuve.

Éléments : `app/src/lib/stripe.ts`; `app/src/lib/parrainage.ts`; `app/src/app/api/stripe/webhook/route.ts`; `app/tests/stripe-webhook-route.test.ts`.

### 98. DEFINITION OF DONE — EXPANSION

PDF p. 24 · **Non vérifié** · P3

Empreinte administrative ne prouve pas service actif ni couverture nationale ; utilisateurs/capacité/économie à mesurer.

Éléments : `app/src/lib/territoire.ts`; `app/src/lib/score-territoire.ts`; `app/src/lib/porte-sante.ts`; `app/src/app/api/cron/territoire/route.ts`; `app/tests/score-territoire.test.ts`.

### 99. RAPPORT FONDATEUR STRATÉGIQUE

PDF p. 24 · **Absent identifié** · P3

Pas de rapport fondateur périodique réunissant santé, marge, acquisition, Codex, expériences, concurrence et décisions identifié.

Éléments : `app/src/app/admin/page.tsx`; `app/src/app/admin/clients`; `app/src/app/admin/territoire`; `app/src/app/admin/sante/page.tsx`.

### 100. ORDRE DE MISSION FINAL

PDF p. 25 · **Consigne appliquée à ce lot** · P1

Séquence V1 → preuve → production → instrumentation → acquisition → croissance progressive appliquée au présent travail.

Éléments : `app/package.json`; `app/src/app`; `app/supabase/migrations`; `app/e2e/local/ordre-migrations.txt`; `.github/workflows/ci.yml`; `.github/workflows/migrations.yml`; `app/vercel.json`.


## Recette observée dans ce lot

- Neuf rubriques de navigation agence ouvertes avec leur contenu : tableau de bord, parc, personnes, loyers, incidents, comptabilité, alertes, messages, paramètres. Cela valide leur ouverture, pas tous leurs boutons.
- Parcours API fictif : bien, lot, propriétaire, mandat, diagnostics, bail activé, EDL, appel et paiement partiel, incident, artisan, devis retenu, mission acceptée et trois créneaux proposés.
- Au navigateur : encaissement fictif des 400 euros restants, total 700 euros, solde zéro, quittance accessible et historique des deux encaissements sur le bail. Aucun transfert d'argent.
- Catalogue : 54 modèles générables après retrait du bon de visite (la facture d'honoraires avait été ajoutée sur main avant ce lot), recherche « attestation » : quatre résultats ; un seul bail actif proposé.
- Attestation produite et archivée, champs manquants signalés ; destinataire et dossier restent sélectionnés après succès. Choisir le dossier vide désactive la génération.
- Tableau de bord : la tuile des loyers mène désormais à la rubrique Loyers & charges.

Les décisions de facturation, les courriers réels, les contrats réels, les droits critiques et la production de données métier n'ont pas été modifiés pour cette recette.

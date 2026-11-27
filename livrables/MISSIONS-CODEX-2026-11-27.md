# Missions pour Codex — suites de l'audit produit du 27/11/2026

Préparées par Claude à la demande du dirigeant (« donne le maximum de mission à codex »), à partir de la synthèse de
l'audit de Codex. Le rapport complet (33 constats AUD-001 à AUD-033) est sur la branche `codex/audit-produit-20261127`,
commit `fcd4179417`, fichier `livrables/audit-produit-20261127/RAPPORT.md`. Chaque mission cite les constats qu'elle traite ;
les missions 9 à 12 couvrent ceux que le rapport laissait « hors missions ».

**Mode d'emploi.** Envoyez à Codex **une mission par conversation**, en collant chaque fois le bloc « Règles communes »
puis la mission. Les missions 1 à 4 et 6 à 12 portent sur des parties différentes du code et peuvent tourner en même temps ; la mission 5 (composants partagés) passe en dernier. La
mission 0 passe en premier, car elle publie le rapport pour que Claude puisse le relire.

Chaque mission se termine par une PR. **Rien n'est fusionné ni mis en ligne sans votre accord écrit.** Claude relit
chaque PR avant fusion : une relecture pour l'affichage, deux pour l'argent, le juridique et la sécurité.

---

## Règles communes (à coller en tête de chaque mission)

```
RÈGLES COMMUNES — à respecter strictement

Dépôt GERIMMO/GERIMMO_V4. Pars de origin/main à jour (77e33d7 ou plus récent). Gerimmo est en vente depuis le 27/11/2026 : de vrais clients peuvent s'inscrire.

À lire avant de coder : app/AGENTS.md (exigences durables d'audit produit), app/CLAUDE.md, CLAUDE.md, wiki/Accueil.md, wiki/syntheses/Vision de l'écosystème Gerimmo.md, wiki/syntheses/Passation — état du 26 novembre 2026.md, et ton rapport détaillé (livrables/audit-produit-20261127/RAPPORT.md sur ta branche codex/audit-produit-20261127).

Branche : codex/<nom-de-la-mission>-20261127, une seule PR vers main par mission. Tu ne fusionnes jamais, tu ne publies jamais, tu ne lances aucune migration en production. Le dirigeant donne son accord écrit ; Claude relit la PR avant fusion.

Méthode pour chaque défaut :
1. le reproduire par un test qui échoue ;
2. corriger la cause ;
3. faire passer le test ;
4. lancer npm run lint, npx next typegen puis npm run typecheck, npx vitest run, et les parcours e2e concernés (npx playwright test --trace off ...) ;
5. obtenir une CI GitHub verte sans reprise sur la tête de la PR.

Ne désactive, ne saute et ne mets jamais de côté un test pour obtenir du vert.

Migrations : seulement si c'est indispensable. Chaque migration a un fichier de retour arrière dans app/supabase/retours-arriere/ et une ligne dans app/e2e/local/ordre-migrations.txt. Jamais d'outil MCP Supabase en écriture.

Production : lecture seule. Aucun paiement, e-mail, SMS, signature ni recommandé réel. Écris uniquement avec des comptes et des données fictifs, sur le banc local.

Juridique : rien n'est « conforme » sans le texte officiel lu (Légifrance, service-public.fr), cité avec son lien et sa date de lecture. Sinon, écris « à vérifier ».

Code :
- les liens d'espace passent par useBaseEspace, baseEspace ou racineEspace (décision D27, test racine-pages-espace) ;
- aucune isolation (RLS) n'est affaiblie ;
- l'interface est en français simple ;
- les messages de commit sont en français.

Choix par délégation : tu tranches seul les choix d'affichage sans enjeu juridique ni d'argent, et tu les listes dans la PR. Pour tout autre choix, applique l'option la plus prudente et réversible, puis pose la question au dirigeant en une phrase dans la PR.

Ne modifie pas les fichiers qu'une autre mission en cours possède (voir « Périmètre » de chaque mission). En cas de doute, demande.

PR : un titre en français. Une description en quatre parties : pourquoi (le constat de l'audit), ce qui change, les tests (avec un test qui échouait avant la correction), les limites et ce qui n'a pas été vérifié. Ajoute des captures à 390, 768 et 1440 px pour tout changement d'écran.
```

---

## Mission 0 — Publier le rapport d'audit (à faire en premier, 5 minutes)

```
MISSION 0 — Publier le rapport d'audit.

Pousse ta branche codex/audit-produit-20261127 sur GitHub, sans PR. Garde le rapport RAPPORT.md, le registre couverture-ecrans.csv et les preuves texte. Pour les 699 captures, pousse seulement celles que cite le rapport, ou une archive de moins de 50 Mo.

Ajoute en tête du rapport un tableau de tous les constats, avec un identifiant stable (AUD-001, AUD-002…), l'espace, la gravité (bloquant / important / mineur) et la mission ci-dessous qui le traite (1 à 8). Les missions suivantes s'y réfèrent par ces identifiants.
```

## Mission 1 — Finances : des montants qu'on n'a pas à interpréter (AUD-008, AUD-009, AUD-010)

```
MISSION 1 — Finances et documents du propriétaire. Constats de ton rapport : AUD-008, AUD-009, AUD-010.

Constat de l'audit : le client se demande « quel loyer ai-je reçu ? ».

À faire :
1. Dans le suivi des loyers, sur le tableau de bord et dans la fiche du bail, séparer clairement trois montants pour chaque échéance et pour chaque total :
   - « Reçu » : les encaissements réels ;
   - « Compensé » : les avoirs, le dépôt de garantie imputé, les régularisations ;
   - « Reste dû ».
   Le même chiffre doit être affiché partout, avec la même définition. Une seule source de calcul, testée, sans recalcul différent écran par écran.
2. Rendre le filtre SCI (sélection du détenteur ou de l'espace) entièrement lisible et utilisable à 390 px : libellés complets, cible de 44 px, pas de débordement horizontal.
3. Vérifier que les totaux sont cohérents entre l'écran, le PDF et l'export CSV, et ajouter un test qui le prouve.

4. AUD-010 : sur l'accueil du propriétaire, nommer les unités du compteur et du lien (« 30 tâches dans vos logements », « Voir 15 autres tâches »).
5. AUD-009 : un accès « D'où vient ce total ? » depuis chaque total, vers les règlements et pièces qui le composent.

Périmètre : écrans loyers, Finances, tableau de bord, bail (onglet loyers), filtre de détenteur, fonctions de calcul des montants. Pas la quittance ni les règles CAF (mission 2).

Critère de réussite : sur un bail avec un loyer de 640 €, un paiement partiel et un avoir, les trois montants sont identiques sur les trois écrans et dans le PDF, à 390 et 1440 px.
```

## Mission 2 — CAF et APL : la quittance juste et les règles du 1er janvier 2027 (AUD-007, AUD-012)

```
MISSION 2 — Aides au logement (CAF, APL en tiers payant). Constats de ton rapport : AUD-007, AUD-012 (cas chiffré : terme de 600 €, 390 € locataire et 210 € CAF). Mission juridique et d'argent : double relecture.

Constat de l'audit : la quittance attribue au locataire un versement de la CAF.

À faire :
1. Lire les textes officiels et les citer dans la PR :
   - loi n° 89-462 du 6 juillet 1989, art. 21 (quittance, détail des sommes) ;
   - code de la construction et de l'habitation, articles sur le versement de l'aide au bailleur (tiers payant) et le signalement de l'impayé ;
   - décret n° 2026-84 du 12/02/2026, nouvelles règles au 01/01/2027.
   Le registre QUESTIONS.md, à Q124, attend justement de séparer la part du locataire et celle de la CAF.
2. Quittance et reçu :
   - distinguer la part payée par le locataire de l'aide versée par la CAF (« dont aide au logement versée par la CAF : … ») ;
   - ne jamais présenter l'aide comme un paiement du locataire ;
   - faire de même dans « Mes paiements » du locataire et dans l'attestation de loyer.
3. Règles du 01/01/2027 :
   - mettre en œuvre, datées et testées, les nouvelles règles du seuil et du délai de signalement d'un impayé quand l'aide est versée au bailleur ;
   - alerte au propriétaire, avec ce qu'il doit faire et avant quelle date ;
   - les deux régimes, avant et après le 01/01/2027, doivent être testés.
4. Ne rien envoyer à la CAF : Gerimmo prépare, le propriétaire déclare.

Périmètre : quittance et reçu, attestation de loyer, « Mes paiements » du locataire, encaissements d'origine CAF, alertes d'impayé avec aide.

Si un point de droit reste incertain, prends l'option la plus prudente, écris « à vérifier » et pose la question dans la PR.
```

## Mission 3 — Inscription, tarifs et essai sans issue (AUD-002, AUD-003, AUD-004, AUD-006)

```
MISSION 3 — Inscription et abonnement. Constats de ton rapport : AUD-002, AUD-003, AUD-004, AUD-006.

Constats de l'audit :
- le bouton d'inscription est trop bas ;
- la page Tarifs n'est pas à jour ;
- un propriétaire dont l'essai expire avant la création de son premier bien n'a plus d'issue. L'écriture est fermée, il ne peut pas ajouter de bien, et il ne peut pas payer puisqu'il n'a aucun bien.

À faire :
1. Remonter l'appel à s'inscrire : visible sans défiler sur l'accueil et sur les Tarifs, à 390 px.
2. Aligner la page Tarifs sur la grille du code (app/src/lib/tarifs.ts, abonnement unique du 11/11) :
   - 5,99 € pour le premier bien, puis 1,99 € par bien jusqu'à 7, 19,90 € de 8 à 20, et 0,99 € par bien au-delà ;
   - l'annuel vaut 10 mois ;
   - un essai de 2 mois, sans carte ;
   - aucune ancienne formule (Solo, Bailleur, Investisseur, Patrimoine) ni « offre de lancement ».
   Un test doit comparer les montants affichés à tarifs.ts.
3. Essai expiré sans bien (AUD-003) : une **reprise bornée**, comme ton rapport le recommande.
   - La page « Abonnement » propose « Rouvrir mon espace 7 jours pour ajouter mon premier bien ».
   - Le geste n'est possible qu'une fois par organisation. Il est tracé et la console du dirigeant le voit.
   - Une fois le bien créé, la souscription normale s'affiche.
   - La souscription à zéro bien reste refusée.
   - Le test doit créer un premier bien après ce geste, puis souscrire.
   Décision du dirigeant, qui vous envoie cette mission. Les 7 jours offerts sont un geste commercial borné : aucun nouveau prix n'est créé.
4. AUD-002 : la page Tarifs dit l'état réel (vente ouverte, chemin « Mon abonnement »), avec un exemple à 1, 2 et 8 biens, le montant réellement prélevé et sa date.
5. AUD-006 : une saisie exacte du nombre de biens à côté du curseur. Vérifier six quantités, au tarif mensuel et annuel.
6. AUD-004 : le bouton « Ouvrir mon espace » entièrement visible à 390 × 844 sans défiler.
7. Vérifier le parcours complet d'un nouvel inscrit sur téléphone (390 px) : inscription, premier bien, abonnement.

Périmètre : site public (accueil, Tarifs, inscription) et page « Abonnement » (app/src/app/agence/[orgId]/abonnement/).

Ne touche pas aux réglages de vente (médiateur, ouverture des souscriptions). La vente sans médiateur est une décision du dirigeant, prise le 26/11 et datée en base ; le risque juridique est déjà connu.
```

## Mission 4 — Travaux et facturation artisan : qui doit agir, et quoi payer (AUD-011, AUD-015, AUD-017, AUD-018, AUD-019)

```
MISSION 4 — Incidents, devis, interventions et factures d'artisan. Constats de ton rapport : AUD-011, AUD-015, AUD-017, AUD-018, AUD-019.

Constat de l'audit : « Qui doit agir sur cet incident ? Cette facture est-elle à régler maintenant ? »

À faire :
1. En tête de chaque dossier d'incident, pour le propriétaire, le locataire et l'artisan, un bandeau « Prochaine action : … — à faire par : … (date) ».
   - Il est calculé à partir de l'état de l'incident et de la mission.
   - Il utilise une seule fonction, testée pour chacun des 7 états de l'incident et chaque état de mission.
2. Facture d'artisan préremplie depuis le devis retenu : lignes, montants, TVA, référence du dossier.
   - L'artisan peut ajuster ses lignes, mais il voit l'écart par rapport au devis.
3. Dans l'espace artisan et chez le propriétaire, séparer deux choses :
   - « À recevoir » : les factures validées par le propriétaire et non réglées ;
   - « En attente de validation » : les factures déposées, pas encore acceptées.
   Ne pas les additionner.
4. Garder le parcours à trois (locataire, propriétaire, artisan) intact, en nom propre et en SCI. Un test e2e doit le jouer de la déclaration à la clôture.

Périmètre : écrans et fonctions des incidents, devis, interventions et factures d'artisan (app/src/app/agence/[orgId]/incidents/, app/src/app/artisan/, lib associées).

5. AUD-011 : une ligne « 4 interventions à noter », avec la liste secondaire par adresse.
6. AUD-015 : chez le locataire, un seul endroit pour choisir le rendez-vous, avec en tête « qui doit répondre ».
7. AUD-019 : dans l'agenda de l'artisan, « proposé · à garder libre » lu dans la journée, et un filtre « À organiser ».

Le règlement reste déclaratif : aucun paiement ne passe par Gerimmo.
```

## Mission 5 — Visuel, accessibilité et menus (AUD-021, AUD-023, AUD-026, AUD-027, AUD-028, AUD-032)

```
MISSION 5 — Cohérence visuelle et accessibilité. Constats de ton rapport : AUD-021, AUD-023, AUD-026, AUD-027, AUD-028, AUD-032.

À faire :
1. Corriger la touche Échap : elle doit fermer le menu de supervision à 390 et 768 px, puis rendre le focus au bouton qui l'a ouvert. Faire de même pour tous les menus et volets (test clavier e2e).
2. Harmoniser les boutons (principal, secondaire, danger), les alertes (information, attention, erreur) et les menus, sur le design system « Maison » (wiki/syntheses/Design system Gerimmo.md, app/src/app/prestige.css et systeme.css) :
   - une seule variante par usage, avec des jetons et non des valeurs écrites en dur ;
   - garder l'identité actuelle.
3. Vérifier la réduction des animations (prefers-reduced-motion) sur toutes les transitions, pas seulement sur celles qui sont contrôlées.
4. Couleur or : le code utilise #D5B777 et la charte du logo #D3B677 (11 écarts relevés dans le Design system). Ne change pas les couleurs du logo. Liste les écarts restants pour le dirigeant.

Périmètre : composants partagés (app/src/components/ui/, menus, volets), feuilles de style.

Ne modifie pas les écrans des missions 1 à 4 au-delà du composant partagé. Fais cette mission après elles, ou en dernier si des conflits apparaissent.
```

## Mission 6 — La démonstration pour un prospect (AUD-005)

```
MISSION 6 — Démonstration du parcours à trois (locataire, bailleur, artisan). Constat de ton rapport : AUD-005.

L'audit le désigne comme l'avantage à mettre en avant.

À faire, SANS écrire en production :
1. Un scénario de démonstration de 5 minutes, sur le banc local avec des données fictives :
   - le locataire déclare une fuite avec photo ;
   - le propriétaire reçoit l'alerte et sollicite un artisan ;
   - l'artisan propose un devis et des créneaux ;
   - le locataire choisit un créneau ;
   - l'artisan fait son compte rendu et sa facture ;
   - le propriétaire valide ;
   - le tout est classé pour la déclaration 2044.
2. Un script reproductible (Playwright) qui joue la démonstration et produit des captures nettes à 390 et 1440 px, plus une courte vidéo si l'outil le permet.
3. Un document livrables/DEMO-PARCOURS-A-TROIS.md en français simple, que le dirigeant peut montrer à un prospect : les étapes, les captures, et ce que chaque acteur gagne.

Aucune donnée réelle, aucun nom de vrai client.
```

## Mission 7 — Sécurité des secrets et restauration (AUD-022)

```
MISSION 7 — Isoler les secrets de la base (réserve N10 de la passation, section d.2) et prouver la restauration. Constat de ton rapport : AUD-022. Mission de sécurité : double relecture.

Constat :
- SUPABASE_DB_PASSWORD et SUPABASE_SERVICE_ROLE_KEY sont des secrets de dépôt, lus par migrations.yml, sauvegarde.yml et recette-production-autonome.yml ;
- la sauvegarde n'a ni restriction de branche ni environnement.

À faire :
1. Préparer les workflows pour qu'ils lisent ces secrets depuis un environnement GitHub dédié aux données, limité à main :
   - la sauvegarde nocturne ne doit pas attendre de clic : environnement sans approbateur ;
   - les migrations gardent gerimmo-production, avec approbation.
2. Écrire livrables/SECRETS-ENVIRONNEMENT-PAS-A-PAS.md pour le dirigeant, avec chaque clic dans GitHub et dans Supabase :
   - créer l'environnement et y mettre les secrets ;
   - faire tourner le mot de passe de la base dans Supabase et mettre à jour le secret le même jour ;
   - supprimer les secrets de dépôt ;
   - relire qui a accès en écriture au dépôt.
3. Tests : les contrôles de publication existants (node --test scripts/deploiement/*.test.mjs) restent verts. Ajoute un contrôle qui refuse un workflow lisant ces secrets hors de l'environnement prévu.

4. Préparer, sans l'exécuter en production, un exercice de restauration de la dernière sauvegarde (postérieure aux migrations du 25/11) vers une base isolée, avec un compte rendu qui prouve que les dossiers et fichiers redeviennent utilisables. Le dirigeant le lance lui-même.

Ne change aucun secret toi-même et n'en lis aucune valeur. La PR ne sera fusionnée qu'avec la date de bascule fixée par le dirigeant, car sauvegarde, recette et migrations échoueraient si les secrets n'étaient pas déplacés en même temps.
```

## Mission 8 — Préparer l'ouverture des e-mails automatiques et le premier prélèvement (AUD-020, AUD-024, AUD-029, AUD-030)

```
MISSION 8 — Préparer les gestes du dirigeant de décembre. Constats de ton rapport : AUD-020, AUD-024, AUD-029, AUD-030. Aucun code de vente n'est modifié.

Les gestes à préparer :
- les cinq envois automatiques (avis d'échéance, relances, rappels), décidés « ouvre-les » le 24/11, sont encore fermés (geste R5 : livrables/PLAN-DE-PUBLICATION.md, § 4) ;
- le premier débit réel après essai n'a jamais été vérifié (conseil COM-2).

À faire :
1. Lister, en lecture seule en production, les espaces de test à fermer avant le 24/12, et en garder UN pour le débit de fin décembre.
2. Écrire livrables/DECEMBRE-PAS-A-PAS.md, en français simple, avec les liens et les boutons exacts de la console. Il doit couvrir :
   - fermer les comptes de test (bilan, puis « Programmer la fermeture ») ;
   - ouvrir les cinq envois, un par un, avec le contrôle de la ligne « envoi_automatique » au journal ;
   - fin décembre, souscrire depuis l'espace de test gardé, dont l'essai est expiré : débit immédiat, puis rétractation et remboursement intégral, à vérifier dans Stripe et en base.
3. Vérifier dans le code que chaque envoi ne part qu'aux espaces qui ont donné leur accord. Ajoute un test s'il en manque un.

Tu ne fais aucun de ces gestes toi-même.
```

## Mission 9 — Les parcours incomplets du locataire (AUD-014, AUD-016)

```
MISSION 9 — Locataire : invitation, attente, départ. Constats de ton rapport : AUD-014, AUD-016.

À faire, sur un même dossier fictif, de bout en bout :
1. Un locataire invité qui n'a pas encore activé son compte. Le propriétaire voit « en attente de [nom] depuis le … » avec un geste de relance. Le locataire, à l'ouverture de l'invitation, voit une page d'attente claire si le bail n'est pas encore actif.
2. Après le départ du locataire, séparer les documents historiques (quittances, état des lieux, décompte), toujours consultables, des actions réservées à un occupant actif, qui disparaissent.
3. AUD-016 : sur l'accueil du locataire, faire remonter une seule action quand elle est urgente ou datée (paiement, rendez-vous). Dans « Contact », le gestionnaire et le bouton d'envoi passent avant les suggestions ; une identité de patrimoine (SCI) ne doit pas être prise pour une personne.
4. Les droits sont vérifiés côté serveur : un ancien locataire ne peut plus agir sur le bail. Ajoute un test.

Périmètre : espace locataire (app/src/app/locataire/), invitations de locataire. Pas les finances (mission 1) ni la quittance (mission 2).
```

## Mission 10 — Fiscalité et modèles de bail (AUD-013)

```
MISSION 10 — Aide fiscale et variantes de bail. Mission juridique : double relecture. Constat de ton rapport : AUD-013.

À faire :
1. Pour chaque ligne de l'aide à la déclaration 2044, afficher son détail de calcul et les pièces qui la justifient (factures, quittances, avis de taxe foncière), avec un lien vers chacune.
2. Terminer la comparaison des variantes de bail (nu, meublé, colocation) avec les contrats types du décret n° 2026-596 (en vigueur depuis le 01/10/2026). Lis le texte sur Légifrance et cite-le. Corrige les écarts, ou liste-les « à vérifier » si le texte est ambigu.
3. Des tests sur des dossiers réalistes : un bien nu en nom propre, un meublé, une SCI à l'IR.

Rien n'est déclaré « conforme » sans texte lu. Gerimmo reste une aide à la déclaration, pas un conseil fiscal.
```

## Mission 11 — La console du dirigeant : une décision par jour (AUD-024, AUD-025, AUD-020)

```
MISSION 11 — Console de direction. Constats de ton rapport : AUD-020 et AUD-024 (volet écran ; la mission 8 garde les preuves de livraison), AUD-025.

À faire :
1. « Aujourd'hui » et « Santé » : distinguer, pour chaque traitement, le dernier passage, le dernier succès, la preuve de livraison et l'échéance suivante. Chaque état renvoie au contrôle concerné ou au fournisseur, avec le geste de reprise autorisé.
2. « Développement commercial » : en tête, « Demandes à rappeler », « Échéance la plus proche » et « Suivi ». Les études territoriales passent dans une rubrique repliée. L'écran mobile doit tenir en moins de 2 500 px pour l'essentiel.
3. AUD-020 : dans le tableau de bord d'agence, présenter à l'endroit du geste les canaux réellement disponibles (quittances et relances sont distincts), sans bandeau contradictoire.

Périmètre : app/src/app/admin/ (Aujourd'hui, Santé, territoire) et l'accueil d'agence. Aucun réglage de production n'est modifié.
```

## Mission 12 — Import, export et couverture des pages (AUD-031, AUD-033)

```
MISSION 12 — Import et export de patrimoine, pages non couvertes. Constats de ton rapport : AUD-031, AUD-033.

À faire :
1. Import d'un parc étoffé : un tableur fictif de 100 biens avec des doublons. Aperçu, détection des doublons et édition avant validation. Mesure le temps et vérifie le résultat.
2. Export de fin de contrat : un dossier par logement, avec un index, le bail et ses annexes, l'historique et les justificatifs, en gardant les dates et les titulaires. Éprouve-le avec deux patrimoines (nom propre et SCI) et pendant un essai terminé.
3. Les neuf types de pages sans rendu positif dans ton balayage : pour chacune, établis s'il s'agit d'une redirection voulue, d'un état non essayé ou d'un défaut. Corrige les défauts. Ajoute les scénarios manquants : mandat retiré, tiers délégué, accès provisoire du superviseur, artisan refusé, ancien locataire.

Périmètre : import du parc (app/src/app/agence/[orgId]/parc/import/), export complet, tests de couverture.
```

---

**Ce qui reste au dirigeant** et qu'aucune mission ne peut faire :
- adhérer à un médiateur de la consommation (AUD-001, seul constat « bloquant ») : Codex recommande de suspendre la vente aux particuliers d'ici là. C'est votre décision ;
- tester sur de vrais téléphones (iPhone et Android) ;
- les clics d'approbation sur GitHub.

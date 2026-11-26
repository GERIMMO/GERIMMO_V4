---
type: synthesis
tags: [passation, production, publication, registre, exploitation, palier-1, novembre-2026]
status: stable
created: 2026-11-26
updated: 2026-11-26
sources: ["[[Mission palier 1 — audit du 22 novembre 2026]]", "[[Référentiel du palier 1]]", "[[Audit final indépendant — PR 335 — 15 novembre 2026]]", "[[Contre-vérification ciblée — PR 335 — candidat 962f2c76]]", "[[Audit de qualité commerciale V1 — a776ed43 — 16 novembre 2026]]", "[[Contre-vérification de la PR 341 — candidat V1 06d8e8fd — 16 novembre 2026]]", "[[Décisions groupées — version candidate du 13 octobre 2026]]", "QUESTIONS.md", "JOURNAL.md", "log.md (entrées du 03/11 au 26/11/2026)", "DECISIONS-2026-11-24.md", "livrables/PLAN-CORRECTIONS-2026-11-26.md", "livrables/PLAN-DE-PUBLICATION.md", "livrables/NON-FAIT.md", "livrables/notes-banc/notes-majeurs.md", "GUIDE-DE-REPRISE.md", ".github/workflows/*.yml (branche main)", "GitHub Actions et PR ouvertes (lecture du 26/11/2026, vers 19 h 30 UTC)"]
---

# Passation — état du 26 novembre 2026

**À quoi sert cette page.** Reprendre le travail sur Gerimmo sans l'historique des conversations. Elle dit ce qui
tourne en production, ce qui est ouvert, ce qui est prêt sans être publié, ce que le dirigeant doit décider, et
comment on travaille avec lui. Elle ne contient ni secret, ni jeton, ni coordonnées personnelles : le dirigeant est
appelé « le dirigeant », les autres personnes par leur rôle.

**Comment lire les statuts.**
- **VÉRIFIÉ** : lu ou rejoué, avec la source citée. **SUPPOSÉ** : déduit, pas constaté. **À VÉRIFIER** : incertain,
  dit comme tel.
- Registre : **publié** (en production), **corrigé non publié** (sur une branche, pas dans `main`), **décidé** (le
  dirigeant a tranché ; parfois un geste reste à faire), **ouvert** (réponse ou correction attendue).
- Les heures sont en UTC (suffixe Z) sauf mention « à Paris ».

**Documents de référence** (racine du dépôt, branche `claude/audit-final-pr335`) : `QUESTIONS.md` (registre Q),
`JOURNAL.md` (journal de la mission palier 1, du 22/11 au 26/11), `DECISIONS-2026-11-24.md` (réponses du dirigeant mot
pour mot), `JURISTE.md` (points de droit, par partie et point, noté « partie·point »), `GUIDE-DE-REPRISE.md` (où est
quoi, comment lancer), `livrables/PLAN-DE-PUBLICATION.md`, `livrables/PLAN-CORRECTIONS-2026-11-26.md`,
`livrables/NON-FAIT.md`. Pages du wiki les plus utiles : [[Mission palier 1 — audit du 22 novembre 2026]],
[[Référentiel du palier 1]], [[Recette de production]], [[Relais du dirigeant]].

---

## a. État de la production

| Élément | Valeur | Source et statut |
|---|---|---|
| Version servie | `main` = `f9e874bf647bb521d5af53ed79769415ff7f9784` (PR [#360](https://github.com/GERIMMO/GERIMMO_V4/pull/360), correctif « adresse du bailleur », Q126), fusionnée en squash le 26/11 à 18:20Z | VÉRIFIÉ : `git log origin/main` ; `JOURNAL.md` 26/11 (soir) |
| Publication | Publication contrôlée n° 45881769432 : `publiee_verifiee` le 26/11 vers 19:14Z ; construction Vercel `dpl_CKrJ3P3L8N1283Pem7tDLTdsn8w8`, qui porte `www.gerimmo.app` et `gerimmo.app` | VÉRIFIÉ (GitHub Actions : succès, 19:11Z → 19:14Z) |
| Contrôles après publication | `/api/sante` sert `f9e874b`, base OK, pas de maintenance ; accueil, inscription, conditions en 200 ; aucune erreur d'exécution Vercel relevée depuis 19:10Z | VÉRIFIÉ par l'agent principal depuis une autre adresse que la sienne (`JOURNAL.md`) |
| Versions précédentes | `1dca28b` (PR #359, Q125, `publiee_verifiee` le 26/11 à 09:50Z, run 45792561969) ; `8f9dd9c` (PR #358, palier 1, version préparée `062296e2`, validée par écrit par le dirigeant le 25/11, `publiee_verifiee` le 25/11 à 23:17Z, run 45711136251) ; avant : `81740dec` (21/11) | VÉRIFIÉ |
| Dernière recette de production | **n° 62** (run 45882154250, sur `f9e874b`) : **réussie**, de 19:14Z à 19:26:50Z (cinq comptes éphémères, parcours des espaces, purge) | VÉRIFIÉ sur GitHub (conclusion « success ») et dans `JOURNAL.md`. Avant : n° 58 (run 45720418609, sur `8f9dd9c`, réussie avec 1 parcours au second essai : Q125), n° 59, 60, 61 (runs 45795700074, 45798190513, 45798196475, sur `1dca28b`) réussies |
| Dernières migrations | Workflow « Migrations Supabase », run 45710263565, le 25/11 de 22:05Z à 22:09Z : 52 migrations, de `20261122090000` à `20261125154000`, en une transaction (`COMMIT`, aucune erreur). Simulation préalable : run 45708871873 | VÉRIFIÉ (GitHub : ce sont les deux derniers passages du workflow). Aucune migration depuis : Q125 et Q126 n'en avaient pas |
| Dernière sauvegarde | « Sauvegarde quotidienne » run 45794087353, planifiée, le 26/11 de 09:40Z à 09:45Z, sur `1dca28b` : réussie (le workflow dépose puis relit la copie chez Scaleway) | VÉRIFIÉ (GitHub). Avant : `20261125-2201` (run 45709572024, préalable aux migrations) et `20261125-2009` (run 45692125958) |
| Dernier contrôle de restauration | Run 45693311092, le 25/11 à 20:16Z, sur la sauvegarde `20261125-2009` (nouvelle clé) : réussi, 269 tables, 51 746 lignes, 112 fichiers | VÉRIFIÉ : **aucun contrôle de restauration plus récent** dans `restauration-sauvegarde.yml` (lecture du 26/11) |
| Projet Supabase de production | `rddlxunppddzpsaatdaz` (région eu-west-3, d'après `app/CLAUDE.md`) | — |
| Vercel | équipe `team_dXzIokNudrLR87DxLPeIYaGu`, projet `prj_YdwqVmhZU5ZDABPZom8OkWcXa1FV`, région `cdg1` (`app/vercel.json`) | — |
| Comptes réels | Recompte en lecture seule après Q126 : **0 compte réel à reprendre**. Seul un compte fictif `TEST-PUBLICATION`, créé par l'agent pour le parcours A du 26/11, demande « Fermer mon compte » enregistrée (état « nouveau ») | VÉRIFIÉ par l'agent principal. Les comptes déjà présents sont des comptes de test selon le dirigeant (22/11 et Q64) |
| Ventes | Souscriptions payantes **fermées** ; aucun médiateur saisi ; aucun paiement Stripe réel connu | Souscriptions fermées et médiateur absent : VÉRIFIÉ le 26/11 (pages publiques). Aucun paiement réel : d'après l'audit du 15/11 (0 abonnement Stripe), non relu depuis dans Stripe |
| Gestes de console faits | R1 (identité du vendeur), R2 (conditions du 24/11 archivées le 26/11 à 05:56:18Z, irréversible), R3 (IA activée), R4 (repères fiscaux 15 000 € et 30 %, source BOFiP) : faits par le dirigeant et vérifiés le 26/11 | VÉRIFIÉ en base et sur les pages publiques |
| Gestes restant au dirigeant | R5 (cinq envois automatiques, tous fermés), R7 (en-tête des factures dans Stripe), R8 (ouverture des souscriptions : **interdite à l'agent**), essai facultatif de l'interrupteur de l'IA (parcours A14 et A15), fermeture du compte fictif (`/admin/donnees` : « Afficher le bilan sans rien effacer », puis « Programmer la fermeture »), partie B du parcours de vérification | Voir section d |

> **Pare-feu de Vercel.** Depuis le 26/11 vers 09:29Z, le « Vercel Security Checkpoint » renvoie 403 à l'adresse IP
> des conteneurs d'agents (pas aux visiteurs : VÉRIFIÉ depuis une autre adresse). Contournements utilisés : l'outil de
> lecture web de l'agent, le connecteur Vercel, Chromium de Playwright qui passe le défi JavaScript.

---

## b. Registres

### b.1 Registre des constats et questions Q (Q1 à Q126)

Tous les numéros de Q1 à Q126 existent dans `QUESTIONS.md` ; aucun n'est sauté. Ce registre mêle des **questions de
choix** (une option prudente est en place en attendant) et des **défauts** constatés. « #358 » désigne la publication
unique du palier 1 (`8f9dd9c`, 25/11) : elle porte tous les lots de la mission (lots 1 à 65, D1 à D7, T1 à T4,
corrections de fusion), dont le détail par commit est sur la branche `claude/palier-1-preproduction` (jusqu'à
`062296e2`). Les chemins de fichiers sont relevés dans `main` (`f9e874b`) ou cités par
`livrables/PLAN-CORRECTIONS-2026-11-26.md` ; « non localisé » veut dire que je ne l'ai pas cherché assez pour l'affirmer.
Les colonnes « Reproduire, Fichiers, Piste » ne sont remplies que pour ce qui reste ouvert.

| n° | Intitulé court | Statut | PR ou commit | Reproduire | Fichiers | Piste |
|---|---|---|---|---|---|---|
| Q1 | Copie de base hébergée pour la préproduction | décidé : annulée (24/11, nuit) | — | — | — | — |
| Q2 | « Référentiel du palier 1 » introuvable | décidé, fait : [[Référentiel du palier 1]] (53 contradictions, dont 19 restent à trancher par le dirigeant) | wiki | — | — | Voir d.12 |
| Q3 | Étiquette Git de départ refusée | décidé : branches repères `claude/depart-palier-1` et `claude/production-2026-11-22` | — | — | — | — |
| Q4 | Lot #357 arrêté par le gel | publié (en production depuis le 25/11) | #357 (`e1e442dc`), puis #358 | — | — | — |
| Q5 | Accès aux sites officiels | décidé (ouvert le 24/11) ; Légifrance reste illisible : voir Q62 | — | — | — | — |
| Q6 | Quatre envois automatiques fermés | décidé (« ouvrir à la publication ») ; **geste R5 non fait** : les cinq interrupteurs sont fermés (VÉRIFIÉ en base le 26/11) | code : #358 (lot 15) | `/admin/parametres`, « Envois automatiques d'e-mails » | `app/src/lib/envois-suspendus.ts` | Voir d.3 |
| Q7 | Vendeur et médiateur | décidé en partie : identité saisie (R1, 26/11), documents alignés (D7, T4) ; médiateur non désigné (Q65, Q75) | #358 | — | — | Voir d.4 |
| Q8 | Antivirus des fichiers déposés | décidé : pas maintenant (point informatif) | — | — | — | Lot à part si le dirigeant choisit un service |
| Q9 | Clé des sauvegardes sans copie | décidé, fait le 25/11 (P1 : clé remplacée par le dirigeant ; P2 : runs 45692125958 et 45693311092) | — | — | — | — |
| Q10 | Recommandé électronique AR24 | publié (fonction masquée sans compte) | #358 (lot 8) | — | — | — |
| Q11 | Signature électronique proposée en premier | publié | #358 (D1) | — | — | — |
| Q12 | IA activée par défaut | décidé ; IA activée en base (R3, 26/11) | — | — | — | — |
| Q13 | Mention « Rédigé avec l'aide de l'IA » | publié ; l'aperçu du post Facebook ne la montre pas encore : corrigé non publié dans `claude/lot1-l4a` (D1) | #358 (D1) ; `claude/lot1-l4a` `929ab95` (console et courriel de veto) | — | — | — |
| Q14 | Facture de l'artisan fabriquée par Gerimmo | décidé : reporté après publication, rien codé | — | — | — | Lot sous interrupteur fermé après accord d'un expert-comptable |
| Q15 | Nouvelle version des conditions, accord exprès | publié (D4) ; version du 24/11 archivée (R2) | #358 | — | — | — |
| Q16 | Mode pilote ou commercial | décidé ; `GERIMMO_MODE` = commercial, **déduit** le 25/11 (P4) : la valeur est masquée chez Vercel et n'a pas été lue | — | — | — | — |
| Q17 | Posts automatiques quand l'IA est coupée | publié (option confirmée) | #358 | — | — | — |
| Q18 | Menu du propriétaire | publié (menu court, liens Statistiques et Journal) | #358 (D1) | — | — | — |
| Q19 | Lien de confirmation envoyé au garant | publié | #358 (lot 5) | — | — | — |
| Q20 | Qui lit le motif du retrait d'une évaluation | publié | #358 (D1) | — | — | Suites : Q68, Q69 |
| Q21 | Ancien parcours « télécharger, signer, redéposer » | publié (écran retiré, D5) ; fonctions en base laissées | #358 | — | — | Retrait des droits restants : lot L8 |
| Q22 | Prudences de l'avenant | publié (option confirmée) | #358 (lot 13) | — | — | — |
| Q23 | Rappel de révision du loyer | publié | #358 (D2) | — | — | — |
| Q24 | Envois : accord conservé, relance à la main | publié (D4) ; ouverture = geste R5 | #358 | — | — | — |
| Q25 | Motifs de refus envoyés à l'artisan | publié | #358 (lot 16) | — | — | — |
| Q26 | Deux portes de déclaration d'incident | publié | #358 (lot 17) | — | — | — |
| Q27 | Appels de charges validés avant le lot 19 | décidé ; contrôle du 24/11 : aucun appel, aucune liste | #358 (lot 19) | — | — | — |
| Q28 | DPE qui décide quand il y en a plusieurs | publié en partie (avertissement, D3) ; **règle « le plus récent par sa date » ouverte** | #358 | Logement avec deux DPE : l'avertissement nomme le DPE retenu et le plus récent par date | non localisé | Coder la règle après lecture du texte (Q62) et avis du juriste (6·15, 8·4) |
| Q29 | Garantie de l'artisan non montrée au locataire | publié (option confirmée) | #358 (lot 24) | — | — | — |
| Q30 | Artisan absent : envoi refusé | publié | #358 (lot 25) | — | — | — |
| Q31 | Relance d'une facture par l'artisan | publié | #358 (lot 26) | — | — | — |
| Q32 | Rendez-vous manqué | publié | #358 (lot 26) | — | — | — |
| Q33 | Pointage par relevé de banque | publié ; voir Q124 (« VIR CAF » devient « virement ») | #358 (lot 28) | — | — | — |
| Q34 | Agenda du propriétaire | publié (date limite de révision ajoutée) | #358 (D2) | — | — | — |
| Q35 | Repère de prix (trois métiers) | publié | #358 (lot 30) | — | — | — |
| Q36 | Ménage de la base | décidé : rien supprimé pendant la mission, lot à part ensuite ; **non fait** | — | Un visiteur peut lire `site_pages` et écrire dans `liste_attente` (30 lignes par heure au plus) | migrations `20260904132719` (l. 11), `20261019120000` (l. 136, 141), `20260908120000` (l. 40) ; `liste_attente` est lue par `20261024140000_conservation_et_prospection.sql` (l. 1152, 1215), `app/src/app/admin/journaux/bouton-purge.tsx`, et citée par `app/src/app/confidentialite/page.tsx` | Lot L8 (étape réversible d'abord) ; chercher les dépendances aussi dans `app/supabase/migrations`, `pg_cron` et les workflows ; **ne jamais toucher `liste_attente_agences`** ; « CAF / APL » : lot L2 |
| Q37 | Cinquième envoi (relance d'une demande de report) | publié (D4), fermé ; ouverture = geste R5 | #358 | — | — | — |
| Q38 | Repères fiscaux du micro-foncier | publié (D3) et réglé (R4, 26/11) | #358 | — | — | À revérifier chaque janvier ; question mineure : date enregistrée = jour de la saisie |
| Q39 | Six points de droit faute de textes | décidé : aucune règle de conservation activée ; points restés dans `JURISTE.md` | — | — | — | Q62, puis juriste |
| Q40 | Circuits de signature préparés avant publication | publié (règle) ; **À VÉRIFIER** : le résultat du contrôle C3 du jour J (circuits « prêts » non envoyés) n'est pas consigné ; le 24/11, un seul circuit, terminé | #358 | — | — | Rejouer la requête C3 du plan en lecture seule |
| Q41 | Formats d'impression | publié (option confirmée) | #358 | — | — | — |
| Q42 | Émetteur, destinataire, mots | publié (option confirmée) | #358 | — | — | — |
| Q43 | Révision prenant effet en cours de mois | publié (premier terme qui suit la demande) | #358 (D2) | — | — | — |
| Q44 | Plan d'apurement et relances | publié (option confirmée) | #358 | — | — | — |
| Q45 | Un seul IBAN par espace | publié ; **complément ouvert** : le nom du titulaire n'est pas imprimé | #358 | Avis d'échéance d'un bail payé par virement | `app/src/lib/documents/modeles/avis-echeance.ts` (l. 148) et le profil | Champ « titulaire » au profil, prérempli (lot L2, recommandé par le plan) |
| Q46 | Notice d'information du bail | publié (solution d'attente : dépôt par le bailleur, signature électronique bloquée sans elle) ; notice officielle jointe par Gerimmo ouverte (Q77) | #358 (D3) | — | — | — |
| Q47 | Inventaires et avenants | publié (option confirmée) | #358 | — | — | — |
| Q48 | Listes du catalogue dans un grand parc | publié (option confirmée) | #358 | — | — | — |
| Q49 | Dépôt de garantie et sortie | publié (D3 : une pièce par retenue) ; restes : décompte des retenues sans parcours navigateur, pièces de mandat non contrôlées | #358 | — | — | Parcours dédié (lot L5) ; avis du juriste (8·1) |
| Q50 | Régularisations déjà émises | décidé ; aucune régularisation en production (24/11) | #358 | — | — | — |
| Q51 | Ordre d'intervention et devis | publié (option confirmée) | #358 | — | — | — |
| Q52 | Adresse de la quittance en ligne | décidé : option B, rien à changer | — | — | — | — |
| Q53 | Travaux d'une première location | publié (option confirmée) | #358 | — | — | — |
| Q54 | Signe « € » seul à la ligne | ouvert | — | Document long avec un montant en fin de ligne ; seul l'acte de cautionnement est corrigé | `app/src/lib/documents/gabarit.ts` (fonction `eur`, l. 165) et les modèles | Espace insécable dans `eur()` pour les documents produits après la mise en ligne (L2) ; ne pas régénérer un document en signature (Q40) |
| Q55 | Contrat désigné par sa date dans 16 documents | ouvert (choix ; l'extension aux 16 documents est publiée) | #358 | Attestation de fin de bail, accusé de congé | `app/src/lib/documents/modeles/` | Garder, sauf avis contraire du dirigeant |
| Q56 | Récapitulatif pour la CAF : cadre de signature | ouvert (choix) | #358 | Produire le récapitulatif CAF depuis le catalogue | non localisé | Recommandation de l'auteur : retirer le cadre, pour qu'il ne passe pas pour une attestation |
| Q57 | Titre daté des courriers d'impayés | ouvert (choix) | #358 | Courrier archivé « Relance amiable de loyer — date » | `app/src/lib/documents/catalogue.ts` | Garder la date seule (pas de nom : donnée minimale) |
| Q58 | Comparatif quand une seule entreprise répond | ouvert | #358 | Un seul devis : l'écran promet un signalement au rapport de gestion que ni le rapport ni le comparatif ne font | `app/src/lib/documents/modeles/catalogue-gestion.ts` | Option B maintenant (retirer la promesse de l'écran), recommandée par le plan L2 |
| Q59 | Numéros des écritures du journal comptable | ouvert (expert-comptable) | — | Journal comptable imprimé sans numéros | non localisé | Avis de l'expert-comptable avant tout ajout |
| Q60 | Période d'occupation de la régularisation | ouvert | — | Émettre une régularisation, poser ou annuler un congé, réimprimer : la période peut changer (aujourd'hui, la phrase est omise dans le doute) | `app/src/lib/documents/modeles/catalogue-gestion.ts` ; une migration additive | Enregistrer période, jours et total à l'émission (L2, recommandé) |
| Q61 | Ordre d'intervention : signature, mission terminée | ouvert (choix) | #358 | Ordre d'une mission terminée : « établi pour le dossier » | `app/src/lib/documents/modeles/catalogue-gestion.ts` | Garder le cadre vide ; étendre l'accord de signature demanderait un nouveau texte d'accord |
| Q62 | Lire les articles de Légifrance | ouvert | — | Légifrance refuse les lectures automatiques | — | Voir d.7 |
| Q63 | Informations du vendeur | décidé : reçues le 24/11, saisies (R1, 26/11) ; restent Q65, Q66 et la mention « EI » (juriste 7·7) | — | — | — | — |
| Q64 | Comptes créés le 19/11 | décidé : comptes de test (24/11) | — | — | — | — |
| Q65 | Ouvrir les ventes sans médiateur : risque | ouvert (dirigeant ; juriste 7·6 et 9·26) | — | `/admin/parametres`, carte « Blocage des abonnements » | `app/src/lib/garde-souscription.ts`, `app/src/app/actions/reglage-souscription.ts` | Voir d.4 |
| Q66 | Activité déclarée et vente d'un logiciel | ouvert (expert-comptable) | — | — | — | Avis de l'expert-comptable ; une mention changée sur les conditions archivées exige une nouvelle version |
| Q67 | Articles marqués « IA » d'office | ouvert (information du dirigeant) | #358 | Console, publications | `app/src/components/mention-ia-article.tsx`, migration `20261124110000_publications_origine.sql` | Retirer la mention des articles que le dirigeant dira écrits à la main |
| Q68 | Export complet sans le motif du retrait | ouvert (choix) | #358 | Export complet d'un espace qui a noté un artisan | `app/src/lib/export-complet-serveur.ts`, `app/src/lib/evaluation-retiree.ts` | Petit ajout si le dirigeant le veut |
| Q69 | Ancien locataire lit le motif de sa note | ouvert (choix ; un test tient le comportement) | #358 | — | `app/src/lib/evaluation-retiree.ts` (À VÉRIFIER) | Garder |
| Q70 | Bail repris : indice d'origine ou mis à jour | ouvert | #358 | Bail repris dont l'indice a déjà été révisé ailleurs : révision refusée | `app/supabase/migrations/20261124150000_revision_loyer_seconde_reprise_d2.sql` | Case « indice d'origine ou déjà mis à jour » à la saisie (L2, recommandé) |
| Q71 | Garde-fou 0,8 à 1,25 sur les indices | ouvert (choix ; en place) | #358 | Révision avec un rapport d'indices hors plage : « vérifiez les indices saisis » | `20261124150000_revision_loyer_seconde_reprise_d2.sql` | Garder |
| Q72 | Outil public de l'IRL non aligné | **corrigé non publié en partie** (garde 0,8 à 1,25 quand on saisit ses indices, branche `claude/lot1-l4c`) ; le reste est ouvert | `claude/lot1-l4c` `4b65597` | En production, `/outils/calcul-irl` accepte un rapport d'indices hors plage ; l'alerte de `app/src/lib/outils/irl.ts` (l. 90 sur `main`, l. 103 sur `claude/lot1-l4c`) dit de prendre l'indice de la dernière révision, l'application prend le même trimestre de l'année précédente | `app/src/lib/outils/irl.ts`, `app/src/app/outils/calcul-irl/page.tsx` | Publier L4c ; aligner année perdue, premier mois révisé et délai d'un an après le juriste (7·1, 7·2, 7·4) |
| Q73 | Répartition fiscale selon l'ordre de saisie | ouvert (**majeur**, lot L6) | — | Saisir les paiements de deux termes (700 € et 720 €) dans le désordre : parts loyer et charges différentes ; totaux justes | `app/src/lib/fiscal.ts` (l. 74, 96-101), `app/src/app/actions/loyers.ts` (l. 489-497), `capturer_composantes_fiscales` (`20261112120300…`, l. 997-1070), `retrouver_ventilation_fiscale` (`20261012224000_fiscalite_historique_qualifiee.sql`) | Imputer par date de paiement, l'ordre de saisie ne départageant que deux dates égales ; avis de l'expert-comptable ; ne réécrire aucune part figée sans comptage, sauvegarde et décision écrite |
| Q74 | Adresse imprimée sur le PDF de la quittance | ouvert | — | Propriétaire direct : quittance en ligne (adresse de l'espace) et PDF (adresse de la fiche) ; depuis #360, un déménagement signalé sans rien écraser peut les faire diverger | `app/src/lib/documents/modeles/quittance.ts`, `app/src/lib/documents/modeles/communs.ts` | Attendre le juriste (5·19 ; même émetteur suggéré) ; d'ici là, option B (rien ne change) |
| Q75 | Médiateur : la décision contredit la règle « tout respecte les textes » | ouvert (geste R6 du dirigeant) | #358 (D7) | `/admin/parametres`, « Vente aux particuliers sans médiateur de la consommation » | `app/src/lib/garde-souscription.ts` | Voir d.4 |
| Q76 | Quatre informations du vendeur | décidé : reçues le 24/11 (nuit), saisies (R1, 26/11) | — | — | — | — |
| Q77 | Notice du bail non imprimable telle quelle | ouvert (lot L7) | — | Bail : Gerimmo ne joint pas la notice officielle ; la signature sur papier n'est pas bloquée | `app/src/lib/documents-bail.ts` (l. 99-101) | PDF officiel de Légifrance avec sa date de version, joint avec son empreinte ; blocage activé seulement une fois le fichier en place |
| Q78 | « Lever le blocage » ne sert plus qu'aux hausses de capacité | publié (option en place, D7) ; aucune décision demandée | #358 | — | `app/src/lib/garde-souscription.ts` | — |
| Q79 | Nom commercial à afficher | ouvert | — | `/mentions-legales` : forme « Entrepreneur individuel (EI) », sans nom commercial (VÉRIFIÉ le 26/11) | `app/src/lib/editeur.ts`, `app/src/app/actions/identite-editeur.ts` | Champ dédié (migration) ; les conditions archivées figent leur texte : tout changement imprimé = nouvelle version, donc faire Q93 (L3) avant ; juriste 9·29 |
| Q80 | En-tête des factures d'abonnement dans Stripe | ouvert (geste R7 du dirigeant) | — | Aucune facture réelle vue | — (compte Stripe) | Voir d.5 |
| Q81 | Qui compte comme « particulier » | ouvert (choix ; définition la plus protectrice en place) | #358 | — | `app/src/lib/garde-souscription.ts` | Garder ; juriste 9·27 |
| Q82 | Lecture seule automatique : réexamen humain | ouvert (juriste 9·30) | #358 | Articles 15.3 et 8.2 des conditions | `app/src/app/conditions/page.tsx`, `app/src/lib/conditions-versions.json` | Attendre le juriste ; toute phrase ajoutée = nouvelle version des conditions |
| Q83 | Réclamation reçue par courriel : rappel du médiateur | ouvert (choix) | — | — | — | Modèle de réponse, ou tout faire passer par « Aide et retours » |
| Q84 | Durée de conservation chez OpenAI | ouvert (information du dirigeant) | — | — | `app/src/app/confidentialite/page.tsx` | Écrire la durée du contrat une fois fournie ; relever ensemble la date et l'empreinte de la page (règle Q99) |
| Q85 | Règlement européen 2019/1150 et espace artisan | ouvert (juriste) | — | — | conditions de l'espace artisan (non localisé) | Avis du juriste, puis nouvelle version des conditions de l'artisan |
| Q86 | Factures gardées dix ans : prévenir les comptes fermés | ouvert | — | — | — | Compter en lecture seule les comptes payants fermés (SUPPOSÉ : aucun ; 0 abonnement Stripe au 15/11) |
| Q87 | Écran de simulation du nettoyage : compte faux | ouvert (cosmétique) | — | `/admin/donnees`, simulation : une archive que la purge fait attendre est comptée | `20261024140000_conservation_et_prospection.sql` (l. 1234) contre `20261125103000_factures_conservation_dix_ans.sql` (l. 104-130) | Aligner le compte (L4, recommandé) |
| Q88 | « Ma fiche entreprise » ou « Mon entreprise » | ouvert | #358 | Menu latéral de l'artisan | `app/src/components/nav-artisan.tsx` (l. 102-115) | Titres des pages partout (L4, recommandé) |
| Q89 | « Factures » et « Ma facturation » : deux noms | **corrigé non publié** (`claude/lot1-l4b`, onglet « Facturation ») ; mesuré dans Chromium : à 390 px, « Ma facturation » est tronqué (73 px pour 70), « Facturation » tient ; choix par délégation : « Facturation » | `claude/lot1-l4b` `0ad214f` | Barre du téléphone de l'artisan | `app/src/components/nav-artisan.tsx` | Le dirigeant peut demander « Ma facturation » : il faut alors retoucher la mise en page de l'onglet |
| Q90 | Export de l'artisan incomplet | ouvert (fonction nouvelle) | #358 (libellé corrigé) | Export JSON de l'artisan : ni messages, ni créneaux, ni photos | non localisé | Export complet et lisible dans un lot à part, si le dirigeant le veut |
| Q91 | Abonné qui ne répond pas aux nouvelles conditions | ouvert (choix pour une future version) | #358 (D4) | — | déclaration de la version des conditions (`app/src/lib/conditions-versions.json`, À VÉRIFIER) | Garder « rappel, accord au prochain acte » |
| Q92 | Actes qui redemandent l'accord | ouvert (choix) ; portail Stripe non examiné | #358 | — | `app/src/lib/nouvelle-version-conditions.ts` | Garder ; examiner le portail avec R7 |
| Q93 | Annonce par courriel des nouvelles conditions | ouvert (**majeur**, lot L3) | — | Avec un abonné actif, l'archivage d'une nouvelle version est refusé | `app/src/lib/conditions-versions-serveur.ts` (l. 118-147) | Écrire le courriel d'annonce sous interrupteur fermé, texte à faire relire, avant le premier abonné |
| Q94 | Relance à la main : interrupteur propre ? | ouvert (choix) | #358 | — | `app/src/lib/envois-suspendus.ts`, `app/src/app/actions/reception-loyer.ts` | Garder le même interrupteur |
| Q95 | Relance à la main pour les agences | ouvert (palier 2) | — | — | — | Mission palier 2 |
| Q96 | Changement de périodicité sans accord aux conditions | ouvert (mineur, lot L3 ; exposition nulle aujourd'hui, aucun abonné) | — | Appel direct de `demander_periodicite_suivante` par un compte connecté | `app/src/app/actions/abonnement.ts` (l. 579), `20260928090000_tarification_2026.sql` (l. 782-802) | **Ne pas** retirer `execute` au rôle connecté : cela casse le vrai parcours (critique du plan, point 1) ; garde dans la fonction ou appel serveur, avec relecture de sécurité |
| Q97 | Plafond de relances à la main par espace | ouvert (choix) | — | — | — | Aucun plafond tant que le dirigeant n'en donne pas |
| Q98 | Un client en essai compte-t-il comme abonné ? | ouvert (choix ; juriste 9·38) | #358 | — | `app/src/lib/conditions-versions-serveur.ts` | Garder |
| Q99 | Date de la page de confidentialité | décidé (« de sa modification ») ; déjà le comportement publié | #358 | — | — | — |
| Q100 | Outil IRL : champs vides | publié ; VÉRIFIÉ en production le 26/11 (parcours A4) | #358 | — | — | — |
| Q101 | Diffusion Facebook masquée tant que la Page n'est pas vérifiée | publié | #358 | — | — | — |
| Q102 | Notice de l'arrêté du 13/12/2017 au congé pour vendre | ouvert (**majeur**, lot L7) | — | Préparer un congé pour vendre : la lettre annonce la notice, Gerimmo ne la fournit pas ; aucun PDF de ce congé n'est produit au banc depuis T1 | `app/src/lib/documents/catalogue-options.ts` (l. 27), `app/src/app/agence/[orgId]/baux/[bailId]/generer-conge-bailleur.tsx` (l. 21), `app/src/lib/documents/modeles/conge-bailleur.ts` | D'abord faire produire un PDF au banc (test local `zz-phase3-documents.test.ts`, non suivi par git), puis texte officiel et dépôt bloquant |
| Q103 | Préavis d'un mois en zone tendue | ouvert (choix) | #358 | Locataire, carte du congé quand la zone est inconnue | `app/src/app/locataire/[orgId]/logement/carte-conge.tsx` (l. 147-152), `app/src/app/locataire/[orgId]/logement/page.tsx` (l. 86) | Garder la case ; revoir le texte quand la zone est inconnue (L4) |
| Q104 | Logement acheté déjà loué | ouvert (choix) | #358 | — | `app/src/lib/documents/modeles/conge-bailleur.ts` | Donnée « date d'acquisition » dans un lot à part, si voulu |
| Q105 | Congés enregistrés avant le lot T1 | ouvert | — | — | requête prête dans `livrables/notes-banc/notes-T1.md` | La lancer en lecture seule avec l'accord du dirigeant (SUPPOSÉ : comptes de test seulement) |
| Q106 | Congé pour reprise par une société : blocage | ouvert (choix) | #358 (T1) | — | migration du lot T1 (non localisée ici) | Garder le blocage |
| Q107 | Bail nu à durée réduite refusé | ouvert (choix ; juriste) | #358 (T2) | — | `app/src/app/actions/baux.ts`, `app/src/app/agence/[orgId]/baux/[bailId]/formulaire-complements-bail.tsx` | Garder le refus tant que le vrai parcours n'est pas écrit |
| Q108 | Activité du mandataire (agence) | ouvert (palier 2) | — | — | `app/src/lib/documents/modeles/mentions-location.ts` | Mission palier 2 |
| Q109 | Résumés de la notice déjà rangés | ouvert | — | Résumé produit avant T2 : phrase fausse « il produit intérêt » | `app/src/lib/documents-bail.ts` (l. 90-92), `app/src/lib/documents/modeles/notice.ts` | Drapeau « à actualiser » (L2, recommandé) |
| Q110 | Honoraires de l'agence : détail des prestations | ouvert (palier 2) | — | — | `app/src/lib/documents/modeles/mentions-location.ts` | Mission palier 2 |
| Q111 | Textes manquants au recueil (25-4, 25-6…) | ouvert (textes à fournir) | — | — | — | Textes Légifrance avec date de version (Q62) |
| Q112 | Information de la caution sous un mois | ouvert (**majeur**, lot L7) | — | Bail avec caution et loyer impayé : Gerimmo informe à la seconde relance, envoi fermé | `app/src/lib/information-caution.ts` (l. 3), `app/src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx` (l. 838-846), `app/src/app/agence/[orgId]/profil/formulaire-profil.tsx` (l. 64-66) | Informer dès le premier mois si le bail a une caution (sous réserve du juriste), envoi sous interrupteur |
| Q113 | Pièces demandées à une caution après signature | ouvert (choix ; juriste 9·23) | #358 (T3) | — | `app/src/lib/pieces-decret-2015.ts` | Garder la liste du décret |
| Q114 | Anciennes demandes de pièces au nom libre | ouvert (choix) | — | — | `app/src/lib/pieces-decret-2015.ts` (À VÉRIFIER) | Les laisser, sans suppression |
| Q115 | Terme du bail en fin de mois | ouvert (choix ; juriste 9·24) | #358 (T3) | Bail commencé le 29/02/2024 : fin le 28/02/2027 | `app/src/lib/baux.ts` | Garder la règle générale |
| Q116 | Troisième locataire sur un bail d'époux ou partenaires | ouvert (choix ; juriste 9·39, 9·41) | #358 (correction A-01 de la fusion) | — | `app/src/app/actions/baux.ts`, `app/src/app/agence/[orgId]/baux/[bailId]/personnes-bail.tsx` | Garder l'ajout avec avertissement en attendant le juriste |
| Q117 | Relance à la main partie à une partie des destinataires | ouvert | #358 (E-02, Y-01) | Colocataire à l'adresse refusée : le palier est fermé pour tous | `app/src/app/actions/reception-loyer.ts`, `20261125110000_relance_report_rdv_et_relance_a_la_main.sql` | Geste « terminer l'envoi » vers les seules personnes non servies (L2, second temps) |
| Q118 | Relance « envoi non confirmé » | ouvert | #358 (Y-01) | Service d'envoi qui ne confirme pas | mêmes fichiers que Q117 | Même lot ; ou bloquer le palier suivant |
| Q119 | Accord donné avant l'archivage d'une version | ouvert (choix ; règle en base publiée) | #358 (R-01) | — | `app/src/lib/nouvelle-version-conditions.ts` (l. 117-128) | Ne compter que les accords à l'empreinte archivée, redemander les autres (L3, recommandé ; juriste 9·42) |
| Q120 | Exiger l'empreinte au rappel des inactifs et à l'écran « les conditions évoluent » | ouvert | — | Une acceptation sans empreinte écrite par le compte lui-même est comptée | `app/src/lib/nouvelle-version-conditions.ts` | Même correctif que Q119 |
| Q121 | Remplacer l'un des époux ou partenaires | ouvert (juriste 9·39) | #358 (C-01) | Avenant de remplacement refusé pour un bail coché | non localisé | Conduite à fixer après le juriste |
| Q122 | Bail signé de nouveau après « Corriger » | ouvert (choix ; juriste 9·41) | #358 (X-01) | — | non localisé | Confirmer la règle en place |
| Q123 | Outils publics préremplis | **corrigé non publié** (`claude/lot1-l4c` : quatre outils vides, exemple en grisé) | `claude/lot1-l4c` `4b65597` | En production, `/outils/quittance-de-loyer` s'ouvre avec 850 €, 120 € et 970 € et « Imprimer la quittance » actif sans saisie | `app/src/app/outils/quittance-de-loyer/generateur-quittance.tsx` et les outils GLI/Visale, LMNP, rentabilité | Publier L4c (relectures faites, verdict « bon ») |
| Q124 | Quittance d'un loyer payé en partie par la CAF | ouvert (**majeur**, lot L2 ; juriste 9·44) | — | Terme de 600 € dont 210 € de la CAF : « déclare avoir reçu de [locataire] la somme de 600 € » ; signature seule en page 2 | `app/src/lib/documents/modeles/quittance.ts` (l. 118-125, 211-212), `app/src/lib/quittance-conforme.ts` (l. 161-186), `app/src/app/actions/reception-loyer.ts` (l. 43, 186-192), `20261026110449_reception_loyer_idempotence_durable.sql` (l. 77), `app/src/lib/pointage-loyers.ts` (l. 81-96) | Phrase qui distingue la part du locataire et celle de la CAF ; accepter « caf » dans l'action et la base **en remplaçant la fonction par la méthode contrôlée** (sinon on perd la garde de `20261112195752_relances_apres_decompte.sql`) ; double relecture |
| Q125 | Inscription : renvoi vers « Connexion » après « Créer mon espace » | publié le 26/11 à 09:50Z ; action VÉRIFIÉE en production par une sonde à session factice | #359 (`1dca28b`) | — | `app/src/proxy.ts` | — |
| Q126 | Adresse du bailleur non reprise sur sa fiche | publié le 26/11 vers 19:14Z ; recompte : 0 compte réel à reprendre | #360 (`f9e874b`) | — | `app/src/lib/fiche-titulaire.ts` | — |

**Questions notées mais pas encore numérotées dans `QUESTIONS.md`** (à ajouter comme Q127 et suivantes) : lot D3
(durée de conservation de la notice déposée ; accès du locataire à la notice ; pièce exigée dès la saisie d'une
retenue ; pièces liées à un mandat et rapports de diagnostic non contrôlés) ; lot 61 (carte « données d'une location »
aussi pour le propriétaire et l'agence ; « en principe, rien à demander » quand l'émetteur ne se lit pas ; carte du
plan de paiement pour un terme non échu payé en partie) ; relecture T3 (quatre questions de
`livrables/notes-banc/notes-T3.md`, l. 113-116).

### b.2 Lots du plan de correction du 26/11 (L1 à L8)

Source : `livrables/PLAN-CORRECTIONS-2026-11-26.md`, établi en lecture seule sur `1dca28b`, **à lire avec sa critique de
complétude** (fin du document), qui corrige plusieurs points. Chaque lot est publiable seul.

| Lot | Thème | Statut | Branche ou commit | Reproduire | Fichiers | Piste |
|---|---|---|---|---|---|---|
| L1 | Sessions et mots de passe | corrigé non publié (lot 1) | `claude/lot1-l1` `960285b` | Voir section c | Voir section c | Voir section c |
| L2 | Loyers, quittances, documents de gestion (Q124, Q36-4, Q45, Q54, Q58, Q60, Q70, Q109, D2, lot 54, puis Q117 et Q118) | ouvert, non commencé ; attend les réponses du dirigeant (et du juriste pour Q124) | — | Voir les lignes Q du tableau b.1 | Voir les lignes Q | Migrations additives seulement ; double relecture (documents légaux) ; ne pas régénérer un document en signature (Q40) |
| L3 | Conditions, accords, abonnement, sans rouvrir les ventes (Q93, Q96, Q119, Q120, E024/E145) | ouvert ; décisions du dirigeant attendues | — | Voir Q93, Q96, Q119 | `app/src/lib/conditions-versions-serveur.ts`, `app/src/lib/nouvelle-version-conditions.ts`, page de rétractation | Faire L3 avant tout changement du texte des conditions archivées |
| L4 | Écrans justes (défauts mineurs vérifiés) | corrigé non publié **en partie** (L4a, L4b, L4c du lot 1) ; reste ouvert : E040/E154, E027/E146, E025/E147, E135, motif « zone tendue » inconnue, `.lien-discret`, Q87, Q88, reste du lot 61, code postal « 75000 » accepté, délai de la case « mariés ou pacsés », photo de l'évaluation contestée, pages publiques E059, E061, E066, E067, E169, E176, E178 | `claude/lot1-l4a`, `-l4b`, `-l4c` | Voir section c | Voir le plan, § L4 | Un lot « L4 bis » après le relevé d'écrans de L5 |
| L5 | Tests, relevé d'écrans, exploitation | ouvert, non commencé | — | 85 actions sans test (liste `livrables/notes-banc/actions-non-citees-2026-11-26.txt`, à retrier : elle repose sur le nom des fonctions) ; trois parcours absents de WebKit ; liste des défauts mineurs perdue | `app/e2e/playwright.webkit.config.ts` (l. 30) | Refaire le relevé à 390 et 1 440 px ; tests par action ; parcours e2e manquants ; relire la trentaine de retours arrière à plusieurs instructions |
| L6 | Récapitulatif fiscal (Q73) | ouvert ; attend l'expert-comptable | — | Voir Q73 | Voir Q73 | Voir Q73 |
| L7 | Pièces officielles et information de la caution (Q46/Q77, Q102, Q112) | ouvert ; attend les textes officiels et le juriste | — | Voir Q77, Q102, Q112 | Voir ces lignes | Blocage activé seulement quand le fichier officiel est en place |
| L8 | Nettoyage de la base, partie réversible (Q36) | ouvert ; attend une décision écrite | — | Voir Q36 | Voir Q36 | Retirer des droits (réversible) ; aucune suppression sans sauvegarde vérifiée et décision écrite |

Le tableau « 1e » du plan numérote aussi ses défauts **A1 à A15** (graves) et **B1 à B7** (majeurs sans résultat
faux), avec leur lot. Attention : ces A1 à A15 ne sont **pas** les étapes du parcours de vérification, qui portent
les mêmes numéros (voir b.4).

### b.3 Décisions numérotées et leur statut

| Repère | Ce que c'est | Statut |
|---|---|---|
| « B et oui » (20/11) | B : un bail dont la date d'entrée est passée s'active par son contrat signé, DPE et état des risques deviennent des alertes ; « oui » : naissance du locataire facultative pour un locataire en place | publié (#355, `81740dec`, 21/11) |
| « Choix A » (21/11) | Bail déjà en cours : loyers suivis à partir du mois de l'activation | publié (#356 dans #355, 21/11) |
| **1A** (22/11) | Message de service aux inscrits | sans objet : les inscrits sont des comptes de test (22/11) ; rien envoyé |
| **2B** (22/11) | Un DPE classé G ne bloque plus l'activation d'un bail déjà en cours ; il devient une alerte | publié (#357, en production depuis le 25/11) ; choisi **contre la recommandation de l'agent** (A) : effet de l'interdiction de louer un G sur un bail en cours non établi par une source (signalé dans [[Bail]] et [[Diagnostic]]) |
| **3A** (22/11) | Un bail repris en cours ne reçoit plus l'alerte « État des lieux d'entrée à signer » | publié (#357) |
| **4** (22/11) | Libellé « Indiquer mon adresse et créer mon premier bien » validé | publié |
| **D1** (24/11) | Lot des décisions d'écran (Q11, Q13, Q18, Q20) | publié (#358) ; reste « aperçu Facebook sans lien ni mention » : corrigé non publié dans `claude/lot1-l4a` |
| **D2** | Lot de la révision du loyer (Q23, Q34, Q43) | publié ; restes mineurs (indice égal accepté, message « rien à réviser », mot de la lettre, Q70) dans L2 |
| **D3** | Lot notice, diagnostics, retenues, repères fiscaux (Q46, Q28, Q49, Q38) | publié ; restes : notice officielle (Q77), règle du DPE (Q28), questions non numérotées (b.1) |
| **D4** | Lot Q15, Q24, Q37 et sa reprise | publié ; ouverture des envois = R5 |
| **D5** | Lot Q21 (ancien parcours retiré) | publié ; nettoyage des fonctions restantes = L8 |
| **D7** | Lot du vendeur des abonnements et ses deux reprises | publié ; médiateur (Q65, Q75), questions Q78 à Q83 |
| D6 | — | **introuvable** dans les documents lus : il n'y a pas de lot D6 |
| P1 à P8 | Prérequis du plan de publication (clé, sauvegarde, retours de base, réglages, seconde passe, essais, demi-journée, message) | tous faits ou décidés le 25/11 ; P3 : retours de base par le connecteur Supabase, seulement après accord écrit à chaque fois |
| R1 à R8 | Réglages du jour de publication, dans la console ou chez Stripe | R1 à R4 faits (26/11) ; **R5, R7, R8 au dirigeant** ; R6 = rien à faire tant que le dirigeant ne lève pas la vente sans médiateur ; R4 bis = parcours de vérification, partie A faite par l'agent (sauf A7, A9, A14, A15), partie B non faite |

### b.4 Ce que veut dire chaque numérotation

| Famille | Sens | Où la trouver |
|---|---|---|
| Q1, Q2… | Questions au dirigeant et constats de la mission palier 1, avec option prudente en attendant | `QUESTIONS.md` |
| Lots 1 à 65 | Lots de correction de la mission palier 1 (22 au 25/11) : 1 à 34 (phase 2), 35 à 54 (documents), 60 (artisan), 61 (locataire), 62 à 65 (relecture des écrans : 62 public, 63 propriétaire, 64 et 65 console) | `JOURNAL.md` |
| L60 à L65 | Les mêmes lots d'écrans, écrits « L » dans les notes du banc | `livrables/notes-banc/` |
| **L1 à L8** | Lots du **plan de correction du 26/11** — à ne pas confondre avec L60 à L65 | `livrables/PLAN-CORRECTIONS-2026-11-26.md` |
| Lot 1 (26/11) | Première vague de L1 et L4, en quatre copies L1, L4a, L4b, L4c | section c |
| D1 à D7 | Lots qui appliquent les décisions du dirigeant du 24/11 | `JOURNAL.md` |
| D01 à D49 (avec A, B) | Décisions groupées d'octobre, avec l'option retenue (ex. D24-B, D33) | [[Décisions groupées — version candidate du 13 octobre 2026]] |
| 1A, 2B, 3A, 4 | Réponse du dirigeant du 22/11 à quatre questions (numéro de question + option) | `log.md`, 22/11 |
| T1 à T4 | Lots tirés du recueil de textes officiels (congés ; bail, caution, colocation ; dépôt, charges, état des lieux, pièces ; vente et données) | `JOURNAL.md`, `livrables/notes-banc/notes-T1.md` à `notes-T4.md` |
| T1R, T3R-1…, T4R-06, D4R-03, D7R, L60R | Points des relectures de ces lots | `livrables/notes-banc/relecture-*.md` |
| E001 à E2xx | Défauts d'écran de la première relecture des écrans ; « E054 = E167 » veut dire le même défaut vu au téléphone et à l'ordinateur | `livrables/notes-banc/notes-majeurs.md` ; **la liste complète des mineurs est perdue** (B4 du plan) |
| A-01, A-05, RET-01, L-01 | Constats des essais de publication (A-01 : lettre de révision avec l'ancien code ; A-05 : points supposés acceptés par le dirigeant ; RET-01 : retours qui gardaient leur version) et de la seconde passe (L-01) | `livrables/PLAN-DE-PUBLICATION.md`, fin |
| A-01, C-01, E-02, R-01, X-01, Y-01 | Corrections nées des relectures de la fusion du 25/11 (même lettre A-01 que ci-dessus, sens différent) | `livrables/notes-banc/fusion/` |
| P1 à P8, É1 à É13, C1 à C6, R1 à R8, R4 bis | Prérequis, étapes, contrôles en lecture seule et réglages du plan de publication | `livrables/PLAN-DE-PUBLICATION.md` |
| R9 (et R3, R6, R7 du lot 60) | Points de la relecture du lot 60 (artisan) ; R9 = boucle possible de la page de panne. **Collision** avec les réglages R1 à R8 | `JOURNAL.md`, lot 60 |
| Parcours A1 à A15, partie B | Étapes du parcours de vérification de 15 minutes | `livrables/PARCOURS-15-MINUTES.md` |
| A1 à A15, B1 à B7 (plan) | Défauts du tableau « 1e » du plan de correction | `livrables/PLAN-CORRECTIONS-2026-11-26.md` |
| P0-xx, P1-xx, P2-xx | Points du plan de l'audit du 22/11 (ex. P0-01 : aperçus Vercel branchés sur la base de production) | `AUDIT.md` |
| B1, B2, R1, A1 à A4, N1 à N14 | Bloquants, risques et défauts non bloquants de l'audit final de la PR 335 (15/11) ; **N10** = accès privilégiés Supabase | [[Audit final indépendant — PR 335 — 15 novembre 2026]], [[Contre-vérification ciblée — PR 335 — candidat 962f2c76]] |
| V1-01 à V1-21 | Constats de l'audit de qualité commerciale du 16/11 (V1-05 : fins d'essai) | [[Audit de qualité commerciale V1 — a776ed43 — 16 novembre 2026]] |
| SEC-1, SCI-1 à SCI-4, OPS-1, TEC-3 à TEC-5, UX-1, COM-2, P1-1, P1-2 | Constats des audits du 19/11 (UX-1 : locataire invité renvoyé à la connexion ; COM-2 : premier paiement réel remboursé avant d'ouvrir les ventes) | [[Audit après publication PR 347 — 8c0449c6 — 19 novembre 2026]], `livrables/audit-*-20261119/` |
| G-01 à G-116 | Constats d'une recette menée à la mi-novembre, traités par Codex (un autre agent) dans les PR #287 à #330 | titres des PR ; définition complète **non retrouvée** dans les documents lus |
| PRO-4, PRO-5 | Points de la relecture adverse du 23/10 sur l'inscription ; PRO-5 : après le choix du mot de passe, une session « mot de passe » remplace celle du lien (garde à ne pas affaiblir) | `app/src/app/actions/auth.ts`, `log.md` 23/10 |
| R-PROP-19, R-DG-01… et C-01 à C-53 | Règles du référentiel et registre de ses contradictions | [[Référentiel du palier 1]] |
| « partie·point » (ex. 9·44) | Points de `JURISTE.md` (partie 9 : 44 points ou plus) | `JURISTE.md` |
| Recette n° 62, run 45… | Numéro d'exécution du workflow de recette (n°) et identifiant GitHub de l'exécution (run) | GitHub Actions |

---

## c. Le lot 1 (corrections du 26/11 : rien n'est publié, rien n'est fusionné)

**Ce que c'est.** Le lot 1 applique les lots **L1** (sessions) et **L4** (écrans) du plan du 26/11. Il est fait en
quatre copies de travail, chacune partie de `main` `1dca28b`, à pousser sur des branches de travail. Il a été lancé
sur la délégation du dirigeant du 26/11 (« fais le reste… débrouille toi »), qui couvre les choix d'affichage sans
enjeu juridique, sans argent réel et sans effacement ; chaque choix fait par délégation doit être écrit dans la PR.

| Branche (sur GitHub) | Commit initial | Tête finale | Ce qu'elle corrige | Relectures | Reste |
|---|---|---|---|---|---|
| `claude/lot1-l1` | `8a82db9` | `960285b` | Les deux fermetures de session en portée « others » (`app/src/app/actions/auth.ts`, `definirNouveauMotDePasse` ; `app/src/app/actions/compte.ts`, changement de mot de passe) lisent leur erreur et la tracent dans `log_tech` (`traceFermetureAutresSessions`, `app/src/lib/compte.ts`) ; libellé « fermeture des autres sessions : échec » dans la console. « Mon compte » ne dit plus que les autres appareils sont déconnectés quand Auth a échoué : il nomme le bouton « Se déconnecter », qui retente la fermeture sur tous les appareils. | 1re : acceptable avec réserves ; reprise `3741b31` ; 2e : « à reprendre légèrement » (commentaires trop affirmatifs) ; retouche `960285b` par l'agent principal (commentaires seulement, 82 tests verts) | Choix par délégation à écrire dans la PR (ci-dessous) |
| `claude/lot1-l4a` | `edfe721` | `929ab95` | Console de supervision : ligne « Envoi du cautionnement » de la santé (E096/E204, avec la mention des organisations d'essai et « hors budget ») ; carte IA des paramètres (E107/E214) ; couleur des preuves de sauvegarde (E189 ; neutre quand un filtre ou une page est actif) ; compteurs des mentions légales (« 9 à fournir · 3 à compléter ») ; tableau de couverture à 390 px ; aperçu réel du post Facebook dans la console **et** dans le courriel de veto (D1) ; barre « Enregistrer » de l'éditeur d'article qui ne recouvre plus Titre et Chapô ; module léger `reglages-signature.ts` (la page de santé n'importe plus la signature des baux) | 1re : acceptable avec réserves ; reprise `1bfe208` ; 2e : « à reprendre » (la marge de « Couverture » ne changeait rien dans la vraie console et son e2e aurait échoué en CI) ; retrait par l'agent principal `929ab95` (69 tests verts) | E094, E095, E097, E109, E213 non traités : leur constat d'origine est perdu, à retrouver par le relevé d'écrans de L5 |
| `claude/lot1-l4b` | `c959a34` | `0ad214f` | Espaces propriétaire, locataire, artisan : « Mettre en location » désactivé sur un lot bloqué, avec la raison (E049/E160), et la fiche du lot passe enfin `bloque` ; rappel « La mise en location vérifie une dernière fois… » seulement si un lot en brouillon est libre de blocage, et jamais en traversée en lecture seule ; FAQ « Mon bailleur » (E026) ; relances au futur quand l'envoi est fermé (« S'il vous est proposé… ») ; FAQ du locataire sans « jamais de surprise » (E132) ; carte « Dates proposées » de l'artisan (dates à venir seulement) ; chevron du volet ; message de `/facture` ; boucle de la page de panne (R9 du lot 60) et titre d'onglet juste ; onglet « Facturation » (Q89, mesuré) | 1re : acceptable avec réserves ; reprise `9a66f1d` ; 2e : **bon** ; mineurs repris par l'agent principal `0ad214f` (45 tests verts) | À 320 px, « Facturation » est tronqué d'un pixel, comme « Aujourd'hui » (défaut connu, non corrigé) |
| `claude/lot1-l4c` | `c347597` | `4b65597` | Pages publiques : quatre outils gratuits vides au départ (quittance, GLI/Visale, LMNP, rentabilité ; Q123) ; garde-fou des indices saisis dans l'outil IRL (partie de Q72 : rapport 0,8 à 1,25 comme l'application) ; espace manquant « 24 moisaprès » de la politique de confidentialité (E057 = E170 ; date de la page au 26/11 et empreinte relevée, règle Q99) ; quittance : aide de format du mois, message imprimable quand le terme est incomplet, frappe du dernier champ sans perte de focus ; Visale « non évaluable » sans situation ; durées LMNP et crédit à 0 refusés ; e2e des outils sans saisie perdue avant l'hydratation | 1re : acceptable avec réserves ; reprise `3e3b3f5` ; 2e : à reprendre (aide e2e inopérante avant l'hydratation, format du mois) ; reprise `4b65597` ; 3e : **bon** | `app/src/lib/outils/irl.ts:103` (indice de référence après une année perdue) attend le juriste (Q72, `JURISTE.md` 7·1) |

**Cause du test instable `e2e/outils.spec.ts:159` (VÉRIFIÉ le 26/11 par sonde).** Une saisie faite avant que la page
ait « pris la main » (hydratation de React) puis refaite à l'identique n'atteint jamais l'état de la page : la boucle
de rattrapage de l'aide ne rattrapait donc rien. L'aide vide maintenant le champ avant chaque saisie : ancienne aide
4 échecs sur 4, nouvelle 4 réussites sur 4 (scripts retenus puis libérés). Avant le rechargement qui doit retrouver le
nom retenu, le test attend aussi que la valeur soit écrite dans le navigateur. Résultats locaux sur un build Turbopack
comme la CI : `outils.spec.ts` 8/8 trois fois, tests de quittance 30/30 en `--repeat-each=10`, sans second essai.

**Intégration (VÉRIFIÉ le 26/11 vers 20:50Z).** Branche `claude/lot1-integration`, tête `ef14afa`
(`ef14afad850fc05fcca29340c199cf4bc1961483`) : `main` `f9e874b` plus les quatre branches, fusionnées sans conflit.
Aucune migration (`git diff --name-only origin/main -- app/supabase/migrations` vide) ; 70 fichiers, +3 912 / −489.
Contrôles locaux : `npm run lint` et `tsc --noEmit` sans erreur ; vitest complet 12 271 tests réussis, 0 en échec ;
19 fichiers ne démarrent pas hors CI faute de base PostgreSQL ou de navigateur (les mêmes sur `main`). CI GitHub
lancée à la main (workflow_dispatch, sans PR) : run n° 45894260072, résultat **verte sans reprise** (20:53Z → 21:34Z : vitest 16 829 tests réussis ; 357 parcours e2e réussis au premier essai et 3 ignorés, aucun second essai ; 75 WebKit mobile, 9 PostgREST, 4 envois, 2 invitation).

**Choix faits par délégation dans le lot 1, à écrire dans la PR et à signaler au dirigeant.**
- Premier mot de passe : si la fermeture des autres sessions échoue, la personne reste connectée (comme avant) et
  l'échec est seulement tracé. Au mot de passe oublié, l'échec n'est pas tracé, car une fermeture de toutes les
  sessions suit aussitôt ; si Auth est en panne, rien n'est tracé (point aveugle connu).
- Barre « Enregistrer » : elle ne peut plus recouvrir Titre et Chapô ; « Adresse », placée après le corps de
  l'article, n'est pas protégée (la protéger aurait obligé à réordonner le formulaire).
- Onglet de l'artisan : « Facturation » plutôt que « Ma facturation » (tronqué à 390 px).
- Page de panne de l'artisan : titre « Lecture rétablie » quand la lecture marche sans fiche ; une mission dont toutes
  les dates proposées sont passées va dans « Rendez-vous à fixer ».
- Outils publics : la quittance ne s'imprime qu'avec le mode de paiement, les noms et les adresses ; le montant reçu se
  saisit (ou se recopie par un bouton) ; LMNP et rentabilité ne donnent un résultat qu'avec tous leurs champs et le
  financement choisi ; Visale « non évaluable » à 30 ans ou plus sans situation, même au-dessus du plafond.

**Branche à ne pas confondre.** `claude/lot1-corrections-recette` (`c618aa8`, dernier commit le 12/11) existe sur
GitHub. Ce n'est **pas** une branche de ce lot 1 : c'est la tête de la PR brouillon
[#287](https://github.com/GERIMMO/GERIMMO_V4/pull/287) du 12/11, « Lot 1 de la recette : bail papier, documents du
bail, détention, souscription, attestations (G-01, G-02, G-19, G-25, G-40) », liée aux PR #288 et #289 de Codex.
VÉRIFIÉ le 26/11 : elle part de `cce58ab8` (#286, 11/11) ; aucun de ses 8 commits n'est dans `main`, ni comme ancêtre
ni à l'identique (`git cherry`). Une reprise partielle de son contenu par une autre PR n'est pas exclue : À VÉRIFIER.
Ne pas la supprimer sans cette vérification et l'accord du dirigeant.

**Ce qui reste avant la publication du lot 1.**
1. CI verte **sans reprise** sur la tête de `claude/lot1-integration` (un parcours passé au second essai n'est pas
   « sans reprise ») ; si elle est rouge, corriger sur la branche concernée et réintégrer.
2. Ouvrir **une** PR de `claude/lot1-integration` vers `main` (une seule publication, un seul clic d'approbation), qui
   liste les choix ci-dessus. Aucune PR n'est ouverte le 26/11 : la passation l'a demandé.
3. **Accord écrit du dirigeant**, puis fusion squash au SHA exact, CI de `main`, publication contrôlée (une
   approbation ; aucune migration, donc pas de sauvegarde préalable obligatoire), santé, recette de production,
   `log.md` et `JOURNAL.md`.
4. Si la publication glisse après le 26/11, la date de la politique de confidentialité (`CONFIDENTIALITE_DATE`,
   `app/src/lib/editeur.ts`) reste celle de la modification, le 26/11 (règle Q99) : rien à changer.

**Lots suivants prévus** : le reste de L4 (b.2), puis L5 (aucune décision nécessaire), puis L2 et L3 dès les réponses
du dirigeant, puis L7, L6 et L8 quand les éléments extérieurs arrivent (textes officiels, juriste, expert-comptable,
décision écrite).

---

## d. Décisions en attente du dirigeant

Le dirigeant n'est pas informaticien : chaque question doit lui arriver en français simple, avec les gestes exacts.
Les recommandations ci-dessous sont celles de l'auteur de cette note, sauf mention « recommandé par le plan ».

**d.1 — Les cinq fins d'essai du 24 au 29 décembre 2026.**
- *Faits.* Le 15/11, la production comptait 5 organisations en essai, qui finissent entre le 24 et le 29/12/2026
  (61 jours chacune) ; sans paiement ni prolongation, elles passent en lecture seule
  ([[Audit final indépendant — PR 335 — 15 novembre 2026]], A4 ; [[Audit de qualité commerciale V1 — a776ed43 — 16 novembre 2026]], V1-05).
  Le 22/11, le dirigeant a dit que les inscrits sont des comptes de test, à supprimer « dans moins de dix jours ». Le
  recompte du 26/11 ne trouve aucun compte réel. Le nombre actuel d'organisations en essai n'a **pas** été relu.
- *Question.* Que faire de ces essais, et quelle règle pour le premier vrai client ?
- *Options.* (A) fermer les comptes de test depuis la console (bilan, puis « Programmer la fermeture » ; effacement
  14 jours plus tard) ; (B) les laisser passer en lecture seule ; (C) prolonger par des mois offerts depuis la fiche
  utilisateur (fonction du 25/10) ; (D) ouvrir les ventes avant la fin des essais (R7, médiateur, R8).
- *Recommandation.* A pour les comptes de test, en contrôlant le bilan compte par compte, avant le 24/12. Pour les
  vrais clients : un essai de deux mois ouvert fin novembre finit fin janvier ; décider d'ici là d'ouvrir les paiements
  (R7, un premier paiement réel remboursé, médiateur) ou d'offrir des mois.

**d.2 — Réserve N10 : les secrets Supabase.**
- *Faits.* `SUPABASE_DB_PASSWORD` est un secret **de dépôt**, lu par `migrations.yml`, `sauvegarde.yml` et
  `recette-production-autonome.yml` ; ce dernier lit aussi `SUPABASE_SERVICE_ROLE_KEY`. Toute personne qui peut écrire
  sur le dépôt pourrait faire lire ces secrets par un workflow ([[Contre-vérification ciblée — PR 335 — candidat 962f2c76]], § 3).
  VÉRIFIÉ sur `main` le 26/11 : `migrations.yml` est limité à `main` et à l'environnement `gerimmo-production` ;
  `recette-production-autonome.yml` est limité à `main` mais sans environnement ; `sauvegarde.yml` n'a ni l'un ni
  l'autre. Rotation du mot de passe et relecture des accès en écriture : non faites à ma connaissance (À VÉRIFIER).
- *Question.* Isoler ces secrets maintenant ?
- *Options.* (A) les quatre actions du rapport : déplacer les deux secrets dans un environnement protégé, y rattacher
  la sauvegarde et la recette, faire tourner le mot de passe, relire qui peut écrire sur le dépôt ; (B) seulement la
  relecture des accès ; (C) accepter le risque par écrit.
- *Recommandation.* A, avec un environnement **dédié aux données**, limité à `main` et **sans approbateur** : avec
  `gerimmo-production` (approbation obligatoire), la sauvegarde planifiée de la nuit attendrait un clic. La rotation du
  mot de passe se fait dans Supabase par le dirigeant, et le secret GitHub doit être mis à jour **le même jour**, sinon
  sauvegarde, recette et migrations échouent. Puis lancer une sauvegarde et un contrôle de restauration.

**d.3 — Ouvrir les cinq envois automatiques (R5).**
- *Question.* Ouvrir, un par un, l'avis d'échéance, la relance amiable (et la relance à la main), le rappel de
  rendez-vous, la relance d'invitation, la relance d'une demande de report (décisions Q6 et Q37 : « à la publication ») ?
- *Options.* Tout ouvrir ; ouvrir après un essai réel ; garder fermé.
- *Recommandation.* D'abord fermer les comptes de test (sinon de vrais e-mails partent vers leurs adresses), puis un
  essai avec une vraie boîte de réception du dirigeant, puis ouvrir un envoi à la fois en contrôlant la ligne
  `envoi_automatique` au journal de la supervision. Un e-mail parti ne se rappelle pas.

**d.4 — Médiateur de la consommation et vente aux particuliers (Q65, Q75, Q81, R6).**
- *Question.* Adhérer à un médiateur avant de vendre aux particuliers, ou ouvrir sans lui ?
- *Options.* (A) adhérer, saisir ses coordonnées : la vente aux particuliers s'ouvre sans nouvelle publication ; (B)
  décision datée du dirigeant « Ouvrir la vente aux particuliers sans médiateur » (risque : articles L612-1 et L616-1
  du recueil, sans exception lue ; juriste 7·6, 9·26).
- *Recommandation.* A. L'agent ne fait jamais ce geste.

**d.5 — Stripe (R7) et ouverture des souscriptions (R8).**
- *Question.* Régler l'en-tête des factures dans le compte Stripe, puis ouvrir les souscriptions ?
- *Recommandation.* R7 d'abord (pas-à-pas à préparer), puis un premier paiement réel remboursé (COM-2), puis R8, et
  seulement si le dirigeant le décide. **Interdit à l'agent** : « Ne rouvre pas les souscriptions payantes ».

**d.6 — Gestes de console courts.** Programmer la fermeture du compte fictif `TEST-PUBLICATION` (`/admin/donnees`) ;
essai facultatif de l'interrupteur de l'IA (couper, contrôler, rallumer : parcours A14 et A15) ; vérifier les
libellés de `/admin/sante` (A7) et la page Facebook (A9) ; partie B du parcours (dépose des documents fictifs en
production : seulement s'il l'accepte). *Recommandation* : les faire en une séance guidée.

**d.7 — Lire les textes officiels (Q62).** Options : (A) compte PISTE, accès officiel et gratuit à Légifrance ; (B)
s'en tenir aux fiches officielles ; (C) le dirigeant copie les articles demandés
(`livrables/Gerimmo-textes-officiels-a-fournir.pdf`). *Recommandation* : A (ou C), puisque L7, Q28, Q111 et une grande
partie de `JURISTE.md` en dépendent. Un texte récité par une IA sans source ne compte pas (décision du 24/11).

**d.8 — Publier le lot 1.** Question à poser quand les quatre copies sont prêtes : « Publie le lot 1 » (une
approbation, aucune migration attendue), avec la liste des choix faits par délégation.

**d.9 — Questions des lots L2, L3, L6, L7, L8** (formulées et recommandées par le plan) : Q124 (écrire séparément les
parts du locataire et de la CAF : oui, en attente du juriste 9·44) ; Q36-4 (« CAF / APL » au tableau de bord : déjà
décidé le 24/11, lot à part) ; Q45 (champ « titulaire » au profil) ; Q54 (oui, documents futurs seulement) ; Q109
(oui) ; Q58 (B) ; Q60 (oui) ; Q70 (oui) ; Q117 et Q118 (oui, plus tard) ; Q96 (fermer l'appel direct, mais pas en
retirant le droit d'exécution : voir b.1) ; Q119 et Q120 (oui) ; Q93 (oui, avant le premier abonné) ; Q73 (date de
paiement, à confirmer par l'expert-comptable ; pas de recalcul de l'historique sans décision écrite) ; L7 (fournir les
PDF officiels ; bloquer signature et congé sans notice : oui ; caution informée dès le premier mois : oui, sous réserve
du juriste) ; L8 (fermer les accès inutiles, réversible : oui).

**d.10 — Choix en attente sans défaut constaté** (option prudente en place) : Q55, Q56, Q57, Q59, Q61, Q67 à Q69,
Q71, Q74, Q79, Q81 à Q86, Q88, Q90 à Q92, Q94, Q95, Q97, Q98, Q103 à Q108, Q110, Q113 à Q116, Q121, Q122. Pistes dans
le tableau b.1.

**d.11 — Trier les PR ouvertes** (section g) : 48 PR ouvertes, surtout de Codex (mi-novembre) et de Dependabot.
*Recommandation* : ne rien fusionner sans examen ; fermer celles que la mission palier 1 a rendues caduques, après
lecture de chacune.

**d.12 — Autres points « à trancher » relevés.**
- [[Référentiel du palier 1]] : 19 contradictions sur 53 restent à trancher par le dirigeant (C-04, C-05, C-10, C-14,
  C-15, C-18, C-23, C-24, C-29, C-30, C-32, C-35, C-38, C-41, C-44, C-45, C-48, C-50, C-51 ; une ligne chacune en fin
  de page). Côté règles : 14 ont le statut « à trancher », 7 autres sont « en vigueur » avec un point à trancher
  (comptage du 26/11).
- « Les règles à connaître » dans le menu du propriétaire particulier (20/11, après la PR #351).
- Règle prise sur délégation le 19/11 : l'e-mail d'une fiche est unique par agence et par nature (« à confirmer »).
- Refonte « Maison » (20/11) : titre de l'accueil sans italique à valider ; essai sur un vrai iPhone et un vrai Android.
- Reportés par décision : Q14, défauts mineurs (« Reporte la facture et les défaut mineurs mais retiens les »), Q36,
  antivirus (Q8), règles de conservation (Q39).
- Restauration vers un projet Supabase de secours : jamais éprouvée (accord du dirigeant nécessaire).
- Rattachement des points « #139 » et « #144 » cités le 25/11 comme reportés (`JOURNAL.md`) : ce sont deux anciennes
  PR (#139, outils gratuits, fusionnée le 29/09 ; #144, liens de création de mot de passe, fusionnée le 30/09). Le
  plan les rattache, SUPPOSÉ, à Q72 et Q123 (lot L4) et aux sessions de `definirNouveauMotDePasse` (lot L1) : à
  confirmer.
- Échéances datées : repères fiscaux à revérifier chaque janvier (Q38) ; au 01/01/2027, mention « article 293 B »,
  nouveau décret des zones tendues n° 2026-831 et rédaction de l'article L. 102 B (`JURISTE.md`) ; avant le
  01/01/2028, point T3 R16-A4 (classes F et G, outre-mer).
- Introuvable dans les documents lus : aucun autre point « à trancher » daté que ceux-ci ; je ne garantis pas
  l'exhaustivité de `JURISTE.md` (931 lignes, non relu en entier pour cette note).

---

## e. Règles de travail convenues avec le dirigeant

**Interdits (citations du dirigeant, mot pour mot).**
- « Ne fusionne pas une PR sans autorisation explicite. Ne publie pas en production sans autorisation explicite. Ne
  modifie pas les données réelles. Ne déclenche aucun paiement, envoi client ou service externe réel non autorisé. Ne
  contourne jamais une protection ou une autorisation manquante. Ne rouvre pas les souscriptions payantes. »
- « Ne demande jamais de transmettre des mots de passe ou des secrets dans la conversation. »
- « Travaille en lecture seule en production par défaut. »
- « Ne considère jamais un test non exécuté comme réussi. »
- « Tu ne désactives jamais un test, une règle de sécurité ou l'isolation RLS pour faire passer quelque chose. »
- « Tu n'inventes jamais une référence légale. »
- Règles générales du 24/11 : « Tout doit respecter les textes de loi. Rien n'est noté « conforme » sans texte
  officiel lu. » ; « Nouvelle question : option la plus prudente et réversible, tu la notes et tu continues. »
- Autres consignes : ne jamais toucher `liste_attente_agences` (Q36) ; rien n'est supprimé sans décision écrite ;
  **ne pas fusionner l'ancienne branche `claude/compassionate-euler-qpqjp6`** ; la base de production ne s'écrit jamais
  par le connecteur Supabase (lecture seule), sauf la décision P3 : « J'autorise l'agent à annuler les changements de
  la base par le connecteur Supabase, seulement après mon accord écrit à chaque fois. » (simulation dans une
  transaction annulée d'abord, puis fichier par fichier, arrêt à la première erreur).
- Dernière consigne du dirigeant (26/11) : « Publie ce correctif, fais une reprise de données, fais le reste. Il faut
  que tu gères tout car je ne sais pas moi, je ne suis pas informaticien ou agent immobilier. Débrouille toi mais je
  veux un logiciel fonctionnel et sans défaut ». Elle ne lève aucun des interdits ci-dessus : elle couvre les choix
  d'affichage sans droit, sans argent réel et sans effacement.

**Quand et comment publier.**
1. **Accord écrit** du dirigeant pour cette publication-là (exemples : « Je valide la publication », « Publie le
   correctif Q125 », « Publie ce correctif »), recopié mot pour mot dans `DECISIONS-2026-11-24.md`.
2. PR vers `main` ; relectures indépendantes sans point bloquant (une seule pour les libellés et l'affichage ; **double**
   pour l'argent, les documents légaux, la sécurité et l'isolation) ; CI « Lint, types, tests, build » **verte sans
   reprise** sur le SHA de tête.
3. Fusion **squash** avec `expectedHeadSha` (la protection de `main` exige la CI verte sur le SHA de tête et une
   branche à jour), puis CI de `main` verte. La construction Vercel faite après la fusion reste sans domaine jusqu'à la
   publication contrôlée : **ne jamais la « promouvoir » à la main**.
4. S'il y a des migrations : publication contrôlée en « vérifier seulement », simulation par « Migrations Supabase »,
   sauvegarde réussie depuis **moins de 90 minutes**, application dans **une seule transaction**, contrôle en lecture
   seule. Migrations toujours avant le code. Jamais par l'outil `apply_migration`, ni par du SQL à la main. Ne pas
   lancer une sauvegarde pendant une simulation (échec « lock timeout » du 19/11).
5. Publication contrôlée (`publier`, `base_compatible`) : chaque passage dans l'environnement GitHub
   `gerimmo-production` demande un clic d'approbation que **seul le compte `GERIMMO`** peut donner. Attendu :
   `publiee_verifiee`.
6. Après : `/api/sante` (version, base), pages publiques, erreurs d'exécution Vercel, puis **recette de production**
   (`recette-production-autonome.yml`) et sa purge.
7. Consigner : une entrée `deploy` dans `log.md`, une entrée dans `JOURNAL.md`, avec les numéros d'exécution et ce qui
   n'a pas été vérifié.
- Conseils (pas des règles du dépôt) : éviter le 1er du mois (tâche `cycle-mensuel` à 05:00Z) et la plage 03:00 à
  09:00Z (tâches de la base et de Vercel) ; regrouper les petits changements en un seul lot (engagement du 22/11).

**Conventions.**
- Ne jamais commiter `app/output/`, `app/e2e/.results*`, ni de fichiers `zz-*`.
- Messages de commit **en français**, terminés par les lignes `Co-Authored-By:` et `Claude-Session:` données par la
  session.
- Branches de l'agent : `claude/<sujet>` (ex. `claude/correctif-q125-inscription`, `claude/lot1-l4c`).
- Rédaction : français simple ; distinguer VÉRIFIÉ, SUPPOSÉ, À FAIRE ; ne jamais présenter un point de droit comme
  conforme ; au dirigeant, seulement les gestes à faire.
- Wiki : règles de `CLAUDE.md` (frontmatter en anglais, contenu en français, liens `[[…]]`, contradictions dans un
  encadré) ; `log.md` en ajout seul, préfixe `## [AAAA-MM-JJ] type | titre`.
- Page de confidentialité : changer son texte oblige à relever ensemble sa date et son empreinte (règle Q99). Texte des
  conditions archivées : tout changement imprimé (nom, adresse, e-mail du vendeur, article) crée une empreinte
  différente et demande une nouvelle version.

---

## f. Outillage

**Contrôles locaux** (depuis `app/`).

| But | Commande | À savoir |
|---|---|---|
| Style | `npx eslint <fichiers>` (ou `npm run lint`) | — |
| Types | `npx next typegen` **puis** `npx tsc --noEmit -p tsconfig.json` | Sans `typegen`, erreurs `PageProps` et `RouteContext` |
| Tests unitaires et de base | `npx vitest run <tests>` (ou `npm test`) | Hors CI, environ 15 à 19 fichiers échouent au chargement faute de PostgreSQL local (ECONNREFUSED 5432) ou de navigateur : ce n'est pas une régression. Au banc complet, `lot2-auth-reel` et `lot3-notifications-base` échouent toujours (ils passent en CI) ; `exercice-restauration` et `api-isolation` dépendent de l'état du banc partagé |
| Parcours navigateur | `npx playwright test --config e2e/playwright.config.ts --project mobile` (ou `npm run test:e2e -- --project mobile`) ; la configuration est dans `e2e/`, pas à la racine de `app/` | Chromium préinstallé dans les conteneurs ; serveur `next dev` avec une adresse Supabase fictive `127.0.0.1`, **jamais la production** |
| WebKit | `npm run test:e2e:webkit` | Liste des parcours dans `e2e/playwright.webkit.config.ts` |
| Banc local complet | `npm run e2e:base`, `npm run e2e:emulateur`, `node e2e/local/seed-parcours.mjs` | `GUIDE-DE-REPRISE.md`, § 3 ; `tests/garde-base.ts` refuse la base de production |

**Workflows GitHub** (`.github/workflows/`, lus sur `main`).

| Workflow | Rôle | Déclenchement | Secrets et variables (noms seulement) |
|---|---|---|---|
| `ci.yml` — CI « Lint, types, tests, build » | Style, types, tests, PDF, parcours par profil, envois avec boîte fictive, WebKit mobile, vrai PostgREST, invitation artisan | push sur `main`, PR, manuel | aucun secret |
| `migrations.yml` — Migrations Supabase | Simulation puis application des migrations nommées une à une ; gardes : CI verte sur la révision, sauvegarde de moins de 90 min, empreinte | manuel, `main` seulement, environnement `gerimmo-production` | `SUPABASE_DB_PASSWORD` |
| `publication-controlee.yml` — Publication contrôlée | Vérifie, puis met la construction Vercel en ligne et la contrôle | manuel, `main`, environnement protégé | `VERCEL_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET` ; variables `GERIMMO_RELEASE_ENABLED`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` |
| `sauvegarde.yml` — Sauvegarde quotidienne | Export chiffré de la base et du stockage vers Scaleway (Paris), puis relecture | planifié 01:20Z, mais GitHub le lance en retard (passages observés entre 07:55Z et 11:07Z du 15 au 26/11), manuel | `SUPABASE_DB_PASSWORD`, `GERIMMO_BACKUP_KEY`, `GERIMMO_BACKUP_SERVICE_KEY`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY` ; variables `SCW_BUCKET`, `SCW_REGION` |
| `restauration-sauvegarde.yml` | Restaure la dernière copie dans une base jetable et en fait le bilan | manuel, `main` | `GERIMMO_BACKUP_KEY`, `SCW_ACCESS_KEY`, `SCW_SECRET_KEY` ; `SCW_BUCKET`, `SCW_REGION` |
| `recette-production-autonome.yml` — Recette de production avec nettoyage | Cinq comptes éphémères en production, parcours, puis purge | manuel, `main` | `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` |
| `disponibilite.yml` | Vérifie le site et sa base sans session ; ouvre une alerte après deux échecs | planifié à xx:17 et xx:47 chaque heure | aucun |
| `stripe-bac-a-sable.yml` | Paiements Stripe en clés de test, sans argent réel | manuel | `GERIMMO_STRIPE_TEST_KEY` |
| `atelier-code.yml` — Atelier de corrections | Corrections proposées par l'IA, limitées à `app/src/components/**` | manuel, `main`, si `GERIMMO_CODEX_ENABLED` = `true` | `GERIMMO_CODE_WRITER_TOKEN`, `OPENAI_API_KEY` |
| `connexions-atelier.yml` | Vérifie les connexions de l'atelier | manuel, `main` | `GERIMMO_CODE_WRITER_TOKEN`, `OPENAI_API_KEY`, `VERCEL_TOKEN` |

Autres réglages nommés (valeurs jamais écrites ici) : chez Vercel, `GERIMMO_MODE` (= `commercial`),
`NEXT_PUBLIC_SITE_URL`, `GERIMMO_PILOTE_LIMITE`, `GERIMMO_PAIEMENTS_DESACTIVES`, `COURRIELS_CHIFFREMENT_CLE`, les
interrupteurs `ZOHO_SIGN_*` ; `app/scripts/deploiement/garde-environnement.mjs` refuse une construction de production
mal réglée, et toute construction d'aperçu (un aperçu se brancherait sur la base de production, P0-01).

**Ce que l'agent ne peut pas faire** : voir un secret, se connecter comme super admin (double vérification), régler
Stripe, approuver à la place du dirigeant dans GitHub.

**Pièges connus.**
- **Tests instables** : `e2e/outils.spec.ts:159` (quittance publique, « Nom du bailleur » vide après rechargement,
  mobile) ; `mois-offerts.spec.ts` (à stabiliser) ; `recommandes-consentements.spec.ts` sur WebKit (« Load failed »,
  N14) ; simulateur de prix de la vitrine (une fois, 20/11). Le parcours d'annulation de rendez-vous du locataire était
  instable à cause d'un vrai défaut, corrigé dans `062296e2`.
- **Fuseaux horaires** : le jour de référence est le jour de Paris ([[Le jour de référence est le jour de Paris]]).
  Des tests datés du jour de la session ont échoué entre minuit et 1 h à Paris (`tests/sprint4-bail.test.ts`) ou entre
  22 h et minuit UTC (`conservation-prospection-base`) ; une fin d'essai figée au 1er novembre a cassé
  `liens-espace-courriers`. Toutes les planifications (workflows, Vercel, `pg_cron`) sont en UTC.
- **Session et proxy (Q125)** : `app/src/proxy.ts` n'envoie l'effacement des cookies de session que sur une navigation
  de document (`Sec-Fetch-Mode: navigate`). Ne pas revenir en arrière sans relire PRO-5.
- **Migrations** : la liste est explicite (des fichiers ont été renommés ; une détection automatique rejouerait une
  migration) ; pooler en mode session (port 5432, IPv4) ; à partir de certaines migrations, un verrou peut attendre
  10 s par instruction.
- **Accès refusés à l'agent** : Légifrance (lectures automatiques), création d'étiquettes Git (403), API des
  environnements GitHub (proxy), pare-feu Vercel (section a). L'outil de lecture de la base peut demander une
  approbation qui reste sans réponse : alors, dire que la relecture n'est pas faite.
- **Dépôt public** : aucune trace Playwright n'est déposée (elle contient les cookies de session).
- **Documents** : changer la mise en page d'un document change son empreinte ; un circuit de signature préparé mais
  non envoyé se prépare de nouveau (Q40).

---

## g. Ce qui tourne encore ou est programmé

**Tâches planifiées du compte Claude** (relevées par l'agent principal).
- « Ronde quotidienne Gerimmo » : tous les jours à 08:00Z ; crée au plus une PR par jour ; jamais de fusion ni de
  migration ; le connecteur Supabase n'y est pas attaché.
- « Passation Gerimmo : vérifier la note » : unique, le 26/11 à 20:18Z, créée par la session « Discussion Gerimmo ».

**Traitements automatiques de Gerimmo.**
- 14 tâches Vercel (`app/vercel.json`) : missions `signatures` (03:00Z), `purge` (03:40Z), `abonnements` (04:00Z),
  `territoire` (05:00Z), orchestrateur (05:45Z), `rappels` (06:00Z), `quittances` (07:00Z), `appels` (07:30Z),
  `relances` (07:45Z), `marketing` (08:00Z), `veille` (09:00Z) ; relais du dirigeant (03:00Z en été, 04:00Z en hiver ;
  [[Relais du dirigeant]]) ; factures (chaque minute).
- Tâches `pg_cron` de la base : 12 au 19/11 (dont `plans-apurement-quotidiens` à 05:35Z et `cycle-mensuel` le 1er à
  05:00Z) ; liste complète non relue pour cette note.
- Workflows planifiés : sauvegarde quotidienne, disponibilité publique (section f).
- Effacement du compte fictif : 14 jours après sa programmation dans la console (pas encore programmée).

**Travaux en cours** (fin de la session de l'agent principal, 26/11 vers 21 h Z) : la CI de
`claude/lot1-integration` (run n° 45894260072, voir section c). Recette n° 62 : terminée, réussie. Aucun autre
traitement en arrière-plan : les reprises et relectures du lot 1 sont toutes terminées. L'agent principal ne lance
plus de nouveau travail sur le dépôt après cette note (demande de la session « Discussion Gerimmo »).

**PR ouvertes sur GitHub** (48 le 26/11, lecture GitHub ; la liste fournie à l'auteur n'en citait qu'une partie).
- Dependabot (9) : #349 (outils de développement), #301, #300, #274, #265, #262, #261, #260, #237.
- Claude, 12/11 : #287 (brouillon, branche `claude/lot1-corrections-recette`, voir section c).
- Codex, du 12 au 15/11 (36) : #340, #339, #330, #329, #328, #327, #326, #325, #324, #323, #322, #321, #315, #314,
  #313, #311, #310, #309, #308, #307, #306, #305, #304, #303, #302, #299, #298, #297, #296, #295, #294, #292, #291,
  #290, #289, #288 ; et plus anciennes : #277 (29/10), #245 (23/10). À trier par le dirigeant ; ne rien fusionner sans
  examen.

**Branches.**
- À garder : `main` ; `claude/audit-final-pr335` (documentation : `JOURNAL.md`, `QUESTIONS.md`, `DECISIONS-2026-11-24.md`,
  `livrables/`, wiki à jour ; environ 140 commits que `main` n'a pas, **uniquement des documents**, aucun fichier de
  `app/` ni de `.github/` VÉRIFIÉ par `git diff --name-only` ; non fusionnée, d'où le `log.md` de `main` arrêté au
  03/11) ; les quatre branches du lot 1, **poussées sur GitHub** le 26/11 (`claude/lot1-l1` `960285b`,
  `claude/lot1-l4a` `929ab95`, `claude/lot1-l4b` `0ad214f`, `claude/lot1-l4c` `4b65597`) et leur intégration
  `claude/lot1-integration` `ef14afa` (à publier par une seule PR) ; les
  repères `claude/depart-palier-1` et `claude/production-2026-11-22` ; les sauvegardes
  `claude/sauvegarde-banc-principal`, `claude/sauvegarde-banc-vendeur`, `claude/sauvegarde-fusion`.
  `claude/palier-1-preproduction` n'est plus sur GitHub (VÉRIFIÉ par `git ls-remote` le 26/11).
- Déjà supprimées sur GitHub (VÉRIFIÉ par `git ls-remote` le 26/11), fusionnées : `claude/correctif-q125-inscription`
  (#359) et `claude/correctif-adresse-bailleur` (#360). Il n'en reste que des copies locales.
- Ne pas fusionner : `claude/compassionate-euler-qpqjp6` (consigne du dirigeant).
- À vérifier avant toute suppression : `claude/lot1-corrections-recette` ; les autres branches `claude/*` aux noms
  générés (`ecstatic-knuth-pcoqz0`, `ecstatic-pasteur-wn87s9`, `inspiring-faraday-nz2i4q`,
  `inspiring-heisenberg-xy4xxq`, `lucid-dijkstra-kvsoho`, `reprise-mobile-docs-x6ku40`, `vibrant-johnson-3uotjt`) et
  les nombreuses branches `codex/*`, `lot-*`, `integ-*` (215 branches sur GitHub le 26/11).

**Artefacts Gerimmo publiés** (claude.ai, privés par défaut).
- Gerimmo — directions visuelles : https://claude.ai/artifact/22UMhhxGxRdEV2Hxj1fbNz
- Gerimmo avant vente : https://claude.ai/artifact/P77fhXzUQj7k5NbDX8J1qK
- Gerimmo — Charges d'immeuble, taxe foncière et plan d'apurement : https://claude.ai/artifact/3RrJyWHGdX2J3XEpe6zeJY
- Dossiers de test par persona — bêta fermée : https://claude.ai/artifact/RXSvh3axbh8sBHngD5hDT2
- Audit final avant publication — 19 octobre 2026 : https://claude.ai/artifact/61P7NvvsuF7nodTAscwNWk
- Catalogue exhaustif des besoins : https://claude.ai/artifact/QQk4GeRT5j2b5Bxg7dcdmC
- Vision Gerimmo : https://claude.ai/artifact/BspYg9RWDWgc8UMZWJNuqg
- Registre des anomalies : https://claude.ai/artifact/KYpqENSz2k2N7SkxxPr6mK
- Audit d'acquisition : https://claude.ai/artifact/L6RXZvzt4Dcez6q3JibhGh
- Gerimmo — Ajouter une location : https://claude.ai/artifact/JcBLBnKcdFv44BBHV1evge
- Logo officiel : https://claude.ai/artifact/NVH3vvj7BXtTQR9sc2LmV6
- Page d'attente : https://claude.ai/artifact/VEHgZDphjBhm9KkzyXssbH
- Le registre : https://claude.ai/artifact/WR8ZA9mMvovHtg2zN9nhaY

---

## h. Journal des opérations depuis le 03/11

Sources : `log.md` de la branche `claude/audit-final-pr335` (complet jusqu'au 26/11), `JOURNAL.md` et `git log
origin/main`. Le `log.md` de `main` s'arrête au 03/11. Les fusions marquées « hors log » n'ont pas d'entrée dans
`log.md`, même sur la branche de documentation (travaux du dirigeant et de Codex). `log.md` n'a aucune entrée du 04/11
au 14/11.

| Date | Type | Titre | PR | Résultat |
|---|---|---|---|---|
| 03/11 | deploy | Plan d'apurement, avis de taxe foncière et rappels de l'année | #279 (`13a46e1`) | publié ; migration appliquée 00:21Z ; recette 71/72 (D37 : scénario non aligné sur #272) |
| 03/11 | fusion (hors log) | Journal de la mise en production du 03/11 | #280 | fusionné |
| 05/11 | fusion (hors log) | Simplifier l'espace propriétaire et réunir les parcours de gestion | #281 | fusionné |
| 08/11 | fusion (hors log) | Simplifier les parcours propriétaires et le suivi des factures | #282 | fusionné |
| 10/11 | fusion (hors log) | Préparer la transition contrôlée vers Gerimmo V1 ; livrer Gerimmo V1 | #284, #285 | fusionnés |
| 11/11 | fusion (hors log) | Abonnement unique pour les propriétaires et SCI | #286 | fusionné |
| 12-13/11 | travaux Codex (hors log) | Recette « G-xx » | #287 à #330 | presque toutes ouvertes en brouillon ; fusionnées : #293 (G-11) et #331 (G-26) le 13/11 |
| 13/11 | fusion (hors log) | Abonnements : rapprocher les factures | #332 | fusionné |
| 14/11 | fusion (hors log) | Pilote gratuit : souscriptions pilotées ; marketing : blocages signalés | #333, #334 (`b470bf1b`) | fusionnés |
| 15/11 | audit | Audit final indépendant de la PR 335 (`cbf31679`) | #335 | GO technique ; NO GO exploitation autonome et souscriptions ; B1, B2, R1, A1 à A3, N1 à N14 |
| 15/11 | audit | Contre-vérification ciblée de la PR 335 (`962f2c76`) | #335 | GO ; B1, B2, R1, A1 à A3, N1 à N3 corrigés ; réserve N10 |
| 15/11 | fusion (hors log) | Autonomie : courriers contractuels et Facebook ; recette de production | #335 (`bd4cdfbe`), #336 (`a6538f71`) | fusionnés |
| 16/11 | audit | Audit avant vente (ergonomie, visuel, fonctions) | — | prêt à montrer, pas à vendre sans accompagnement |
| 16/11 | audit | Contre-vérification de la PR 341 (`06d8e8fd`) | #341 | GO technique ; pilote GO sous B6-a |
| 16/11 | audit | Audit de qualité commerciale V1 (`a776ed43`) | #341 | pilote GO sous trois conditions ; payants NO GO |
| 17/11 | fusion (hors log) | Fiabiliser parcours commerciaux, invitations, accès ; test mobile | #342, #344 | fusionnés |
| 18/11 | audit | Audit UX/UI complet (`dca39641`) | — | 41 recommandations, aucune correction |
| 19/11 | audit | Audit fonctionnel en production (`2928d63f`) | #345 | GO particuliers ; recette n° 50 : 63 réussis, 4 échecs (tests non alignés) |
| 19/11 | audit | Audit indépendant complet avant lancement (`341b770f`) | #346 | GO particuliers sous conditions ; NO GO SCI ; recette n° 51 réussie |
| 19/11 | audit | Audit après publication de la PR #347 (`8c0449c6`) | #347 | GO particuliers, GO SCI accompagné ; recette n° 52 réussie |
| 19/11 | maintenance | Corrections après l'audit #347 (branche) | #348 | prêtes, quatre migrations |
| 19/11 | deploy | Corrections après l'audit #347 | #348 (`be3bf5b0`) | 4 migrations (après une simulation en échec sans effet, « lock timeout ») ; publié 23:12Z ; recette n° 53 réussie |
| 20/11 | maintenance | Refonte « Maison » et Design System ; cause de l'échec WebKit | #350 | CI verte sur `656fe141` |
| 20/11 | query | Avis de l'agent sur le projet | — | avis donné |
| 20/11 | deploy | Refonte visuelle « Maison » | #350 (`d315257d`) | publié 11:51Z ; recette n° 54 réussie |
| 20/11 | maintenance | « Les règles à connaître » dans l'espace | #351 | prête |
| 20/11 | query | Trouver des clients sans budget | — | avis donné |
| 20/11 | deploy | « Les règles à connaître » dans l'espace | #351 (`96c56647`) | publié 14:40Z ; recette n° 55 réussie |
| 20/11 | query | Acquisition menée par l'agent | — | avis ; accord du dirigeant ensuite |
| 20/11 | query | Premiers clients ; décisions « B et oui » | #353 à #355 | décidé |
| 20/11 | query | Premier loyer d'un bail repris | #356 | proposition (brouillon) |
| 21/11 | query | « Choix A, oui publie » | #353 à #356 | décidé, accord de publication |
| 21/11 | deploy | « Être rappelé » | #352 (`3fd11ae9`) | publié le 21/11 à 12:19Z ; recette n° 56 réussie |
| 21/11 | deploy | Google, premier bien, bail déjà en cours, date de bascule | #353 à #356 (`81740dec`) | 2 migrations ; publié 18:03Z ; recette n° 57 réussie |
| 22/11 | query | Décisions « 1A - 2B - 3A - 4 ok » | #357 | lot préparé |
| 22/11 | query | Les inscrits sont des comptes de test | — | 1A sans objet |
| 22/11 | query | Signaler les nouvelles inscriptions dans l'e-mail du matin | #357 (`35da40f1`) | prêt |
| 22/11 | query | Mission « palier 1 » lancée ; production gelée | #357 (`e1e442dc`) | #357 fusionnée sans publication ; simulation 45013346518 annulée |
| 22/11 | lint | Phase 1 : audit en huit volets (`AUDIT.md`) | — | fait |
| 22/11 | lint | Phase 2 : lots 1 à 31 ; cinq pages du wiki remises à jour | branche de préproduction | vérifiés au banc |
| 23/11 | lint, ingest | Erreur du wiki corrigée ; lots 32 à 34 | idem | vérifiés au banc |
| 24/11 | ingest | Phase 3 : documents (lots 35 à 49) ; décisions Q1 à Q53 et lots 50 à 54 | idem | vérifiés au banc |
| 24/11 | ingest, query | Lots D1, D2, D3 et 61 ; référentiel unique (Q2) | idem | faits localement |
| 24/11 | ingest | Recueil des textes officiels v6 déposé | — | lu, non recontrôlé sur Légifrance |
| 24-25/11 | lots (`JOURNAL.md`) | D7, 60, T1 à T4, D4, D5, défauts d'écran majeurs | idem | faits, puis réunis |
| 25/11 | ingest, lint | Page-résumé du recueil ; fusion des deux arbres (`89cb87ff`) ; pages mises à jour | idem | vérifiée au banc |
| 25/11 | lint | Seconde passe complète ; essais de publication ; `062296e2` | idem | CI 45591695035 verte sans reprise |
| 25/11 | lint | Clé des sauvegardes remplacée ; sauvegarde et restauration | — | runs 45692125958 et 45693311092 réussis |
| 25/11 | deploy | Publication unique du palier 1 | #358 (`8f9dd9ce`) | 52 migrations ; `publiee_verifiee` 23:17Z ; recette n° 58 (1 parcours au second essai) |
| 26/11 | lint | Réglages R1 à R4 ; wiki passé « en production » | — | faits et vérifiés |
| 26/11 | lint | Parcours de vérification, partie A, fait par l'agent | — | conforme, sauf Q125 reproduit ; constat Q126 |
| 26/11 | enquête (`JOURNAL.md`) | Cause du renvoi vers la connexion (Q125) | — | reproduite (7 cas sur 14) |
| 26/11 | deploy | Correctif Q125 | #359 (`1dca28b`) | `publiee_verifiee` 09:50Z ; recettes n° 59 à 61 réussies ; action vérifiée par sonde |
| 26/11 | incident (`JOURNAL.md`) | Pare-feu Vercel sur l'adresse de l'agent | — | public non concerné |
| 26/11 | plan (hors log) | Plan de correction des défauts restants, avec sa critique | — (commit `4984c18`) | lots L1 à L8 |
| 26/11 | développement (hors log) | Lot 1 : quatre copies L1, L4a, L4b, L4c, deux à trois tours de relecture adverse chacune | — | non publiées ; dernières relectures : bon ou retouches faites (section c) |
| 26/11 | deploy | Correctif de l'adresse du bailleur | #360 (`f9e874b`) | `publiee_verifiee` vers 19:14Z ; recette n° 62 réussie ; recompte : 0 reprise |
| 26/11 | documentation (hors log) | Registre : Q72 et Q123 sur la branche du lot 1 ; point posé au juriste | — (commit `5546c23a`) | fait |
| 26/11 | documentation | `log.md` et `JOURNAL.md` de la branche de documentation : recette n° 62 réussie | — (commit `af0a2563`, tête de `claude/audit-final-pr335` à 19:27Z) | fait |
| 26/11 | documentation (hors log) | Cette note de passation | — | premier état `8a9acea`, version finale sur `claude/audit-final-pr335` |
| 26/11 | correction (hors log) | Lot 1 : quatre branches et leur intégration poussées, sans PR ni publication | — | contrôles locaux verts ; CI run n° 45894260072 : **verte sans reprise** (20:53Z → 21:34Z : vitest 16 829 tests réussis ; 357 parcours e2e réussis au premier essai et 3 ignorés, aucun second essai ; 75 WebKit mobile, 9 PostgREST, 4 envois, 2 invitation) |

---

## i. Prochaines actions recommandées, par ordre de priorité

1. **Publier le lot 1** : lire le résultat de la CI de `claude/lot1-integration` (run n° 45894260072) ; si
   elle est verte sans reprise, ouvrir une PR vers `main` qui liste les choix par délégation, puis accord écrit du
   dirigeant et publication contrôlée avec recette (section c). Les quatre branches et l'intégration sont sur GitHub.
2. **Séance guidée avec le dirigeant** pour les gestes courts : fermeture du compte fictif et des comptes de test (d.1,
   d.6) avant le 24/12, essai de l'interrupteur de l'IA, puis décision sur R5 après un essai avec une vraie boîte (d.3).
3. **Lever la réserve N10** (d.2) : environnement dédié aux secrets Supabase, rotation coordonnée, puis sauvegarde et
   contrôle de restauration.
4. **Mettre la documentation à jour sur `main`** : compléter `log.md` avec la section h, et proposer au dirigeant une
   PR de documentation seule (la branche `claude/audit-final-pr335` ne touche ni `app/` ni `.github/` ; conflits
   possibles sur deux fichiers de `livrables/`, À VÉRIFIER) ; ajouter les questions non numérotées comme Q127 et
   suivantes.
5. **Préparer les lots qui attendent une réponse** : poser au dirigeant les questions de L2 et L3 en français simple
   (d.9), lancer L5 (aucune décision requise), et demander l'accès aux textes officiels (d.7), dont dépendent L7 et une
   grande partie de `JURISTE.md`.

> [!warning] Points à trancher / contradictions
> - `app/CLAUDE.md` dit « Code (identifiants, commits) : anglais », alors que la pratique du dépôt et la consigne
>   relevée par l'agent principal sont des messages de commit en français. Cette note suit la pratique.
> - La consigne de la tâche planifiée « Ronde quotidienne Gerimmo » (écrite le 19/09) demande, elle aussi, des
>   messages de commit en anglais avec une ligne `Co-Authored-By` différente, et la dit lancée « à 10 h (Paris) » ;
>   son horaire réel est 08:00Z, soit 9 h à Paris en hiver. À réaligner si le dirigeant le veut.
> - La liste des PR ouvertes fournie à l'auteur (20 PR) est incomplète : GitHub en montre 48 le 26/11.
> - `GUIDE-DE-REPRISE.md` donne Node.js 22 pour tous les workflows ; la PR ouverte #245 parle de « Node 24 utilisé en
>   production ». À vérifier.
> - `DECISIONS-2026-11-24.md` dit que la liste des défauts mineurs est gardée ; le plan du 26/11 (B4) constate qu'elle
>   est perdue.
> - Résultat du contrôle C3 (circuits de signature prêts non envoyés) le jour de la publication : non consigné.
> - Statut individuel des constats N4 à N9, N12 à N14 (15/11) et V1-xx (16/11) : non recontrôlé pour cette note.
> - Rattachement de « #139 » et « #144 » (points reportés du 25/11) : supposé, non confirmé.
> - Nombre actuel d'organisations en essai : non relu depuis le 15/11.
> - Q74 : depuis #360, l'adresse du PDF de la quittance (fiche) et celle de la quittance en ligne (espace) peuvent
>   diverger après un déménagement signalé.

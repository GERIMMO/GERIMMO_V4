---
type: synthesis
tags: [audit, anomalies, registre, v1, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-14
sources: []
---

# Registre des anomalies — audit du 13 octobre 2026

Registre vivant de la mission opérationnelle du 12/10/2026, tenu au fil des résultats. Version de départ de l'audit :
commit `e9f31ac` de `main` (PR #177 incluse) ; la version testée par chaque volet figure sur chaque fiche (la branche
candidate a été reconstruite et rejouée plusieurs fois). Banc local isolé et gratuit, aucun effet réel. **Chaque ligne vient
d'une observation ou d'une preuve citée par l'agent qui l'a relevée** ; une ligne « hypothèse » n'a pas été reproduite.

Gravité : **P0** sécurité critique, perte de données ou service indisponible ; **P1** parcours essentiel bloqué ou calcul
erroné ; **P2** dégradation avec contournement ; **P3** cosmétique. Statuts : *ouverte*, *corrigée en branche* (commit poussé, non déployé),
*déployée* (en production), *à trancher* (aval du dirigeant requis, y compris pour une correction déjà préparée), *acceptée*,
*hypothèse* (à vérifier), *réfutée*. Une correction partielle est écrite « à trancher » avec ce qui est fait et ce qui reste.

> [!info] Mise à jour du 14/10/2026 — déploiement
> Le dirigeant a autorisé le déploiement de la version contrôlée `0ad658a` : fusion (PR #179, `c99e2c6`), déploiement Vercel et migrations `20261013110000` et `20261013120000` appliquées en production. Les lignes de ce registre marquées *corrigée en branche* sont donc **déployées**, sauf mention contraire ; leur statut ligne par ligne n'a pas été réécrit (il reflète la rédaction du 13–14/10). PDM-01, relevée après le déploiement, est corrigée par la PR #180 (`0f7dbd5`), déployée le même jour. Détail, contrôles faits et limites : [[Dossier de validation — version candidate du 13 octobre 2026]] § 5 bis.

## Synthèse

| Gravité | ouverte | corrigée en branche | déployée | à trancher | acceptée | hypothèse | réfutée | Total |
|---|---|---|---|---|---|---|---|---|
| **P0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **P1** | 4 | 1 | 0 | 0 | 0 | 0 | 0 | **5** |
| **P2** | 0 | 34 | 1 | 30 | 1 | 0 | 0 | **66** |
| **P3** | 20 | 74 | 0 | 70 | 1 | 0 | 1 | **166** |
| **Total** | 24 | 109 | 1 | 100 | 2 | 0 | 1 | **237** |

Sources lues : artisan, auditeur/a, auditeur/b, auditeur/c, cartographie, chaine/1, chaine/1b, chaine/2, charges-fiscalite, coordinateur, designer/a, designer/b, equipes-ia, perf-liens, proprietaire/s01, relecture/finance, relecture/pr178/a, relecture/pr178/b, relecture/reprises, relecture/supervision, retour-arriere, sortie-de-bail, superadmin, verification/flux-finale, verification/pr178, verification/securite, verification/sql, verification/ts, verification/ui-finale, verification/vague10-finale.

> [!warning] Couverture à ne pas surestimer
> Ce registre ne couvre que ce que les agents ont effectivement exécuté (voir [[Registre d'exécution — audit du 13 octobre 2026]]).
> Les rôles ou volets absents de la colonne « Sources lues » n'ont pas rendu de rapport : leur absence n'est
> pas une preuve d'absence d'anomalie.

## P0 — sécurité critique, perte de données, service indisponible (0)

Aucune anomalie de cette gravité à ce jour.

## P1 — parcours essentiel bloqué ou calcul erroné (5)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `CHF-01` | charges-fiscalite | Le PDF « Récapitulatif annuel · location nue » imprime la ligne 250 (intérêts d'emprunt) d'après un champ de génération qui vaut 0 par défaut, et non d'après la rubrique 250 qualifiée de l'écran : 0,00 € au lieu de 2 345,67 €, sans alerte. | ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correc… |
| `CHF-02` | charges-fiscalite | La régularisation de charges est acceptée pour l'exercice en cours : 10 mois de provisions sont comparés à des charges réelles d'une année pleine, et le résultat « complément dû » ne peut plus être corrigé. | ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correc… |
| `PR178-B-06` | relecture/pr178/b | Encaissement après réponse perdue : la saisie conservée et le bouton actif permettent de rejouer l'envoi, et l'action serveur n'a pas de clé d'idempotence (double encaissement constaté) | ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correc… |
| `VER-TS-02` | verification/ts | Un montant « 840,00 » tapé dans un navigateur dont la langue n'est pas le français devient 84 000 € : accepté sans alerte, avec deux quittances émises | ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correc… |
| `FIN-01` | relecture/finance | Le document « Récapitulatif annuel · location nue » appelle le nouveau recapitulatifFiscal sans qualifications, composantes ni exercices : toutes les rubriques s'impriment à 0,00 €. | corrigée en branche — commit cddf339 (tests rouges puis verts) |

### Fiches P1

#### `CHF-01` — Le PDF « Récapitulatif annuel · location nue » imprime la ligne 250 (intérêts d'emprunt) d'après un champ de génération qui vaut 0 par défaut, et non d'après la rubrique 250 qualifiée de l'écran : 0,…

- **Sévérité** : P1 · **Statut** : ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correction recommandée en cours (vague 1) — D37 option B : ligne 250 préremplie avec le montant qualifié, écart signalé sur le PDF · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lot nu dont une dépense « Intérêts d'emprunt » de 2 345,67 € est qualifiée en rubrique 250, exercice confirmé, récapitulatif complet (écran et CSV : 250 = 2 345,67).
- **Étapes** : 1. Ouvrir Documents > Préparer un document > Récapitulatif annuel · location nue. 2. Choisir le lot, année 2026. 3. Laisser « Intérêts d'emprunt de l'année (€) » à sa valeur par défaut 0. 4. Générer le PDF. 5. Relire la ligne 250.
- **Attendu** : Ligne 250 = 2 345,67 € comme l'écran et le CSV, ou refus invitant à reporter le montant.
- **Observé** : PDF : « 250 Intérêts d'emprunt 0,00 € » (avec 2345,67 saisis : 2 345,67 €). Le texte d'aide du champ dit que Gerimmo ne peut pas déduire ce montant du livre, ce qui est faux depuis la rubrique 250 qualifiable. Les autres lignes sont exactes.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/captures/recap-nu-lotA-interets0.txt (250 = 0,00) ; preuves/charges-fiscalite/captures/recap-nu-lotA.txt (250 = 2 345,67 saisi) ; preuves/charges-fiscalite/captures/fiscal-final.csv ; preuves/charges-fiscalite/captures/doc-a-zero-resultat.png
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts:170 (montant:r.code==="250"?interetsEmprunt:r.montant) ; app/src/lib/documents/catalogue-options.ts:23 (champ à 0 par défaut, aide périmée)
- **Correction proposée** : Reprendre le montant de la rubrique 250 qualifiée comme valeur du champ (ou imprimer le montant qualifié et refuser une valeur différente) ; corriger l'aide. Touche un montant déclaratif : validation spécialisée recommandée.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `CHF-02` — La régularisation de charges est acceptée pour l'exercice en cours : 10 mois de provisions sont comparés à des charges réelles d'une année pleine, et le résultat « complément dû » ne peut plus être c…

- **Sévérité** : P1 · **Statut** : ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correction recommandée en cours (vague 1) — D38 option A : avertissement fort et confirmation explicite pour un exercice en cours (l'option B attend l'avis spécialisé) · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Bail nu actif depuis 2025 à 60 € de provisions par mois ; nous sommes en octobre 2026 (10 appels en 2026).
- **Étapes** : 1. Bail > Loyers & paiements > Régulariser. 2. Année 2026, charges réelles 640,00, justificatif PDF. 3. Valider.
- **Attendu** : Refus ou avertissement tant que l'exercice n'est pas clos ; sinon comparaison à provisions de même période.
- **Observé** : « Complément de 40,00 € dû par le locataire » (provisions 600,00 sur 10 mois contre 640,00 d'une année pleine). Sur 12 mois de provisions (720,00), l'écart serait +80,00 en faveur du locataire : le signe s'inverse. La ligne est enregistrée, émise et, d'après la fonction, ne se modifie plus.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/tableau-attendu-obtenu.md (lignes « Régularisation A 2026 ») ; preuves/charges-fiscalite/ref.json (regul_A_2026_si_annee_pleine)
- **Cause probable** : app/supabase/migrations/20260929130000_audit_gestion.sql:86 (seule garde : annee > année courante)
- **Correction proposée** : Refuser, ou avertir et exiger une confirmation, tant que make_date(annee,12,31) n'est pas passé. Règle de droit non confirmée par une source officielle : validation spécialisée recommandée.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PR178-B-06` — Encaissement après réponse perdue : la saisie conservée et le bouton actif permettent de rejouer l'envoi, et l'action serveur n'a pas de clé d'idempotence (double encaissement constaté)

- **Sévérité** : P1 · **Statut** : ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correction recommandée en cours (vague 1) — D05 option A : clé d'envoi unique (encaissement de loyer d'abord, puis dépôt de garantie et écriture libre) · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte gérant (admin.alpha ou propriétaire) sur un bail avec appels ; réseau qui coupe la réponse après traitement par le serveur (simulé : route.fetch puis abort).
- **Étapes** : 1. Saisir 2 € dans « Saisir un encaissement », « Encaisser ». 2. La réponse est perdue : lire le message. 3. Cliquer de nouveau sur « Encaisser ».
- **Attendu** : Un seul encaissement ; ou impossibilité de renvoyer sans avoir rouvert le dossier.
- **Observé** : Après l'étape 2 : l'encaissement est déjà enregistré, le formulaire garde 2 et le bouton reste actif ; l'étape 3 crée un second encaissement de 2,00 € (2 lignes en base). L'invitation « Vérifiez le dossier avant de recommencer » n'est pas actionnable sans quitter la page, et quitter la page déclenche en plus l'avertissement « modifications non enregistrées ». Corrigeable ensuite par « Retirer » (journal), mais le déclencheur a pu émettre un reçu en trop. Avant la PR, la même panne affichait la page d'erreur (formulaire perdu), pas un formulaire prêt à rejouer.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/PR178-B-encaissement-reponse-perdue.png ; scripts/rejeu1.mjs
- **Cause probable** : src/app/actions/loyers.ts:ajouterEncaissement (insert sans clé) ; idem encaisserDepot (depot.ts) et ajouterEcriture (compta.ts), lecture seule, non reproduits pour ces deux-là. Seules parc.ts (creation_id), auth.ts et retours.ts (cle_envoi) portent une clé. src/lib/use-action-state-protegee.ts conserve la saisie et ne désactive pas l'envoi après l'échec.
- **Correction proposée** : Ajouter un champ caché cle_envoi (UUID par formulaire monté, régénéré après succès confirmé) et une contrainte d'unicité sur l'encaissement ; à défaut, après une réponse perdue, remplacer le bouton par « Vérifier l'encaissement » qui relit l'état du bail avant de réarmer l'envoi. À arbitrer P1 si l'on juge l'avertissement insuffisant face à l'effet comptable et au reçu envoyé au locataire.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VER-TS-02` — Un montant « 840,00 » tapé dans un navigateur dont la langue n'est pas le français devient 84 000 € : accepté sans alerte, avec deux quittances émises

- **Sévérité** : P1 · **Statut** : ouverte — classée P1 bloquante par le dirigeant le 14/10/2026 (Q3/Q5) ; présente dans la version déjà déployée ; correction recommandée en cours (vague 1) — D04 : lecture de la virgule achevée sur les champs restants et confirmation au-delà de 2 × (reste dû + un terme) ; acquis déjà déployé : 36 champs en texte décimal (vagues 5b et 10) · **Propriétaire** : à désigner par le dirigeant
- **Rôle / source** : vérificateur adverse ts (verification/ts) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Navigateur dont la langue d'interface n'est pas le français (le Chromium du banc est en anglais, quel que soit le contexte « fr-FR » de la page), champ Montant en type=number (formulaire d'encaissement du bail ; les autres formulaires de montant sont identiques)
- **Étapes** : 1. Connecté en propriétaire direct, ouvrir un bail dont 2 termes de 840 € sont appelés. 2. Taper au clavier 840,00 dans Montant (date du jour). 3. Valider.
- **Attendu** : 840,00 € encaissés, ou au minimum une alerte devant un montant 100 fois supérieur au dû
- **Observé** : Le navigateur lit la virgule comme séparateur de milliers : valeur envoyée « 84000 ». Le serveur l'accepte (borne 9 999 999,99 sans rapport avec le dû) : « 84 000,00 € encaissés … septembre 2026 soldé → quittance ; octobre 2026 soldé → quittance · 82 320,00 € en avance sur le prochain appel ». Base : 1 encaissement de 84000, 2 quittances. La suppression de l'encaissement (contre-écritures) permet de revenir en arrière. Un double clic n'a créé qu'un seul encaissement
- **Preuve expurgée (banc)** : preuves/verification/ts/e2e-encaissement-succes.mjs ; preuves/verification/ts/e2e-encaissement-succes.png ; preuves/verification/ts/etat-banc-final.txt
- **Cause probable** : Champs name="montant" en type="number" (formulaire-loyers.tsx:354, formulaire-depot.tsx:159, fenetre-lot.tsx:626 et :1279…) : le navigateur normalise la saisie avant que lireMontant (qui sait lire la virgule) ne la voie ; aucun contrôle de plausibilité par rapport au dû
- **Correction proposée** : Passer ces champs en type="text" inputMode="decimal" (le serveur lit déjà « 840,00 » et « 840.00 ») ; ajouter côté serveur une confirmation explicite quand le montant dépasse largement le dû (ordre de grandeur à fixer par le dirigeant)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `FIN-01` — Le document « Récapitulatif annuel · location nue » appelle le nouveau recapitulatifFiscal sans qualifications, composantes ni exercices : toutes les rubriques s'impriment à 0,00 €.

- **Sévérité** : P1 · **Statut** : corrigée en branche — commit cddf339 (tests rouges puis verts) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Propriétaire direct, lot nu avec 3 loyers encaissés (3 x 840 €, composantes bien capturées par le déclencheur) et 3 dépenses (assurance 300, travaux 1 200, taxe foncière 900) en 2026. Il génère le document « Récapitulatif annuel · location nue » depuis le catalogue (intérêts 0). Le PDF stocké dans la GED affiche 211 = 0,00 €, 223/224/227 = 0,00 € et « Périmètre : 6 écritures enregistrées », puis affirme « Les loyers et provisions sont ventilés selon les montants du bail enregistrés lors de la génération ». L'ancienne fonction (1e464f1) donnait 211 = 2 340, 223 = 300, 224 = 1 200, 227 = 900. Le générateur passe encore l'option ventilationLoyers, que la nouvelle fonction ignore, et ne lit jamais fiscal_encaissements_composantes ni fiscal_qualifications_ecritures ; il n'affiche pas non plus les alertes « à qualifier ». Le test de la PR ne vérifie que la présence des intérêts d'emprunt (« 1…
- **Preuve expurgée (banc)** : preuves/relecture/finance/ts/extrait_document_recap_fiscal_nu.txt (sortie du vrai assemblerComplementGestion, lignes lues dans la copie gerimmo_ci_rel_finance) ; comparaison ancien/nouveau : exécution de preuves/relecture/finance/ts/t2.mts (ancien 2340/300/1200/900 ; nouveau 0 partout, 3 alertes) ; banc 3100 non utilisé (la génération écrirait en GED sur la base d'intégration). Chemin HTTP/PDF non exercé, calcul et HTML exercés.
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts:131-148 (appel à recapitulatifFiscal ligne 143)
- **Correction proposée** : Faire charger au générateur les mêmes données que l'écran (qualifications, composantes, exercices du lot et de l'année) et appeler recapitulatifFiscal avec exigerPerimetre:true ; imprimer les alertes et « à compléter » à la place de 0,00 € ; retirer la phrase sur la ventilation par les montants du bail. À défaut, refuser le document avec un message renvoyant à l'écran fiscal tant que des pièces sont à qualifier.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : documents « récapitulatif nu » produits depuis la mise en ligne (à ouvrir : rubriques à 0,00 € attendues). select d.id, d.organization_id, d.titre, d.created_at from public.documents d where d.titre = 'Récapitulatif annuel · location nue' and d.created_at >= '2026-10-12' order by d.created_at;`

## P2 — dégradation avec contournement (66)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `ARC-02` | artisan | Chantiers externes : heures de rendez-vous et d historique affichées en UTC (2 h d écart avec l heure de Paris saisie et avec les interventions Gerimmo) | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-affichage.test.ts |
| `AUD-A-01` | auditeur/a | Un agent restreint modifie les équipements d'un lot hors de son portefeuille (RPC definir_equipements_lot) | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — garde de portefeuille, test rouge puis vert |
| `AUD-A-02` | auditeur/a | L'annulation d'une écriture comptable (contre_ecriture) n'enregistre pas son auteur | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit avec auteur |
| `AUD-A-03` | auditeur/a | L'annulation d'une mission artisan (annuler_mission) ne garde ni auteur ni événement | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — événement « mission annulée » au fil de l'inci… |
| `AUD-A-04` | auditeur/a | La suppression d'une détention (quote-part de propriété d'un lot) ne laisse aucune trace | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit « détention supprimée » |
| `AUD-B-01` | auditeur/b | E-mails de relance, d'appel et de rappel : valeurs saisies insérées sans échappement HTML | corrigée en branche — 35b2501 — les valeurs saisies sont échappées dans les quatre courriers, 7 tests rouges puis verts |
| `AUD-B-02` | auditeur/b | Aucune limite de longueur à l'inscription : un nom très long rend le compte inutilisable (HTTP 431 sur tout le site) | corrigée en branche — bf73fdc — garde de longueur côté serveur et maxLength, 2 familles de tests |
| `AUD-C-01` | auditeur/c | Un encaissement a 3 decimales (ou 0,004 EUR) et date dans le futur est accepte et ecrit au journal comptable | corrigée en branche — 0555f43 pour la saisie ; les contraintes CHECK en base ne sont pas ajoutées (données de productio… |
| `PRO2-14` | chaine/1b | La justification de la qualification, rédigée comme note de décision, est affichée mot pour mot au locataire sans que le formulaire le dise | corrigée en branche — 611dce2 — le formulaire dit que la justification est montrée au locataire |
| `MKT-01` | coordinateur | La préparation du soir du marketing n'a jamais été déclenchée par pg_cron : pas de fenêtre de veto la veille, seul le rattrapage de la matinée préparait les posts | corrigée en branche — commit 9d5ed9d ; migration 20261013110000 à appliquer en production |
| `PUB-01` | coordinateur | Le formulaire « Agences » de l'accueil était le seul canal de contact des pages légales (exercice des droits sur les données) tant que l'adresse de l'éditeur manque ; il restait une demande de devis commerciale | corrigée en branche — commit e7982a7 |
| `DES-A-01` | designer/a | Au clavier, sur mobile (≤640 px), le champ ou le bouton qui reçoit le focus est entièrement masqué par la barre d'onglets fixe du bas | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-A-09` | designer/a | Menu « Plus » mobile (tiroir modal) : le focus ne passe pas dans le tiroir à l'ouverture et la touche Tab en sort vers la page cachée derrière | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-A-13` | designer/a | Tablette (≤ 1023 px) : le menu du propriétaire est un rail d'icônes sans libellé, alors que celui du locataire garde les libellés sous les icônes | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-B-01` | designer/b | Artisan : sur 390 px, Agenda, Demandes de devis et le détail d'une demande débordent horizontalement dès qu'un nom d'organisation est long (recoupe ARC-05, étendu à trois écrans) | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-B-02` | designer/b | Artisan : le focus clavier passe sous la barre d'onglets fixe du bas (390 et 768 px), même défaut que DES-A-01 côté propriétaire | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-B-03` | designer/b | Artisan : aucun écran de chargement entre deux pages — sur réseau lent, le clic sur un onglet ne produit rien pendant plusieurs secondes | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-03 |
| `PROP-02` | proprietaire/s01 | Code postal à 4 chiffres et année 1500 acceptés et enregistrés à la création du bien | corrigée en branche — d6ef891 — code postal du bien sur cinq chiffres, année de construction de 1600 à année+5 |
| `PROP-07` | proprietaire/s01 | Fiche personne : date de naissance future, téléphone « abc » et code postal « 75 » acceptés | corrigée en branche — d6ef891 — date de naissance, téléphone et code postal contrôlés côté serveur |
| `PROP-12` | proprietaire/s01 | Encaissement à 3 décimales accepté et stocké tel quel : totaux affichés incohérents au centime | corrigée en branche — 0555f43 — montant au centime près refusé côté serveur (la colonne numeric(12,2) n'est pas modifié… |
| `PROP-13` | proprietaire/s01 | Un encaissement daté dans le futur (01/01/2027) est accepté et compté comme déjà reçu | corrigée en branche — 0555f43 — date d'encaissement dans le futur refusée côté serveur, sélecteur plafonné à aujourd'hui |
| `PR178-A-01` | relecture/pr178/a | Les brouillons de fiche personne et d'incident (identité, naissance, adresse, e-mail, téléphone, pièces jointes) restent en clair dans IndexedDB 7 jours, ne sont pas effacés à la déconnexion et restent lisibles depuis la session d'un autre compte sur le même… | corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes, message mis à jour ; la durée de 7 j… |
| `PR178-A-02` | relecture/pr178/a | Les formulaires de filtre GET sans attribut method (Finances, catalogue de documents, récapitulatif fiscal) sont suivis comme des saisies à protéger : « Afficher » ou Entrée déclenche la boîte native « Quitter le site ? » et « Rester » bloque le filtre | corrigée en branche — 36219ec — seuls les formulaires qui confirment un envoi sont suivis |
| `PR178-A-04` | relecture/pr178/a | Chaque frappe dans la fiche personne réécrit tous les fichiers joints dans IndexedDB : 3 pièces de 9 Mo + 40 caractères = 1,2 Go d'écritures disque transitoires (copie de 27 Mo) | corrigée en branche — 36219ec — copie écrite 500 ms après la dernière frappe (les pièces sont encore réécrites une fois… |
| `PR178-A-05` | relecture/pr178/a | Session expirée : un envoi refusé par redirection est présenté comme « confirmation non reçue » (aucune mention de la session, aucun lien de reconnexion) ; sur la fiche personne il verrouille en plus le formulaire (création « incertaine » alors que rien n'est… | corrigée en branche — 36219ec — message « session expirée » dédié ; reconnexion par un autre onglet |
| `PR178-B-01` | relecture/pr178/b | Session expirée pendant la saisie : l'envoi échoue avec « La confirmation n'a pas pu être reçue… Votre saisie est conservée » sans jamais dire que la session a expiré ; le renvoi échoue de la même façon ; la saisie est perdue à la reconnexion | corrigée en branche — 36219ec — même correction que PR178-A-05 |
| `PR178-B-05` | relecture/pr178/b | Les formulaires de recherche ou de filtre sans attribut method="get" sont suivis comme des saisies à protéger : chaque recherche déclenche l'avertissement « Quitter le site ? » et reste bloquée si l'on refuse | corrigée en branche — 36219ec — même correction que PR178-A-02 |
| `REP-01` | relecture/reprises | contre_proposer_creneaux n'est pas rejouable : un second envoi (reponse perdue, double envoi) marque comme REFUSEES les propositions du locataire lui-meme, porte le compteur a 6 et declenche une alerte critique d'arbitrage fantome | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — second envoi sans effet, liste corrigée = anci… |
| `SUP-02` | relecture/supervision | Pendant une session de diagnostic artisan ouverte (30 min), le trigger de lecture seule est pose sur TOUTES les tables de public, y compris supervision_arrets / supervision_operations : l'arret d'urgence est refuse. | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — l'arrêt d'urgence ne dépend plus d'un diagnost… |
| `SA-04` | superadmin | Mode relais actif et arrêt d'urgence invisibles hors de /admin/relais : aucun bandeau dans la console, les pages Équipes et Brief ne signalent pas l'arrêt | corrigée en branche — 9978efa — bandeau d'arrêt d'urgence et de relais sur toute la console |
| `SA-08` | superadmin | Journal d'audit : 9 types d'actions sans libellé (« Action enregistrée (libellé manquant) »), dont l'octroi du rôle de super-administrateur et les décisions de support, et la suppression d'un encaissement présentée comme « Nettoyage de données arrivé à échéan… | corrigée en branche — 9978efa — neuf codes nommés, plus de repli « suppression = nettoyage » |
| `VFL-03` | verification/flux-finale | Copie locale refusée : un lien interne efface la saisie de la fiche personne sans avertissement, malgré « Gardez cet onglet ouvert » | corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/garde-copie-locale.test.ts, e2e/personne-reprise.spec.t… |
| `VFL-07` | verification/flux-finale | Montants restés en type=number : « 840,00 » devient 84 000 dans un navigateur non francophone (charges réelles à régulariser, indice IRL, loyer/charges/dépôt du bail) | corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/montants-actions-lecture.test.ts : 209 tests, 22 couple… |
| `VER-PR178-01` | verification/pr178 | Régression : la correction PR178-A-02 désactive la protection « Quitter la page ? » pour une quarantaine de formulaires de saisie (profil, bail, lot, EDL, messages, assistance…) | corrigée en branche — vague 5-7 ; tests : tests/protection-saisie-formulaires.test.ts |
| `PDM-01` | coordinateur | Le point du matin ne s'actualise plus depuis le 13/10 : la lecture des artisans en attente passe par une fonction que le client de service se voit toujours refuser | déployée — PR #180 fusionnée (0f7dbd5) et déployée le 14/10/2026 après autorisation du dirigeant ; tests rouge puis ver… |
| `ARC-07` | artisan | Facture externe déposée avec une erreur (numéro, montant, pièce) : impossible de la corriger ni de l annuler, le chantier terminé est figé | à trancher |
| `ARC-08` | artisan | Un artisan refusé par la plateforme et sur liste noire globale garde l outil clients externes, devis et factures | à trancher |
| `AUD-B-04` | auditeur/b | Hypothèse à vérifier : la limite de corps des fonctions Vercel (4,5 Mo, d'après la documentation de la plateforme) est inférieure aux 10 Mo annoncés pour un dépôt de pièce *(hyp.)* | à trancher |
| `AUD-C-02` | auditeur/c | Les 8 taches pg_cron (cycle mensuel des appels de loyer, retention, alertes d'impayes, declencheur marketing) ne sont ni sauvegardees, ni decrites dans la procedure de restauration, ni surveillees par Sante | à trancher — décision D07 de la page de décisions groupées |
| `PRO2-01` | chaine/1 | Un propriétaire dont la commune n'est pas ouverte au réseau ne peut solliciter aucun artisan, même un artisan connu : le carnet ne se remplit que par une intervention déjà confiée | à trancher — choix produit : réseau fermé pour la commune du propriétaire, carnet sans formulaire d'ajout |
| `ART-13` | chaine/1b | L'artisan ne peut pas déposer une version 2 de son devis : la demande close devient lecture seule, sans « réviser mon devis » | à trancher — fonction manquante : l'artisan ne peut pas déposer une version 2 de son devis |
| `PRO2-12` | chaine/1b | Un devis reçu ne peut être que retenu : ni refus motivé, ni demande de révision (écart avec le référentiel : déposé, validé, refusé ou expiré) | à trancher — fonction manquante : un devis reçu ne peut pas être refusé ni renvoyé en révision |
| `PRO2-13` | chaine/1b | Réception d'un devis : aucune alerte dans l'application, seulement un e-mail ; l'incident n'est pas compté « À traiter » | à trancher — aucune alerte dans l'application à la réception d'un devis (e-mail seul) : création d'une alerte en base à… |
| `ART-21` | chaine/2 | Rien n'empêche de démarrer, de terminer et de facturer plusieurs jours avant le rendez-vous confirmé avec le locataire | à trancher — règle métier : démarrer, terminer et facturer avant le rendez-vous confirmé |
| `CHN-01` | chaine/2 | Les créneaux non retenus sont enregistrés « refusés » : après trois reports, l'artisan est bloqué et l'écran impute au locataire des refus qu'il n'a jamais faits | à trancher — règle métier : les créneaux non retenus comptent aujourd'hui comme refusés (six refus = arbitrage) ; une c… |
| `LOC-21` | chaine/2 | Le locataire ne peut ni reporter ni annuler un rendez-vous confirmé : aucun geste après la confirmation | à trancher — fonction manquante : le locataire ne peut ni reporter ni annuler un rendez-vous confirmé |
| `PRO2-21` | chaine/2 | Le règlement de la facture de l'artisan n'est pas un geste de l'application : l'écriture du journal n'est liée à rien et la facture ne passe jamais à « réglée » | à trancher — fonction manquante : le règlement d'une facture d'artisan n'est lié ni à la facture ni à l'incident |
| `CHF-03` | charges-fiscalite | Le « Décompte annuel des charges » et le « Courrier de régularisation » sont impossibles à générer pour une régularisation créée depuis l'interface : ils exigent un champ « note » que le formulaire ne propose pas. | à trancher |
| `CHF-06` | charges-fiscalite | Une régularisation de charges n'écrit rien au livre ni aux appels : le complément dû ou le trop-perçu à rendre n'apparaît dans aucun écran de suivi financier. | à trancher |
| `AUT-01` | coordinateur | maintenance_artisans() n'est appelée par aucune tâche : les devis déposés ne deviennent jamais « expirés » et les motifs de liste noire ne sont jamais purgés | à trancher — correction préparable (tâche pg_cron + version interne), aval requis : active un automatisme en production |
| `IA-01` | equipes-ia | Les règles 'Ce qui peut continuer seul' (dont incident urgent et correction à faible risque en 'agir_seul') sont affichées au dirigeant mais aucun code ne les applique | à trancher |
| `IA-02` | equipes-ia | Mode vacances : l'urgence et l'escalade restent internes à la console, sans alerte vers un responsable absent, et ne s'alimentent ni d'un incident urgent ni d'un impayé | à trancher |
| `IA-03` | equipes-ia | Aucune alerte active sur l'échec ou l'absence d'une tâche : la santé ne se lit que si le dirigeant ouvre l'écran ; la seule alerte e-mail du produit est le veto marketing | à trancher |
| `IA-04` | equipes-ia | Hypothèse à vérifier : quittances, avis d'échéance, relances et rappels s'envoient puis se marquent, sans clé d'idempotence côté fournisseur d'e-mail *(hyp.)* | à trancher |
| `IA-05` | equipes-ia | Hypothèse à vérifier : envoyerEmail n'a aucun délai maximal, un blocage du fournisseur retient toute la passe *(hyp.)* | à trancher — décision D47 de la page de décisions groupées |
| `PROP-03` | proprietaire/s01 | Un fichier de plus de 10 Mo provoque une erreur HTTP 500 et un message sans rapport avec la cause | à trancher — voir D12 : la limite réelle est celle des fonctions Vercel (4,5 Mo), à mesurer avant de choisir le seuil d… |
| `PROP-14` | proprietaire/s01 | Entrée en cours de mois : le premier terme (prorata) est exigible le 1er du mois, avant l'entrée, et passe tout de suite en « Impayé » | à trancher |
| `FIN-07` | relecture/finance | Le filtre par mot-clé « fonds travaux / alur » écarte la pièce avant de consulter la qualification justifiée du propriétaire : une dépense qualifiée « déductible 224 » reste exclue des charges et la qualification est enregistrée mais sans effet. | à trancher |
| `FIN-11` | relecture/finance | Les migrations ne rétro-capturent aucun loyer existant et la reprise « retrouver_ventilation_fiscale » refuse tout bail qui a plus d'un appel : sur les données réelles déjà en production, le récapitulatif 2044 passe à 0 € de loyers et chaque pièce doit être q… | à trancher |
| `PR178-A-03` | relecture/pr178/a | Après une réponse perdue à la création d'une fiche personne, le bouton d'envoi reste désactivé pour toujours : la saisie et les pièces « restent disponibles » mais ne peuvent plus être envoyées ; seule issue : effacer la copie et tout ressaisir | à trancher — décision D31 de la page de décisions groupées |
| `PR178-B-04` | relecture/pr178/b | Les formulaires passés par useActionStateProtegee ne s'envoient plus avant l'hydratation : l'amélioration progressive des actions serveur est perdue sur une soixantaine de formulaires | à trancher — clic avant hydratation sans effet visible : désactiver le bouton jusqu'à l'hydratation, formulaire par for… |
| `SUP-01` | relecture/supervision | L'arret d'urgence (global ou par mission) ne couvre pas les 8 taches SQL planifiees par pg_cron : seules les routes Next/Vercel appellent verifier_arret_supervision. | à trancher |
| `SUP-05` | relecture/supervision | Les « faits de direction » copient, pour toutes les organisations, des données personnelles (titres d'alertes contenant le nom du locataire, ex. « État des lieux d'entrée — Lot 1 · Marie Durand ») dans brief_direction_snapshots, sans aucune trace d'audit par… | à trancher |
| `SOR-03` | sortie-de-bail | Un second bail est activé sur un lot avec une période qui recouvre celle du bail précédent | à trancher |
| `SA-01` | superadmin | Traversée de la supervision dans un espace client : écriture financière possible sans motif ni durée, et la ligne d'audit 'traversee_action' ne dit ni quelle action, ni sur quel objet, ni avec quel résultat | à trancher — limite déjà actée au wiki (audit du 25/09) : entrée dans un espace client sans motif ni durée ; l'écriture… |
| `PROP-BANC-01` | proprietaire/s01 | Banc : serveur :3100 démarré sans SUPABASE_SERVICE_ROLE_KEY (inscription et liens bloqués) | acceptée — défaut du banc d'essai, pas du produit ; banc-up.sh vérifie la clé de service |

### Fiches P2

#### `ARC-02` — Chantiers externes : heures de rendez-vous et d historique affichées en UTC (2 h d écart avec l heure de Paris saisie et avec les interventions Gerimmo)

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-affichage.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Artisan avec un chantier externe planifié
- **Étapes** : 1. Planifier un chantier externe le 22/10/2026 de 09:00 à 11:00 (heure de Paris) 2. Ouvrir la fiche du chantier puis /artisan/agenda
- **Attendu** : « 22/10/2026 09:00 — 11:00 » (fuseau Europe/Paris), comme les interventions Gerimmo de la même page (« lun. 19 oct. · 09:00 – 11:00 »)
- **Observé** : « 22/10/2026 07:00:00 — 09:00:00 » sur la fiche et sur l agenda ; l historique « 13/10/2026 23:14:14 · Chantier créé » est lui aussi en UTC (le créé a eu lieu le 14/10 à 01:14 à Paris). En base le créneau est correct (07:00Z-09:00Z) ; même décalage sur la fiche facture (« Enregistré le 13/10/2026 23:33:15 » pour 01:33 le 14/10 à Paris)
- **Preuve expurgée (banc)** : captures/c07-planifie.png ; captures/c08-agenda.png ; captures/c12-reglement-solde.png
- **Cause probable** : app/src/app/artisan/chantiers/[chantierId]/page.tsx (5 appels toLocaleString("fr-FR") sans timeZone dans un composant serveur, donc fuseau du serveur = UTC) et la section « Mes chantiers externes » de l agenda ; même famille que SA-05 corrigé ailleurs en 9978efa
- **Correction proposée** : Formater avec timeZone: "Europe/Paris" (helper commun de lib/libelles) et sans les secondes
- **Correction sans aval** : oui

#### `AUD-A-01` — Un agent restreint modifie les équipements d'un lot hors de son portefeuille (RPC definir_equipements_lot)

- **Sévérité** : P2 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — garde de portefeuille, test rouge puis vert · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur (auditeur/a) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Agence Alpha ; agent.alpha dont le portefeuille ne contient pas le lot 57d33dd7 (lot_hors_portefeuille = true, l'agent ne voit pas ce lot) ; ce lot porte un équipement.
- **Étapes** : 1) En SQL superuser (transaction annulée), poser un équipement sur le lot. 2) Sous role authenticated avec les claims de agent.alpha : select definir_equipements_lot('<lot>', '{}'::uuid[]). 3) Relire lot_equipements.
- **Attendu** : Refus 'hors de votre portefeuille' comme pour demarrer_restitution, enregistrer_conge, generer_grille_edl (garde_portefeuille_agent).
- **Observé** : Appel accepté sans erreur ; équipements du lot passés de 1 à 0. L'agent voit 0 ligne de ce lot (lots visibles : 1 sur 18). Les 32 autres tables rattachées aux lots portent le déclencheur garde_portefeuille_agent, pas lot_equipements.
- **Preuve expurgée (banc)** : preuves/auditeur/a/travail/preuve-agent-definir-equipements-lot.txt
- **Cause probable** : app/supabase/migrations/20260909190000_correctifs_audit_hors_documents.sql:460 (fonction SECURITY DEFINER qui ne teste que le rôle) ; app/supabase/migrations/20260909230000_perimetre_agent_serveur_et_base.sql:~244 (liste des tables gardées sans lot_equipements).
- **Correction proposée** : Dans definir_equipements_lot, refuser si public.lot_hors_portefeuille(v_org, p_lot) ; ou ajouter lot_equipements à la liste des tables du déclencheur garde_portefeuille_agent (via lot_id).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-A-02` — L'annulation d'une écriture comptable (contre_ecriture) n'enregistre pas son auteur

- **Sévérité** : P2 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit avec auteur · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur (auditeur/a) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire direct avec une écriture manuelle (Réparation plomberie, 7) ; compte propriétaire n°2 (proprio.test...).
- **Étapes** : Transaction annulée : select contre_ecriture('<écriture>', 'Erreur'). Comparer l'empreinte de toutes les tables avant/après.
- **Attendu** : Auteur, cible, date, motif, résultat tracés (audit_log ou colonne auteur), comme supprimer_encaissement qui écrit audit_log.
- **Observé** : Seule la table ecritures change (20 -> 21 lignes) : la contre-écriture porte motif, contre_ecriture_de et created_at, mais ecritures n'a aucune colonne auteur/created_by et audit_log ne reçoit rien. Dans une agence à plusieurs gestionnaires, qui a annulé l'écriture est introuvable.
- **Preuve expurgée (banc)** : preuves/auditeur/a/travail/trace-5.txt
- **Cause probable** : app/supabase/migrations/20260927182000_contre_ecriture_ecritures_liees.sql:56 (aucun insert dans audit_log) ; colonnes de public.ecritures sans auteur.
- **Correction proposée** : Insérer dans audit_log (action 'contre_ecriture', account_id = auth.uid(), organisation, détails : écriture annulée, nouvelle écriture, montant, motif) dans la fonction.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-A-03` — L'annulation d'une mission artisan (annuler_mission) ne garde ni auteur ni événement

- **Sévérité** : P2 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — événement « mission annulée » au fil de l'incident · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur (auditeur/a) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Agence Alpha, mission 3731dafa à l'état acceptée ; admin.alpha.
- **Étapes** : Transaction annulée : select annuler_mission('<org>','<mission>','Motif'). Diff des tables.
- **Attendu** : Événement d'incident avec acteur (comme demarrer_intervention qui écrit incident_evenements.acteur_account_id) ou ligne audit_log.
- **Observé** : Quatre tables changent (incident_interventions, incident_devis passé 'annule', intervention_creneaux 'caduc', incidents requalifié) mais ni incident_evenements ni audit_log ne reçoivent de ligne ; la mission garde annulee_le et annulation_motif sans annulee_par. L'artisan perd son devis retenu sans trace de qui a décidé.
- **Preuve expurgée (banc)** : preuves/auditeur/a/travail/trace-3.txt
- **Cause probable** : app/supabase/migrations/20260911240000_module8_correctifs_bloquants.sql:146 (update sans insert d'événement).
- **Correction proposée** : Ajouter un insert dans incident_evenements (type 'mission_annulee', acteur_account_id = auth.uid(), détails : intervention, motif) comme demarrer_intervention.
- **Correction sans aval** : oui

#### `AUD-A-04` — La suppression d'une détention (quote-part de propriété d'un lot) ne laisse aucune trace

- **Sévérité** : P2 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit « détention supprimée » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur (auditeur/a) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire n°2 (proprio.test...) sur son organisation 718daf75 qui porte 2 détentions.
- **Étapes** : Transaction annulée : select supprimer_detention('<détention>'). Diff des tables.
- **Attendu** : Trace de la suppression d'un droit de propriété (auteur, cible, date), ou archivage plutôt que suppression (wiki 'Archivage plutôt que suppression').
- **Observé** : La table detentions passe de 22 à 21 lignes ; audit_log et tous les autres journaux inchangés.
- **Preuve expurgée (banc)** : preuves/auditeur/a/travail/trace-4.txt
- **Cause probable** : fonction supprimer_detention (delete sans audit_log) ; migration non localisée dans l'extrait lu (hypothèse sur le fichier).
- **Correction proposée** : Journaliser dans audit_log (détails : lot, personne, quote-part supprimée) ou archiver la ligne.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-B-01` — E-mails de relance, d'appel et de rappel : valeurs saisies insérées sans échappement HTML

- **Sévérité** : P2 · **Statut** : corrigée en branche — 35b2501 — les valeurs saisies sont échappées dans les quatre courriers, 7 tests rouges puis verts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur-b (auditeur/b) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Un nom de lot, de personne ou d'organisation contenant du HTML ; relance due
- **Étapes** : 1. Nommer un lot '<a href="https://evil.example">Lot</a>'. 2. Laisser la relance automatique (cron relances) composer le message. 3. Lire le corps HTML transmis à envoyerEmail.
- **Attendu** : Texte échappé (&lt;a&gt;…) comme dans quittance-email.ts (echapperHtml) et notifications.ts (echapperMarque)
- **Observé** : corpsRelanceLoyer et corpsInformationCaution (lib/relance-loyer-email.ts) insèrent prenom, lot, emetteur, locataire tels quels dans le HTML du message ; appel-email.ts (prenom, emetteur, lien) et rappel-email.ts (lot, adresseBien, prenom, emetteur) interpolent aussi les valeurs sans échappement ; relance-paiement-email.ts n'a aucun échappement mais je n'y ai pas relevé d'insertion de donnée saisie (non vérifié ligne à ligne). Exécution de la fonction avec prenom='<img src=x onerror=...>', lot='<a href="https://evil.example">', emetteur='<script>': le HTML sortant contient ces balises intactes. Les valeurs viennent de la RPC relances_loyer_dues : lot=lots.nom, prenom/locataire=persons.prenom/nom, emetteur=organizations.name, tous saisis par le propriétaire ou l'agence (le locataire n'a aucune politique UPDATE sur persons : seul persons_select_locataire existe, vérifié dans pg_policies).…
- **Preuve expurgée (banc)** : preuves/auditeur/b/t-relance-sortie.txt (exécution de la fonction réelle du snapshot avec entrées hostiles ; seuls eur/formaterDate/moisDeLaPeriode sont substitués)
- **Cause probable** : snap-main/app/src/lib/relance-loyer-email.ts:54,60,77-98 ; lib/appel-email.ts:64,80 ; lib/rappel-email.ts:69,80,91,93 ; aucun appel à echapperMarque (marque-organisation.ts:57)
- **Correction proposée** : Passer chaque valeur interpolée par echapperMarque() (déjà dans marque-organisation.ts) dans relance-loyer-email.ts, appel-email.ts, rappel-email.ts (et relire relance-paiement-email.ts) ; ajouter un test unitaire avec entrée '<b>'.
- **Correction sans aval** : oui

#### `AUD-B-02` — Aucune limite de longueur à l'inscription : un nom très long rend le compte inutilisable (HTTP 431 sur tout le site)

- **Sévérité** : P2 · **Statut** : corrigée en branche — bf73fdc — garde de longueur côté serveur et maxLength, 2 familles de tests · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur-b (auditeur/b) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Page /inscription accessible, aucun maxlength
- **Étapes** : 1. /inscription, nom = 24 000 caractères. 2. Valider. 3. Se connecter avec ce compte. 4. Ouvrir n'importe quelle page.
- **Attendu** : Refus lisible au-delà d'une longueur raisonnable (nom, adresse, ville ≤ 100–200 caractères), côté serveur et par maxlength
- **Observé** : Inscription avec un nom de ~24 000 caractères : acceptée (raw_user_meta_data de 24 249 caractères, e-mail confirmé, aucune organisation créée). À la connexion, les cookies de session pèsent 77 824 octets sur 25 cookies ; /espaces répond 431 puis toute adresse du site (y compris /connexion) répond 431 tant que les cookies ne sont pas effacés. Une nouvelle connexion remet les mêmes cookies : le compte est inutilisable et le navigateur est bloqué sur le site. Seuil estimé ~5 000 caractères (extrapolation 3,2 octets par caractère contre 16 Kio d'en-têtes : à confirmer). Aucune validation de longueur dans app/actions/auth.ts ni lib/inscription.ts.
- **Preuve expurgée (banc)** : preuves/auditeur/b/long-inscription-mobile.png ; preuves/auditeur/b/long-login-431.png ; SQL : longueur du raw_user_meta_data du compte auditeur.b.long.* = 24249
- **Cause probable** : snap-main/app/src/app/actions/auth.ts (inscription) et app/inscription/formulaire-inscription.tsx : pas de borne ; les métadonnées sont recopiées dans le jeton/cookie de session
- **Correction proposée** : Borner nom, prénom, adresse, ville, téléphone (maxLength HTML + contrôle serveur) ; ne pas faire transiter ces champs par les métadonnées de session ou les tronquer ; vérifier de même les noms saisis par un propriétaire pour un tiers invité.
- **Correction sans aval** : oui

#### `AUD-C-01` — Un encaissement a 3 decimales (ou 0,004 EUR) et date dans le futur est accepte et ecrit au journal comptable

- **Sévérité** : P2 · **Statut** : corrigée en branche — 0555f43 pour la saisie ; les contraintes CHECK en base ne sont pas ajoutées (données de production à contrôler d'abord) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte proprietaire_direct, agent ou admin d'agence, bail actif
- **Étapes** : 1. Saisir un encaissement de 12.345 (point decimal) ou une date en 2031 sur un bail (action serveur ajouterEncaissement). 2. Reproduction base/RLS sur la copie : role authenticated d'un proprietaire, insert into encaissements (montant 0.004, date_paiement 2031-01-01).
- **Attendu** : Refus : un montant en euros a deux decimales au plus, une date de paiement plausible, un plafond raisonnable.
- **Observé** : Accepte. L'ecriture de loyer recette 0.004 est creee avec date_imputation 2031-01-01. Sur le banc partage, deux ecritures a 12.345 existent deja (e768b993 et sa contre-ecriture b487429f, annulee ensuite par le proprietaire) et des encaissements dates 2027 et 2030. L'export CSV arrondit avec toFixed(2) alors que le SQL somme les sous-centimes ; un encaissement date de 2031 sort des totaux de l'annee en cours tout en marquant le terme paye sur le bail.
- **Preuve expurgée (banc)** : preuves/auditeur/c/preuves-sql.txt
- **Cause probable** : Seules contraintes : CHECK (montant > 0) sur encaissements et ecritures (aucune echelle ni borne de date) ; app/src/app/actions/loyers.ts : Number(montant) sans arrondi ni plafond, date_paiement transmise telle quelle ; comptabilite/export/route.ts montantFr toFixed(2).
- **Correction proposée** : CHECK (montant = round(montant, 2) et montant < 1 000 000) et CHECK (date_paiement <= current_date + interval '1 day') sur encaissements ; round(montant, 2) et message d'erreur dans ajouterEncaissement ; meme echelle sur ecritures.montant. Nettoyer l'existant avant d'ajouter la contrainte (NOT VALID puis VALIDATE).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRO2-14` — La justification de la qualification, rédigée comme note de décision, est affichée mot pour mot au locataire sans que le formulaire le dise

- **Sévérité** : P2 · **Statut** : corrigée en branche — 611dce2 — le formulaire dit que la justification est montrée au locataire · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Incident qualifié par le propriétaire avec une justification libre
- **Étapes** : 1. Le propriétaire qualifie l'incident « charge propriétaire » et écrit sa justification. 2. Le locataire ouvre « Mes demandes ».
- **Attendu** : Le formulaire précise que le texte sera lu par le locataire, ou le locataire ne voit qu'une formule neutre
- **Observé** : Le formulaire invite à « Décrivez le constat et la raison de votre décision » et indique seulement « Le locataire est informé immédiatement ». Chez le locataire : « Qui prend en charge · Le propriétaire — vous n'avancez rien ([justification complète]) ». Un propriétaire qui note un jugement sur le locataire ou une stratégie le lui publie.
- **Preuve expurgée (banc)** : preuves/chaine/1b/captures/l1-01-demandes-apres-mission.png (affichage locataire, observé) ; code lu dans la photographie snap-main-178 : app/agence/[orgId]/incidents/[incidentId]/actions-incident.tsx lignes 90-110 (libellé du champ) et app/locataire/[orgId]/incidents-locataire.tsx lignes 195-215 (affichage)
- **Cause probable** : imputation_justification rendue telle quelle dans incidents-locataire.tsx.
- **Correction proposée** : Ajouter sous le champ « Cette justification est visible du locataire » ou la scinder en motif visible et note interne.
- **Correction sans aval** : oui

#### `MKT-01` — La préparation du soir du marketing n'a jamais été déclenchée par pg_cron : pas de fenêtre de veto la veille, seul le rattrapage de la matinée préparait les posts

- **Sévérité** : P2 · **Statut** : corrigée en branche — commit 9d5ed9d ; migration 20261013110000 à appliquer en production · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : marketing (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : à 18 h (Paris) la veille d'un jour de publication, pg_cron juge la préparation due et déclenche /api/cron/equipes?mission=marketing
- **Observé** : cible_preparation_marketing() filtrait sur auth.role() = 'service_role' ; pg_cron appelle declencher_marketing() avec le rôle de la base, sans jeton JWT : auth.role() est nul, aucune ligne, préparation jamais due. Seule la diffusion (requête directe sur publications) partait. Un seul appel pg_net en production depuis le 7/10 (09/10, rattrapage).
- **Preuve expurgée (banc)** : tests/marketing-veto.test.ts (deux tests rouges sur le schéma d'avant, verts après) ; cron.job_run_details en production (lecture seule) : 1 097 exécutions réussies, une seule requête pg_net
- **Cause probable** : supabase/migrations/20261007100000_marketing_fenetre_de_veto.sql (cible_preparation_marketing, garde auth.role())
- **Correction proposée** : migration 20261013110000 : version interne sans garde, fermée à tous les rôles ; la version publique garde sa garde service_role ; aucun droit élargi
- **Correction sans aval** : oui

#### `PUB-01` — Le formulaire « Agences » de l'accueil était le seul canal de contact des pages légales (exercice des droits sur les données) tant que l'adresse de l'éditeur manque ; il restait une demande de devis…

- **Sévérité** : P2 · **Statut** : corrigée en branche — commit e7982a7 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : public (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : un canal de contact général, indépendant de l'offre agence, vers lequel renvoient les pages légales
- **Observé** : FORMULAIRE_ACCUEIL = /#agences ; formulaire à champs « Votre agence » et « lots en gestion » ; relevé déjà fait le 24/09 (lib/editeur.ts). Le retrait des agences du site public aurait supprimé ce canal.
- **Preuve expurgée (banc)** : app/src/lib/editeur.ts, app/src/components/coquille-legale.tsx, app/src/app/page.tsx (avant correction)
- **Correction proposée** : formulaire de contact général (ancre #contact, message obligatoire), pages légales renvoyées vers lui ; l'adresse e-mail de l'éditeur reste à fournir (src/lib/editeur.ts)
- **Correction sans aval** : oui

#### `DES-A-01` — Au clavier, sur mobile (≤640 px), le champ ou le bouton qui reçoit le focus est entièrement masqué par la barre d'onglets fixe du bas

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire direct (proprietaire@gerimmo-demo.fr), viewport 390×844, clavier physique ou lecteur d'écran (Tab)
- **Étapes** : 1. Ouvrir /agence/<id>/profil à 390 px. 2. Fermer la synthèse des alertes. 3. Appuyer sur Tab jusqu'au champ « Adresse » puis jusqu'au bouton « Suivant → ».
- **Attendu** : L'élément focalisé reste visible : la page défile pour le placer au-dessus de la barre fixe (WCAG 2.2, critère 2.4.11 Focus non masqué).
- **Observé** : Le champ #pr-adresse (top 792, bottom 836) et le bouton « Suivant → » (800–844) sont masqués à 100 % par la barre du bas (top 787) ; mesure sur 45 arrêts Tab. Même défaut relevé par la passe automatique sur 8 autres écrans propriétaire à 390 px (tableau de bord, fiscal, incident/nouveau, fiche bien, fiche lot, fiche personne, import, /espaces).
- **Preuve expurgée (banc)** : etats/focus-masque-profil-390.png ; etats/focus-masque-profil-journal.json ; journaux/auto-proprietaire-390.json (champ clavier.masques)
- **Cause probable** : app/src/app/globals.css:2168 (.coquille-basse fixe, 56 px + safe-area) sans scroll-padding-bottom sur la racine : le navigateur aligne l'élément focalisé sur le bord bas du viewport, sous la barre. Le padding-bottom de .coquille-corps (l.2166) ne sert pas au défilement automatique du focus.
- **Correction proposée** : Dans le bloc @media (max-width: 640px) de globals.css (l.2159), ajouter : html { scroll-padding-bottom: calc(72px + env(safe-area-inset-bottom, 0px)); } (même correctif pour la barre basse artisan, nav-artisan.tsx:134, hors périmètre ici).
- **Correction sans aval** : oui

#### `DES-A-09` — Menu « Plus » mobile (tiroir modal) : le focus ne passe pas dans le tiroir à l'ouverture et la touche Tab en sort vers la page cachée derrière

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire (barre basse) ou locataire, 390×844, navigation clavier ou lecteur d'écran
- **Étapes** : 1. Ouvrir le tableau de bord. 2. Activer le bouton « Menu » de la barre basse. 3. Lire le focus. 4. Appuyer 25 fois sur Tab.
- **Attendu** : Un dialogue aria-modal prend le focus à l'ouverture (premier contrôle ou titre), le garde (Tab/Maj+Tab bouclent) et le rend au bouton à la fermeture
- **Observé** : Le tiroir s'ouvre (role=dialog, aria-modal=true) mais document.activeElement reste le bouton « Menu » derrière le voile ; 12 des 25 arrêts Tab (propriétaire) et 15 sur 25 (locataire) sont hors du dialogue. Échap ferme bien le tiroir. À l'inverse, la recherche globale (« Retrouvez le bon dossier ») et la confirmation « Retirer ce bien » se comportent correctement (focus dans le dialogue, Échap ferme).
- **Preuve expurgée (banc)** : etats/menu-focus-journal.json ; etats/menu-plus-390.png
- **Cause probable** : app/src/components/ui/tiroir.tsx:31-41 : le useEffect n'installe que la fermeture par Échap et le blocage du défilement ; aucun déplacement de focus ni piège à focus
- **Correction proposée** : Dans tiroir.tsx : mémoriser document.activeElement à l'ouverture, donner le focus au bouton « Fermer » (ou au dialogue avec tabIndex={-1}), boucler Tab/Maj+Tab dans le dialogue (ou poser `inert` sur les frères du portail) et rendre le focus au bouton « Menu » au démontage.
- **Correction sans aval** : oui

#### `DES-A-13` — Tablette (≤ 1023 px) : le menu du propriétaire est un rail d'icônes sans libellé, alors que celui du locataire garde les libellés sous les icônes

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/a) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire direct, viewport 768×1024 tactile (sans survol)
- **Étapes** : Ouvrir /agence/<id> à 768 px et lire la colonne de gauche
- **Attendu** : Onze entrées de navigation lisibles sans survol (libellés sous les icônes, comme le rail locataire de 641 à 860 px), car une tablette tactile n'a pas d'infobulle
- **Observé** : Rail de 60 px : 11 icônes (maison, clé, personnes, €, outil, cloche, calendrier, bulle, document, carte, ?) sans aucun texte ; seul l'attribut title (survol) donne le mot, inexistant au toucher. Les noms accessibles existent (aucune commande sans nom relevée par la passe automatique). Le rail locataire a, lui, été corrigé pour garder ses libellés (commentaire globals.css:1445).
- **Preuve expurgée (banc)** : avant/proprietaire/accueil-768.png ; avant/proprietaire/fiche-lot-768.png ; planches/p768-a.png
- **Cause probable** : app/src/app/globals.css:2140-2155 (@media max-width 1023px : .coquille-late .coquille-menu .lib { display: none }, --largeur-late: 60px) ; barre-laterale.tsx:51 (title seul)
- **Correction proposée** : Reprendre la règle du rail locataire pour .coquille-late entre 641 et 1023 px : largeur 78 px, flex-direction: column, .lib affiché à 10,5 px centré (globals.css:1445-1455 en modèle) ; au-dessus de 1024 px rien ne change.
- **Correction sans aval** : oui

#### `DES-B-01` — Artisan : sur 390 px, Agenda, Demandes de devis et le détail d'une demande débordent horizontalement dès qu'un nom d'organisation est long (recoupe ARC-05, étendu à trois écrans)

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan.alpha@gerimmo-demo.fr, organisation « Parc de Éloïse [TEST-proprietaire] Durand-Lévêque » (49 caractères), viewport 390x844
- **Étapes** : 1. Ouvrir /artisan/agenda, /artisan/devis puis /artisan/devis/017f6829-…. 2. Observer la largeur de la page.
- **Attendu** : Aucun défilement horizontal : le nom est tronqué (la classe truncate est déjà posée sur le span)
- **Observé** : scrollWidth 448 px (agenda), 448 px (liste des devis), 472 px (détail) pour un viewport de 390 px : la carte de la demande fait 432 px, l'en-tête du détail 456 px, le badge « Devis retenu » sort à droite de l'écran. La page entière se déplace latéralement avec le doigt. La passe automatique ne le voit pas en émulation mobile (le viewport s'élargit) : détecté sur la largeur des captures (448, 448, 473 px). Recoupe ARC-05 (agenda seul, P3) : le défaut touche aussi /artisan/devis et /artisan/devis/<id>, et sa cause racine est une règle CSS commune (grille sans minmax).
- **Preuve expurgée (banc)** : etats/debordement-journal.json ; etats/debordement-artisan-agenda-390.png ; auto/artisan/artisan-agenda-390.png (448 px de large) ; auto/artisan/artisan-devis-390.png ; auto/artisan/artisan-devis-017f6829-ac6b-4467-9901-04048bd1e5bd-390.png (473 px)
- **Cause probable** : app/src/app/artisan/portail-artisan.module.css:14 (.artisan-liste { display: grid } sans grid-template-columns : la piste automatique prend la largeur min-content du texte nowrap) ; app/src/app/artisan/devis/[sollicitationId]/devis.module.css:1 (.page { display: grid } idem)
- **Correction proposée** : portail-artisan.module.css:14 → `.content :global(.artisan-liste) { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }` ; devis.module.css:1 → `.page { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; min-width: 0; }`
- **Correction sans aval** : oui

#### `DES-B-02` — Artisan : le focus clavier passe sous la barre d'onglets fixe du bas (390 et 768 px), même défaut que DES-A-01 côté propriétaire

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan, viewport 390x844 ou 768x1024, clavier ou lecteur d'écran
- **Étapes** : 1. Ouvrir /artisan/attestations à 390 px et appuyer 6 fois sur Tab. 2. Ouvrir /artisan/entreprise à 768 px et appuyer 9 fois sur Tab.
- **Attendu** : L'élément focalisé reste visible (WCAG 2.2, 2.4.11)
- **Observé** : « Déposer : Responsabilité civile professionnelle » est à 796-844 alors que la barre commence à 779 ; « Contactez Gerimmo » est à 1010-1024 alors que la barre commence à 959 (à 768 px la barre basse existe encore). La passe automatique relève aussi /artisan/facturation (390) et /artisan/note (768).
- **Preuve expurgée (banc)** : etats/focus-masque-artisan-journal.json ; etats/focus-masque-artisan-attestations-390.png ; etats/focus-masque-artisan-entreprise-768.png
- **Cause probable** : app/src/components/nav-artisan.tsx:134 (nav fixed bottom-0, 64 px + safe-area) sans scroll-padding-bottom sur la racine ; voir DES-A-01
- **Correction proposée** : Dans portail-artisan.module.css (règle .mobileNav / contenu) ou globals.css : `html:has(.artisan-navigation) { scroll-padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)); }` — même correctif que DES-A-01
- **Correction sans aval** : oui

#### `DES-B-03` — Artisan : aucun écran de chargement entre deux pages — sur réseau lent, le clic sur un onglet ne produit rien pendant plusieurs secondes

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-03 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : designer (designer/b) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte artisan, 390x844, réseau dégradé (latence 1,8 s, 60 ko/s) — le cas du chantier en zone mal couverte
- **Étapes** : 1. Ouvrir /artisan. 2. Activer l'onglet « Agenda » de la barre basse. 3. Observer l'écran 700 ms puis 6 s après le clic.
- **Attendu** : Comme dans les espaces propriétaire, locataire et super-admin : un squelette (ou au moins l'onglet visé allumé) dès le clic
- **Observé** : À 700 ms, la page « Aujourd'hui » est inchangée, l'onglet « Agenda » n'est pas allumé, aucun squelette ni indicateur (aucun élément aria-busy) ; la page « Mon agenda » n'arrive qu'à 6 s. L'artisan peut croire que le clic n'a pas été pris en compte et recliquer. Le super-admin et le propriétaire affichent un squelette dans la même condition.
- **Preuve expurgée (banc)** : etats/art-chargement-lent-390.png ; etats/etats-journal-art.json ; comparaison : etats/etats-journal-sa.json (busy=true)
- **Cause probable** : Aucun app/artisan/loading.tsx : seuls app/loading.tsx, app/admin/loading.tsx, app/agence/[orgId]/loading.tsx et app/locataire/[orgId]/loading.tsx existent ; la limite racine ne s'affiche pas quand seul l'enfant du gabarit artisan change
- **Correction proposée** : Créer app/artisan/loading.tsx sur le modèle de app/locataire/[orgId]/loading.tsx (11 lignes) : <div className="space-y-4" role="status" aria-busy="true" aria-label="Chargement de la page"> avec un bloc .squelette h-24 (héros) et deux .squelette h-[132px] !rounded-[14px] (cartes)
- **Correction sans aval** : oui

#### `PROP-02` — Code postal à 4 chiffres et année 1500 acceptés et enregistrés à la création du bien

- **Sévérité** : P2 · **Statut** : corrigée en branche — d6ef891 — code postal du bien sur cinq chiffres, année de construction de 1600 à année+5 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : propriétaire n°2 connecté, /parc/nouveau
- **Étapes** : Bâtiment : nom, adresse, code postal « 7501 », ville, année de construction « 1500 », parties communes, accès TIC ; Suivant ; lot 30 m² / 2 pièces ; Créer le lot
- **Attendu** : refus d'un code postal qui n'a pas 5 chiffres (France) et d'une année de construction invraisemblable, message clair
- **Observé** : le formulaire passe à l'étape 2 (« Bâtiment — Renseigné »), puis le bien est créé : biens.postal_code='7501', annee_construction=1500, commune_insee NULL ; l'adresse affichée est « 1 rue Test, 7501 Paris »
- **Preuve expurgée (banc)** : captures/s2-03-cp4-annee1500.png ; captures/s2-07-bien-cp-invalide-cree.png ; SQL select postal_code,annee_construction from biens (bien '[TEST-proprietaire] Bien invalide')
- **Cause probable** : aucun contrôle de forme du code postal (champ texte maxlength 12, formulaire parc/nouveau) ; seule contrainte en base : annee_construction entre 1000 et 2100 (biens_annee_construction_check)
- **Correction proposée** : valider ^\d{5}$ côté serveur et client (pattern + inputmode), borner l'année (ex. 1800 à année en cours + 3)
- **Correction sans aval** : oui

#### `PROP-07` — Fiche personne : date de naissance future, téléphone « abc » et code postal « 75 » acceptés

- **Sévérité** : P2 · **Statut** : corrigée en branche — d6ef891 — date de naissance, téléphone et code postal contrôlés côté serveur · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : assistant « Créer une fiche » (Locataires & garants)
- **Étapes** : rôle Locataire ; identité : date de naissance 01/01/2030 ; coordonnées : téléphone « abc », code postal « 75 » ; Suivant ×2 ; Créer la fiche
- **Attendu** : refus d'une naissance dans le futur, d'un téléphone et d'un code postal mal formés
- **Observé** : les étapes avancent et la fiche est créée : persons.date_naissance='2030-01-01', telephone saisi libre ; l'écran de fiche affiche « né(e) le 01/01/2030 ». Seule la validation native de l'e-mail bloque.
- **Preuve expurgée (banc)** : captures/s6-04-recap-invalide.png ; captures/s6-07-fiche-locataire.png ; SQL select date_naissance from persons (corrigée ensuite à 1990-05-14 par « Modifier la fiche »)
- **Cause probable** : aucun contrôle de plausibilité dans l'assistant de création de fiche (champ date sans max, champs tel/cp sans pattern)
- **Correction proposée** : max=aujourd'hui (et âge majeur pour un locataire), pattern téléphone/code postal côté client et serveur
- **Correction sans aval** : oui

#### `PROP-12` — Encaissement à 3 décimales accepté et stocké tel quel : totaux affichés incohérents au centime

- **Sévérité** : P2 · **Statut** : corrigée en branche — 0555f43 — montant au centime près refusé côté serveur (la colonne numeric(12,2) n'est pas modifiée) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : bail actif, appel d'octobre 2026 de 485,16 €
- **Étapes** : Loyers & paiements : encaisser 10 € (date 01/01/2027), 12,345 € puis 200 € le même jour
- **Attendu** : refus d'un montant à plus de deux décimales (comme le fait l'étape Loyer du bail : « au plus deux décimales ») ou arrondi explicite au centime avant stockage
- **Observé** : encaissements.montant = 12.345 enregistré ; carte « Loyers & paiements » : DÛ 485,16 € · ENCAISSÉ 222,35 € · RESTE DÛ 262,82 € (485,16 − 222,35 = 262,81) ; le texte de la ligne dit « (reste 262,81 €) » ; le reçu est enregistré pour 222.35
- **Preuve expurgée (banc)** : captures/s8-05-incoherence-reste-du.png ; sql: encaissements 12.345@2026-10-13 (retiré ensuite avec motif)
- **Cause probable** : l'action d'encaissement ne contrôle que montant > 0 (message « Montant invalide. ») ; la colonne encaissements.montant est numeric sans échelle ; l'affichage arrondit après addition
- **Correction proposée** : refuser les montants avec plus de 2 décimales (client et serveur) et contraindre numeric(12,2)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PROP-13` — Un encaissement daté dans le futur (01/01/2027) est accepté et compté comme déjà reçu

- **Sévérité** : P2 · **Statut** : corrigée en branche — 0555f43 — date d'encaissement dans le futur refusée côté serveur, sélecteur plafonné à aujourd'hui · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : même appel d'octobre 2026
- **Étapes** : Saisir un encaissement : 10 €, date 01/01/2027, Virement
- **Attendu** : refus (ou alerte) d'une date de paiement postérieure à aujourd'hui ; le paiement non encore reçu ne doit pas couvrir l'appel
- **Observé** : encaissement créé ; « couvert 222,35 € » inclut les 10 € ; la liste affiche « 10,00 € 01/01/2027 Virement » ; le bloc ENCAISSÉ le compte aujourd'hui
- **Preuve expurgée (banc)** : captures/s8-05-incoherence-reste-du.png
- **Cause probable** : aucun contrôle de borne sur date_paiement (champ date sans max, action sans contrôle)
- **Correction proposée** : max = aujourd'hui (fuseau Paris) côté client et serveur
- **Correction sans aval** : oui

#### `PR178-A-01` — Les brouillons de fiche personne et d'incident (identité, naissance, adresse, e-mail, téléphone, pièces jointes) restent en clair dans IndexedDB 7 jours, ne sont pas effacés à la déconnexion et reste…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes, message mis à jour ; la durée de 7 jours reste à trancher · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Poste partagé, un seul profil de navigateur. Compte proprietaire@gerimmo-demo.fr (propriétaire direct), puis locataire.pd@gerimmo-demo.fr.
- **Étapes** : 1. Se connecter par le formulaire en tant que propriétaire. 2. /agence/<org>/personnes puis « Créer une fiche », rôle Locataire, saisir nom, prénom, date de naissance, commune de naissance, e-mail, adresse, ajouter une « Pièce d'identité » avec un fichier PNG. 3. Sans valider, ouvrir le menu du compte et choisir « Se déconnecter » (formulaire modifié). 4. Se connecter en tant que locataire.pd dans le même profil. 5. Lire la base IndexedDB « gerimmo-reprises » depuis cette session. 6. Fermer le navigateur et chercher les valeurs dans les fichiers du profil.
- **Attendu** : Données personnelles de tiers (identité, naissance, adresse, pièce d'identité) non conservées sur le poste après la déconnexion, ou chiffrées/liées à la session ; avertissement explicite sur poste partagé à chaque affichage de l'état « conservé ».
- **Observé** : 1) La déconnexion s'exécute en 210 ms sans aucune confirmation ni nettoyage. 2) La copie « gerimmo:personne:v1:<id compte>:<id org> » reste dans IndexedDB (nom, prénom, date de naissance, commune de naissance, e-mail, téléphone, adresse, code postal, ville, fichier File de la pièce d'identité), lisible en JavaScript depuis la session du locataire (même origine) : 1 copie visible. 3) Sur disque, le journal LevelDB du profil contient les valeurs en clair (UTF-16 : 21 occurrences de « Camille », 17 de « Nantes », 11 de « Lilas ») et le fichier de la pièce est dans le dossier .blob. 4) Une fois la copie enregistrée, le texte affiché ne dit plus « Évitez un appareil partagé » (cette mise en garde n'apparaît que dans l'état vide, avant la première saisie) ; il dit seulement « Les copies de plus de 7 jours sont supprimées à la prochaine utilisation ». 5) L'interface du locataire ne propose pas…
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/t2.mjs (sortie : copies=1 après déconnexion et depuis la session locataire), captures/A-01-poste-partage-locataire.png, a01-disque-sortie.txt (comptage d'occurrences dans le journal LevelDB du profil), src/lib/brouillon-fichiers.ts:1-65, src/components/reprise-locale/index.tsx:66-75, src/app/actions/auth.ts:25-30, a01-incident-sortie.txt (copie incident avant/après déconnexion), a01-devis-sortie.txt (clé devis avant/après déconnexion)
- **Cause probable** : seDeconnecter() (app/actions/auth.ts:25) est une action serveur sans purge côté client ; aucune écoute de la déconnexion ni de SIGNED_OUT ne vide la base « gerimmo-reprises » (brouillon-fichiers.ts) ni les clés localStorage « gerimmo:bien:v1 » et « gerimmo:devis:v1 ». Durée de 7 jours et purge « à la prochaine utilisation » seulement (lireCopieFichiers).
- **Correction proposée** : Vider les trois stockages (IndexedDB gerimmo-reprises, clés gerimmo:*) dans le geste de déconnexion (formulaire du menu et de /compte) et à l'expiration de session ; afficher « Évitez un appareil partagé » dans tous les états ; ramener la durée à 24-48 h ; ne pas stocker les fichiers d'identité (ne garder que les champs texte) ou les chiffrer avec une clé de session.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PR178-A-02` — Les formulaires de filtre GET sans attribut method (Finances, catalogue de documents, récapitulatif fiscal) sont suivis comme des saisies à protéger : « Afficher » ou Entrée déclenche la boîte native…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 36219ec — seuls les formulaires qui confirment un envoi sont suivis · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte proprietaire@gerimmo-demo.fr (session Playwright), version candidate sur 127.0.0.1:3100, Chromium.
- **Étapes** : Page /agence/<org>/loyers : cliquer dans le champ « Année », appuyer sur la flèche bas (2026 vers 2025), cliquer « Afficher ». Variante : /agence/<org>/documents/catalogue, taper « bail » dans « Filtrer les modèles », appuyer sur Entrée.
- **Attendu** : Un filtre (formulaire GET, sans effet d'écriture) n'est jamais traité comme une saisie non enregistrée ; le filtre s'applique sans boîte de confirmation (le brief demande que les formulaires de recherche soient exclus).
- **Observé** : Une boîte beforeunload s'ouvre à chaque validation du filtre. Réponse « Rester » : l'URL reste /agence/<org>/loyers (filtre non appliqué, page inchangée) ; réponse « Quitter » : navigation vers ?bien=&annee=2025&mois=10. Même comportement sur le catalogue (URL inchangée en refusant, ?q=bail en acceptant). Le message natif n'explique rien (Chromium ignore le texte), l'utilisateur croit perdre une saisie alors qu'il ne fait que filtrer. Contrôle témoin : le sélecteur d'année de /comptabilite/fiscal n'a qu'une option, non testable. Même défaut côté artisan : /artisan/clients (recherche de clients, <form className="flex gap-3"> sans method) : saisir « Dupont » puis Entrée ouvre aussi une boîte beforeunload (a02b-sortie.txt). Pages concernées d'après le code : Finances (loyers), catalogue documents, récapitulatif fiscal, réseau (2e formulaire), artisan/clients, artisan/devis/nouveau.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a02-sortie.txt (lignes « réponse=Rester » / « réponse=Quitter » et catalogue), captures/A-02-loyers-filtre-bloque.png, formulaires : src/components/page-finances.tsx:41, src/app/agence/[orgId]/documents/catalogue/page.tsx:61, src/components/recapitulatif-fiscal.tsx:198, a02b-sortie.txt (artisan/clients)
- **Cause probable** : src/lib/protection-saisie.ts:46-51 (eligible) : `formulaire.getAttribute("method")?.toLowerCase() !== "get"` est vrai quand l'attribut est absent alors que la méthode par défaut du navigateur est GET ; role="search" n'est pas posé sur ces formulaires. Et avantSortie (l.128-130) ne tient pas compte d'une soumission en cours (le WeakSet enSoumission ne sert qu'au gestionnaire formdata).
- **Correction proposée** : Dans eligible, utiliser la propriété normalisée `formulaire.method !== "get"` (ou `formulaire.matches('form:not([method=post i])')`), ignorer aussi tout formulaire dont l'action est une URL (pas d'action serveur) ; dans avantSortie, ne pas bloquer quand un formulaire GET vient d'être soumis (poser departAutorise dans le gestionnaire submit).
- **Correction sans aval** : oui

#### `PR178-A-04` — Chaque frappe dans la fiche personne réécrit tous les fichiers joints dans IndexedDB : 3 pièces de 9 Mo + 40 caractères = 1,2 Go d'écritures disque transitoires (copie de 27 Mo)

- **Sévérité** : P2 · **Statut** : corrigée en branche — 36219ec — copie écrite 500 ms après la dernière frappe (les pièces sont encore réécrites une fois par pause, à découper si besoin) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Chromium, profil persistant, compte proprietaire, formulaire « Créer une fiche » (rôle Locataire), 3 justificatifs (Pièce d'identité, Domicile, Autre document) de 9 437 184 octets chacun (limite serveur : 10 Mo).
- **Étapes** : 1. Remplir identité et coordonnées (40 frappes dans « Nom » : 461 ms, IndexedDB 56 Ko). 2. Joindre trois fichiers de 9 Mo. 3. Revenir à l'étape Identité et taper 40 caractères dans « Nom ». 4. Mesurer le dossier IndexedDB du profil (du -sk) 3 s après.
- **Attendu** : Les fichiers déjà conservés ne sont pas réécrits quand seul un champ texte change ; l'occupation disque reste voisine de la taille des fichiers (≈27 Mo).
- **Observé** : Dossier IndexedDB du profil : 55 432 Ko après les trois fichiers, puis 1 244 536 Ko (≈1,2 Go) après 40 frappes, retombé à 28 052 Ko seulement à la fermeture du navigateur. Cause constatée : chaque changement de snapshot appelle enregistrer(...) qui fait copies.put({revision, date, donnees}) avec les objets File dans donnees, donc une nouvelle copie de chaque blob par frappe ; le ramasse-miettes du navigateur n'intervient pas à temps. La latence de saisie reste correcte (40 frappes : 322 ms avec fichiers), le risque est l'usure disque, le dépassement de quota (surtout iOS Safari, quota par origine plus bas) et l'état « refuse » qui déclenche alors une alerte de sortie. Non mesuré hors Chromium. Contrôle de cohérence : 40 frappes x 27 Mo = 1,08 Go, proche des 1,24 Go observés (le reste correspond à l'ajout des fichiers).
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a06-sortie.txt (sortie de t11.mjs), t11.mjs ; src/app/agence/[orgId]/personnes/formulaire-personne.tsx:72-73 (useEffect sur snapshot, à chaque frappe), src/lib/brouillon-fichiers.ts:58 (put complet), src/components/reprise-locale/index.tsx:38-56
- **Cause probable** : Un seul enregistrement monolithique (texte + File) réécrit à chaque modification du snapshot, sans temporisation ni séparation des fichiers du texte.
- **Correction proposée** : Séparer les enregistrements (clé texte et clé par fichier, écrite une seule fois à l'ajout), et temporiser l'écriture du texte (500 ms) ; ou ne conserver que le texte et exiger la re-sélection des fichiers.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PR178-A-05` — Session expirée : un envoi refusé par redirection est présenté comme « confirmation non reçue » (aucune mention de la session, aucun lien de reconnexion) ; sur la fiche personne il verrouille en plus…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 36219ec — message « session expirée » dédié ; reconnexion par un autre onglet · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte proprietaire, version candidate, Chromium. Expiration simulée en supprimant les cookies de session du navigateur pendant que la page est ouverte avec une saisie en cours.
- **Étapes** : A) /agence/<org>/alertes : saisir un titre, supprimer les cookies, cliquer « Créer l'alerte ». B) Fiche personne : remplir les étapes jusqu'au récapitulatif, supprimer les cookies, cliquer « Créer la fiche », puis constater l'état et la copie locale.
- **Attendu** : Message explicite « Votre session a expiré, reconnectez-vous (nouvel onglet) puis réessayez » avec lien ; saisie conservée ; aucun verrou sur un envoi qui n'a pas atteint l'action.
- **Observé** : A) La réponse de l'action est un 303 (redirection vers la connexion) ; l'écran reste sur /alertes avec « La confirmation n'a pas pu être reçue. Votre saisie reste dans cette page. Vérifiez le dossier avant de recommencer l'envoi. » ; aucun lien vers la connexion (0 lien) ; le titre est conservé ; chaque nouvel essai donne le même message. Un rechargement renvoie à la connexion et fait perdre la saisie, contrairement à « reste dans cette page ». B) Même cause : le bilan passe à creationIncertaine=true (« Un enregistrement a été interrompu… La création n'a pas pu être confirmée »), le bouton « Créer la fiche » est désactivé et la copie locale (1) garde ce drapeau : après reconnexion le formulaire reste verrouillé (voir PR178-A-03) pour une fiche qui n'existe pas (SQL : 0 ligne persons pour l'e-mail test-pr178-exp-*).
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a07b-sortie.txt (cas A : 303, message, 0 lien), a07-sortie.txt (cas B), captures/A-06-session-expiree-alerte.png, captures/A-05-session-expiree.png ; SQL : count(persons où email like 'test-pr178-exp%') = 0
- **Cause probable** : src/lib/use-action-state-protegee.ts:18-24 et use-action-formulaire.ts:35-38 : tout rejet (sauf redirect/notFound reconnus par unstable_rethrow) devient le même message générique ; src/lib/creation-fiche-personne.ts:54-56 : toute exception de creer() pose creationIncertaine. La redirection du proxy vers /connexion arrive comme réponse HTML inattendue, pas comme redirect() reconnu.
- **Correction proposée** : Dans les deux hooks, tester `erreur` (réponse non RSC / redirection) ou ping /api/session avant d'afficher le message ; afficher « session expirée » avec lien ouvert dans un nouvel onglet ; dans creation-fiche-personne, ne pas poser creationIncertaine quand l'échec précède l'envoi (session expirée, hors ligne).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PR178-B-01` — Session expirée pendant la saisie : l'envoi échoue avec « La confirmation n'a pas pu être reçue… Votre saisie est conservée » sans jamais dire que la session a expiré ; le renvoi échoue de la même fa…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 36219ec — même correction que PR178-A-05 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte propriétaire de test [TEST-pr178] connecté ; formulaire sans copie locale (demande d'aide /assistance → /agence/<org>/faq#nouvelle, useActionFormulaire) ; session expirée côté serveur (last_sign_in_at du compte reculé de 2 jours, 4 h d'inactivité autorisées pour proprietaire_direct).
- **Étapes** : 1. Remplir nature, titre, description et résultat attendu. 2. Laisser la session expirer (simulé en base). 3. Cliquer « Envoyer ma demande ». 4. Cliquer de nouveau. 5. Recharger la page. 6. Se reconnecter.
- **Attendu** : Un message qui dit que la session a expiré, qu'il faut se reconnecter, avec un lien vers /connexion ; ou une redirection vers la connexion ; la saisie n'est pas annoncée « conservée » si elle ne survit pas à la reconnexion.
- **Observé** : Étapes 3 et 4 : le même bandeau « La confirmation n'a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer. » (aucun lien vers /connexion, 0 occurrence), les cookies sont déjà supprimés par le proxy (303 vers /connexion suivi par fetch). Étape 5 : redirection vers /connexion?suite=… ; étape 6 : retour sur la page, champ titre vide (saisie perdue). Aucune ligne créée.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/PR178-B-session-expiree-envoi.png ; scripts/expire2.mjs (sortie console reproduite deux fois)
- **Cause probable** : src/lib/use-action-formulaire.ts (catch : message unique) et src/lib/use-action-state-protegee.ts : toute exception de l'appel d'action est traitée comme « réponse perdue ». Le 303 vers /connexion du proxy (src/proxy.ts, bloc session expirée) donne une réponse HTML que le client Next rejette ; le hook ne distingue pas ce cas d'une coupure réseau. Précision : le même message existait déjà dans use-action-formulaire.ts (formulaires en onSubmit) avant la PR ; la PR l'a étendu aux formulaires en useActionState (une soixantaine), qui affichaient auparavant la page d'erreur.
- **Correction proposée** : Dans les deux hooks, tester l'état de session (ou le type de réponse, ou un en-tête dédié posé par le proxy sur les actions serveur) et afficher « Votre session a expiré. Reconnectez-vous : cette saisie n'a pas été enregistrée » avec un lien /connexion?suite=<page>. Ne pas écrire « saisie conservée » pour un formulaire sans copie locale.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PR178-B-05` — Les formulaires de recherche ou de filtre sans attribut method="get" sont suivis comme des saisies à protéger : chaque recherche déclenche l'avertissement « Quitter le site ? » et reste bloquée si l'…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 36219ec — même correction que PR178-A-02 · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Page de l'espace connecté dont le formulaire de recherche n'écrit pas method="get" : /agence/<org>/documents/catalogue (filtre des modèles, espace propriétaire/agence), /artisan/clients (recherche d'un client), /admin/retours (filtre), /artisan/devis/nouveau (choix du client).
- **Étapes** : 1. Ouvrir /agence/<org>/documents/catalogue. 2. Saisir « bail » dans « Filtrer les modèles ». 3. Cliquer « Filtrer » (ou Entrée sur /artisan/clients).
- **Attendu** : La recherche s'exécute sans fenêtre : un formulaire GET n'est pas une saisie à conserver.
- **Observé** : Une boîte beforeunload s'ouvre (type constaté : beforeunload, dismiss par défaut du banc) ; en choisissant de rester, l'URL ne change pas et le filtre n'est pas appliqué. Il faut accepter de « quitter » pour chercher.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/PR178-B-recherche-bloquee.png ; scripts/recherche1.mjs
- **Cause probable** : src/lib/protection-saisie.ts, fonction eligible : formulaire.getAttribute("method")?.toLowerCase() !== "get" vaut true quand l'attribut est absent (null?.toLowerCase() = undefined), alors que la méthode par défaut est GET. Les tests de la PR (e2e/protection-saisie.spec.ts, « recherche et champs techniques ») n'essaient que <form method="get">. Le champ q est suivi, la soumission n'est jamais « confirmée » (pas d'attribut data-saisie-confirmee), donc avantSortie bloque.
- **Correction proposée** : Dans eligible, ne suivre que les formulaires qui déclarent une action serveur ou onSubmit : par exemple exiger data-saisie-confirmee ou un attribut posé par useActionFormulaire ; au minimum exclure aussi les formulaires dont la propriété form.method vaut « get » sans attribut action React. Ajouter un cas de test avec un formulaire sans method.
- **Correction sans aval** : oui

#### `REP-01` — contre_proposer_creneaux n'est pas rejouable : un second envoi (reponse perdue, double envoi) marque comme REFUSEES les propositions du locataire lui-meme, porte le compteur a 6 et declenche une aler…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — second envoi sans effet, liste corrigée = anciens créneaux caducs · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/reprises) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le locataire (bail actif, mission 'acceptee', 3 creneaux de l'artisan en attente) envoie ses 3 disponibilites ; la reponse reseau se perd (la page n'affiche pas le succes) et il renvoie le meme formulaire - ou double envoi. Le 2e appel passe (la mission est toujours 'acceptee', aucune garde 'mes propositions sont deja en attente') : l'UPDATE vise TOUS les creneaux statut='propose', y compris ceux proposes par le locataire au 1er appel -> 3 'refuse/locataire' + 3 'refuse/artisan' = 6 refus (RM-10.4.1) alors que le locataire n'a refuse que 3 creneaux. Consequences observees : (a) alerte 'creneaux_arbitrage' de criticite 'critique' ouverte pour le gerant ('6 creneaux refuses : reglez le rendez-vous par telephone') ; (b) historique opposable RM-10.4.4 faux (evenements creneaux_proposes : refuses_cumules 3 puis 6) ; (c) apres que l'artisan a accepte une des dates du locataire (accepter_crene…
- **Preuve expurgée (banc)** : preuves/relecture/reprises/t11-contre-proposition.sortie.txt et t11b-suite.sortie.txt (scripts ts/t11-contre-proposition.mjs, ts/t11b-suite.mjs) : apres 1 envoi {propose/locataire:3, refuse/artisan:3, alertes:0} ; apres rejeu {propose/locataire:3, refuse/artisan:3, refuse/locataire:3, alertes:1} ; 2 envois simultanes : meme etat final (alerte:1) ; evenements refuses_cumules 3 puis 6 ; proposer_creneaux ensuite : 'Six creneaux ont deja ete refuses'
- **Cause probable** : app/supabase/migrations/20261012190000_validation_creneaux.sql:111-190 (contre_proposer_creneaux : update ... set statut='refuse' where intervention_id=... and statut='propose', l.~163-166 de la fonction)
- **Correction proposée** : Dans contre_proposer_creneaux : (1) refuser si le locataire a deja des propositions en attente : 'if exists (select 1 from intervention_creneaux where intervention_id=p_intervention and statut='propose' and propose_par='locataire' and debut>now()) then raise exception 'Vos disponibilites sont deja transmises ...'' ; (2) limiter l'UPDATE a propose_par='artisan' ; (3) idempotence applicative : transmettre une cle de tentative (comme declarer_mon_incident_reprise) pour rejouer sans effet. Test de non-regression : appeler 2 fois avec les memes dates et verifier 1 seul tour locataire et 0 alerte.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select a.intervention_id, a.tour as tour_locataire_refuse, min(b.tour) as tour_locataire_suivant, (select count(*) from public.intervention_creneaux r where r.intervention_id=a.intervention_id and r.statut='refuse') as refus_cumules, exists (select 1 from public.alerts al where al.type='creneaux_arbitrage' and al.details->>'intervention_id'=a.intervention_id::text) as alerte_arbitrage from public.intervention_creneaux a join public.intervention_creneaux b on b.intervention_id=a.intervention_id and b.propose_par='locataire' and b.tour>a.tour where a.propose_par='locataire' and a.statut='refuse…`

#### `SUP-02` — Pendant une session de diagnostic artisan ouverte (30 min), le trigger de lecture seule est pose sur TOUTES les tables de public, y compris supervision_arrets / supervision_operations : l'arret d'urg…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — l'arrêt d'urgence ne dépend plus d'un diagnostic ouvert · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un super-administrateur ouvre un diagnostic sur un artisan, puis doit declencher l'arret d'urgence : commander_arret_supervision echoue avec 'Diagnostic artisan en lecture seule : aucune modification autorisee' (message affiche tel quel par l'ecran, sans dire qu'il faut quitter la session). L'arret redevient possible apres fermer_session_artisan().
- **Preuve expurgée (banc)** : preuves/relecture/supervision/21-arret-pendant-diagnostic.sortie.txt
- **Cause probable** : 20261012222100:poser_gardes_diagnostic_artisan exclut seulement supervision_sessions_artisan et audit_log ; supervision_arrets, supervision_operations, supervision_vacances, supervision_alertes_internes, supervision_consignes* reçoivent le trigger refuser_mutation_diagnostic_artisan.
- **Correction proposée** : Ajouter les tables supervision_* à la liste d'exclusion (l'arrêt d'urgence ne doit jamais dépendre de l'état d'une session de diagnostic) puis rejouer poser_gardes_diagnostic_artisan() ; à défaut, faire fermer la session par commander_arret_supervision et préciser le message d'erreur.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select count(*) from public.supervision_sessions_artisan where fermee_le is null and expire_le>now(); -- sessions pendant lesquelles un arrêt d'urgence serait refusé`

#### `SA-04` — Mode relais actif et arrêt d'urgence invisibles hors de /admin/relais : aucun bandeau dans la console, les pages Équipes et Brief ne signalent pas l'arrêt

- **Sévérité** : P2 · **Statut** : corrigée en branche — 9978efa — bandeau d'arrêt d'urgence et de relais sur toute la console · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-admin aal2 ; plan de vacances actif et/ou arrêt global enregistré
- **Étapes** : 1) Enregistrer l'arrêt global (Périmètre 'Tous les traitements contrôlés', Arrêter). 2) Ouvrir /admin, /admin/brief, /admin/equipes, /admin/sante, /admin/consignes. 3) Chercher une mention d'arrêt ou de relais actif.
- **Attendu** : L'état 'arrêt d'urgence en cours' et 'relais actif jusqu'à …' sont visibles de partout dans la console (bandeau), et la page Équipes ne promet pas de 'Prochain passage' pendant un arrêt global
- **Observé** : Aucune mention sur les 5 pages (seuls /admin/relais, section 'Arrêt avant les prochains effets', en bas de page, et le lien 'Relais et absences →' du brief). La page Équipes continue d'afficher 'Premier passage attendu' et 'Prochain passage : vers 9 h' pendant un arrêt global. Dans le code, executerMission revient 503 avant commencer_mission quand l'arrêt est actif (src/lib/execution-mission.ts) : aucun passage n'est écrit, donc un arrêt oublié ne laisse aucune trace dans Équipes ni dans le brief (lecture de code, non exécuté sur le banc faute de CRON_SECRET : hypothèse à vérifier). Aucun lieu n'affiche non plus qui a arrêté ni quand ; seul le motif apparaît.
- **Preuve expurgée (banc)** : sql2/s10_arret_sortie.txt (lignes 'bandeau/indicateur d'arrêt visible sur … AUCUN') ; captures2/08-arret-global-actif.png
- **Cause probable** : src/app/admin/layout.tsx et src/app/admin/equipes/page.tsx ne lisent jamais supervision_arrets / supervision_vacances (grep) ; src/lib/execution-mission.ts:8-9
- **Correction proposée** : Afficher dans le bandeau de la console 'Arrêt d'urgence en cours depuis … par … (motif)' et 'Relais actif jusqu'à …' ; sur Équipes, remplacer 'Prochain passage' par 'Arrêté' ; écrire un passage 'arrêté' (ou une opération) quand une exécution planifiée est refusée par l'arrêt
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SA-08` — Journal d'audit : 9 types d'actions sans libellé (« Action enregistrée (libellé manquant) »), dont l'octroi du rôle de super-administrateur et les décisions de support, et la suppression d'un encaiss…

- **Sévérité** : P2 · **Statut** : corrigée en branche — 9978efa — neuf codes nommés, plus de repli « suppression = nettoyage » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-admin aal2 ; journal /admin/journaux ; un rôle super_admin ajouté puis modifié (fixture), deux décisions de support sur un retour
- **Étapes** : 1) Octroyer le rôle super_admin à un compte (fixture SQL), le désactiver. 2) Qualifier un retour utilisateur (en examen, résolu). 3) Lire /admin/journaux et la ligne 'suppression_encaissement' (admin d'agence, motif saisi) dans audit_log.
- **Attendu** : Chaque action sensible a un libellé lisible, un auteur, une cible, une date et un résultat (ex. 'Droit de supervision accordé à X par Y')
- **Observé** : Les lignes existent en base (adhesion_creee {role: super_admin, statut: active}), mais l'écran affiche 'Action enregistrée (libellé manquant)' sans cible. Sans aucune correspondance ni repli : adhesion_creee, adhesion_retiree, decision_retour (auteur et heure visibles, ni cible ni résultat), bien_retabli, bien_retire, point_du_matin_prepare, invitation_locataire, invitation_locataire_acceptee, invitation_locataire_envoi_echec (9 types, 9 lignes dans la première page du journal). Libellés trompeurs par expressions régulières de repli : suppression_encaissement et suppression_encaissement_depot -> 'Nettoyage de données arrivé à échéance' (alors que c'est un geste humain sur la comptabilité, avec motif), adhesion_modifiee -> 'Modification d'une information protégée' (le rôle visé n'est pas dit). Pour l'octroi d'un droit de supervision, l'événement le plus grave de la console est donc illis…
- **Preuve expurgée (banc)** : sql2/ecran-journaux-2.txt ; sql2/s23 (sortie console) ; sql2/s20_retours_sortie.txt ; requête audit_log par action (13/10 00:24 adhesion_creee super_admin)
- **Cause probable** : src/lib/libelles-journaux.ts:50-58 (table ACTIONS incomplète ; replis par expressions régulières /purge\|retention\|suppression/, /modif\|update\|change/, /creat\|ajout\|insert/ ; défaut 'libellé manquant')
- **Correction proposée** : Ajouter les libellés explicites avec cible (compte, rôle, retour, encaissement) ; retirer le repli /suppression/ ; mettre en évidence tout octroi du rôle super_admin ; test qui échoue si une action écrite au journal n'a pas de libellé explicite
- **Correction sans aval** : oui

#### `VFL-03` — Copie locale refusée : un lien interne efface la saisie de la fiche personne sans avertissement, malgré « Gardez cet onglet ouvert »

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/garde-copie-locale.test.ts, e2e/personne-reprise.spec.ts : « copie refusée, un lien interne demande confirmation avant d'abandonner la saisie » · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : IndexedDB refusé (navigation privée stricte, stockage bloqué) ; propriétaire connecté
- **Étapes** : 1. addInitScript refusant IDBFactory.open et sessionStorage. 2. /agence/<org>/personnes#creer-fiche, rôle Locataire, saisir un nom, attendre 0,9 s : alerte « La copie sur cet appareil est indisponible. Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement ». 3. Cliquer « Mes lots » dans le menu latéral. 4. Revenir sur la fiche.
- **Attendu** : Une boîte « Quitter cette page ? » (comme pour les formulaires protégés) ou au moins l'avertissement équivalent à celui de la fermeture d'onglet
- **Observé** : Aucune boîte, navigation immédiate vers /parc, saisie perdue, aucune bannière « Reprendre votre saisie » au retour. En comparaison, page.close(runBeforeUnload) ouvre bien une boîte beforeunload dans le même état.
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/copies-f2.mjs (sortie : A dialogues [] navigué true ; B dialogues [beforeunload])
- **Cause probable** : app/src/lib/protection-saisie.ts:66 exclut les formulaires data-protection-saisie="locale" du garde de liens ; app/src/components/reprise-locale/index.tsx:114-120 n'écoute que beforeunload (non déclenché par une navigation client Next Link)
- **Correction proposée** : Dans le garde de clic, traiter un formulaire « locale » dont le statut est refuse/conflit/attente comme modifié (exposer l'état de la copie par un attribut data-copie-statut sur le formulaire), ou faire confirmer la navigation interne dans reprise-locale.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VFL-07` — Montants restés en type=number : « 840,00 » devient 84 000 dans un navigateur non francophone (charges réelles à régulariser, indice IRL, loyer/charges/dépôt du bail)

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/montants-actions-lecture.test.ts : 209 tests, 22 couples action/champ, tests/champs-montant-texte.test.ts : 19 nouvelles lignes, tests/saisie-mo · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : flux (verification/flux-finale) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Navigateur à interface non française (ici Chromium en-US), propriétaire sur la page d'un bail
- **Étapes** : 1. /agence/<org>/baux/<id>, bloc « Régulariser » (charges_reelles). 2. Taper « 840,00 » au clavier. 3. Lire la valeur du champ avant envoi. Idem irl_nouveau « 145,17 ».
- **Attendu** : 840 (ou refus avec message), comme pour les 17 champs convertis en texte décimal par VER-TS-02
- **Observé** : Le champ affiche 84000 (et 14517 pour l'indice IRL) : la virgule est absorbée. Recoupe la fiche existante VER-TS-02 (a_trancher) : le défaut est confirmé en navigateur sur ces champs, le risque est financier (régularisation de charges) si la valeur n'est pas relue avant l'envoi.
- **Preuve expurgée (banc)** : preuves/verification/flux-finale/residuels-number.json
- **Cause probable** : app/src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx (charges_reelles, irl_nouveau) et app/src/components/champs-bail.tsx:272-322 : input type=number lus par Number() dans app/src/app/actions/baux.ts:90-105 et loyers.ts:185
- **Correction proposée** : Faire lire ces actions comme lireMontant (une ligne par action, test unitaire) puis passer les champs en texte décimal, comme décidé pour les 17 autres (rapport saisie, section a_trancher).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `VER-PR178-01` — Régression : la correction PR178-A-02 désactive la protection « Quitter la page ? » pour une quarantaine de formulaires de saisie (profil, bail, lot, EDL, messages, assistance…)

- **Sévérité** : P2 · **Statut** : corrigée en branche — vague 5-7 ; tests : tests/protection-saisie-formulaires.test.ts · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : vérificateur adverse PR #178 (corrections) (verification/pr178) · **Version testée** : candidate dfbc19a (banc, 3100) et bases jetables reconstruites depuis le manifeste
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Build candidat servi sur 3100 ; compte propriétaire ; aucun envoi n'est nécessaire
- **Étapes** : 1. Ouvrir /agence/<org>/profil (ou /assistance) ; 2. Saisir un caractère dans « Ville » (ou un texte dans « Description ») ; 3. Cliquer un lien de la barre latérale
- **Attendu** : Boîte « Des modifications ne sont pas encore enregistrées. Quitter cette page… ? », comme en main-178 (formulaires suivis dès la première frappe) et comme pour un formulaire portant l'attribut (témoin EX-01)
- **Observé** : Navigation immédiate, aucun confirm() ni beforeunload ; la saisie est perdue sans avertissement (EX-02 profil, EX-03 /assistance). protection-saisie.ts:eligible() exige désormais hasAttribute('data-saisie-confirmee') ; sur 256 balises <form> du code, 61 ne l'ont pas : environ 35 vrais formulaires de saisie branchés sur useActionFormulaire/onSubmit ou useActionStateProtegee (profil, bail : parcours/édition/annexe/personnes, lot, diagnostic, DPE, chambres, EDL annexes, messages propriétaire, catalogue de documents, clients artisan, retours /assistance, décisions admin) ; le reste = connexion, mots de passe, déconnexion, filtres GET. Les tests ne le voient pas : e2e/protection-saisie.spec.ts:48 sert une page synthétique qui porte déjà l'attribut. Non reproduit mais probable : confirmerSoumission renvoie vrai sans suivi, donc les formulaires à réinitialisation après succès dont les champs r…
- **Preuve expurgée (banc)** : preuves/verification/pr178/sortie-candidate.txt ; preuves/verification/pr178/forms-sans-attribut.txt (liste des 61 formulaires) ; témoin avec attribut : même fichier, premier bloc
- **Cause probable** : app/src/lib/protection-saisie.ts:47-52 (eligible) : l'attribut a été érigé en liste blanche, alors que preparerSoumission/confirmerSoumission (use-action-formulaire.ts, use-action-state-protegee.ts) savaient déjà confirmer ces formulaires. Seuls les filtres GET sans method posaient problème (PR178-A-02).
- **Correction proposée** : Soit ajouter data-saisie-confirmee aux formulaires qui utilisent useActionFormulaire/useActionStateProtegee (et un test qui échoue si un <form> branché sur ces hooks n'a pas l'attribut), soit inverser la règle : suivre par défaut et exclure explicitement les filtres (method=get, role=search, ou attribut data-saisie-ignoree). Ne change aucune règle métier.
- **Correction sans aval** : oui

#### `PDM-01` — Le point du matin ne s'actualise plus depuis le 13/10 : la lecture des artisans en attente passe par une fonction que le client de service se voit toujours refuser

- **Sévérité** : P2 · **Statut** : déployée — PR #180 fusionnée (0f7dbd5) et déployée le 14/10/2026 après autorisation du dirigeant ; tests rouge puis vert, sept mutations détectées, équivalence rejouée sur le banc, relecture indépendante à trois angles ; reste à constater en production la régénération du point au prochain passage de mission (chemin du client de service non rejouable depuis l'environnement) · **Propriétaire** : mission (coordinateur) — livré en branche
- **Rôle / source** : super-administrateur (coordinateur) · **Version testée** : main au 14/10/2026 (c99e2c6, déploiement de la PR #179) ; correction en 0f7dbd5 (PR #180)
- **Environnement** : production en lecture seule (journaux d'exécution de Vercel, tables de la base) pour le constat ; banc local isolé (Postgres 16, émulateur Supabase) pour le rejeu
- **Attendu** : Après chaque passage de mission, le point du jour de chaque équipe est enregistré avec les décisions à prendre (publications, veille, artisans, retours).
- **Observé** : Vercel regroupe 5 erreurs « [point du matin] Le point n'a pas été actualisé : données indisponibles (artisans) » (première le 13/10 vers 09 h 40 UTC, dernière le 14/10 à 11 h 15 UTC). La dernière décision a été créée le 13/10 à 09 h 11 UTC ; 236 décisions restent en attente. Depuis le commit d4f3b59 (PR #177), une source illisible bloque tout l'enregistrement ; avant, l'échec était avalé et la liste des artisans restait vide sans bruit.
- **Preuve expurgée (banc)** : Lecture du code (genererPointsDuMatin, lireAttentes, execution-mission) ; définition en production de artisans_a_valider() (« if not public.is_super_admin() then raise exception 'Accès refusé' ») et de is_super_admin() (aal2 et adhésion super_admin) ; rejeu sur le banc, transaction annulée : session de supervision AAL2 → lignes, service_role → « Accès refusé » ; get_runtime_errors de Vercel ; table decisions_du_matin (max cree_le).
- **Cause probable** : artisans_a_valider() n'a jamais pu être appelée par le client de service qui génère le point ; la PR #177 a rendu l'échec bloquant sans prévoir cette source.
- **Correction proposée** : Lire les artisans en attente et leurs justificatifs directement dans lireAttentes (une requête, justificatifs imbriqués), contenu identique à la fonction SQL ; aucune migration, aucun droit modifié.
- **Correction sans aval** : oui

#### `ARC-07` — Facture externe déposée avec une erreur (numéro, montant, pièce) : impossible de la corriger ni de l annuler, le chantier terminé est figé

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Chantier externe terminé, facture déposée
- **Étapes** : 1. Ouvrir le chantier facturé : seuls « Voir la facture » et « Suivre mes règlements déclarés » sont proposés 2. Tenter, par la RPC, d annuler le chantier ou de déposer une seconde facture
- **Attendu** : Une voie de correction tracée (annulation avec motif et avoir, ou remplacement de la facture) ; à défaut, avertissement avant dépôt
- **Observé** : annuler : « Ce chantier est terminé ou annulé » ; seconde facture : « Ce dossier ou cette facture existe déjà. Rechargez avant de recommencer » ; une faute de frappe dans le numéro ou une mauvaise pièce est définitive (et le numéro erroné reste réservé)
- **Preuve expurgée (banc)** : captures/c10-facture.png ; sql/s07-verifs-api.txt
- **Cause probable** : supabase/migrations/20261012220000_artisan_clients_externes.sql : artisan_factures_externes unique(chantier_id), aucune action de correction ou d avoir dans artisan_externe_ecrire
- **Correction proposée** : À trancher : action « annuler_facture » motivée (statut annulée, pièce conservée) autorisant une nouvelle facture, ou écran de relecture avant dépôt
- **Correction sans aval** : non (aval du dirigeant requis)

#### `ARC-08` — Un artisan refusé par la plateforme et sur liste noire globale garde l outil clients externes, devis et factures

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : artisan (artisan) · **Version testée** : candidate dfbc19a (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Module clients externes activé ; fiche artisan au statut refusé avec blacklist_globale renseignée (fixture SQL sur ma propre fiche de test, remise ensuite en en_attente)
- **Étapes** : 1. Se connecter avec ce compte 2. Ouvrir /artisan/clients et créer un client (ou appeler artisan_externe_ecrire)
- **Attendu** : Décision explicite : soit accès coupé (au moins l émission de documents à l en-tête Gerimmo), soit accès conservé et documenté
- **Observé** : Bandeau « Votre inscription a été refusée. Motif : … » puis carnet complet, création de client acceptée (HTTP 200) ; un artisan non validé (en_attente) l utilise aussi ; la garde de l offre ne regarde que l existence de la fiche (exiger_artisan_reel) et l interrupteur global (hypothèse à vérifier, non constatée faute de rendu PDF sur le banc : les devis qu il produirait porteraient le gabarit de documents Gerimmo)
- **Preuve expurgée (banc)** : captures/c21-artisan-refuse-clients.png
- **Cause probable** : supabase/migrations/20261012220000_artisan_clients_externes.sql et 20261012225000 : artisan_module_actif ne contrôle ni statut_plateforme ni blacklist_globale_le ; exiger_artisan_reel non plus
- **Correction proposée** : Décision métier à prendre ; si coupure : exiger statut_plateforme<>refuse et blacklist_globale_le is null pour les écritures (lecture et export conservés)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUD-B-04` — Hypothèse à vérifier : la limite de corps des fonctions Vercel (4,5 Mo, d'après la documentation de la plateforme) est inférieure aux 10 Mo annoncés pour un dépôt de pièce

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur-b (auditeur/b) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Déploiement Vercel
- **Étapes** : En production : déposer un PDF de 6 Mo dans la GED
- **Attendu** : Dépôt accepté jusqu'à 10 Mo ou message clair
- **Observé** : next.config.ts règle bodySizeLimit à 55 Mo pour toutes les actions et l'application annonce 10 Mo par fichier (TAILLE_MAX_OCTETS). Sur Vercel, une requête de plus de 4,5 Mo vers une fonction est refusée par la plateforme avant le code de l'application ; un bail ou un diagnostic scanné de 5 à 10 Mo échouerait alors avec une page d'erreur de plateforme et non le message de l'application. Non observable sur le banc local (pas de plateforme) ; la limite de 4,5 Mo vient de ma connaissance de la documentation Vercel et n'a pas été relue ici.
- **Preuve expurgée (banc)** : snap-main/app/next.config.ts:147-158 ; snap-main/app/src/lib/file-type.ts (TAILLE_MAX_OCTETS)
- **Cause probable** : Dépôts de fichiers par action serveur (comme le note le commentaire S11 du fichier de configuration)
- **Correction proposée** : Aligner la limite annoncée sur la limite de la plateforme, ou déposer via URL signée de stockage ; mesurer en préproduction
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `AUD-C-02` — Les 8 taches pg_cron (cycle mensuel des appels de loyer, retention, alertes d'impayes, declencheur marketing) ne sont ni sauvegardees, ni decrites dans la procedure de restauration, ni surveillees pa…

- **Sévérité** : P2 · **Statut** : à trancher — décision D07 de la page de décisions groupées · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur-c (auditeur/c) · **Version testée** : e9f31ac (code de main, photographie lecture seule) ; banc servant e9f31ac
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Restauration de la base dans un projet neuf, ou arret silencieux de pg_cron / pg_net
- **Étapes** : 1. Lire scripts/sauvegarde/base.mjs : SCHEMAS = public, auth, storage. 2. Exporter la copie (qui contient un schema cron avec 8 taches) et lister le dump avec pg_restore -l : 0 entree contenant 'cron'. 3. grep cron / pg_net dans docs/sauvegarde-et-restauration.md : 0 mention. 4. grep cycle_mensuel dans app/src : 0 lecteur ; Sante ne lit que les evenements tache_*.
- **Attendu** : La procedure de reprise liste la recreation des taches pg_cron et l'activation de pg_cron/pg_net ; un ecran ou une alerte signale qu'un cycle mensuel n'a pas tourne.
- **Observé** : Apres une restauration, les appels de loyer du mois (cycle-mensuel, le 1er a 05:00 UTC), les alertes d'impayes, la retention et le declencheur marketing ne repartent pas, sans aucun signal (hypothese sur l'effet en production : seule l'exclusion du dump, l'absence de documentation et l'absence de lecteur sont prouvees). Contournement : bouton 'generer les appels' bail par bail.
- **Preuve expurgée (banc)** : preuves/auditeur/c/preuves-sql.txt ; inventaire-automatismes.md section 2
- **Cause probable** : app/scripts/sauvegarde/base.mjs (SCHEMAS) ; app/docs/sauvegarde-et-restauration.md ; app/src/lib/tache.ts (dernieresTaches ne retient que tache_*).
- **Correction proposée** : Ajouter a la procedure l'etape 'rejouer les cron.schedule des migrations et activer pg_cron/pg_net' ; exporter select jobname, schedule, command from cron.job dans la sauvegarde ; faire consigner cycle_mensuel sous tache_cycle_mensuel (ou lire cycle_mensuel dans Sante, retard > 32 jours).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRO2-01` — Un propriétaire dont la commune n'est pas ouverte au réseau ne peut solliciter aucun artisan, même un artisan connu : le carnet ne se remplit que par une intervention déjà confiée

- **Sévérité** : P2 · **Statut** : à trancher — choix produit : réseau fermé pour la commune du propriétaire, carnet sans formulaire d'ajout · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (chaine/1) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Propriétaire n°2 (bien en 75011, commune INSEE 75056), incident qualifié « charge propriétaire », aucun artisan dans son carnet, réseau non ouvert pour le métier et la commune
- **Étapes** : 1. Ouvrir /agence/<org>/incidents/<id> d'un incident qualifié. 2. Section « Confier à un artisan » : plomberie, entretien courant, cocher « J'assume un devis unique ». 3. Observer le bouton. 4. Ouvrir « Carnet d'artisans » : « Votre carnet se complète automatiquement lorsqu'une intervention est confiée à un artisan ».
- **Attendu** : Soit un moyen de confier le dossier à un artisan connu du propriétaire (invitation, ajout au carnet), soit un chemin explicite vers la clôture ou l'attente ; à confirmer par la décision produit sur l'ouverture progressive du réseau
- **Observé** : Bouton « Ouvrir la mise en concurrence » désactivé, message « Le réseau d'artisans Gerimmo n'est pas encore disponible pour ce métier dans cette zone », bouton secondaire « Signaler mon intérêt » (n'envoie rien). Le carnet est vide et sans formulaire d'ajout. Seuls le super-administrateur (ouverture de communes, rattachement d'artisans) ou une insertion en base (artisan_agences) débloquent le parcours. Pour poursuivre la chaîne il a fallu une fixture SQL (zone 75011 pour artisan.alpha qui ne couvrait que 75012, et lien carnet). Peut être un choix produit voulu de la V1 (réseau fermé par défaut) : non recoupé avec le wiki.
- **Preuve expurgée (banc)** : preuves/chaine/1/captures/p3-05-ouverture-consultation.png ; preuves/chaine/1/captures/p3-07-carnet-artisans.png
- **Cause probable** : src/app/agence/[orgId]/incidents/formulaires-artisan.tsx:188 (disabled={!autorisee}) ; migrations reseau_disponibilite / reseau_contact_personnel (contact personnel = ligne artisan_agences active, créée seulement par le rattachement)
- **Correction proposée** : Décision produit : permettre à un propriétaire d'inviter ou d'ajouter un artisan à son carnet personnel, ou afficher la voie de sortie (clôturer, appeler soi-même) à côté du message de réseau fermé
- **Correction sans aval** : non (aval du dirigeant requis)

#### `ART-13` — L'artisan ne peut pas déposer une version 2 de son devis : la demande close devient lecture seule, sans « réviser mon devis »

- **Sévérité** : P2 · **Statut** : à trancher — fonction manquante : l'artisan ne peut pas déposer une version 2 de son devis · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : artisan (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Devis v1 envoyé (sollicitation devis_depose)
- **Étapes** : 1. Rouvrir /artisan/devis/<sollicitation>. 2. Chercher un moyen de corriger ou de remplacer le devis. 3. Appeler deposer_devis_structure une seconde fois avec la session de l'artisan.
- **Attendu** : Un moyen explicite de déposer une version 2 (numérotée, v1 conservée) quand le propriétaire le demande
- **Observé** : L'écran affiche « Ma réponse » (montant, validité, lien PDF) sans action. L'appel RPC renvoie « Cette demande n'attend plus de devis (état : devis_depose) ». Corollaire de PRO2-12 : aucune numérotation de versions n'existe (un seul incident_devis par sollicitation).
- **Preuve expurgée (banc)** : preuves/chaine/1b/sql/permissions-api.txt (ligne A.deposer_devis_structure) ; preuves/chaine/1b/captures/a7-02-apres-envoi.png
- **Cause probable** : deposer_devis n'accepte que les sollicitations à l'état envoyee ; pas de notion de version.
- **Correction proposée** : Voir PRO2-12 (décision produit préalable).
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRO2-12` — Un devis reçu ne peut être que retenu : ni refus motivé, ni demande de révision (écart avec le référentiel : déposé, validé, refusé ou expiré)

- **Sévérité** : P2 · **Statut** : à trancher — fonction manquante : un devis reçu ne peut pas être refusé ni renvoyé en révision · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Incident qualifié « charge propriétaire », consultation en devis unique, un devis déposé par l'artisan sollicité
- **Étapes** : 1. Ouvrir la fiche de l'incident. 2. Chercher une action pour refuser le devis avec un motif ou demander une nouvelle version. 3. Lister les boutons de la fiche.
- **Attendu** : Possibilité de refuser le devis (motif conservé et transmis) ou de demander une révision, l'artisan pouvant alors déposer une version 2 (wiki concepts/Devis : déposé, validé, refusé ou expiré)
- **Observé** : Les seules actions sont « Télécharger le détail du devis (PDF) », « Ouvrir le devis » et « Retenir ce devis ». Aucun refus, aucun motif, aucune révision. Le statut devis_statut du schéma ne compte que depose, retenu, non_retenu, expire, annule. Pour obtenir une autre offre il faut ouvrir une nouvelle consultation avec un autre artisan, déjà exclu ici car « tous les artisans qui correspondent sont déjà sollicités ». Parcours étapes 3 et 4 de la mission (refus v1, dépôt v2) impossible. À trancher : choix produit V1 ou fonction manquante.
- **Preuve expurgée (banc)** : preuves/chaine/1b/captures/o2-01-devis-recu.png ; liste des boutons dans la sortie du script scripts/o3.mjs ; énumération devis_statut en base
- **Cause probable** : Le code n'implémente que retenir_devis (app/actions/incidents.ts retenirDevis) ; wiki 'Divergences code et référentiel V3' signale déjà l'écart d'états.
- **Correction proposée** : Décision produit : soit documenter que la V1 ne propose que « retenir » (et le dire à l'écran), soit ajouter un refus motivé + une demande de révision qui rouvre la sollicitation à l'artisan.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRO2-13` — Réception d'un devis : aucune alerte dans l'application, seulement un e-mail ; l'incident n'est pas compté « À traiter »

- **Sévérité** : P2 · **Statut** : à trancher — aucune alerte dans l'application à la réception d'un devis (e-mail seul) : création d'une alerte en base à décider · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (chaine/1b) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Devis déposé alors que l'envoi d'e-mail échoue ou n'est pas lu
- **Étapes** : 1. L'artisan envoie son devis. 2. Le propriétaire ouvre son tableau de bord / ses alertes / la liste des incidents.
- **Attendu** : Une alerte « Devis reçu — à décider » (comme pour « Incident à qualifier » ou « Nouveau message »), l'incident compté dans « À traiter »
- **Observé** : Le compteur d'alertes reste à 6, aucune ligne alerts de type devis, « À traiter » reste à 2 (INC-0001 et INC-0003 à qualifier) alors que INC-0002 attend la décision du propriétaire. Seule trace : l'événement « Devis déposé » dans la chronologie de l'incident et l'e-mail devis_recu (échec tracé dans tech_log faute de fournisseur). Si l'e-mail est perdu, le dossier dort.
- **Preuve expurgée (banc)** : preuves/chaine/1b/captures/o2-01-devis-recu.png ; preuves/chaine/1b/sql/notifications-tech-log.txt (notification_echec, evenement devis_recu)
- **Cause probable** : notifierDevisRecu (lib/notifications.ts) n'envoie que l'e-mail ; aucune insertion dans alerts à la création du devis.
- **Correction proposée** : Créer une alerte (type devis_recu, criticité normale) dans la même transaction que le dépôt du devis et compter l'incident dans « À traiter » tant qu'un devis attend la décision.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `ART-21` — Rien n'empêche de démarrer, de terminer et de facturer plusieurs jours avant le rendez-vous confirmé avec le locataire

- **Sévérité** : P2 · **Statut** : à trancher — règle métier : démarrer, terminer et facturer avant le rendez-vous confirmé · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : artisan / chaîne (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Mission planifiée au 19/10 09:00-11:00, locataire informé « E2E Plomberie Dubois intervient chez vous »
- **Étapes** : Le 14/10, l'artisan touche « Je démarre l'intervention », dépose une photo, le compte rendu, puis la facture
- **Attendu** : Au minimum un avertissement (ou une garde) quand la mission est démarrée/terminée avant le début du rendez-vous confirmé, ou une confirmation par le locataire avant facturation
- **Observé** : demarrer_intervention n'accepte que les statuts acceptee/planifiee et ne compare pas la date : la mission passe en cours puis terminée cinq jours avant le rendez-vous, la facture est déposée, le propriétaire reçoit « facture déposée » alors que le locataire attend encore l'artisan ; la photo « après » et le compte rendu ne sont pas vérifiables par le système (une photo quelconque suffit)
- **Preuve expurgée (banc)** : sql/etat-apres-facture.txt, captures/d5-01-intervention-terminee.png
- **Cause probable** : supabase/migrations: demarrer_intervention (aucune comparaison avec debut_prevu) ; terminer/deposer_compte_rendu idem
- **Correction proposée** : Avertir (non bloquant) l'artisan qui démarre avant debut_prevu - 2 h, journaliser l'écart dans la chronologie, et faire figurer « rendez-vous prévu le … / intervention terminée le … » sur la fiche de validation du propriétaire
- **Correction sans aval** : non (aval du dirigeant requis)

#### `CHN-01` — Les créneaux non retenus sont enregistrés « refusés » : après trois reports, l'artisan est bloqué et l'écran impute au locataire des refus qu'il n'a jamais faits

- **Sévérité** : P2 · **Statut** : à trancher — règle métier : les créneaux non retenus comptent aujourd'hui comme refusés (six refus = arbitrage) ; une correction en base les rendrait « caducs » · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : chaine (artisan, locataire, propriétaire) (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Mission acceptée, rendez-vous négocié entre l'artisan et le locataire (version candidate servie sur le banc)
- **Étapes** : 1) l'artisan propose 3 créneaux ; 2) le locataire en retient 1 ; 3) l'artisan « Déplace le rendez-vous » (3 nouveaux) ; 4) le locataire en retient 1 ; 5) idem une troisième fois ; 6) l'artisan tente un quatrième report
- **Attendu** : Seuls les créneaux réellement refusés par le locataire (« Aucun ne me convient ») comptent pour l'arbitrage à six refus ; les créneaux non choisis sont « caducs » ou « non retenus »
- **Observé** : Chaque choix passe les 2 autres créneaux proposés à « refuse » (choisir_creneau) ; le décompte de l'arbitrage compte tous les « refuse ». Après 3 tours : 6 refus, 0 proposition du locataire, l'artisan reçoit « Six créneaux ont déjà été refusés : le rendez-vous se règle désormais avec le gérant » et ne peut plus déplacer ; la fiche du propriétaire affiche « Refusé » en face de créneaux que le locataire n'a pas refusés ; le texte « refus persistant du locataire tracé et opposable » (RM-10.4.4) s'appuie donc sur des données fausses
- **Preuve expurgée (banc)** : sql/creneaux-faux-refus.txt, captures/c4-01-deplacement-erreur.png
- **Cause probable** : app/supabase/migrations/20261013102000_planning_conflits.sql:86 (choisir_creneau : set statut='refuse', refuse_le=now() sur les autres créneaux 'propose') et 20261012190000_validation_creneaux.sql:73 (garde 'six refus' sur count statut='refuse'), 20260927160000_creneaux_passes_non_retenables.sql:222 (drapeau arbitrage)
- **Correction proposée** : Passer les créneaux non choisis à 'caduc' (statut existant) ou distinguer le refus par un champ dédié, et ne compter que les créneaux refusés par refuser_creneaux_locataire. Prévoir un test : 3 cycles choix/report ne déclenchent pas l'arbitrage.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `LOC-21` — Le locataire ne peut ni reporter ni annuler un rendez-vous confirmé : aucun geste après la confirmation

- **Sévérité** : P2 · **Statut** : à trancher — fonction manquante : le locataire ne peut ni reporter ni annuler un rendez-vous confirmé · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : locataire (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Rendez-vous retenu (mission planifiée)
- **Étapes** : 1) le locataire choisit un créneau ; 2) il rouvre « Mes demandes » ; 3) il cherche à reporter ou annuler
- **Attendu** : Un geste « Je ne peux plus » (reporter avec nouvelles disponibilités, ou prévenir) comme le prévoit la machine à états du rendez-vous (confirmé → reporté → proposé) du wiki Planification d'intervention ; le brief de la chaîne l'attend aussi
- **Observé** : La fiche ne montre plus que « Prévoyez d'être présent, ou de faire ouvrir — nous vous le rappellerons la veille » ; les gestes de report n'existent que côté artisan (« Déplacer le rendez-vous ») et d'annulation que côté propriétaire (« Retirer la mission à cet artisan ») ; le seul contournement est d'écrire un message libre à « Mon gestionnaire »
- **Preuve expurgée (banc)** : captures/l2-01-rdv-planifie-locataire.png
- **Cause probable** : app/src/app/locataire/[orgId]/demandes/suivi-intervention.tsx (aucun formulaire à l'étape planifiee) ; pas de RPC locataire de report (refuser_creneaux_locataire n'agit qu'avant le choix)
- **Correction proposée** : Ajouter à l'étape planifiée « Je ne peux pas être là » : ouvre la contre-proposition (trois disponibilités), invalide le créneau retenu et prévient l'artisan et le propriétaire ; à défaut, un lien direct vers le message au gestionnaire pré-rempli
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PRO2-21` — Le règlement de la facture de l'artisan n'est pas un geste de l'application : l'écriture du journal n'est liée à rien et la facture ne passe jamais à « réglée »

- **Sévérité** : P2 · **Statut** : à trancher — fonction manquante : le règlement d'une facture d'artisan n'est lié ni à la facture ni à l'incident · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : propriétaire n°2 (chaine/2) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Facture artisan validée par le propriétaire (propriétaire direct)
- **Étapes** : 1) valider la facture ; 2) lire « Le paiement reste à effectuer et à enregistrer dans la comptabilité » ; 3) ouvrir Comptabilité > Ajouter une écriture ; 4) saisir une dépense de 239,68 €
- **Attendu** : Un geste « Marquer comme réglée » (déclaratif, sans paiement réel) qui crée l'écriture liée à la facture et à l'incident, et met à jour l'état visible par le propriétaire, l'artisan et le super-administrateur
- **Observé** : Le formulaire d'écriture n'a ni champ facture ni champ incident ; l'écriture (id cc2e2c0f…) est libre (catégorie, lot, libellé), la facture reste validee sans date de règlement ; le seul « payé » du produit est le registre privé de l'artisan (déclaratif, non confirmé par le client) : les deux états peuvent diverger sans que personne ne le voie
- **Preuve expurgée (banc)** : sql/ecriture-reglement.txt, captures/o6-01-saisie-ecriture.png
- **Cause probable** : app/src/app/agence/[orgId]/comptabilite (saisie libre) ; intervention_factures n'a pas de colonne de règlement (id, numero, montant, validee_le, decision_motif, imputation_validee)
- **Correction proposée** : Ajouter à la validation (ou après) « Enregistrer le règlement » : date, moyen, référence, qui crée l'écriture de dépense avec lien intervention_factures.id et trace d'audit ; afficher « réglée le … » côté propriétaire et artisan
- **Correction sans aval** : non (aval du dirigeant requis)

#### `CHF-03` — Le « Décompte annuel des charges » et le « Courrier de régularisation » sont impossibles à générer pour une régularisation créée depuis l'interface : ils exigent un champ « note » que le formulaire n…

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Régularisation émise par le formulaire « Régulariser » (justificatif déposé).
- **Étapes** : 1. Documents > Préparer un document > Décompte annuel des charges (puis Courrier de régularisation). 2. Choisir la régularisation. 3. Générer le PDF.
- **Attendu** : PDF de décompte généré, ou champ permettant de saisir le détail des dépenses.
- **Observé** : « Encore 1 information à compléter : détail des dépenses par nature et clé de répartition. Complétez le dossier, puis revenez générer le PDF. » Aucun écran ne permet de renseigner cette note, et la régularisation émise ne se modifie plus. Seul « Consultation des justificatifs » se génère. Le décompte remis au locataire doit donc être fait hors application.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/captures/doc-decompte-A2025.png ; preuves/charges-fiscalite/captures/doc-regularisation_charges.png ; preuves/charges-fiscalite/captures/doc-consultation_charges.png
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts:81 (exige r.note) ; formulaire « Régulariser » de app/src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx:729-754 (aucun champ note) alors que app/src/app/actions/loyers.ts lit formData.get("note")
- **Correction proposée** : Ajouter au formulaire de régularisation un champ « détail des dépenses par nature et clé de répartition » (transmis à p_note), ou permettre de le saisir au moment de générer le document.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `CHF-06` — Une régularisation de charges n'écrit rien au livre ni aux appels : le complément dû ou le trop-perçu à rendre n'apparaît dans aucun écran de suivi financier.

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : charges-fiscalite (propriétaire direct) (charges-fiscalite) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Régularisations émises : A 2025 (+10,36 trop-perçu), B 2025 (-50,40 complément).
- **Étapes** : 1. Émettre les régularisations. 2. Compter les écritures et appels créés. 3. Relire le livre et la page Loyers.
- **Attendu** : Le solde figure au livre ou à un appel complémentaire (le wiki prévoit « appel complémentaire ou avoir »).
- **Observé** : 0 écriture, 0 appel créé ; le montant ne vit que dans la table des régularisations et sur la fiche du bail. Limite déjà écrite dans le wiki (29/09) mais non suivie au registre.
- **Preuve expurgée (banc)** : preuves/charges-fiscalite/captures/regul-A2025.png (message) ; preuves/charges-fiscalite/sql/regularisations-sans-trace.txt (0 écriture de régularisation, 0 appel créé après les régularisations)
- **Cause probable** : app/src/app/actions/loyers.ts:222-230 (commentaire : « la régularisation n'écrit PAS au journal »)
- **Correction proposée** : Décision produit : générer l'appel complémentaire ou l'avoir à l'émission, ou alerter le propriétaire. Effet financier : validation spécialisée recommandée.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `AUT-01` — maintenance_artisans() n'est appelée par aucune tâche : les devis déposés ne deviennent jamais « expirés » et les motifs de liste noire ne sont jamais purgés

- **Sévérité** : P2 · **Statut** : à trancher — correction préparable (tâche pg_cron + version interne), aval requis : active un automatisme en production · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : auditeur (coordinateur) · **Version testée** : e9f31ac puis candidate
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Attendu** : RM-9.2.3 : un devis dont la validité est dépassée devient caduc ; matrice A2 : les motifs de liste noire sont purgés à 3 ans (local) et 5 ans (global)
- **Observé** : La fonction (migration 20260911180000, ligne 2540) exige is_super_admin() et est annoncée « appelée par une planification, pas par un écran ». Aucune tâche pg_cron, aucune route de cron Vercel et aucun écran ne l'appelle (recherche dans app/src, vercel.json et les migrations). Un super-administrateur peut la lancer à la main seulement par une requête directe.
- **Preuve expurgée (banc)** : grep maintenance_artisans app/src app/vercel.json app/supabase/migrations : seule la définition et la liste de contrôle des droits ; confirme DEC-11 (hypothèse du rédacteur de décisions, vérifiée par lecture du code, non rejouée sur le banc faute de planificateur)
- **Cause probable** : La planification annoncée par le commentaire n'a jamais été créée ; la fonction n'est pas appelable sans JWT de super-administrateur, donc pas par pg_cron.
- **Correction proposée** : Tâche pg_cron quotidienne appelant une version interne sans garde (même schéma que la préparation du soir du marketing, MKT-01), fermée à tous les rôles ; soumise à l'aval car elle active un automatisme sur la production.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-01` — Les règles 'Ce qui peut continuer seul' (dont incident urgent et correction à faible risque en 'agir_seul') sont affichées au dirigeant mais aucun code ne les applique

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Code au commit 83ba492
- **Étapes** : 1. Lire app/src/app/admin/relais/page.tsx:20 et :31 ; 2. Rechercher continuity_rules / agir_seul / delegue_requis dans app/src et app/supabase/migrations
- **Attendu** : Une règle affichée comme 'agir seul' doit avoir un exécutant, ou l'écran doit dire qu'elle n'est pas appliquée
- **Observé** : Constat statique : la table est lue pour l'affichage seulement ; aucun code ne lit decision, delai_heures ou active. Pour l'incident urgent, seul un e-mail à l'agent part (notifications.ts:930-963). Aucune publication de correction n'existe (l'atelier ne fait qu'une PR en brouillon). Le dirigeant peut croire qu'un incident urgent est 'sécurisé' seul pendant son absence.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-01) ; preuves/equipes-ia/propositions.md § 3.7
- **Cause probable** : app/supabase/migrations/20260922120000_autonomie_v3.sql:481-500 (données sans consommateur) ; app/src/app/admin/relais/page.tsx:20,31 (affichage)
- **Correction proposée** : Soit brancher chaque règle avec un périmètre précis et un test, soit retirer ou reformuler l'écran ('décision enregistrée, non appliquée automatiquement'). Décision D7.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-02` — Mode vacances : l'urgence et l'escalade restent internes à la console, sans alerte vers un responsable absent, et ne s'alimentent ni d'un incident urgent ni d'un impayé

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Plan de vacances actif avec un responsable désigné
- **Étapes** : 1. Lire 20261012221100_vacances_arret.sql:62-74, 100-107, 115 ; 2. Rechercher les appelants de signaler_urgence_vacances et de supervision_alertes_internes dans app/src ; 3. Lire notifications.ts:930-963
- **Attendu** : L'ordre de mission (section 13) demande un canal d'alerte défini et une escalade validée ; un responsable absent doit être joint
- **Observé** : Constat statique : la seule alimentation automatique est un passage 'à reprendre'/'interrompu' ou une lecture de consigne bloquée ; le journal écrit canal 'interne' ; l'alerte ne se lit que dans /admin/relais et /admin/brief. Un incident urgent envoie un e-mail à l'agent de l'organisation, pas au responsable du relais. Confirmé sur le banc par un autre rôle (D-URGENCE-ESCALADE : aucun envoi externe, aucune nouvelle tâche).
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-02) ; preuves/equipes-ia/propositions.md § 3.6 ; registre d'exécution scénarios D-URGENCE-ESCALADE
- **Cause probable** : app/supabase/migrations/20261012221100_vacances_arret.sql:100-107,115 ; choix explicite 'Aucun fournisseur' en ligne 1 du fichier
- **Correction proposée** : Choisir canal, horaire et fuseau avec le dirigeant (D3) ; alimenter l'alerte par les événements urgents (incident urgent, passage critique) ; notifier le responsable par e-mail via le service existant ; tester T7 (responsable non habilité)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-03` — Aucune alerte active sur l'échec ou l'absence d'une tâche : la santé ne se lit que si le dirigeant ouvre l'écran ; la seule alerte e-mail du produit est le veto marketing

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Une tâche planifiée échoue ou ne passe pas
- **Étapes** : 1. Rechercher les appelants de email_superviseur_permanent ; 2. Lire sante-service.ts:411-447 et /api/sante ; 3. Vérifier qu'aucun moniteur externe n'est configuré dans le dépôt
- **Attendu** : Mission section 12 : surveillance et erreur remontée au responsable ; une tâche qui ne consigne pas à l'heure est le signal attendu (tache.ts:5-9)
- **Observé** : Constat statique : email_superviseur_permanent n'a qu'un appelant (alerte-veto-marketing.ts:55). L'écran Santé et /api/sante donnent l'état à qui les ouvre ; absence de passage > 26 h = 'retard' affiché, jamais envoyé. Moniteur externe : aucun dans le dépôt (hypothèse : peut exister hors dépôt).
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-03) ; preuves/equipes-ia/propositions.md § 4.1
- **Cause probable** : Conception : sante-service.ts calcule l'état à la lecture ; aucune tâche sentinelle
- **Correction proposée** : Tâche sentinelle (pg_cron ou Vercel) qui lit les battements tache_* et cycle_mensuel et envoie un e-mail au superviseur sur retard ou échec, avec limitation de fréquence (phase 0 du socle, D1/D3)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `IA-04` — Hypothèse à vérifier : quittances, avis d'échéance, relances et rappels s'envoient puis se marquent, sans clé d'idempotence côté fournisseur d'e-mail

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Le marquage échoue après l'envoi, ou le passage est interrompu entre l'envoi et le marquage
- **Étapes** : 1. Lire appels/route.ts:135-167, quittances/route.ts:142-171, relances/route.ts:134-198, rappels/route.ts:128-156 ; 2. Comparer avec avis-abonnement.ts:166,185,231, rapports-mensuels.ts:104, notifications.ts:988 et alerte-veto-marketing.ts:65, qui passent une clé
- **Attendu** : Mission section 12 : tâches idempotentes ; un même événement ne doit pas produire deux envois
- **Observé** : Constat statique : les quatre routes n'appellent pas envoyerEmail avec cleIdempotence. L'effet (double e-mail au prochain passage) n'a pas été rejoué ; les commentaires des routes reconnaissent ce compromis ('le pire cas est un double envoi'). Relation avec AUD-C-07 (hypothèse).
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-04) ; preuves/equipes-ia/propositions.md § 4.1
- **Cause probable** : app/src/app/api/cron/{appels,quittances,relances,rappels}/route.ts (envoi avant marquage, sans clé)
- **Correction proposée** : Passer une clé stable par objet (par exemple quittance/<id>) comme le font déjà les avis d'abonnement ; ajouter un test de rejeu avec marquage en échec
- **Correction sans aval** : non (aval du dirigeant requis)
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `IA-05` — Hypothèse à vérifier : envoyerEmail n'a aucun délai maximal, un blocage du fournisseur retient toute la passe

- **Sévérité** : P2 · **Statut** : à trancher — décision D47 de la page de décisions groupées · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : equipes-ia (equipes-ia) · **Version testée** : tête 83ba492 (lecture)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Le service d'e-mail ne répond pas
- **Étapes** : 1. Lire app/src/lib/email.ts:46-61 ; 2. Comparer avec les autres appels sortants (OpenAI, Facebook, devis assisté) qui ont un AbortSignal ; 3. Lire execution-mission.ts:13-19
- **Attendu** : Tout appel sortant d'une tâche a un délai et une reprise bornés (mission section 12)
- **Observé** : Constat statique : fetch vers Resend sans signal. La passe est limitée seulement par maxDuration (180 s) ; l'échec devient 'interrompu' avec effets partiels (execution-mission.ts:18), puis l'envoi-puis-marquage de IA-04 peut produire des doublons. Non rejoué.
- **Preuve expurgée (banc)** : preuves/equipes-ia/preuves-recherches.txt (section IA-05)
- **Cause probable** : app/src/lib/email.ts:46-61 (absence d'AbortSignal)
- **Correction proposée** : Ajouter AbortSignal.timeout (par exemple 15 s) et classer l'échec comme erreur ordinaire du fournisseur
- **Correction sans aval** : oui
- **Reproduction** : hypothèse à vérifier, non reproduite

#### `PROP-03` — Un fichier de plus de 10 Mo provoque une erreur HTTP 500 et un message sans rapport avec la cause

- **Sévérité** : P2 · **Statut** : à trancher — voir D12 : la limite réelle est celle des fonctions Vercel (4,5 Mo), à mesurer avant de choisir le seuil du contrôle · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : lot avec DPE déjà déposé, bouton « Remplacer »
- **Étapes** : déposer un PDF valide de 10,2 Mio (10 695 473 octets), puis 12 Mio, puis 26 Mio
- **Attendu** : message « Fichier trop volumineux (10 Mo max) » (le formulaire annonce « 10 Mo maximum »)
- **Observé** : POST renvoie HTTP 500 ; message affiché : « La confirmation n’a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer. » ; aucun diagnostic créé. Un fichier de 9,95 Mio (10 433 329 octets) est accepté.
- **Preuve expurgée (banc)** : captures/s4-07-fichier-12Mo-erreur-vague.png ; sql: diagnostics inchangé (1 ligne active)
- **Cause probable** : le message de taille (src/app/actions/parc.ts → deposerFichierGed, TAILLE_MAX_OCTETS=10 Mio dans src/lib/file-type.ts:57) n'est jamais atteint : la requête échoue avant l'action, très probablement à la mise en mémoire tampon du corps par le proxy Next (limite par défaut de 10 Mo, indépendante de serverActions.bodySizeLimit 55mb, next.config.ts:157) — hypothèse à vérifier
- **Correction proposée** : contrôler la taille côté client avant l'envoi (File.size) avec message explicite ; régler proxyClientMaxBodySize ; traduire le 500 en « fichier trop lourd »
- **Correction sans aval** : oui

#### `PROP-14` — Entrée en cours de mois : le premier terme (prorata) est exigible le 1er du mois, avant l'entrée, et passe tout de suite en « Impayé »

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : bail nu actif, date d'entrée 16/10/2026, jour d'échéance 1, paiement à échoir, activation le 13/10/2026
- **Étapes** : Générer l'échéancier ; lire la carte Loyers & paiements
- **Attendu** : première échéance au plus tôt à la date d'entrée (16/10/2026) : pas d'impayé avant le début du bail ni de relance possible
- **Observé** : appels_loyer : période 2026-10-01, loyer 438.71, charges 46.45, total 485.16 (prorata correct), date_echeance = 2026-10-01 (15 jours avant l'entrée) ; l'écran affiche « Impayé » et « impayé en cours » avant tout paiement ; le bloc Relances est actif
- **Preuve expurgée (banc)** : captures/s8-03-echeancier.png ; sql: select periode,date_echeance from appels_loyer
- **Cause probable** : supabase/migrations/20260927102000_appels_terme_echu.sql (generer_appels_loyer_interne) : date_echeance = début de mois + jour_echeance − 1, sans max(date_debut)
- **Correction proposée** : date_echeance = greatest(date_echeance calculée, date_debut) pour le premier terme
- **Correction sans aval** : non (aval du dirigeant requis)

#### `FIN-07` — Le filtre par mot-clé « fonds travaux / alur » écarte la pièce avant de consulter la qualification justifiée du propriétaire : une dépense qualifiée « déductible 224 » reste exclue des charges et la…

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Le propriétaire saisit « Appel de fonds travaux ravalement 2026 » (800 €, travaux votés payés dans l'année), la qualifie « Dépense déductible vérifiée », rubrique 224, justification « facture approuvée en assemblée ». La base accepte et versionne la qualification (audit_log inclus) ; le récapitulatif compte 224 = 0 et 800 € dans « Fonds travaux ALUR — à part » (« ne sont pas comptés dans les charges »). Aucun message n'explique que son choix est ignoré, et le libellé du journal étant immuable, seul un contournement par contre-écriture et ressaisie sous un autre libellé est possible. Contredit le principe posé en tête du fichier : « seuls les faits figés et choix justifiés chiffrent les totaux confirmés ». La règle existait avant la PR (mots-clés ALUR) mais la PR ajoute le formulaire de qualification qui devrait la primer.
- **Preuve expurgée (banc)** : preuves/relecture/finance/ts/t6.mts (224 = 0 et fondsTravauxAlur = 800 pour « Appel de fonds travaux… » et « Cotisation fonds de travaux » malgré la qualification ; « travaux plomberie » donne 224 = 800)
- **Cause probable** : app/src/lib/fiscal.ts:60 (test estFondsTravauxAlur avant la lecture de la qualification), 22 (regex)
- **Correction proposée** : Ne mettre à part que les pièces sans qualification (ou ajouter une nature « fonds_travaux_alur » qualifiable) et laisser une qualification « deductible » l'emporter ; resserrer l'expression (« fonds (de )?travaux.*alur » ou « fonds alur ») pour ne plus attraper « appel de fonds travaux ».
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : dépenses au libellé « fonds travaux / alur » et leur qualification éventuelle. select e.organization_id, e.id, e.date_piece, e.categorie, e.montant, q.nature, q.rubrique, q.version from public.ecritures e left join lateral (select * from public.fiscal_qualifications_ecritures x where x.ecriture_id=e.id order by version desc limit 1) q on true where e.sens='depense' and e.contre_ecriture_de is null and lower(e.categorie) ~ 'fonds (de )?travaux\|fonds alur\|alur' order by e.organization_id, e.date_piece;`

#### `FIN-11` — Les migrations ne rétro-capturent aucun loyer existant et la reprise « retrouver_ventilation_fiscale » refuse tout bail qui a plus d'un appel : sur les données réelles déjà en production, le récapitu…

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/finance) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Bail régulier, trois appels de 840 € (780 + 60) et trois paiements de 840 € antérieurs à la migration : la fonction répond trois fois « Plusieurs échéances ou aucune échéance : la ventilation doit être justifiée », 0 capture. Avec exigerPerimetre, le récapitulatif ne compte rien tant que l'exercice du lot n'est pas confirmé, puis refuse chaque loyer ancien (« attendent leur ventilation historique ») tant qu'il n'a pas reçu une qualification justifiée (nature, lot, parts HC et charges, justification, case de confirmation) : une pièce par mois et par lot. Le comportement précédent (ventilation au prorata du bail) affichait des totaux. Le choix de « ne rien réécrire » est assumé dans les commentaires, mais l'effet sur les propriétaires réels n'est ni mesuré ni annoncé dans l'interface. Contournement : qualification manuelle pièce par pièce.
- **Preuve expurgée (banc)** : preuves/relecture/finance/sql/t14_historique_reel.sql (sortie : sql/t14_sortie.txt : trois refus, 0 capture ; état d'avant-migration simulé par session_replication_role=replica dans une transaction annulée) ; ts/t2.mts pour le contraste avec l'ancien calcul
- **Cause probable** : app/supabase/migrations/20261012224000_fiscalite_historique_qualifiee.sql et app/src/lib/fiscal.ts:migration 56-97 (capture seulement à l'INSERT), 155-183 (reprise limitée à un seul appel) ; fiscal.ts 54-60 et 76-84
- **Correction proposée** : Offrir une reprise explicite par lot (action unique, auditée, non silencieuse) pour les baux dont les appels sont cohérents (montant_du = loyer_hc + charges), dont chaque paiement s'impute sans avance sur les appels existants, et qui n'ont ni annulation ni anomalie ; la même règle FIFO que le déclencheur peut être rejouée en SQL sur les paiements existants dans l'ordre (created_at, id). Annoncer dans l'interface le nombre de pièces à qualifier.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : combien de loyers existants sont sans capture, par organisation (c'est le nombre de pièces à qualifier à la main). select e.organization_id, count(*) filter (where c.ecriture_id is null) as loyers_sans_capture, count(*) as loyers_total, min(e.date_piece) premiere, max(e.date_piece) derniere from public.ecritures e left join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id where e.categorie='loyer' and e.sens='recette' and e.contre_ecriture_de is null group by 1 order by 2 desc;`

#### `PR178-A-03` — Après une réponse perdue à la création d'une fiche personne, le bouton d'envoi reste désactivé pour toujours : la saisie et les pièces « restent disponibles » mais ne peuvent plus être envoyées ; seu…

- **Sévérité** : P2 · **Statut** : à trancher — décision D31 de la page de décisions groupées · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecteur-pr178-navigateur (relecture/pr178/a) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Compte proprietaire@gerimmo-demo.fr, version candidate. Réseau simulé : la requête POST de l'action serveur de création est transmise au serveur mais sa réponse est coupée (route.fetch puis abort connectionreset).
- **Étapes** : 1. /agence/<org>/personnes puis « Créer une fiche », rôle Locataire, remplir identité et coordonnées, ajouter une « Pièce d'identité » avec un fichier, aller au récapitulatif. 2. Cliquer « Créer la fiche » (réponse coupée). 3. Constater l'état. 4. Recharger la page, choisir « Reprendre ma saisie ».
- **Attendu** : Le garde-fou anti-doublon est réaffirmé (la fiche n'est pas recréée), mais l'utilisateur doit pouvoir poursuivre : par exemple vérifier la fiche puis rattacher les pièces préparées à la fiche existante, ou relancer la création après confirmation explicite.
- **Observé** : Une seule ligne persons est créée en base (aucun rejeu : bon point). L'écran affiche « Un enregistrement a été interrompu… Votre saisie et vos documents restent disponibles ici » mais le bouton « Créer la fiche » est désactivé (disabled=true) ; après rechargement et « Reprendre ma saisie », même état : la copie locale contient bilan.creationIncertaine=true et rien ne permet de lever ce drapeau. La seule issue est « Effacer cette copie » (écran de reprise), donc ressaisie complète et nouveau choix des fichiers, ou ajout des pièces à la main depuis la fiche. Le même drapeau est posé AVANT l'appel serveur (creation-fiche-personne.ts:54) : si l'utilisateur ferme l'onglet pendant l'envoi alors que le serveur n'a rien reçu, il retrouve le même blocage pour une fiche qui n'existe pas. Variante S2 (réponse perdue au dépôt d'une pièce, fiche créée) : la pièce est marquée incertaine, le bouton «…
- **Preuve expurgée (banc)** : preuves/relecture/pr178/a/a03-s1-sortie.txt, a03-s2-sortie.txt, captures/A-03-S1-apres-reponse-perdue.png, captures/A-03-S2-apres-reponse-perdue.png, t5.mjs ; SQL : 1 ligne persons pour test-pr178-s1-23092@example.test
- **Cause probable** : src/lib/creation-fiche-personne.ts:44 (retour immédiat si precedent.creationIncertaine), :54 (drapeau posé avant l'appel), :61 (pièces incertaines jamais renvoyées) ; src/app/agence/[orgId]/personnes/formulaire-personne.tsx:199 (BoutonEnvoi disabled={etat.creationIncertaine}) ; aucun bouton « J'ai vérifié, la fiche n'existe pas, réessayer » ni « Rattacher à la fiche existante ».
- **Correction proposée** : Ajouter dans le bandeau d'incertitude deux actions explicites : « La fiche existe : continuer avec elle » (rechercher la personne par e-mail côté serveur puis envoyer les pièces) et « La fiche n'existe pas : réessayer » ; ou donner à creerPersonne une clé d'idempotence stockée avec la copie (comme la commande d'incident) pour rejouer sans risque de doublon.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PR178-B-04` — Les formulaires passés par useActionStateProtegee ne s'envoient plus avant l'hydratation : l'amélioration progressive des actions serveur est perdue sur une soixantaine de formulaires

- **Sévérité** : P2 · **Statut** : à trancher — clic avant hydratation sans effet visible : désactiver le bouton jusqu'à l'hydratation, formulaire par formulaire · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecteur adverse PR178 (côté serveur et régressions) (relecture/pr178/b) · **Version testée** : f283439 (main après PR #178, lecture) et candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Navigateur dont les scripts JavaScript de l'application ne sont pas encore chargés (réseau lent, téléphone modeste), simulé ici en bloquant **/_next/static/**/*.js.
- **Étapes** : 1. Ouvrir /artisan/inscription, remplir le formulaire de compte. 2. Cliquer « Créer mon compte » avant l'hydratation. 3. Comparer avec /inscription, formulaire non modifié par la PR.
- **Attendu** : L'envoi aboutit comme sur /inscription (POST natif de l'action serveur).
- **Observé** : Formulaire protégé : rien ne se passe (action HTML = javascript:throw new Error('React form unexpectedly submitted.'), aucun message). Témoin : le serveur répond et affiche son message. Contournement : attendre la fin du chargement et recliquer.
- **Preuve expurgée (banc)** : preuves/relecture/pr178/b/scripts/sansjs.mjs (sortie console des deux cas)
- **Cause probable** : src/lib/use-action-state-protegee.ts : l'action passée à useActionState devient une fonction cliente (async) enveloppant l'action serveur ; React ne peut plus sérialiser une référence d'action serveur dans le HTML rendu côté serveur. 70 formulaires concernés (grep use-action-state-protegee).
- **Correction proposée** : Documenter le compromis ; ou désactiver visuellement le bouton d'envoi tant que la page n'est pas hydratée (état « chargement ») pour que le clic précoce ne soit pas silencieux ; ou conserver l'action serveur en action du formulaire et poser la protection par écouteurs (formdata) plutôt que par enveloppe.
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SUP-01` — L'arret d'urgence (global ou par mission) ne couvre pas les 8 taches SQL planifiees par pg_cron : seules les routes Next/Vercel appellent verifier_arret_supervision.

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : La supervision enregistre un arret 'global' (ou 'purge', 'quittances', 'appels'). verifier_arret_supervision(...) renvoie false pour les 13 cles, les routes /api/cron/* s'arretent. Mais pg_cron continue : retention-quotidienne (appliquer_retention : DELETE sur tech_log, audit_log, demandes_devis, intentions_conge, demandes_signature, purge/anonymisation de documents), cycle-mensuel (generation des appels de loyer et quittances), alertes-*, propositions-publication-hebdo.
- **Preuve expurgée (banc)** : preuves/relecture/supervision/20-arret-pgcron.sortie.txt (arret global actif ; appliquer_retention() appelee en contexte cron supprime la ligne de test : avant=1, apres=0) + requete pg_proc : seules 4 fonctions referencent supervision_arrets/verifier_arret_supervision (commander_, executer_tache_consigne, traiter_vacances, verifier_).
- **Cause probable** : verifier_arret_supervision exige auth.role()='service_role' ou un superviseur ; pg_cron s'exécute sans JWT, donc les fonctions planifiées (appliquer_retention, cycle_mensuel_interne, generer_alertes_*, proposer_publications_interne) ne l'appellent pas.
- **Correction proposée** : Ajouter un prédicat interne (sans exigence de JWT) lu en tête de chaque fonction planifiée par pg_cron, ou documenter dans l'écran de relais que l'arrêt ne couvre pas les 8 tâches SQL. Décision métier requise.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select jobname, schedule, command from cron.job where active order by jobname; select cle, arrete, motif, modifie_le from public.supervision_arrets where arrete;`

#### `SUP-05` — Les « faits de direction » copient, pour toutes les organisations, des données personnelles (titres d'alertes contenant le nom du locataire, ex. « État des lieux d'entrée — Lot 1 · Marie Durand ») da…

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : relecture (relecture/supervision) · **Version testée** : e9f31ac (lecture du code)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Observé** : Un superviseur clique « Préparer le point maintenant » : preparer_faits_direction lit alerts.titre de toutes les organisations et stocke la copie dans sources->echeances->donnees->faits (jusqu'à 20 faits x 5 sources par clic, un instantané par clic, conservé indéfiniment). Delta audit_log = 0 et supervision_operations = 0 pour l'appel SQL ; côté TypeScript une seule ligne générique point_du_matin_prepare (sans organisation, écrite après coup et non transactionnelle). La lecture de l'écran /admin/brief (lire_faits_direction) n'est jamais tracée. Écart à la règle documentée « traversée par le Super Admin autorisée mais journalisée » (wiki/regles-metier/Isolation multi-organisation.md, RM-A1.11) et à la minimisation des données.
- **Preuve expurgée (banc)** : preuves/relecture/supervision/94-faits-donnees-personnelles-trace.sortie.txt (delta journaux 0/0, nom présent dans la copie durable, 0 fonction de rétention citant la table)
- **Cause probable** : 20261012222000 : collecter_source_direction('echeances') renvoie le titre brut ; aucune écriture log_sa_access ; aucune clause de rétention dans appliquer_retention().
- **Correction proposée** : Ne stocker que des identifiants et libellés génériques (type d'alerte + href) au lieu de alerts.titre ; journaliser via log_sa_access(org,'consultation_faits_direction') pour chaque organisation citée ou une ligne d'audit par préparation dans la même transaction ; ajouter une purge à 90 jours dans appliquer_retention().
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select count(*) nb, min(jour), max(jour), pg_size_pretty(pg_total_relation_size('public.brief_direction_snapshots')) taille from public.brief_direction_snapshots; -- puis, pour voir si des noms y figurent : select jour, jsonb_path_query_array(sources,'$.echeances.donnees.faits[*].titre') from public.brief_direction_snapshots order by genere_le desc limit 3;`

#### `SOR-03` — Un second bail est activé sur un lot avec une période qui recouvre celle du bail précédent

- **Sévérité** : P2 · **Statut** : à trancher · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : proprietaire+locataire (sortie de bail) (sortie-de-bail) · **Version testée** : candidate 375af42 (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Lot A : bail A 01/08/2026 -> 14/01/2027 (clôturé le 14/10/2026) ; brouillon B créé pendant le bail A avec date d entrée 01/09/2026
- **Étapes** : 1) clôturer A 2) bail B > étape 7 > Déposer le bail signé
- **Attendu** : Refus : la période de B recouvre celle de A (wiki Bail / Occupation d un bien ; mission : chevauchement refusé côté serveur)
- **Observé** : B passe actif (date_debut 01/09/2026) et le lot redevient loué. Seule la règle « un seul bail vivant à la fois » existe (états actif/préavis), sans comparaison des dates ; deux baux du même lot couvrent donc septembre 2026 à janvier 2027 et pourraient appeler deux loyers pour la même période
- **Preuve expurgée (banc)** : captures/p1-bail-B-chevauchement.png ; sortie p1.mjs (avant/après)
- **Cause probable** : RPC activer_bail / controler_mise_en_location : le contrôle ne teste que l état des autres baux du lot, pas date_debut/date_fin
- **Correction proposée** : Refuser l activation si date_debut < max(date_fin) des baux terminés ou en préavis du lot, ou contrainte d exclusion sur daterange(date_debut, date_fin)
- **Correction sans aval** : non (aval du dirigeant requis)

#### `SA-01` — Traversée de la supervision dans un espace client : écriture financière possible sans motif ni durée, et la ligne d'audit 'traversee_action' ne dit ni quelle action, ni sur quel objet, ni avec quel r…

- **Sévérité** : P2 · **Statut** : à trancher — limite déjà actée au wiki (audit du 25/09) : entrée dans un espace client sans motif ni durée ; l'écriture complète la prolonge · **Propriétaire** : dirigeant (décision)
- **Rôle / source** : super-administrateur (superadmin) · **Version testée** : candidate 5d15b4d (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : Super-administrateur aal2 ; organisation de test '[TEST-superadmin] Parc brief' avec un bail de test
- **Étapes** : 1) Depuis /admin/brief, suivre le lien d'un dossier (bail) : /agence/<org>/baux/<bail> s'ouvre en 'Espace propriétaire' avec tous les boutons de gérance. 2) Saisir 10 € dans 'Encaisser' puis valider. 3) Lire audit_log, encaissements et ecritures.
- **Attendu** : Action sensible attribuable : auteur, cible (bail/montant), date, résultat ; l'entrée dans un espace client motivée (motif) et bornée (durée) comme l'exige la mission ; l'écriture financière rattachée à son auteur
- **Observé** : L'encaissement de 10 € est écrit (encaissements : 3 lignes, 1 010 €) ; les tables encaissements et ecritures n'ont aucune colonne d'auteur ; le seul indice est une ligne audit_log action='traversee_action', details={} (account_id, organization_id, date). Cette même action est aussi émise à la simple ouverture de la page (ligne 19:06:55 avant tout envoi du formulaire), donc elle ne distingue pas lecture et écriture. Chaque navigation écrit en plus 1 à 15 lignes 'traversee_espace' vides (15 en une minute). Aucun motif demandé, aucune durée. C'est la limite déjà actée dans le wiki ('Entrer dans son espace reste sans motif ni durée', audit 25/09) ; l'écriture complète dans l'espace client la prolonge.
- **Preuve expurgée (banc)** : sql/brief_snapshot_faits.txt ; captures/05-dossier-depuis-brief.png ; captures/06-encaisser-formulaire.png ; sortie SQL : audit_log (traversee_action, details={}) et ecritures da8357d8… (sans auteur)
- **Cause probable** : src/lib/ged-acces.ts:56 (log_sa_access sans détails) ; src/lib/espace.ts:44 ; fonction SQL log_sa_access (insert avec details vide par défaut)
- **Correction proposée** : Passer en détails l'objet et le geste (route ou action, identifiant de l'objet, résultat) ; émettre traversee_action seulement sur les écritures ; demander un motif court et borner la traversée en écriture (30 min, comme pour l'artisan) ; ajouter l'auteur aux écritures financières
- **Correction sans aval** : non (aval du dirigeant requis)

#### `PROP-BANC-01` — Banc : serveur :3100 démarré sans SUPABASE_SERVICE_ROLE_KEY (inscription et liens bloqués)

- **Sévérité** : P2 · **Statut** : acceptée — défaut du banc d'essai, pas du produit ; banc-up.sh vérifie la clé de service · **Propriétaire** : clos par décision
- **Rôle / source** : proprietaire (proprietaire/s01) · **Version testée** : e9f31ac (banc)
- **Environnement** : banc local isolé (Postgres 16, émulateur Supabase, next start), aucun service externe
- **Préconditions** : serveur next start du 15:41
- **Étapes** : GET /api/sante ; ouvrir /inscription, remplir un formulaire valide, cliquer « Ouvrir mon espace »
- **Attendu** : compte créé et espace ouvert (comme en première passe)
- **Observé** : /api/sante = 503 {motif: 'SUPABASE_SERVICE_ROLE_KEY absente.'} ; inscription valide = « Inscription impossible : L’envoi des liens de connexion n’est pas configuré. Contactez l’administrateur. »
- **Preuve expurgée (banc)** : sql/api-sante.txt ; captures/s1-12-espace-ouvert-bureau.png (état dégradé)
- **Cause probable** : environnement du processus 3100 (hors produit) ; lib/supabase/service.ts:30-33 renvoie null sans la clé
- **Correction proposée** : relancer le serveur du banc avec la clé de service (hors périmètre de ce rôle)
- **Correction sans aval** : oui

## P3 — cosmétique ou mineur (166)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `AUD-C-03` | auditeur/c | L'ordre d'application des migrations n'est pas l'ordre des noms de fichiers *(hyp.)* | ouverte |
| `AUD-C-04` | auditeur/c | Trois versions de PostgreSQL dans les preuves de sauvegarde, sans garde de coherence (hypothese a verifier) *(hyp.)* | ouverte |
| `CAR-02` | cartographie | La matrice de droits du super-administrateur cite une ligne de code qui ne contient pas ce qu'elle désigne | ouverte |
| `CAR-04` | cartographie | Aucun journal de parcours navigateur ni d'audit des écrans pour la référence e9f31ac : la comparaison avec la candidate est impossible hors lint, types, build, vitest | ouverte |
| `CAR-07` | cartographie | Lacunes de couverture : 4 pages jamais ouvertes, 43 écrans ouverts ni exercés ni regardés, 43 actions serveur sans aucune trace | ouverte |
| `CAR-08` | cartographie | Matrice des droits du super-administrateur : l'autorisation positive en aal2 n'est pas rejouée sur les 99 fonctions (profil aal1 seulement) *(hyp.)* | ouverte |
| `CAR-09` | cartographie | Les relevés d'audit par écran sont écrasés à chaque largeur : seule la passe 1440 px est détaillée, les passes 390 et 768 px ne survivent que par leurs totaux | ouverte |
| `CAR-10` | cartographie | La matrice du super-administrateur décrit la politique d'écriture de `memberships` de façon incomplète | ouverte |
| `CHF-08` | charges-fiscalite | Hypothèse à vérifier : le lien « notice officielle 2044, millésime 2026 (revenus 2025) » affiché sous un récapitulatif des revenus 2026 pointe vers …/2044_5487.pdf, alors que la recherche renvoie le formulaire 2026 sous …/2044_5483.pdf. *(hyp.)* | ouverte |
| `DES-B-12` | designer/b | HORS V1 PUBLIQUE — espaces administrateur d'agence et agent : défauts transversaux déjà connus et petites cibles sur la recherche | ouverte |
| `FIN-12` | relecture/finance | Hypothèse à vérifier : les lectures de qualifications, de captures et d'écritures n'ont ni filtre d'année (captures, qualifications) ni garde contre la limite de 1 000 lignes de l'API, alors que d'autres écrans du dépôt la connaissent (« trop de lignes »). *(hyp.)* | ouverte |
| `FIN-13` | relecture/finance | Hypothèse à vérifier : l'encaissement en un clic prend la date par défaut de la base (current_date, fuseau UTC), pas la date de Paris ; entre 00 h 00 et 01 h 59 (heure de Paris) un règlement est daté de la veille, y compris le 31 décembre pour un 1er janvier. *(hyp.)* | ouverte |
| `PR178-A-09` | relecture/pr178/a | Sans API Navigation (hypothèse Safari/iOS et Firefox), le geste Retour abandonne silencieusement un formulaire modifié *(hyp.)* | ouverte |
| `PR178-B-07` | relecture/pr178/b | Les parcours navigateur ajoutés n'auraient détecté aucun des constats B-01 à B-06 : les tests du garde sont en partie synthétiques et aucun ne couvre les succès financiers, la session expirée ou les formulaires de recherche sans method | ouverte |
| `REP-03` | relecture/reprises | Clients externes (module desactive en production) : apres un refus de validation, le meme justificatif ne peut plus etre remplace par un autre fichier de meme type tant que le formulaire n'est pas recharge, et un devis re-genere ne peut pas etre redepose *(hyp.)* | ouverte |
| `SUP-06` | relecture/supervision | Ces trois lectures font db.from('accounts').select('id,email') sans filtre puis filtrent en JavaScript : au-delà de la limite de lignes de l'API (1 000 par défaut chez Supabase), la liste des responsables habilités et les noms des destinataires sont tronqués… *(hyp.)* | ouverte |
| `VUI-01` | verification/ui-finale | Résiduel de DES-A-01/DES-B-02 : deux champs multilignes restent masqués en partie (24 % et 51 %) par la barre du bas quand ils reçoivent le focus au clavier à 390 px | ouverte — 2 champs multilignes en partie masqués par la barre du bas à 390 px au focus clavier (curseur et début du cha… |
| `VUI-03` | verification/ui-finale | Agence (hors V1 publique) : l entrée « Administration » du rail tablette est coupée en « Administrati/on » à 641, 768 et 860 px | ouverte — correction CSS (césure) sans effet dans le Chromium du banc (pas de dictionnaire de césure) : « Administratio… |
| `V10-01` | verification/vague10-finale | Parcours de bail : les montants ne passent pas par lireMontant ; message generique pour '1 234,50' et '1e3' / '0x10' acceptes en silence | ouverte — le parcours de bail lit encore ses montants par Number() : « 1e3 » est enregistré 1000 et « 0x10 » 16 sans me… |
| `V10-03` | verification/vague10-finale | Rail tablette de l'agence : 'Administration' reste coupe en 'Administrati-on' (sans trait d'union) dans Chromium | ouverte |
| `ARC-01` | artisan | Échec du rendu PDF du devis externe : message technique brut (variable d environnement) montré à l artisan | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-erreurs.test.ts |
| `ARC-03` | artisan | Agenda : l état du chantier externe est affiché avec son code interne (« planifie ») | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-affichage.test.ts |
| `ARC-05` | artisan | Agenda artisan sur mobile 390 px : défilement horizontal (448 px) causé par la carte d une mission Gerimmo au nom de parc long | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `ARC-06` | artisan | Clients externes : messages d erreur génériques inadaptés (client en doublon : « cette facture » ; champ vide : « joignez votre justificatif ») | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-erreurs.test.ts |
| `ARC-09` | artisan | Formulaires privés artisan : session perdue présentée comme « connexion interrompue », sans lien de reconnexion | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-prive-session-expiree.test.ts |
| `ARC-10` | artisan | Clients externes : entre minuit et 2 h à Paris (heure d été), la date du jour est refusée et la date par défaut est celle de la veille (jour UTC) | corrigée en branche — vague 5-7 ; tests : tests/artisan-dates-paris.test.ts : 21 cas SQL, tests/artisan-devis-jour-pari… |
| `AUD-B-05` | auditeur/b | Dépôt de deux fichiers identiques : un seul conservé, sans le dire | corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts |
| `AUD-C-06` | auditeur/c | L'export CSV du journal ne neutralise pas les formules de tableur (hypothese a verifier) *(hyp.)* | corrigée en branche — même défaut que CHF-04 : src/lib/csv-sur.ts + export du journal, tests/csv-sur.test.ts |
| `CAR-01` | cartographie | La référence de tests candidate porte sur b9a7107, non sur la tête 9396669, et son parcours navigateur n'est pas vert | corrigée en branche — batterie complète rejouée sur le SHA figé 0ad658a (4 207 tests, 168 parcours, audits 768 et 1440… |
| `CAR-03` | cartographie | `.env.example` annonce « Neuf missions quotidiennes » alors que le code et vercel.json en comptent dix | corrigée en branche — app/.env.example : « Dix missions » |
| `CAR-11` | cartographie | Le serveur du banc hérite d'un jeton GitHub du shell de lancement alors que l'application ne l'utilise pas | corrigée en branche — scratchpad : serveur du banc lancé sans GITHUB_TOKEN (hygiène du banc, hors dépôt) |
| `LOC-01` | chaine/1 | Dépôt d'une attestation déjà déposée : message technique générique au lieu de « ce fichier est déjà dans votre dossier » | corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts |
| `LOC-02` | chaine/1 | Élision manquante : « Dernier document — quittance de octobre 2026 » | corrigée en branche — 9978efa — « d'octobre » (espace locataire) |
| `ART-11` | chaine/1b | Quantité et taux de TVA écrits avec un point décimal (« 2.5 », « 5.5 % ») sur le PDF du devis et dans le détail vu par le propriétaire, alors que les montants et le sélecteur sont en virgule | corrigée en branche — vague 5-7 ; tests : app/tests/devis-affichage-fr.test.ts |
| `ART-12` | chaine/1b | Quantité ou prix invalide (0, « abc », 12,345, -5) : le total reste à 0,00 € sans dire quel champ est en cause | corrigée en branche — vague 5-7 ; tests : app/tests/devis-affichage-fr.test.ts |
| `ART-14` | chaine/1b | Mobile 390 px : la fiche d'une demande de devis close et l'accueil artisan débordent horizontalement avec un nom de client long | corrigée en branche — 611dce2 — en-tête du devis : min-width et retour à la ligne |
| `LOC-22` | chaine/2 | Un locataire connecté qui ouvre /artisan arrive sur le formulaire d'inscription artisan | corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts |
| `PRO2-22` | chaine/2 | Un propriétaire direct lit « privé à votre agence » sur la notation de l'artisan, et l'artisan lit « l'agence le tranchera » sur l'écart de facture (recoupe PROP-09) | corrigée en branche — vague 5-7 ; tests : app/tests/vocabulaire-proprietaire-direct.test.ts |
| `CHF-04` | charges-fiscalite | L'export CSV du livre recettes-dépenses ne neutralise pas les cellules commençant par =, +, - ou @ : un libellé « =1+1 » est exporté tel quel et sera évalué par le tableur. | corrigée en branche — src/lib/csv-sur.ts + export du journal (commit 2235d73), tests/csv-sur.test.ts |
| `PUB-02` | coordinateur | Offre agence présentée au public alors que les agences sont hors périmètre V1 publique : accueil (repères, espaces, bandeau tarif, FAQ), tarifs, connexion, inscription artisan, choix d'espace, pied de page, métadonnées, deux sujets éditoriaux | corrigée en branche — commit e7982a7 |
| `PUB-04` | coordinateur | La mention de taxes de l'accueil et des tarifs citait encore les agences (« pour les particuliers comme pour les agences ») | corrigée en branche — 35b0ae8 — phrase de taxes sans agences, 4 tests |
| `DES-A-02` | designer/a | La page de confirmation de lien e-mail (/auth/confirmer) annonce encore « pour les agences », alors que /connexion a été nettoyée | corrigée en branche — vague 5-7 ; tests : tests/vocabulaire-v1-parcours.test.ts |
| `DES-A-03` | designer/a | Espace locataire : les titres de carte sont des <h3> directement sous le <h1> (aucun <h2>) sur toutes les pages | corrigée en branche — vague 5-7 ; tests : app/tests/titres-hierarchie-espaces.test.ts |
| `DES-A-04` | designer/a | Fiche d'un bien : la liste de définitions des chiffres clés est mal formée (dl > div > div > dt) | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-A-05` | designer/a | Tablette (641-860 px) : les libellés du rail du menu locataire sont à 9,5 px, sous la métrique commune de 11 px de la charte | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-A-12` | designer/a | Après une erreur de formulaire, le focus tombe sur <body> et les deux mots de passe sont vidés ; deux pages d'authentification partagent le même titre ; la 404 publique propose « Retour à mon espace » | corrigée en branche — vague 5-7 ; tests : tests/formulaires-auth-focus-titres.test.ts |
| `DES-A-14` | designer/a | Tablette (641-860 px) : le nom de l'espace du locataire est tronqué en « Par… » dans la cellule de logo du rail | corrigée en branche — vague 5-7 ; tests : app/tests/ui-clavier-et-rail.test.ts |
| `DES-A-15` | designer/a | Formulaire « Déclarer un incident » (propriétaire) : l'option d'urgence est coupée à 390 px (« …attendre quelques jour ») | corrigée en branche — vague 5-7 ; tests : tests/libelles-courts-et-bandeau-390.test.ts |
| `DES-B-04` | designer/b | Clients externes : « Archiver ce client » s'exécute au premier clic, sans confirmation, avec le style du bouton principal | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-04 |
| `DES-B-05` | designer/b | Modules clients externes et règlements déclarés : composants hors charte (liens soulignés en guise de boutons, pastilles redondantes, liens de liste de 19 px) | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-05, app/tests/titres-de-pag… |
| `DES-B-06` | designer/b | Artisan qui vient de s'inscrire : trois bandeaux au même sens et trois appels au dépôt d'une pièce sur la même page | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-06 |
| `DES-B-07` | designer/b | Titres de page (<title>) incohérents dans l'espace artisan et la supervision | corrigée en branche — vague 5-7 ; tests : app/tests/titres-de-page.test.ts : 2 × |
| `DES-B-08` | designer/b | Super-admin sur mobile : résumés repliables de 20 à 28 px de haut, barre d'enregistrement collante qui masque le champ focalisé, bouton flottant hors repère | corrigée en branche — vague 5-7 ; tests : app/tests/artisan-ergonomie-des-b.test.ts > DES-B-08 |
| `DES-B-09` | designer/b | Compte artisan : « toutes les agences » dans la page Sécurité du compte (vocabulaire d'agence dans la V1) | corrigée en branche — vague 5-7 ; tests : tests/vocabulaire-v1-parcours.test.ts |
| `DES-B-11` | designer/b | Super-admin, Relais : le bandeau « Habilitation perdue : tâches bloquées » est posé en ligne sur le texte qui le précède, et chevauche l'adresse du responsable à 390 px | corrigée en branche — vague 5-7 ; tests : tests/libelles-courts-et-bandeau-390.test.ts |
| `IA-08` | equipes-ia | Le commentaire de la tâche territoire dit 'mensuelle, le 1er' alors qu'elle est planifiée chaque jour | corrigée en branche — commentaire de app/src/app/api/cron/territoire/route.ts corrigé (vague 6) |
| `IA-10` | equipes-ia | La page wiki 'Gerimmo en autonomie' est périmée : 4 tâches quotidiennes, 'vercel.json ne fixe aucune région', ronde quotidienne 'à armer' | corrigée en branche — wiki : page Gerimmo en autonomie marquée historique, renvoi vers l'inventaire à jour (commit de l… |
| `PRF-01` | perf-liens | Page de connexion : décalage de mise en page (CLS 0,212) sur mobile avec réseau lent | corrigée en branche — vague 5-7 ; tests : app/tests/connexion-squelette-cls.test.ts |
| `PRF-06` | perf-liens | Page « Compte » : le lien « le lien reçu par email » renvoie l'utilisateur connecté à son accueil sans explication | corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts |
| `PRF-09` | perf-liens | Lien factice href="#" « Retour à mes fiches » (annuaire des personnes) *(hyp.)* | corrigée en branche — vague 5-7 ; tests : app/tests/textes-parcours-locataire-compte.test.ts |
| `PROP-04` | proprietaire/s01 | Surface démesurée : message technique « numeric field overflow » affiché à l'utilisateur | corrigée en branche — d6ef891 — surface bornée à 9 999,99 m² avec message clair |
| `PROP-06` | proprietaire/s01 | La page /connexion présente encore l'offre agence alors que les agences sont hors V1 publique | corrigée en branche — commit e7982a7 (/connexion sans offre agence) |
| `PROP-09` | proprietaire/s01 | Libellés d'agence ou de permission dans l'espace propriétaire direct | corrigée en branche — vague 5-7 ; tests : app/tests/vocabulaire-proprietaire-direct.test.ts |
| `FIN-05` | relecture/finance | « Montant net à qualifier » additionne recettes et dépenses non qualifiées en valeurs positives : ce n'est pas un net. | corrigée en branche — vague 5-7 ; tests : app/tests/finance-textes-fiscal.test.ts |
| `FIN-06` | relecture/finance | « Retrouver la ventilation historique » annonce un succès sans rien changer quand la pièce a déjà une capture avec une part non ventilée (avance). | corrigée en branche — vague 5-7 ; tests : app/tests/finance-textes-fiscal.test.ts |
| `FIN-08` | relecture/finance | Toute dépense qualifiée « Hors revenus fonciers » est présentée au propriétaire comme de la taxe d'enlèvement des ordures ménagères, et toute recette « hors 2044 » comme des provisions de charges encaissées. | corrigée en branche — vague 5-7 ; tests : app/tests/finance-textes-fiscal.test.ts, app/tests/catalogue-documents.test.ts |
| `PR178-A-06` | relecture/pr178/a | Accessibilité des copies locales : la région role=status change de phrase à chaque frappe (25 changements pour 12 caractères) et le focus tombe sur le body après « Reprendre ma saisie » | corrigée en branche — vague 5-7 ; tests : app/tests/copie-locale-annonces.test.ts |
| `PR178-A-07` | relecture/pr178/a | Les copies de devis (une clé localStorage par demande) ne sont jamais purgées si l'artisan ne rouvre pas la même demande : l'expiration de 7 jours n'est contrôlée qu'à la lecture de la clé *(hyp.)* | corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes ; les copies d'un même compte expiren… |
| `PR178-A-08` | relecture/pr178/a | Quand le stockage local est refusé, l'écran « La fiche est créée » affiche encore l'alerte « Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement » et chaque sortie déclenche la boîte « Quitter le site ? » alors qu'il n'y a plus rien à perdre | corrigée en branche — 36219ec — l'effacement qui échoue après un envoi confirmé ne laisse plus ni alerte ni boîte de so… |
| `PR178-B-02` | relecture/pr178/b | Import du parc : la confirmation de sortie « modifications non enregistrées » se déclenche encore après un import réussi (l'état de retour n'a pas de clé succes) | corrigée en branche — 36219ec — l'import du parc n'est plus suivi |
| `SUP-08` | relecture/supervision | Quand le responsable désigné perd son habilitation, traiter_vacances passe TOUTES les alertes non accusées du plan en « non_acheminee », y compris celles déjà escaladées vers le créateur (qui, lui, est habilité) ; elles ne peuvent alors plus escalader (l'esca… | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — seules les alertes du responsable concerné son… |
| `RET-01` | retour-arriere | migrations.yml laisse passer un nom de fichier portant un chemin (« ../retours-arriere/… »), alors que la saisie annonce « Noms seuls (pas de chemin) » | corrigée en branche — .github/workflows/migrations.yml : garde de nom de fichier (commit 2235d73), testée en shell sur… |
| `RET-03` | retour-arriere | La page du wiki Plan de reprise d'activité cite une base de connaissance qui n'existe pas dans V4 (docs/plan-reprise-activite.md, table backup_registry) et décrit une sauvegarde Supabase alors que la copie réelle est un dump chiffré chez Scaleway | corrigée en branche — wiki : page Plan de reprise d'activité mise à jour (V4, retours arrière, état vérifié) |
| `SA-03` | superadmin | Une consigne ambiguë (sans aucune tâche) peut être « autorisée » : l'écran dit « Aucune tâche proposée. Précisez les lectures » mais propose quand même « Autoriser la version 1 », et la base enregistre l'accord | corrigée en branche — vague 5-7 ; tests : app/tests/consigne-sans-tache.test.ts |
| `SA-05` | superadmin | Les dates des retours utilisateurs s'affichent en UTC, sans mention de fuseau : 2 h de décalage (et parfois un jour) avec l'heure de Paris utilisée partout ailleurs dans la console | corrigée en branche — 9978efa — dates des retours à l'heure de Paris |
| `SA-06` | superadmin | Pluriels fautifs dans les écrans de relais et de consignes : 'après 1 minutes', 'Plafonds : 1 lectures au total, 1 par mois' | corrigée en branche — 9978efa — pluriels accordés |
| `SA-07` | superadmin | En diagnostic artisan, le bouton d'enregistrement de la fiche entreprise répond « Connectez-vous à votre espace artisan. » au lieu d'expliquer la lecture seule | corrigée en branche — vague 5-7 ; tests : app/tests/diagnostic-devis-raison.test.ts |
| `VFL-02` | verification/flux-finale | Déconnexion hors ligne : écran d'erreur générique au lieu d'un message « vous êtes hors ligne » | corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/deconnexion-hors-ligne.test.ts, e2e/menu-compte.spec.ts… |
| `VFL-04` | verification/flux-finale | « 1 234,50 » et « 1.234,50 » refusés avec le seul message « Montant invalide. » (format usuel français non expliqué) | corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/saisie-montant.test.ts : « 1 234,50 », « 1.234,50 », es… |
| `VFL-05` | verification/flux-finale | Reprise des soldes : « date de bascule » par défaut calculée en UTC (la veille entre 00 h et 02 h à Paris l'été) | corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/jour-paris-formulaires.test.ts : rendu serveur de Formu… |
| `VFL-06` | verification/flux-finale | Hypothèse à vérifier : attestation d'assurance locataire, date plancher et contrôle serveur calculés en jour UTC *(hyp.)* | corrigée en branche — vague 10 (commit 0ad658a) ; tests : tests/jour-paris-formulaires.test.ts : à 01:47 Paris, le cham… |
| `VER-PR178-02` | verification/pr178 | Session expirée puis autre compte dans le même navigateur : les copies du compte précédent (identité, brouillon de lot) restent sur l'appareil tant que le nouveau compte n'ouvre pas la fiche personne ou le formulaire d'incident | corrigée en branche — vague 5-7 ; tests : tests/copies-locales-arrivee.test.ts, tests/copies-locales.test.ts |
| `VER-PR178-03` | verification/pr178 | Stockage IndexedDB refusé : après une fiche créée et confirmée, l'alerte « Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement » reste affichée (résidu de PR178-A-08) | corrigée en branche — vague 5-7 |
| `VER-PR178-04` | verification/pr178 | Reprise d'une saisie après session expirée : l'ancien message « Votre session a expiré… » est réaffiché alors que la personne s'est reconnectée | corrigée en branche — vague 5-7 ; tests : tests/copies-locales-arrivee.test.ts |
| `VER-PR178-05` | verification/pr178 | La purge des copies locales part au clic sur « Se déconnecter », avant que la déconnexion ait réussi : hors ligne, la copie est effacée alors que la session reste ouverte | corrigée en branche — vague 5-7 ; tests : tests/copies-locales-arrivee.test.ts |
| `VER-PR178-07` | verification/pr178 | Si sessionStorage est refusé par le navigateur, toute l'application et la page de connexion affichent « Cette page n'a pas pu s'afficher » (code antérieur aux corrections, relevé en testant l'indisponibilité du stockage) | corrigée en branche — vague 5-7 ; tests : tests/stockage-session.test.ts |
| `VER-SQL-01` | verification/sql | 20261013120000 n'est pas rejouable sans effet : un rejeu hors transaction duplique la garde de definir_equipements_lot puis s'arrête sur AUD-A-02 | corrigée en branche — vague 5-7 ; tests : tests/correctifs-audit-13-octobre-rejeu.test.ts : 7 marques présentes, rejeu… |
| `VER-SQL-02` | verification/sql | supprimer_detention : deux suppressions simultanées de la même détention laissent deux lignes d'audit pour une seule suppression | corrigée en branche — vague 5-7 ; tests : tests/incidents-portefeuille-agent.test.ts : « VER-SQL-02 : une suppression q… |
| `VER-SQL-03` | verification/sql | REP-01 : un second envoi identique est sans effet en base mais l'action TypeScript renvoie un succès et prévient de nouveau l'artisan *(hyp.)* | corrigée en branche — vague 5-7 ; tests : tests/validation-creneaux.test.ts : le second envoi identique renvoie 0, test… |
| `VER-SQL-04` | verification/sql | SUP-08 : si le créateur du plan perd lui aussi son habilitation, l'alerte escaladée vers lui reste « escalade » alors qu'elle n'est acheminée à personne | corrigée en branche — vague 5-7 ; tests : tests/consignes-vacances.test.ts : « perte de droit du remplaçant puis du cré… |
| `VER-TS-01` | verification/ts | Une date de naissance de forme AAAA-MM-JJ impossible (2024-13-45) fait lever l'action serveur : erreur 500 et message sans rapport au lieu de « date de naissance non valide » | corrigée en branche — vague 5-7 ; tests : tests/validation-fiches.test.ts |
| `VER-TS-03` | verification/ts | L'élision « d’octobre » n'est appliquée que sur la page d'accueil locataire : e-mails, page Documents du locataire, PDF de décompte et libellés d'agenda disent encore « de octobre », « de avril », « de août » | corrigée en branche — vague 5-7 ; tests : tests/elision-courriers.test.ts, tests/elision.test.ts |
| `VER-TS-04` | verification/ts | Récapitulatif fiscal nu : « Périmètre : N écritures » compte des pièces écartées (période meublé ou hors de mes droits) sans le dire | corrigée en branche — vague 5-7 ; tests : tests/fiscal-perimetre.test.ts, tests/catalogue-documents.test.ts |
| `VUI-02` | verification/ui-finale | Rail tablette locataire (641-860 px) : la cellule du nom d espace affiche « PDP… » (initiales suivies du début du nom tronqué) au lieu des seules initiales ; la correction DES-A-14 ne tient pas sur la construction finale | corrigée en branche — globals.css : font-size:0 !important sur les initiales du rail ; tests/rail-initiales-et-cesure.t… |
| `ARC-04` | artisan | Numéro de facture externe : unicité sensible à la casse (« art-2026-0001 » accepté en doublon de « ART-2026-0001 »), aucune continuité contrôlée | à trancher |
| `AUD-A-05` | auditeur/a | Écart documentation/code : la piste d'audit générique documentée n'existe pas | à trancher |
| `AUD-A-06` | auditeur/a | Insertion anonyme directe dans demandes_devis sans limite de débit | à trancher |
| `AUD-B-03` | auditeur/b | Cookie de session lisible par script et marqué Secure seulement si NEXT_PUBLIC_SITE_URL commence par https:// *(hyp.)* | à trancher |
| `AUD-C-05` | auditeur/c | L'arret d'urgence ne couvre pas les e-mails declenches par le webhook Stripe (hypothese a verifier) *(hyp.)* | à trancher |
| `AUD-C-07` | auditeur/c | Les routes cron directes n'ont ni verrou de mission ni reservation avant envoi (doublon d'e-mail possible, hypothese a verifier) *(hyp.)* | à trancher |
| `AUD-C-08` | auditeur/c | Fichiers PDF orphelins possibles si le webhook Youtrust et la tache de nuit traitent le meme evenement en meme temps (hypothese a verifier) *(hyp.)* | à trancher |
| `CAR-05` | cartographie | Privilèges de table et politiques RLS ne se recouvrent pas : 17 tables ont des privilèges d'écriture sans politique, 12 tables ont des politiques sans privilège | à trancher |
| `CAR-06` | cartographie | Deux valeurs de `membership_role` (`proprietaire_mandant`, `garant`) n'ont ni fonction d'attribution repérée ni espace dédié *(hyp.)* | à trancher |
| `ART-15` | chaine/1b | La photo jointe par le locataire n'est visible de l'artisan ni au stade du devis ni sur la fiche de mission | à trancher |
| `PRO2-11` | chaine/1b | Élision manquante dans le nom de parc généré : « Parc de Éloïse … » (même famille que LOC-02) | à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livra… |
| `CHN-02` | chaine/2 | La validation de la facture, l'écriture de règlement et la clôture de l'incident ne laissent aucune ligne au journal d'audit : seule la chronologie de l'incident les garde | à trancher |
| `CHF-05` | charges-fiscalite | Le wiki « Fiscalité » ne s'appuie sur aucune source officielle (quatre sites commerciaux seulement) et affirme encore « non implémentée » pour des fonctions livrées ; le wiki « Régularisation des charges » fait de même. | à trancher — avertissement ajouté à la page Fiscalité ; les sources officielles n'ont pu être consultées (réseau bloqué… |
| `CHF-07` | charges-fiscalite | Hypothèse à vérifier : une contre-écriture est datée du jour de l'annulation, non de la pièce d'origine ; annuler en janvier un encaissement de décembre déplace le correctif sur l'exercice suivant. *(hyp.)* | à trancher |
| `CHF-09` | charges-fiscalite | Un encaissement saisi par erreur puis retiré (net 0,00 €) reste « à qualifier » et empêche de générer le PDF du lot tant qu'il n'est pas qualifié à la main. | à trancher |
| `EDI-01` | coordinateur | La ligne éditoriale de la veille accepte « agence » comme public valide (PUBLICS_JOURNAL) : un article visant seulement les agences passerait le filtre de pertinence en V1 | à trancher — ligne éditoriale |
| `PUB-03` | coordinateur | Les textes juridiques (conditions générales, mentions légales, confidentialité) décrivent encore l'offre et la tarification agence | à trancher — textes juridiques non modifiés |
| `DES-A-06` | designer/a | Hors ligne : la navigation interne bascule sur la page d'erreur du navigateur (en anglais) et n'en sort pas au retour du réseau | à trancher |
| `DES-A-07` | designer/a | Vocabulaire d'agence encore visible dans les parcours propriétaire et locataire de la V1 | à trancher — partiellement corrigée en branche ; reste à trancher : 4) veille réglementaire — Masquer l'audience « Agen… |
| `DES-A-08` | designer/a | Toutes les pages du propriétaire direct vivent sous l'adresse /agence/<id>/… (adresse visible, partagée, mise en favori) | à trancher |
| `DES-A-10` | designer/a | Le logo doré posé à nu sur fond clair est quasi illisible sur mobile (≈ 1,5:1), alors que la page d'inscription artisan le présente dans une tuile bleu nuit (≈ 13,6:1) | à trancher — décision D28 de la page de décisions groupées |
| `DES-A-11` | designer/a | L'adresse est « facultative » à l'inscription propriétaire mais bloque ensuite la création du premier bien | à trancher |
| `DES-B-10` | designer/b | Logo doré quasi illisible sur l'en-tête blanc : artisan à 768 px et super-admin à 390 et 768 px (même défaut que DES-A-10) | à trancher — décision D28 de la page de décisions groupées |
| `IA-06` | equipes-ia | L'arrêt d'urgence ne couvre pas le traitement immédiat du webhook Yousign ; la clé 'sauvegarde' n'a aucun lecteur (confirmation par lecture de SUP-07) | à trancher |
| `IA-07` | equipes-ia | Des éléments d'automatisation existent sans écrivain ni appelant : automation_events, log_automation_event, automation_stats_30d, autoriser_orchestration | à trancher |
| `IA-09` | equipes-ia | La tâche territoire peut préparer une campagne-idée 'essai avec des agences', alors que les agences sont hors du périmètre public V1 | à trancher |
| `IA-11` | equipes-ia | Aucun registre d'exécution n'a de règle de rétention (agent_passages, supervision_operations, points_du_matin, decisions_du_matin, brief_direction_snapshots) | à trancher |
| `IA-12` | equipes-ia | Hypothèse à vérifier : les textes et visuels produits avec l'IA et publiés sur le site et Facebook ne portent aucune mention d'origine *(hyp.)* | à trancher |
| `PRF-02` | perf-liens | Lien de nouveau mot de passe sans session : réponse 200 puis redirection côté client, avec décalage visible (CLS 0,346 à 390 px) | à trancher |
| `PRF-03` | perf-liens | Accès interdits ou objets inexistants : le document répond 200 (redirection ou 404 faites côté client), seul le visiteur anonyme reçoit un vrai 307 | à trancher |
| `PRF-04` | perf-liens | Défense en profondeur : la garde des pages /admin vit dans le layout ; la page s'exécute pour un non-super-administrateur et sa charge utile part avant la redirection (bornée par la RLS) | à trancher |
| `PRF-05` | perf-liens | Poids et mise en cache : logo de 292 Ko (2016×1594) et illustration de 298 Ko chargés sur chaque écran d'espace, servis avec max-age=0 ; ils portent le LCP des écrans d'agence | à trancher |
| `PRF-07` | perf-liens | Console de supervision : « Voir le formulaire sur le site » n'affiche pas le formulaire pour un super-administrateur connecté | à trancher |
| `PRF-08` | perf-liens | Page de confidentialité : « Aide et retours » mène un visiteur sans compte à la page de connexion ; contact éditeur « (à venir) » sur le banc | à trancher |
| `PRF-10` | perf-liens | Journal serveur : erreur « The destination stream closed early » (digest 2041379235) non attribuée ; 69 % des préchargements de liens sont annulés *(hyp.)* | à trancher |
| `PROP-05` | proprietaire/s01 | Nom d'espace sans élision : « Parc de Éloïse … » | à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livra… |
| `PROP-08` | proprietaire/s01 | Recherche globale (⌘K) insensible à la casse mais pas aux accents ; code postal non recherchable | à trancher — code postal recherchable (corrigé) ; accents : demandent l'extension unaccent en SQL ou l'opérateur imatch… |
| `PROP-10` | proprietaire/s01 | Message serveur de la clé de répartition avec point décimal : « fait 99.99 » | à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livra… |
| `PROP-11` | proprietaire/s01 | Un même PDF ne peut pas être déposé pour deux lots (DPE collectif) et la consigne n'est pas réalisable depuis le formulaire | à trancher |
| `PROP-16` | proprietaire/s01 | Hypothèse à vérifier : aucune cohérence contrôlée entre loyer, loyer de référence et loyer de référence majoré | à trancher |
| `FIN-02` | relecture/finance | Sur une organisation dont l'abonnement est suspendu, « Encaisser » répond « Accès refusé. » au lieu du message d'abonnement suspendu renvoyé par toutes les autres écritures. | à trancher — le message vient de la fonction SQL encaisser_reste_atomique (migration 20261012223000, lignes 60-65) : de… |
| `FIN-03` | relecture/finance | Aucune contrainte de centime sur encaissements.montant / ecritures.montant : un paiement à 3 décimales est capturé avec un écart de 0,005 et ne peut plus jamais être qualifié (les parts doivent réconcilier exactement un montant que deux décimales ne peuvent p… | à trancher |
| `FIN-04` | relecture/finance | La régularisation 230 reste exigée (et est réintégrée si saisie) pour les lots passés en meublé ou hors périmètre, alors que leurs pièces sont exclues de la 2044. | à trancher |
| `FIN-09` | relecture/finance | La capture fiscale calcule « déjà encaissé avant » en sommant tous les AUTRES encaissements du bail présents en fin d'ordre : un INSERT à plusieurs lignes pour un même bail répartit faux (hypothèse : aucun chemin actuel de l'application n'insère plusieurs pai… | à trancher |
| `FIN-10` | relecture/finance | Le wiki métier n'a pas été mis à jour : il décrit encore la ligne 229 comme « part non récupérable seulement, postes récupérables retirés lot par lot », alors que le code ne retire plus rien (coproRecuperableExclue vaut toujours 0) et traite la réintégration… *(hyp.)* | à trancher — page Fiscalité mise à jour (état implémenté, sources non officielles signalées) ; le traitement des lignes… |
| `PR178-B-03` | relecture/pr178/b | Encaissement de 0,01 € accepté par le nouveau contrôle au centime mais refusé par la base avec le message générique « Gerimmo n'a pas pu terminer cette action » | à trancher |
| `REP-02` | relecture/reprises | Le courriel d'urgence au gestionnaire n'est envoye qu'a la premiere execution : si la premiere tentative a cree l'incident puis s'est arretee avant l'e-mail, la reprise (rejoue:true) ne l'envoie jamais *(hyp.)* | à trancher |
| `REP-04` | relecture/reprises | choisir_creneau et accepter_creneau_locataire ne sont pas rejouables : une reponse perdue suivie d'un nouvel envoi affiche une erreur alors que le rendez-vous est confirme | à trancher |
| `REP-05` | relecture/reprises | Ecart au wiki : l'expiration J+30 et le refus trace sont livres, mais les relances J+3 / J+10 prevues par le module 16 n'existent nulle part | à trancher |
| `SUP-03` | relecture/supervision | N'importe quel super-administrateur permanent peut accuser réception d'une alerte de relais adressée à un autre responsable : la fonction ne compare pas auth.uid() au destinataire (message d'erreur annonce pourtant « Responsable habilité requis »), et l'écran… | à trancher |
| `SUP-04` | relecture/supervision | Pas de séparation des rôles pour une consigne : le même superviseur peut la rédiger, se désigner responsable et l'approuver (alors que enregistrer_vacances impose « un autre responsable »). L'« approbation » n'est donc pas une double vérification humaine. | à trancher |
| `SUP-07` | relecture/supervision | Le périmètre d'arrêt « Sauvegarde » est proposé au superviseur et accepté par la base, mais aucun code (workflow GitHub de sauvegarde, scripts app/scripts/sauvegarde/*) ne lit verifier_arret_supervision('sauvegarde') : l'arrêt n'arrête rien. *(hyp.)* | à trancher — décision D06 de la page de décisions groupées |
| `SUP-09` | relecture/supervision | Chaque validation d'un devis téléverse un nouveau PDF (chemin aléatoire) dans le compartiment devis-preparations et n'efface jamais l'ancien (ni celui d'une validation perdante en cas de conflit 409) : des PDF orphelins contenant les coordonnées de l'entrepri… *(hyp.)* | à trancher |
| `RET-02` | retour-arriere | La sauvegarde est faite avec --no-comments : les 152 commentaires SQL, dont celui qui porte la convention de sécurité de fermer_fonctions_a_anon(), disparaissent à la restauration | à trancher |
| `SOR-02` | sortie-de-bail | Remise des clés acceptée à une date future (01/03/2027) : le délai légal de restitution est calculé sur un événement qui n a pas eu lieu, et la restitution ne se corrige pas | à trancher |
| `SOR-04` | sortie-de-bail | Clôture du bail avant la fin du préavis : date_fin reste à la date théorique et rien n avertit des loyers non appelés | à trancher |
| `SOR-05` | sortie-de-bail | Espace du locataire sortant : « Rien à régler » alors que le décompte arrêté établit une créance de 561,43 EUR | à trancher |
| `SOR-06` | sortie-de-bail | Comparatif d EDL : un passage de « bon » à « usagé » (usure normale) compte comme écart et porte le délai de restitution à 2 mois | à trancher |
| `SA-02` | superadmin | Brief de direction : les montants des faits datés s'affichent avec un point décimal ('500.00 €') alors que les mesures s'affichent à la française ('4 870,00 €') | à trancher — texte produit par une fonction SQL : demande une migration supplémentaire (les deux migrations de la livra… |
| `SA-09` | superadmin | La recherche de la console ne trouve ni un bien, ni un lot, ni un incident : le brief du support demande de retrouver « un dossier (utilisateur, bien, incident) » | à trancher |
| `SA-10` | superadmin | Hypothèse à vérifier : aucun plafond de dépense applicatif pour les appels IA, et l'arrêt d'urgence ne couvre pas les appels IA déclenchés à la main (analyse du brief, rédaction de publications) *(hyp.)* | à trancher |
| `SA-11` | superadmin | Journal du blocage d'un compte : « Compte bloqué » est écrit avant l'effet ; si le blocage échoue, le journal garde « Compte bloqué » suivi d'une ligne d'échec sans cause | à trancher |
| `VFL-01` | verification/flux-finale | La région role=status de la copie locale affiche « conservés » alors que l'écriture n'a pas eu lieu (seul le texte visible dit « Conservation… ») | à trancher — décision de conception : exactitude de la région annoncée (role=status) contre bruit d'annonces ; texte vi… |
| `VER-PR178-06` | verification/pr178 | Hypothèse à vérifier : le brouillon local de la grille d'état des lieux (gerimmo-edl-brouillon-<id>) n'est ni effacé à la déconnexion ni rattaché à un compte ni limité dans le temps *(hyp.)* | à trancher |
| `VER-SECURITE-01` | verification/securite | La purge de déconnexion annoncée par la correction PR178-A-01 laisse les brouillons d'état des lieux (et la quittance de l'outil public) sur l'appareil, et le changement de compte ne les purge pas non plus | à trancher — partiellement corrigée en branche (quittance de l'outil public purgée à la déconnexion) ; reste à trancher… |
| `VER-SECURITE-02` | verification/securite | Un artisan ayant une mission (ou une sollicitation ouverte) dans une organisation peut écrire n'importe quel chemin sous le dossier de cette organisation dans le compartiment documents | à trancher |
| `VER-TS-05` | verification/ts | Récapitulatif fiscal nu : à partir de 1 000 lignes fiscales dans l'organisation, le document est refusé avec un message trompeur (« Réduisez la période »), même pour un lot de 3 loyers | à trancher |
| `VUI-05` | verification/ui-finale | Veille réglementaire : l audience « Agences et agents immobiliers » est toujours proposée aux propriétaires et aux locataires (DES-A-07 point 4 non corrigé) | à trancher — décision D33 (ligne éditoriale de la veille) |
| `VUI-06` | verification/ui-finale | Pages juridiques publiques (CGU, confidentialité, mentions légales) : les agences y sont encore présentées (tarif mensuel agences, marque blanche, « votre agence ») alors que le code agence n est plus présenté au public | à trancher — décision D32 (textes juridiques) |
| `V10-02` | verification/vague10-finale | Message de succes de la revision IRL : montant avec un point decimal ('671.18 EUR HC') | à trancher — message de succès de la révision IRL formaté avec un point (« 671.18 € HC ») : texte produit par la base,… |
| `VUI-04` | verification/ui-finale | Reprise des soldes (propriétaire direct) : le libellé « Détenteur du dépôt (agence = votre gestionnaire / proprietaire = vous) » garde le mot « agence » et une faute (« proprietaire » sans accent) : DES-A-07 point 3 corrigé à moitié | acceptée — « agence » et « proprietaire » sont les valeurs techniques de la colonne du fichier à fournir, sans accent ;… |
| `SOR-01` | sortie-de-bail | Clé de répartition par surface : « NaN % » et validation impossible (peut venir de l émulateur du banc) | réfutée — défaut de l'émulateur du banc (numeric rendu en chaînes, ligne 453 de serveur-supabase-local.mjs), pas du pro… |

Les fiches complètes des anomalies P3 sont dans [[Fiches des anomalies P3 — audit du 13 octobre 2026]].

---

Voir aussi : [[Audit d'acquisition du 3 octobre 2026]], [[Design system Gerimmo]].

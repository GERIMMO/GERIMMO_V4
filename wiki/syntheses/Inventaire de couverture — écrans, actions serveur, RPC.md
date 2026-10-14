---
type: synthesis
tags: [couverture, tests, ecrans, audit]
status: draft
created: 2026-10-14
updated: 2026-10-14
sources: []
---

# Inventaire de couverture — écrans, actions serveur, RPC

> [!info] Provenance et rejeu
> - Version du code : `9396669` (branche `claude/compassionate-euler-qpqjp6`), relevé le 2026-10-14 04:42:30 +0000.
> - Arbre de travail : propre sur app/src, app/supabase, app/e2e, app/tests au moment du relevé.
> - Scripts : `scripts/01_routes.py`, `scripts/02_actions.py`, `scripts/05_matrice.py`, `scripts/06_couverture.py`, `scripts/10_pages_couverture_tests.py` (rejeu complet : `bash scripts/rejouer.sh`).
> - Contrôle croisé (commande indépendante des scripts) : `python3 -c "import json;print(len(json.load(open('e2e/matrice-ecrans.json'))))"` = 157 (fichier `donnees/controles-croises.tsv`).


## 1. Définitions : ouvert n'est pas exercé

| Mot | Signification exacte dans cette page | Preuve cherchée |
|---|---|---|
| **Ouvert** | la passe automatique (`e2e/audit-ecrans.spec.ts`) a chargé l'écran avec la session du profil, obtenu HTTP 200, un `h1`, aucun soft-404 ; elle mesure débordement horizontal, erreurs console, boutons sans nom | `app/e2e/.audit/rapport-<profil>.json` |
| **Regardé** | l'URL (ou son gabarit) est citée dans les rubriques `executes` / `anomalies` du rapport d'un rôle navigateur (designer, propriétaire, artisan, super-admin, chaîne, auditeur…), hors « non testé » | `preuves/<rôle>/rapport.json` |
| **Exercé** | un parcours Playwright **spécifique** (hors `audit-ecrans`, `a11y`, `visuel`) cite l'URL, **ou** un test vitest **importe** le code de la page | `app/e2e/*.spec.ts`, `app/tests/*.test.ts` |

« Ouvert » prouve que l'écran se rend ; « exercé » prouve qu'un test interagit avec lui ou avec son code. Les deux ne se confondent pas. La recherche est **textuelle** (expressions régulières sur les URL et les imports) : elle sous-estime les parcours qui construisent leurs adresses par des fonctions d'aide, et elle ne vérifie pas qu'une assertion porte réellement sur l'écran cité.

Le relevé « ouvert » vient de la **dernière passe de l'audit des écrans** (largeur 1440 px) de la chaîne `candidat5.sh` : `rapport-<profil>.json` est écrasé à chaque largeur ; les passes à 390 px (suite e2e) et 768 px n'ont laissé que leurs totaux dans les journaux (CAR-09). Chaîne exécutée sur `b9a7107`, tête actuelle `9396669`.

## 2. Taux de couverture des écrans par profil

| Profil | Écrans | Ouverts (passe auto) | dont redirigés | Regardés (rapport de rôle) | Cités par un parcours Playwright | Importés par un test vitest | Exercés (Playwright ∪ vitest) | Ouverts mais ni exercés ni regardés |
|---|---|---|---|---|---|---|---|---|
| public | 18 | 18 (100.0 %) | 1 | 11 (61.1 %) | 15 | 2 | 15 (83.3 %) | 0 |
| proprietaire | 22 | 22 (100.0 %) | 0 | 2 (9.1 %) | 8 | 8 | 14 (63.6 %) | 7 |
| locataire | 12 | 12 (100.0 %) | 0 | 4 (33.3 %) | 5 | 3 | 7 (58.3 %) | 3 |
| artisan | 17 | 17 (100.0 %) | 2 | 10 (58.8 %) | 11 | 7 | 12 (70.6 %) | 5 |
| agent | 31 | 31 (100.0 %) | 4 | 6 (19.4 %) | 9 | 11 | 18 (58.1 %) | 11 |
| admin | 29 | 29 (100.0 %) | 2 | 2 (6.9 %) | 11 | 10 | 17 (58.6 %) | 11 |
| superadmin | 28 | 28 (100.0 %) | 0 | 16 (57.1 %) | 16 | 2 | 16 (57.1 %) | 6 |
| **TOTAL** | 157 | 157 (100.0 %) | 9 | 51 (32.5 %) | 75 | 43 | 99 (63.1 %) | 43 |

**Lecture.** 157/157 écrans sont ouverts (100.0 %), mais seulement 99/157 sont exercés (63.1 %) et 51/157 cités par un rapport de rôle (32.5 %, **borne basse** : les rapports désignent souvent un écran par son nom, pas par son URL). 9 écrans « ouverts » aboutissent en fait à une redirection (un profil qui demande l'écran d'un autre, ou une mission terminée) : ils comptent comme ouverts, pas comme rendus. Les rapports du designer listent en outre 105 écrans « vérifiés » par une passe automatique à trois largeurs (390/768/1280) — c'est de l'ouverture, pas un regard humain, et elle n'est pas comptée ici comme « regardé ». Les lignes `vitest (lit le source)` ne comptent pas comme « exercé » : un test qui lit le texte du fichier et y cherche une chaîne n'exécute pas la page.

**Attribution par profil.** Un parcours n'est compté pour un profil que si le fichier de test déclare ce profil (`storageState` / `.auth/<profil>.json`, `persona:`, `entrerDansEspace`, ou à défaut le nom du fichier). 6 écrans ne sont cités que par un parcours d'un **autre** profil (non comptés, ex. une route de l'espace agence exercée seulement en propriétaire direct). 11 écrans sont comptés « exercés » uniquement grâce à un parcours dont le profil n'a pas pu être déterminé (compte-securite, creation-bien-reprise, encaissement-reste, fiscalite-qualifiee, invitations-cycle, outils, vitrine) : le taux d'exercice est donc entre 88 et 99 sur 157.

## 3. Détail des 157 écrans de `matrice-ecrans.json`

`O` ouvert (HTTP/redirection), `R` regardé par (rôle), `PW` parcours Playwright spécifique, `V` vitest qui importe le code, `Vs` vitest qui lit le source (non compté), `X` exercé. Les identifiants d'objets de la matrice sont remplacés par `{id}`.

| Profil | URL | Libellé | O | R | PW | V | Vs | X |
|---|---|---|---|---|---|---|---|---|
| public | `/` | Site vitrine (accueil marketing) | O | - | vitrine.spec.ts | audit-proprietaire-locataire-ecrans.test.ts,outils-routes.test.ts | 5 | X |
| superadmin | `/admin` | Vue d’ensemble de la supervision | O | chaine/2,designer/b,perf-liens,superadmin | compte-supervision.spec.ts,console-clients.spec.ts | - | 1 | X |
| superadmin | `/admin/artisans` | Artisans à valider | O | designer/b | - | - | - | - |
| superadmin | `/admin/brief` | Aujourd’hui — le point du matin | O | perf-liens,superadmin | compte-supervision.spec.ts,console-clients.spec.ts | console-actions-audit27.test.ts | - | X |
| superadmin | `/admin/brief/exploitation` | Le point du matin — détail d’une équipe | O | designer/b,verification/ui-finale | - | - | - | - |
| superadmin | `/admin/clients` | Clients (agences, propriétaires, artisans) | O | - | compte-supervision.spec.ts,console-clients.spec.ts | - | - | X |
| superadmin | `/admin/comptes/{id}` | Fiche de débogage d’un compte (état, rôles, jou… | O | - | - | - | - | - |
| superadmin | `/admin/clients/artisans/{id}` | Fiche artisan | O | - | - | - | - | - |
| superadmin | `/admin/devis` | Demandes de devis du site vitrine | O | perf-liens | - | - | - | - |
| superadmin | `/admin/journaux` | Historique et conservation | O | designer/b,superadmin | navigation-matin.spec.ts | journaux-filtres.test.ts | - | X |
| superadmin | `/admin/organisations/{id}` | Détail d'une organisation | O | - | - | - | - | - |
| superadmin | `/admin/organisations/nouvelle` | Ouvrir une organisation | O | - | onboarding.spec.ts | - | - | X |
| superadmin | `/admin/publications` | Journal éditorial | O | designer/b | - | - | - | - |
| superadmin | `/admin/publications/{id}` | Éditer un article | O | designer/b | - | - | 1 | - |
| superadmin | `/admin/publications/nouvelle` | Créer un article | O | - | - | - | - | - |
| superadmin | `/admin/retours` | Retours des utilisateurs | O | superadmin | - | - | - | - |
| superadmin | `/admin/sante` | Santé et connexions | O | superadmin | navigation-matin.spec.ts | - | - | X |
| superadmin | `/admin/territoire` | Développement territorial | O | - | finalisation.spec.ts | - | 1 | X |
| agent | `/agence/{id}` | Tableau de bord agence (partagé propriétaire) | O | verification/flux-finale | generer-matrice.mjs | - | 1 | X |
| proprietaire | `/agence/{id}/abonnement` | Abonnement (propriétaire direct) | O | - | abonnement.spec.ts | abonnement-proprietaire.test.ts | - | X |
| admin | `/agence/{id}/administration` | Administration (équipe, portefeuilles) | O | - | - | - | - | - |
| agent | `/agence/{id}/agenda` | Agenda de l’agence | O | - | - | - | - | - |
| agent | `/agence/{id}/alertes` | Alertes | O | - | - | vocabulaire-v1-parcours.test.ts | - | X |
| agent | `/agence/{id}/artisans` | Réseau d’artisans | O | - | - | artisan-ajout-proprietaire.test.ts | - | X |
| agent | `/agence/{id}/baux/{id}` | Fiche d'un bail | O | - | - | conge-date-presentation.test.ts,loyers-retours-interface.test.ts | 1 | X |
| agent | `/agence/{id}/baux/{id}/edl/{id}` | État des lieux d'un bail | O | - | - | edl-annexes-retours.test.ts,edl-lecture-pieces.test.ts | 1 | X |
| agent | `/agence/{id}/comptabilite` | Comptabilité (quittancement, encaissements) | O | - | - | comptabilite-vues.test.ts,encaissement-compte-rendu.test.ts | 1 | X |
| proprietaire | `/agence/{id}/comptabilite/fiscal` | Aide fiscale (revenus fonciers) | O | - | fiscalite-qualifiee.spec.ts | - | - | X |
| admin | `/agence/{id}/comptabilite/reprise` | Reprise comptable | O | - | - | - | 1 | - |
| agent | `/agence/{id}/diagnostics/{id}` | Diagnostic et alerte associée | O→/agence/c14c3187-1258-4e58-8822-368c6007e3fa/parc/ef7ec733-1ed1-4747-b57f-4edf9e107626/lots/431fcb21-db21-4939-9b6e-d85b450a25a3 | - | - | - | - | - |
| agent | `/agence/{id}/documents` | GED — documents de l'organisation | O | - | - | - | 1 | - |
| agent | `/agence/{id}/documents/catalogue` | Catalogue documentaire | O | - | - | - | - | - |
| proprietaire | `/agence/{id}/faq` | FAQ du propriétaire direct | O | - | - | essai-deux-mois.test.ts | - | X |
| agent | `/agence/{id}/incidents` | Liste des incidents | O | - | - | vocabulaire-proprietaire-direct.test.ts | - | X |
| agent | `/agence/{id}/incidents/{id}` | Détail d'un incident | O→/agence/c14c3187-1258-4e58-8822-368c6007e3fa/incidents | - | - | - | - | - |
| agent | `/agence/{id}/incidents/nouveau` | Déclaration d'un incident | O | - | - | - | 1 | - |
| agent | `/agence/{id}/loyers` | Loyers et charges | O | - | encaissement-reste.spec.ts | - | - | X |
| admin | `/agence/{id}/mandats` | Mandats & versements | O | - | - | - | - | - |
| agent | `/agence/{id}/messages` | Messagerie | O | - | - | messagerie-proprietaire.test.ts | - | X |
| agent | `/agence/{id}/parc` | Parc / portefeuille de biens | O | - | agent-ajoute-un-bien.spec.ts,chemins-proposes.spec.ts | - | - | X |
| agent | `/agence/{id}/parc/{id}` | Fiche d'un bien | O | - | creation-bien-reprise.spec.ts | ui-clavier-et-rail.test.ts | - | X |
| agent | `/agence/{id}/parc/{id}/lots/{id}` | Fiche d'un lot | O | - | - | detention-reprise-interface.test.ts,vocabulaire-proprietaire-direct.test.ts | 1 | X |
| agent | `/agence/{id}/lots/{id}?vers=caracteristiques` | Renvoi d'un lot vers sa fiche (liens « à rensei… | O→/agence/c14c3187-1258-4e58-8822-368c6007e3fa/parc/ef7ec733-1ed1-4747-b57f-4edf9e107626/lots/431fcb21-db21-4939-9b6e-d85b450a25a3 | - | - | - | - | - |
| admin | `/agence/{id}/parc/import` | Importer un parc | O | - | chemins-proposes.spec.ts,onboarding.spec.ts | - | 2 | X |
| agent | `/agence/{id}/parc/nouveau` | Ajout d'un bien | O | - | agent-ajoute-un-bien.spec.ts,creation-bien-reprise.spec.ts | - | - | X |
| agent | `/agence/{id}/personnes` | Annuaire des personnes | O | - | - | textes-parcours-locataire-compte.test.ts | 2 | X |
| agent | `/agence/{id}/personnes/{id}` | Fiche personne | O | - | invitations-cycle.spec.ts | - | - | X |
| agent | `/agence/{id}/profil` | Profil de l'agence / du propriétaire | O | - | - | - | 2 | - |
| agent | `/agence/{id}/statistiques` | Statistiques | O | - | - | - | - | - |
| artisan | `/artisan` | Accueil artisan | O | auditeur/b,chaine/1b,chaine/2,designer/b,verification/flux-finale,verification/ui-finale | audit-lecture-live.mjs,audit-production.mjs | devis-affichage-fr.test.ts,suivi-facturation-artisan.test.ts | 2 | X |
| artisan | `/artisan/agenda` | Agenda artisan | O | artisan,designer/b,verification/ui-finale | parcours-artisan.spec.ts | - | - | X |
| artisan | `/artisan/attestations` | Attestations artisan | O | auditeur/b,designer/b,verification/flux-finale | attestations-refus.spec.ts,parcours-artisan.spec.ts | artisan-ergonomie-des-b.test.ts | - | X |
| artisan | `/artisan/devis` | Demandes de devis | O | chaine/1b,designer/b,verification/ui-finale | parcours-artisan.spec.ts | artisan-devis-jour-paris.test.ts,devis-envoi.test.ts | - | X |
| artisan | `/artisan/devis/{id}` | Répondre à une demande | O | designer/b,verification/flux-finale | devis-reprise.spec.ts | artisan-devis-jour-paris.test.ts | - | X |
| artisan | `/artisan/entreprise` | Mon entreprise | O | designer/b,verification/flux-finale,verification/ui-finale | demonstration.spec.ts,finalisation.spec.ts | - | 1 | X |
| artisan | `/artisan/facturation` | Facturation artisan | O | artisan,chaine/2,designer/b,verification/flux-finale,verification/ui-finale | demonstration.spec.ts,parcours-artisan.spec.ts | suivi-facturation-artisan.test.ts | 1 | X |
| agent | `/artisan/inscription` | Inscription artisan | O | chaine/1b,chaine/2,designer/b,perf-liens,verification/flux-finale | - | - | 2 | - |
| artisan | `/artisan/missions/{id}` | Fiche mission | O | - | - | - | 1 | - |
| artisan | `/artisan/missions/{id}/compte-rendu` | Compte rendu de mission | O | - | - | - | - | - |
| artisan | `/artisan/missions/{id}/compte-rendu/bilan` | Bilan de mission | O→/artisan/missions/0c81718d-a0a0-4caf-a8d8-e493034165a5 | - | - | - | - | - |
| artisan | `/artisan/missions/{id}/creneaux` | Proposer des créneaux | O | - | - | - | - | - |
| artisan | `/artisan/missions/{id}/facture` | Déposer ma facture | O→/artisan/missions/0c81718d-a0a0-4caf-a8d8-e493034165a5 | - | - | - | 1 | - |
| artisan | `/artisan/note` | Ma note artisan | O | designer/b | parcours-artisan.spec.ts | - | - | X |
| artisan | `/artisan/panne` | Aide en cas de panne | O | - | parcours-artisan.spec.ts | - | - | X |
| agent | `/assistance` | Assistance | O | auditeur/b,designer/b,perf-liens,verification/flux-finale,verification/ui-finale | audit-production.mjs | aide-unifiee.test.ts | 2 | X |
| locataire | `/attestation-loyer/{id}` | Attestation de bon paiement | O | - | - | - | - | - |
| agent | `/compte` | Sécurité du compte (mot de passe, second facteu… | O | auditeur/b,designer/b,perf-liens,verification/flux-finale,verification/ui-finale | audit-lecture-live.mjs,audit-production.mjs | - | 3 | X |
| locataire | `/compte` | Sécurité du compte (locataire) | O | auditeur/b,designer/a,perf-liens,verification/flux-finale,verification/ui-finale | audit-lecture-live.mjs,audit-production.mjs | - | 3 | X |
| public | `/conditions` | Conditions générales d’utilisation et de vente | O | perf-liens,verification/ui-finale | audit-production.mjs | - | 2 | X |
| public | `/confidentialite` | Politique de confidentialité | O | perf-liens,verification/ui-finale | audit-production.mjs | - | 2 | X |
| public | `/tarifs` | Tarifs | O | - | audit-production.mjs,vitrine.spec.ts | - | 3 | X |
| public | `/outils` | Outils gratuits (index) | O | - | audit-production.mjs,outils.spec.ts | - | 1 | X |
| public | `/outils/calcul-irl` | Outil gratuit — calcul de la révision IRL | O | designer/a | audit-production.mjs,outils.spec.ts | outils-irl-rendu.test.ts | 1 | X |
| public | `/outils/quittance-de-loyer` | Outil gratuit — quittance de loyer | O | - | audit-production.mjs,outils.spec.ts | - | 1 | X |
| public | `/outils/comparateur-gli-visale` | Outil gratuit — comparateur GLI / Visale | O | - | audit-production.mjs,outils.spec.ts | - | 1 | X |
| public | `/outils/simulateur-lmnp` | Outil gratuit — simulateur LMNP | O | - | audit-production.mjs,outils.spec.ts | - | 1 | X |
| public | `/outils/rentabilite-locative` | Outil gratuit — rentabilité locative | O | - | audit-production.mjs,outils.spec.ts | - | 1 | X |
| public | `/connexion` | Connexion | O | artisan,auditeur/b,chaine/1,designer/a,perf-liens,proprietaire/s01,verification/flux-finale,verification/ui-finale | audit-lecture-live.mjs,audit-production.mjs | - | 2 | X |
| agent | `/espaces` | Sélecteur d'espaces (tout utilisateur connecté) | O→/agence/c14c3187-1258-4e58-8822-368c6007e3fa | auditeur/b,chaine/1,perf-liens,verification/ui-finale | abonnement.spec.ts,aides.ts | - | 2 | X |
| public | `/inscription` | Inscription (création de compte) | O | auditeur/b,charges-fiscalite,designer/a,proprietaire/s01,verification/ui-finale | audit-production.mjs,compte-securite.spec.ts | - | 4 | X |
| public | `/journal` | Journal | O | designer/a | audit-production.mjs | - | - | X |
| public | `/journal/e2e-gerer-une-location` | Article du journal | O | perf-liens | - | - | 2 | - |
| locataire | `/locataire/{id}` | Tableau de bord locataire | O | verification/flux-finale | invitations-cycle.spec.ts | audit-proprietaire-locataire-ecrans.test.ts | - | X |
| locataire | `/locataire/{id}/contact` | Contacter la gérance | O | - | - | audit-proprietaire-locataire-ecrans.test.ts | - | X |
| locataire | `/locataire/{id}/demandes` | Mes demandes | O | - | - | creneaux-locataire.test.ts | - | X |
| locataire | `/locataire/{id}/documents` | Mes documents | O | - | - | - | - | - |
| locataire | `/locataire/{id}/faq` | FAQ locataire | O | - | - | - | - | - |
| locataire | `/locataire/{id}/incident` | Signaler un incident | O | - | incidents-reprise.spec.ts,parcours-locataire.spec.ts | - | 1 | X |
| locataire | `/locataire/{id}/logement` | Mon logement | O | - | fenetre-lot.spec.ts | - | - | X |
| locataire | `/locataire/{id}/loyers` | Mes loyers & quittances | O | - | parcours-locataire.spec.ts | - | - | X |
| public | `/mentions-legales` | Mentions légales | O | perf-liens,verification/ui-finale | audit-production.mjs | - | 1 | X |
| public | `/mot-de-passe-oublie` | Mot de passe oublié | O | designer/a,perf-liens,verification/flux-finale | audit-production.mjs | - | 1 | X |
| public | `/nouveau-mot-de-passe` | Réinitialisation du mot de passe | O→/connexion | designer/a,perf-liens | - | - | 1 | - |
| public | `/auth/confirmer` | Lien reçu par e-mail — bouton de confirmation | O | designer/a,proprietaire/s01,verification/ui-finale | - | - | 2 | - |
| locataire | `/quittance/{id}` | Quittance / reçu imprimable (aussi vue côté age… | O | auditeur/b | - | - | - | - |
| superadmin | `/securite` | Sécurité des données | O | superadmin | auth.setup.ts,mfa-local.mjs | - | - | X |
| superadmin | `/admin/veille` | Veille à superviser | O | - | finalisation.spec.ts | - | - | X |
| artisan | `/artisan/regles` | Règles pour les artisans | O | - | finalisation.spec.ts | - | - | X |
| proprietaire | `/veille?public=bailleur` | Règles pour les bailleurs | O | designer/a,verification/ui-finale | - | - | - | - |
| locataire | `/veille?public=locataire` | Règles pour les locataires | O | designer/a,verification/ui-finale | - | - | - | - |
| admin | `/veille?public=agence` | Règles pour les agences | O | verification/ui-finale | - | - | - | - |
| agent | `/veille?public=agence` | Règles pour les agents | O | verification/ui-finale | - | - | - | - |
| superadmin | `/admin/autonomie` | Développement du site | O | - | finalisation.spec.ts | - | - | X |
| superadmin | `/admin/equipes` | Travail des équipes | O | superadmin | equipes.spec.ts | - | - | X |
| superadmin | `/admin/marketing` | Agent marketing | O | - | finalisation.spec.ts,navigation-matin.spec.ts | - | 1 | X |
| superadmin | `/admin/marque-blanche` | Personnalisation des agences | O | perf-liens | equipes.spec.ts | - | - | X |
| superadmin | `/relais` | Relais de supervision | O | - | - | - | 1 | - |
| admin | `/agence/{id}` | Tableau de bord agence (partagé propriétaire) —… | O | verification/flux-finale | generer-matrice.mjs,parcours-agence.spec.ts | - | 1 | X |
| admin | `/agence/{id}/agenda` | Agenda de l’agence — responsable | O | - | - | - | - | - |
| admin | `/agence/{id}/alertes` | Alertes — responsable | O | - | parcours-agence.spec.ts | vocabulaire-v1-parcours.test.ts | - | X |
| admin | `/agence/{id}/artisans` | Réseau d’artisans — responsable | O | - | - | artisan-ajout-proprietaire.test.ts | - | X |
| admin | `/agence/{id}/baux/{id}` | Fiche d'un bail — responsable | O | - | - | conge-date-presentation.test.ts,loyers-retours-interface.test.ts | 1 | X |
| admin | `/agence/{id}/baux/{id}/edl/{id}` | État des lieux d'un bail — responsable | O | - | - | edl-annexes-retours.test.ts,edl-lecture-pieces.test.ts | 1 | X |
| admin | `/agence/{id}/comptabilite` | Comptabilité (quittancement, encaissements) — r… | O | - | comptabilite-vues.spec.ts,parcours-agence.spec.ts | comptabilite-vues.test.ts,encaissement-compte-rendu.test.ts | 1 | X |
| admin | `/agence/{id}/diagnostics/{id}` | Diagnostic et alerte associée — responsable | O→/agence/c14c3187-1258-4e58-8822-368c6007e3fa/parc/ef7ec733-1ed1-4747-b57f-4edf9e107626/lots/431fcb21-db21-4939-9b6e-d85b450a25a3 | - | - | - | - | - |
| admin | `/agence/{id}/documents` | GED — documents de l'organisation — responsable | O | - | - | - | 1 | - |
| admin | `/agence/{id}/documents/catalogue` | Catalogue documentaire — responsable | O | - | - | - | - | - |
| admin | `/agence/{id}/incidents` | Liste des incidents — responsable | O | - | - | vocabulaire-proprietaire-direct.test.ts | - | X |
| admin | `/agence/{id}/incidents/{id}` | Détail d'un incident — responsable | O→/agence/c14c3187-1258-4e58-8822-368c6007e3fa/incidents | - | - | - | - | - |
| admin | `/agence/{id}/incidents/nouveau` | Déclaration d'un incident — responsable | O | - | - | - | 1 | - |
| admin | `/agence/{id}/loyers` | Loyers et charges — responsable | O | - | encaissement-reste.spec.ts | - | - | X |
| admin | `/agence/{id}/messages` | Messagerie — responsable | O | - | - | messagerie-proprietaire.test.ts | - | X |
| admin | `/agence/{id}/parc` | Parc / portefeuille de biens — responsable | O | - | chemins-proposes.spec.ts,fenetre-lot.spec.ts | - | - | X |
| admin | `/agence/{id}/parc/{id}` | Fiche d'un bien — responsable | O | - | creation-bien-reprise.spec.ts | ui-clavier-et-rail.test.ts | - | X |
| admin | `/agence/{id}/parc/{id}/lots/{id}` | Fiche d'un lot — responsable | O | - | - | detention-reprise-interface.test.ts,vocabulaire-proprietaire-direct.test.ts | 1 | X |
| admin | `/agence/{id}/parc/nouveau` | Ajout d'un bien — responsable | O | - | creation-bien-reprise.spec.ts,parcours-agence.spec.ts | - | - | X |
| admin | `/agence/{id}/personnes` | Annuaire des personnes — responsable | O | - | personne-reprise.spec.ts | textes-parcours-locataire-compte.test.ts | 2 | X |
| admin | `/agence/{id}/personnes/{id}` | Fiche personne — responsable | O | - | invitations-cycle.spec.ts | - | - | X |
| admin | `/agence/{id}/profil` | Profil de l'agence / du propriétaire — responsa… | O | - | protection-saisie.spec.ts | - | 2 | X |
| admin | `/agence/{id}/statistiques` | Statistiques — responsable | O | - | - | - | - | - |
| proprietaire | `/agence/{id}` | Accueil du bailleur | O | designer/a,verification/flux-finale | generer-matrice.mjs,protection-saisie.spec.ts | - | 1 | X |
| proprietaire | `/agence/{id}/parc` | Mes lots | O | - | dossier-proprietaire.spec.ts,protection-saisie.spec.ts | - | - | X |
| proprietaire | `/agence/{id}/parc/nouveau` | Ajouter un bien | O | - | creation-bien-reprise.spec.ts | - | - | X |
| proprietaire | `/agence/{id}/personnes` | Locataires et garants | O | - | personne-reprise.spec.ts | textes-parcours-locataire-compte.test.ts | 2 | X |
| proprietaire | `/agence/{id}/loyers` | Loyers du bailleur | O | - | encaissement-reste.spec.ts | - | - | X |
| proprietaire | `/agence/{id}/comptabilite` | Livre recettes-dépenses | O | - | - | comptabilite-vues.test.ts,encaissement-compte-rendu.test.ts | 1 | X |
| proprietaire | `/agence/{id}/incidents` | Incidents du bailleur | O | - | - | vocabulaire-proprietaire-direct.test.ts | - | X |
| proprietaire | `/agence/{id}/incidents/nouveau` | Déclarer un incident | O | - | - | - | 1 | - |
| proprietaire | `/agence/{id}/alertes` | Alertes du bailleur | O | - | - | vocabulaire-v1-parcours.test.ts | - | X |
| proprietaire | `/agence/{id}/agenda` | Agenda du bailleur | O | - | - | - | - | - |
| proprietaire | `/agence/{id}/statistiques` | Statistiques du bailleur | O | - | - | - | - | - |
| proprietaire | `/agence/{id}/messages` | Messages du bailleur | O | - | - | messagerie-proprietaire.test.ts | - | X |
| proprietaire | `/agence/{id}/profil` | Paramètres du bailleur | O | - | protection-saisie.spec.ts | - | 2 | X |
| proprietaire | `/agence/{id}/documents` | Documents du bailleur | O | - | - | - | 1 | - |
| proprietaire | `/agence/{id}/documents/catalogue` | Catalogue du bailleur | O | - | - | - | - | - |
| proprietaire | `/agence/{id}/artisans` | Carnet d’artisans du bailleur | O | - | - | artisan-ajout-proprietaire.test.ts | - | X |
| superadmin | `/admin/relais` | Relais en mon absence | O | designer/b,superadmin | equipes.spec.ts,supervision-consignes.spec.ts | - | 1 | X |
| superadmin | `/admin/parametres` | Paramètres | O | - | - | - | - | - |
| superadmin | `/admin/couverture` | Réseau d’artisans : ouvertures par commune et m… | O | designer/b | reseau-couverture.spec.ts | - | - | X |
| admin | `/agence/{id}/reseau` | Réseau disponible pour les biens | O | - | - | - | - | - |
| proprietaire | `/agence/{id}/journal` | Journal dans l’espace connecté | O | - | - | - | - | - |
| proprietaire | `/agence/{id}/journal/e2e-gerer-une-location` | Article dans l’espace connecté | O | - | - | - | - | - |
| agent | `/agence/{id}/journal` | Journal dans l’espace connecté | O | - | - | - | - | - |
| agent | `/agence/{id}/journal/e2e-gerer-une-location` | Article dans l’espace connecté | O | - | - | - | - | - |
| superadmin | `/admin/consignes` | Consignes versionnées | O | superadmin | console-clients.spec.ts,supervision-consignes.spec.ts | - | 1 | X |
| artisan | `/artisan/clients` | Clients externes | O | artisan,designer/b,verification/flux-finale,verification/ui-finale | parcours-artisan.spec.ts | artisan-ergonomie-des-b.test.ts,artisan-prive-affichage.test.ts | 1 | X |
| artisan | `/artisan/devis/nouveau` | Nouveau chantier et devis | O | designer/b,verification/ui-finale | - | artisan-ergonomie-des-b.test.ts | - | X |

## 4. Ce qui n'est pas couvert

### 4.1 Écrans ouverts mais ni exercés ni regardés

43 écrans (ouverts par la passe automatique, aucun parcours, aucun test d'import, aucun rapport de rôle qui cite leur URL) :

- **proprietaire** (7) : `/agence/{id}/incidents/nouveau`, `/agence/{id}/agenda`, `/agence/{id}/statistiques`, `/agence/{id}/documents`, `/agence/{id}/documents/catalogue`, `/agence/{id}/journal`, `/agence/{id}/journal/e2e-gerer-une-location`
- **locataire** (3) : `/attestation-loyer/{id}`, `/locataire/{id}/documents`, `/locataire/{id}/faq`
- **artisan** (5) : `/artisan/missions/{id}`, `/artisan/missions/{id}/compte-rendu`, `/artisan/missions/{id}/compte-rendu/bilan`, `/artisan/missions/{id}/creneaux`, `/artisan/missions/{id}/facture`
- **agent** (11) : `/agence/{id}/agenda`, `/agence/{id}/diagnostics/{id}`, `/agence/{id}/documents`, `/agence/{id}/documents/catalogue`, `/agence/{id}/incidents/{id}`, `/agence/{id}/incidents/nouveau`, `/agence/{id}/lots/{id}?vers=caracteristiques`, `/agence/{id}/profil`, `/agence/{id}/statistiques`, `/agence/{id}/journal`, `/agence/{id}/journal/e2e-gerer-une-location`
- **admin** (11) : `/agence/{id}/administration`, `/agence/{id}/comptabilite/reprise`, `/agence/{id}/mandats`, `/agence/{id}/agenda`, `/agence/{id}/diagnostics/{id}`, `/agence/{id}/documents`, `/agence/{id}/documents/catalogue`, `/agence/{id}/incidents/{id}`, `/agence/{id}/incidents/nouveau`, `/agence/{id}/statistiques`, `/agence/{id}/reseau`
- **superadmin** (6) : `/admin/comptes/{id}`, `/admin/clients/artisans/{id}`, `/admin/organisations/{id}`, `/admin/publications/nouvelle`, `/relais`, `/admin/parametres`

### 4.2 Écrans ouverts mais seulement par la passe automatique (hors « regardé »)

58 écrans ne sont exercés ni par un parcours ni par un test vitest (dont 43 ci-dessus sans regard non plus). Voir la colonne `X` du détail.

### 4.3 Pages du code absentes de la matrice d'écrans

`generer-matrice.mjs` écarte les routes dont l'objet n'existe pas dans la base du banc (journal `cand5-e2e-matrice.log` : « 157 écrans dans la matrice ; 4 écartés »). 4 pages du code ne sont donc ouvertes par **aucune** passe automatique :

| Route | Fichier | Parcours Playwright | Test vitest qui importe |
|---|---|---|---|
| `/artisan/chantiers/[chantierId]` | `artisan/chantiers/[chantierId]/page.tsx` | - | artisan-prive-affichage.test.ts |
| `/artisan/clients/[clientId]` | `artisan/clients/[clientId]/page.tsx` | - | artisan-ergonomie-des-b.test.ts, artisan-prive-affichage.test.ts |
| `/artisan/facturation/[factureId]` | `artisan/facturation/[factureId]/page.tsx` | - | artisan-prive-affichage.test.ts |
| `/invitations/[invitationId]` | `invitations/[invitationId]/page.tsx` | invitations-cycle.spec.ts | - |

## 5. Actions serveur

259 fonctions exportées. Niveaux (du plus fort au plus faible) : **vitest (import + nom)** = un test importe le module et nomme la fonction ; *import du module* = le module est importé sans que la fonction soit nommée ; *nom seul* = la fonction est citée sans import ; *parcours/rôle* = citée dans un parcours Playwright ou un rapport de rôle ; **non couverte** = aucune trace.

| Niveau | Fonctions | Part |
|---|---|---|
| vitest (import du module, fonction non nommée) | 125 | 48.3 % |
| vitest (import + nom) | 87 | 33.6 % |
| non couverte | 43 | 16.6 % |
| vitest (nom seul) | 4 | 1.5 % |

| Fichier | Fonctions | Import + nom | Import du module | Nom seul | Parcours/rôle | Non couvertes |
|---|---|---|---|---|---|---|
| `actions/abonnement.ts` | 5 | 1 | 4 | 0 | 0 | 0 |
| `actions/agenda-gestion.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/alertes.ts` | 3 | 0 | 0 | 0 | 0 | 3 |
| `actions/annexe-bail.ts` | 3 | 3 | 0 | 0 | 0 | 0 |
| `actions/annonces.ts` | 2 | 0 | 0 | 0 | 0 | 2 |
| `actions/appels-charges.ts` | 6 | 0 | 0 | 0 | 0 | 6 |
| `actions/artisan.ts` | 16 | 3 | 13 | 0 | 0 | 0 |
| `actions/attestation-locataire.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/auth.ts` | 6 | 3 | 3 | 0 | 0 | 0 |
| `actions/autonomie.ts` | 7 | 0 | 0 | 0 | 0 | 7 |
| `actions/baux.ts` | 15 | 5 | 10 | 0 | 0 | 0 |
| `actions/catalogue-documents.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/chambres.ts` | 2 | 0 | 0 | 0 | 0 | 2 |
| `actions/classe-dpe-lot.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/compta.ts` | 7 | 1 | 6 | 0 | 0 | 0 |
| `actions/compte.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/conge-locataire.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/consignes-vacances.ts` | 4 | 1 | 3 | 0 | 0 | 0 |
| `actions/controle-supervision.ts` | 3 | 3 | 0 | 0 | 0 | 0 |
| `actions/depot.ts` | 2 | 0 | 0 | 1 | 0 | 1 |
| `actions/devis-admin.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/devis.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/documents-ged.ts` | 2 | 0 | 0 | 0 | 0 | 2 |
| `actions/documents-generes.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/dossier.ts` | 2 | 1 | 1 | 0 | 0 | 0 |
| `actions/edl.ts` | 9 | 4 | 5 | 0 | 0 | 0 |
| `actions/equipes.ts` | 3 | 2 | 1 | 0 | 0 | 0 |
| `actions/erreurs.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/etapes-bail.ts` | 2 | 2 | 0 | 0 | 0 | 0 |
| `actions/etudes-territoriales.ts` | 1 | 0 | 0 | 1 | 0 | 0 |
| `actions/fiche-lot.ts` | 7 | 1 | 6 | 0 | 0 | 0 |
| `actions/fiscalite.ts` | 3 | 1 | 2 | 0 | 0 | 0 |
| `actions/ged.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/import-parc.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/incidents-locataire.ts` | 3 | 1 | 2 | 0 | 0 | 0 |
| `actions/incidents.ts` | 18 | 4 | 14 | 0 | 0 | 0 |
| `actions/invitations.ts` | 3 | 3 | 0 | 0 | 0 | 0 |
| `actions/loyers.ts` | 9 | 5 | 4 | 0 | 0 | 0 |
| `actions/mandats.ts` | 6 | 2 | 4 | 0 | 0 | 0 |
| `actions/messages.ts` | 2 | 0 | 0 | 1 | 0 | 1 |
| `actions/organisation.ts` | 2 | 2 | 0 | 0 | 0 | 0 |
| `actions/organisations-admin.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/parc.ts` | 17 | 2 | 15 | 0 | 0 | 0 |
| `actions/personnes-bail.ts` | 5 | 5 | 0 | 0 | 0 | 0 |
| `actions/personnes.ts` | 3 | 2 | 1 | 0 | 0 | 0 |
| `actions/pieces-demandees.ts` | 4 | 2 | 2 | 0 | 0 | 0 |
| `actions/publications.ts` | 6 | 1 | 5 | 0 | 0 | 0 |
| `actions/quittancement.ts` | 3 | 1 | 2 | 0 | 0 | 0 |
| `actions/recherche-espace.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/recherche-supervision.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/reprise-comptable.ts` | 2 | 0 | 0 | 0 | 0 | 2 |
| `actions/reseau.ts` | 5 | 1 | 4 | 0 | 0 | 0 |
| `actions/restitution.ts` | 7 | 1 | 6 | 0 | 0 | 0 |
| `actions/retention.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/retours.ts` | 5 | 2 | 3 | 0 | 0 | 0 |
| `actions/retrait-bien.ts` | 2 | 0 | 0 | 0 | 0 | 2 |
| `actions/session-artisan.ts` | 2 | 0 | 0 | 0 | 0 | 2 |
| `actions/signature-locataire.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/signature.ts` | 5 | 3 | 2 | 0 | 0 | 0 |
| `actions/supervision-artisans.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/supprimer-bail-brouillon.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `actions/veille.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `actions/verification-marque.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `admin/brief/actions.ts` | 4 | 1 | 3 | 0 | 0 | 0 |
| `admin/marketing/actions.ts` | 3 | 0 | 0 | 1 | 0 | 2 |
| `admin/publications/nouvelle/actions.ts` | 1 | 0 | 0 | 0 | 0 | 1 |
| `agence/[orgId]/artisans/actions.ts` | 5 | 1 | 4 | 0 | 0 | 0 |
| `agence/[orgId]/baux/[bailId]/verifier-dossier.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `artisan/clients/actions.ts` | 1 | 1 | 0 | 0 | 0 | 0 |
| `artisan/devis/actions-preparation.ts` | 4 | 4 | 0 | 0 | 0 | 0 |

### 5.1 Actions sans aucune trace (43)

| Fichier | Fonction | Rôle exigé (lu) |
|---|---|---|
| `actions/alertes.ts` | `creerAlerte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/alertes.ts` | `escaladerAlerte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/alertes.ts` | `fermerAlerte` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/annonces.ts` | `creerAnnonce` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/annonces.ts` | `supprimerAnnonce` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/appels-charges.ts` | `creerAppelCharges` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/appels-charges.ts` | `ajouterPosteCharge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/appels-charges.ts` | `modifierPosteCharge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/appels-charges.ts` | `supprimerPosteCharge` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/appels-charges.ts` | `validerVentilation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/appels-charges.ts` | `supprimerAppelCharges` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/autonomie.ts` | `actualiserDossiers` | super_admin permanent (aal2) |
| `actions/autonomie.ts` | `creerDelegation` | super_admin permanent (aal2) |
| `actions/autonomie.ts` | `revoquerDelegation` | super_admin permanent (aal2) |
| `actions/autonomie.ts` | `deciderAmelioration` | super_admin permanent (aal2) |
| `actions/autonomie.ts` | `actualiserCorrection` | super_admin permanent (aal2) |
| `actions/autonomie.ts` | `signalerPresence` | super_admin permanent (aal2) |
| `actions/autonomie.ts` | `enregistrerBilanContact` | non détecté |
| `actions/catalogue-documents.ts` | `genererDepuisCatalogue` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/chambres.ts` | `enregistrerChambre` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/chambres.ts` | `enregistrerPlafondColocation` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/conge-locataire.ts` | `donnerMonConge` | session seulement (auth.getUser) ; rôle à lire |
| `actions/depot.ts` | `supprimerEncaissementDepot` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/devis.ts` | `demanderDevis` | non détecté |
| `actions/documents-ged.ts` | `remplacerDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/documents-ged.ts` | `rattacherDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/ged.ts` | `deposerDocument` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/import-parc.ts` | `importerParc` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/messages.ts` | `envoyerMessageLocataire` | session seulement (auth.getUser) ; rôle à lire |
| `actions/organisations-admin.ts` | `ouvrirOrganisation` | non détecté |
| `actions/reprise-comptable.ts` | `reprendreSoldes` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/reprise-comptable.ts` | `abandonnerReprise` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/retention.ts` | `lancerPurge` | super_admin |
| `actions/retrait-bien.ts` | `retirerBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/retrait-bien.ts` | `retablirBien` | gerant (admin_agence\|agent\|proprietaire_direct) ; super_admin en traversée tracée |
| `actions/session-artisan.ts` | `entrerDansSessionArtisan` | non détecté |
| `actions/session-artisan.ts` | `quitterSessionArtisan` | non détecté |
| `actions/signature-locataire.ts` | `retournerDocumentSigne` | session seulement (auth.getUser) ; rôle à lire |
| `actions/veille.ts` | `deciderVeille` | super_admin permanent (aal2) |
| `actions/verification-marque.ts` | `verifierConnexionMarque` | super_admin permanent (aal2) |
| `admin/marketing/actions.ts` | `programmerCampagne` | super_admin permanent (aal2) |
| `admin/marketing/actions.ts` | `deciderPostProgramme` | super_admin permanent (aal2) |
| `admin/publications/nouvelle/actions.ts` | `creerArticleIA` | super_admin |

Un test « import du module » (126 fonctions) ne prouve pas que la fonction est appelée : voir la liste détaillée dans `donnees/couverture.json › actions`.

## 6. Fonctions SQL (RPC)

Niveaux : **vitest sur base réelle** = un fichier de test gardé par `SUPABASE_DB_URL` (exécuté contre `gerimmo_ci_integ` par `candidat5.sh`) nomme la fonction ; *vitest sans base* = nommée dans un test sans base ; *Playwright / jeu d'essai* = nommée dans un parcours ; *appel de contrôle d'accès seulement* = seulement appelée par la matrice super-admin ou le fuzz de l'auditeur (refus et isolation, pas le geste métier) ; *appelée par l'application, aucun test ne la nomme* ; *non couverte*.

### 6.1 Les 354 RPC exécutables par `authenticated`

| Niveau | Fonctions | Part |
|---|---|---|
| vitest sur base réelle | 258 | 72.9 % |
| appel de contrôle d'accès seulement (matrice/fuzz) | 82 | 23.2 % |
| vitest (sans base) | 14 | 4.0 % |

### 6.2 Les 554 fonctions de `public`

| Niveau | Fonctions | Part |
|---|---|---|
| vitest sur base réelle | 342 | 61.7 % |
| appel de contrôle d'accès seulement (matrice/fuzz) | 87 | 15.7 % |
| déclencheur (déclenché par les écritures) | 82 | 14.8 % |
| non couverte | 24 | 4.3 % |
| vitest (sans base) | 16 | 2.9 % |
| appelée par l'application, aucun test ne la nomme | 3 | 0.5 % |

### 6.3 RPC exécutables par `authenticated` sans test sur base réelle (96)

- **appel de contrôle d'accès seulement (matrice/fuzz)** (82) : `abonnement_changements_a_recalculer`, `alerte_origine`, `annee_de_bail`, `annuler_demande_signature`, `artisan_definir_metiers_zones`, `artisan_identite_reelle`, `artisan_lever_blacklist_locale`, `artisan_lisible`, `artisan_possede_intervention`, `artisan_statut_local`, `artisan_supervise`, `autoriser_orchestration`, `bail_mentions_manquantes_valeurs`, `confirmer_bilan_contact`, `consultation_hors_portefeuille`, `decennale_requise`, `decliner_sollicitation`, `delai_defaut_paiement_jours`, `demander_periodicite_suivante`, `demandes_signature_document`, `devis_hors_portefeuille`, `documents_a_renouveler`, `documents_stats_par_type`, `dossiers_de_mes_factures_a_deposer`, `ecran_support_sans_donnees`, `ecriture_annulable_depuis_le_journal`, `edl_hors_portefeuille`, `envoyer_message_locataire`, `est_agent_restreint`, `fichier_signature_autorise`, `generer_rapport`, `impact_activation_mandat`, `incident_hors_portefeuille`, `intervention_hors_portefeuille`, `is_active_member`, `lots_blocages_location`, `ma_restitution_locataire`, `ma_souscription_stripe`, `maintenance_artisans`, `marquer_point_lu`, `mes_annonces_locataire`, `mes_demandes_signature`, `mes_edl_locataire`, `mes_infos_pratiques_locataire`, `mes_pieces_artisan`, `mes_pieces_demandees`, `mes_publics_veille`, `mes_relances_locataire`, `mes_retenues_restitution`, `messages_non_lus_gerant`, `messages_non_lus_locataire`, `mon_bail_document_locataire`, `mon_budget_intervention`, `mon_conge_locataire`, `mon_depot_locataire`, `mon_espace_locataire`, `mon_gestionnaire_locataire`, `mon_intention_conge`, `mon_lot_locataire`, `orgs_de_mes_missions`, `orgs_de_mes_sollicitations_ouvertes`, `perimetre_persons_gerant`, `peut_lire_retour`, `plafond_depot_mois`, `publication_incomplete`, `qualites_bailleur`, `rechercher_comptes_supervision`, `repondre_message_personne`, `restitution_date_limite`, `restitution_hors_portefeuille`, `retirer_evaluation`, `retourner_document_signe`, `rouvrir_detention`, `session_artisan_diagnostic_active`, `signaler_presence_supervision`, `socle_agence_lots`, `supervision_abonnement`, `tarif_supplement_bien_cents`, `totaux_ecritures`, `trimestre_irl_annee`, `user_org_ids`, `ventiler_depense_bien`
- **vitest (sans base)** (14) : `abonnement_client_pose`, `choisir_personne_bail`, `documents_courants`, `dossier_compte_supervision`, `enregistrer_annexes_edl`, `enregistrer_grille_edl`, `enregistrer_grille_edl_avec_preuve`, `enregistrer_proprietaires_bail`, `envoyer_rapport`, `fils_messages_gerant`, `has_org_role`, `is_permanent_super_admin`, `messages_personne`, `mon_client_stripe`

## 7. Limites de cet inventaire

- Recherche textuelle : une adresse construite par une fonction d'aide, un test qui nomme une fonction dans un commentaire, ou une assertion qui ne porte pas sur l'écran cité faussent le décompte dans les deux sens.
- « Vitest sur base réelle » repose sur la présence de la chaîne `SUPABASE_DB_URL` dans le fichier de test, pas sur l'exécution effective de chaque cas : le journal vitest dit 14 tests ignorés et 1 fichier ignoré (non identifiés dans le journal).
- Les rapports d'audit par écran de 390 px (suite e2e) et 768 px n'existent plus (écrasés) : seule la passe à 1440 px est détaillée par écran.
- « Regardé » est une borne basse (URL citée dans un rapport). Le designer écrit lui-même que le regard humain n'a pas été fait écran par écran pour fiscal, reprise comptable, import, catalogue de documents, agenda, statistiques, messages, journal connecté, fiche personne, attestation de loyer, quittance imprimable, FAQ et assistance (preuves/designer/a/rapport.json, section non testé).
- Les écrans de la matrice sont ceux d'un banc de démonstration : bail actif, loyers, quittances, EDL, devis et interventions n'y existent qu'en petit nombre ; un écran « ouvert » peut l'être à l'état vide.


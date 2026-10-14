---
type: synthesis
tags: [performance, liens, audit-2026-10-13, mission-operationnelle]
status: draft
created: 2026-10-14
updated: 2026-10-14
sources: []
---

# Performances et liens — mesures du 14 octobre 2026

> [!info] Portée
> Mesures relatives sur un banc local (machine partagée de 4 cœurs, aucun CDN, jeu de données réduit), à froid, sur la version candidate.
> Elles ne remplacent pas une mesure de production. Le détail brut (`mesures.csv`, 507 chargements) est dans l'archive des preuves.

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]] (PRF-01 à PRF-10).

## Performances et erreurs

Conditions : Chromium headless, `fr-FR`, `Europe/Paris`, cache HTTP désactivé (premier chargement à froid à chaque écran), aucun étranglement réseau, machine partagée (4 cœurs). Mesures relatives, pas une conformité. Une seule session par profil ; `load` = fin de l'événement load ; LCP/CLS par PerformanceObserver 0,9 s après `load`. 157 écrans de la matrice × 390 et 1280 px ; 390 px mesuré deux fois ; les 5 écrans les plus lents et le CLS suspect répétés 3 fois par largeur.

## Synthèse 1280 px (157 écrans)

- LCP médian 444 ms ; p95 580 ms ; max 626 ms ; écrans > 2 500 ms : 0
- Document (réponse complète) médian 89 ms, max 260 ms
- CLS > 0,1 : [('/nouveau-mot-de-passe', 0.1056)]
- Poids transféré médian 944 Ko, max 2039 Ko ; requêtes médianes 57

## Synthèse 390 px (157 écrans)

- LCP médian 350 ms ; p95 536 ms ; max 640 ms ; écrans > 2 500 ms : 0
- Document (réponse complète) médian 86 ms, max 266 ms
- CLS > 0,1 : [('/nouveau-mot-de-passe', 0.3463)]
- Poids transféré médian 646 Ko, max 1438 Ko ; requêtes médianes 37

## Les 15 écrans les plus lents (LCP médian, toutes largeurs)

| # | Profil | Écran | Larg. | LCP méd. (ms) | LCP max | Doc (ms) | CLS | Ko | Req. | Cause probable |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | agent | `/espaces` | 390 | 640 | 668 | 168 | 0 | 1373 | 63 | élément LCP = image (acade-paris.119tlf24tqhv8.jp); rendu serveur du document 168 ms; 1373 Ko transférés (cache désactivé); 63 requêtes |
| 2 | agent | `/agence/c14c3187…` | 390 | 632 | 644 | 169 | 0 | 766 | 38 | élément LCP = image (acade-paris.119tlf24tqhv8.jp); rendu serveur du document 169 ms |
| 3 | agent | `/agence/c14c3187…` | 1280 | 626 | 644 | 193 | 0 | 1151 | 63 | élément LCP = ASIDE; rendu serveur du document 193 ms; 1151 Ko transférés (cache désactivé); 63 requêtes |
| 4 | agent | `/espaces` | 1280 | 626 | 644 | 174 | 0 | 1730 | 72 | élément LCP = ASIDE; rendu serveur du document 174 ms; 1730 Ko transférés (cache désactivé); 72 requêtes |
| 5 | agent | `/agence/c14c3187…/parc/nouveau` | 390 | 608 | 656 | 125 | 0 | 796 | 38 | élément LCP = P |
| 6 | admin | `/agence/c14c3187…` | 1280 | 604 | 604 | 192 | 0 | 1145 | 61 | élément LCP = ASIDE; rendu serveur du document 192 ms; 1145 Ko transférés (cache désactivé); 61 requêtes |
| 7 | admin | `/agence/c14c3187…` | 390 | 602 | 616 | 204 | 0 | 772 | 40 | élément LCP = image (acade-paris.119tlf24tqhv8.jp); rendu serveur du document 204 ms |
| 8 | agent | `/agence/c14c3187…/diagnostics/a750bf8c…` | 1280 | 600 | 600 | 213 | 0 | 2039 | 94 | élément LCP = ASIDE; rendu serveur du document 213 ms; 2039 Ko transférés (cache désactivé); 94 requêtes |
| 9 | agent | `/agence/c14c3187…/parc/2b6de062…/lots/cfd9607a…` | 1280 | 592 | 592 | 159 | 0 | 1123 | 65 | élément LCP = ASIDE; rendu serveur du document 159 ms; 1123 Ko transférés (cache désactivé); 65 requêtes |
| 10 | admin | `/agence/c14c3187…/personnes` | 1280 | 588 | 588 | 177 | 0 | 1040 | 69 | élément LCP = ASIDE; rendu serveur du document 177 ms; 1040 Ko transférés (cache désactivé); 69 requêtes |
| 11 | agent | `/agence/c14c3187…/personnes/5888f319…` | 1280 | 584 | 584 | 140 | 0 | 963 | 62 | élément LCP = ASIDE; 62 requêtes |
| 12 | agent | `/agence/c14c3187…/baux/b49b1542…` | 1280 | 580 | 580 | 177 | 0 | 1030 | 64 | élément LCP = ASIDE; rendu serveur du document 177 ms; 1030 Ko transférés (cache désactivé); 64 requêtes |
| 13 | agent | `/agence/c14c3187…/statistiques` | 1280 | 580 | 580 | 132 | 0 | 922 | 58 | élément LCP = ASIDE |
| 14 | agent | `/agence/c14c3187…/documents` | 1280 | 576 | 576 | 167 | 0 | 943 | 66 | élément LCP = ASIDE; rendu serveur du document 167 ms; 66 requêtes |
| 15 | proprietaire | `/agence/3c1d1e95…/abonnement` | 1280 | 568 | 568 | 182 | 0 | 949 | 49 | élément LCP = ASIDE; rendu serveur du document 182 ms |

## Tous les écrans, triés par LCP médian décroissant

| Profil | Écran | Larg. | n | LCP méd. | Doc | TTFB | Load | CLS max | Ko | Req. |
|---|---|---|---|---|---|---|---|---|---|---|
| agent | `/espaces` | 390 | 5 | 640 | 168 | 25 | 195 | 0 | 1373 | 63 |
| agent | `/agence/c14c3187…` | 390 | 5 | 632 | 169 | 27 | 245 | 0 | 766 | 38 |
| agent | `/agence/c14c3187…` | 1280 | 4 | 626 | 193 | 30 | 246 | 0 | 1151 | 63 |
| agent | `/espaces` | 1280 | 4 | 626 | 174 | 28 | 198 | 0 | 1730 | 72 |
| agent | `/agence/c14c3187…/parc/nouveau` | 390 | 5 | 608 | 125 | 22 | 227 | 0 | 796 | 38 |
| admin | `/agence/c14c3187…` | 1280 | 1 | 604 | 192 | 22 | 228 | 0 | 1145 | 61 |
| admin | `/agence/c14c3187…` | 390 | 2 | 602 | 204 | 26 | 236 | 0 | 772 | 40 |
| agent | `/agence/c14c3187…/diagnostics/a750bf8c…` | 1280 | 1 | 600 | 213 | 60 | 275 | 0 | 2039 | 94 |
| agent | `/agence/c14c3187…/parc/2b6de062…/lots/cfd9607a…` | 1280 | 1 | 592 | 159 | 27 | 258 | 0 | 1123 | 65 |
| admin | `/agence/c14c3187…/personnes` | 1280 | 1 | 588 | 177 | 20 | 287 | 0 | 1040 | 69 |
| agent | `/agence/c14c3187…/personnes/5888f319…` | 1280 | 1 | 584 | 140 | 21 | 262 | 0 | 963 | 62 |
| agent | `/agence/c14c3187…/baux/b49b1542…` | 1280 | 1 | 580 | 177 | 25 | 258 | 0 | 1030 | 64 |
| agent | `/agence/c14c3187…/statistiques` | 1280 | 1 | 580 | 132 | 20 | 228 | 0 | 922 | 58 |
| agent | `/agence/c14c3187…/documents` | 1280 | 1 | 576 | 167 | 22 | 228 | 0 | 943 | 66 |
| proprietaire | `/agence/3c1d1e95…/abonnement` | 1280 | 1 | 568 | 182 | 42 | 265 | 0 | 949 | 49 |
| admin | `/agence/c14c3187…/alertes` | 1280 | 1 | 568 | 107 | 26 | 209 | 0 | 949 | 59 |
| agent | `/agence/c14c3187…/alertes` | 1280 | 1 | 568 | 157 | 24 | 218 | 0 | 949 | 59 |
| agent | `/agence/c14c3187…/loyers` | 1280 | 1 | 568 | 154 | 28 | 224 | 0 | 945 | 57 |
| superadmin | `/admin/couverture` | 390 | 2 | 566 | 98 | 36 | 210 | 0 | 948 | 47 |
| superadmin | `/admin/publications/118ee48c…` | 1280 | 1 | 564 | 55 | 31 | 193 | 0 | 1240 | 57 |
| admin | `/agence/c14c3187…/parc/nouveau` | 390 | 2 | 560 | 96 | 26 | 224 | 0 | 791 | 38 |
| proprietaire | `/agence/3c1d1e95…` | 1280 | 1 | 556 | 137 | 22 | 226 | 0 | 936 | 59 |
| proprietaire | `/agence/3c1d1e95…/parc` | 1280 | 1 | 556 | 105 | 24 | 228 | 0 | 969 | 57 |
| agent | `/agence/c14c3187…/incidents` | 1280 | 1 | 556 | 249 | 19 | 257 | 0 | 974 | 68 |
| agent | `/agence/c14c3187…/incidents/dd7fd8a3…` | 1280 | 1 | 552 | 260 | 37 | 266 | 0 | 1859 | 66 |
| superadmin | `/admin/comptes/d5fa4857…` | 1280 | 1 | 552 | 91 | 39 | 206 | 0 | 1247 | 66 |
| superadmin | `/admin/territoire` | 1280 | 1 | 552 | 83 | 31 | 194 | 0 | 1241 | 63 |
| proprietaire | `/agence/3c1d1e95…/statistiques` | 1280 | 1 | 544 | 116 | 26 | 203 | 0 | 940 | 50 |
| admin | `/agence/c14c3187…/parc/2b6de062…/lots/cfd9607a…` | 1280 | 1 | 544 | 116 | 22 | 238 | 0 | 1132 | 65 |
| agent | `/agence/c14c3187…/parc` | 1280 | 1 | 544 | 196 | 29 | 284 | 0 | 961 | 62 |
| agent | `/agence/c14c3187…/personnes` | 1280 | 1 | 544 | 213 | 21 | 291 | 0 | 1041 | 65 |
| superadmin | `/admin/brief` | 1280 | 1 | 540 | 111 | 48 | 199 | 0 | 1225 | 59 |
| artisan | `/artisan/devis/6e2a90ea…` | 390 | 5 | 540 | 114 | 22 | 231 | 0 | 691 | 34 |
| agent | `/agence/c14c3187…/parc/2b6de062…/lots/cfd9607a…` | 390 | 2 | 540 | 175 | 21 | 258 | 0 | 819 | 40 |
| agent | `/agence/c14c3187…/baux/b49b1542…/edl/83a8c4fb…` | 1280 | 4 | 538 | 150 | 24 | 255 | 0 | 974 | 60 |
| superadmin | `/admin/artisans` | 1280 | 1 | 536 | 109 | 48 | 202 | 0 | 1221 | 61 |
| superadmin | `/admin/marque-blanche` | 1280 | 1 | 536 | 66 | 31 | 201 | 0 | 1221 | 59 |
| superadmin | `/admin/brief` | 390 | 2 | 536 | 84 | 28 | 198 | 0 | 918 | 50 |
| admin | `/agence/c14c3187…/comptabilite` | 1280 | 1 | 532 | 100 | 20 | 198 | 0 | 957 | 61 |
| agent | `/agence/c14c3187…/documents/catalogue` | 1280 | 1 | 532 | 114 | 25 | 188 | 0 | 940 | 64 |
| superadmin | `/admin/organisations/c14c3187…` | 1280 | 1 | 532 | 89 | 37 | 184 | 0 | 1224 | 59 |
| superadmin | `/admin/publications` | 1280 | 1 | 532 | 98 | 36 | 194 | 0 | 1230 | 62 |
| public | `/` | 390 | 2 | 532 | 62 | 15 | 222 | 0 | 707 | 30 |
| agent | `/agence/c14c3187…/baux/b49b1542…` | 390 | 2 | 530 | 177 | 23 | 254 | 0 | 736 | 39 |
| proprietaire | `/agence/3c1d1e95…/documents/catalogue` | 1280 | 1 | 528 | 94 | 24 | 190 | 0 | 939 | 52 |
| admin | `/agence/c14c3187…/administration` | 1280 | 1 | 528 | 118 | 39 | 220 | 0 | 930 | 63 |
| admin | `/agence/c14c3187…/artisans` | 1280 | 1 | 528 | 87 | 23 | 185 | 0 | 942 | 62 |
| agent | `/agence/c14c3187…/comptabilite` | 1280 | 1 | 528 | 142 | 22 | 202 | 0 | 944 | 60 |
| proprietaire | `/agence/3c1d1e95…/loyers` | 390 | 2 | 526 | 92 | 21 | 179 | 0 | 638 | 34 |
| admin | `/agence/c14c3187…/baux/b49b1542…` | 390 | 2 | 526 | 184 | 26 | 276 | 0 | 734 | 39 |
| proprietaire | `/agence/3c1d1e95…/comptabilite` | 1280 | 1 | 524 | 97 | 21 | 187 | 0 | 964 | 53 |
| artisan | `/artisan/missions/20aa5305…/compte-rendu/bilan` | 1280 | 1 | 524 | 112 | 42 | 163 | 0 | 1807 | 72 |
| admin | `/agence/c14c3187…/personnes/5888f319…` | 1280 | 1 | 524 | 117 | 21 | 197 | 0 | 967 | 62 |
| superadmin | `/admin/publications/nouvelle` | 1280 | 1 | 524 | 83 | 33 | 211 | 0 | 1214 | 60 |
| superadmin | `/admin/relais` | 1280 | 1 | 524 | 67 | 34 | 189 | 0 | 1242 | 63 |
| superadmin | `/admin/consignes` | 1280 | 1 | 524 | 76 | 23 | 206 | 0 | 1230 | 60 |
| agent | `/agence/c14c3187…/incidents/dd7fd8a3…` | 390 | 2 | 524 | 266 | 42 | 272 | 0 | 1276 | 67 |
| agent | `/agence/c14c3187…/documents` | 390 | 2 | 522 | 174 | 24 | 234 | 0 | 642 | 40 |
| superadmin | `/admin/artisans` | 390 | 2 | 522 | 80 | 37 | 183 | 0 | 917 | 47 |
| proprietaire | `/agence/3c1d1e95…/profil` | 1280 | 1 | 520 | 123 | 36 | 268 | 0 | 963 | 51 |
| artisan | `/artisan/missions/20aa5305…/creneaux` | 1280 | 1 | 520 | 82 | 25 | 207 | 0 | 907 | 47 |
| agent | `/agence/c14c3187…/artisans` | 1280 | 1 | 520 | 127 | 19 | 209 | 0 | 939 | 62 |
| public | `/` | 1280 | 1 | 516 | 64 | 14 | 213 | 0 | 946 | 57 |
| locataire | `/locataire/c14c3187…/loyers` | 1280 | 1 | 516 | 89 | 26 | 207 | 0 | 904 | 42 |
| artisan | `/artisan/facturation` | 1280 | 1 | 516 | 67 | 28 | 191 | 0 | 908 | 42 |
| admin | `/agence/c14c3187…/mandats` | 1280 | 1 | 516 | 83 | 22 | 187 | 0 | 931 | 61 |
| admin | `/agence/c14c3187…/loyers` | 1280 | 1 | 516 | 91 | 20 | 194 | 0 | 941 | 57 |
| superadmin | `/admin/retours` | 1280 | 1 | 516 | 53 | 46 | 189 | 0 | 1221 | 58 |
| agent | `/agence/c14c3187…/baux/b49b1542…/edl/83a8c4fb…` | 390 | 5 | 516 | 160 | 28 | 269 | 0 | 669 | 35 |
| proprietaire | `/agence/3c1d1e95…/comptabilite/fiscal` | 390 | 2 | 514 | 92 | 22 | 184 | 0 | 630 | 35 |
| proprietaire | `/agence/3c1d1e95…/profil` | 390 | 2 | 514 | 115 | 30 | 219 | 0 | 659 | 34 |
| agent | `/agence/c14c3187…/loyers` | 390 | 2 | 514 | 132 | 20 | 213 | 0 | 634 | 35 |
| public | `/outils/calcul-irl` | 1280 | 1 | 512 | 26 | 13 | 189 | 0 | 797 | 44 |
| artisan | `/artisan/missions/20aa5305…/facture` | 1280 | 1 | 512 | 101 | 44 | 157 | 0 | 1804 | 79 |
| admin | `/agence/c14c3187…/comptabilite/reprise` | 390 | 2 | 512 | 115 | 25 | 210 | 0 | 640 | 37 |
| agent | `/agence/c14c3187…/parc/nouveau` | 1280 | 4 | 510 | 156 | 24 | 233 | 0 | 1102 | 63 |
| admin | `/agence/c14c3187…/administration` | 390 | 2 | 510 | 143 | 32 | 232 | 0 | 640 | 36 |
| admin | `/agence/c14c3187…/comptabilite` | 390 | 2 | 510 | 120 | 24 | 216 | 0 | 641 | 38 |
| proprietaire | `/agence/3c1d1e95…/faq` | 1280 | 1 | 508 | 105 | 25 | 210 | 0 | 964 | 47 |
| proprietaire | `/agence/3c1d1e95…/messages` | 1280 | 1 | 508 | 86 | 27 | 179 | 0 | 952 | 50 |
| admin | `/agence/c14c3187…/parc/nouveau` | 1280 | 1 | 508 | 105 | 25 | 214 | 0 | 1099 | 63 |
| agent | `/agence/c14c3187…/incidents/nouveau` | 1280 | 1 | 508 | 131 | 18 | 179 | 0 | 940 | 59 |
| agent | `/agence/c14c3187…/journal/e2e-gerer-une-location` | 1280 | 1 | 508 | 123 | 25 | 191 | 0 | 929 | 60 |
| agent | `/agence/c14c3187…/artisans` | 390 | 2 | 508 | 163 | 28 | 217 | 0 | 637 | 39 |
| agent | `/agence/c14c3187…/statistiques` | 390 | 2 | 508 | 131 | 22 | 208 | 0 | 623 | 34 |
| artisan | `/artisan/entreprise` | 390 | 2 | 506 | 74 | 21 | 179 | 0 | 612 | 38 |
| artisan | `/artisan/clients` | 390 | 2 | 506 | 75 | 26 | 174 | 0 | 606 | 37 |
| agent | `/agence/c14c3187…/parc/2b6de062…` | 390 | 2 | 506 | 140 | 26 | 240 | 0 | 824 | 43 |
| proprietaire | `/agence/3c1d1e95…/comptabilite/fiscal` | 1280 | 1 | 504 | 98 | 25 | 206 | 0 | 935 | 53 |
| proprietaire | `/agence/3c1d1e95…/incidents/nouveau` | 1280 | 1 | 504 | 84 | 24 | 169 | 0 | 945 | 50 |
| artisan | `/artisan/attestations` | 1280 | 1 | 504 | 86 | 26 | 206 | 0 | 914 | 46 |
| artisan | `/artisan/entreprise` | 1280 | 1 | 504 | 89 | 27 | 188 | 0 | 922 | 44 |
| superadmin | `/admin/clients` | 1280 | 1 | 504 | 56 | 45 | 182 | 0 | 1222 | 64 |
| agent | `/agence/c14c3187…/parc` | 390 | 2 | 504 | 142 | 22 | 212 | 0 | 655 | 37 |
| artisan | `/artisan/missions/20aa5305…/facture` | 390 | 2 | 502 | 106 | 46 | 170 | 0 | 1198 | 65 |
| agent | `/agence/c14c3187…/incidents/nouveau` | 390 | 2 | 502 | 119 | 20 | 210 | 0 | 638 | 34 |
| artisan | `/artisan/devis` | 1280 | 1 | 500 | 86 | 25 | 193 | 0 | 898 | 45 |
| agent | `/artisan/inscription` | 1280 | 1 | 500 | 76 | 26 | 174 | 0 | 607 | 26 |
| superadmin | `/admin/veille` | 390 | 2 | 500 | 72 | 26 | 196 | 0 | 920 | 48 |
| admin | `/agence/c14c3187…/alertes` | 390 | 2 | 498 | 96 | 22 | 200 | 0 | 643 | 34 |
| agent | `/agence/c14c3187…/incidents` | 390 | 2 | 498 | 249 | 24 | 276 | 0 | 670 | 38 |
| artisan | `/artisan/agenda` | 1280 | 1 | 496 | 80 | 25 | 189 | 0 | 895 | 45 |
| agent | `/agence/c14c3187…/journal` | 390 | 2 | 494 | 130 | 22 | 219 | 0 | 618 | 35 |
| public | `/outils/quittance-de-loyer` | 1280 | 1 | 492 | 21 | 19 | 146 | 0.0002 | 795 | 43 |
| artisan | `/artisan/missions/20aa5305…` | 390 | 2 | 492 | 72 | 23 | 180 | 0 | 602 | 34 |
| admin | `/agence/c14c3187…/profil` | 390 | 2 | 492 | 117 | 22 | 220 | 0 | 664 | 35 |
| superadmin | `/admin/publications` | 390 | 2 | 492 | 57 | 41 | 183 | 0 | 921 | 48 |
| artisan | `/artisan/note` | 390 | 2 | 490 | 74 | 24 | 166 | 0 | 600 | 32 |
| superadmin | `/admin/clients` | 390 | 2 | 490 | 58 | 26 | 177 | 0 | 924 | 55 |
| public | `/outils/simulateur-lmnp` | 1280 | 1 | 488 | 20 | 18 | 141 | 0 | 793 | 42 |
| proprietaire | `/agence/3c1d1e95…/journal` | 1280 | 1 | 488 | 70 | 21 | 152 | 0 | 928 | 51 |
| locataire | `/compte` | 1280 | 1 | 488 | 79 | 25 | 211 | 0 | 695 | 29 |
| agent | `/agence/c14c3187…/personnes/5888f319…` | 390 | 2 | 486 | 142 | 24 | 220 | 0 | 658 | 39 |
| superadmin | `/admin/publications/118ee48c…` | 390 | 2 | 482 | 82 | 30 | 170 | 0 | 937 | 48 |
| proprietaire | `/agence/3c1d1e95…/alertes` | 1280 | 1 | 480 | 113 | 26 | 206 | 0 | 944 | 50 |
| proprietaire | `/agence/3c1d1e95…/artisans` | 1280 | 1 | 480 | 72 | 27 | 182 | 0 | 943 | 52 |
| artisan | `/artisan/missions/20aa5305…/compte-rendu` | 1280 | 1 | 480 | 52 | 31 | 188 | 0 | 904 | 45 |
| public | `/outils/comparateur-gli-visale` | 390 | 2 | 478 | 8 | 8 | 156 | 0 | 652 | 30 |
| locataire | `/locataire/c14c3187…/faq` | 390 | 2 | 478 | 73 | 24 | 199 | 0 | 608 | 32 |
| artisan | `/artisan/missions/20aa5305…/creneaux` | 390 | 2 | 476 | 56 | 21 | 170 | 0 | 600 | 36 |
| agent | `/agence/c14c3187…/profil` | 390 | 2 | 474 | 140 | 26 | 224 | 0 | 658 | 35 |
| public | `/tarifs` | 1280 | 1 | 472 | 36 | 10 | 154 | 0 | 779 | 41 |
| locataire | `/quittance/15c960f2…` | 1280 | 1 | 472 | 50 | 35 | 172 | 0 | 594 | 21 |
| public | `/journal/e2e-gerer-une-location` | 390 | 2 | 472 | 24 | 19 | 166 | 0 | 632 | 29 |
| agent | `/agence/c14c3187…/journal/e2e-gerer-une-location` | 390 | 2 | 472 | 112 | 22 | 202 | 0 | 616 | 35 |
| artisan | `/artisan/regles` | 390 | 2 | 466 | 66 | 22 | 177 | 0 | 596 | 31 |
| admin | `/agence/c14c3187…/personnes` | 390 | 2 | 464 | 102 | 20 | 228 | 0 | 735 | 45 |
| public | `/tarifs` | 390 | 2 | 454 | 8 | 6 | 139 | 0 | 628 | 26 |
| locataire | `/veille?public=locataire` | 1280 | 1 | 448 | 26 | 20 | 160 | 0 | 572 | 23 |
| public | `/mentions-legales` | 1280 | 1 | 444 | 9 | 8 | 123 | 0 | 781 | 41 |
| admin | `/veille?public=agence` | 1280 | 1 | 424 | 29 | 23 | 151 | 0 | 569 | 23 |
| superadmin | `/admin/journaux` | 390 | 2 | 410 | 92 | 34 | 250 | 0 | 946 | 41 |
| admin | `/agence/c14c3187…/diagnostics/a750bf8c…` | 390 | 2 | 408 | 180 | 58 | 262 | 0 | 1438 | 70 |
| agent | `/agence/c14c3187…/lots/cfd9607a…?vers=caracteristiques` | 1280 | 1 | 404 | 245 | 60 | 370 | 0 | 2026 | 81 |
| proprietaire | `/agence/3c1d1e95…/incidents` | 390 | 2 | 394 | 111 | 22 | 224 | 0 | 658 | 40 |
| proprietaire | `/agence/3c1d1e95…/abonnement` | 390 | 2 | 392 | 134 | 36 | 236 | 0 | 639 | 33 |
| agent | `/agence/c14c3187…/diagnostics/a750bf8c…` | 390 | 2 | 392 | 175 | 44 | 248 | 0 | 1434 | 68 |
| proprietaire | `/agence/3c1d1e95…/comptabilite` | 390 | 2 | 390 | 114 | 22 | 234 | 0 | 644 | 36 |
| superadmin | `/admin/relais` | 390 | 2 | 390 | 88 | 24 | 216 | 0 | 934 | 46 |
| superadmin | `/admin/comptes/d5fa4857…` | 390 | 2 | 382 | 74 | 36 | 181 | 0 | 929 | 48 |
| superadmin | `/admin/territoire` | 390 | 2 | 378 | 84 | 28 | 200 | 0 | 932 | 48 |
| superadmin | `/admin` | 390 | 2 | 374 | 125 | 30 | 200 | 0 | 924 | 46 |
| superadmin | `/admin/organisations/c14c3187…` | 390 | 2 | 374 | 90 | 40 | 220 | 0 | 950 | 54 |
| proprietaire | `/agence/3c1d1e95…/parc` | 390 | 2 | 372 | 127 | 26 | 234 | 0 | 661 | 38 |
| superadmin | `/admin/equipes` | 390 | 2 | 372 | 56 | 32 | 188 | 0 | 928 | 46 |
| superadmin | `/admin/clients/artisans/a8bb5041…` | 390 | 2 | 370 | 82 | 29 | 216 | 0 | 938 | 50 |
| superadmin | `/admin/consignes` | 390 | 2 | 370 | 64 | 47 | 238 | 0 | 920 | 44 |
| artisan | `/artisan/missions/20aa5305…/compte-rendu/bilan` | 390 | 2 | 368 | 120 | 58 | 185 | 0 | 1198 | 63 |
| proprietaire | `/agence/3c1d1e95…/alertes` | 390 | 2 | 366 | 78 | 22 | 198 | 0 | 640 | 33 |
| artisan | `/artisan` | 390 | 2 | 366 | 92 | 32 | 182 | 0 | 592 | 35 |
| admin | `/agence/c14c3187…/comptabilite/reprise` | 1280 | 1 | 364 | 103 | 26 | 349 | 0 | 953 | 60 |
| superadmin | `/admin/parametres` | 390 | 2 | 364 | 66 | 36 | 193 | 0 | 978 | 45 |
| artisan | `/artisan/agenda` | 390 | 2 | 362 | 78 | 20 | 194 | 0 | 600 | 36 |
| proprietaire | `/agence/3c1d1e95…/statistiques` | 390 | 2 | 358 | 82 | 21 | 202 | 0 | 624 | 35 |
| artisan | `/artisan/missions/20aa5305…/compte-rendu` | 390 | 2 | 358 | 66 | 22 | 186 | 0 | 598 | 34 |
| admin | `/agence/c14c3187…/parc` | 390 | 2 | 358 | 192 | 24 | 247 | 0 | 666 | 39 |
| proprietaire | `/agence/3c1d1e95…/agenda` | 390 | 2 | 356 | 84 | 27 | 192 | 0 | 634 | 38 |
| agent | `/agence/c14c3187…/personnes` | 390 | 2 | 356 | 136 | 29 | 238 | 0 | 738 | 41 |
| artisan | `/artisan/facturation` | 390 | 2 | 352 | 81 | 22 | 180 | 0 | 602 | 33 |
| superadmin | `/admin/sante` | 390 | 2 | 352 | 64 | 31 | 190 | 0 | 930 | 44 |
| proprietaire | `/agence/3c1d1e95…/faq` | 390 | 2 | 350 | 88 | 22 | 185 | 0 | 646 | 34 |
| locataire | `/locataire/c14c3187…/incident` | 390 | 2 | 350 | 60 | 28 | 190 | 0 | 695 | 33 |
| admin | `/agence/c14c3187…/incidents` | 390 | 2 | 350 | 195 | 26 | 266 | 0 | 664 | 41 |
| proprietaire | `/agence/3c1d1e95…/incidents/nouveau` | 390 | 2 | 346 | 87 | 26 | 199 | 0 | 644 | 35 |
| admin | `/agence/c14c3187…/parc/2b6de062…` | 390 | 2 | 344 | 104 | 24 | 234 | 0 | 823 | 41 |
| superadmin | `/admin/publications/nouvelle` | 390 | 2 | 344 | 59 | 35 | 200 | 0 | 922 | 44 |
| public | `/journal` | 390 | 2 | 342 | 25 | 12 | 165 | 0 | 632 | 29 |
| proprietaire | `/agence/3c1d1e95…/personnes` | 390 | 2 | 342 | 102 | 20 | 194 | 0 | 732 | 40 |
| proprietaire | `/agence/3c1d1e95…/documents/catalogue` | 390 | 2 | 342 | 76 | 22 | 174 | 0 | 634 | 37 |
| proprietaire | `/agence/3c1d1e95…/documents` | 390 | 2 | 340 | 92 | 24 | 184 | 0 | 638 | 36 |
| admin | `/agence/c14c3187…/parc/2b6de062…/lots/cfd9607a…` | 390 | 2 | 338 | 142 | 27 | 263 | 0 | 824 | 40 |
| agent | `/agence/c14c3187…/comptabilite` | 390 | 2 | 338 | 140 | 26 | 218 | 0 | 644 | 39 |
| artisan | `/artisan/panne` | 390 | 2 | 334 | 68 | 26 | 186 | 0 | 592 | 32 |
| artisan | `/artisan/devis/nouveau` | 390 | 2 | 334 | 66 | 24 | 164 | 0 | 602 | 37 |
| admin | `/agence/c14c3187…/parc/import` | 390 | 2 | 334 | 92 | 27 | 198 | 0 | 629 | 33 |
| locataire | `/locataire/c14c3187…/demandes` | 390 | 2 | 332 | 68 | 22 | 185 | 0 | 621 | 32 |
| admin | `/agence/c14c3187…/baux/b49b1542…/edl/83a8c4fb…` | 390 | 2 | 332 | 126 | 24 | 222 | 0 | 674 | 35 |
| admin | `/agence/c14c3187…/loyers` | 390 | 2 | 332 | 79 | 20 | 187 | 0 | 636 | 34 |
| admin | `/agence/c14c3187…/agenda` | 390 | 2 | 330 | 101 | 24 | 225 | 0 | 633 | 37 |
| superadmin | `/admin/retours` | 390 | 2 | 330 | 64 | 38 | 186 | 0 | 916 | 44 |
| superadmin | `/admin/clients/artisans/a8bb5041…` | 1280 | 1 | 328 | 99 | 32 | 326 | 0 | 1242 | 59 |
| agent | `/agence/c14c3187…/documents/catalogue` | 390 | 2 | 328 | 105 | 22 | 192 | 0 | 632 | 38 |
| public | `/confidentialite` | 390 | 2 | 320 | 8 | 8 | 175 | 0 | 637 | 26 |
| admin | `/agence/c14c3187…/documents/catalogue` | 390 | 2 | 320 | 96 | 26 | 206 | 0 | 633 | 38 |
| admin | `/agence/c14c3187…/personnes/5888f319…` | 390 | 2 | 320 | 122 | 28 | 224 | 0 | 658 | 39 |
| locataire | `/locataire/c14c3187…/loyers` | 390 | 2 | 318 | 84 | 21 | 184 | 0 | 610 | 31 |
| admin | `/agence/c14c3187…/artisans` | 390 | 2 | 318 | 90 | 21 | 206 | 0 | 640 | 38 |
| locataire | `/locataire/c14c3187…/logement` | 390 | 2 | 316 | 86 | 24 | 176 | 0 | 642 | 33 |
| admin | `/agence/c14c3187…/statistiques` | 390 | 2 | 316 | 94 | 23 | 197 | 0 | 625 | 34 |
| locataire | `/compte` | 390 | 2 | 314 | 56 | 21 | 188 | 0 | 695 | 29 |
| admin | `/agence/c14c3187…/diagnostics/a750bf8c…` | 1280 | 1 | 312 | 162 | 57 | 284 | 0 | 2039 | 99 |
| public | `/conditions` | 390 | 2 | 312 | 14 | 12 | 192 | 0 | 661 | 30 |
| agent | `/agence/c14c3187…/alertes` | 390 | 2 | 312 | 122 | 23 | 225 | 0 | 640 | 34 |
| admin | `/agence/c14c3187…/incidents/nouveau` | 390 | 2 | 310 | 80 | 28 | 207 | 0 | 640 | 36 |
| public | `/outils/quittance-de-loyer` | 390 | 2 | 306 | 8 | 7 | 166 | 0 | 655 | 30 |
| admin | `/agence/c14c3187…/messages` | 390 | 2 | 306 | 96 | 22 | 195 | 0 | 642 | 37 |
| locataire | `/locataire/c14c3187…/documents` | 390 | 2 | 304 | 86 | 22 | 208 | 0 | 626 | 34 |
| agent | `/compte` | 390 | 2 | 304 | 44 | 22 | 178 | 0 | 679 | 27 |
| agent | `/agence/c14c3187…/messages` | 390 | 2 | 300 | 112 | 25 | 189 | 0 | 641 | 37 |
| agent | `/agence/c14c3187…/agenda` | 390 | 2 | 298 | 138 | 22 | 212 | 0 | 626 | 37 |
| admin | `/agence/c14c3187…/mandats` | 390 | 2 | 296 | 94 | 25 | 198 | 0 | 622 | 37 |
| locataire | `/locataire/c14c3187…/incident` | 1280 | 1 | 292 | 162 | 29 | 264 | 0 | 999 | 46 |
| admin | `/agence/c14c3187…/incidents` | 1280 | 1 | 292 | 203 | 20 | 270 | 0 | 974 | 68 |
| locataire | `/attestation-loyer/c14c3187…` | 390 | 2 | 292 | 52 | 34 | 175 | 0 | 623 | 29 |
| agent | `/assistance` | 390 | 2 | 286 | 36 | 23 | 172 | 0 | 611 | 26 |
| admin | `/agence/c14c3187…/incidents/nouveau` | 1280 | 1 | 284 | 124 | 26 | 262 | 0 | 939 | 59 |
| admin | `/agence/c14c3187…/incidents/dd7fd8a3…` | 1280 | 1 | 280 | 205 | 45 | 247 | 0 | 1881 | 100 |
| superadmin | `/admin/couverture` | 1280 | 1 | 280 | 82 | 41 | 264 | 0 | 1247 | 61 |
| public | `/outils/rentabilite-locative` | 390 | 2 | 280 | 8 | 7 | 161 | 0 | 652 | 29 |
| proprietaire | `/veille?public=bailleur` | 390 | 2 | 280 | 30 | 23 | 145 | 0 | 573 | 23 |
| admin | `/veille?public=agence` | 390 | 2 | 280 | 30 | 24 | 158 | 0 | 570 | 23 |
| superadmin | `/securite` | 390 | 2 | 280 | 28 | 19 | 156 | 0 | 737 | 31 |
| public | `/outils` | 390 | 2 | 278 | 8 | 7 | 160 | 0 | 675 | 32 |
| agent | `/veille?public=agence` | 390 | 2 | 278 | 32 | 26 | 162 | 0 | 572 | 23 |
| superadmin | `/relais` | 390 | 2 | 278 | 32 | 22 | 150 | 0 | 573 | 20 |
| locataire | `/locataire/c14c3187…/contact` | 1280 | 1 | 276 | 105 | 26 | 296 | 0 | 906 | 44 |
| agent | `/agence/c14c3187…/parc/2b6de062…` | 1280 | 1 | 276 | 110 | 29 | 253 | 0 | 1123 | 69 |
| proprietaire | `/agence/3c1d1e95…/loyers` | 1280 | 1 | 272 | 116 | 22 | 261 | 0 | 938 | 53 |
| admin | `/agence/c14c3187…/parc` | 1280 | 1 | 272 | 207 | 22 | 233 | 0 | 972 | 64 |
| superadmin | `/admin/journaux` | 1280 | 1 | 272 | 101 | 55 | 262 | 0 | 1253 | 53 |
| locataire | `/quittance/15c960f2…` | 390 | 2 | 272 | 42 | 28 | 162 | 0 | 594 | 21 |
| agent | `/agence/c14c3187…/agenda` | 1280 | 1 | 268 | 138 | 28 | 220 | 0 | 942 | 59 |
| public | `/mentions-legales` | 390 | 2 | 268 | 8 | 6 | 169 | 0 | 632 | 26 |
| admin | `/agence/c14c3187…/profil` | 1280 | 1 | 264 | 108 | 22 | 219 | 0 | 970 | 59 |
| admin | `/agence/c14c3187…/statistiques` | 1280 | 1 | 260 | 95 | 24 | 228 | 0 | 931 | 58 |
| superadmin | `/admin/marketing` | 1280 | 1 | 260 | 87 | 44 | 248 | 0 | 1246 | 58 |
| locataire | `/locataire/c14c3187…/faq` | 1280 | 1 | 256 | 89 | 22 | 225 | 0 | 907 | 42 |
| superadmin | `/admin/autonomie` | 1280 | 1 | 256 | 68 | 54 | 247 | 0 | 1234 | 58 |
| proprietaire | `/agence/3c1d1e95…` | 390 | 2 | 256 | 171 | 28 | 258 | 0 | 636 | 38 |
| admin | `/agence/c14c3187…/documents` | 1280 | 1 | 248 | 90 | 23 | 246 | 0 | 940 | 65 |
| admin | `/agence/c14c3187…/parc/import` | 1280 | 1 | 244 | 91 | 26 | 240 | 0 | 928 | 58 |
| admin | `/agence/c14c3187…/parc/2b6de062…` | 1280 | 1 | 244 | 93 | 23 | 240 | 0 | 1126 | 69 |
| admin | `/agence/c14c3187…/documents/catalogue` | 1280 | 1 | 240 | 104 | 25 | 230 | 0 | 937 | 64 |
| admin | `/agence/c14c3187…/incidents/dd7fd8a3…` | 390 | 2 | 238 | 249 | 50 | 272 | 0 | 1282 | 68 |
| agent | `/agence/c14c3187…/lots/cfd9607a…?vers=caracteristiques` | 390 | 2 | 238 | 248 | 63 | 327 | 0 | 1432 | 64 |
| artisan | `/artisan/devis/nouveau` | 1280 | 1 | 236 | 80 | 40 | 204 | 0 | 905 | 44 |
| superadmin | `/admin` | 1280 | 1 | 236 | 170 | 26 | 230 | 0 | 1227 | 58 |
| public | `/confidentialite` | 1280 | 1 | 232 | 12 | 11 | 232 | 0 | 791 | 41 |
| agent | `/agence/c14c3187…/journal` | 1280 | 1 | 232 | 142 | 30 | 233 | 0 | 917 | 60 |
| superadmin | `/admin/sante` | 1280 | 1 | 232 | 80 | 39 | 204 | 0 | 1230 | 56 |
| proprietaire | `/agence/3c1d1e95…/personnes` | 1280 | 1 | 228 | 85 | 22 | 226 | 0 | 1044 | 56 |
| admin | `/agence/c14c3187…/baux/b49b1542…` | 1280 | 1 | 228 | 133 | 21 | 265 | 0 | 1045 | 64 |
| admin | `/agence/c14c3187…/reseau` | 1280 | 1 | 228 | 91 | 21 | 200 | 0 | 935 | 58 |
| superadmin | `/admin/brief/exploitation` | 1280 | 1 | 228 | 72 | 39 | 205 | 0 | 1217 | 54 |
| artisan | `/artisan/clients` | 1280 | 1 | 224 | 91 | 31 | 208 | 0 | 901 | 44 |
| agent | `/agence/c14c3187…/profil` | 1280 | 1 | 224 | 105 | 24 | 223 | 0 | 969 | 59 |
| proprietaire | `/agence/3c1d1e95…/parc/nouveau` | 390 | 2 | 222 | 84 | 23 | 221 | 0 | 794 | 40 |
| proprietaire | `/agence/3c1d1e95…/parc/nouveau` | 1280 | 1 | 220 | 102 | 29 | 247 | 0 | 1098 | 57 |
| locataire | `/locataire/c14c3187…` | 1280 | 1 | 220 | 106 | 28 | 201 | 0 | 905 | 44 |
| superadmin | `/admin/veille` | 1280 | 1 | 220 | 48 | 36 | 188 | 0 | 1232 | 63 |
| proprietaire | `/agence/3c1d1e95…/agenda` | 1280 | 1 | 216 | 88 | 25 | 197 | 0 | 944 | 48 |
| admin | `/agence/c14c3187…/baux/b49b1542…/edl/83a8c4fb…` | 1280 | 1 | 216 | 109 | 30 | 223 | 0 | 969 | 60 |
| proprietaire | `/agence/3c1d1e95…/journal` | 390 | 2 | 214 | 93 | 28 | 213 | 0 | 626 | 34 |
| locataire | `/locataire/c14c3187…` | 390 | 2 | 214 | 156 | 50 | 266 | 0 | 610 | 31 |
| superadmin | `/admin/marketing` | 390 | 2 | 214 | 67 | 24 | 196 | 0 | 936 | 48 |
| superadmin | `/admin/marque-blanche` | 390 | 2 | 214 | 62 | 32 | 198 | 0 | 920 | 48 |
| admin | `/agence/c14c3187…/agenda` | 1280 | 1 | 212 | 90 | 21 | 196 | 0 | 954 | 60 |
| superadmin | `/admin/brief/exploitation` | 390 | 2 | 212 | 58 | 42 | 197 | 0 | 917 | 42 |
| superadmin | `/admin/organisations/nouvelle` | 1280 | 1 | 208 | 51 | 39 | 212 | 0 | 1238 | 63 |
| superadmin | `/admin/equipes` | 1280 | 1 | 208 | 80 | 41 | 229 | 0 | 1230 | 61 |
| proprietaire | `/agence/3c1d1e95…/messages` | 390 | 2 | 206 | 84 | 24 | 193 | 0 | 646 | 36 |
| superadmin | `/admin/autonomie` | 390 | 2 | 206 | 70 | 35 | 210 | 0 | 922 | 46 |
| proprietaire | `/agence/3c1d1e95…/documents` | 1280 | 1 | 200 | 86 | 24 | 206 | 0 | 943 | 51 |
| locataire | `/locataire/c14c3187…/demandes` | 1280 | 1 | 200 | 83 | 19 | 202 | 0 | 918 | 45 |
| locataire | `/locataire/c14c3187…/documents` | 1280 | 1 | 200 | 88 | 25 | 200 | 0 | 926 | 45 |
| artisan | `/artisan/note` | 1280 | 1 | 200 | 57 | 24 | 212 | 0 | 903 | 42 |
| agent | `/agence/c14c3187…/messages` | 1280 | 1 | 200 | 125 | 31 | 209 | 0 | 940 | 59 |
| proprietaire | `/agence/3c1d1e95…/journal/e2e-gerer-une-location` | 390 | 2 | 200 | 94 | 24 | 193 | 0 | 626 | 34 |
| public | `/auth/confirmer` | 1280 | 1 | 196 | 22 | 20 | 169 | 0 | 797 | 28 |
| locataire | `/locataire/c14c3187…/logement` | 1280 | 1 | 196 | 85 | 24 | 200 | 0 | 944 | 45 |
| admin | `/agence/c14c3187…/messages` | 1280 | 1 | 196 | 81 | 31 | 195 | 0 | 963 | 59 |
| superadmin | `/admin/devis` | 1280 | 1 | 196 | 54 | 38 | 196 | 0 | 1222 | 60 |
| superadmin | `/admin/organisations/nouvelle` | 390 | 2 | 196 | 61 | 36 | 198 | 0 | 923 | 49 |
| artisan | `/artisan/devis/6e2a90ea…` | 1280 | 4 | 194 | 92 | 25 | 204 | 0 | 1002 | 45 |
| proprietaire | `/agence/3c1d1e95…/incidents` | 1280 | 1 | 192 | 79 | 22 | 206 | 0 | 959 | 55 |
| artisan | `/artisan/missions/20aa5305…` | 1280 | 1 | 192 | 75 | 29 | 174 | 0 | 915 | 45 |
| agent | `/assistance` | 1280 | 1 | 192 | 43 | 26 | 220 | 0 | 621 | 26 |
| superadmin | `/admin/parametres` | 1280 | 1 | 188 | 55 | 31 | 181 | 0 | 1287 | 56 |
| artisan | `/artisan/attestations` | 390 | 2 | 188 | 64 | 24 | 178 | 0 | 609 | 36 |
| public | `/outils/comparateur-gli-visale` | 1280 | 1 | 184 | 29 | 25 | 204 | 0 | 797 | 43 |
| public | `/journal` | 1280 | 1 | 184 | 24 | 12 | 169 | 0 | 783 | 43 |
| proprietaire | `/agence/3c1d1e95…/journal/e2e-gerer-une-location` | 1280 | 1 | 184 | 60 | 23 | 183 | 0 | 923 | 51 |
| proprietaire | `/agence/3c1d1e95…/artisans` | 390 | 2 | 184 | 80 | 20 | 177 | 0 | 635 | 37 |
| artisan | `/artisan/devis` | 390 | 2 | 184 | 62 | 20 | 176 | 0 | 590 | 34 |
| superadmin | `/admin/devis` | 390 | 2 | 178 | 58 | 44 | 184 | 0 | 914 | 48 |
| artisan | `/artisan` | 1280 | 1 | 176 | 86 | 29 | 217 | 0 | 908 | 46 |
| artisan | `/artisan/panne` | 1280 | 1 | 176 | 56 | 26 | 186 | 0 | 896 | 42 |
| public | `/nouveau-mot-de-passe` | 390 | 5 | 176 | 11 | 10 | 102 | 0.3463 | 1315 | 58 |
| agent | `/artisan/inscription` | 390 | 2 | 172 | 42 | 24 | 176 | 0 | 599 | 26 |
| artisan | `/artisan/regles` | 1280 | 1 | 164 | 76 | 22 | 170 | 0 | 895 | 41 |
| admin | `/agence/c14c3187…/documents` | 390 | 2 | 162 | 92 | 22 | 224 | 0 | 639 | 40 |
| public | `/inscription` | 1280 | 1 | 160 | 20 | 18 | 174 | 0 | 787 | 25 |
| public | `/nouveau-mot-de-passe` | 1280 | 4 | 154 | 12 | 10 | 126 | 0.1056 | 1496 | 59 |
| public | `/connexion` | 1280 | 1 | 152 | 7 | 6 | 186 | 0.0439 | 907 | 38 |
| admin | `/agence/c14c3187…/reseau` | 390 | 2 | 152 | 101 | 28 | 222 | 0 | 628 | 35 |
| locataire | `/attestation-loyer/c14c3187…` | 1280 | 1 | 148 | 63 | 53 | 190 | 0 | 619 | 29 |
| agent | `/veille?public=agence` | 1280 | 1 | 148 | 48 | 30 | 176 | 0 | 574 | 23 |
| public | `/inscription` | 390 | 2 | 144 | 19 | 17 | 178 | 0 | 606 | 24 |
| locataire | `/locataire/c14c3187…/contact` | 390 | 2 | 144 | 68 | 25 | 186 | 0 | 610 | 32 |
| public | `/outils/calcul-irl` | 390 | 2 | 140 | 9 | 8 | 200 | 0 | 658 | 31 |
| public | `/outils/simulateur-lmnp` | 390 | 2 | 140 | 8 | 7 | 190 | 0 | 652 | 29 |
| public | `/conditions` | 1280 | 1 | 136 | 16 | 15 | 165 | 0 | 812 | 45 |
| public | `/mot-de-passe-oublie` | 1280 | 1 | 136 | 8 | 6 | 146 | 0 | 879 | 31 |
| locataire | `/veille?public=locataire` | 390 | 2 | 134 | 29 | 23 | 172 | 0 | 578 | 23 |
| public | `/mot-de-passe-oublie` | 390 | 2 | 122 | 8 | 6 | 158 | 0 | 695 | 30 |
| superadmin | `/relais` | 1280 | 1 | 120 | 30 | 21 | 165 | 0 | 571 | 20 |
| superadmin | `/securite` | 1280 | 1 | 112 | 26 | 19 | 163 | 0.0056 | 747 | 31 |
| public | `/outils` | 1280 | 1 | 108 | 27 | 8 | 176 | 0 | 889 | 56 |
| proprietaire | `/veille?public=bailleur` | 1280 | 1 | 108 | 27 | 21 | 138 | 0 | 572 | 23 |
| public | `/connexion` | 390 | 2 | 104 | 8 | 8 | 168 | 0 | 722 | 37 |
| public | `/journal/e2e-gerer-une-location` | 1280 | 1 | 100 | 23 | 20 | 196 | 0 | 781 | 42 |
| public | `/outils/rentabilite-locative` | 1280 | 1 | 96 | 25 | 18 | 183 | 0 | 791 | 42 |
| agent | `/compte` | 1280 | 1 | 96 | 56 | 25 | 205 | 0 | 689 | 27 |
| public | `/auth/confirmer` | 390 | 2 | 96 | 14 | 12 | 138 | 0 | 615 | 27 |

## Médiane par profil

| Profil | Larg. | Écrans | LCP méd. (ms) | LCP max | Doc méd. (ms) | Ko méd. | Req. méd. |
|---|---|---|---|---|---|---|---|
| admin | 390 | 29 | 334 | 602 | 102 | 642 | 38 |
| admin | 1280 | 29 | 292 | 604 | 105 | 957 | 61 |
| agent | 390 | 31 | 494 | 640 | 140 | 655 | 38 |
| agent | 1280 | 31 | 532 | 626 | 142 | 949 | 62 |
| artisan | 390 | 17 | 368 | 540 | 74 | 602 | 35 |
| artisan | 1280 | 17 | 480 | 524 | 82 | 907 | 45 |
| locataire | 390 | 12 | 309 | 478 | 68 | 616 | 32 |
| locataire | 1280 | 12 | 266 | 516 | 86 | 906 | 43 |
| proprietaire | 390 | 22 | 348 | 526 | 92 | 638 | 36 |
| proprietaire | 1280 | 22 | 496 | 568 | 96 | 944 | 51 |
| public | 390 | 18 | 279 | 532 | 8 | 652 | 30 |
| public | 1280 | 18 | 184 | 516 | 22 | 796 | 42 |
| superadmin | 390 | 28 | 371 | 566 | 66 | 924 | 47 |
| superadmin | 1280 | 28 | 304 | 564 | 78 | 1230 | 59 |

## Réseau et processeur dégradés (390 px)

Profil : 390x844 mobile, latence 150 ms, 1,6 Mbit/s descendant, 750 kbit/s montant, CPU x4, cache désactivé. Une mesure par écran (cache désactivé) ; un seul essai, sauf `/connexion` (voir PRF-01).

| Profil | Écran | FCP (ms) | LCP (ms) | CLS | Load (ms) | Ko |
|---|---|---|---|---|---|---|
| public | `/` | 1632 | 1780 | 0 | 2465 | 421 |
| public | `/connexion` | 1188 | 1188 | 0.212 | 2426 | 436 |
| public | `/outils/calcul-irl` | 1564 | 1564 | 0 | 2301 | 372 |
| proprietaire | `/agence/<PD>` | 1124 | 1976 | 0 | 2254 | 351 |
| proprietaire | `/agence/<PD>/parc` | 1124 | 1860 | 0 | 2459 | 374 |
| locataire | `/locataire/<ALPHA>` | 1216 | 1632 | 0 | 2154 | 326 |
| artisan | `/artisan` | 1120 | 1720 | 0 | 2064 | 309 |
| agent | `/agence/<ALPHA>` | 1188 | 1992 | 0 | 2511 | 474 |
| agent | `/agence/<ALPHA>/loyers` | 1184 | 1600 | 0 | 2251 | 344 |

Tous sous 2 500 ms de LCP. CLS > 0,1 : `/connexion` (0,212, 3 essais sur 3 avec réseau lent seul, 1 sur 3 avec processeur ×4 seul, 0 sans étranglement).

### CLS des 18 pages publiques, réseau lent seul (390 px)

`/` 0, `/conditions` 0, `/confidentialite` 0, `/tarifs` 0, `/outils` 0, `/outils/calcul-irl` 0, `/outils/quittance-de-loyer` 0, `/outils/comparateur-gli-visale` 0, `/outils/simulateur-lmnp` 0, `/outils/rentabilite-locative` 0, `/connexion` 0.212, `/inscription` 0, `/journal` 0, `/journal/e2e-gerer-une-location` 0, `/mentions-legales` 0, `/mot-de-passe-oublie` 0, `/nouveau-mot-de-passe` 0, `/auth/confirmer` 0

## Répétition ×3 des cinq écrans les plus lents (plus `/nouveau-mot-de-passe`)

Choisis d'après le LCP le plus élevé des deux premières passes (un écran par ligne, distinct). Trois chargements à froid par largeur.

| Profil | Écran | Larg. | LCP (ms) ×3 | Document (ms) ×3 | CLS ×3 | Ko ×3 | Req. |
|---|---|---|---|---|---|---|---|
| public | `/nouveau-mot-de-passe` | 390 | 160, 140, 176 | 13, 9, 10 | 0.346, 0.346, 0.346 | 1316, 1310, 1314 | 58 |
| artisan | `/artisan/devis/6e2a90ea…` | 390 | 600, 372, 540 | 137, 70, 114 | 0, 0, 0 | 691, 691, 688 | 34 |
| agent | `/espaces` | 390 | 640, 608, 668 | 257, 168, 174 | 0, 0, 0 | 1373, 1370, 1375 | 63 |
| agent | `/agence/c14c3187…/parc/nouveau` | 390 | 608, 600, 656 | 125, 160, 129 | 0, 0, 0 | 795, 794, 799 | 38 |
| agent | `/agence/c14c3187…` | 390 | 644, 632, 616 | 169, 204, 154 | 0, 0, 0 | 757, 759, 766 | 38 |
| agent | `/agence/c14c3187…/baux/b49b1542…/edl/83a8c4fb…` | 390 | 216, 204, 516 | 144, 160, 159 | 0, 0, 0 | 668, 668, 670 | 35 |
| public | `/nouveau-mot-de-passe` | 1280 | 160, 148, 144 | 19, 13, 12 | 0.106, 0.106, 0.106 | 1497, 1495, 1492 | 59 |
| artisan | `/artisan/devis/6e2a90ea…` | 1280 | 216, 192, 192 | 92, 93, 67 | 0, 0, 0 | 994, 1004, 998 | 45 |
| agent | `/espaces` | 1280 | 628, 644, 592 | 207, 176, 172 | 0, 0, 0 | 1730, 1730, 1734 | 73 |
| agent | `/agence/c14c3187…/parc/nouveau` | 1280 | 528, 512, 464 | 157, 182, 154 | 0, 0, 0 | 1103, 1100, 1092 | 63 |
| agent | `/agence/c14c3187…` | 1280 | 268, 644, 612 | 155, 184, 202 | 0, 0, 0 | 1154, 1155, 1138 | 63 |
| agent | `/agence/c14c3187…/baux/b49b1542…/edl/83a8c4fb…` | 1280 | 284, 520, 556 | 139, 124, 160 | 0, 0, 0 | 976, 971, 978 | 60 |

Lecture : la dispersion d'un même écran (jusqu'à ×3 entre deux chargements, ex. 268 à 644 ms) est aussi grande que l'écart entre écrans : le classement des 15 écrans les plus lents n'est pas significatif. La cause commune est le LCP porté par l'`<aside>` (image de fond de 298 Ko, voir PRF-05), pas un écran particulier.

## Liens

- Sources : `a[href]` relevés sur les 157 écrans de la matrice à 1280 px et à 390 px (mobile), dédupliqués par profil ; 733 URL internes uniques suivies en GET avec la session du profil (redirections suivies à la main, 10 sauts au plus, détection de boucle).
- Résultat : **0 réponse 404/5xx, 0 boucle, 0 erreur réseau** ; 733 réponses finales en 200.
- Liens `?action=` : les liens de la page d'assistance (`/assistance?ecran=…&action=navigation|lien…`) sont des paramètres de contexte d'une page en lecture seule (vérifié dans `assistance/contenu-assistance.tsx` : `action` n'est utilisé que pour étiqueter la demande) ; par prudence, 3 par profil seulement ont été ouverts, les 105 autres ne l'ont pas été. L'export comptable `/comptabilite/export` (lecture seule dans le code) a été ouvert en GET.
- Aucun lien sortant ouvert : forme vérifiée seulement (10 URL externes, toutes en https, bien formées). `mailto:` : 1 (adresse bien formée) ; `tel:` : 2 (`tel:0800473333`, `tel:112`, bien formés).
- Ancres : aucune ancre de même page absente (0 sur l'ensemble des pages). Une ancre signalée par le crawl (`/#contact` depuis `/admin/devis`) est un faux positif d'outil : l'élément `id="contact"` existe sur l'accueil public, mais un super-administrateur connecté est redirigé avant d'y arriver (voir PRF-07).

## Redirections serveur (307) rencontrées

| Profil | Lien | Page d'origine | Texte du lien | Destination |
|---|---|---|---|---|
| public | `/assistance` | `/confidentialite` | « Aide et retours » | `/connexion?suite=%2Fassistance` |
| locataire | `/mot-de-passe-oublie` | `/compte` | le lien reçu par email | `/espaces` |
| agent | `/mot-de-passe-oublie` | `/compte` | le lien reçu par email | `/espaces` |
| superadmin | `/` | `/admin/devis` | Voir le formulaire sur le site | `/espaces` |

## Redirections côté client (réponse 200 contenant une redirection)

Normales (retour à l'accueil de l'espace ou détail vers liste) sauf mention.

| Profil | Lien | Page d'origine | Texte | Destination | Avis |
|---|---|---|---|---|---|
| proprietaire | `/assistance?ecran=%2Fagence%2F%5Bdossier%5D%2Fabonnement&action=lien&r` | `/agence/3c1d1e95…/abonnement` | Contacter Gerimmo | `/agence/3c1d1e95…/faq?ecran=%2Fagence%2F%5Bdossier` | normal |
| proprietaire | `/espaces` | `/veille?public=bailleur` | ← Revenir à mon espace | `/agence/3c1d1e95…` | normal |
| locataire | `/mot-de-passe-oublie` | `/compte` | le lien reçu par email | `/locataire/c14c3187…` | PRF-06 |
| locataire | `/espaces` | `/veille?public=locataire` | ← Revenir à mon espace | `/locataire/c14c3187…` | normal |
| admin | `/espaces` | `/veille?public=agence` | ← Revenir à mon espace | `/agence/c14c3187…` | normal |
| admin | `/agence/c14c3187…/incidents/dd7fd8a3…` | `/agence/c14c3187…` | ⚠
Incident déclaré — E2E Deman | `/agence/c14c3187…/incidents?sel=dd7fd8a3…` | normal |
| admin | `/agence/c14c3187…/incidents/d76f72a8…` | `/agence/c14c3187…` | ⚠
Incident déclaré — E2E Fuite | `/agence/c14c3187…/incidents?sel=d76f72a8…` | normal |
| agent | `/agence/c14c3187…/incidents/dd7fd8a3…` | `/agence/c14c3187…` | ⚠
Incident déclaré — E2E Deman | `/agence/c14c3187…/incidents?sel=dd7fd8a3…` | normal |
| agent | `/agence/c14c3187…/incidents/d76f72a8…` | `/agence/c14c3187…` | ⚠
Incident déclaré — E2E Fuite | `/agence/c14c3187…/incidents?sel=d76f72a8…` | normal |
| agent | `/espaces` | `/assistance` | Mes espaces | `/agence/c14c3187…` | normal |
| agent | `/artisan` | `/artisan/inscription` | Accueil de mon espace artisan | `/artisan/inscription` | normal |
| agent | `/mot-de-passe-oublie` | `/compte` | le lien reçu par email | `/agence/c14c3187…` | PRF-06 |
| superadmin | `/` | `/admin/devis` | Voir le formulaire sur le site | `/admin/brief` | PRF-07 |
| superadmin | `/espaces` | `/relais` | ← Mes espaces | `/admin/brief` | normal |

Le lien `/assistance` de `/confidentialite` (visiteur anonyme) fait l'objet de PRF-08 : redirection 307 vers `/connexion?suite=%2Fassistance`.

## Liens factices

- `href="#"` « Retour à mes fiches » sur `/agence/<id>/personnes` (propriétaire, administrateur, agent) : lien masqué par défaut, dans la section « Créer une fiche » ; voir PRF-09.

## Liens sortants (forme)

- `https://www.cnil.fr/` — depuis `/confidentialite` (public) — forme correcte
- `https://www.insee.fr/fr/statistiques/serie/001515333` — depuis `/outils/calcul-irl` (public) — forme correcte
- `https://www.visale.fr/` — depuis `/outils/comparateur-gli-visale` (public) — forme correcte
- `https://www.impots.gouv.fr/sites/default/files/formulaires/2044/2026/2044_5487.pdf` — depuis `/agence/3c1d1e95…/comptabilite/fiscal` (proprietaire) — forme correcte
- `https://www.travaux.com/plomberie/guide-des-prix/prix-de-linstallation-dun-robinet` — depuis `/artisan/devis/6e2a90ea…` (artisan) — forme correcte
- `https://www.google.com/maps/search/?api=1&query=18%20rue%20des%20Acacias%2C%2075012%20Paris` — depuis `/artisan/missions/20aa5305…/facture` (artisan) — forme correcte
- `https://github.com/GERIMMO/GERIMMO_V4/actions/workflows/sauvegarde.yml` — depuis `/admin/sante` (superadmin) — forme correcte
- `https://www.anil.org/analyses-juridiques/` — depuis `/admin/veille` (superadmin) — forme correcte
- `https://www.legifrance.gouv.fr/` — depuis `/admin/veille` (superadmin) — forme correcte
- `https://github.com/GERIMMO/GERIMMO_V4/actions/workflows/atelier-code.yml` — depuis `/admin/equipes` (superadmin) — forme correcte

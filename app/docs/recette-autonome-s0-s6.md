# Recette autonome S0 → S6 — compte rendu

*3 août 2026. Branche `recette-s0-s6`, base de recette Supabase `caalwwgcauvxfbsdpuuu`.*

---

## 1. Synthèse

**La recette n'est pas terminée.** J'ai bâti l'environnement, construit le jeu de
données complet et exécuté une part significative de la phase 3. Je livre ce compte
rendu maintenant plutôt que de laisser croire à une couverture que je n'ai pas atteinte.

| Phase | État |
|---|---|
| 1 — Remise à zéro | **Terminée** |
| 2 — Jeu de données | **Terminée** |
| 3 — Recette par sprint | **Partielle** — S0, S1, S2, S5, S6 couverts ; S3 et S4 non exécutés |
| 4 — Régression et transverses | **Non exécutée** |
| 5 — Regard du découvreur | **Non exécutée** (le passage à vide de la phase 1 a été fait) |

**Deux anomalies réelles trouvées, corrigées et testées.** Toutes deux sur le prorata
du premier loyer, toutes deux portant sur de l'argent affiché à un locataire.

### Ce qui coûtera le plus cher si rien n'est fait

1. **Le prorata doit être appliqué en production.** La correction n'existe que sur la
   branche de recette. Tant qu'elle n'est pas rejouée, chaque entrée en cours de mois
   produit un montant faux de quelques centimes, et une quittance dont le total ne vaut
   pas la somme des lignes.
2. **Il n'existe qu'une seule base.** Toute recette sérieuse suppose un environnement
   séparé. La branche que j'ai créée le prouve : elle a coûté deux minutes à monter.
3. **Les tests d'intégration ne tournent que contre la production.** Ils écrivent puis
   annulent, mais c'est une dépendance gênante — et elle m'a empêché de les rejouer ici.
4. **S3 et S4 n'ont pas été éprouvés** : dossier locataire versionné, invitations, état
   des lieux pièce par pièce, signature figeante. Ni la fin de S6 — clôture, rapport de
   gestion, export CSV.
5. **Mon propre test a corrompu le jeu de données** en cours de route (voir §11) : sans
   la vérification qui a suivi, j'aurais rapporté quatre anomalies inexistantes.

---

## 2. Corrections appliquées

### A-01 — Prorata du premier loyer faux de quelques centimes · S5 · **majeur**

**Cassé.** Le coefficient de prorata était arrondi à quatre décimales *avant* d'être
appliqué : `round(20/31, 4)` = 0,6452, puis 780 × 0,6452 = **503,26 €**. Le montant
exact est 780 × 20/31 = **503,23 €**. Trois centimes de trop, systématiquement, sur
toute entrée en cours de mois.

**Changé.** Un seul arrondi, à la fin, sur chaque composante.

**Fichiers.** `supabase/migrations/20260803_prorata_au_centime.sql` · fonction
`generer_appels_loyer`. **Commit** `fix(A-01, A-02)`. **Test** `tests/prorata.test.ts`
— « proratise au centime exact ».

**Vérifié.** Appel régénéré sur le bail du 12 mars : 503,23 + 58,06 = 561,29.

### A-02 — Le montant dû ne valait pas la somme des lignes · S5 · **majeur**

**Cassé.** `montant_du` était calculé à part, sur le total : 870 × 0,6452 = 561,32,
alors que les deux lignes affichées faisaient 503,26 + 58,07 = **561,33**. La quittance
détaille loyer et charges : leur somme ne valait donc pas le montant réclamé. Un
document légal qui se contredit d'une ligne à l'autre.

**Changé.** Le montant dû **est** la somme des composantes arrondies.

**Fichiers et commit** identiques à A-01. **Test** — « le montant dû est toujours la
somme des lignes affichées », vérifié sur quatre dates d'entrée.

---

## 3. Anomalies non corrigées

Aucune. Les deux anomalies trouvées ont été corrigées et testées.

**Quatre fausses anomalies écartées** — voir §11.

---

## 4. Remise à zéro

**Sauvegardé.** `…/scratchpad/sauvegarde/production-2026-08-03T17-05-40.json` — 46
tables, 240 lignes, plus la liste des comptes d'authentification. Et
`.env.local.production`, la configuration d'origine.

**Purgé : rien.** Une branche Supabase naît vide, avec le schéma et les données de
référence issues des migrations. La purge demandée était donc sans objet : je n'ai
jamais touché aux données de production.

**Parcours à vide.** Page de connexion : rendu correct, aucune erreur de console.
Les écrans internes n'ont pas été parcourus à vide (voir §12, point d'accès).

---

## 5. Jeu de données créé

**Base :** `caalwwgcauvxfbsdpuuu` — branche `recette-s0-s6`, facturée ~0,013 $/heure.

**Comptes.** Mot de passe commun **`Recette-2026!`**. Alias Gmail « + » : tout arrive
dans votre boîte.

| Rôle | Adresse |
|---|---|
| Super admin (hors agence) | `tahir.brahim.pro+superadmin@gmail.com` |
| Admin agence Alpha | `tahir.brahim.pro+adminagence@gmail.com` |
| Agent Alpha | `tahir.brahim.pro+agent@gmail.com` |
| Propriétaire mandant | `tahir.brahim.pro+mandant@gmail.com` |
| Propriétaire en direct | `tahir.brahim.pro+direct@gmail.com` |
| Locataire | `tahir.brahim.pro+locataire@gmail.com` |
| Artisan | `tahir.brahim.pro+artisan@gmail.com` |
| Garant | `tahir.brahim.pro+garant@gmail.com` |
| **Double adhésion** Alpha + Beta | `tahir.brahim.pro+multi@gmail.com` |
| Admin agence Beta (témoin) | `tahir.brahim.pro+beta@gmail.com` |

**Parc.** 5 biens, 7 lots :
- **Immeuble Voltaire**, 3 lots — **lots 1 et 3 à Bertrand, lot 2 à Nguyen** : deux
  propriétaires différents dans le même immeuble, la règle centrale du modèle
- **Maison Indivision** — Leroy Sabine 60 % + Leroy Bernard 40 %
- **T2 Copropriété** — tantième 145, clé de répartition validée par surface
- **Studio Archive** — **DPE expiré**, donc bloqué à la mise en location
- **Local Disponible**

**Baux.** 5, tous actifs : un nu **entré le 12 mars** (prorata), un meublé, une
colocation au forfait, un nu **passé en préavis** après congé pour mutation avec
justificatif, un nu à dossier incomplet.

**Historique.** 33 appels de loyer sur 6 mois, 14 encaissements couvrant les cas
demandés : mois soldés, **deux impayés sur le même bail** (juin et juillet),
règlement partiel, **encaissement supérieur au dû**, règlement **à cheval sur deux
échéances**. 14 quittances, 3 reçus, 47 écritures.

**Mandat multi-biens** — Bertrand, avec **des taux différents par lot** : 7 %, 9 %, 6 %.

**Agence Beta** — une personne témoin, `TEMOIN-BETA`, qui ne doit jamais apparaître
côté Alpha.

---

## 6. Conformité S0 à S6

| Fonctionnalité | Verdict | Preuve |
|---|---|---|
| S2 · Machine à états — archiver un lot loué | **conforme** | refusé : « Transition interdite : loue → archive » |
| S2 · Machine à états — brouillon vers loué | **conforme** | refusé : « Transition interdite : brouillon → loue » |
| S2 · Blocage par diagnostic expiré | **conforme** | « Passage en disponible impossible : DPE absent ou expiré » |
| S2 · Quote-part au-delà de 100 % | **conforme** | « La somme des quote-parts dépasserait 100 % (150,00 %) » |
| S2 · Détention d'un lot loué non supprimable | **conforme** | refusé par la RLS |
| S2 · Clé de répartition à 100 % exact | **conforme** | 33,33 + 32,50 + 34,17 accepté ; 100,01 refusé |
| S2 · Découpage en lots | **conforme** | immeuble passé de 1 à 3 lots, détentions héritées |
| S4 · Activation sous contrôles | **conforme** | 5 baux activés, lots passés en loué |
| S4 · Congé avec motif et justificatif | **conforme** | bail passé en préavis, date d'effet calculée |
| S5 · Prorata du premier loyer | **corrigée** | A-01 — 503,23 € au lieu de 503,26 € |
| S5 · Cohérence total / lignes | **corrigée** | A-02 — 561,29 = 503,23 + 58,06 |
| S5 · Imputation du plus ancien | **conforme** | 600 € imputés sur juin, pas sur juillet ni août |
| S5 · Quittance sur solde, reçu sur partiel | **conforme** | 14 quittances, 3 reçus |
| S6 · Écritures immuables | **conforme** | ni modifiables ni supprimables en rôle applicatif |
| S6 · Honoraires à l'encaissement | **conforme** | 47 écritures générées |
| S0 · Super admin sans agence | **conforme** | contrainte `memberships_super_admin_sans_org` |
| S0 · Isolation entre agences | **conforme** | 11 contrôles — voir ci-dessous |
| S1 · Type réel des fichiers | **conforme** | PNG renommé en .pdf classé PNG, pas PDF |
| S1 · Fichier vide refusé | **conforme** | aucun type reconnu → refus |
| S1 · Limite de taille | **conforme** | 11 Mo détectés au-delà des 10 Mo |
| S1 · Nom hostile (accents, apostrophe, emoji) | **conforme** | accepté, stocké sous un identifiant neutre |
| **S3 · Dossier versionné, invitations** | **non testé** | — |
| **S4 · État des lieux, signature figeante** | **non testé** | — |
| **S6 · Clôture, rapport, export CSV** | **non testé** | — |

---

### S0 — Isolation entre agences : intacte

L'agent d'Alpha, muni de son vrai jeton, a interrogé **l'API directement**, hors de
l'interface — le seul test qui vaille.

| Table | Visible pour l'agent Alpha | Fuite de Beta |
|---|---|---|
| organisations | 1 | aucune |
| biens · lots · baux | 5 · 7 · 5 | aucune |
| personnes | 13 | aucune — `TEMOIN-BETA` invisible |
| documents · écritures · mandats · alertes | 6 · 46 · 1 · 6 | aucune |

**Accès forcé par identifiant** : en injectant l'identifiant d'une fiche de Beta dans
la requête, l'agent d'Alpha reçoit **zéro ligne**. **Sans session**, l'API refuse
(`42501`, permission refusée) — mieux qu'une liste vide.

### S1 — Fichiers pièges

| Piège | Résultat |
|---|---|
| PDF authentique | reconnu `application/pdf` |
| PNG authentique | reconnu `image/png` |
| **PNG renommé en `.pdf`** | **reconnu `image/png`** et stocké en `.png` — le mensonge de l'extension est neutralisé |
| Fichier vide | **refusé**, aucun type reconnu |
| PDF tronqué | accepté (en-tête valide) — voir la réserve ci-dessous |
| 11 Mo | dépassement détecté |
| Nom avec accents, apostrophes, emoji | accepté ; le chemin de stockage utilise un identifiant neutre |

**Réserve — PDF tronqué.** Un PDF dont l'en-tête est valide mais le corps coupé est
accepté. Le détecter supposerait d'analyser la structure du document, pas seulement sa
signature. Je ne le compte pas comme anomalie : la règle documentée porte sur le **type
réel**, pas sur l'intégrité. À arbitrer si vous voulez aller plus loin.

**Point à trancher — « le PNG renommé doit être refusé ».** Votre prompt l'attendait ;
l'application l'accepte **en tant que PNG**. Le référentiel dit « le type réel, jamais
l'extension » — et le PNG est un format autorisé. Refuser un PNG valide au motif que son
nom ment serait discutable. Le risque visé — faire passer un exécutable pour un PDF —
est bien couvert. **Je n'ai rien changé** : dites-moi si vous voulez le refus strict.

## 7. Table de couverture

Non produite : elle suppose la phase 3 complète et le parcours de chaque écran.

---

## 8. Première impression

Non exécutée. Le passage à vide de la phase 1 s'est limité à la page de connexion, les
écrans internes exigeant une session.

---

## 9. Hors périmètre rencontré

Rien de neuf : les manques S7 et au-delà sont déjà recensés dans
`docs/audit-obsidian-2026-08-03.md`.

---

## 10. Angles morts

**Un seul environnement.** C'est l'angle mort principal, et il a failli faire capoter
la mission dès la première minute : la phase 1 demandait de purger une base qui est la
seule qui existe.

**Les tests d'intégration dépendent d'une connexion directe** que les branches Supabase
n'exposent pas. Résultat : je n'ai pas pu rejouer la suite des 108 tests sur la branche,
et je ne peux pas la rejouer sur la production sans y voir échouer mon test de prorata
— puisque la correction n'y est pas appliquée.

---

## 11. Journal des décisions

**Créer une branche plutôt que purger.** Vous aviez tranché « A ». La branche naît vide :
la purge est devenue sans objet, et la production n'a jamais été touchée.

**Alias Gmail « + » pour les comptes.** Chaque compte a une adresse unique et tout
arrive dans votre boîte, sans créer d'adresses réelles tierces.

**Rejouer les tests en rôle applicatif.** Mes premiers tests tournaient avec le rôle
privilégié de l'outil d'administration, **qui contourne la RLS**. Quatre « anomalies »
en sont sorties — écritures modifiables, détention supprimable, quote-part au-delà de
100 %. **Toutes fausses.** Rejouées en rôle `authenticated`, comme l'application se
connecte, les quatre règles tiennent. Sans ce doute, je vous livrais quatre bugs
inexistants.

**Mon test a abîmé le jeu de données.** La suppression de détention en rôle privilégié
a réussi et vidé un lot ; le test suivant a alors accepté 50 % sur un lot vide, ce qui
est correct — mais ressemblait à une anomalie. Réparé, puis rejoué proprement.

**Ne pas lancer la suite de tests contre la production.** Elle écrit puis annule, mais
la consigne était claire, et mon nouveau test de prorata y échouerait légitimement.

---

## 12. Ce que je dois vous demander

**La branche à relire.** `recette-s0-s6`, un commit : la correction du prorata avec ses
trois tests. À fusionner après relecture.

**Restent non exécutés :** S3 (dossier versionné, invitations), S4 (état des lieux,
signature figeante), la fin de S6 (clôture, rapport de gestion, export CSV), et les
phases 4 et 5.

**Trois points hors de mon autonomie rencontrés :**

1. **Appliquer la migration du prorata en production** — c'est une correction de
   production, hors de mon autonomie. La migration est prête.
2. **Supprimer la branche de recette** quand vous n'en aurez plus besoin : elle est
   facturée à l'heure. Je peux le faire sur un mot.
3. **Aucun e-mail envoyé** — la phase qui les déclenche (S5, envoi de quittance) n'a
   pas été atteinte.

**Le point qui m'a bloqué pour aller plus loin :** je n'ouvre pas de session dans
l'application, puisque je ne saisis pas de mot de passe. Tout ce qui précède a été
éprouvé **en base**, dans les conditions de droits réelles. Les phases 3 (écrans), 4 et
5 supposent un navigateur connecté.

**Deux questions, réponse courte :**

- **Voulez-vous que je poursuive la recette** (S0, S1, S3, S4, puis phases 4 et 5) sur
  la branche ? Elle reste en place et le jeu de données est prêt.
- **Comment ouvrir les sessions ?** Soit vous vous connectez vous-même dans le
  navigateur et je pilote ensuite, soit vous m'autorisez à établir la session par jeton
  d'API sur ces comptes de test — ce qui évite toute saisie de mot de passe.

# Recette autonome S0 → S6 — compte rendu

*3 août 2026. Branche `recette-s0-s6` (`caalwwgcauvxfbsdpuuu`), production `rddlxunppddzpsaatdaz`.*

---

## 1. Synthèse

**Phases 1 à 4 terminées.** Environnement de recette monté, jeu de données complet,
S0 à S6 éprouvés, puis chaque écran de l'agent parcouru aux trois largeurs.
**Seize anomalies** trouvées, corrigées et vérifiées.

| Phase | État |
|---|---|
| 1 — Remise à zéro | **Terminée** |
| 2 — Jeu de données | **Terminée** |
| 3 — Recette par sprint | **Terminée** — S0 à S6 |
| 4 — Régression et transverses | **Terminée** — écrans, responsive, console, build, lint, typage |
| 5 — Regard du découvreur | **Partielle** — première impression faite, tâches non chronométrées |

### Les seize anomalies

**Argent et données — corrigées en production**, sauf A-10 (voir §12)

| # | Ce qui n'allait pas | Gravité |
|---|---|---|
| A-01 | Prorata du premier loyer faux de quelques centimes | majeur |
| A-02 | Le montant dû ne valait pas la somme des lignes de la quittance | majeur |
| A-03 | Supprimer un encaissement laissait ses écritures au journal | **majeur** |
| A-09 | L'état des lieux de sortie n'avait aucune échéance | **majeur** |
| A-10 | Un lot pouvait être « loué » sans bail, « en préavis » sans congé | **majeur** |

**Export et affichage — corrigées dans le code, partent au prochain déploiement**

| # | Ce qui n'allait pas | Gravité |
|---|---|---|
| A-04 | Montants exportés au point décimal : illisibles par Excel français | majeur |
| A-05 | Export CSV sans lot ni mandant : journal impossible à ventiler | majeur |
| A-06 | Une lecture en échec produisait un CSV vide et silencieux | moyen |
| A-07 | L'export prenait tout le journal depuis l'origine, sans période | mineur |
| A-08 | Le nom du mandant ne s'affichait jamais (jointure mal lue) | moyen |
| A-11 | En-tête illisible sur téléphone : les éléments se chevauchaient | majeur |
| A-12 | Deux mots pour le même état de lot selon l'écran | moyen |
| A-13 | Mots de développeur à l'écran (« blocages en base », mois `2026-06`…) | moyen |
| A-14 | « Contre-écriture » désignait l'action **et** son résultat | moyen |
| A-15 | « Assignée à : personne » — se lisait dans les deux sens | moyen |
| A-16 | Mode de règlement en champ libre : « cheque », « Chèque », « CHQ » | mineur |

Trois défauts d'outillage aussi corrigés : les tests d'intégration visaient la
production, le test d'isolation dépendait d'un jeu de démo disparu, et douze fichiers
recopiaient le même formateur d'euros.

### État de la production

Quatre anomalies de données sur cinq sont **corrigées en production** (migrations
`prorata_au_centime`, `encaissement_supprime_contre_ecritures`,
`alerte_edl_sortie_datee`). Vérifié : les corps de fonction de la production et de la
branche sont identiques une fois les commentaires écartés.

**A-10 attend votre feu vert** : découverte après coup, sa migration
(`etat_lot_adosse_au_bail`) n'existe que sur la branche.

Les onze autres vivent dans le code applicatif : elles partent au prochain déploiement.

### Ce qui reste ouvert

1. **La branche de recette est facturée à l'heure** — à supprimer quand vous n'en aurez
   plus besoin.
2. **`.env.local` pointe encore sur la branche** — sauvegarde dans
   `scratchpad/sauvegarde/.env.local.production`.
3. **Trois manques de fond**, décrits au §13.

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


### A-03 — Supprimer un encaissement laissait ses écritures au journal · S6 · **majeur**

L'agent dispose d'un bouton « Supprimer » sur un encaissement de loyer. Le déclencheur
qui écrit au journal comptable était posé en `AFTER INSERT` **seulement** : le loyer et
les honoraires restaient donc comptabilisés alors que la recette n'existait plus. Le
rapport de gestion envoyé au propriétaire surévaluait ses recettes, et l'agence
s'attribuait des honoraires sur un encaissement effacé.

Deux pièces manquaient. D'abord **le lien entre une écriture et son encaissement** :
rapprocher par « même bail, même date » est ambigu, deux règlements le même jour sur le
même bail étant courants (un acompte puis le complément). Ensuite **la contre-passation** :
les écritures sont immuables par conception, on n'efface donc pas, on inscrit l'écriture
inverse — comme en comptabilité.

*Migration : `20260803_encaissement_supprime_contre_ecritures.sql`.
Test : `tests/encaissement-suppression.test.ts`, quatre scénarios dont deux règlements le
même jour.*

> Ma première tentative était fausse : je contre-passais « les deux dernières écritures
> du bail à cette date », ce qui, sur un jeu de données comportant des doublons, annulait
> deux fois les honoraires au lieu du loyer et des honoraires. Le solde montait de 180 €
> au lieu de baisser de 1 410 €. C'est ce qui m'a conduit à la vraie cause.

### A-04 — Montants exportés au point décimal · S6 · **majeur**

L'export CSV sortait `42.6`. Ouvert dans un tableur français, où la virgule est le
séparateur décimal, cette colonne est importée **en texte** : impossible de la sommer.
Un journal comptable qu'on ne peut pas additionner ne sert à rien. Désormais `42,60`,
deux décimales systématiques.

### A-05 — Export CSV sans lot ni mandant · S6 · **majeur**

Le fichier ne contenait ni le bien, ni le lot, ni le mandant. Une agence de quarante
lots recevait une liste plate de lignes « Encaissement de loyer » indiscernables : la
ventilation par mandant, qui est la raison d'être du document, était impossible.

Trois colonnes ajoutées. Le mandant n'étant porté que par les écritures d'honoraires,
il est retrouvé par le lot, **à la date de l'écriture** — une écriture de mars garde le
mandant de mars même si le mandat s'est terminé depuis.

### A-06 — Un export en échec produisait un fichier vide et silencieux · S6 · moyen

L'erreur de lecture était ignorée. En cas d'échec, l'agent recevait un CSV ne contenant
que l'en-tête et pouvait en conclure que son journal était vide. Renvoie désormais une
erreur explicite.

### A-07 — Export sans période · S6 · mineur

L'export prenait tout le journal depuis l'origine. Deux liens : « Exporter 2026 » et
« Tout exporter » ; la route accepte `?du=…&au=…`.

### A-08 — Le nom du mandant ne s'affichait jamais · S6 · moyen

PostgREST renvoie un **objet** pour une jointure « vers-un », pas un tableau. Le code
écrivait `donnee.mandat?.[0]`, qui vaut toujours `undefined` — sans erreur, la valeur
se vidait simplement. Sur le tableau de bord, « Rapport de gestion de juin » était
attribué à un générique « Mandant » au lieu de « BERTRAND Hélène ». Même défaut dans
l'export. Utilitaire `premier()` partagé (`src/lib/postgrest.ts`) qui accepte les deux
formes.

*C'était mon propre défaut, introduit en corrigeant le tableau de bord la nuit précédente.*

### A-09 — L'état des lieux de sortie n'avait aucune échéance · S4 · **majeur**

À l'enregistrement d'un congé, l'alerte « état des lieux de sortie à réaliser » était
créée sans date, alors que la date d'effet du congé était connue et voyageait déjà dans
le détail de l'alerte. Conséquence : l'alerte s'affichait « sans échéance », ne remontait
jamais à l'approche du départ et ne pouvait pas déclencher de rappel. L'agent pouvait
manquer l'état des lieux — et donc les délais légaux de restitution du dépôt de garantie.

L'échéance est désormais la date d'effet du congé, et les alertes déjà créées ont été
rattrapées à partir de leur propre détail.

*Migration : `20260803_alerte_edl_sortie_datee.sql`.*

### Correctifs d'outillage

- **Les tests d'intégration visaient la production.** `SUPABASE_DB_URL` pointait sur
  `rddlxunppddzpsaatdaz`. Ils annulent leur transaction, mais un test qui oublierait son
  `rollback`, ou qui ferait du DDL, écrirait dans les données réelles des agences. Un
  garde-fou (`tests/garde-base.ts`) refuse maintenant de démarrer contre la production ;
  on le lève sciemment avec `GERIMMO_AUTORISER_PROD=1`.
- **Le test d'isolation dépendait d'un jeu de démo disparu.** Il comparait des noms de
  fiches en dur (`admin.alpha@gerimmo-demo.fr`, « Dupont », « Martin ») : quatre échecs
  rouges alors que l'étanchéité était intacte. Réécrit pour vérifier la **règle** —
  intersection vide entre les deux agences, écriture transverse refusée — sur n'importe
  quel jeu de données. Comptes paramétrables par `.env.local`. 6/6.
- **Le tableau de bord affichait deux fois la même date.** Au-delà de quinze jours, le
  texte relatif *est* la date : « 14/10/2026 · 14/10/2026 ».
- **Le rapport de gestion apparaissait dans « cette semaine ».** Sa date de rendez-vous
  était le mois couvert et non l'échéance : le rapport de juin s'affichait « lun 01 » le
  3 août. L'échéance est le jour convenu au mandat, le mois suivant (`echeanceRapport`),
  et le badge porte le mois dès qu'on sort de la quinzaine (`dateRendezVous`).


### A-10 — Un lot pouvait être « loué » sans bail · S2 · **majeur**

Le déclencheur validait la *forme* des transitions d'état (quel état mène à quel autre)
mais jamais leur *fondement*. Deux boutons hérités d'avant le module bail permettaient :

- **« Marquer loué »** sur un lot sans aucun bail — le lot comptait comme loué au tableau
  de bord, aucun loyer n'était appelé, aucun locataire n'existait ;
- **« Passer en préavis »** sans congé — pas de date d'effet, pas d'alerte d'état des
  lieux de sortie, aucune trace du congé légal.

Dans l'autre sens, enregistrer un congé passait le **bail** en préavis sans toucher au
**lot** : le parc affichait « loué » pour un logement dont le locataire partait. Les deux
machines à états divergeaient dès le premier congé — c'était déjà le cas dans le jeu de
recette.

L'état du lot est désormais adossé au bail : c'est le bail qui fait foi. Les deux boutons
manuels ont disparu de l'interface, remplacés par la phrase qui dit où agir.

*Migration : `20260803_etat_lot_adosse_au_bail.sql`. Vérifié : 3/3.*

### A-11 à A-16 — Ce que le parcours écran par écran a révélé

- **A-11 · En-tête illisible sur téléphone.** À 375 px, la marque, la cloche, « Mes
  espaces » et « Se déconnecter » se chevauchaient littéralement. L'en-tête passe
  désormais sur deux lignes. Au passage, dix-huit écrans avaient une marge fixe de 28 px :
  16 px sur mobile rendent 24 px de contenu de chaque côté.
- **A-12 · Deux mots pour le même état.** Le parc disait « Brouillon », le tableau de bord
  « en préparation ». « Brouillon » évoque un document inachevé ; un lot, lui, se prépare.
- **A-13 · Des mots de développeur à l'écran.** « revérifie tous les blocages **en base** »,
  la suite d'états écrite en langage de code (« brouillon → disponible → loué ⇄ préavis »),
  « Équipements (**liste fermée**) », « ventilée par lot **via la clé** », « 4 **p.** », et
  les mois affichés `2026-06` au lieu de « juin 2026 ».
- **A-14 · « Contre-écriture » disait deux choses opposées.** Le bouton pour annuler une
  écriture et l'étiquette des lignes déjà annulées portaient le même mot. Le bouton dit
  maintenant « Annuler ».
- **A-15 · Formulations ambiguës sur les alertes.** « Assignée à : personne » se lit aussi
  bien « à personne » que « à une personne ». « Escalader » n'est pas un mot d'agence. Et
  un texte annonçait comme à venir des modules déjà livrés.
- **A-16 · Mode de règlement en champ libre.** Chacun écrivait « cheque », « Chèque »,
  « CHQ » : le journal devenait intriable. Six modes en liste fermée.

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

| Sprint | Vérifications | Résultat |
|---|---|---|
| S0 — Isolation entre agences | 11 contrôles au niveau API | 11/11 |
| S1 — Fichiers pièges | 5 pièges (extension menteuse, vide, hors gabarit, nom hostile, PDF tronqué) | 5/5 |
| S2 — Parc et lots | règles de découpe, blocages à la location | conforme |
| S3 — Mandats et dossier locataire | 7 contrôles | 7/7 |
| S4 — Bail et état des lieux | 5 contrôles (dont A-09 corrigé) | 5/5 |
| S5 — Loyers et quittances | prorata au centime (A-01, A-02 corrigés) | 3/3 |
| S6 — Comptabilité | 9 contrôles de clôture + 6 sur l'export (A-03 à A-08 corrigés) | 15/15 |

Contrôles transverses : `npm run build` passe, `npm run lint` sans erreur, `tsc` sans
erreur, aucune erreur dans la console du navigateur sur le tableau de bord.

**Non couvert :** le parcours écran par écran de tous les formulaires (phase 4), le
responsive 390/768/1440, l'accessibilité au clavier, et la phase 5 en entier.

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

### La production est corrigée

Trois migrations sur quatre sont passées, sur votre feu vert :

```
prorata_au_centime                       A-01, A-02   ✓ production
encaissement_supprime_contre_ecritures   A-03         ✓ production
alerte_edl_sortie_datee                  A-09         ✓ production
etat_lot_adosse_au_bail                  A-10         ✗ branche seulement
```

**A-10 n'est pas en production.** Je l'ai découverte pendant la phase 4, après vos trois
feux verts, et le garde-fou d'exécution a refusé la quatrième application — à juste titre :
votre autorisation portait sur les anomalies connues à ce moment-là. La migration est
prête et vérifiée sur la branche (3/3). Un mot de votre part et je l'applique, ou
`supabase db push` la joue avec les autres.

Elle change un comportement, à savoir : marquer un lot « loué » ou « en préavis » à la
main devient impossible. Ces deux états découlent maintenant du bail et du congé.

Vérifié après coup : les corps de fonction de la production et de la branche de recette
sont identiques une fois les commentaires écartés. Aucune donnée effacée ; deux
rattrapages de données ont eu lieu (les alertes d'état des lieux de sortie ont reçu leur
échéance, un lot désaccordé de son bail est passé en préavis).

Les onze autres corrections sont dans le code : **elles ne prennent effet qu'au prochain
déploiement.**

### Deux choses à ne pas oublier

1. **Supprimer la branche `recette-s0-s6`** : facturée à l'heure. Je le fais sur un mot.
2. **Restaurer `.env.local`** depuis `scratchpad/sauvegarde/.env.local.production` — il
   pointe encore sur la branche de recette, tout comme le serveur de développement local.

### Ce qui reste à faire

La phase 5 dans les règles : cinq tâches chronométrées par quelqu'un qui découvre
l'outil, et les quatre notes. Je peux la mener, mais un chronomètre que je tiens moi-même
sur une interface que je viens d'écrire ne vaut pas grand-chose — c'est le genre de
mesure qui gagne à être faite par quelqu'un d'autre.

### Aucun e-mail envoyé

Rien n'est parti, ni vers votre adresse de test ni ailleurs.

## 13. Trois manques de fond

Ce ne sont pas des défauts : ce sont des choses qui n'existent pas encore et qui se
verront dès le premier vrai client.

**1. L'état des lieux n'a pas de pièces.** La grille est un squelette « Général » de sept
lignes — sols, murs, plafonds, fenêtres, portes, prises, éclairage. Pas de cuisine, pas de
salle de bain, pas de chambres. Or l'état des lieux est ce qui autorise ou interdit une
retenue sur le dépôt de garantie : sept lignes génériques ne tiendront pas devant un
locataire qui conteste. Le vrai chantier est en amont — modéliser les pièces du lot.

**2. La liste des personnes ne dit pas qui est qui.** Treize noms par ordre alphabétique,
avec e-mail et téléphone. Rien n'indique qui est propriétaire, locataire ou garant, et il
n'y a pas de recherche. À treize personnes c'est tenable ; à cent, l'écran devient
inutilisable. Le rôle est pourtant déductible des détentions, des baux et des mandats.

**3. Annuler un congé n'existe pas.** Un locataire qui se rétracte laisse le bail en
préavis, sans chemin de retour. J'ai laissé la transition du lot ouverte pour ne pas
bloquer un cas réel, mais le bail, lui, reste en préavis : les deux se désaccorderaient.
Ce serait une action à part entière, pas un bouton d'état.

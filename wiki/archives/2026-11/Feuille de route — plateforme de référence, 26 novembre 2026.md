---
type: synthesis
tags: [strategie, feuille-de-route, marche, concurrence, aides, banque, europe, revenu]
status: archived
archived: 2026-11-27
superseded-by: "[[Vision de l'écosystème Gerimmo]]"
created: 2026-11-26
updated: 2026-11-26
sources: ["[[Passation — état du 26 novembre 2026]]", "[[Proposition de valeur]]", "[[Analyse concurrentielle]]", "[[Prêt à démarcher]]", "[[Grille tarifaire]]", "[[Calendrier de lancement — 30 novembre 2026]]", "Recherches web du 26/11/2026 (liste en fin de page)"]
---

# Feuille de route — plateforme de référence, 26 novembre 2026

> [!note] Page archivée le 27/11/2026
> Son contenu utile est repris dans la seule page de vision : [[Vision de l'écosystème Gerimmo]]. Cette page n'est plus tenue à jour.

> [!info] L'ambition fixée par le dirigeant le 26/11/2026
> Mot pour mot : « FAIRE DE GERIMMO LA PLATEFORME PRINCIPALE DE GESTION IMMOBILIÈRE DE FRANCE ET POTENTIELLEMENT
> D'EUROPE. Toutes les entrées possible, carnet du locataire, aide pour les aides, gestion de l'administratif, des
> incidents, des artisans, des factures, des finances. L'objectif est que toute la gestion immobilière se passe sur
> Gerimmo. ME RENDRE RICHE !! » La vision d'ensemble est rangée dans [[Vision de l'écosystème Gerimmo]].
>
> Cette ambition prolonge l'énoncé fondateur du 10/09 ([[Proposition de valeur]]) : « faire le travail d'une agence de
> gestion locative — en mieux, plus rapide, et moins cher ». La frontière tranchée le 10/09 reste valable : Gerimmo
> exécute le travail, mais n'encaisse pas de fonds pour le compte de tiers.

**Statut : brouillon, à valider par le dirigeant.** Les faits viennent de deux sources :
- le relevé du dépôt sur `main` `f9e874b` (26/11), complété par la [[Passation — état du 26 novembre 2026]] ;
- des recherches web du 26/11, détaillées en fin de page.

Les chiffres marqués « (calcul) » sont des ordres de grandeur, pas des prévisions.

## 1. Où en est Gerimmo le 26/11/2026

### Le produit est déjà large

Fonctions en production :
- **Espaces** : propriétaire et SCI, locataire, artisan, supervision.
- **Loyers** : appels de loyer, quittances, relances, [[Plan d'apurement]], [[Révision annuelle IRL]], charges et
  [[Régularisation des charges]], taxe foncière et TEOM.
- **Travaux** : chaîne [[Cycle de vie d'un incident|incident]] → [[Devis]] → [[Intervention]] → facture d'artisan.
- **Entrée dans les lieux** : [[État des lieux]] avec photos, inventaire du meublé.
- **Fin de bail** : [[Restitution du dépôt de garantie]], [[Solde de tout compte]], relocation.
- **Administratif** : [[Document|documents]], [[Diagnostic|diagnostics]], aide à la déclaration 2044.
- **Acquisition** : cinq outils gratuits et le [[Journal éditorial|journal]].

Les modèles de bail citent déjà le décret n° 2026-596, qui impose de nouveaux contrats types depuis le 01/10/2026
(`app/src/lib/documents/modeles/mentions-location.ts`, [[Bail]]).

### Mais il ne rapporte encore rien

- **La souscription payante est fermée** (pilote gratuit). L'inscription et l'essai de 2 mois restent ouverts.
  D'après la [[Passation — état du 26 novembre 2026]] (section d), il reste trois étapes avant la vente :
  1. **le médiateur de la consommation** (d.4) : adhérer et saisir ses coordonnées, ce que la passation recommande. À
     défaut, il faut une décision datée de vendre sans lui (migration `20261125106000`), avec un risque juridique ;
  2. **l'en-tête des factures dans Stripe** (R7), puis un premier paiement réel remboursé (COM-2) ;
  3. **l'ouverture des souscriptions** (R8, réglage `souscriptions_payantes_ouvertes` et mode commercial,
     `app/src/lib/verrou-pilote.ts`). Ce geste revient au seul dirigeant : la consigne « Ne rouvre pas les
     souscriptions payantes » interdit à l'agent de le faire.

  L'identité du vendeur (R1) a été réglée par le dirigeant le 26/11. Aucun paiement réel n'est connu.
- **Les agences** sont sur liste d'attente (décision du 20/10).
- **Aucun client réel à ce jour.** Le recompte du 26/11 ne trouve aucun compte réel : selon le dirigeant (22/11), les
  inscrits sont des comptes de test, à fermer avant la fin de leur essai, entre le 24 et le 29/12 (passation, d.1).
  Le constat « 4 espaces sur 6 sans bien » (PR #354, 21/11) porte donc sur des comptes de test et ne dit rien du
  comportement de vrais clients. Le site ne mesure pas son audience.
- **Plusieurs automatismes codés sont éteints par défaut** :
  - avis d'échéance automatique ;
  - relances par e-mail ;
  - recommandé AR24 (pas d'accès au service, décision du 22/11) ;
  - signature électronique, sous interrupteur.

### Ce qui manque pour que « tout se passe sur Gerimmo »

Statuts relevés dans le dépôt le 26/11 :

| Domaine | Statut | Commentaire |
|---|---|---|
| Paiement du loyer (virement guidé, prélèvement) | Absent | Le locataire copie l'IBAN ; l'encaissement pour compte de tiers est exclu (10/09) |
| Synchronisation bancaire | Absent | Import d'un relevé CSV/OFX seulement (25/11) |
| Mise en location (annonce, candidatures, vérification de dossier) | Absent ou partiel | Gerimmo n'arrive qu'après la signature du bail |
| Entrée du locataire seul, carnet qui le suit d'un bail à l'autre | Absent | Le locataire n'entre que sur invitation de son bailleur |
| Accompagnement des aides | Absent | Seulement le dossier CAF et l'attestation de loyer |
| Fiscalité du meublé au réel, SCI à l'IS, nouveau statut du bailleur privé | Partiel | Orientation et simulateur seulement |
| Application mobile, WhatsApp | Absent | Le site est adapté au mobile |
| Offre agences en libre-service | Hors périmètre (décision du 20/10) | Codée, non vendue |
| Copropriété (appels de fonds, AG), démembrement | Absent ou partiel | Appels de charges du syndic seulement |
| International | Absent | Français seulement, euro, fuseau de Paris |

## 2. Le marché

- **Parc locatif privé** : environ 7,3 M logements, soit 23,1 % de 31,7 M résidences principales (INSEE 2025, calcul) [1].
- **Concentration** :
  - environ la moitié des logements loués appartient à des détenteurs de 5 logements ou plus, et 18 % à des détenteurs
    de 10 ou plus ;
  - 70 % des détenteurs de 10 logements ou plus passent par une SCI (INSEE, données 2022) [2] ;
  - en 2021, environ 1 M de ménages détenaient 5 logements ou plus [3].
- **Gestion** : 64 % des bailleurs gèrent en direct (ANIL, données 2013, à actualiser) [4].
- **Prix de la gestion déléguée** : de 4,9 % TTC des encaissements en ligne (Manda) à 8,40 % TTC au barème Foncia
  (5,99 % en promotion jusqu'au 31/12/2026) [6][7].
- **Professionnels** : 8 919 entreprises d'administration d'immeubles actives (INSEE, 2024) [10].
- **Meublé** : 1,37 M déclarants LMNP (étude privée, 2024) [13].
- **Aides au logement** : 5,53 M foyers allocataires (DREES, juin 2025) [14].

**Lecture : la clientèle qui paie, ce sont les multipropriétaires et les SCI.** C'est justement là que Gerimmo est le
moins cher du marché (section 4).

## 3. La concurrence

### Ce sans quoi on ne vend pas

Fonctions présentes chez au moins trois acteurs :
- quittances et avis d'échéance automatiques, suivi des loyers et relances ;
- bail conforme et signature électronique ;
- état des lieux, IRL, régularisation des charges, espace locataire ;
- **synchronisation bancaire** (Rentila Gold, Gererseul, Qalimo, Smovin) ;
- **déclaration fiscale** (2044 ou LMNP) ;
- **application mobile** ;
- gratuité pour 1 à 2 biens, ou essai gratuit.

### Prix pratiqués

- **Logiciels pour bailleurs** : de 0 à 10 €/bien/mois [15]–[18].
  - Rentila : 49 € HT/an pour 2 à 5 biens.
  - BailFacile : 9,99 €/bien/mois.
  - Gererseul : 117 €/an par bien.
  - Qalimo : 4,90 €/bien/mois.
- **Fiscalité en option** : de 150 à 300 €/an [25]–[27].

### La place libre

Ce qui suit est une analyse, pas une preuve d'absence.

1. **Le cycle incident → artisan → facture → fiscalité.** Aucun logiciel pour bailleur du panel ne le propose. Côté
   professionnels, la fenêtre se referme : Septeo (ICS) a racheté Inch le 20/10/2025, et Ublo a levé 1,8 M€ en
   décembre 2025 [21][29].
2. **Les aides.** Aucun outil trouvé n'accompagne le tiers payant de la CAF, alors que ses règles changent au
   01/01/2027 (décret n° 2026-84) [41].
3. **Le locataire comme porte d'entrée.** Les acteurs côté locataire vendent de la garantie ou un dossier ; aucun ne
   s'en sert pour attirer des bailleurs.
4. **Le tout-en-un, du particulier à l'agence.** Seuls Gererseul et Smovin couvrent les deux.

### Canaux d'acquisition des leaders

- pages par ville et comparatifs, pour le référencement ;
- simulateurs ;
- gratuité d'entrée ;
- affiliation récurrente (BailFacile reverse 20 % de l'abonnement, à vie) ;
- parrainage récompensé des deux côtés (BailFacile : 25 € au parrain et 25 € au filleul) [44][48].

## 4. Le revenu : ordres de grandeur

Grille du code (`app/src/lib/tarifs.ts`, abonnement unique du 11/11, prix TTC avec franchise de TVA) :
- 5,99 €/mois pour 1 bien ;
- +1,99 € par bien supplémentaire, jusqu'à 7 biens ;
- 19,90 €/mois de 8 à 20 biens ;
- +0,99 € par bien au-delà de 20 ;
- l'abonnement annuel vaut 10 mois.

| Portefeuille | Gerimmo (annuel) | BailFacile | Gererseul | Qalimo | Rentila |
|---|---|---|---|---|---|
| 1 bien | 59,90 € | ~120 € | 117 € | 49 € | gratuit |
| 3 biens | 99,70 € | ~360 € | ~351 € | 147 € | 49 € HT |
| 5 biens | 139,50 € | ~600 € | ~585 € | 245 € | 49 € HT |
| 10 biens | 199,00 € | ~1 200 € | ~1 170 € | non vérifié | 99 € HT |

Calcul à partir des prix publics relevés le 26/11. Le prix de Qalimo au-delà de 7 biens n'a pas été vérifié.

**Ce que cela représente** (calcul, avec un panier moyen supposé de 120 à 150 €/an) :
- 1 000 clients : environ 120 à 150 k€/an ;
- 10 000 clients : environ 1,2 à 1,5 M€/an ;
- 50 000 clients, le volume revendiqué par Rentila : environ 6 à 7,5 M€/an.

### Trois leviers pour changer d'échelle

1. **Le prix pour les multipropriétaires.** À partir de 3 biens, Gerimmo est 3 à 6 fois moins cher que BailFacile et
   Gererseul, sur le segment qui détient la moitié du parc. Un palier plus élevé au-delà de 5 ou 10 biens se
   justifierait face aux 4,9 à 8,4 % d'une agence. **Décision du dirigeant**, à tester.
2. **Les revenus annexes** :
   - déclaration fiscale en option (150 à 300 €/an chez les concurrents) ;
   - partenariats d'assurance (GLI, PNO), sous réserve du statut d'intermédiaire, à vérifier ;
   - frais de prélèvement ;
   - offre agences.
3. **La viralité** : chaque locataire et chaque artisan peut amener des bailleurs.

## 5. La stratégie en trois étages

### Étage 1 — Encaisser (décembre 2026)

| # | Chantier | Pourquoi | Ce qu'il faut |
|---|---|---|---|
| 1.0 | **Finir le lot 1 en cours** et préparer une séance guidée avec le dirigeant (fermer les comptes de test, essais courts) | Un logiciel « fonctionnel et sans défaut » est la consigne du dirigeant du 26/11 | Plan de la [[Passation — état du 26 novembre 2026]], section i |
| 1.1 | **Ouvrir la vente** aux particuliers et aux SCI | Sans elle, aucun revenu | Médiateur (ou vente datée sans lui), en-tête Stripe (R7), premier paiement réel remboursé, puis ouverture par le dirigeant lui-même (R8) |
| 1.2 | **Mesurer** l'audience du site et l'entonnoir : inscription → 1ᵉʳ bien → 1ᵉʳ bail → 1ᵉʳ loyer pointé → paiement | Sans mesure, on ne saura pas pourquoi de vrais inscrits décrochent | Choisir un outil de mesure d'audience sans cookie ; tableau hebdomadaire du revenu mensuel, de la conversion des essais et des départs |
| 1.3 | **Trouver les premiers vrais clients**, puis les accompagner jusqu'au premier bien et au premier loyer | Aucun client réel aujourd'hui | Publicité et [[Parrainage]] auprès des particuliers (jamais de démarchage direct, décision du 19/09), démarchage permis des artisans et des agences ([[Prospection commerciale]]) ; suivi personnel des dix premiers |
| 1.4 | **Allumer ce qui est déjà codé** : avis d'échéance, relances, rappels, signature | Tenir la promesse « le travail se fait tout seul » | Une décision d'ouverture par circuit |
| 1.5 | **Suivre les textes qui changent** | Risque juridique et confiance | Règles du tiers payant de l'APL au 01/01/2027 (décret n° 2026-84, absent du dépôt) ; suivi du projet de loi sur les DPE, voté en première lecture le 24/11 (le droit n'a pas changé) |

### Étage 2 — Le socle attendu et les portes d'entrée (premier semestre 2027)

1. **Synchronisation bancaire** par un agrégateur agréé (Powens, Bridge), Gerimmo restant simple client : le pointage
   des loyers devient automatique. Quatre concurrents la proposent déjà. À valider par écrit avec l'agrégateur et un
   juriste.
2. **Paiement du loyer sans transit de fonds.** Le locataire vire le loyer, en virement instantané de préférence, sur
   l'IBAN du bailleur, et Gerimmo le rapproche automatiquement. En option, un prélèvement SEPA sur le compte marchand
   propre à chaque bailleur (GoCardless : 1 % + 0,20 € par prélèvement, plafonné à 2 € HT).
3. **Carnet du locataire.** Le locataire s'inscrit seul et gratuitement. Il garde un historique qui le suit d'un bail à
   l'autre (quittances, attestations, états des lieux, dossier) et peut déclarer un incident. Il invite son bailleur.
   C'est une place libre.
4. **« Aide pour les aides »**, dans cet ordre :
   1. **APL et AL en tiers payant, signalement d'impayé** : attestation de loyer pré-remplie, aide déduite de l'appel de
      loyer et de la quittance, détection du seuil d'impayé, signalement et échéancier, selon les règles du 01/01/2027 ;
   2. **Visale** : visa contrôlé par rapport au loyer et à la zone, alerte à la fin des 3 ans de couverture, dossier
      d'impayé ;
   3. **le bouquet rénovation lié au DPE** : MaPrimeRénov' (les SCI en sont exclues), éco-PTZ, déficit foncier doublé
      jusqu'au 31/12/2027. Deux API publiques peuvent servir : l'API DPE de l'ADEME et l'API Mes Aides Réno ;
   4. **Loc'Avantages** : loyer plafond, ressources du locataire, cumul annuel des loyers ;
   5. **Avance Loca-Pass et FSL** : un dossier « entrée dans les lieux » et un dossier « dette », à remettre au
      travailleur social.
5. **Fiscalité complète** : meublé au réel (liasse 2031, amortissements), SCI à l'IS, amortissement du nouveau statut
   du bailleur privé (article 31 du CGI, loi de finances 2026). C'est à la fois un ticket d'entrée et un revenu annexe.
6. **Mise en location** : annonce, candidatures, DossierFacile Connect (gratuit, sous convention RGPD).
7. **Mobile** : application installable et notifications.
8. **Acquisition** : pages par ville, comparatifs, affiliation récurrente, parrainage récompensé des deux côtés.

### Étage 3 — Professionnels, revenus annexes, Europe (second semestre 2027 et après)

- **Agences en libre-service**, en commençant par les petites. Le module est déjà codé, et c'est le segment où le
  panier est le plus élevé.
- **Revenus annexes** : assurance, fiscalité, prélèvement, et peut-être une commission sur le réseau d'artisans. Chacun
  est à trancher et à vérifier juridiquement.
- **Europe : la Belgique d'abord**, par Bruxelles et la Wallonie, qui sont francophones. Environ 35 % des logements y
  sont loués, et Smovin a validé ce marché. Préalables :
  - trois modèles de bail régionaux ;
  - l'indexation sur l'indice santé, avec le facteur PEB bruxellois ;
  - la garantie locative sur compte bloqué ;
  - l'enregistrement du bail via MyRent et IRISRent ;
  - une fiscalité fondée sur le revenu cadastral ;
  - des banques belges couvertes par l'agrégateur ;
  - le néerlandais, dans un second temps.

  Le Luxembourg peut suivre.

## 6. Décisions attendues du dirigeant

1. Ouvrir la vente le 30/11 ? Si oui : adhérer à un médiateur, ou vendre sans lui par une décision datée ; régler
   l'en-tête Stripe (R7) ; faire vous-même l'ouverture (R8). Les autres décisions en attente sont dans la
   [[Passation — état du 26 novembre 2026]], section d.
2. Règle de priorité : le revenu d'abord, chaque module choisi pour ce qu'il rapporte.
3. Outil de mesure d'audience, sans cookie de préférence.
4. Ouverture des automatismes éteints, circuit par circuit.
5. Grille : un palier plus élevé pour les multipropriétaires ? Un bien gratuit face à Rentila ?
6. Banque : quel agrégateur consulter ? Proposer ou non le prélèvement en option ?
7. Calendrier de l'offre agences.

## 7. Ce que l'agent propose de lancer en premier

Ces chantiers reprennent la section i de la [[Passation — état du 26 novembre 2026]]. Le code n'est touché qu'une
fois que l'ancienne session a fini, pour que deux sessions ne modifient pas les mêmes fichiers :

1. finir et publier le lot 1, avec l'accord écrit du dirigeant ;
2. préparer, en français simple et avec les gestes exacts, la séance guidée avec le dirigeant : fermeture des comptes
   de test, médiateur, en-tête Stripe, premier paiement réel remboursé. L'ouverture des souscriptions reste son geste ;
3. mettre en place la mesure d'audience et le tableau de l'entonnoir ;
4. appliquer les règles du tiers payant de l'APL au 01/01/2027 ;
5. cadrer la synchronisation bancaire et le carnet du locataire.

> [!warning] Points à trancher / contradictions
> - Ce relevé a d'abord été fait sur `main`, dont le wiki et `log.md` s'arrêtaient au 03/11. La branche de documentation
>   `claude/audit-final-pr335` est à jour jusqu'au 26/11 ([[Grille tarifaire]] comprise). Elle n'est pas encore
>   fusionnée dans `main` : une PR de documentation seule est à proposer au dirigeant (passation, section i).
> - Rentila : un concurrent affirme que la connexion bancaire est disponible dès l'offre gratuite, alors que la page
>   tarifs de Rentila la réserve à l'offre Gold.
> - Qlower affiche deux grilles différentes (269/590 € et 299/599 €). Manda présente trois niveaux de prix selon les pages.
> - Les règles du tiers payant au 01/01/2027 viennent en partie de la presse : à vérifier sur Légifrance (décret n° 2026-84).
> - Projet de loi sur les DPE voté en première lecture le 24/11 : tant qu'il n'est pas adopté, le droit en vigueur
>   s'applique (location des logements G interdite depuis le 01/01/2025).
> - Plusieurs sites officiels n'ont pas pu être lus directement (anil.org, caf.fr, anah.gouv.fr, actionlogement.fr, SDES,
>   ACPR). Leurs informations viennent d'extraits de recherche.
> - La part de gestion directe (64 %) date de 2013.

## Sources (consultées le 26/11/2026)

**Marché**
- [1] INSEE, statut d'occupation des résidences principales 1982–2025 (30/09/2026) — https://www.insee.fr/fr/statistiques/2415555
- [2] INSEE Première n° 2046 (02/04/2025) — https://www.insee.fr/fr/statistiques/8538622
- [3] INSEE (2021) — https://www.insee.fr/fr/statistiques/5432517
- [4] ANIL, enquête nationale logement 2013, via LocService — https://www.locservice.fr/actualites/etude-de-lanil-devoile-chiffres-etonnants-parc-locatif-prive-france-3607.html
- [6] Foncia, offre du 01/10 au 31/12/2026 — https://fr.foncia.com/gestion-locative-essentielle
- [7] Manda, tarifs 2026 — https://www.manda.fr/tarifs
- [10] INSEE, stocks d'entreprises 2024 (23/07/2026) — https://www.insee.fr/fr/statistiques/9027472
- [13] Amarris Immo, via Tout sur mes finances (étude privée) — https://www.toutsurmesfinances.com/actualites/?p=2094
- [14] DREES, minima sociaux 2025 — https://drees.solidarites-sante.gouv.fr/publications-communique-de-presse/panoramas-de-la-drees/251204-minima-sociaux-et-prestations-de-solidarite

**Concurrence**
- [15] Rentila — https://support.rentila.com/pricing
- [16] BailFacile — https://www.bailfacile.fr/tarifs
- [17] Gererseul — https://www.gererseul.com/tarifs/
- [18] Qalimo — https://www.qalimo.fr/
- [21] Ublo (levée du 22/12/2025) — https://seedtable.com/companies/ublo/funding-rounds/seed-2025-12
- [25] Qlower — https://www.qlower.com/
- [26] Decla.fr — https://investissement-locatif-avis.fr/decla-fr-avis/
- [27] JD2M — https://www.jedeclaremonmeuble.com/tarif/
- [29] Rachat d'Inch par Septeo (10/2025) — https://www.mysweetimmo.com/2025/10/28/immobilier-septeo-muscle-son-offre-adb-avec-le-rachat-dinch/
- [44] Affiliation et parrainage BailFacile — https://affiliation.bailfacile.fr/
- [48] Pages par ville de BailFacile — https://www.bailfacile.fr/gestion-locative/lille

**Aides, banque et textes**
- [41] Décret n° 2026-84 du 12/02/2026 (tiers payant et impayés) — https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000053465727
- Décret n° 2026-596 du 06/07/2026 (contrats types) — https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000054393114
- APL versée au bailleur — https://www.service-public.gouv.fr/particuliers/vosdroits/F12006
- Impayé et aides au logement — https://www.service-public.gouv.fr/particuliers/vosdroits/F32037
- Visale, règles du 06/01/2026 — https://www.service-public.gouv.fr/particuliers/actualites/A17759
- FSL — https://www.service-public.gouv.fr/particuliers/vosdroits/F1334
- Loc'Avantages — https://www.service-public.gouv.fr/particuliers/vosdroits/F34115
- MaPrimeRénov' pour les bailleurs — https://www.service-public.gouv.fr/particuliers/vosdroits/F35083
- Éco-PTZ — https://www.service-public.gouv.fr/particuliers/vosdroits/F19905
- Nouveau statut du bailleur privé, article 31 du CGI — https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053544761/2026-02-21
- Projet de loi sur les DPE, adopté en première lecture le 24/11/2026 (presse) — https://www.ouest-france.fr/societe/logement/lassemblee-nationale-adopte-en-premiere-lecture-un-projet-de-loi-logement-qui-reautorise-les-passoires-thermiques-2814a260-e826-11f1-86c1-70195b4d2e52
- API Mes Aides Réno — https://www.data.gouv.fr/dataservices/api-mes-aides-reno
- API DPE de l'ADEME — https://www.data.gouv.fr/dataservices/api-dpe-logements
- DossierFacile Connect — https://partenaire.dossierfacile.logement.gouv.fr/documentation-technique/api
- ACPR, service d'information sur les comptes — https://acpr.banque-france.fr/autoriser/procedures-secteur-banque/agrement-autorisation-ou-enregistrement/etablissement-de-paiement-et-prestataire-de-service-dinformation-sur-les-comptes
- GoCardless, tarifs — https://gocardless.com/fr-fr/solutions/en-savoir-plus

**Europe**
- Statbel, recensement 2021 (Belgique) — https://statbel.fdgov.be/en/themes/census/housing/type-ownership
- Smovin, tarifs — https://www.smovin.app/fr-fr/tarifs/
- Indexation à Bruxelles — https://be.brussels/fr/logement/location/bail-dhabitation/indexation-des-loyers/indexation-des-loyers-avec-facteur-de-correction
- Enregistrement du bail à Bruxelles — https://be.brussels/fr/logement/location/bail-dhabitation/enregistrement-bail-dhabitation

---
type: synthesis
tags: [audit, avant-vente, ergonomie, ux, ui, accessibilite, vitrine, proprietaire, agence, locataire, artisan, super-admin]
status: stable
created: 2026-11-16
updated: 2026-11-16
sources: []
---

# Audit avant vente — ergonomie, visuel et fonctions — 16 novembre 2026

Question posée : *toutes les pages de Gerimmo sont-elles agréables à voir, faciles à
utiliser et bien présentées, et leurs fonctions marchent-elles, avant de vendre le
produit ?*

Version examinée : `main` à **a6538f71** (« Recette de production : abonnement fermé,
fiscalité 2044 et régularisation », #336). C'est aussi la version publiée en production
(déploiement Vercel `dpl_7ogEZxcvfmRwwhcHNfz3gr2WqSb5`, prêt le 16/11/2026). Le banc et
la production sont donc identiques ; les seules différences viennent des données
(fictives sur le banc) et de l'environnement (voir § 8).

## 1. En bref, pour décider

**Verdict : Gerimmo est prêt à être montré, pas encore prêt à être vendu sans
accompagnement.**

- **Ce qui rassure.**
  - L'identité visuelle est haut de gamme et cohérente d'un espace à l'autre (bleu nuit,
    or champagne, photos d'immeubles, titres à empattements).
  - La technique ne trahit rien : sur 412 captures (206 écrans × 2 largeurs), aucune
    erreur JavaScript, aucune page en erreur, aucun débordement horizontal au téléphone.
  - Les assistants métier (bien et lot, bail, état des lieux) sont excellents.
  - Les outils gratuits de la vitrine donnent des résultats justes.
  - La séparation des droits entre agent et responsable d'agence a tenu sur 18 accès
    directs tentés.
- **Ce qui bloque une vente.**
  1. **Des promesses que l'application dément.**
     - Un bandeau jaune permanent annonce, dans les espaces propriétaire et agence, que
       les relances, avis d'échéance et courriers sont « suspendus ». Il contredit la
       vitrine, qui vend justement ces relances, et les boutons « Activer » proposés
       juste en dessous.
     - La page Abonnement vend la signature électronique « sans supplément », mais le
       bail affiche « Signature en ligne en préparation ».
  2. **Aucun médiateur de la consommation n'est désigné.** C'est obligatoire pour
     vendre un abonnement à des particuliers. Le contact affiché est une adresse Gmail.
  3. **Les chiffres se contredisent.**
     - Côté agence : le tableau de bord affiche 1 000 € encaissés (« 143 % »), la page
       Loyers 300 € encaissés et 400 € dus.
     - Côté propriétaire : l'accueil affiche 0,00 € encaissé après un encaissement de
       850 €, et des nombres de tâches différents sur trois vues (4, 5 et 7).
  4. Un responsable d'agence **ne peut pas retirer l'accès** d'un collaborateur parti.
  5. Plusieurs **gestes clés restent sans retour visible** :
     - le locataire confirme un rendez-vous et rien ne s'affiche ;
     - l'artisan découvre à la dernière étape d'un devis qu'il lui manque son adresse ;
     - une erreur de saisie du bail se cache sous l'en-tête.
  6. **Les données de démonstration ne sont pas présentables** : préfixes « E2E »
     partout, bail d'une ligne, aucune quittance à montrer.
- **Ce qui n'est pas du ressort de cet audit mais conditionne la vente.** Le paiement en
  ligne est fermé : l'écran Abonnement l'annonce, la production ne compte aucun
  abonnement Stripe et la souscription payante a été jugée « NO GO » le 15/11 (voir
  [[Audit final indépendant — PR 335 — 15 novembre 2026]]).

**Estimation.** Les blocages 1 à 6 représentent environ **2 semaines** de travail, plus
une démarche administrative (adhésion à un médiateur). Avec la feuille de route du § 7,
une démonstration commerciale guidée est possible dès la fin de la phase 0.

### Notes par espace (sur 10)

| Espace | Agréable à voir | Facile à utiliser | Bien présenté | En une phrase |
|---|---|---|---|---|
| Vitrine et inscription | 7,5 | 7 | 7 | Accueil convaincant et outils justes ; confiance à 5,5 (Gmail, pas de médiateur, aucune preuve), inscription longue, Tarifs en paragraphe. |
| Espace propriétaire | 8 | 6 | 7 | Haut de gamme, garde-fous juridiques et quittance en un clic ; une première location demande une longue chaîne de prérequis, et les chiffres se contredisent. |
| Espace agence (responsable et agent) | 7 | 6 | 7 | Assistants exemplaires et droits solides ; chiffres de loyers contradictoires, Administration cachée, parc sans filtre. |
| Portail locataire | 7,5 | 6 | 7 | Élégant et aux couleurs de l'agence ; la confirmation de rendez-vous ne donne aucun retour, plusieurs pages sortent du cadre. |
| Portail artisan | 8 | 7 | 7,5 | Compte rendu mobile exemplaire et devis PDF professionnel ; le devis bloque à la dernière étape, le total HT affiche 0 €. |
| Console super-administrateur (interne) | 7 | 4 | 5 | Fonctionne, mais le tour du matin ne dit pas quoi décider et la page Santé est écrite pour un développeur. |

La console super-administrateur n'est vue que par l'éditeur. Elle ne gêne pas la vente
de l'abonnement, mais elle pèserait dans l'examen d'un repreneur ou d'un investisseur,
qui jugera l'exploitation au quotidien.

## 2. Périmètre et méthode

- **Rôles et routes réels.** 133 routes de pages, tirées du code. Elles sont rapportées
  aux 6 profils qui existent dans l'application : visiteur, propriétaire, responsable
  d'agence, agent, locataire, artisan, plus le super-administrateur de l'éditeur.
  - Matrice générée par `npm run e2e:matrice` : 182 écrans avec de vrais identifiants
    sur le banc.
  - En production : les 24 pages publiques.
- **Banc local isolé** reproduisant la CI : bases PostgreSQL `gerimmo_ci_av` et
  `gerimmo_ci_av_api`, émulateur Supabase, build de production de Next.js et comptes
  fictifs (`@example.com`). Toutes les écritures (biens, baux, encaissements,
  incidents, devis, factures, invitations) ont été faites ici.
- **Production : lecture seule.** Navigation sur les pages publiques, sans connexion ni
  envoi ; quelques requêtes `curl`.
- **Formats.**
  - Chaque écran est capturé à **390 × 844** (téléphone simulé, tactile) et à
    **1440 × 900** (ordinateur).
  - Les écrans principaux de chaque espace sont aussi contrôlés à **768 × 1024**,
    **1024 × 768** et **1366 × 768**.
  - Navigateur : Chromium 1243 (Playwright), 16/11/2026, fuseau Europe/Paris.
- **Contrôles automatiques** (robot, 412 captures) :
  - statut HTTP et redirection finale ;
  - erreurs JavaScript et console, requêtes en échec ;
  - débordement horizontal ;
  - images cassées ;
  - textes de moins de 12 px et cibles tactiles de moins de 32 px au téléphone ;
  - textes suspects (« undefined », « NaN », « indisponible »…) ;
  - temps de chargement ;
  - accessibilité automatique (axe-core, WCAG 2.1 A/AA, à 1440 px).
- **Revue visuelle et parcours.** Cinq revues : vitrine, propriétaire, agence,
  locataire et artisan, super-administrateur.
  - Chacune a regardé toutes les captures de son périmètre aux deux largeurs.
  - Chacune a rejoué les parcours en cliquant réellement et vérifié le résultat :
    message affiché, persistance après rechargement, visibilité chez le destinataire.
  - J'ai recoupé moi-même les constats P1 sur les captures et dans le code (§ 9).
- **Aucun envoi réel, aucun paiement, aucune signature, aucune donnée de production
  modifiée.**

## 3. Couverture

Statuts : **vérifié** (affichage et, s'il y a lieu, action contrôlés) · **défaut
constaté** · **bloqué** (non éprouvable sur le banc) · **non testé**.

| Espace | Écrans | Captures | Vérifiés | Avec défaut | Bloqués (portée) | Non testé |
|---|---|---|---|---|---|---|
| Vitrine (production + banc) | 24 | 96 | 13 | 11 | 0 | Liens externes (réseau du banc) |
| Propriétaire | 28 | 56 | 16 | 12 | 0 | Parcours : état des lieux, sollicitation d'un artisan, import du parc |
| Agence — responsable | 29 | 58 | 15 | 14 | 0 | — |
| Agence — agent | 31 | 62 | 21 | 10 | 0 (7 pages refusées, conforme) | — |
| Locataire | 14 | 28 | 6 | 6 | 2 (relevés de compteurs, reçu et quittance : données) | — |
| Artisan | 18 | 36 | 14 | 4 | 0 | Envoi réel de l'e-mail de devis |
| Super-administrateur | 38 | 76 | 20 | 14 | 4 (collecte de veille, rédaction par IA, validation d'un post, double authentification) | — |
| Largeurs intermédiaires | 21 | 63 | 21 | 1 (P3) | 0 | Tablette et téléphone réels |

Le détail écran par écran, avec les relevés automatiques, figure en **annexe A**.

Portée : « vérifié » vaut pour l'affichage aux formats indiqués et pour les actions
listées au § 6. Un écran vérifié n'est pas une validation de toute la plateforme. Les
règles de calcul (loyers, charges, fiscalité) ont fait l'objet d'audits dédiés et ne
sont pas réévaluées ici.

## 4. Mesures automatiques

| Mesure | Résultat | Lecture |
|---|---|---|
| Pages en erreur (HTTP ≥ 400) | **0** sur 412 | Toutes les pages s'ouvrent pour leur profil. |
| Erreurs JavaScript | **0** | Aucune page ne plante. |
| Débordement horizontal | **0** au téléphone, 0 aux largeurs intermédiaires | La mise en page s'adapte partout. |
| Accessibilité (axe, critique ou sérieux) | **6 écrans**, tous pour du contraste de couleur | Fiche bien (agence, propriétaire), accueil propriétaire, sécurité et espaces (super-admin). Aucune autre violation sur 206 écrans. |
| Images cassées | Journal en production (2 vignettes) ; photo de mission artisan sur le banc | Le journal est un vrai défaut (P2-V7) ; la photo artisan est un effet du banc (stockage en http). |
| Textes suspects | « Attestation indisponible » (locataire), « Indisponibles 0 » et « lecture indisponible » (super-admin) | Le premier est normal (impayés) ; les deux autres sont qualifiés au § 5.6. |
| Chargement (banc chargé, indicatif) | médiane 1,4 s, 90ᵉ centile 1,9 s | Les 6 pages à 12 s (mission artisan) attendent la photo bloquée du banc ; affichage réel en 0,2 s. |
| Chargement en production (pages publiques) | DOMContentLoaded 0,15 à 0,7 s, page complète en moins d'1 s | Très rapide. |
| Textes de moins de 12 px au téléphone | plus de 5 éléments sur 111 écrans | **Surestimé** : le robot compte les textes réservés aux lecteurs d'écran. Le vrai sujet est la barre du bas (10,5 px) et des surtitres à 11 px (P2-T2). |
| Cibles tactiles de moins de 32 px | Pages légales (liens dans le texte, acceptable) ; `/admin` (liens de 18 px) | P3. |

## 5. Constats par espace

Chaque constat indique l'écran, ce qui a été observé face à ce qui était attendu, la
preuve, l'impact, la correction proposée et le critère de réussite. Les preuves
(`production/017-1440` = capture robot ; autres noms = captures de parcours) sont
listées en annexe B. Les plus parlantes sont réunies sur la page visuelle de l'audit
(artefact privé : https://claude.ai/artifact/P77fhXzUQj7k5NbDX8J1qK).

**Priorités.**
- **P1** : bloque la vente, une tâche clé ou la confiance.
- **P2** : gêne nettement l'usage ou l'image.
- **P3** : finition.

### 5.1 Vitrine et inscription

**Notes** : agréable 7,5 · facile 7 · bien présenté 7 · donne confiance 5,5.

**Points forts.**
- Promesse comprise en 5 secondes.
- Tableau de bord fictif bien mis en scène dans le premier écran.
- Outils gratuits justes. Vérifiés : IRL 728,30 € pour 720 € et DPE D, révision
  interdite en F ; quittance partielle ; LMNP ; rentabilité 5,02 % brut.
- Les 34 liens internes répondent ; 0 violation d'accessibilité sur les 24 pages.

**P1-V1 — Le premier écran du compte dément la vitrine.**
- **Écran** : tableau de bord d'un compte neuf, 390 et 1440 px. Le bandeau est aussi
  présent dans les espaces propriétaire et agence ; voir P1-T1.
- **Observé** : « Les relances de loyer par e-mail, les avis d'échéance et les
  courriers d'abonnement sont suspendus. »
- **Attendu** : la vitrine promet « Relances et échéances qui vous trouvent » et
  « relances d'impayés ».
- **Preuve** : `insc-1440-10-premier-ecran`, `production/007-1440`.
- **Correction** : voir P1-T1.

**P1-V2 — Pas de médiateur de la consommation.**
- **Écran** : Mentions légales, 390 et 1440 px.
- **Observé** : « Médiation de la consommation : adhésion à venir, aucun organisme
  n'est désigné ». En production, les champs `mediateurNom`, `mediateurAdresse` et
  `mediateurSite` sont vides (relevé du 15/11).
- **Attendu** : pour tout contrat avec un consommateur, un médiateur désigné, dont le
  nom et le site sont publiés (Code de la consommation, articles L.612-1 et L.616-1).
- **Preuve** : `production/017-1440`.
- **Impact** : risque d'amende administrative ; « à venir » se lit comme « pas prêt ».
- **Correction** : adhérer à un médiateur référencé par la CECMC (commission
  d'évaluation et de contrôle de la médiation de la consommation), puis renseigner les
  trois champs. Ils alimentent les mentions légales, les conditions générales et
  Tarifs.
- **Critère** : les trois pages affichent le médiateur complet, et un juriste a
  validé.

**P2 — vitrine**

| Réf. | Écran | Observé (au lieu de l'attendu) | Preuve | Correction | Critère |
|---|---|---|---|---|---|
| P2-V1 | Mentions légales, Confidentialité, Conditions | Contact `gerimmo.contact@gmail.com`, confirmé par `curl` sur les 3 pages | `production/017-390` | `contact@gerimmo.app` et un alias pour les données personnelles | Plus aucune adresse gmail.com |
| P2-V2 | Accueil, Tarifs | Aucune preuve de confiance : ni fondateur, ni témoignage, ni vraie capture. L'hébergement à Paris n'est écrit que dans Confidentialité. | `production/000-1440` | Bloc « Qui est derrière Gerimmo », bandeau « Hébergé à Paris · Export · Sans engagement · Sans carte », 3 vraies captures ou une vidéo | 3 preuves visibles avant Tarifs |
| P2-V3 | Inscription | 9 champs, puis e-mail, « Continuer », et 10 informations redemandées. Le bouton s'appelle « Changer le mot de passe » alors qu'il n'y en a pas encore. | `insc-1440-07-mot-de-passe` | E-mail et nom seulement ; adresse demandée au premier document ; bouton « Créer mon compte » | 3 champs au plus avant l'e-mail, 3 écrans au plus jusqu'au tableau de bord |
| P2-V4 | Inscription | Erreur affichée en bas, sous les conditions ; code postal « ABC » accepté ; les deux mots de passe sont vidés si différents | `insc-390-03-erreur-serveur` | Erreur sous le champ fautif, curseur placé dessus, 5 chiffres exigés, saisie conservée | Chaque erreur visible à côté de son champ sans défiler |
| P2-V5 | Inscription, 1440 px | Liste « Vous louez en tant que » tronquée : « Personne physiqu » | `tuiles/insc-select-crop` | Champ en pleine largeur | Libellé entier lisible aux deux largeurs |
| P2-V6 | Tarifs | Prix expliqué dans un paragraphe ; bouton d'essai au style le plus faible ; curseur hors charte. Le calcul est juste (3 biens 9,97 €, 25 biens 24,85 €). | `production/005-1440` | Tableau d'exemples (1, 3, 5, 10, 20 biens), bouton plein, réassurance sous le bouton, détails en accordéon | Son prix trouvé en moins de 10 s |
| P2-V7 | Journal (production, 1440) | 2 vignettes cassées : `_next/image` répond 400, l'adresse absolue `https://www.gerimmo.app/marketing/…` n'est pas autorisée | `tuiles/jscroll-1440_01` | Dans `components/image-journal.tsx`, traiter les adresses du site comme des chemins locaux, ou autoriser l'hôte dans `images.remotePatterns` | Aucune image cassée sur /journal |

**P3 — vitrine.**
- **Journal** : veille générique et un sujet hors cible (« plan de décarbonation… pour
  les entreprises ») ; articles pour artisans mêlés à ceux des propriétaires.
- **Logo** : 60 × 48 px au téléphone, slogan illisible ; la feuille saisonnière passe
  pour un bouton (voir P3-T1).
- **Menu mobile** : « Se connecter » y figure deux fois, et « Créer mon compte » n'est
  qu'un lien texte.
- **Connexion** : « Identifiants invalides. » peu parlant ; pas de bouton pour afficher
  le mot de passe ; l'e-mail n'est pas reporté sur « Mot de passe oublié ».
- **Écran « Vérifiez votre boîte mail »** : il ne rappelle pas l'adresse et n'a pas de
  bouton « renvoyer ».
- **Pied de page** : une bande claire d'environ 25 px dessous, au téléphone.
- **Vocabulaire** : « La V1 », « cash-flow », apostrophes droites et courbes mêlées.
- **Outils à 390 px** : le résultat arrive très bas (LMNP : environ 2 400 px). La
  quittance affiche « Terme soldé » sur un trop-perçu.
- **Conditions générales** : pas de sommaire, pour 17 400 px de hauteur.

### 5.2 Espace propriétaire

**Notes** : agréable 8 · facile 6 · bien présenté 7.

**Points forts.**
- **Garde-fous juridiques intégrés** :
  - plafond du dépôt de garantie, avec un message précis ;
  - DPE et ERP exigés avant la mise en location, avec un bouton pour corriger ;
  - repère réglementaire pour savoir qui paie un incident ;
  - consentement du locataire avant toute quittance électronique.
- **Quittance conforme et élégante**, obtenue en un clic après l'encaissement (HTML et
  PDF).
- **« Avez-vous reçu vos loyers ? »** avec les réponses J'ai reçu / Reçu en partie /
  Pas encore reçu, et le suivi des relances.
- **Abonnement transparent** : prix par lot (11,96 € par mois pour 4 lots, cohérent avec
  Tarifs), essai sans carte, droit de rétractation expliqué, message rassurant sur le
  paiement non encore ouvert (« nous prolongeons votre essai »).
- L'encart « Terminer votre première location » oriente bien.

**P1-P1 — Bandeau « suspendus » et options inutilisables.** C'est le constat
transverse P1-T1. Côté propriétaire, les Préférences proposent en plus d'activer les
avis d'échéance et les relances automatiques (preuve : `p2-profil-enregistre-1440`).

**P1-P2 — Des chiffres qui se contredisent.**
- **Écran** : accueil, À faire, fenêtre d'arrivée, Finances ; 1440 px.
- **Observé** :
  - au départ, l'accueil indique « À vérifier : 2 demandes », mais « Toutes les
    demandes » mène à « Rien à traiter » ;
  - après activité, la fenêtre d'arrivée annonce 4 alertes, l'accueil 7, la page
    À faire 5 ;
  - 850 € reçus le 16/11 pour un bail qui commence le 01/12 sont bien comptés en
    recettes dans Finances, mais l'accueil affiche « Loyers encaissés en novembre :
    0,00 € — Aucun loyer attendu ce mois-ci ». L'étape « Le premier loyer encaissé —
    Déclarer l'encaissement » reste proposée.
- **Attendu** : le même nombre de tâches partout, et un encaissement qui fait avancer
  l'accueil.
- **Preuve** : `proprietaire/006-1440`, `proprietaire/014-1440`,
  `al1-synthese-arrivee-1440`, `loyer4-accueil-apres-1440` (vérifiée).
- **Impact** : le propriétaire vient de déclarer son premier loyer, et l'écran d'accueil
  lui dit le contraire.
- **Correction** :
  - une seule source « À faire » pour les trois vues ;
  - l'étape « premier loyer encaissé » validée par tout encaissement sur le bail ;
  - la tuile qui affiche « dont 850 € reçus d'avance ».
- **Critère** : mêmes compteurs sur les trois vues ; après un encaissement, l'étape est
  cochée et le montant apparaît.

**P1-P3 — Signature électronique vendue mais indisponible.**
- **Écran** : Abonnement face à l'assistant de bail, étape 7.
- **Observé** : l'abonnement vend la signature électronique « sans supplément, essai
  compris ». Le bail affiche « Signature en ligne en préparation » et « 6 crédits
  Zoho ».
- **Preuve** : `proprietaire/000-1440`, `bail-etape7-1440`.
- **Production** : la disponibilité dépend de la configuration Zoho
  (`src/app/actions/signature-bail.ts`, fonction `lireSignatureBail`). Au 19/10, les
  envois aux clients étaient désactivés en production et le wiki recommandait de ne
  pas promettre la signature ([[Prêt à démarcher]]). L'état actuel est **à confirmer**.
- **Correction** : aligner la promesse sur la réalité, et ne jamais montrer « crédits
  Zoho » au client.
- **Critère** : aucune fonction vendue sur Tarifs ou Abonnement n'est annoncée « en
  préparation » dans l'application.

**P2 — propriétaire**

| Réf. | Écran | Observé (au lieu de l'attendu) | Preuve | Correction | Critère |
|---|---|---|---|---|---|
| P2-P1 | Fiche du logement, bail | « Mettre en location » est caché dans un repli « Gérer le statut du lot », tout en bas. Le bail renvoie vers la fiche, et le retour dit « passé en Disponible ». | `lot-audit-mise-en-location-1440` | Bouton « Mettre en location » dans le récapitulatif du bail, avec ce qui manque | Mise en location possible sans quitter le bail |
| P2-P2 | Profil, bail | E-mail de contact non pré-rempli ; adresse du propriétaire redemandée dans le bail juste après le profil | `018-1440`, `bail-etape2-1440` | Pré-remplir depuis le compte et le profil | Aucune information saisie deux fois |
| P2-P3 | Fiche du lot, profil | « Identifiant fiscal » obligatoire pour continuer, sans « je ne sais pas » ni aide ; erreur brute du navigateur, loin du champ | `p2g-continuer-vide-1440`, `p2-profil-suivant-vide-1440` | Champ facultatif jusqu'à la génération du bail ; messages en français sous le champ (voir P2-T1) | — |
| P2-P4 | Quittance PDF | Deux pages, dont la seconde ne contient que la signature | `quittance.pdf` | Mise en page sur une page | Une page |
| P2-P5 | Documents | Baux signés rangés dans « Documents généraux » ; un dépôt fait depuis le filtre d'un bien n'y est pas rattaché ; chaque régénération crée un doublon de quittance | `d1-documents-1440` | Rattachement au bien, champ « bien » dans le formulaire, remplacement au lieu d'un doublon | — |
| P2-P6 | Export fiscal | Colonne « Lot » en identifiants techniques ; catégorie d'écriture en texte libre | `preparation-fiscale-2026.csv` | Nom du bien ; catégories alignées sur la déclaration 2044 | CSV lisible dans un tableur sans retouche |
| P2-P7 | Loyers, incidents | « Générer l'échéancier » répond « 0 appel(s) » puis réaffiche « générez l'échéancier », sans expliquer qu'un bail au 01/12 n'a pas encore d'échéance ; pas de confirmation après un encaissement ou une décision d'incident | `loyer2-apres-echeancier-1440` | Message explicite (« Première échéance le 01/12 ») et confirmation après chaque geste | — |
| P2-P8 | Finances, fiches | Jargon : « Clôturer un mois », « NOVEMBRE 2026 OUVERT », « imputation », « Qualité à compléter », « Au parc ». Une même action porte trois noms (« Ajouter une opération », « …une recette ou dépense », « …une écriture »). | `010-1440`, `011-1440`, `026-1440` | Vocabulaire de bailleur, un seul nom par action | — |
| P2-P9 | Fenêtre d'arrivée | « Zone tendue non renseignée » deux fois, sans le nom du bien ; le loyer impayé n'y figure pas | `al1-synthese-arrivee-1440` | Nommer le bien ; ordonner par gravité | — |

**P3 — propriétaire.**
- **Résiliation** : le texte d'introduction contredit « rien à résilier ».
- **Aide fiscale** : sélecteur d'année en double.
- **FAQ** : un « ? » seul sur sa ligne à 390 px.
- **Règles bailleurs, Données personnelles** : pages hors du cadre de l'espace ; le
  texte des Données personnelles est écrit pour un locataire.
- **Mes lots** : « 2 lots » au-dessus d'une liste de biens.
- **Carnet d'artisans** : bouton principal pâle, on le croit désactivé.
- **Alignements** :
  - « Voir le bâtiment » collé au bord de sa carte ;
  - « ← Finances » au milieu de l'en-tête ;
  - en-têtes de page de styles différents.
- **Typographie** : « 1 décembre », « 52.50 », « pièce(s) », « de Appartement », ordre
  Nom/Prénom variable.
- **Incohérences** :
  - bail actif « Fin non renseignée » alors que son récapitulatif indique 30/11/2029 ;
  - étapes du profil encore « À vérifier » après l'enregistrement ;
  - le propriétaire lui-même proposé comme garant.
- **Mobile** :
  - le bouton « Envoyer » des messages passe sous la barre du bas ;
  - les jours d'essai restants ne sont visibles qu'à l'ordinateur ;
  - la recherche montre deux fois « Bail — Bernard Lucas » sans le bien.
- **Statistiques et Agenda** ne parlent que des incidents. Proposition : rendement,
  occupation, échéances, fins de bail, révisions IRL.

### 5.3 Espace agence (responsable d'agence et agent)

**Notes** : agréable 7 · facile 6 · bien présenté 7.

**Points forts.**
- **Assistants exemplaires** (lot, bail, état des lieux) : compteur « à compléter » à
  chaque étape, récapitulatif cliquable, contrôles métier (plafond du dépôt, zone
  tendue).
- **Droits solides** : l'agent ne voit que son portefeuille (2 fiches au lieu de 4,
  1 lot au lieu de 18), sur les écrans comme par adresse directe.
- **États vides et retours d'action** pédagogiques.

**P1-A1 — Chiffres de loyers contradictoires.**
- **Écran** : tableau de bord de l'agence face à Loyers & charges, 1440 px.
- **Observé** :
  - avant tout encaissement : « Loyers de novembre 300 € — 43 % » sur le tableau de
    bord, mais « Encaissé 0,00 € » sur Loyers ;
  - après un encaissement de 700 € : « 1 000,00 € — 143 % des 700,00 € appelés »,
    mais « Encaissé 300,00 € · Reste dû 400,00 € ».
- **Explication** : le tableau de bord additionne l'argent reçu dans le mois. Loyers
  impute ce qui est reçu d'abord à l'arriéré.
- **Attendu** : le même chiffre, ou deux libellés qui disent clairement deux choses
  différentes.
- **Preuve** : `adm/005`, `adm/018`, `k01-dashboard-apres-encaissement`,
  `k02-loyers-apres-encaissement` (vérifiées).
- **Impact** : un gérant qui voit 143 % et 400 € dus sur la même journée ne fait plus
  confiance aux chiffres. C'est le cœur du produit.
- **Correction** : la tuile « Loyers de novembre » reprend la définition de Loyers
  (encaissé sur l'appelé du mois) et affiche à part « dont arriérés réglés : 700 € ».
  À défaut, la renommer « Reçu en novembre ». Vérifier le même calcul côté
  propriétaire.
- **Critère** : le tableau de bord et Loyers affichent le même encaissé du mois, et
  aucun pourcentage ne dépasse 100 % sans explication.

**P1-A2 — Impossible de retirer un collaborateur.**
- **Écran** : Administration, responsable d'agence.
- **Observé** : on peut seulement inviter. Il n'y a ni retrait, ni suspension, ni
  changement de rôle, ni relance d'invitation. Aucune action ni fonction de base ne le
  permet : vérifié dans `administration/page.tsx` et dans les migrations.
- **Attendu** : un responsable coupe l'accès d'un agent qui quitte l'agence.
- **Preuve** : `f03-admin-invite`.
- **Impact** : un ancien salarié garde l'accès aux données des locataires. Problème de
  sécurité et de RGPD, qu'un acheteur professionnel relèvera.
- **Correction** : « Retirer l'accès » (avec transfert du portefeuille), « Changer le
  rôle », « Renvoyer l'invitation » ; journalisation.
- **Critère** : révocation en 2 clics ; la session de l'agent se ferme ; ses pages
  répondent « accès retiré ».

**P1-A3 — Erreur de saisie invisible dans l'assistant de bail.**
- **Écran** : bail, étape Loyer, 1440 px.
- **Observé** : avec un dépôt de 2 400 €, le message « dépasse le plafond de 800 € »
  s'affiche sous l'en-tête fixe, hors de la vue. Le curseur n'est pas placé sur le
  champ. L'utilisateur croit que le bouton ne fait rien.
- **Preuve** : `c07-depot-trop-eleve`, `c07b-depot-erreur` (vérifiée : aucun message
  visible dans la fenêtre).
- **Correction** : marge de défilement d'au moins 90 px sous l'en-tête
  (`scroll-margin-top`), curseur placé sur le premier champ en erreur, résumé des
  erreurs près du bouton. Contrôler tous les assistants.
- **Critère** : l'erreur est visible sans défiler, à 390 comme à 1440 px.

**P2 — agence**

| Réf. | Écran | Observé (au lieu de l'attendu) | Preuve | Correction | Critère |
|---|---|---|---|---|---|
| P2-A1 | Menu | Administration et Abonnement sont les dernières entrées de « Plus », à 891 et 937 px dans une fenêtre de 900 px ; absentes du menu du compte | `a02-menu-compte` | Les ajouter au menu du compte | Visibles sans défiler en 1366 × 768 |
| P2-A2 | Agent sur une page réservée | « Cette page est introuvable… Pas encore de compte ? Découvrir Gerimmo », sans menu | `h-agent-administration` | « Réservé au responsable d'agence », dans l'espace, avec la personne à contacter | Un refus n'est jamais présenté comme une 404 |
| P2-A3 | Parc | Ni recherche ni filtre ; 4 lots visibles en 1440 ; liste de 3 900 px en 390 | `adm/020` | Filtres par statut, bien, mandant et agent ; vue tableau | Un lot trouvé en moins de 10 s parmi 50 |
| P2-A4 | Loyers | Encaissement en un clic, sans confirmation, date, mode ni montant ; écritures et honoraires passés aussitôt | `e01-loyers-avant`, `e02-loyers-apres-clic` | Fenêtre préremplie (date, mode, montant), puis « Annuler » pendant quelques secondes | Aucun encaissement sans confirmation |
| P2-A5 | Incidents | Deux cartes « Fuite / robinetterie » pour deux demandes différentes ; « À traiter 0 » alors que 2 incidents sont « À attribuer » | `adm/015` | Titrer avec la description du locataire ; compteur aligné | Compteur égal au nombre d'incidents à traiter |
| P2-A6 | Statistiques | Limitées aux incidents ; encaissements, vacance et honoraires restent sur le tableau de bord | `adm/027` | Réunir les indicateurs sur cette page | — |
| P2-A7 | Tableau de bord, 390 px | « À traiter aujourd'hui » commence vers 970 px | `adm/005-390` | Tuiles en grille 2 × 2 | Première tâche visible dans le premier écran |
| P2-A8 | Fiche lot, ajout de bien | « ← Mon portefeuille » pour l'admin, « ← Parc de l'agence » pour l'agent ; « Ajouter un bien » ouvre « Nouveau logement — Créer un lot » ; « Mandant E2E » et « E2E Mandant » pour la même personne | `adm/022`, `adm/023`, `c04-choisir-locataire` | Un seul libellé par notion | — |
| P2-A9 | Profil de l'agence | Page de 3 750 px, un seul bouton d'enregistrement, en bas | `adm/026` | Onglets | — |
| P2-A10 | Abonnement | « Le paiement en ligne n'est pas encore ouvert » | `f02-abonnement` | Décision commerciale (voir § 1) | — |

**P3 — agence.**
- **Données de démonstration** « E2E… » partout (voir P1-T3).
- **Fiche bien** : contraste insuffisant (4,3:1 et 3,67:1), barres « Qui paie » presque
  invisibles.
- **Typographie** :
  - « Le 1 du mois » au lieu de « 1er », « 2 pièce(s) », « 5.00 » au lieu de « 5,00 » ;
  - « Ecritures & rapports » sans accent dans le menu ;
  - codes couleur hexadécimaux montrés à l'agent ;
  - « périmètre validé : intervention humaine requise » après une invitation.
- **Alertes** : « 1 critique » dans le texte, mais le filtre affiche « Critiques 0 ».
- **Règles à connaître** : page vide, hors de l'espace, sans filtre « Agences ».
- **Agent** : il voit le parrainage de l'agence ; Documents est accessible mais absent
  de son menu.
- **Menu** : la même icône de clé à molette pour Incidents et Carnet d'artisans.
- **Tableau de bord à 768 px** : 3 tuiles puis 1 seule sur la ligne suivante.

### 5.4 Portail locataire

**Notes** : agréable 7,5 · facile 6 · bien présenté 7.

**Points forts.**
- Cadre soigné aux couleurs de l'agence ; barre du bas à pastilles bien adaptée au
  téléphone.
- Accompagnement concret : « Ce qui vous attend », « Qui paiera la réparation » (avec
  la référence au décret 87-712), numéros d'urgence cliquables, messages suggérés.
- Message au gestionnaire et signalement avec photo : envoyés, persistants, reçus par
  l'agence.

**P1-L1 — Aucun retour après « Confirmer ce rendez-vous ».**
- **Écran** : Mes demandes, surtout à 390 px.
- **Observé** : après le clic, la carte quitte l'écran et descend en fin de liste.
  Aucun message n'apparaît, le bandeau « Un rendez-vous attend votre choix » disparaît,
  et l'accueil ne mentionne pas le rendez-vous. Le rendez-vous est pourtant bien
  enregistré : il arrive dans l'agenda de l'artisan.
- **Attendu** : une confirmation visible et le rendez-vous rappelé sur l'accueil.
- **Preuve** : `L6-selection-390`, puis `L6-apres-1s-390` (vérifiées).
- **Impact** : le locataire croit que rien ne s'est passé, recommence ou appelle
  l'agence.
- **Correction** : message en haut « Rendez-vous confirmé : jeudi 19 novembre,
  9 h–11 h », carte en tête de liste, carte « Prochain rendez-vous » sur l'accueil.
- **Critère** : confirmation visible sans défiler ; rendez-vous présent sur
  l'accueil.

**P2 — locataire**

| Réf. | Écran | Observé (au lieu de l'attendu) | Preuve | Correction | Critère |
|---|---|---|---|---|---|
| P2-L1 | Mes demandes | Les discussions d'intervention s'affichent après toutes les cartes, sans dire à quelle demande elles se rattachent (`demandes/page.tsx`) | `L004-1440` | Discussion dans la carte de sa demande, titrée | Avec 2 interventions, chaque discussion est identifiable |
| P2-L2 | Mon logement | Préavis « zone en cours de vérification » pour Paris 12e | `L009` | Déduire la zone tendue de la commune | Préavis affiché sans réserve pour une commune connue |
| P2-L3 | Règles, Compte, Données, Relevés | Pages hors du cadre du portail : logo Gerimmo au lieu de celui de l'agence, plus de navigation. Règles propose le filtre « Propriétaires bailleurs » et est vide. Sur Relevés, « ← Mon logement » mène à l'accueil. | `L012`, `L001`, `L013`, `L006` | Garder le cadre du portail ; corriger le lien | Navigation identique sur toutes les pages |
| P2-L4 | Paiements, attestation | « restent dûs », « 1 autre mois sera soldés », « 1100,00 € » à côté de « 1 100,00 € », badge « Document en préparation » sans explication | `L000`, `L010` | Relecture des textes, formatage unique des montants | Aucune faute |

**P3 — locataire.**
- **Bloc « En cas d'urgence »** répété sur 4 pages, et placé avant les demandes au
  téléphone.
- **Actions présentées comme du texte** : « Aucun ne me convient », « Je ne peux plus
  être là ».
- **Compteur de photos faux** : il compte la facture et le devis comme des photos
  (fonction `mes_incidents_locataire`).
- **Compteurs incohérents** : « 4 en cours · 0 terminée » alors qu'une demande est
  « Réalisée ».
- **Photo déjà déposée refusée** avec un bouton « Réessayer » qui ne peut pas aboutir.
- **Jargon** : « responsable de traitement », « arbitrer un maintien justifié ».
- **Sécurité du compte, 1440 px** : l'e-mail est coupé en « examp/le.com ».

### 5.5 Portail artisan

**Notes** : agréable 8 · facile 7 · bien présenté 7,5.

**Points forts.**
- **Compte rendu au téléphone exemplaire** : grands boutons qui ouvrent la caméra,
  « Photo envoyée. », deux étapes seulement.
- **Chaîne complète et cohérente** : devis, rendez-vous, compte rendu, facture,
  attestation. Statuts clairs, devis PDF de qualité professionnelle, messages d'échec
  honnêtes.

**P1-R1 — Le devis bloque à la dernière étape.**
- **Écran** : Répondre à une demande de devis, 390 px.
- **Observé** : « Complétez l'adresse de votre entreprise dans Ma fiche entreprise
  avant de valider » n'apparaît qu'au moment de valider, après trois étapes de saisie.
  Le champ manquant est dans un autre onglet. Une fois l'adresse saisie, le PDF est
  propre et l'envoi bien enregistré.
- **Attendu** : être prévenu avant de commencer.
- **Preuve** : `A2-valide-1s-390` (vérifiée), `A2h-etape4-390`, `devis-pdf-1`.
- **Correction** : contrôler les prérequis dès l'étape 1 et sur l'accueil (« Ajoutez
  votre adresse pour envoyer des devis »), avec un champ de saisie sur place.
- **Critère** : un artisan sans adresse est prévenu avant toute saisie ; le compte de
  démonstration va jusqu'à l'envoi.

**P2 — artisan**

| Réf. | Écran | Observé (au lieu de l'attendu) | Preuve | Correction | Critère |
|---|---|---|---|---|---|
| P2-R1 | Devis | « Total HT : 0,00 € » avec une ligne 1 × 65 € saisie, tant que la TVA n'est pas choisie | `A004` | HT calculé dès la saisie | Le HT suit chaque frappe |
| P2-R2 | Agenda | On lui dit « gardez-les libres », mais les 3 créneaux proposés n'apparaissent pas dans la semaine | `A001`, `A007` | Créneaux proposés en pointillés | Créneaux visibles dans l'agenda |
| P2-R3 | Mon entreprise | « Pièces conformes » alors qu'aucune attestation n'est déposée | `A005`, `A002` | Statut calculé à partir des pièces | Cohérence entre les deux écrans |

**P3 — artisan.**
- **Feuille décorative** dans l'en-tête mobile : elle ressemble à un bouton.
- **« Mes règlements déclarés »** vide mais placé en tête de Facturation.
- **Flèches ↗** sur des liens internes.
- **Taux de TVA 2,1 %** proposé : à faire valider par un expert-comptable.
- **Un devis déjà validé se rouvre à l'étape 1.**

### 5.6 Console super-administrateur (usage interne)

**Notes** : agréable 7 · facile au quotidien 4 · bien présenté 5 · fonctions 7.

**Ce qui marche** :
- la recherche dans l'en-tête (un client trouvé en moins de 5 s) ;
- les alertes ;
- « Préparer le point » (1,8 s) ;
- la page support d'encaissement ;
- les filtres ;
- aucune erreur console.

**P1-S1 — Santé et connexions illisible, pastilles trompeuses.**
- **Écran** : `/admin/sante`, deux largeurs.
- **Observé** :
  - des identifiants techniques (`c14c3187-…· devis_demande · a_preparer ·
    0 tentative(s)`) ;
  - des noms de variables (« À poser : STRIPE_SECRET_KEY… projet Vercel ») ;
  - une pastille verte « posée » à côté de « non posée : inutile » et
    d'« interrupteur désactivé » ;
  - « 12 à vérifier » en vert ;
  - « 6 connexions manquantes + 1 à vérifier » dans l'en-tête, contre « 8 à
    vérifier » sur la pastille.
- **Preuve** : `superadmin/017-1440`, `live/c5-crop` (vérifiée).
- **Correction** : une ligne par impact métier (« Encaissements impossibles : Stripe
  non relié », avec qui doit agir), le détail technique replié, et des couleurs fixes
  (rouge bloque, orange à faire, vert en ordre).
- **Critère** : aucun identifiant dans la vue par défaut ; couleurs conformes à l'état
  réel ; compteurs égaux.

**P1-S2 — Le tour du matin ne dit pas quoi décider.**
- **Observé** :
  - la seule demande est « Rétablir la santé du service — 19 points bloquent », qui
    renvoie vers la page Santé ;
  - les points de vigilance sont vides tant qu'on n'a pas cliqué « Préparer le
    point » ;
  - 7 comptes rendus « À lire » disent tous « Aucun passage dans les dernières 24 h ».
- **Preuve** : `superadmin/002`, `033`, `live/a2`, `live/d1a`, `live/d1b`.
- **Correction** : la carte de décision cite les 3 points les plus graves, en clair,
  avec leur bouton ; le point est préparé la nuit ; les comptes rendus vides sont
  masqués.
- **Critère** : en moins de 30 s et sans clic, on sait « tout va bien » ou « voici
  les X décisions ».

**P1-S3 — Les loyers en retard s'affichent en vert, tout en bas.**
- **Observé** : « Échéances en retard 2 · Reste à recevoir 1 100,00 € » sur des tuiles
  vertes, à environ 1 900 px du haut. Le vert est figé dans
  `brief/faits-direction.module.css`, lignes 20-21.
- **Correction** : la couleur suit la valeur, et l'indicateur remonte dans le premier
  écran.
- **Critère** : tout retard non nul est rouge et visible sans défiler.

**P2 — super-administrateur.**
- **P2-S1 — Fiche organisation.**
  - Deux compteurs de lots (18 sous mandat, 19 gérés, base de facturation).
  - Ni offre, ni montant, ni échéance.
  - Le support n'est accessible qu'après « Entrer dans son espace ».
- **P2-S2 — Marketing.**
  - Un contenu « À diffuser » ne peut être ni refusé ni reporté (ces gestes
    n'existent que pour un post programmé).
  - Le visuel se renseigne en collant une adresse web, sans aperçu.
- **P2-S3 — Navigation.**
  - Menu plat de 17 entrées.
  - Corrections et idées éclatées sur 4 écrans ; veille rangée sous Sécurité.
  - Trois libellés de retour pour la même liste.
- **P2-S4 — Téléphone.**
  - Champ de recherche des prospects large de 26 px.
  - Équipes fait 6 179 px de haut, Territoire 5 938 px.
- **P2-S5 — Finances.** La résiliation pour impayé est décrite comme une manipulation
  manuelle dans Stripe, alors qu'elle a une portée juridique. Il faudrait un geste
  guidé qui contrôle le délai de 30 jours.

**P3 — super-administrateur.**
- Chiffres sans libellé (« 0 », « 1 », « 5 », « 12 »).
- « À vérifier » en vert ; « 0 à examiner » en orange.
- Accords : « 1 rôles », « Accès : Active », « 1 Sujets à traiter ».
- « 11 h (heure de Paris, 10 h en hiver) » affiché en novembre.
- Jargon « Markdown » ; barre d'enregistrement fixe qui masque environ 110 px au
  téléphone.
- Onglets sans état actif.
- « Indisponibles 0 » : la valeur est juste, mais le libellé trompe. Il compte les
  tâches dont l'état n'a pas pu être lu ; à renommer et à masquer à 0.
- « Double authentification : lecture indisponible » est une limite du banc (table
  d'authentification absente) ; en production, la lecture se fait.

### 5.7 Constats transverses

**P1-T1 — Bandeau « suspendus » permanent dans tous les espaces connectés.**
- **Écrans** : tous les écrans des espaces propriétaire et agence, à toutes les
  largeurs (le premier écran d'un nouvel inscrit compris).
- **Observé** : « Les relances de loyer par e-mail, les avis d'échéance et les
  courriers d'abonnement sont suspendus. Vous pouvez préparer vos relances en PDF. »
  - À 768 et 1024 px, sur le tableau de bord de l'agence, la carte « Gerimmo peut
    faire seul : envoyer les avis d'échéance, les quittances, les relances
    d'impayé… [Activer] » est placée juste en dessous.
  - Côté propriétaire, les Préférences proposent d'activer les avis d'échéance et les
    relances automatiques.
  - Le bandeau prend environ 100 px au téléphone.
  - La signature électronique vendue sur Abonnement est « en préparation » dans le
    bail (P1-P3) : c'est le même écart entre promesse et produit.
- **Cause** : `piloteLimite()` renvoie toujours `true` (`src/lib/perimetre-pilote.ts`).
  Le bandeau est donc présent en production pour tous les comptes.
- **Attendu** : aucune promesse de la vitrine démentie dans l'application, et aucun
  bouton « Activer » pour une fonction suspendue.
- **Preuve** : `proprio-accueil-1440`, `intermediaires/admin-agence-768`,
  `insc-1440-10-premier-ecran`, `adm/005`, `agt/000`.
- **Impact** : c'est la première phrase lue après l'inscription. Elle dit « ce produit
  n'est pas fini ».
- **Correction** (décision du porteur de projet) :
  - soit ouvrir ces envois avant la vente ;
  - soit retirer ces promesses de la vitrine et de Tarifs, déplacer l'information dans
    le réglage des relances et sur la page Loyers (« Relances : à préparer en PDF pour
    le moment »), et masquer « Activer » tant que la fonction est fermée.
- **Critère** : aucun bandeau sur le tableau de bord, Parc, Incidents ni Agenda ; pas
  de contradiction entre la vitrine ou l'abonnement et l'application.

**P1-T2 — Identité commerciale incomplète** (regroupe P1-V2 et P2-V1).
- **Constat** : médiateur absent, contact Gmail, paiement en ligne fermé.
- **Pourquoi c'est P1** : un acheteur, client ou repreneur lit ces trois signaux comme
  « pas prêt à encaisser ».

**P1-T3 — Pas de données de démonstration présentables.**
- **Écrans** : tous les espaces connectés, sur le banc et sur les comptes de recette.
- **Observé** :
  - « Bonjour E2E », « E2E Lot 1 », « E2E Plomberie Dubois », « Mandant E2E » ;
  - un bail PDF d'une ligne ;
  - aucune quittance ni reçu montrable (« 0 quittance sur 2 mois » : il manque
    l'identité du bailleur) ;
  - un artisan sans adresse ;
  - un occupant sans téléphone.
- **Impact** : le cœur du portail locataire, la quittance, ne peut pas être montré en
  rendez-vous.
- **Correction** : un jeu de données « vitrine », créé par un script de semis dédié,
  sur un compte de démonstration isolé :
  - un mois soldé avec sa quittance ;
  - un bail réaliste ;
  - des noms crédibles ;
  - un artisan complet ;
  - des incidents à plusieurs stades.
- **Critère** : chaque écran présenté en démonstration montre un cas rempli, sans
  libellé technique.

**P2-T1 — Formulaires : validation native, un champ à la fois.** Les bulles du
navigateur et les erreurs en bas de formulaire (inscription, assistants) cassent le
rythme. Il faudrait un modèle commun : erreur sous le champ, résumé près du bouton,
curseur placé sur le premier champ en erreur, en lien avec P1-A3, P2-V4 et P2-P3.

**P3 — transverses.**
- **P3-T1 — Feuille saisonnière** dans l'en-tête de tous les espaces et de la
  vitrine. Elle ressemble à un bouton qui ne fait rien. Il faudrait la retirer des
  pages publiques et des en-têtes mobiles, ou en faire un vrai élément expliqué.
- **P3-T2 — Titres en Georgia, une police système.**
  - `prestige.css` impose `Georgia, "Times New Roman", serif` aux titres, alors que
    `globals.css` annonce « plus d'empattements » et charge Manrope, qui reste
    inutilisée pour les titres.
  - Georgia est absente d'Android et de Linux : les titres y changent de dessin. Les
    captures du banc, sous Linux, montrent cette police de remplacement.
  - L'agence et le propriétaire relèvent aussi un mélange sans règle de titres avec et
    sans empattements : sous 640 px, les titres de section repassent en police sans
    empattement (`prestige.css`, ligne 598), et les titres de carte varient
    sur une même fiche.
  - Correction : auto-héberger une police de titres (comme Manrope et Figtree le
    sont), puis fixer une règle (titres de page à empattements, titres de carte sans).
  - Risque à confirmer sur un Android réel.
- **P2-T2 — Petits textes** (relevé P3 pour l'agence, P2 pour un public de bailleurs).
  - Jusqu'à 25 textes de moins de 12 px par écran au téléphone côté propriétaire (FAQ,
    Agenda, Abonnement).
  - Les libellés de la barre du bas sont en 10,5 px, et des informations utiles en
    11 px (« 650 € hors charges + 50 € de charges », heures de la chronologie des
    incidents, « 2/5 rubriques renseignées »).
  - Correction : 12 px au minimum pour toute information utile ; les surtitres en
    majuscules peuvent rester à 11 px.
- **P3-T3 — Contraste.** 6 écrans, listés au § 4.
- **P3-T4 — Navigateur de test en anglais.** Les dates « mm/dd/yyyy » et les bulles
  « Please fill out this field » viennent du navigateur du banc, pas de
  l'application. À confirmer sur un Chrome français et un iPhone.

## 6. Parcours éprouvés (résultat vérifié)

| Parcours | Résultat | Remarque |
|---|---|---|
| Inscription jusqu'au premier écran (390, 1440) | Réussi en 17 s | Premier écran coiffé du bandeau P1-T1 |
| Mauvais mot de passe, puis mot de passe oublié et réinitialisation | Réussi | Message neutre, nouveau mot de passe accepté |
| 5 outils gratuits | Réussis, valeurs vérifiées à la main | Cas limites : DPE F, saisie invalide, prix nul |
| Propriétaire : arrivée sur le tableau de bord | Partiel | L'encart « première location » oriente bien ; bandeau en premier ; « 2 demandes » contre « Rien à traiter » |
| Propriétaire : ajout d'un bien et d'un lot | Réussi après un détour | Bloqué tant que le profil est incomplet ; profil persistant après rechargement ; bien créé en 2 s, visible dans le parc |
| Propriétaire : bail, dépôt du bail signé, échéancier | Réussi, avec réserves | Notice générée en 10 s ; bail actif au dépôt du PDF signé ; signature en ligne indisponible (P1-P3) |
| Propriétaire : encaissement, quittance, retrait | Réussi | Échéance « Payé », quittance HTML et PDF ; retrait avec motif obligatoire ; l'accueil n'avance pas (P1-P2) |
| Propriétaire : incident, messages, écriture, export | Réussis | Décision d'incident persistante ; message persistant ; CSV obtenu mais peu lisible (P2-P6) |
| Propriétaire : état des lieux, sollicitation d'un artisan, import du parc | Non testés | — |
| Agence : création d'un bien et d'un lot | Réussi | « Détention enregistrée », lot créé en 4 s |
| Agence : mandat | Réussi | Brouillon, lot ajouté à 7 % |
| Agence : bail en 7 étapes | Réussi | Plafond du dépôt contrôlé, mais erreur cachée (P1-A3) |
| Agence : encaissement de 700 € | Réussi | Imputation expliquée ; écritures +700 € et honoraires −42 € passés ; pas de confirmation (P2-A4) |
| Agence : invitation d'un collaborateur | Réussi | E-mail bloqué par le banc, comme prévu ; pas de retrait possible (P1-A2) |
| Agent : 18 accès directs hors droits | Refusés | Aucune fuite ; la forme du refus est à revoir (P2-A2) |
| Agent : incident pris en charge, message au locataire | Réussis | Visibles des deux côtés |
| Locataire : message au gestionnaire | Réussi | Persiste après rechargement, reçu par l'agence |
| Locataire : signalement avec photo | Réussi | Visible côté agence |
| Locataire : choix d'un créneau | Enregistré, sans retour visible | P1-L1 |
| Locataire : document (bail) | Réussi | Visionneuse intégrée, PDF valide |
| Locataire : quittances, relevés | Bloqués | Données de démonstration (P1-T3) |
| Artisan : devis | Réussi après contournement | P1-R1 |
| Artisan : démarrer, compte rendu, bilan, facture, attestation | Réussis | Le locataire voit le compte rendu et peut noter |
| Super-admin : tour du matin, recherche d'un client, support | Réussis | 4 à 5 clics et 2 à 3 minutes pour une réponse ambiguë (P1-S2) |
| Super-admin : marketing, veille | Bloqués | Services externes absents du banc |

## 7. Feuille de route

Effort estimé : **S** = moins d'une journée, **M** = 1 à 3 jours, **L** = plus de
3 jours.

### Phase 0 — avant toute vente (environ 2 semaines)

| # | Action | Constats | Effort | Dépendance |
|---|---|---|---|---|
| 1 | Décider : ouvrir les envois ou retirer les promesses ; retirer le bandeau global, masquer « Activer » et les cases d'envoi automatique ; aligner la promesse de signature électronique | P1-T1, P1-V1, P1-P1, P1-P3 | S (retrait) à L (ouverture) | Décision du porteur |
| 2 | Adhérer à un médiateur et renseigner ses coordonnées ; passer à `contact@gerimmo.app` | P1-V2, P2-V1 | S (technique) | Démarche administrative |
| 3 | Aligner les chiffres : « Loyers du mois » entre tableau de bord et Loyers (agence et propriétaire), une seule source pour les tâches à faire, étape « premier loyer » validée par l'encaissement | P1-A1, P1-P2 | M | — |
| 4 | Retirer un collaborateur, changer son rôle, relancer une invitation | P1-A2 | M | Migration (chantier « Migrations Supabase ») |
| 5 | Modèle commun d'erreur de formulaire (marge sous l'en-tête, curseur sur le champ, résumé) | P1-A3, P2-V4, P2-T1 | M | — |
| 6 | Confirmation du rendez-vous et carte « Prochain rendez-vous » | P1-L1 | S | — |
| 7 | Prérequis du devis annoncés dès l'étape 1, HT calculé tout de suite | P1-R1, P2-R1 | S | — |
| 8 | Jeu de données de démonstration présentable | P1-T3 | M | Script de semis dédié, compte isolé |
| 9 | Réparer les 2 images du journal | P2-V7 | S | — |

### Phase 1 — premier mois de commercialisation

- **Inscription** : 3 champs, puis le mot de passe ; liste déroulante en pleine
  largeur (P2-V3, P2-V5).
- **Tarifs** : tableau d'exemples, bouton plein, réassurance (P2-V6).
- **Preuves de confiance** sur l'accueil (P2-V2).
- **Agence** :
  - Administration dans le menu du compte (P2-A1) ;
  - refus d'accès explicite au lieu de la 404 (P2-A2) ;
  - parc filtrable (P2-A3) ;
  - encaissement confirmé et annulable (P2-A4) ;
  - incidents titrés et comptés juste (P2-A5).
- **Propriétaire** :
  - « Mettre en location » dans le récapitulatif du bail (P2-P1) ;
  - pré-remplissage depuis le compte et le profil, identifiant fiscal facultatif
    (P2-P2, P2-P3) ;
  - quittance sur une page, documents rattachés à leur bien, export fiscal lisible
    (P2-P4 à P2-P6) ;
  - retours d'action, vocabulaire de bailleur, alertes qui nomment le bien (P2-P7 à
    P2-P9).
- **Locataire** : discussions rangées dans leur demande, préavis déduit de la commune,
  cadre conservé sur toutes les pages, relecture des textes (P2-L1 à P2-L4).
- **Artisan** : créneaux proposés visibles dans l'agenda, statut des pièces calculé
  (P2-R2, P2-R3).
- **Console** : page Santé écrite en impacts, tour du matin qui cite les décisions,
  couleurs des retards (P1-S1 à P1-S3).

### Phase 2 — finitions et évolutions

- **Console** : menu en 6 groupes (Aujourd'hui, Clients, Argent, Croissance, Produit
  et équipes, Réglages et conformité), une seule file d'approbation, une fiche client
  unique (P2-S1 à P2-S4), résiliation pour impayé guidée (P2-S5).
- **Agence** : statistiques complètes (P2-A6), tableau de bord mobile en grille
  (P2-A7), vocabulaire unifié (P2-A8), Profil en onglets (P2-A9).
- **Typographie** : police de titres auto-hébergée, règle d'usage, 12 px au minimum
  pour les informations utiles, contrastes (P3-T2, P2-T2, P3-T3).
- **Propriétaire** : statistiques et agenda élargis aux loyers, échéances, fins de bail
  et révisions.
- **Toutes les finitions P3** listées par espace.

**Prochaine étape recommandée.** Trancher le point 1 (ouvrir les envois ou retirer les
promesses) : c'est la seule décision métier qui conditionne le reste. Les points 3 à 7
peuvent partir en parallèle sur une branche dédiée, chacun avec son test de
régression.

## 8. Limites

- **Téléphone simulé.** Le 390 px est une simulation Chromium tactile, pas un
  téléphone réel ; Safari iOS et Chrome Android n'ont pas été testés.
- **Langue du navigateur.** Le navigateur du banc est en anglais : validations natives
  et formats de date. À refaire sur un appareil français.
- **Banc en http.** Les images stockées sont bloquées par la politique de sécurité (la
  photo de mission artisan apparaît cassée). En production, en https, elles devraient
  s'afficher ; à confirmer sur une préproduction.
- **Services externes absents.** Aucun e-mail, paiement, signature, IA, Meta ni
  collecte de veille n'a été déclenché. Les parcours qui en dépendent sont « bloqués ».
- **Production.** Pages publiques seulement, sans connexion ni écriture.
- **Données du banc.** Les revues ont créé des fiches fictives (biens « Audit — 5 rue
  Fictive », un encaissement, des incidents, un devis, une facture, une invitation).
  Certaines captures prises tard montrent donc des chiffres différents des premières.
- **Preuves.** Les captures sont dans le dossier de travail de la session, qui n'est
  pas conservé. Les 17 preuves clés sont reprises sur la page visuelle de l'audit
  (https://claude.ai/artifact/P77fhXzUQj7k5NbDX8J1qK) ; les autres se régénèrent avec le
  robot (`robot.cjs`, annexe B).

## 9. Contre-vérifications faites par l'auditeur principal

| Constat | Vérification |
|---|---|
| P1-T1 bandeau | `piloteLimite()` lu dans le code ; bandeau vu à 390, 768, 1024, 1366 et 1440 px côté propriétaire et agence |
| P1-V2, P2-V1 | `curl` des 3 pages légales en production : adresse Gmail présente ; champs du médiateur vides en base de production (lecture du 15/11) |
| P1-A1 | Captures `k01` et `k02` comparées : 1 000,00 € (143 %) contre 300,00 € encaissés |
| P1-P2 | Capture `loyer4-accueil-apres-1440` : « Loyers encaissés en novembre 0,00 € » et « Déclarer l'encaissement » après un encaissement de 850 € |
| P1-P3 | `lireSignatureBail` lu dans `src/app/actions/signature-bail.ts` (mode dépendant de la configuration Zoho) ; état de production au 19/10 dans [[Prêt à démarcher]] |
| P1-A2 | Aucune action serveur ni fonction SQL de retrait de membre dans `src/` et `supabase/migrations/` |
| P1-A3 | Capture `c07b` : aucun message d'erreur dans la fenêtre visible |
| P1-L1 | Captures `L6-selection-390` puis `L6-apres-1s-390` : la carte disparaît sans message |
| P1-R1 | Capture `A2-valide-1s-390` : erreur au dernier bouton |
| P1-S1 | Capture `live/c5-crop` : pastilles « posée » vertes face à « non posée » |
| P2-V7 | Requête `_next/image` en 400 relevée par le robot en production |
| P3-T2 | `prestige.css` (ligne 79) face à `globals.css` ; Georgia absente du banc Linux (`fc-list`) |

## Annexe A — couverture écran par écran (relevés automatiques)

Légende : « — » = aucun relevé automatique. Le statut final de chaque écran est celui
du § 3 et des tableaux du § 5. Les textes suspects des Conditions générales
(« momentanément indisponible ») sont du texte juridique normal.

#### Vitrine — production (www.gerimmo.app) (24 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Site vitrine (accueil marketing) | `/` | 200/200 | 27 textes < 12 px (390) |
| 001 | Conditions générales d’utilisation et de vente | `/conditions` | 200/200 | texte juridique « momentanément indisponible » (normal); 14 cibles < 32 px (390) |
| 002 | Conditions de l’espace artisan | `/conditions/artisans` | 200/200 | 11 cibles < 32 px (390) |
| 003 | Versions archivées des conditions générales | `/conditions/versions` | 200/200 | — |
| 004 | Politique de confidentialité | `/confidentialite` | 200/200 | 19 cibles < 32 px (390) |
| 005 | Tarifs | `/tarifs` | 200/200 | — |
| 006 | Agences de gestion — liste d’attente | `/agences` | 200/200 | — |
| 007 | Outils gratuits (index) | `/outils` | 200/200 | — |
| 008 | Outil gratuit — calcul de la révision IRL | `/outils/calcul-irl` | 200/200 | — |
| 009 | Outil gratuit — quittance de loyer | `/outils/quittance-de-loyer` | 200/200 | — |
| 010 | Outil gratuit — comparateur GLI / Visale | `/outils/comparateur-gli-visale` | 200/200 | — |
| 011 | Outil gratuit — simulateur LMNP | `/outils/simulateur-lmnp` | 200/200 | — |
| 012 | Outil gratuit — rentabilité locative | `/outils/rentabilite-locative` | 200/200 | — |
| 013 | Connexion | `/connexion` | 200/200 | — |
| 014 | Inscription (création de compte) | `/inscription` | 200/200 | — |
| 015 | Journal | `/journal` | 200/200 | image cassée (1440); 15 textes < 12 px (390) |
| 016 | Article du journal | `/journal/gerimmo-est-lance-gerez-votre-premier-logement` | 200/200 | — |
| 017 | Mentions légales | `/mentions-legales` | 200/200 | 8 textes < 12 px (390) |
| 018 | Mot de passe oublié | `/mot-de-passe-oublie` | 200/200 | — |
| 019 | Réinitialisation du mot de passe | `/nouveau-mot-de-passe` | 200/200 | — |
| 020 | Lien reçu par e-mail — bouton de confirmation | `/auth/confirmer` | 200/200 | — |
| 021 | Acte de cautionnement — la caution confirme son mobile | `/signature/caution/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | 200/200 | — |
| 022 | Invitation d’un propriétaire — l’artisan crée son compte | `/artisan/invitation/…` | 200/200 | — |
| 023 | Veille réglementaire publique | `/veille` | 200/200 | — |

#### Vitrine — banc (24 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Site vitrine (accueil marketing) | `/` | 200/200 | 25 textes < 12 px (390) |
| 001 | Conditions générales d’utilisation et de vente | `/conditions` | 200/200 | texte juridique « momentanément indisponible » (normal); 14 cibles < 32 px (390) |
| 002 | Conditions de l’espace artisan | `/conditions/artisans` | 200/200 | 11 cibles < 32 px (390) |
| 003 | Versions archivées des conditions générales | `/conditions/versions` | 200/200 | — |
| 004 | Politique de confidentialité | `/confidentialite` | 200/200 | 16 cibles < 32 px (390) |
| 005 | Tarifs | `/tarifs` | 200/200 | — |
| 006 | Agences de gestion — liste d’attente | `/agences` | 200/200 | — |
| 007 | Outils gratuits (index) | `/outils` | 200/200 | — |
| 008 | Outil gratuit — calcul de la révision IRL | `/outils/calcul-irl` | 200/200 | — |
| 009 | Outil gratuit — quittance de loyer | `/outils/quittance-de-loyer` | 200/200 | — |
| 010 | Outil gratuit — comparateur GLI / Visale | `/outils/comparateur-gli-visale` | 200/200 | — |
| 011 | Outil gratuit — simulateur LMNP | `/outils/simulateur-lmnp` | 200/200 | — |
| 012 | Outil gratuit — rentabilité locative | `/outils/rentabilite-locative` | 200/200 | — |
| 013 | Connexion | `/connexion` | 200/200 | — |
| 014 | Inscription (création de compte) | `/inscription` | 200/200 | — |
| 015 | Journal | `/journal` | 200/200 | — |
| 016 | Article du journal | `/journal/e2e-gerer-une-location` | 200/200 | — |
| 017 | Mentions légales | `/mentions-legales` | 200/200 | 9 textes < 12 px (390) |
| 018 | Mot de passe oublié | `/mot-de-passe-oublie` | 200/200 | — |
| 019 | Réinitialisation du mot de passe | `/nouveau-mot-de-passe` | 200/200 | — |
| 020 | Lien reçu par e-mail — bouton de confirmation | `/auth/confirmer` | 200/200 | — |
| 021 | Acte de cautionnement — la caution confirme son mobile | `/signature/caution/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA` | 200/200 | — |
| 022 | Invitation d’un propriétaire — l’artisan crée son compte | `/artisan/invitation/…` | 200/200 | — |
| 023 | Veille réglementaire publique | `/veille` | 200/200 | — |

#### Propriétaire (28 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Abonnement (propriétaire direct) | `/espace/…/abonnement` | 200/200 | 14 textes < 12 px (390) |
| 001 | Renoncer au contrat (rétractation) | `/espace/…/abonnement/retractation` | 200/200 | 8 textes < 12 px (390) |
| 002 | Résilier votre contrat | `/espace/…/abonnement/resiliation` | 200/200 | 8 textes < 12 px (390) |
| 003 | Aide fiscale (revenus fonciers) | `/espace/…/comptabilite/fiscal` | 200/200 | 7 textes < 12 px (390) |
| 004 | FAQ du propriétaire direct | `/espace/…/faq` | 200/200 | 25 textes < 12 px (390) |
| 005 | Règles pour les bailleurs | `/veille?public=bailleur` | 200/200 | — |
| 006 | Accueil du bailleur | `/espace/…` | 200/200 | contraste (1440); 13 textes < 12 px (390) |
| 007 | Mes lots | `/espace/…/parc` | 200/200 | 9 textes < 12 px (390) |
| 008 | Ajouter un bien | `/espace/…/parc/nouveau` | 200/200 | 8 textes < 12 px (390) |
| 009 | Locataires et garants | `/espace/…/personnes` | 200/200 | 10 textes < 12 px (390) |
| 010 | Loyers du bailleur | `/espace/…/loyers` | 200/200 | 8 textes < 12 px (390) |
| 011 | Livre recettes-dépenses | `/espace/…/comptabilite` | 200/200 | 8 textes < 12 px (390) |
| 012 | Incidents du bailleur | `/espace/…/incidents` | 200/200 | 7 textes < 12 px (390) |
| 013 | Déclarer un incident | `/espace/…/incidents/nouveau` | 200/200 | 7 textes < 12 px (390) |
| 014 | Alertes du bailleur | `/espace/…/alertes` | 200/200 | 8 textes < 12 px (390) |
| 015 | Agenda du bailleur | `/espace/…/agenda` | 200/200 | 20 textes < 12 px (390) |
| 016 | Statistiques du bailleur | `/espace/…/statistiques` | 200/200 | 8 textes < 12 px (390) |
| 017 | Messages du bailleur | `/espace/…/messages` | 200/200 | 8 textes < 12 px (390) |
| 018 | Paramètres du bailleur | `/espace/…/profil` | 200/200 | 8 textes < 12 px (390) |
| 019 | Documents du bailleur | `/espace/…/documents` | 200/200 | 8 textes < 12 px (390) |
| 020 | Catalogue du bailleur | `/espace/…/documents/catalogue` | 200/200 | 8 textes < 12 px (390) |
| 021 | Carnet d’artisans du bailleur | `/espace/…/artisans` | 200/200 | 8 textes < 12 px (390) |
| 022 | Journal dans l’espace connecté | `/espace/…/journal` | 200/200 | 7 textes < 12 px (390) |
| 023 | Article dans l’espace connecté | `/espace/…/journal/e2e-gerer-une-location` | 200/200 | 7 textes < 12 px (390) |
| 024 | Données personnelles et demandes privées — proprietaire | `/compte/donnees` | 200/200 | — |
| 025 | Fiche du logement propriétaire | `/espace/…/parc/…/lots/…` | 200/200 | 9 textes < 12 px (390) |
| 026 | Fiche du bien propriétaire | `/espace/…/parc/…` | 200/200 | contraste (1440); 11 textes < 12 px (390) |
| 027 | Ancienne adresse du lot (redirection) | `/espace/…/lots/…` | 200/200 | 9 textes < 12 px (390) |

#### Agence — agent (31 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Tableau de bord agence (partagé propriétaire) | `/agence/…` | 200/200 | 15 textes < 12 px (390) |
| 001 | Agenda de l’agence | `/agence/…/agenda` | 200/200 | 11 textes < 12 px (390) |
| 002 | Alertes | `/agence/…/alertes` | 200/200 | 14 textes < 12 px (390) |
| 003 | Réseau d’artisans | `/agence/…/artisans` | 200/200 | 12 textes < 12 px (390) |
| 004 | Fiche d'un bail | `/agence/…/baux/…` | 200/200 | 14 textes < 12 px (390) |
| 005 | État des lieux d'un bail | `/agence/…/baux/…/edl/…` | 200/200 | 10 textes < 12 px (390) |
| 006 | Comptabilité (quittancement, encaissements) | `/agence/…/comptabilite` | 200/200 | 13 textes < 12 px (390) |
| 007 | Diagnostic et alerte associée | `/agence/…/diagnostics/…` | 200/200 | 9 textes < 12 px (390) |
| 008 | GED — documents de l'organisation | `/agence/…/documents` | 200/200 | 11 textes < 12 px (390) |
| 009 | Catalogue documentaire | `/agence/…/documents/catalogue` | 200/200 | 9 textes < 12 px (390) |
| 010 | Liste des incidents | `/agence/…/incidents` | 200/200 | 14 textes < 12 px (390) |
| 011 | Détail d'un incident | `/agence/…/incidents/…` | 200/200 | 20 textes < 12 px (390) |
| 012 | Déclaration d'un incident | `/agence/…/incidents/nouveau` | 200/200 | 9 textes < 12 px (390) |
| 013 | Loyers et charges | `/agence/…/loyers` | 200/200 | 12 textes < 12 px (390) |
| 014 | Messagerie | `/agence/…/messages` | 200/200 | 11 textes < 12 px (390) |
| 015 | Parc / portefeuille de biens | `/agence/…/parc` | 200/200 | 13 textes < 12 px (390) |
| 016 | Fiche d'un bien | `/agence/…/parc/…` | 200/200 | contraste (1440); 11 textes < 12 px (390) |
| 017 | Fiche d'un lot | `/agence/…/parc/…/lots/…` | 200/200 | 10 textes < 12 px (390) |
| 018 | Renvoi d'un lot vers sa fiche (liens « à renseigner » d'un document) | `/agence/…/lots/…?vers=caracteristiques` | 200/200 | 11 textes < 12 px (390) |
| 019 | Ajout d'un bien | `/agence/…/parc/nouveau` | 200/200 | 12 textes < 12 px (390) |
| 020 | Annuaire des personnes | `/agence/…/personnes` | 200/200 | 12 textes < 12 px (390) |
| 021 | Fiche personne | `/agence/…/personnes/…` | 200/200 | 12 textes < 12 px (390) |
| 022 | Profil de l'agence / du propriétaire | `/agence/…/profil` | 200/200 | 11 textes < 12 px (390) |
| 023 | Statistiques | `/agence/…/statistiques` | 200/200 | 14 textes < 12 px (390) |
| 024 | Inscription artisan | `/artisan/inscription` | 200/200 | — |
| 025 | Assistance | `/assistance` | 200/200 | — |
| 026 | Sécurité du compte (mot de passe, second facteur) | `/compte` | 200/200 | — |
| 027 | Sélecteur d'espaces (tout utilisateur connecté) | `/espaces` | 200/200 | 15 textes < 12 px (390) |
| 028 | Règles pour les agents | `/veille?public=agence` | 200/200 | — |
| 029 | Journal dans l’espace connecté | `/agence/…/journal` | 200/200 | 9 textes < 12 px (390) |
| 030 | Article dans l’espace connecté | `/agence/…/journal/e2e-gerer-une-location` | 200/200 | 9 textes < 12 px (390) |

#### Agence — responsable d’agence (29 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Administration (équipe, portefeuilles) | `/agence/…/administration` | 200/200 | 15 textes < 12 px (390) |
| 001 | Reprise comptable | `/agence/…/comptabilite/reprise` | 200/200 | 12 textes < 12 px (390) |
| 002 | Mandats & versements | `/agence/…/mandats` | 200/200 | 12 textes < 12 px (390) |
| 003 | Importer un parc | `/agence/…/parc/import` | 200/200 | 10 textes < 12 px (390) |
| 004 | Règles pour les agences | `/veille?public=agence` | 200/200 | — |
| 005 | Tableau de bord agence (partagé propriétaire) — responsable | `/agence/…` | 200/200 | 16 textes < 12 px (390) |
| 006 | Agenda de l’agence — responsable | `/agence/…/agenda` | 200/200 | 12 textes < 12 px (390) |
| 007 | Alertes — responsable | `/agence/…/alertes` | 200/200 | 15 textes < 12 px (390) |
| 008 | Réseau d’artisans — responsable | `/agence/…/artisans` | 200/200 | 13 textes < 12 px (390) |
| 009 | Fiche d'un bail — responsable | `/agence/…/baux/…` | 200/200 | 15 textes < 12 px (390) |
| 010 | État des lieux d'un bail — responsable | `/agence/…/baux/…/edl/…` | 200/200 | 11 textes < 12 px (390) |
| 011 | Comptabilité (quittancement, encaissements) — responsable | `/agence/…/comptabilite` | 200/200 | 14 textes < 12 px (390) |
| 012 | Diagnostic et alerte associée — responsable | `/agence/…/diagnostics/…` | 200/200 | 10 textes < 12 px (390) |
| 013 | GED — documents de l'organisation — responsable | `/agence/…/documents` | 200/200 | 13 textes < 12 px (390) |
| 014 | Catalogue documentaire — responsable | `/agence/…/documents/catalogue` | 200/200 | 11 textes < 12 px (390) |
| 015 | Liste des incidents — responsable | `/agence/…/incidents` | 200/200 | 16 textes < 12 px (390) |
| 016 | Détail d'un incident — responsable | `/agence/…/incidents/…` | 200/200 | 22 textes < 12 px (390) |
| 017 | Déclaration d'un incident — responsable | `/agence/…/incidents/nouveau` | 200/200 | 11 textes < 12 px (390) |
| 018 | Loyers et charges — responsable | `/agence/…/loyers` | 200/200 | 12 textes < 12 px (390) |
| 019 | Messagerie — responsable | `/agence/…/messages` | 200/200 | 12 textes < 12 px (390) |
| 020 | Parc / portefeuille de biens — responsable | `/agence/…/parc` | 200/200 | 32 textes < 12 px (390) |
| 021 | Fiche d'un bien — responsable | `/agence/…/parc/…` | 200/200 | contraste (1440); 12 textes < 12 px (390) |
| 022 | Fiche d'un lot — responsable | `/agence/…/parc/…/lots/…` | 200/200 | 11 textes < 12 px (390) |
| 023 | Ajout d'un bien — responsable | `/agence/…/parc/nouveau` | 200/200 | 13 textes < 12 px (390) |
| 024 | Annuaire des personnes — responsable | `/agence/…/personnes` | 200/200 | 13 textes < 12 px (390) |
| 025 | Fiche personne — responsable | `/agence/…/personnes/…` | 200/200 | 13 textes < 12 px (390) |
| 026 | Profil de l'agence / du propriétaire — responsable | `/agence/…/profil` | 200/200 | 12 textes < 12 px (390) |
| 027 | Statistiques — responsable | `/agence/…/statistiques` | 200/200 | 15 textes < 12 px (390) |
| 028 | Réseau disponible pour les biens | `/agence/…/reseau` | 200/200 | 10 textes < 12 px (390) |

#### Locataire (14 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Attestation de bon paiement | `/attestation-loyer/…` | 200/200 | texte « Attestation indisponible pour l'instant » (390); texte « Attestation indisponible pour l'instant » (1440) |
| 001 | Sécurité du compte (locataire) | `/compte` | 200/200 | — |
| 002 | Tableau de bord locataire | `/locataire/…` | 200/200 | 9 textes < 12 px (390) |
| 003 | Contacter la gérance | `/locataire/…/contact` | 200/200 | 9 textes < 12 px (390) |
| 004 | Mes demandes | `/locataire/…/demandes` | 200/200 | 9 textes < 12 px (390) |
| 005 | Mes documents | `/locataire/…/documents` | 200/200 | 9 textes < 12 px (390) |
| 006 | Relevés de compteurs | `/locataire/…/releves` | 200/200 | 8 textes < 12 px (390) |
| 007 | FAQ locataire | `/locataire/…/faq` | 200/200 | 9 textes < 12 px (390) |
| 008 | Signaler un incident | `/locataire/…/incident` | 200/200 | 8 textes < 12 px (390) |
| 009 | Mon logement | `/locataire/…/logement` | 200/200 | 10 textes < 12 px (390) |
| 010 | Mes loyers & quittances | `/locataire/…/loyers` | 200/200 | 10 textes < 12 px (390) |
| 011 | Quittance / reçu imprimable (aussi vue côté agence) | `/quittance/…` | 200/200 | — |
| 012 | Règles pour les locataires | `/veille?public=locataire` | 200/200 | — |
| 013 | Données personnelles et demandes privées — locataire | `/compte/donnees` | 200/200 | — |

#### Artisan (18 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Accueil artisan | `/artisan` | 200/200 | — |
| 001 | Agenda artisan | `/artisan/agenda` | 200/200 | — |
| 002 | Attestations artisan | `/artisan/attestations` | 200/200 | — |
| 003 | Demandes de devis | `/artisan/devis` | 200/200 | — |
| 004 | Répondre à une demande | `/artisan/devis/…` | 200/200 | 6 textes < 12 px (390) |
| 005 | Mon entreprise | `/artisan/entreprise` | 200/200 | — |
| 006 | Facturation artisan | `/artisan/facturation` | 200/200 | — |
| 007 | Fiche mission | `/artisan/missions/…` | 200/200 | image cassée (390); 12 s (390); image cassée (1440); 12 s (1440) |
| 008 | Compte rendu de mission | `/artisan/missions/…/compte-rendu` | 200/200 | — |
| 009 | Bilan de mission | `/artisan/missions/…/compte-rendu/bilan` | 200/200 | image cassée (390); 12 s (390); image cassée (1440); 12 s (1440) |
| 010 | Proposer des créneaux | `/artisan/missions/…/creneaux` | 200/200 | — |
| 011 | Déposer ma facture | `/artisan/missions/…/facture` | 200/200 | image cassée (390); 13 s (390); image cassée (1440); 12 s (1440) |
| 012 | Ma note artisan | `/artisan/note` | 200/200 | 6 textes < 12 px (390) |
| 013 | Aide en cas de panne | `/artisan/panne` | 200/200 | — |
| 014 | Règles pour les artisans | `/artisan/regles` | 200/200 | — |
| 015 | Clients externes | `/artisan/clients` | 200/200 | — |
| 016 | Nouveau chantier et devis | `/artisan/devis/nouveau` | 200/200 | — |
| 017 | Données personnelles et demandes privées — artisan | `/compte/donnees` | 200/200 | — |

#### Super-administrateur (38 écrans)

| # | Écran | Chemin | HTTP 390/1440 | Relevés automatiques |
|---|---|---|---|---|
| 000 | Vue d’ensemble de la supervision | `/admin` | 200/200 | 44 textes < 12 px (390); 9 cibles < 32 px (390) |
| 001 | Artisans à valider | `/admin/artisans` | 200/200 | 11 textes < 12 px (390) |
| 002 | Aujourd’hui — le point du matin | `/admin/brief` | 200/200 | 13 textes < 12 px (390) |
| 003 | Le point du matin — détail d’une équipe | `/admin/brief/exploitation` | 200/200 | — |
| 004 | Clients (agences, propriétaires, artisans) | `/admin/clients` | 200/200 | 14 textes < 12 px (390) |
| 005 | Fiche de débogage d’un compte (état, rôles, journaux) | `/admin/comptes/…` | 200/200 | 6 textes < 12 px (390) |
| 006 | Fiche artisan | `/admin/clients/artisans/…` | 200/200 | 7 textes < 12 px (390) |
| 007 | Demandes de devis du site vitrine | `/admin/devis` | 200/200 | — |
| 008 | Historique et conservation | `/admin/journaux` | 200/200 | — |
| 009 | Liste d’attente des agences (inscriptions depuis /agences) | `/admin/liste-attente` | 200/200 | — |
| 010 | Détail d'une organisation | `/admin/organisations/…` | 200/200 | 6 textes < 12 px (390) |
| 011 | Assistance encadrée sur un encaissement | `/admin/organisations/…/support` | 200/200 | — |
| 012 | Ouvrir une organisation | `/admin/organisations/nouvelle` | 200/200 | — |
| 013 | Journal éditorial | `/admin/publications` | 200/200 | — |
| 014 | Éditer un article | `/admin/publications/…` | 200/200 | — |
| 015 | Créer un article | `/admin/publications/nouvelle` | 200/200 | — |
| 016 | Retours des utilisateurs | `/admin/retours` | 200/200 | 10 textes < 12 px (390) |
| 017 | Santé et connexions | `/admin/sante` | 200/200 | — |
| 018 | Développement territorial | `/admin/territoire` | 200/200 | 30 textes < 12 px (390) |
| 019 | Sécurité des données | `/securite` | 200/200 | — |
| 020 | Veille à superviser | `/admin/veille` | 200/200 | — |
| 021 | Développement du site | `/admin/autonomie` | 200/200 | 9 textes < 12 px (390) |
| 022 | Travail des équipes | `/admin/equipes` | 200/200 | texte « Indisponibles0 » (390); texte « Indisponibles0 » (1440); 32 textes < 12 px (390) |
| 023 | Agent marketing | `/admin/marketing` | 200/200 | 20 textes < 12 px (390) |
| 024 | Personnalisation des agences | `/admin/marque-blanche` | 200/200 | — |
| 025 | Relais de supervision | `/relais` | 200/200 | — |
| 026 | Relais en mon absence | `/admin/relais` | 200/200 | — |
| 027 | Paramètres | `/admin/parametres` | 200/200 | — |
| 028 | Réseau d’artisans : couverture par commune et métier | `/admin/couverture` | 200/200 | 198 textes < 12 px (390); 112 cibles < 32 px (390) |
| 029 | Consignes versionnées | `/admin/consignes` | 200/200 | — |
| 030 | Sécurité et accès | `/admin/securite` | 200/200 | texte « Double authentification : lecture indisp » (390); texte « Double authentification : lecture indisp » (1440); contraste (1440) |
| 031 | Fiche individuelle d’une personne | `/admin/clients/personnes/…` | 200/200 | — |
| 032 | Fiche prospect | `/admin/territoire/prospects/nouveau` | 200/200 | — |
| 033 | Décisions et exécution | `/admin/brief?vue=decisions` | 200/200 | — |
| 034 | Améliorations du produit | `/admin/autonomie?vue=ameliorations` | 200/200 | — |
| 035 | Annuaire des espaces | `/admin/clients?vue=espaces` | 200/200 | contraste (1440); 12 textes < 12 px (390) |
| 036 | Demandes privées de données et procédure de fermeture | `/admin/donnees` | 200/200 | — |
| 037 | Durées de conservation | `/admin/conservation` | 200/200 | — |

## Annexe B — preuves et outils

- **Captures du robot** : `resultats/<profil>/NNN-390.jpg` et `NNN-1440.jpg` (numéro
  NNN de l'annexe A), avec `resultats.json` par profil.
- **Captures de parcours** :
  - `revue-vitrine/` (`prod/`, `banc/`, `tuiles/`) ;
  - `revue-proprietaire/shots/` ;
  - `revue-agence/parcours/` ;
  - `revue-locataire-artisan/shots/` ;
  - `revue-admin/live/` et `revue-admin/planches/`.
- **Largeurs intermédiaires** : `intermediaires/` (768, 1024, 1366 px).
- **Outils** :
  - `robot.cjs` (parcours de lecture, mesures, axe) ;
  - `synthese.py` (agrégation) ;
  - `intermediaires.cjs` ;
  - la matrice `matrice-audit.json` (générée par `npm run e2e:matrice`) ;
  - `matrice-production.json`.

Ces fichiers sont dans le dossier de travail de la session d'audit du 16/11/2026, et
non dans le dépôt : les captures d'audit sont exclues par `.gitignore`.

## Liens

- [[Audit final indépendant — PR 335 — 15 novembre 2026]] : verdicts de publication,
  d'exploitation autonome et de souscriptions payantes.
- [[Contre-vérification ciblée — PR 335 — candidat 962f2c76]]
- [[Bilan de l'audit de la refonte #264 — 27 octobre 2026]]
- [[Audit final avant publication — 19 octobre 2026]]

> [!warning] Points à trancher / contradictions
> - **Envois suspendus ou promis ?** La vitrine et Tarifs promettent des relances et
>   des avis automatiques que l'application déclare suspendus (P1-T1). Une seule des
>   deux versions doit rester.
> - **Charte typographique.** `globals.css` (« plus d'empattements », 17/09) et
>   `prestige.css` (titres en Georgia) se contredisent. Le produit publié suit
>   `prestige.css`.
> - **Définition de « loyers encaissés du mois »** : argent reçu dans le mois (tableau
>   de bord) ou part réglée de l'appel du mois (Loyers) ? L'imputation au plus ancien
>   (RM-3.3.2, voir [[Plan d'apurement]]) justifie le chiffre de Loyers. La définition
>   de l'indicateur reste à fixer dans [[Quittancement des loyers]] et
>   [[Comptabilité]].
> - **Signature électronique** : vendue « sans supplément » sur Abonnement, « en
>   préparation » dans le bail. L'état de la configuration Zoho en production est à
>   confirmer ; [[Prêt à démarcher]] recommandait de ne pas la promettre.
> - **Taux de TVA 2,1 % proposé aux artisans** : à valider par un expert-comptable.

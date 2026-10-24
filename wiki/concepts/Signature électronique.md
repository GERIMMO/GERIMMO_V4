---
type: concept
tags: [signature, zoho-sign, yousign, demande-de-signature]
status: in-progress
created: 2026-07-24
updated: 2026-10-24
sources: ["[[2026-07-24-gerimmo-v3-module-13-signature-electronique]]", "app/docs/signature-electronique-bail.md (dossier technique Zoho Sign, 18-19/10/2026, complété le 24/10/2026)", "log.md — entrées « decision » et « deploy » des 18 et 19/10/2026 (Zoho Sign, PR #203 à #210)", "log.md — entrées « decision » du 23/10/2026 (« Cautionnement et état des lieux signés dans Gerimmo ») et du 24/10/2026 (choix délégués n° 1 et 8), « deploy » du 24/10/2026 (PR #246)", "[[Notification et valeur probante]]"]
---

# Signature électronique

## Conformité V1 du 24 octobre 2026 — en production (PR #246)

Décision du dirigeant du 23/10 (« le cautionnement et l'état des lieux doivent etre signé
sur gerimmo directement ! »), qui remplace la fermeture du cautionnement électronique et de
l'état des lieux à distance prévue par le plan juriste/DPO du 23/10 ; migration
`20261024120000_signature_caution_mobile_et_edl_sur_place.sql`.
- **Prestataire : Zoho Sign** (Europe), et non Yousign : aucun circuit Yousign en
  production, clés et webhook Youtrust révoqués le 23/10 ; l'ancien adaptateur reste dans le
  code pour lire les anciennes preuves.
- **Valeur** : signature par code à usage unique (SMS), **non qualifiée** au sens du
  règlement eIDAS, **sans présomption de fiabilité** ; preuve = PDF signé + **certificat de
  fin de signature commun à tous les signataires** (et non un certificat par signataire),
  enregistrés dans les Documents ([[Notification et valeur probante]]).
- **Acte de cautionnement** : la **caution confirme elle-même son numéro de mobile** par un
  lien à usage unique (sept jours au plus, empreinte seule en base) reçu à son adresse ; la
  page publique dit qui demande quoi (bailleur, logement, locataire, montant) ; le numéro
  n'est jamais prérempli, jamais celui d'une autre partie (bailleur, détenteur du lot,
  gestionnaire, organisation) ; la demande Zoho part alors avec ce numéro ; la caution saisit
  elle-même sa mention dans Zoho. Avant de générer l'acte, le bailleur coche « aucune
  assurance ni autre garantie » ([[Garantie]]). `ZOHO_SIGN_CAUTIONNEMENT_FERME` reste à
  `false` (posée à `true`, elle bloque aussi l'envoi du lien).
- **Garant qui signe aussi le bail** (choix délégué n° 1 du 24/10) : aligné sur la caution —
  il confirme lui-même son mobile, ou le numéro qu'il a confirmé pour l'acte de cautionnement
  du même bail est repris ; le bail attend « En attente du garant » puis part
  automatiquement ; sa page de signature dit qu'il reconnaît avoir reçu un exemplaire, sans
  s'engager comme caution par ce bail.
- **État des lieux** : signé dans Gerimmo, avec la confirmation « établi contradictoirement,
  sur place » à la date de la visite ; rappel au locataire de son droit de le compléter
  « dans les dix jours qui suivent son établissement » ([[État des lieux]]).
- **Invitation** : « Vos nom, adresse électronique et numéro de mobile sont transmis à notre
  prestataire de signature Zoho Sign pour ce seul document, à la demande de {bailleur}.
  Détails : {page confidentialité}. » L'adresse d'expédition reste celle du compte Zoho
  (adresse personnelle du dirigeant, décision du 22/10).
- **Mention refusée** alors que la demande est ouverte : la demande est rappelée chez Zoho ;
  la **date limite des signatures** est affichée avant l'envoi.
- **Mandat de gestion** : hors circuit (agences retirées de l'offre).
- **Conservation** : preuves de signature 36 mois après la fin du bail (`preuve:signature`),
  confirmations du mobile et sur place au journal d'audit dix ans
  ([[Durées de conservation]]).
- **Gestes et recettes restants** : comptage en lecture seule des actes envoyés avant le
  24/10 (à annuler et renvoyer) ; recette Zoho réelle à trois signataires (chacun reçoit-il
  l'exemplaire signé ?) ; recette d'un bail avec garant.

## État du 22 octobre — observation de production et préparation locale

Baux, autres documents et devis activés sur Vercel ; plafond mensuel 400 crédits et devis autorisés en base. Le dirigeant conserve son adresse personnelle comme identité de contact des signatures. L’état détaillé par acte et la protection contre la purge prématurée sont préparés localement. Le mandat d’agence et la représentation des personnes morales restent hors circuit ; l’état des lieux peut utiliser le circuit distant déjà présent ou la signature sur place. L’activation des rappels et la fermeture ciblée de la caution n’ont pas été relues après la nouvelle demande de double vérification de Vercel. Aucun nouvel envoi ni achat. Voir [le bilan complet](../../app/docs/signatures-conservation-22-octobre.md). Les observations du 19 octobre suivantes sont historiques.

> [!info] État au 19/10/2026 — circuit Zoho Sign publié, envois aux clients désactivés
> **Choix du 18/10 : Zoho Sign Europe.** Compte Zoho Sign Europe créé le 18/10 par le titulaire (essai Enterprise, connexion OAuth européenne autorisée) ; essai externe signé le 18/10 (invitation test à 15 h 19 heure de Paris, deux signatures par code SMS à 15 h 30, PDF et certificat téléchargés et relus) ; offre API payée par le titulaire (500 crédits affichés ; montant non consigné ; conditions de l'offre et droit d'intégration SaaS non confirmés).
>
> **En production** : migrations `20261018085521`, `20261018100243`, `20261018143644` (PR #203, `b5f70e6`, application 39149075958, 18/10 à 17 h 20 UTC) et `20261018185515`, `20261018193308` (PR #206, `6cb2468`, application 39161862763, 20 h 07 UTC) ; aucun script de retour pour ces cinq migrations (la section « Arrêt et retour » du dossier technique en tient lieu) ; webhook `/api/zoho-sign/webhook` actif, clé HMAC enregistrée en production ; PR #204 et #205 (diagnostic des refus du webhook, essai avec le compte permanent), #207 à #209 (mention de caution : contrôle serveur, champs uniques, accès téléphone), #210 (textes publics et abonnement décrivant Zoho Sign et les SMS). **Envois aux clients désactivés** : `ZOHO_SIGN_BAIL_ACTIF`, `ZOHO_SIGN_DOCUMENTS_ACTIF`, `ZOHO_SIGN_DEVIS_ACTIF` à faux, plafond mensuel à zéro ; essai réservé au compte permanent via `SIGNATURE_BAIL_ORGS_ESSAI` (marqueur serveur `app_metadata.gerimmo_recette=permanente-v1`). Le nouveau parcours prépare un PDF commun, les annexes et les emplacements de tous les signataires, propriétaires en dernier ; le circuit manuel (papier, dépôt du PDF signé) demeure disponible.
>
> **Périmètre** : propriétaire direct et personnes physiques ; bail (PR #203), puis, par la PR #206 : avenant, cautionnement (acte distinct du garant, mention manuscrite non préremplie, contrôle serveur par les PR #207 à #209), états des lieux, accord d'échelonnement, accord de travaux, acceptation de devis artisan. **En base au 19/10** : `bail_signature_circuits` = 5 circuits `zoho` en environnement `production` : 1 `bail` `termine` (`essai=false`, créé le 18/10 à 18 h 25 UTC), 2 `cautionnement` `annule` et 1 `cautionnement` `termine` (`essai=true`), 1 `devis_artisan` `termine` (`essai=true`). Aucune recette de production ne joue le circuit ; la recette humaine fictive (mention de caution, devis) demandée par le dossier avant toute ouverture aux clients n'est pas faite. Voir [le dossier technique](../../app/docs/signature-electronique-bail.md).
>
> *Note du 18/10 en journée, conservée pour l'histoire* : « Le titulaire ne possède pas encore de compte Zoho. L'adaptation locale conserve les anciens circuits Youtrust et attend la recette externe. … Aucun envoi ni changement de production dans ce chantier. … Périmètre actuel : propriétaire direct et personnes physiques ; bail uniquement. L'acte de cautionnement reste distinct et l'EDL garde son circuit sur place. »

**Historique du référentiel (Yousign, remplacé par Zoho Sign pour les nouveaux baux le 18/10/2026) :** le circuit de signature des documents engageants (**Yousign**,
signature **simple** : email + code SMS — RM-13.1.1). Objet : **Demande de
signature** (document + signataires).
Source : [[2026-07-24-gerimmo-v3-module-13-signature-electronique|Module 13]].

> [!note] Phasage acté (humain, 2026-07-25) — point n° 1 clos
> Démarche **itérative, sans forte intégration au départ** : en **V0** (usage
> interne), la signature reste **hors plateforme** — la GED assure d'abord le
> socle documentaire (**dépôt, consultation, téléchargement** du PDF signé).
> **Yousign est intégré en V1**, la première version ouverte aux utilisateurs.
> Cela réconcilie la décision du 2026-07-22 (« hors plateforme + dépôt PDF ») et la
> révision du référentiel (« Yousign dès la V1 ») : les deux sont vraies, séquencées.

## Le circuit

- **Séquentiel, bailleur en dernier** (RM-13.1.2) — il ne s'engage que sur un document
  déjà accepté. Ordres par type : [[Bail]] (locataire → colocataires → garants →
  bailleur/mandataire), acte de cautionnement ([[Garantie]] — garant seul),
  **[[Mandat de gestion]]** (propriétaire → agence), congé bailleur (agence seule).
- **Aucun compte à créer** (RM-13.2.1) : le signataire clique le lien reçu par email,
  consulte le document, reçoit un code SMS, signe — le
  [[Propriétaire bailleur|mandant]] signe ainsi **sans jamais entrer dans
  l'application** (RM-13.1.4). Email valide obligatoire (bloquant).
- **La dernière signature rapatrie le document signé en GED (horodaté) et déclenche le
  parcours métier** (RM-13.2.3/4) : bail actif + lot loué + échéancier + alerte EDL ;
  gestion activée ; garantie effective. Le document signé fait foi
  ([[Notification et valeur probante]] — Yousign porte le dossier de preuve).

## Machine à états (= registre A5)

préparée → envoyée → en cours → **complète** ; refusée → préparée ; expirée →
préparée ; annulée. **Une seule demande active par document** (RM-13.1.5) ; document
**non modifiable pendant la signature** (RM-13.2.7).

## Refus, relances, expiration

- **Refus = motif obligatoire** (RM-13.2.5 — « un refus est une information, pas un
  échec »), circuit interrompu (les suivants ne reçoivent rien), **agent alerté
  immédiatement**.
- **Relances automatiques J+7 et J+21**, **alerte agent à J+28**, **expiration à
  J+30** ; document expiré conservé en GED, **relançable en un clic sans
  régénération** (RM-13.4.5) ; signatures partielles conservées mais sans valeur.
- **Tant que rien n'est signé, le parcours métier reste bloqué** (RM-13.4.6) et le
  lot reste *disponible*.

## Périmètre

Bail/avenants, cautionnement, mandat — **pas les [[État des lieux|états des lieux]]**
(signature tactile sur place, RM-13.1.6). Signature avancée/qualifiée : hors périmètre
(« un bail d'habitation ne l'exige pas »). *Référentiel historique : depuis le 24/10/2026,
l'état des lieux se signe dans Gerimmo avec la confirmation « sur place » (RM-13.1.6 fermé,
voir le callout ci-dessous) ; le mandat est hors circuit.*

> [!warning] Points à trancher / contradictions (relevé du 19/10/2026)
> - ~~**États des lieux** : le référentiel (RM-13.1.6, ci-dessus), le circuit de transition V0 (« jamais un EDL ») et la note du 18/10 en journée (« l'EDL garde son circuit sur place ») excluent l'EDL de la signature électronique ; la PR #206 (18/10) ajoute pourtant « états des lieux » au circuit Zoho. **Question au dirigeant** : l'EDL doit-il être signable par Zoho Sign ?~~ → **RM-13.1.6 fermé le 23/10/2026 par la décision du dirigeant** « le cautionnement et l'état des lieux doivent etre signé sur gerimmo directement ! » : l'EDL est signable par Zoho Sign, avec la confirmation « établi contradictoirement, sur place » (code en production le 24/10, PR #246). La phrase « Les états des lieux conservent leur signature sur place » du dossier technique (section « Parcours livré ») est historique.
> - **24/10 — à confirmer sur Légifrance (source non ouverte le 23/10/2026)** : valeur d'une signature par code SMS pour l'acte de cautionnement et l'état des lieux (C. civ. 1366, 1367, 1175, 2297 ; décret 2017-1416 ; règlement 910/2014 art. 25-26 ; loi 89-462 art. 3-2 et 22-1) ; formule de la mention de caution (« ou l'une des autres cautions », C. civ. 2297 al. 2) ; délai de complément de l'état des lieux.
> - **24/10 — exemplaire signé remis à chaque partie (R28)** : non vérifié tant que la recette à trois signataires n'est pas faite ; la V1 n'écrit pas « Chaque signataire reçoit un exemplaire ».
> - **Avenants et cautionnement** : le dossier technique dit « Mandats et avenants ne sont pas intégrés dans ce circuit » (limites de la première version, PR #203) et « cette extension ajoute avenant, cautionnement » (PR #206) ; le cautionnement, que la note du 18/10 disait distinct, est intégré comme acte distinct du garant. Le mandat de gestion reste hors circuit.
> - **Offre Zoho** : paiement effectué par le titulaire (500 crédits affichés), montant non consigné ; conditions de l'offre et droit d'intégration SaaS non confirmés.
> - **Pages publiques** : la PR #210 décrit Zoho Sign et les SMS sur le site alors que les envois aux clients sont désactivés ([[Prêt à démarcher]]).

## Relations

Consomme les documents générés ([[Document]], module 12 — état « en signature » à
ajouter) ; déclenche les chaînes critiques ([[Machines à états et événements]] —
webhooks Yousign) ; alertes au module 14 ([[Agenda et échéances]]).

## Circuit de transition V0 — le signé déposé (2026-09-09)

En attendant Yousign (S10), l'application porte un circuit minimal honnête :
« Envoyer pour signature » (fiche de la pièce) place le document dans
« À signer » de l'espace du locataire ; il le télécharge, le signe hors ligne
et dépose le PDF signé ; le gestionnaire est alerté (`signature_retournee`,
routée vers la fiche GED) et le signé hérite des rattachements du document
d'origine. Gardes (audit 09/09) : types signables `bail`, `courrier`,
`quittance` seulement — **jamais un EDL** (RM-13.1.6) ni une pièce de dossier ;
signataire rattaché au document ; **espace locataire actif obligatoire** (pas
d'envoi dans le vide) ; une seule demande en attente par document et personne ;
demandes visibles et annulables sur la fiche de la pièce. Limites assumées vs
RM-13 : pas de dossier de preuve, pas de séquencement ni « bailleur en
dernier », pas de relances ni d'expiration — Yousign les apportera. La
**signature préenregistrée** de l'organisation ([[Organisation]]) est un tampon
d'émetteur (Famille 3, aucune valeur probante) apposé sur quittances, reçus et
courriers générés — jamais sur un bail ni un EDL.

> [!warning] Écarts explicites entre la cible métier et la version publiée (relevé du 18/10, complété le 19/10)
> - La réception du contrat et des preuves est automatique ; l’activation du bail reste une confirmation du propriétaire, avec les contrôles existants. L’automatisme métier du référentiel ci-dessus n’est donc pas livré.
> - Les relances J+7/J+21 et l’alerte J+28 restent à développer avant de les annoncer : **toujours absentes au 19/10** ; les rappels automatiques du prestataire ne sont pas utilisés (les tests contrôlent l'absence de relance automatique). L’expiration (30 jours après préparation) et le rapprochement du statut sont préparés.
> - Les mandats et les représentants de personnes morales restent hors du circuit. Avenants, cautionnement (acte distinct du garant), états des lieux, accords d'échelonnement et de travaux et acceptation de devis sont ajoutés au circuit par la PR #206 (18/10), envois aux clients désactivés (*au 18/10 en journée : hors de ce premier circuit*).
> - La délivrabilité e-mail/SMS, le rendu de la signature prestataire et ses preuves ont été vérifiés **une fois**, sur l'essai du titulaire du 18/10 (deux signatures SMS, PDF et certificat relus) ; la recette humaine fictive sur la mention de caution et le devis, demandée par le dossier technique avant ouverture aux clients, n'est pas faite ; aucune recette de production ne joue le circuit (*au 18/10 en journée : attendaient le compte API et une recette sandbox*).

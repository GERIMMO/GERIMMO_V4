---
type: synthesis
tags: [vision, ecosysteme, strategie, reference, marque, modele-economique]
status: draft
created: 2026-11-26
updated: 2026-11-26
sources: ["[[Proposition de valeur]]", "[[Feuille de route — plateforme de référence, 26 novembre 2026]]", "[[Passation — état du 26 novembre 2026]]", "[[Référentiel du palier 1]]", "[[Expansion territoriale autonome]]", "[[Grille tarifaire]]", "[[Prospection commerciale]]", "[[Relais du dirigeant]]", "DECISIONS-2026-11-24.md", "log.md (entrées query et decision, 19/08 au 26/11)", "Artefacts claude.ai : Vision Gerimmo (16/10), Catalogue exhaustif des besoins (16/10), Audit d'acquisition (03/10), Gerimmo avant vente (16/11), Logo officiel (29/09), Page d'attente (29/09), Directions visuelles (20/11), Charges d'immeuble (02/11), pense-bête juridique (21/07)"]
---

# Vision de l'écosystème Gerimmo

> [!info] Page de référence unique pour la vision (brouillon du 26/11/2026, à valider par le dirigeant)
> Cette page rassemble ce qui était dispersé dans des conversations, des artefacts et une quarantaine de pages du
> wiki. Pour chaque idée, elle dit **ce qui vaut aujourd'hui**. Ce qui a été abandonné figure en section 11, pour ne
> plus y revenir.
>
> En cas de contradiction, **la décision la plus récente du dirigeant l'emporte** (règle du [[Référentiel du palier 1]],
> Q2). Les conversations claude.ai elles-mêmes n'ont pas été lues, seulement ce qu'elles ont laissé : wiki, artefacts,
> décisions recopiées mot pour mot.

## 1. En une phrase

- **L'énoncé fondateur** (10/09/2026) : « Faire le travail d'une agence de gestion locative — en mieux, plus rapide,
  et moins cher. »
- **L'ambition** (26/11/2026, mot pour mot) : « FAIRE DE GERIMMO LA PLATEFORME PRINCIPALE DE GESTION IMMOBILIÈRE DE
  FRANCE ET POTENTIELLEMENT D'EUROPE. Toutes les entrées possible, carnet du locataire, aide pour les aides, gestion de
  l'administratif, des incidents, des artisans, des factures, des finances. L'objectif est que toute la gestion
  immobilière se passe sur Gerimmo. »
- **L'objectif de revenu**, dans le même message : « ME RENDRE RICHE !! ».
- **La marque** : GERIMMO, « L'immobilier en confiance ». Promesses relevées : « Louez en confiance, Gerimmo fait les
  papiers » et « Le sérieux d'une agence, sans les honoraires ».

## 2. Les principes qui ne changent pas

1. **Gerimmo exécute le travail.** Un module est terminé quand le travail qu'il couvre se fait tout seul, ou en un clic
   là où une agence y passe une heure ([[Proposition de valeur]]).
2. **Gerimmo est un logiciel, pas une agence.** Pas de gérance opérée, pas d'encaissement pour compte de tiers, pas de
   fonds mandants (10/09). Un journal de gestion, jamais une comptabilité de gérance.
3. **La loi d'abord.** « Tout doit respecter les textes de loi. Rien n'est noté « conforme » sans texte officiel lu. »
   (24/11)
4. **Gerimmo propose, le dirigeant décide.**
   - Les gestes sur l'argent, la publication et la vente restent au dirigeant.
   - Le super admin ne se fait passer pour personne et toutes ses actions sont enregistrées (25/09).
   - Le cœur du métier n'appelle jamais l'IA (règle R-IA-03).
5. **Simple à reprendre.** « Le projet doit rester simple à reprendre par un informaticien humain » (24/11).
6. **Aucune dépense hors des outils de développement.** « je ne paierai pas autre chose que Claude et Codex » (20/11).
   L'acquisition est donc d'abord gratuite.
7. **Des étages franchis par seuil, pas par calendrier.** « Un étage lancé sans les utilisateurs du précédent reste
   vide : c'est le seuil, pas le calendrier, qui décide du passage » (artefact Vision Gerimmo, 16/10).

## 3. Les acteurs

| Acteur | Rôle | Ce que Gerimmo lui apporte | Paie ? | Aujourd'hui |
|---|---|---|---|---|
| **Propriétaire bailleur** : en nom propre, en indivision, en SCI, patrimoine mixte, immeubles entiers | Le cœur de la cible (« le cœur de l'appli », 19/08) | Toute la gestion courante, de l'entrée à la sortie du locataire, plus la fiscalité | **Oui**, abonnement par bien | En production ; vente le 30/11 |
| **Locataire** | Invité par son bailleur | Son espace : bail, loyers, quittances, documents, incidents, demandes | Non | En production, sur invitation seulement |
| **Garant** | Signe le cautionnement | Signature en ligne, information en cas de plan d'apurement | Non | En production |
| **Artisan** | Invité par un bailleur ou inscrit seul, il choisit sa zone et ses métiers, puis Gerimmo le valide | Devis, créneaux, compte rendu, facture, clients externes | Non : gratuit et sans commission (23/10) | En production |
| **Agence** : administrateur et agents | Gestion sous mandat (palier 2) | Mandats, portefeuilles, honoraires, rapports, [[Marque blanche]] | Oui, hors taxe (grille du code non publiée) | Codé, non vendu ; liste d'attente |
| **Propriétaire mandant** | Client d'une agence | Reçoit les rapports, sans compte (25/07) | Paie l'agence | — |
| **Syndic** | Tiers en copropriété | Ses appels de charges sont saisis et répartis | — | Module syndic mis de côté |
| **Organismes publics** : CAF, Action Logement (Visale, Loca-Pass), Anah, département (FSL), ADEME (DPE) | Versent ou garantissent | Demain : « aide pour les aides » | — | Dossier CAF et attestation de loyer seulement |
| **Partenaires à venir** : assureurs (GLI, PNO, habitation), diagnostiqueurs, multidiffuseur d'annonces, agrégateur bancaire, conseiller agréé AMF, expert-comptable | Services vendus aux utilisateurs | Accès à la clientèle de Gerimmo | Commissions d'apport, envisagées | Aucun partenariat |
| **Prestataires techniques** : Stripe, Zoho Sign, Supabase, Vercel, Resend, Scaleway, OpenAI, Meta | Font tourner Gerimmo | — | Payés par Gerimmo | En place |
| **L'équipe** : le dirigeant (super admin), Claude (construit), Codex (contrôle et corrige) ; juriste et expert-comptable ponctuels | « Un fondateur, deux IA » (16/10) | — | — | Premier recrutement « quand les revenus le permettront » |

## 4. Le schéma de l'écosystème

```
ACQUISITION  (aucun démarchage direct de particulier)
  outils gratuits · journal · Facebook · Google · « Être rappelé » · entourage · parrainage ──► particuliers et SCI
  e-mail du dirigeant aux professionnels (opposition possible) ──► artisans, agences
  demain : carnet du locataire · aide pour les aides ──► bailleurs amenés par leurs locataires

            ┌──────────────────────────── GERIMMO ────────────────────────────┐
 Bailleur ──┤ espace propriétaire ─ invite ─► espace locataire                │
  ou SCI    │        └─ invite ─► espace artisan ◄─ inscription libre (zone)  │
            │ console du dirigeant · tâches automatiques · IA coupable d'un clic │
            └─────────────────────────────────────────────────────────────────┘

ARGENT
  Locataire ──loyer──► Bailleur        (hors Gerimmo, virement sur l'IBAN du bailleur)
  Bailleur ──facture──► Artisan        (hors Gerimmo, règlement seulement déclaré)
  Bailleur / SCI ──abonnement (Stripe)──► Gerimmo (vendeur : entrepreneur individuel)
  Agence ──abonnement HT──► Gerimmo    (palier 2, pas encore vendu)
  Demain : partenaires ──commissions──► Gerimmo
```

## 5. Les portes d'entrée

| Porte | Aujourd'hui | Demain |
|---|---|---|
| **Particulier, SCI** | Vitrine, 5 outils gratuits, journal, Facebook, Google, « Être rappelé », parrainage ; inscription libre et essai de 2 mois | Pages par ville, comparatifs, affiliation |
| **Locataire** | Invitation de son bailleur | **Carnet du locataire** : il s'inscrit seul, garde son historique d'un bail à l'autre, et invite son bailleur |
| **Artisan** | Inscription libre et invitation | Il amène ses clients bailleurs |
| **Agence** | Liste d'attente sur `/agences` | Libre-service, date à décider |
| **Aides** | Aucune | « **Aide pour les aides** » : APL en tiers payant, Visale, MaPrimeRénov', Loc'Avantages, Loca-Pass et FSL |
| **Europe** | — | La Belgique d'abord (Bruxelles et Wallonie) |

## 6. Les étages de la plateforme

Les quatre étages de l'artefact Vision Gerimmo (16/10) et les trois de la [[Feuille de route — plateforme de référence, 26 novembre 2026]]
sont réunis ici en un seul modèle. **Proposition à valider.**

| Étage | Ce que Gerimmo devient | Contenu | Seuil indicatif pour passer au suivant |
|---|---|---|---|
| **1 — Le bailleur gère tout seul** | En production ; vente le 30/11 | Biens, baux, loyers, quittances, relances, plan d'apurement, IRL, charges, taxe foncière, états des lieux, incidents et artisans, documents, 2044 | 20 abonnés payants (16/10) |
| **2 — Le socle complet et le locataire qui entre** | Premier semestre 2027 | Synchronisation bancaire ; paiement du loyer vers l'IBAN du bailleur ; mise en location (annonces par un multidiffuseur, candidatures, DossierFacile) ; carnet du locataire ; aide pour les aides ; fiscalité complète (meublé, SCI à l'IS, nouveau statut du bailleur privé) ; application installable | Assez d'annonces et de locataires inscrits |
| **3 — Les professionnels** | Second semestre 2027 | Agences en libre-service et marque blanche ; outils de l'artisan (planning, facturation) | Un réseau d'artisans actif, des revenus stables |
| **4 — La place de marché et l'Europe** | 2028 et au-delà | Partenaires (assurances, diagnostics, conseil agréé) ; Belgique, puis Luxembourg | — |

Objectifs datés de l'artefact Vision (16/10), donnés pour la mi-janvier 2027 comme des ordres de grandeur : 50
propriétaires inscrits, 20 abonnés payants, 10 artisans actifs, 2 agences pilotes. **Ils sont à recaler** : la vente
n'ouvre que le 30/11, et le premier prélèvement tombe à la fin de l'essai de 2 mois.

## 7. Le modèle économique

**En vigueur** (code du 11/11, `app/src/lib/tarifs.ts`, [[Grille tarifaire]]) :
- **Particuliers et SCI** : 5,99 €/mois pour le 1ᵉʳ bien, +1,99 € par bien jusqu'à 7 biens, 19,90 € de 8 à 20 biens,
  +0,99 € par bien au-delà. L'annuel vaut 10 mois. Prix TTC, franchise de TVA.
- **Essai** : 2 mois, sans carte. Une souscription pendant l'essai ne prélève rien avant sa fin.
- **Parrainage** : 1 mois offert au parrain quand son filleul paie.
- **Gratuit** : le locataire, l'artisan, les outils publics. La quittance ne se facture pas au locataire (pense-bête
  juridique, 21/07).
- **Agences** : 49 € HT jusqu'à 10 lots, puis 4,90 € par lot. Grille du code, non publiée.

**Pistes non tranchées** :
- un palier plus élevé pour les multipropriétaires ;
- un premier bien gratuit, mais limité, face à Rentila ;
- la fiscalité en option ;
- les assurances, d'abord par simple mise en relation, puis avec une immatriculation ORIAS quand le volume le justifie ;
- la mise en avant des annonces ;
- les frais de prélèvement ;
- une commission sur les artisans (contraire à la décision du 23/10).

Ordres de grandeur du revenu : section 4 de la [[Feuille de route — plateforme de référence, 26 novembre 2026]].

## 8. Acquisition : les règles

- **Interdit** : tout démarchage direct des particuliers (19/09) ; tout courriel commercial à un particulier sans son
  consentement (23/10) ; tout message envoyé par Gerimmo lui-même à un prospect ([[Prospection commerciale]]).
- **Autorisé** : vers les particuliers, la publicité, le parrainage, le référencement, les outils gratuits, le journal et
  l'entourage. Vers les artisans et les agences, des messages du dirigeant, si l'adresse vient d'eux, pour leur métier,
  avec une possibilité d'opposition dans chaque message.
- **Budget** : aucune dépense publicitaire tant que la règle « Claude et Codex » tient (20/11). La publicité Meta prévue
  par l'[[Expansion territoriale autonome]] attend donc une décision et un montant.
- **Territoire** : la gestion locative est nationale ; le réseau d'artisans suit les zones choisies par les artisans
  (23/10) ; l'Europe vient ensuite.

## 9. L'IA et l'automatisation

- **Ce qui existe** :
  - 14 tâches Vercel et une douzaine de tâches dans la base ;
  - le [[Relais du dirigeant]] : e-mail chaque jour à 5 h, et tout de suite pour une urgence ;
  - le journal éditorial publié automatiquement, avec la mention « Rédigé avec l'aide de l'IA » (24/11) ;
  - un interrupteur qui coupe toute l'IA, et un plafond d'appels par jour.
- **Ce qui est codé mais fermé** : les cinq envois automatiques (avis d'échéance, relances, rappels). Tant qu'ils sont
  fermés, la promesse « quittances envoyées d'elles-mêmes » n'est pas tenue.
- **Ce qui n'existe pas** : les « équipes d'agents » de la console. L'inventaire du 14/10 n'en trouve aucune : ce sont
  des tâches programmées, pas des agents.
- **Le principe** : Gerimmo prépare, le dirigeant valide, en une heure chaque matin (25/09).

## 10. La marque

- **Logo** (29/09) : un toit en arc, une clé, une ligne de sol ; or champagne `#D3B677` sur encre `#14304F` ; nom en
  Cormorant Garamond, en capitales espacées. Jamais l'or seul sur fond blanc.
- **Interface** : la direction « A — Maison » (20/11) : bleu nuit et champagne, titres Fraunces, texte Figtree,
  chiffres Manrope.
- **Ton** : un français simple et honnête. Pas de preuve sociale inventée, « (à venir) » quand une information manque,
  et une interface qui se comprend au lieu de s'expliquer.

## 11. Ce qui est abandonné (ne plus en parler)

| Idée | Abandonnée le | Remplacée par |
|---|---|---|
| Bot Telegram | 25/07 | — |
| Bot WhatsApp « en V1 » | 20/09, reporté | Non construit ; son retour est une question ouverte (C-38) |
| Yousign | 18/10 | Zoho Sign |
| Premier bien gratuit à vie | 28/09 | Essai de 2 mois (une piste le rouvre) |
| Grille Solo, Bailleur, Investisseur, Patrimoine | 11/11 | Abonnement unique |
| Offre « 100 premiers inscrits, 6 mois offerts » (29/09) | — | Au plus 10 « fondateurs », 6 mois offerts |
| Super admin qui se fait passer pour l'utilisateur | 25/09 | Super admin journalisé, sans emprunt d'identité |
| Réseau d'artisans ouvert commune par commune par le super admin | 23/10 | Zone choisie par l'artisan |
| Signature humaine de chaque article du journal | 24/11 | Parution automatique avec la mention IA |
| Page d'attente des particuliers | — | Inscription libre |
| Identité visuelle « bleu électrique » (01/10) | 20/11 | « A — Maison » |
| Point quotidien à 6 h par WhatsApp | — | E-mail du relais à 5 h |
| Application native | — | Site adapté au mobile ; application installable envisagée |

## 12. Questions de vision à trancher

1. **Artisan** : gratuit pour toujours (23/10), ou abonnement et commission à l'étage 3 (16/10, 26/11) ?
2. **Premier bien gratuit**, limité, face à Rentila ?
3. **Palier plus élevé pour les multipropriétaires** ?
4. **WhatsApp** : y revient-on (C-38) ?
5. **Agences** : quand ouvrir le libre-service ?
6. **Publicité payante** : budget zéro maintenu ?
7. **Objectifs chiffrés** : quels seuils pour fin janvier et pour fin juin 2027 ?
8. **Europe** : la Belgique en premier, confirmé ?

> [!warning] Points à trancher / contradictions
> - **Grille tarifaire** : [[Abonnement]], [[Accueil]], [[Super Admin]], [[Calendrier de lancement — 30 novembre 2026]]
>   et le [[Référentiel du palier 1]] (R-ABO-01, R-ABO-03) donnent encore la grille du 28/09 et l'offre de lancement.
>   Le code applique l'abonnement unique du 11/11. Pour les agences, le wiki dit 39 € HT et le code 49 € HT.
> - **Fonctions disparues** : [[Analyse concurrentielle]] et [[Fonctionnalités par persona]] présentent des bots
>   Telegram ou WhatsApp comme existants ; [[Proposition de valeur]] cite « Yousign, WhatsApp » en V1.
> - **Super admin** : la page [[Super Admin]] garde le motif de l'emprunt d'identité (C-42).
> - **Pages en retard** : [[Prêt à démarcher]] et [[Artisan]] disent encore que les « clients externes » sont
>   désactivés et que le réseau s'ouvre commune par commune.
> - **Clients réels** : les audits du 16/11 parlent d'un pilote auprès de deux vrais propriétaires ; le 22/11, le
>   dirigeant dit que les inscrits sont des comptes de test.
> - **Vitrine** : elle promet des quittances envoyées d'elles-mêmes, alors que les envois automatiques sont fermés.
> - **Couleur or** : trois teintes coexistent (`#C9A227`, `#D3B677`, `#D5B777`).
> - **L'artefact Vision Gerimmo (16/10)** présente le bot WhatsApp comme existant et l'encaissement des loyers par
>   Stripe comme prévu. Ces deux points sont contredits par le code et par la frontière du 10/09.

---
type: source
tags: [maquette, prototype, charte, v3, parcours]
status: stable
created: 2026-09-04
updated: 2026-09-04
sources: []
source-file: raw/maquettes/2026-09-04-gerimmo-prototype-v3.html
source-type: maquette cliquable (HTML autonome)
source-date: 2026-09-04
---

# Maquette v3 — prototype cliquable (4 septembre 2026)

Troisième version du prototype cliquable remis par Tahir (les deux premières :
[[Maquette — prototype cliquable (charte v2)]] du 8/08 et la révision du 23/08).
Déposée dans `raw/maquettes/2026-09-04-gerimmo-prototype-v3.html`. Demande
associée : **intégrer à l'application les fonctionnalités et le visuel**.

Particularité technique : la v3 est repartie d'un état **antérieur à la « passe
UX » du 23/08** (animations de sortie, spinners, piège de focus, saisies
mémorisées — absents de la v3). Ces raffinements existent déjà dans
l'application : la v3 fait foi pour le **contenu et les parcours**, la passe UX
du 23/08 reste acquise.

## 1. Ce que la v3 ajoute (inventaire complet, diff contre la v2 du 23/08)

### Parcours d'entrée (écrans publics)

- **Inscription propriétaire enrichie** : choix nom propre / société (SCI +
  SIREN), écran « Vérifiez votre e-mail » (lien 24 h, renvoi).
- **Mot de passe oublié** : formulaire → « c'est envoyé » (lien 1 h) → choix du
  nouveau mot de passe. *(L'app a déjà `mot-de-passe-oublie` — à aligner
  visuellement.)*
- **Écran d'invitation** locataire / agent : compte pré-identifié, choix du mot
  de passe seul, expiration 7 j, renvois journalisés.
- **Inscription artisan en 2 étapes** : SIRET + métier + mobile obligatoire,
  puis dépôt RC pro + décennale ; **validation par le super admin** avant toute
  affectation ; purge à 6 mois sans document.

### Pivot produit — le réseau artisan

- La conformité artisan (RC pro, décennale) **sort de l'agence** : « vérifiée
  et tenue à jour par Gerimmo », seuls des artisans à jour sont proposés.
- Disparaissent côté agence : alerte « décennale expirée », blocage de devis
  « artisan non couvert ». La fiche artisan devient « Relation artisan »
  (métier, périmètre, note /5).
- L'échéance de re-collecte d'attestation passe en `scope:'super'` (invisible
  agence).

### Espace agence

- **Parc en accordéon** : biens dépliables → lots dépliables → détail complet
  en ligne (plus de vue scindée liste/panneau) ; vignettes dégradées, phrase
  d'aide « Cliquez sur un bien… ».
- **Périmètre « mon portefeuille »** généralisé pour le rôle agent : alertes,
  écritures, impayés, documents, mandats, rapports, conversations, agenda
  filtrés sur ses lots ; KPI et graphes sur son périmètre (histo 3 mois).
  L'agent **perd l'onglet Documents** et sa comptabilité devient **« Loyers &
  rapports »** (sous-onglets Quittancement · Mandants & versements · Impayés ·
  Rapports).
- **Page Quittancement** : tableau du mois (payées/impayées, lien relance),
  **« Envoyer toutes les quittances »** (masse, WhatsApp + e-mail), bloc
  « Émises pour septembre » avec **« Enregistrer l'encaissement »** en un clic
  (→ quittance WhatsApp + écriture recette + honoraires au taux du mandat,
  confettis).
- **Tableau de bord** : fil **« Ce qui vient de se passer »** (événements
  récents horodatés, pastille NOUVEAU), tendance « +3 pts vs juillet »,
  chiffres animés.
- **Dossier de pièces par personne** (locataires, garants) : demander une pièce
  (8 types), relancer, redemander à expiration, versions conservées (seule la
  dernière affichée), dépôt par le locataire depuis son espace, carte « Pièces
  attendues » dans Documents. Conservation 5 ans, le dossier suit la personne.
- **Carte Solvabilité** (locataire retenu uniquement) : revenus déclarés, taux
  d'effort, cohérence des justificatifs contrôlée, « recontrôler ».
- **Colocation** : natures de bail réduites à 4 (« nu », « meublé »,
  « colocation bail unique », « colocation contrats séparés ») ; carte
  « Colocataires & solidarité » : membres avec entrées/sorties, **départ d'un
  colocataire** (solidarité résiduelle 6 mois ou remplaçant, extinction datée
  et tracée), garants suivant la solidarité, avenant d'arrivée.
- **Carte Signature électronique** sur le bail : circuit séquentiel par
  signataire (agence signe pour le mandant), relance manuelle, règles
  affichées (expiration 30 j, relances J+7/J+21, alerte J+28, double PDF),
  état « Hors plateforme » pour les baux antérieurs.
- **Préavis locataire structuré** : durée 3 mois / 1 mois réduit, motif
  dérogatoire obligatoire + justificatif joint pour le réduit, date de sortie
  calculée.
- **Congé du bailleur** : motif (vente / reprise / motif légitime), effet à
  l'échéance, génération PDF, **alerte préemption à 2 mois** pour la vente,
  saisie de la date de première présentation.
- **Comparateur de garanties** (GLI courtier 2,8 % · Visale · caution
  bancaire), demande de devis GLI, règle de non-cumul affichée.
- **EDL de sortie — saisie comparative guidée** : rappel de l'état et de
  l'observation d'entrée sur chaque ligne, saisie sortie (état + observation),
  badge « Dégradation » automatique, bouton « = Entrée », « toute la section
  conforme », compteur x/y lignes, **signature bloquée tant qu'une ligne est
  vide**, confirmation annonçant les écarts qui alimenteront le décompte.
- **Recouvrement** : « Relancer tous les impayés » (groupé, chaque créance à
  son stade), **commandement de payer** (huissier, 6 semaines, courriers types
  fournis).
- **Incidents — statistiques du trimestre** : temps moyen de traitement, taux
  de résolution à 15 j, coût moyen, logements les plus signalés avec argument
  chiffré au propriétaire.
- **Fonds mandants enrichis** : carte « À qui appartient chaque euro »
  (soldes propriétaires + DG détenus + provisions + trop-perçus + TVA), liste
  des DG détenus par bail avec détenteur (agence/propriétaire), honoraires HT
  + **TVA 20 %** avec rappel CA3, mode de calcul des honoraires par mandat
  (sur encaissé / sur appelé / forfait). KPI « Fonds détenus » au tableau
  compta admin.
- **Reprise de portefeuille** (Réglages, admin) : assistant 4 étapes —
  source (export CSV/Excel, **lecture des baux PDF par IA**, saisie guidée) →
  contrôle des baux détectés → soldes d'ouverture (DG + détenteur, fonds
  mandants, dettes/crédits locataires, date de bascule) → balance vérifiée
  (« chaque euro appartient à quelqu'un ») et bascule : écritures d'ouverture
  immuables, créances ouvertes dans Impayés, IRL surveillées, invitations
  après validation.

### Espace propriétaire (gestion directe)

- **Multi-organisations** : sélecteur d'organisation dans le bandeau (nom
  propre / SCI), lots, livre et fiscalité par organisation, étanches.
- **Onglet « Comptabilité & fiscalité »** : livre (date de pièce / imputation /
  famille·catégorie), écriture rectificative (jamais de modification), mois
  clôturé ; **récapitulatif fiscal 2025 calé 2044** ventilé par quote-part
  (indivision 50 %, SCI 60/40 par associé), rubriques 211-250 ; règle
  copropriété 229/230 affichée ; **lot meublé hors récapitulatif (BIC)** avec
  simulateur LMNP micro-BIC / réel ; « Détention & quotes-parts » (tantièmes
  informatifs, jamais clé de calcul).
- **Reprise de portefeuille PD** : même assistant, version propriétaire.

### Espace locataire

- **Onglet « Loyer & quittances »** : prochaine échéance détaillée (loyer +
  provision, total au 1ᵉʳ), régime de charges + dernière régularisation,
  historique des quittances téléchargeables, règles affichées (quittance auto
  à l'encaissement, prorata du premier mois).
- **« Pièces à déposer »** : pièces demandées par le gestionnaire et
  attestations expirant, dépôt en un clic (ou photo WhatsApp).

### Transverses

- Alertes portées par un agent (`agent:`), premier loyer quittancé **au
  prorata**, inventaire mobilier annexé visible sur bail meublé, animations
  (chiffres qui montent, confettis sur encaissement/solde/bascule),
  `tempsRelatif`, honoraires « + TVA 20 % » affichée.

## 2. Ce que l'application couvre déjà (à aligner, pas à créer)

Connexion + mot de passe oublié + invitations (`app/connexion`,
`app/mot-de-passe-oublie`, `actions/invitations.ts`) · inscription PD (S9a) ·
colocation + inventaire (`formulaire-colocation`, `formulaire-inventaire`) ·
grille EDL + annexes + comparatif sortie · quittancement/encaissements/impayés
· espace locataire (bail, demandes, documents) · incidents S7 complet ·
espace PD S9a (mono-organisation) · rapports de gestion et versements ·
génération PDF Documents-0 (quittance, avis, reçu, bail nu, EDL…).

## 3. Contradictions avec le référentiel — à trancher avant de coder

> [!warning] Points à trancher / contradictions
> 1. **Réseau artisan porté par Gerimmo** : la v3 retire à l'agence la
>    conformité artisan (validation par le super admin, auto-inscription,
>    purge 6 mois) et supprime alertes/blocages décennale côté agence. Le
>    référentiel ([[Artisan]], décisions S7 du 21/08) fait porter cette
>    vigilance à l'agence. Pivot assumé ou simplification de maquette ?
> 2. **Exclusivité PD / PM** (décision du 19/08) : la démo v3 fait d'Hélène
>    Rouvier à la fois mandante (M-2026-02) et titulaire d'un espace PD
>    multi-organisations. Levée d'exclusivité voulue, ou incohérence de
>    données de démo ?
> 3. **Natures de bail réduites à 4** (nu, meublé, coloc unique, coloc
>    séparés) contre 10 en v2 ([[Types de baux]]) : périmètre V0 assumé ?
> 4. **Fiscalité ventilée SCI / indivision + simulateur LMNP** : la décision
>    du 25/07 limitait la V1 à la 2044 (autres régimes V2). La ventilation
>    par quote-part et le BIC/LMNP anticipent la V2.
> 5. **Signature électronique** : circuit Yousign affiché vivant ; décision =
>    V0 sans intégration / V1 Yousign. En V0, seule la carte à l'état « hors
>    plateforme » est réalisable telle quelle.
> 6. **Quittance sur WhatsApp** : le canal WhatsApp n'est pas construit
>    ([[Canaux de communication]]) — en V0, e-mail + espace.

## 4. Découpage proposé pour l'intégration

| Tranche | Contenu | Schéma | Prérequis |
|---|---|---|---|
| **T1 — Visuel & périmètre agent** | Parc accordéon · « mon portefeuille » (filtres agent, compta « Loyers & rapports », onglet Documents retiré à l'agent) · fil « Ce qui vient de se passer » · page Quittancement (encaisser 1 clic, envoi groupé) · onglet locataire « Loyer & quittances » | non | — |
| **T2 — EDL de sortie guidé** | Saisie comparative, verrou de signature, écarts → décompte | non (grille JSON) | — |
| **T3 — Dossier de pièces & solvabilité** | Demande/relance/versions/expiration, dépôt locataire, taux d'effort | **oui** | — |
| **T4 — Vie du bail** | Préavis réduit motivé, congé bailleur (+ PDF vague B), comparateur garanties, départ colocataire + solidarité | **oui** (léger) | arbitrage n°3 |
| **T5 — Parcours d'entrée** | Écrans invitation/oubli alignés, inscription artisan + validation SA | **oui** | **arbitrage n°1** |
| **T6 — PD multi-organisations & fiscalité** | SCI/indivision, livres étanches, récapitulatif ventilé, BIC | **oui** (lourd) | **arbitrages n°2 et 4** |
| **T7 — Reprise de portefeuille** | Assistant 4 étapes, écritures d'ouverture, balance | **oui** (lourd) | T6 souhaitable |
| **T8 — Fonds mandants enrichis** | « À qui appartient chaque euro », TVA honoraires, mode de calcul | **oui** | — |

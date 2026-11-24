---
type: concept
tags: [document, ged]
status: in-progress
created: 2026-07-21
updated: 2026-11-24
sources: ["[[Dépôt Gerimmo-V3]]", "[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-architecture-lot-0]]", "[[2026-07-24-gerimmo-v3-module-0b-dossier-locataire]]", "[[2026-07-24-gerimmo-v3-module-12-documents-et-ged]]", "[[2026-07-24-gerimmo-v3-a2-conservation-rgpd]]", "[[2026-07-24-gerimmo-v3-a4-socle-securite]]", "[[Mission palier 1 — audit du 22 novembre 2026]]"]
---

# Document

**Définition :** fichier métier centralisé, rattachable à un [[Patrimoine et résidences|patrimoine/résidence]],
un [[Bien]], un [[Propriétaire bailleur|propriétaire]] ou un [[Locataire]]. Table `documents`.

## Attributs métier notables
- `document_type` : `quittance`, `rapport_incident`, `bon_intervention`, `contrat`, `attestation`, `courrier`…
- `status` : `brouillon` / `actif` / `envoye` / `expire` / `archive`.
- **`visibility`** : `organisation` / `agence` / `proprietaire` / `locataire` / `artisan` / `prive`.
- Stockage : `storage_bucket`, `storage_path`, `checksum` ; `expires_at` + `expiration_alert_days` ; `official_document`.

## Objets liés
- `document_categories` (dont `is_official`), `document_templates` (gabarits : quittance, bon
  d'intervention… avec `merge_fields`), `document_versions` (versioning), `document_access_rules`
  (droits fins), `document_events` (journal), `document_alerts` (expiration), `document_email_outbox` (envoi email).

## Rôle dans le métier
- Support des pièces officielles (quittances, rapports, courriers de relance) et de leur diffusion
  contrôlée par visibilité + règles d'accès.
- Cas d'usage exigeant du versioning : les pièces du [[Dossier locataire]] (module 0b) —
  **toutes les versions conservées, aucune écrasée** (RM-0b.4.1), seule la courante
  affichée, chaque version datée et attribuée ; consultation **tracée** dans un journal
  d'accès (RM-0b.7.5).

## Portée de la trace GED (Livrable A3, 2026-07-24)
**Aucune trace GED ne constitue une preuve juridique** (RM-A3.2) — voir
[[Notification et valeur probante]]. La trace d'envoi (date, canal, destinataire —
RM-12.4.1) garde une utilité **réelle mais opérationnelle** : savoir ce qui est parti,
repérer ce qui reste à envoyer, contrôler qu'un agent a traité. Elle ne prouve **ni un
délai ni une réception** ; pour les actes à effet juridique, seule la **notification par
canal légal** (LRAR, acte) compte, et l'agent saisit la date de première présentation.
La formulation du module 12 (« la trace d'envoi fonde les délais ») est **à supprimer**
du référentiel.

## Relations
- Produit par [[Quittancement des loyers]], [[Intervention et clôture]], [[Relances et mise en demeure]].
- Rappels d'échéance automatiques (assurances, diagnostics) via `document_reminder-service`.
- Voir [[Canaux de communication]], [[Modèle de données]].

## Cible V3 : rattachement multiple, le type pilote tout (lot 0)
Le [[2026-07-24-gerimmo-v3-architecture-lot-0|socle V3]] retient un modèle sans
arborescence : **pas de dossiers ni de chemins** — `document_liens` rattache un même
document à toutes les fiches qu'il concerne (lot, bail, personne, mandat, incident), et
c'est le **type** du document qui pilote les droits **et la conservation**
([[RGPD|retention_rules]]). Stockage Supabase Storage : **jamais d'URL directe** — lien
signé à expiration courte (RM-A4.10) ; chiffrement au repos (RM-A4.6) ; **antivirus à
l'upload avant disponibilité** (RM-A4.8, champ `analyse_av`, service à choisir —
échec = refus et alerte) ; formats PDF/JPG/PNG avec **vérification du type réel, pas
de l'extension** (RM-A4.9 — « attestation.pdf » peut être un exécutable renommé) ;
`empreinte` pour la détection de doublon. Ces règles, esquissées par le lot 0, sont
formalisées par le [[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] —
voir [[Socle de sécurité]]. Voir [[Architecture du socle V3]].

## La GED complète (module 12, 2026-07-24)
- **Modèles figés, générés par le [[Super Admin]]** (RM-12.1.1/4) : pas d'éditeur
  libre ; 14 modèles Gerimmo par défaut ; modèle propre d'agence soumis au SA
  (validation des mentions, variables de fusion) ; mise à jour réglementaire centrale ;
  modèles **datés**, chaque document conserve **la version du modèle utilisée**.
- **Mise à disposition** (espace personnel — date de 1ʳᵉ consultation) **≠ envoi**
  (email/WhatsApp — date + canal) ; le mandant **ne reçoit que par envoi** ; envoi
  groupé possible ; recommandé tracé manuellement ; à signer → module 13.
- **Matrice de consultation par type** (RM-12.5.3) : locataire = ses documents ;
  artisan = les siens ; mandant = « envoyé »/« sur demande », **jamais les pièces du
  dossier locataire** (RM-12.5.5).
- **Conservation par type** (RM-12.5.6, **corrigée par A2**) : la version du
  module 12 (« baux, EDL, mandats : sans limite ») est abrogée — **toute durée est
  rattachée à une finalité écrite** ([[2026-07-24-gerimmo-v3-a2-conservation-rgpd|A2]],
  RM-A2.1/2). Matrice : pièces du dossier bail + 5 ans (suppression) · comptable /
  quittances / rapports **+ 10 ans (anonymisation)** · **baux, EDL, mandats :
  contrat + 5 ans puis anonymisation** (prescription des actions nées du bail) ·
  incidents et photos + 2 ans. Mention « purgé le … » pour ce qui a été purgé
  (RM-12.5.7). Voir [[RGPD]].
- **Navigation par filtres, jamais par dossiers** (RM-12.5.1) — depuis chaque fiche
  (lot, bail, personne, mandat, incident) + recherche globale (type, période, entité,
  texte). Toute consultation tracée (RM-12.5.8).

## Vue scindée du bien (décision humaine, 2026-07-25 — remplace la « vue 360 » v0)
Spécification UX actée : **à la sélection d'un [[Bien]], l'écran se scinde en deux** —
la liste reste visible d'un côté, un **panneau de détail du bien** s'ouvre de l'autre
(informations, documents, échanges), et **les éléments non concernés s'assombrissent**
pour garder le focus. Remplace la navigation « Bâtiment > Bien » de la note v0
([[2026-07-21-fonctionnalites-par-persona-v0]]) ; clôt le point 12 des décisions
ouvertes.

## Pièces du bail visibles du locataire (2026-08-30)

Le périmètre locataire de la GED (quatre fonctions : `mes_pieces_locataire`,
`mon_document_locataire`, `chemins_pieces_locataire`, `log_document_access`)
partage désormais un seul prédicat, `pieces_bail_locataire` : les pièces des
**baux vivants** (actif/préavis) dont la personne est locataire principal ou
colocataire — **bail signé** et **règlement de copropriété**. Un bail terminé
retire ces pièces de « Mes documents ». Le type `reglement_copropriete` est
déclaré « Agence et locataire ». Voir [[Bail]].

## Mise à disposition du locataire (2026-09-09)

Un `courrier` ou une `quittance` PDF rattaché à la fiche du locataire n'est
**plus** visible de lui par simple rattachement : audit du 09/09 — la vague
documentaire du 08/09 rendait tout courrier (y compris une mise en demeure en
préparation) instantanément lisible, en contradiction avec RM-12 (« mise à
disposition ≠ envoi : l'envoi est un geste »). La colonne `documents.partage_le`
porte désormais le geste « Mettre à disposition du locataire » (fiche de la
pièce, réversible, RPC `partager_document_locataire`). Les pièces du dossier
(identité, justificatifs, attestations) gardent leurs règles. Le document
demandé en signature et le PDF signé retourné restent visibles via la demande
([[Signature électronique]]). La trace d'accès (`log_document_access`) délègue
au même prédicat que la route fichier (`mon_document_locataire`) — la liste de
droits ne vit plus en double, et le locataire **sorti** (adhésion inactive)
conserve la lecture.

## Catalogue complet et bail 100 % rempli (2026-09-09, carte blanche)

Le catalogue passe de 9 à **15 modèles générables** : s'ajoutent le **bail
meublé** (annexe 2 du décret 2015-587, inventaire du mobilier annexé depuis
`inventaire_lignes`, variante étudiant 9 mois), l'**acte de cautionnement**
(un acte par garant, forme solidaire/simple, mention type à apposer par la
caution — réforme 2021), le **décompte de restitution** du dépôt (retenues,
vétusté, solde en lettres), le **congé du bailleur** (vente avec droit de
préemption, reprise, motif légitime — préavis 6 mois nu / 3 mois meublé,
encadré « à notifier par LRAR », RM-A3.1), l'**avenant au bail** et le
**mandat de gestion** (loi Hoguet : carte pro, garantie financière, lots et
taux, reddition de comptes). La génération accepte des **options de geste**
(motif du congé, garant, objet d'avenant) distinctes des données de fiche.
Surtout : les **28 champs du contrat type qui restaient en pointillés ont
désormais leur écran** — profil (carte pro, garantie financière, IBAN), fiche
personne (commune de naissance, adresse, qualité), lot (chauffage, eau
chaude, locaux privatifs — les équipements structurés du lot alimentent enfin
le bail), bien (parties communes, accès TIC) et carte « Compléments du
contrat » sur le bail (fixation et paiement du loyer, encadrement zone
tendue, travaux, honoraires, clauses). Les champs facultatifs vides
s'impriment « — »/« Néant. » sans compter manquants ; la première échéance et
le plafond d'honoraires se **calculent**. Un bail dont les fiches sont
remplies sort **sans aucun manquant** (testé).

## Catalogue de documents — état dans l'application au 24/11/2026 (préproduction, non publié)

Les 46 modèles du palier 1 ont été produits sur six espaces fictifs et relus page par page ; 97 défauts confirmés ont
été corrigés (lots 35 à 49 : [[Mission palier 1 — audit du 22 novembre 2026]], phase 3). Ce qui vaut pour tout le
catalogue :
- **Chaque modèle ne propose que les dossiers qu'il accepte** ; un dossier ouvert par un lien direct est refusé avec la
  raison et ce qu'il faut faire. Dans un très grand parc, une page de la liste peut montrer moins de 50 dossiers ;
  « Dossiers suivants » complète (Q48).
- **« À renseigner » mène à l'écran où l'information manque**, en agence comme chez un propriétaire.
- **Émetteur** : hors agence, les documents d'un bail partent des bailleurs (détenteurs du lot) ; « gestionnaire »
  seulement en agence (Q42). Voir [[Quittance conforme]].
- **Mots et formats** : les libellés des écrans au lieu des codes de la base ; nombres, surfaces et index à la
  française ; étage écrit une fois (Q41, [[Lot]]).
- **Signature et datation** : l'avenant, les inventaires, le protocole d'apurement ([[Plan d'apurement]]) et
  l'autorisation de travaux sont datés à la signature ; l'[[État des lieux]] porte la date du constat, le bordereau des
  clés celle de la remise ; les circuits préparés avant la publication et pas encore envoyés seront à préparer de
  nouveau (Q40, [[Signature électronique]]).
- **Rien n'est présenté comme conforme** : les points de droit sont dans `JURISTE.md`, partie 5.

> [!warning] Points à trancher / contradictions (24/11/2026)
> - La section « Catalogue complet » (09/09) ci-dessus et la synthèse [[Etat des lieux generation de documents]]
>   (16/09) décrivent l'état de septembre ; l'état du 24/11 est dans la page de la mission. Les anciennes sections ne
>   sont pas réécrites.

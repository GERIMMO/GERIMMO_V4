---
type: synthesis
tags: [audit, locataire, proprietaire-direct, portail, qualite]
status: stable
created: 2026-09-06
updated: 2026-09-06
sources: ["[[2026-09-05-espace-locataire-v10|Maquette espace locataire v10]]", "[[2026-09-05-espace-proprietaire-v1|Maquette espace propriétaire v1]]", "[[Notification et valeur probante]]", "[[Restitution du dépôt de garantie]]", "[[Grille tarifaire]]"]
---

# Audit des espaces locataire et propriétaire (2026-09-06)

> [!success] Corrections appliquées le 2026-09-06 (carte blanche)
> Les 10 bloquants et l'essentiel des majeures/mineures sont **corrigés et
> publiés** le jour même (migrations `correctifs_audit` +
> `preavis_colocation_meuble` + vague UI). Décisions prises (carte blanche de
> l'humain) : **B1** → le portail enregistre une *intention de congé*, le congé
> reste au LRAR enregistré par le gestionnaire (conforme RM-A3) ; **B2** → tout
> locataire du bail peut transmettre l'intention (elle n'engage rien) ; **B8**
> → la saisie de détention/indivision est **ouverte au propriétaire direct** ;
> **B10** → surface EDL locataire différée (S13), texte trompeur corrigé.
> Restent ouverts (chantiers différés) : compteur de messages non lus côté
> gérant, accès du locataire sorti à sa restitution après désactivation de
> l'adhésion, dédoublonnage des RPC layout/pages, index des FK.

Audit pré-recette demandé par l'humain avant ses premiers tests : les deux espaces
livrés (locataire, propriétaire bailleur) passés au crible **contre le référentiel
du wiki** — chaque bouton, chaque libellé, chaque relation bouton → action → RPC,
et les flux croisés locataire ↔ bailleur dans les deux sens.

## Méthode et périmètre

Quatre passes exhaustives sur le code (`app/src/app/locataire/`, `app/src/app/agence/`
vu par un `proprietaire_direct`, actions serveur, 98 migrations SQL) plus une passe
de tests machine :

- **Tests exécutés** : 99 tests unitaires verts · 0 erreur TypeScript · 0 erreur
  lint · build de production OK · les **78 RPC** appelées par l'application existent
  toutes en base de production (aucune orpheline) · advisors Supabase sécurité :
  0 erreur.
- **Câblage** : **aucun bouton mort, aucun lien cassé, aucun formulaire sans
  action** dans les deux espaces. Toutes les routes référencées existent. Les
  anomalies relevées sont donc **sémantiques** (règle violée, champ perdu, policy
  manquante, texte faux), pas des trous de câblage.

## Ce qui est conforme au référentiel (points vérifiés)

- Restitution : le locataire ne voit **rien pendant le calcul**, le détail chiffré
  n'apparaît qu'au décompte finalisé — conforme RM-2.6.2, garanti côté SQL.
- Relances : visibles côté locataire **sans les notes internes** (RM-3.12.2).
- Incidents : boucle complète déclaration → qualification → contestation (une
  seule, tracée, non bloquante — RM-7.2.5) → réouverture par le déclarant ;
  confidentialité inter-locataires vérifiée.
- Attestation d'assurance : cycle dépôt → « en cours de vérification » →
  validation agence → fermeture d'alerte, deux attestations visibles pendant le
  renouvellement (recette du 26/08).
- Traçabilité documentaire : chaque consultation de pièce passe par
  `log_document_access` **bloquant** (RM-0b.7.5) — la partie la plus solide du
  périmètre.
- Isolation : tables du portail locataire sans policy directe, accès uniquement
  par RPC `security definer` avec contrôle d'adhésion (une exception, voir S-3).

## 🔴 Bloquants (à corriger avant les tests utilisateur)

### B1 — Le congé en ligne viole la règle de valeur probante (RM-A3.1/A3.3/A3.5)
Le référentiel est formel : *« Gerimmo génère et suit, il ne notifie jamais »* —
le congé du locataire passe par **LRAR ou acte**, et la mise à disposition en ligne
n'a **aucune valeur probante**. Or `mon_conge_locataire` fabrique une
`date_premiere_presentation = aujourd'hui` et bascule le bail en préavis, et l'UI
affirme « il court à compter d'aujourd'hui, jour de sa remise par votre espace ».
Le chemin agence (`enregistrer_conge`) fait l'inverse : il exige la date de
première présentation saisie par le gérant. Un congé contesté serait indéfendable.
→ **À trancher (humain)** : soit le portail n'enregistre qu'une **intention de
congé** (alerte au gérant, qui confirme avec la date de première présentation du
LRAR), soit la règle RM-A3 est assouplie en connaissance de cause.

### B2 — Un colocataire peut résilier seul le bail entier
`mon_conge_locataire` accepte tout colocataire et passe **tout le bail** en
préavis, sans confirmation. Le congé d'un colocataire ne libère que lui.

### B3 — Le préavis annoncé n'est pas celui appliqué
L'écran « Mon logement » calcule 1 mois si **le lot est meublé** ou zone tendue ;
le serveur ne regarde que **le type du bail**. Bail nu sur lot meublé : l'écran
promet 1 mois, la base applique 3 — et la carte de confirmation affiche les deux
valeurs contradictoires dans la même phrase. Corollaire : une colocation meublée
reçoit 3 mois au lieu de 1 (le RPC ne teste que `type = 'meuble'`).

### B4 — Le congé du portail ne passe pas le lot en préavis
`mon_conge_locataire` met à jour le bail mais **pas le lot** — régression du bug
corrigé le 03/08 pour le chemin agence : le parc du bailleur affiche « loué » pour
un logement dont le locataire part. L'alerte `edl_sortie` créée est aussi **sans
échéance** (le tri et l'escalade l'ignorent) et le « mot pour votre gestionnaire »
saisi par le locataire (`conges.motif`) n'est **affiché nulle part** côté gérant.

### B5 — Quittances : 404 systématique pour les colocataires
`mon_echeancier_locataire` liste les quittances des colocataires, mais
`quittance_detail` n'autorise que le **locataire principal** → le bouton « Ouvrir »
mène à une page introuvable pour tout colocataire.

### B6 — Justificatifs de retenue : lien affiché, fichier indisponible
Le RPC `mon_document_locataire` ouvre bien la branche « justificatif de retenue »
(décompte finalisé), mais la policy storage `chemins_pieces_locataire()` n'a jamais
reçu cette branche : le téléchargement échoue (« Fichier indisponible »). Même
cause racine pour le **décompte de régularisation de charges**, promis « dans Mes
documents » mais lié `organisation` seulement — invisible et inouvrable.

### B7 — Déconnexion impossible sur mobile (les deux espaces)
Sous 860 px, le CSS masque le bloc bas de la barre latérale — « Mon profil »,
« Mes espaces », « **Se déconnecter** » — sans aucun autre point de sortie.
Critique : les tests utilisateur se font sur téléphone.

### B8 — Propriétaire : l'impasse « Détention incomplète »
Le blocage « Détention incomplète (il faut exactement 100 %) » propose un bouton
« Compléter la détention » qui pointe une section **masquée pour le PD** : le lot
reste bloqué en brouillon sans issue dans l'UI. Corollaire : l'**indivision est
promise** (FAQ, colonne quote-part du fiscal) mais **impossible à saisir** — le
seul formulaire de détention est caché au PD et la détention auto est posée à 100 %.

### B9 — Propriétaire : « honoraires au taux du mandat » affiché au PD
La carte « Quittancement du mois » (rendue aussi chez le PD) affirme que
l'encaissement déclenche des « honoraires au taux du mandat », en contradiction
directe avec « aucun honoraire de gestion, jamais » du hero d'accueil et « sans
honoraires » du livre.

### B10 — EDL : promis au locataire, invisible pour lui
La carte congé promet « votre gestionnaire vous propose des créneaux » pour l'EDL
de sortie, mais **aucune surface EDL n'existe** côté locataire (ni grille, ni
signature, ni comparatif) — alors que l'EDL lui est opposable.

## 🟠 Majeures

- **Deux alertes que rien ne ferme jamais** : `message_locataire` (jamais fermée à
  la lecture ; comme l'insert est dédoublonné tant qu'une alerte est ouverte, elle
  **étouffe la notification de tous les messages suivants**) et `piece_deposee`
  (sans `origine_type`, exclue de toute fermeture automatique). Les deux gonflent
  le badge Alertes du gérant indéfiniment.
- **Messagerie côté gérant sans signal** : aucun compteur de non-lus, l'alerte
  « Traiter » ouvre la modale générique au lieu du fil de la personne.
- **Badges et compteurs contradictoires (locataire)** : accueil « ✓ Assurance à
  jour » vs Documents « en cours de vérification » (le badge ignore `verifie_le`) ;
  KPI accueil compte les pièces sans les quittances, la page Documents les
  additionne ; badge Documents figé à 1 pour un locataire sans bail actif ;
  KPI « Prochain loyer » affiche loyer+charges au lieu du **montant réellement dû**
  (faux au prorata d'entrée et en paiement partiel).
- **Rafraîchissements manquants** : après dépôt d'attestation, la page Documents
  n'est pas revalidée ; le badge messages ne s'éteint qu'au rechargement complet.
- **Restitution : l'accès meurt avec l'adhésion** — dès que le gérant désactive
  l'adhésion du sortant, il perd décompte, retenues et justificatifs (le suivi de
  restitution est pourtant conçu pour l'après-sortie).
- **Propriétaire — vocabulaire d'agence** : ~18 libellés parlent d'« agence », de
  « mandant » ou de « mandat » dans l'espace PD (sections « Propriétaires
  mandants », « Propriétaire mandant » au récap du lot, « saisis par l'agence »,
  « — Agence seulement — », export CSV avec colonne « mandant »…) ; sa propre
  fiche apparaît « Propriétaire mandant · sans mandat » avec son login comme nom.
- **Propriétaire — promesses sans action** : « Gérer mon abonnement » mène à une
  page sans aucun bouton ; KPI « Récap 2044 prêt » est du texte en dur, affiché dès
  l'inscription ; « Traiter » de l'accueil perd l'alerte (pas de `?traiter=`) ;
  formulaires « Confier à » (alertes, incidents) sans objet pour un PD seul,
  champ requis sur une liste qui ne contient que lui.
- **Badge Alertes PD ≠ page Alertes** : le badge ne compte que les alertes qui lui
  sont confiées, la page liste toutes les alertes ouvertes.

## 🟡 Moyennes et mineures (florilège)

Deux pages au même titre « Signaler un problème » (liste et formulaire) ; « votre
gérant » vs « votre gestionnaire » dans le même espace ; « Terme d'avance » affirmé
en dur sans donnée ; mention « écarts relevés à l'EDL » déduite du seul délai de
2 mois (faux quand la cause est l'absence d'EDL d'entrée — le champ existe déjà
dans le RPC) ; date d'expiration d'attestation sans borne (dépôt d'une attestation
déjà expirée possible) ; 3 RPC appelées en double sur chaque page locataire
(layout + page) ; requêtes `mandats`/`rapports_gestion` inutiles sur les pages PD ;
`demandes_pieces` (table héritée, vide, jamais référencée) à supprimer ;
« ← Parc » au lieu de « Mes lots » ; textes coupés et pluriels approximatifs divers.

## 🔒 Sécurité (base de production)

- **S-1** : 14 fonctions `security definer` encore exécutables par `anon` (dont
  `quittance_detail`, `mon_bail_document_locataire`, et des fonctions trigger) —
  convention du projet non appliquée partout ; à révoquer en une migration.
- **S-2** : `deposer_mon_attestation` ne vérifie pas l'adhésion `locataire`
  (seule la garde applicative protège) — l'aligner sur `ma_personne_locataire()`.
- **S-3** : `mon_echeancier_locataire` est la seule RPC locataire sans re-contrôle
  d'adhésion (défense en profondeur incomplète, non exploitable en l'état).
- Performance (informatif) : 87 FK non indexées, 23 index inutilisés — normal à ce
  volume, à traiter par lots plus tard.

## Plan de correction proposé

1. **Vague SQL** (une migration) : congé → intention (B1, décision humaine
   requise) ou a minima lot en préavis + échéance d'alerte + motif affiché (B4) ;
   restriction colocataire (B2) ; préavis unifié (B3) ; `quittance_detail` ouvert
   aux colocataires (B5) ; branche retenue/bail dans `chemins_pieces_locataire()`
   (B6) ; fermeture des alertes message/pièce ; révocations `anon` (S-1, S-2).
2. **Vague UI** : déconnexion mobile (B7) ; texte quittancement PD (B9) ;
   détention/indivision PD (B8) ; vocabulaire PD ; badges et compteurs cohérents ;
   revalidations manquantes.
3. **Vague différée** : surface EDL locataire (B10 — chantier propre),
   messagerie gérant avec compteur, accès restitution post-adhésion.

> [!warning] Points à trancher (humain)
> - **B1 — canal du congé locataire** : intention à confirmer par le gérant
>   (conforme RM-A3) ou congé en ligne assumé (assouplir la règle au wiki) ?
> - **B2** — réserver le congé en ligne au locataire principal, ou notifier les
>   autres colocataires ?
> - **B8** — ouvrir la saisie de détention/indivision au PD (nécessaire pour la
>   quote-part fiscale promise), ou retirer la promesse de la FAQ en V0 ?
> - **B10** — l'EDL côté locataire est-il un chantier V0 ou différé (S13 mobile) ?

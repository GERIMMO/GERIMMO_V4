# Contrat de sous-traitance de données personnelles (modèle)

> **Projet rédigé par l'agent (2026-07-25)** à partir des livrables A2 et A4 du
> référentiel Gerimmo V3. Modèle au sens de l'article 28 du RGPD, à annexer au
> contrat de service de chaque agence. Relecture professionnelle recommandée avant
> premier usage commercial.

## 1. Parties et objet

Entre **[Raison sociale de l'agence]** (« l'Agence »), responsable de traitement, et
**Gerimmo** (« le Prestataire »), sous-traitant, pour l'exécution du service de
gestion locative en ligne Gerimmo (« le Service »).

Le présent contrat encadre les traitements que le Prestataire opère **pour le compte
et sur instruction de l'Agence**. Il ne couvre pas les traitements dont Gerimmo est
lui-même responsable (comptes et authentification, annuaire artisan public, score
artisan, blacklist globale, facturation des agences), régis par la politique de
confidentialité de Gerimmo.

## 2. Traitements concernés

| Traitement | Personnes concernées | Données |
|---|---|---|
| Gestion locative (lots, baux, états des lieux) | Locataires, garants, propriétaires | Identité, coordonnées, données contractuelles |
| Dossiers locataires | Locataires, garants | Pièces d'identité, revenus, avis d'imposition, attestations |
| Comptabilité et rapports de gestion | Locataires, propriétaires | Écritures, quittances, honoraires |
| Incidents et interventions | Locataires, artisans | Signalements, photos, comptes rendus |
| Messagerie | Tous | Contenus des conversations |

## 3. Durée, nature et finalité

Le traitement dure autant que le contrat de service. Les durées de conservation par
type de donnée figurent en **Annexe 1** (matrice de conservation) : chaque durée est
rattachée à une finalité et une base légale ; au terme de l'archivage, la donnée est
supprimée ou anonymisée de manière irréversible. Un contentieux identifié gèle le
passage au sort final.

## 4. Obligations du Prestataire

1. **Instructions** : ne traiter que sur instruction documentée de l'Agence (le
   paramétrage et l'usage du Service valent instruction).
2. **Confidentialité** : les personnes autorisées à traiter sont soumises à une
   obligation de confidentialité.
3. **Sécurité** (Annexe 2) : chiffrement en transit et au repos, hébergement en
   Union européenne, cloisonnement par agence testé à chaque livraison, contrôle
   des fichiers déposés, journalisation, sauvegardes chiffrées avec test de
   restauration documenté.
4. **Sous-traitance ultérieure** : la liste des sous-traitants ultérieurs figure en
   **Annexe 3** ; toute modification est notifiée à l'Agence au préalable, qui peut
   émettre des objections motivées.
5. **Assistance** : le Prestataire aide l'Agence à répondre aux demandes d'exercice
   des droits (l'Agence décide, le Prestataire exécute) et lui fournit les exports
   nécessaires (journal, documents, référentiel — disponibles à tout moment).
6. **Violation de données** : notification à l'Agence **sans délai indu** après en
   avoir pris connaissance, avec les éléments utiles à la notification CNIL qui
   incombe à l'Agence (72 h).
7. **Sort des données** : au terme du contrat, l'Agence dispose de l'export complet ;
   le Prestataire supprime ou anonymise ensuite selon la matrice de conservation.
8. **Audit** : le Prestataire met à disposition les informations nécessaires à la
   démonstration de conformité et permet les audits raisonnables de l'Agence.

## 5. Obligations de l'Agence

L'Agence garantit la licéité des données confiées, informe les personnes concernées,
tient son registre des traitements et répond aux demandes d'exercice des droits la
concernant.

## Annexe 1 — Matrice de conservation (extrait)

| Donnée | Base active | Archive | Sort final |
|---|---|---|---|
| Pièces du dossier locataire | Durée du bail | 5 ans | Suppression |
| Baux, EDL, mandats, congés | Durée du contrat | 5 ans | Anonymisation |
| Écritures, quittances, rapports | Exercice / bail | 10 ans | Anonymisation |
| Incidents et photos | Durée du bail | 2 ans | Suppression |
| Conversations | Durée du bail | 2 ans | Suppression |
| Journal d'audit / technique / accès | 3 ans / 6 mois / 1 an | — | Suppression |

## Annexe 2 — Mesures de sécurité (résumé du socle A4)

MFA obligatoire pour l'administration plateforme ; mots de passe 12 caractères
vérifiés contre les fuites connues ; TLS 1.2 minimum ; chiffrement au repos (base,
fichiers, sauvegardes) ; hébergement UE multi-zone ; analyse des fichiers déposés
(type réel, taille, antivirus) ; aucun accès direct aux fichiers par URL ;
sauvegarde continue (perte maximale 24 h), rétention 30 jours, test de restauration
documenté ; journalisation des actions sensibles.

## Annexe 3 — Sous-traitants ultérieurs

| Prestataire | Traitement | Localisation | Garanties |
|---|---|---|---|
| [Hébergeur — Supabase] | Hébergement, base, stockage | Union européenne | Chiffrement, région UE |
| [Vercel] | Exécution applicative | Union européenne (région configurée) | Chiffrement |
| Yousign | Signature électronique | France | eIDAS |
| Stripe | Encaissement des abonnements | Irlande | — |
| Meta (WhatsApp) | Messagerie optionnelle | **Hors UE** | Clauses contractuelles types ; consentement explicite + repli email |
| [Service antivirus — à déterminer] | Analyse des fichiers | À déterminer | — |

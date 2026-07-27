---
type: business-rule
tags: [preuve, notification, lrar, delai, ged, signature]
status: draft
created: 2026-07-24
updated: 2026-07-24
sources: ["[[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve]]", "[[2026-07-24-gerimmo-v3-matrice-tracabilite]]"]
---

# Notification et valeur probante

**Énoncé :** **Gerimmo génère et suit, il ne notifie jamais** (RM-A3.1) — et **aucune
trace GED ne constitue une preuve juridique** (RM-A3.2). Pour les actes à effet
juridique, la notification passe par un canal légal hors plateforme, et c'est **la
première présentation qui fait courir le délai** (RM-A3.5).
Source : [[2026-07-24-gerimmo-v3-a3-documents-canaux-preuve|Livrable A3]].

![Schéma — cinq canaux, cinq valeurs juridiques différentes](../../raw/assets/GERIMMO-V3-A3-Documents-canaux-preuve/media/915e4c46ac41ebde0a7b8f4afe2857046e23bebc.png)

## Les cinq niveaux de preuve

1. **Acte de commissaire de justice** — date et contenu incontestables.
2. **LRAR** — date certaine (première présentation).
3. **Remise en main propre contre émargement** — date certaine.
4. **Email simple** — aucune valeur probante pour un acte à effet juridique.
5. **Mise à disposition en ligne** — aucune valeur probante, même avec trace d'ouverture.

## Les quatre dates d'un acte notifié

| Date | Effet juridique |
|---|---|
| Génération du document (Gerimmo) | Aucun |
| Envoi postal (récépissé de dépôt) | Aucun pour le destinataire |
| **Première présentation** (avis de réception) | **Le délai court** |
| Retrait effectif | Aucun — la présentation suffit |

Un locataire qui ne retire pas sa LRAR ne bloque pas le délai. **L'agent saisit la date
de première présentation** lue sur l'avis de réception (RM-A3.4) ; les délais sont
calculés **depuis la date saisie, jamais depuis l'envoi** (RM-A3.6).

## La frontière outil / acte

| Action | Gerimmo | L'agence |
|---|---|---|
| Générer le document conforme, vérifier les mentions | **Oui** | Contrôle |
| **Notifier au destinataire** | **Jamais** | **Oui** |
| Saisir la date de présentation | Enregistre | **Saisit** |
| Calculer les délais, alerter aux échéances | **Oui** | Vérifie |
| Conserver l'avis de réception | Peut le stocker | Détient l'original |
| **Prouver l'envoi** | **Jamais** | Par l'avis |

## La matrice par famille de documents

**Famille 1 — Actes à effet juridique** (canal légal imposé, RM-A3.3) :

| Document | Canal | Date qui compte |
|---|---|---|
| Congé du bailleur / du locataire | **LRAR ou acte** | Première présentation |
| Mise en demeure ([[Relances et mise en demeure]]) | **LRAR** | Première présentation |
| Décompte de restitution | LRAR recommandé | **Remise des clés** (RM-2.4.1) |
| Régularisation de charges ([[Régularisation des charges]]) | Email accepté | Envoi |

**Famille 2 — Documents engageants** ([[Signature électronique]] simple — email + code
SMS, ordre séquentiel bailleur en dernier, module 13 ; **Yousign porte la preuve**,
pas Gerimmo) :

| Document | Canal | Preuve |
|---|---|---|
| [[Bail]] et avenants | Yousign | Dossier de preuve Yousign |
| Acte de cautionnement | Yousign | Dossier de preuve Yousign |
| Mandat de gestion | Yousign | Dossier de preuve Yousign |
| **État des lieux** | **Signature tactile sur place** | Document signé en GED |

L'EDL n'est **pas** une signature électronique eIDAS : c'est un **consentement recueilli
en présence** des deux parties (RM-A3.7) — sa valeur tient à la présence, pas au procédé.

**Famille 3 — Documents courants** (email ou espace personnel, aucune preuve requise,
RM-A3.8) : quittance, reçu, appel de loyer ([[Quittancement des loyers]]), relance
simple, rapport de gestion, récapitulatif fiscal, devis/facture, diagnostic (annexé au
[[Bail]], le bail fait foi).

## Documents financiers du propriétaire : pièce jointe assumée

Décision **confirmée après deux audits** : envoi en **pièce jointe email, sans lien
sécurisé** (RM-A3.9). Zéro stockage temporaire, zéro expiration, zéro développement ;
en contrepartie : circulation en clair, **ni révocation ni trace de consultation**
(RM-A3.11). Le lien sécurisé reste une évolution possible, ni V1 ni commercialisation.
Voir [[Propriétaire bailleur]].

## Ce que l'agent saisit

| Champ | Pour quels documents | Obligatoire |
|---|---|---|
| Date de notification + canal | Actes à effet juridique | **Oui** |
| N° de recommandé, avis scanné | Si LRAR | Recommandé (RM-A3.10) |
| Date d'envoi | Documents courants | Automatique |

La saisie facultative **protège l'agence** : reconstituer le dossier en cas de litige,
prouver ses diligences (même logique que la trace des relances).
Cas concret (module 0b) : les **alertes d'assurance** envoyées au locataire sont
**horodatées et conservées** (RM-0b.6.2) — le bailleur ne peut invoquer le défaut
d'assurance que s'il prouve avoir réclamé le document ([[Dossier locataire]]).

> [!warning] Points à trancher / réserves
> - **Rattachement prioritaire n° 1 de la [[2026-07-24-gerimmo-v3-matrice-tracabilite|matrice de traçabilité]]** :
>   le champ « **date de première présentation** » (RM-A3.5) manque encore aux modules 1
>   (congé) et 2 (décompte) — « le rattachement le plus concret de cette matrice ».
> - **Matrice à faire valider par un conseil juridique** (canaux imposés, dates d'effet).
> - Piste : le **recommandé électronique qualifié** pourrait remplacer la LRAR pour
>   certains actes — vérification juridique préalable requise.
> - La trace GED du module 12 (« fonde les délais ») est **à reformuler** dans le
>   référentiel — voir [[Document]].

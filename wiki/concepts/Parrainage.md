---
type: concept
tags: [parrainage, croissance, expansion, acquisition, proprietaire-direct, agence]
status: stable
created: 2026-09-19
updated: 2026-09-30
sources: ["[[2026-09-28-decision-tarification]]"]
---

# Parrainage

> [!info] 30/09/2026 : parrainage réactivé — 1 mois offert au parrain
> Décision du porteur du 30/09/2026 ([[2026-09-28-decision-tarification]]),
> pour la nouvelle grille ([[Grille tarifaire]]) : **un mois offert au parrain
> à la conversion de chaque filleul** ; **rien de plus pour le filleul**, qui
> garde l'essai ordinaire. La règle « pas de cumul » est levée **pour cette
> seule récompense du parrain**. Détail : section « Grille du 28/09/2026 » plus
> bas.

**Définition :** le mécanisme par lequel une organisation déjà cliente —
agence ou [[Propriétaire bailleur|propriétaire direct]] — en amène une autre,
et par lequel Gerimmo **sait qui a amené qui**. C'est le seul levier de
croissance autorisé vers les particuliers : ils ne peuvent pas être démarchés,
mais ils peuvent recommander ([[Expansion territoriale autonome]]).

## Ce qui est décidé (19/09/2026)

- **Un code par organisation**, engendré à sa création : huit caractères
  hexadécimaux en capitales (`3FA2B9C0`). Il ne dit rien de l'organisation, ne
  se devine pas, et se dicte au téléphone sans O ni I ambigus.
- **Un lien de partage** : `/inscription?parrain=CODE` préremplit le champ.
- **Un parrain au plus par filleul**, enregistré une fois pour toutes ; une
  organisation ne peut pas se parrainer elle-même, ni être parrainée par une
  organisation archivée.
- **Où le code se saisit** : sur le formulaire d'auto-inscription du
  propriétaire direct (champ facultatif, prérempli par le lien), et sur
  l'écran d'ouverture d'une agence par la supervision.
- **Où il se voit** : sur le profil de l'organisation — son code, son lien, le
  nombre de filleuls, et son parrain s'il en a un.
- **Ce que voit la supervision** : à l'ouverture d'une agence, le code est
  vérifié (bien formé, connu, organisation non archivée) **avant** d'ouvrir ;
  une vue des parrainages par organisation dans la console reste à faire.

## L'avantage (décidé le 19/09/2026 — grille historique)

**Un mois pour vous, un mois pour lui.**

| Qui | Ce qu'il reçoit | Quand |
|---|---|---|
| **Filleul** | Essai porté de **14 à 30 jours** | À l'instant où le code est accepté |
| **Parrain** encore en essai | **30 jours d'essai** de plus | Quand le filleul devient client payant |
| **Parrain** déjà abonné | **Un avoir égal à son mensuel courant**, déduit de sa prochaine facture | Quand le filleul devient client payant |

- **Le parrain est payé à la CONVERSION, jamais à l'inscription.** Récompenser
  une inscription reviendrait à financer des organisations fictives ouvertes
  avec son propre code. Le déclencheur est le passage de l'organisation
  filleule au statut `active` (c'est-à-dire la souscription effective) —
  grille historique ; sur la nouvelle grille, la première facture non nulle
  payée (voir plus bas).
- **Un mois vaut ce que le parrain paie** : le montant est lu sur son
  [[Abonnement]] au moment où l'avantage est acquis, et figé. Il n'y a donc
  aucun barème à tenir à jour quand les tarifs bougent.
- **Une seule récompense par filleul.** Une organisation qui repasse par
  `active` après une suspension ne rapporte pas un second mois : c'est
  l'unicité `(parrainage, nature)` du registre qui le garantit.
- **Rien n'est promis à vide.** Un filleul déjà payant, un parrain sans
  montant facturé, un parrain archivé : l'avantage est inscrit « sans objet »
  et l'écran le dit, plutôt que d'afficher un cadeau qui n'arrivera jamais.
- **L'avoir est porté au solde client Stripe** par la tâche planifiée
  `/api/cron/abonnements`, avec une clé d'idempotence : une tâche rejouée ne
  crédite pas deux fois.

Registre : `avantages_parrainage` — qui, pour quel parrainage, quelle nature,
quel montant ou combien de jours, et si c'est honoré.

## Grille du 28/09/2026 : la règle en vigueur (décision du 30/09/2026)

| Qui | Ce qu'il reçoit | Quand |
|---|---|---|
| **Filleul** | **Rien de plus** : l'essai ordinaire (2 mois jusqu'au 31/12/2026 — offre de lancement —, puis 1 mois). Les 30 jours historiques ne s'appliquent pas (plus courts que l'essai) ; la ligne est inscrite « sans objet » | — |
| **Parrain** déjà abonné | **Un avoir égal à son mensuel courant** — pour un abonnement annuel, le montant annuel ÷ 12, arrondi au centime —, porté à son solde client Stripe et déduit de sa prochaine facture | À la **première facture payée d'un montant non nul** du filleul |
| **Parrain** encore en essai | Essai prolongé d'**un mois** (mois calendaire) | Idem |
| **Parrain** archivé, ou sans montant facturé | Rien (« sans objet » quand il n'y a pas de montant) | — |

- **Conversion = première facture non nulle payée**, jamais l'inscription ni
  le simple passage au statut `active` : sur la nouvelle grille, une
  souscription en essai Stripe rend l'organisation `active` alors que la
  facture est de 0 € — elle ne déclenche rien.
- **Une récompense par filleul** (même unicité du registre qu'en 19/09).
- **Même mécanique d'avoir** que pour la grille historique : registre
  `avantages_parrainage`, tâche planifiée `/api/cron/abonnements`, clé
  d'idempotence.
- **Affichage** : le profil montre le code, le lien, le nombre de filleuls, les
  récompenses obtenues / en cours et les filleuls pas encore convertis, sous la
  promesse « 1 mois offert à la conversion de chaque filleul ». Le formulaire
  d'inscription invite à entrer le code « pour faire gagner un mois à la
  personne qui vous recommande ». Les CGU décrivent le programme (art. 8.11 :
  qui reçoit quoi et quand, une récompense par filleul, avoir sur facture sans
  valeur monétaire, annulation en cas de fraude).

## Historique

- **19/09/2026** : « un mois pour vous, un mois pour lui » (tableau ci-dessus) ;
  reste la règle de la **grille historique**.
- **28/09/2026** : nouvelle grille — « pas de cumul » : parrainage enregistré
  sans aucun avantage (inscrit « sans objet »).
- **29/09/2026** : la promesse n'est plus affichée à personne, grille
  historique comprise.
- **30/09/2026** : **réactivation** pour la nouvelle grille — 1 mois offert au
  parrain à la conversion du filleul, rien pour le filleul.

## Ce qui reste à trancher

> [!warning] Un seuil d'anti-abus ?
> Rien ne limite aujourd'hui le **nombre** de filleuls récompensés pour un même
> parrain. C'est volontaire — un bouche-à-oreille qui marche ne doit pas être
> plafonné — mais si un jour une organisation amène cinquante filleuls en un
> mois, il faudra décider si c'est un succès ou une fraude.

## Rôle dans le métier

Mesurer le bouche-à-oreille et le récompenser ; pour l'expansion, une
composante de la santé d'un territoire (un département où les clients
recommandent est un département sain).

## Relations

[[Expansion territoriale autonome]] (le pourquoi) · [[Onboarding et abonnement]] (où le code entre) · [[Organisation]] (le code y vit) ·
[[Abonnement]] (l'avantage : avoir sur facture).

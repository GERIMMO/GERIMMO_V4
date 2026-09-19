---
type: concept
tags: [parrainage, croissance, expansion, acquisition, proprietaire-direct, agence]
status: draft
created: 2026-09-19
updated: 2026-09-19
sources: []
---

# Parrainage

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

## Ce qui reste à trancher

> [!warning] L'avantage
> Ce que gagnent le parrain et le filleul n'est **pas décidé** : c'est un
> montant, donc au porteur du projet (voir [[Expansion territoriale
> autonome]], points à trancher). La mécanique est construite pour qu'un
> avantage puisse s'y greffer sans la reprendre : une prolongation d'essai
> (`essai_fin`) ou un avoir sur l'[[Abonnement]] — deux gestes qui touchent
> respectivement la base et Stripe, et viendront dans leur propre brique.

## Rôle dans le métier

Mesurer le bouche-à-oreille et le récompenser ; pour l'expansion, une
composante de la santé d'un territoire (un département où les clients
recommandent est un département sain).

## Relations

[[Expansion territoriale autonome]] (le pourquoi) · [[Onboarding et
abonnement]] (où le code entre) · [[Organisation]] (le code y vit) ·
[[Abonnement]] (l'avantage, plus tard).

---
type: concept
tags: [journal, vitrine, super-admin, editorial, seo]
status: stable
created: 2026-09-11
updated: 2026-09-11
sources: ["[[Super Admin]]", "[[Proposition de valeur]]", "[[Révision annuelle IRL]]", "[[Régularisation des charges]]"]
---

# Journal éditorial

**Définition :** le journal public de Gerimmo (`/journal`), et le **moteur de
propositions** qui remplit la file du [[Super Admin]]. Livré le 2026-09-11.

## Le problème qu'il résout

La vitrine était **muette** : rien n'y bougeait entre deux versions du produit.
Un site qui ne publie jamais ne se référence pas et ne rassure personne. Or
Gerimmo sait une chose que peu de sites savent : **quand un sujet devient utile**
— parce que le calendrier du métier est précisément ce que l'application tient.

## Le principe, et sa limite assumée

Le moteur **ne rédige pas**. Il sait *quand* un sujet arrive à son moment et
*sur quelle règle* il s'appuie. Chaque **veine éditoriale** est ancrée sur une
page réelle du wiki — la source de vérité du projet. La proposition apporte donc
**un angle, un plan et sa source**. Elle n'invente **aucun chiffre, aucune date,
aucun nom**.

Là où un fait daté est nécessaire (la valeur d'un indice, un seuil légal qui
change), le gabarit laisse un **trou explicite** : `[[à compléter : …]]`. Un
déclencheur de base **refuse la parution** tant qu'il en reste un, en nommant le
passage fautif. L'écran d'écriture les liste et désactive le bouton de parution.

> C'est la règle « ne jamais inventer de fait métier » ([[CLAUDE.md]]) rendue
> **mécanique** plutôt que confiée à la vigilance. Il vaut mieux une file qui
> attend qu'un article qui affirme.

Chaque gabarit se termine d'ailleurs par un trou qui n'est pas un fait :
« relire et signer cet article avant parution ». Le retirer est un geste
conscient — c'est ce qui garantit qu'un humain a lu le texte avant qu'il paraisse.

## Les huit veines de départ

| Veine | Cadence | Ancrée sur |
|---|---|---|
| Révision du loyer (IRL) | trimestrielle | [[Révision annuelle IRL]] |
| Régularisation des charges | annuelle (janvier) | [[Régularisation des charges]] |
| Restituer le dépôt | annuelle (juin) | [[Restitution du dépôt de garantie]], [[Vétusté et décote]] |
| Impayés : la séquence | semestrielle | [[Relances et mise en demeure]] |
| Quittance ou reçu | annuelle (mars) | [[Quittance conforme]] |
| Rédiger un bail qui tient | annuelle (septembre) | [[Mentions obligatoires du bail]] |
| Qui paie la réparation ? | annuelle (novembre) | [[Cycle de vie d'un incident]] |
| Les données des locataires | annuelle (mai) | [[RGPD]] |

## Le cycle de vie d'une publication

`proposition` → `brouillon` → `publiee`, avec deux sorties : `refusee` (avec son
motif, pour ne pas reproposer la même chose) et `archivee` (retirée du journal,
jamais supprimée — [[Archivage plutôt que suppression]]).

Le moteur tourne **tous les lundis à 6 h** (pg_cron) et à la demande. Il est
**idempotent** : une veine ne se propose qu'une fois par période, il peut donc
tourner toutes les nuits sans empiler de doublons.

## Ce que le journal fait pour le produit

Trois articles parus apparaissent sur la vitrine ; la rubrique **disparaît
entièrement** tant que rien n'est publié — mieux vaut pas de rubrique qu'une
rubrique vide. Chaque article se termine sur ce que l'application fait du sujet :
le journal explique la règle, le produit la tient.

> [!warning] Points à trancher / contradictions
> - **Qui écrit ?** Le moteur propose, mais quelqu'un doit rédiger. Le wiki ne
>   dit pas si c'est le [[Super Admin]] seul, ou si la rédaction peut être
>   déléguée. Aujourd'hui la file lui est réservée.
> - **Quatre veines manquent** au regard de ce que le métier appellerait :
>   trêve hivernale, encadrement des loyers, DPE et calendrier des passoires
>   thermiques, congé pour vente. Elles supposent des pages du wiki qui
>   n'existent pas encore — on ne code pas une veine sans sa source.

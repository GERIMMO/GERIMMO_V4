---
type: business-rule
tags: [prospection, demarchage, opposition, rgpd, prospects, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Prêt à démarcher]]", "[[Expansion territoriale autonome]]", "[[Registre des traitements]]", "[[Liste d'attente des agences]]", "log.md — entrées « decision » du 23/10/2026 (valeurs par défaut du plan, point 8) et du 24/10/2026 (choix délégué n° 6), « deploy » du 24/10/2026 (PR #246)", "app/src/lib/prospects-supervision.ts", "app/supabase/migrations/20261024140000_conservation_et_prospection.sql"]
---

# Prospection commerciale

**Énoncé :** Gerimmo **n'envoie aucun message commercial** de lui-même. Le dirigeant peut
écrire à un **professionnel** (artisan, agence) dont l'adresse **vient de lui** et pour un
objet qui touche son métier, avec l'identité de Gerimmo et une possibilité d'opposition
dans **chaque** message ; il n'écrit **jamais** de courriel commercial à un **particulier**
sans son consentement, même pendant l'essai (décision 8 du 23/10/2026).

## Fondement
- Décision du porteur du 19/09/2026 : les particuliers ne sont jamais démarchés directement
  ; leviers autorisés vers eux : publicité Instagram et Facebook, [[Parrainage]]
  ([[Expansion territoriale autonome]]).
- **Décision 8 du plan de conformité du 23/10**, acceptée par le dirigeant (« OK aux valeurs
  par défaut ») : jamais de courriel commercial à un particulier sans consentement, même en
  essai ; artisans et agences autorisés si l'adresse vient d'eux, si l'objet touche leur
  métier, avec l'identité de Gerimmo et une possibilité d'opposition dans chaque message.
- **Choix délégué n° 6 du 24/10** : aucun consentement de particulier n'étant enregistré,
  aucune fiche prospect d'un particulier n'existe hors de sa demande de contact.

## Règles appliquées par le code (en production depuis le 24/10)
- **Fiche prospect** (`supervision_prospects`, console « Développement territorial ») :
  **origine en liste fermée** — « Formulaire de contact du site », « Échange direct »,
  « Recommandation » — et **qualité** — particulier ou professionnel (agence, artisan,
  entreprise). Dernier contact émanant du prospect daté (jamais dans le futur ; une fiche
  née d'une demande prend la date de cette demande).
- **Mention du premier message** : la console ne prépare qu'un texte à placer dans chacun
  des messages du dirigeant (« Gerimmo n'envoie aucun message aux prospects ») : « Vous
  recevez ce message de {dénomination}, éditeur de Gerimmo, parce que vous nous avez
  communiqué votre adresse ({origine}). Nous conservons vos coordonnées trois ans au plus
  après votre dernier contact. Pour ne plus recevoir de message, répondez simplement
  « Stop » : nous supprimons alors vos coordonnées dans le mois. Détails : {page
  confidentialité}. »
- **Refus de préparer la mention** :
  - origine « recommandation » : l'adresse ne vient pas de la personne (« Attendez qu'elle
    vous contacte elle-même ») ;
  - particulier sans demande de contact rattachée à sa fiche ;
  - adresse opposée (`controler_envoi_prospection`) ;
  - dénomination de l'éditeur non saisie.
- **Opposition (« Stop »)** : enregistrée par la supervision ; **toutes les fiches de
  l'adresse sont supprimées aussitôt**, historique compris ; seule une **empreinte SHA-256**
  de l'adresse est gardée (`oppositions_prospection`) pour ne plus écrire ; ligne de journal
  `prospect_opposition_enregistree`. Une fiche recréée pour une adresse opposée part au
  nettoyage suivant.
- **Liste d'attente des agences** : une inscription « retirée à sa demande » est supprimée et
  son empreinte gardée comme opposition ; ni lien de courriel ni marquage « contactée » pour
  une adresse opposée ; l'export ne contient plus les retirées ni les adresses opposées
  ([[Liste d'attente des agences]]).

## Durées
| Donnée | Durée | Règle |
|---|---|---|
| Fiche d'un professionnel | 3 ans après son dernier contact | `contact:prospect` (active) |
| Fiche d'un particulier | avec sa demande de contact (24 mois) | `contact:devis` (active) |
| Empreinte d'opposition | 3 ans après l'opposition | `prospect:opposition` (active) |

Bases légales proposées ([[Registre des traitements]], P12) : intérêt légitime pour les
professionnels et pour le respect de l'opposition ; consentement pour les particuliers.

## Relations
[[Prêt à démarcher]] · [[Registre des traitements]] · [[Durées de conservation]] ·
[[Liste d'attente des agences]] · [[Expansion territoriale autonome]] · [[Artisan]] ·
[[Administrateur d'agence]]

> [!warning] Points à trancher / contradictions
> - **Prospection par courriel** (CPCE L. 34-5) et **décision QPC n° 2026-1210 du 25/06/2026**
>   sur cet article : non vérifiées — à confirmer sur Légifrance (source non ouverte le
>   23/10/2026).
> - **Consentement des particuliers** : aucun format de consentement daté n'est défini ni
>   enregistré ; tant qu'il ne l'est pas, aucun particulier ne reçoit de message commercial.
> - **Empreinte sans sel** (SHA-256) : risque jugé acceptable par la relecture (lecture
>   réservée à la supervision permanente) ; un HMAC demanderait un secret dans le coffre.
> - **Fiche créée depuis une demande** : le plan voulait la réserver aux demandes d'offre ou
>   de démonstration ; aucune colonne n'enregistre le type de demande (contrôle non codé).

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.

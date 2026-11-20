---
type: synthesis
tags: [acquisition, activation, onboarding, bail, diagnostic, referencement, prospection]
status: in-progress
created: 2026-11-20
updated: 2026-11-20
sources: []
---

# Premiers clients — acquisition sans budget — 20 novembre 2026

**En une phrase :** le 20/11/2026, le dirigeant a demandé à l'agent de mener seul la recherche des premiers clients,
lui-même ne répondant qu'aux appels ; le relevé de production a montré que le premier frein n'était pas l'audience mais
**l'activation** — aucun des espaces ouverts n'était allé jusqu'à un bail actif — et cinq pull requests y répondent.

Cadre posé par le dirigeant : il ne connaît aucun propriétaire, il a du temps, **aucun budget** hors Claude et Codex,
et LinkedIn, Instagram et Facebook peuvent être connectés. La règle du 23/10 reste entière : aucun particulier n'est
contacté sans l'avoir demandé ([[Prospection commerciale]]).

## Ce que montre la production (lecture seule, aucune donnée personnelle)

Relevés du 20/11/2026, sur les espaces de [[Propriétaire bailleur]] en gestion directe :

| Mesure | Valeur |
|---|---|
| Espaces ouverts du 24/10 au 19/11 | 6 |
| Espaces sans aucun bien | 4 |
| dont profil sans adresse (arrêtés devant « Complétez d'abord votre profil ») | 2, dont l'inscrit du 19/11 |
| Baux saisis | 11, **tous en brouillon** |
| Baux avec un locataire renseigné | 11 |
| Baux avec un état des risques déposé | 0 |
| Baux avec un contrat signé déposé | 0 |
| Baux actifs | 0 |
| Agences sur la liste d'attente | 0 |

Rejoué sur le banc local avec un compte fictif neuf (« un propriétaire qui a déjà un locataire »), trois murs se
suivent :

1. **Le profil.** Juste après l'inscription, « Ajouter un bien » renvoyait vers le profil complet au lieu d'un
   formulaire (décision D29 B du 13/10 : l'adresse est facultative à l'inscription, exigée au premier bien).
2. **La fiche du locataire.** Elle exigeait sa date et sa commune de naissance, même pour un locataire en place depuis
   des années.
3. **L'activation du bail.** Le dépôt du contrat signé restait fermé tant que le logement n'était pas « mis en
   location », ce qui exige un DPE et un état des risques de moins de six mois ([[Diagnostic]]).

## Les décisions du dirigeant (20/11/2026)

- **« Oui, fais ce qui te semble nécessaire »** — accord sur le plan d'acquisition mené par l'agent.
- **Décision B — bail déjà en cours.** Pour un bail dont la date d'entrée est passée, le contrat signé (PDF) suffit à
  l'activer ; le DPE et l'état des risques manquants deviennent des alertes, sans blocage. Options écartées : A (ne rien
  changer) et C (exiger le DPE mais pas un état des risques récent). Détail dans [[Bail]] et [[Diagnostic]].
- **« Oui » — naissance du locataire.** La date et la commune de naissance deviennent facultatives sur la fiche d'un
  locataire déjà en place. Détail dans [[Compte, personne et adhésion]].

## Les cinq chantiers

| # | Chantier | Pull request | État au 20/11, 21 h UTC |
|---|---|---|---|
| 1 | **« Être rappelé »** : le visiteur laisse lui-même son numéro et son accord ; le dirigeant le rappelle | [#352](https://github.com/GERIMMO/GERIMMO_V4/pull/352) | Fusionnée (`3fd11ae9`), CI de `main` verte ; mise en ligne lancée, **en attente de l'approbation du dirigeant** |
| 2 | **Google** : données structurées (éditeur, questions fréquentes, fil d'Ariane, articles) | [#353](https://github.com/GERIMMO/GERIMMO_V4/pull/353) | Ouverte, CI verte |
| 3 | **Premier bien** : les coordonnées du bailleur se remplissent sur la page « Ajouter un bien » | [#354](https://github.com/GERIMMO/GERIMMO_V4/pull/354) | Ouverte, CI verte |
| 4 | **Bail déjà en cours** et **naissance facultative** (les deux décisions) | [#355](https://github.com/GERIMMO/GERIMMO_V4/pull/355) | Ouverte ; contient une migration |
| 5 | Publications Instagram et LinkedIn | — | Non commencé : demande l'accès aux comptes |

### 1. « Être rappelé »

Une carte sur l'accueil, sous chaque outil gratuit et sous chaque article du journal : nom, téléphone, e-mail, créneau,
case d'accord **obligatoire et non cochée**. La demande entre par la même porte que le formulaire de contact (même
table, même limite de débit, même durée de conservation) et se reconnaît à son message. Dans la console, un badge
« Rappel demandé » et un lien « Appeler le … ». La page des tarifs n'est pas touchée.

Limite connue : pas d'alerte immédiate. Le dirigeant voit la demande dans le courriel de 5 h et dans la console ; la
carte promet donc un rappel « sous un jour ouvré ».

### 2. Google

Les pages publiques décrivent aux moteurs ce qu'elles montrent déjà. Rien n'y est déclaré qui ne soit à l'écran : ni
prix, ni offre, ni note. Reste à faire par le dirigeant : fournir le code de vérification de Google Search Console (le
nom de domaine est géré chez Vercel, l'enregistrement s'ajoute sans toucher au code).

### 3. Premier bien

La règle D29 B ne change pas — aucun bien sans adresse complète ni e-mail de contact du bailleur. Seul le chemin
change : les quatre champs manquants se remplissent sur place, l'e-mail du compte est proposé. Le bouton de « Mes
lots » vide devient « Indiquer mon adresse et créer mon premier bien » (libellé à valider par le dirigeant).

### 4. Bail déjà en cours, naissance facultative

Voir les deux décisions ci-dessus. La mise en ligne suit l'ordre habituel d'une migration : fusion, CI de `main`,
sauvegarde, chantier protégé « Migrations Supabase », puis publication du code.

## Ce qui reste à décider

> [!warning] Points à trancher
> - **État des lieux d'entrée d'un bail déjà en cours.** À l'activation, Gerimmo pose une alerte « État des lieux
>   d'entrée à signer », datée de l'entrée. Pour un bail signé il y a deux ans, elle n'a pas d'objet.
> - **DPE classé G sur un bail déjà en cours** : il bloque toujours l'activation. La décision B ne portait que sur les
>   diagnostics manquants ; l'effet de l'interdiction de louer sur un bail en cours n'est établi par aucune source du
>   wiki.
> - **Libellé** « Indiquer mon adresse et créer mon premier bien », qui remplace celui choisi avec D29 B.
> - **Message d'aide aux inscrits restés sans bien** : à concilier avec la règle du 23/10.
> - **Vente** : toujours fermée (médiateur de la consommation, paiement), indépendamment de ce chantier.

## Liens

[[Propriétaire bailleur]] · [[Bail]] · [[Diagnostic]] · [[Compte, personne et adhésion]] · [[Prospection commerciale]] ·
[[Onboarding et abonnement]] · [[Audit d'acquisition du 3 octobre 2026]] ·
[[Refonte visuelle « Maison » et Design System — 20 novembre 2026]]

---
type: synthesis
tags: [lancement, identite-editeur, mediateur, decisions, avis-externes, production]
status: in-progress
created: 2026-10-23
updated: 2026-10-23
sources: ["[[Abonnement]]", "[[État du projet et décisions ouvertes]]", "[[Calendrier de lancement — 30 novembre 2026]]", "[[Contrôle des livraisons de Codex — 22 octobre 2026]]"]
---

# Informations manquantes — 23 octobre 2026

Au 23/10 au soir, **une seule information de l'identité de l'éditeur manque en production : le médiateur de la consommation** (nom, adresse, site). Elle ne bloque plus rien depuis la décision du dirigeant du 23/10 ([[Abonnement]]). Le reste de ce qui manque, ce sont des avis externes, des décisions du dirigeant et des réglages de prestataires ; aucun ne ferme une fonction.

Relevé fait en lecture seule (présence des valeurs seulement, aucune valeur recopiée) : table `supervision_identite` le 23/10 vers 16 h UTC, noms des variables Vercel du projet `gerimmo-v4`.

## Identité de l'éditeur (`/admin/parametres`)

| Information | État | Effet |
| --- | --- | --- |
| Dénomination, forme, siège, immatriculation, SIRET, directeur de la publication, e-mail, téléphone | renseignés | — |
| Médiateur de la consommation : nom, adresse, site | **vides** | non bloquant ; « Adhésion à venir » sur les mentions légales |
| Capital social | vide | sans objet : la forme saisie est une entreprise individuelle |
| Numéro de TVA intracommunautaire | vide | non affiché en franchise en base ; dire au juriste si l'entreprise en a un |
| Coordonnées des 11 prestataires, localisation de la Base Adresse Nationale | renseignées | — |

Se saisit dans la console, sans déploiement : les trois pages légales reprennent la valeur aussitôt.

## Avis externes attendus

| Qui | Sur quoi |
| --- | --- |
| Juriste | CGU/CGV V1 (offre agences, artisans, clause de signature électronique) ; impayé à 15 ou 30 jours ; rappel du droit de rétractation et remboursement au paiement ; modèles d'actes (bail, mention de caution) ; état des lieux signé à distance (règle RM-13.1.6) ; vente avant adhésion au médiateur |
| DPO | durées de conservation des dossiers et activation des quatre règles du 22/10 ; suppression ou anonymisation de compte ; registre des traitements ; base légale de la liste d'attente des agences |
| Expert-comptable | modules artisans « clients externes » et « règlements », ouverts le 21/10 sans son avis (décision D24-C) |

Leur mandat est une décision du dirigeant (butée du 24/10 au [[Calendrier de lancement — 30 novembre 2026|calendrier]]).

## Décisions du dirigeant

1. **Médiateur** : choisir l'organisme et adhérer, puis saisir ses trois coordonnées.
2. **Signature pendant la bêta (D4)** : laisser ouvert en connaissance de cause, ou poser l'arrêt « signatures » dans `/admin/relais`. Cautionnement ouvert sans avis du juriste (D2) : maintenir ou refermer.
3. **Réseau d'artisans** : aucune commune ouverte ; communes et métiers à choisir pour que la persona Artisan fonctionne.
4. **Impayé** : 15 ou 30 jours.
5. **Bêta** : canal unique des constats, sort des comptes des amis après le 1/11.
6. **Antivirus des fichiers déposés** : service à choisir.
7. **Offre Vercel** (point B4) : capture de la page Billing.

## Prestataires et continuité

| Sujet | Ce qui manque |
| --- | --- |
| Zoho Sign | contrat de sous-traitance, liste des sous-traitants, durée de conservation ; expéditeur sur l'adresse professionnelle |
| Resend | remise réelle constatée vers Gmail, Outlook, Orange et Free depuis la pose du DMARC (21/10) ; test du transfert de `contact@` |
| Stripe | procédure écrite de remboursement ; confirmation de la résiliation des souscriptions de recette du 30/09 |
| Vercel | `GERIMMO_SESSION_SECRET` absent (le secret de session est dérivé de la clé de service, ce qui fonctionne) ; Node 24 en production contre 22 en CI ; aucune limite de fréquence au bord |
| Surveillance | sonde externe avec alerte au dirigeant (la sonde GitHub passe toutes les 3 à 6 h et ne prévient personne) |
| Continuité | copie hors ligne de la clé des sauvegardes, codes de secours du second facteur, second superviseur |
| Échéances | jeton Meta vers le 26/11 ; `VERCEL_TOKEN` et `GITHUB_AGENT_TOKEN` le 24/12 |

> [!warning] Points à trancher / contradictions
> - Vendre avant l'adhésion au médiateur : l'information du consommateur sur le médiateur est une obligation (art. L. 616-1 du code de la consommation) ; le dirigeant a choisi le 23/10 de ne pas en faire un blocage. À relire par le juriste.
> - Le prompt de Codex du 23/10 (hors dépôt) répartit ces points entre Codex et le dirigeant ; cette page sera mise à jour à chaque information reçue.

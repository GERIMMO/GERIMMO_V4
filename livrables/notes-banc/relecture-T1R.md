# Relecture adverse du lot T1 (commit 75128ffb) — rapport

**Rien de bloquant.** Aucun défaut important prouvé. Six points mineurs, plus une limite d'interprétation déjà signalée par l'auteur.
Moyens : commit extrait par `git archive`, base à moi `gerimmo_ci_sonde_tun` (564 migrations), serveur local sur le port 54397, 150 PDF rendus. Tout est arrêté et supprimé (bases, serveur, copie du code).

## Ce qui a été vérifié et tient
- **Date limite, base = application.** Fonction pure : 33 604 termes (chaque jour de 1996 à 2041, 3 et 6 mois), 0 écart, et la date rendue est bien la dernière admise (force brute SQL). `enregistrer_conge` réel contre le calcul de l'application : 18 baux (début un 29 février, un 31, un 1er, nu et meublé), 7 560 réceptions, 0 écart sur l'acceptation, la date d'effet et la date du message de refus.
- **Exemples de la notice** tous reproduits : 15/06 → 15/12 ; 30/06 → 31/12 ; 31/08 → 28 ou 29/02 ; 20/09 → 20/03 ; 20/07/2017 → 20/01/2017 ; 31/05/2020 → 30/11/2019.
- **« Terme = dernier jour du bail »** est cohérent avec la notice : son exemple 2-2-2 (échéance 31 mai, reconduction au 31 mai 2020, congé au plus tard le 30 novembre 2019) et « 30 juin », « 31 août » sont des derniers jours de baux commencés un 1er.
- **Article 15 II** : les cinq alinéas du code sont identiques caractère par caractère au recueil (r1), pied et en-tête de page retirés ; l'alinéa 4 recollé est exact, aucun mot manquant. Empreinte recalculée = celle du code (`c2cdca5f…`). Le texte est une constante embarquée dans `article-15-ii.ts` : aucun chemin du scratchpad dans `src`, les tests ni la migration. Dans le PDF, chaque alinéa est retrouvé entier.
- **Migration** : seul diff avec `20261112120300` = les trois changements annoncés. `SECURITY DEFINER` et `search_path=''` conservés, droits de `enregistrer_conge` identiques avant et après, `date_limite_conge_bailleur` fermée à anon et aux connectés, 0 règle RLS modifiée, aucune donnée écrite. Le retour rend le texte de 20261112120300 à l'identique ; rejeu, retour, rejeu sans écart. Manifeste, `ordre-migrations`, LISEZ-MOI, FICHIERS_EN_SERIE à jour.
- **Préavis du locataire** : aucun congé enregistré modifié ; les documents (décompte, attestation) lisent `preavis_mois` et `date_effet` stockés, donc pas d'allongement rétroactif.
- **Refus nouveaux** conformes au texte lu (article 13, article 15 I, notice 2-1-1, 2-1-4, 2-2-2), messages clairs. Issue vérifiée : passer la qualité de « SCI » à « SCI familiale » reste possible sur un bail actif, puis la reprise s'enregistre.
- **Références** : `JORFTEXT000036236664`, article 13, article 25-8, article L. 544-1 figurent tous au recueil. Rien n'est écrit « conforme ».
- **Rendu** : 150 PDF (vente, reprise, motif légitime ; nu, meublé, SCI familiale ; 1 à 60 répétitions ; avec et sans signature), de 2 à 4 pages. Aucun titre orphelin, aucun « Fait à » en bas de page, aucune dernière page réduite à la signature (au moins 4 lignes avant). Balises HTML saisies échappées.
- **Tests** : les 9 fichiers concernés passent sur ma base (280 cas). Les tests modifiés ne sont pas affaiblis : ils suivent le texte remplacé, et gardent « à faire relire » et « ne garantit pas ».

## Défauts
- **T1R-1 (mineur, question de juriste déjà notée)** — Si « terme le 15 juin » désignait le jour anniversaire (bail du 15 juin, dernier jour le 14), Gerimmo refuserait un jour trop tôt. À la préparation de la lettre, c'est un refus prudent. À l'enregistrement, c'est plus grave qu'un refus prudent : un congé valable ne peut pas être saisi, le bail reste « actif » et reconduit, sans dérogation possible. La notice (2-2-2) appuie la lecture retenue. Correction : aucune avant l'avis du juriste.
- **T1R-2 (mineur, hors commit)** — `terme_bail_calcule` donne le 27/02 pour un bail commencé un 29 février (le 29/02/2024 + 3 ans = 28/02, moins un jour). La date limite tombe au 27/08 au lieu du 31/08 : jusqu'à 4 jours de refus à tort, que la nouvelle règle stricte rend visible. Correction : à traiter à part.
- **T1R-3 (mineur)** — `src/app/locataire/[orgId]/logement/page.tsx:180`, zone inconnue : « 1 mois si le logement est en zone tendue, 3 mois sinon » promet encore un mois d'office. Correction : « 1 mois si le logement est en zone tendue et que votre lettre le précise et le justifie ».
- **T1R-4 (mineur)** — Ordre de mise en production. Application livrée avant la migration : le formulaire affiche 3 mois en zone tendue, mais l'ancienne base enregistre 1 mois d'office. Correction : jouer la migration d'abord, et l'écrire dans la note de livraison.
- **T1R-5 (mineur)** — `notes-T1.md` § 4 donne l'empreinte `b2f4a4cf…` ; le code et `t1-art15ii.json` portent `c2cdca5f…`, qui est la bonne. Corriger la note.
- **T1R-6 (mineur)** — La lettre écrit « Désignation des locaux loués, telle qu'elle figure au bail », alors que le texte vient des fiches Gerimmo ; c'est inexact si le bail a été signé ailleurs. Correction : « Désignation des locaux loués : », ou garder la question au juriste.
- **T1R-7 (mineur)** — Le rendu de l'auteur ne comptait aucun bail meublé (trois baux nus). Je l'ai fait : rien à signaler.

## Non vérifié
- Le recueil lui-même contre Légifrance (article 15 II en vigueur, identifiant de la notice).
- Le parcours e2e au navigateur et les écrans à 390 px, pour ne pas toucher au banc partagé (BUILD et E2E de l'auteur lus : sortie 0).
- La suite vitest complète.
- Les congés déjà enregistrés en production sous l'ancienne règle.
- Les congés en colocation à chambres : désignation lue dans le code, pas rendue.

Pièces : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/recueil/T1R/` (`pdf/` avec `rapport.json`, `img/`, `outils/`).

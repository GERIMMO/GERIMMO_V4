---
type: synthesis
tags: [lancement, calendrier, pilotage, beta, agences, liste-attente]
status: draft
created: 2026-10-20
updated: 2026-10-22
sources: ["[[Audit final avant publication — 19 octobre 2026]]", "[[Suites de l'audit — 20 octobre 2026]]", "[[Prêt à démarcher]]", "[[Prompt de passation à Codex — état du 16 octobre 2026]]", "[[Registre des traitements]]", "[[Recette de production]]", "[[Grille tarifaire]]", "[[Onboarding et abonnement]]"]
---

# Calendrier de lancement — 30 novembre 2026

> [!warning] Orientation du 21 octobre 2026
> Le dirigeant demande une base entièrement fonctionnelle, puis la finalisation des informations juridiques : les propositions de fermeture préventive ci-dessous sont remplacées par la préparation de l’ouverture des fonctions métier, avec vérification technique et protections normales. Les agences restent uniquement en liste d’attente, conformément à sa clarification. Ce changement d’objectif n’atteste pas l’activation effective des services ni leur validation juridique. Voir [[Préparation fonctionnelle — 21 octobre 2026]].


> [!warning] Contrôle du 22 octobre 2026
> Les lignes « Dirigeant » de la semaine du 19 au 25/10 ont été confiées à Codex le 21/10. Le [[Contrôle des livraisons de Codex — 22 octobre 2026]] relève : aucune ligne encore passée en « fait (date) » ; la décision D2 attendue au 23/10 (« cautionnement fermé ») a été prise à l'inverse (interrupteur rouvert le 21/10) ; les modules artisans ont été ouverts ; aucune recette de production après les trois dernières fusions. À relire au prochain lundi.

> [!info] Décision du dirigeant du 20 octobre 2026
> La publicité commence dès maintenant dans son entourage. La **sortie officielle est fixée au lundi 30 novembre 2026** : le premier client particulier doit pouvoir s'inscrire le 30 novembre au soir. Les agences de gestion ne sont pas dans cette sortie : elles s'inscrivent sur une **liste d'attente** depuis le site vitrine ([[Liste d'attente des agences]]), et seront prévenues quand leur offre ouvrira. D'ici là, les tests doivent être terminés.

Cette page transforme la décision en semaines, en jalons et en critères vérifiables. Elle ne remplace ni le [[Prompt de passation à Codex — état du 16 octobre 2026]] (le détail de chaque travail), ni [[Prêt à démarcher]] (ce qu'on peut promettre aujourd'hui), ni l'[[Audit final avant publication — 19 octobre 2026]] (les bloquants et leur état). Elle dit **quoi, qui, quand**, et ce qui arrive si une date glisse. Elle se relit chaque lundi ; chaque jalon franchi reçoit une entrée dans `log.md`.

## 1. Ce que « prêt le 30 novembre au soir » veut dire

Le 30 novembre au soir, un particulier inconnu de l'équipe doit pouvoir, seul, depuis son téléphone :

1. s'inscrire sur `/inscription`, confirmer son adresse, choisir son mot de passe, et arriver dans son espace ;
2. créer son bien et son lot, sa fiche locataire, son bail (voie du PDF déposé), inviter son locataire ;
3. générer l'échéancier, encaisser, envoyer une quittance ; déclarer et suivre un incident ;
4. lire des pages légales (mentions, conditions, confidentialité) **relues par un juriste** et portant l'identité réelle de l'éditeur ;
5. comprendre que son essai dure deux mois (offre de lancement jusqu'au 31/12/2026, [[Grille tarifaire]]) et ce qu'il paiera ensuite, le bouton de paiement étant **ouvert** (identité de l'éditeur saisie, conditions acceptées dans sa version en vigueur, Stripe en mode réel avec un paiement de test réel remboursé au préalable).

Et de notre côté, le même soir :

- la recette de production du jour est verte sur le SHA exactement déployé ([[Recette de production]]) ;
- la sonde de disponibilité externe et l'e-mail du relais de 5 h fonctionnent depuis au moins une semaine ;
- aucun bloquant de l'audit n'est ouvert, ou chaque reste est couvert par une décision écrite du dirigeant dans `log.md` ;
- le [[Registre des traitements]] est à jour (Zoho, prospects, liste d'attente des agences) et validé, ou sa validation est datée ;
- la décision d'ouverture est écrite dans `log.md` (entrée `decision`) et [[Prêt à démarcher]] est mise à jour le matin même.

Un seul de ces points manquant le 30 novembre à midi : l'ouverture du soir devient une décision explicite du dirigeant, pas un automatisme.

## 2. Semaine par semaine

Rôles : **Dirigeant** (saisies, décisions, tableaux de bord, carte bancaire), **Codex** (travaux du prompt de passation, déploiements), **Claude** (lots relus et recettés, wiki), **Juriste / DPO / Expert-comptable** (relectures), **Amis** (bêta fermée, trois personas). Les références A1…H5 renvoient au prompt de passation.

### Semaine du 19 au 25 octobre — poser les fondations

| Qui | Quoi | Échéance |
| --- | --- | --- |
| Dirigeant | Mandater le juriste, le DPO et l'expert-comptable (H2) : **sans mandat avant le 24/10, la relecture des CGU ne tiendra pas le 30/11** | 24/10 |
| Dirigeant | Saisir l'identité de l'éditeur dans la console (H1) ; vérifier les trois pages légales en ligne | 24/10 |
| Dirigeant | Décisions écrites dans `log.md` : attente de la vente ou Stripe réel (C1), cautionnement fermé (D2, variable posée), interrupteurs Zoho (D4), liste d'essai de signature (D3) | 23/10 |
| Dirigeant | Protection de `main` et squash seul (A1 ; déjà en partie fait le 20/10), collaborateurs relevés (A5) | 25/10 |
| Dirigeant | Boîte e-mail dédiée aux tests, trois alias, dossiers remis aux amis (dossier du dirigeant, étape 1) | 23/10 |
| Claude | Liste d'attente des agences : site, table, console, wiki ; PR relue, CI verte, déploiement par le protocole, recette | 23/10 |
| Codex | Recette de production en ligne après la PR #213 (demandée dans sa livraison du 20/10) ; sauvegarde quotidienne vérifiée | 22/10 |
| Codex | A2–A4, B1–B5 (réglages Auth : notifications de sécurité, changement de mot de passe sécurisé, sessions, limites) | 25/10 |

### Semaine du 26 octobre au 1er novembre — bêta fermée, semaine 1

| Qui | Quoi | Échéance |
| --- | --- | --- |
| Amis | Dossiers Propriétaire, Locataire, Artisan : J1 à J7 de la grille de suivi (document « Dossiers de test par persona », remis le 20/10) | 1/11 |
| Dirigeant | Chaque soir : rassembler les constats ; valider l'artisan de test ; lire l'e-mail de 5 h | quotidien |
| Dirigeant | 29/10 au matin : vérifier la tâche de nuit des devis (`cron.job_run_details`, I.3) | 29/10 |
| Codex | Corrections des constats P0/P1 des amis (PR relues, recette) ; C2–C3 (webhook, identité Stripe affichée) ; D1 (offre Vercel Pro, journaux) ; F1–F2 (DMARC, boîte de contact, sonde externe) | 1/11 |
| Codex | E1–E3 (conditions Zoho, adresse de réponse, coût des essais) | 1/11 |
| Juriste | Reçoit : CGU, CGV, confidentialité, mentions légales, modèles d'actes, parcours de paiement, conditions artisans (H2) | 27/10 |

### Semaine du 2 au 8 novembre — code de sécurité et données

| Qui | Quoi | Échéance |
| --- | --- | --- |
| Codex / Claude | G1 (récupération de compte réservée aux liens e-mail, second facteur du super-administrateur, purge des comptes jamais confirmés), G2 (suppression de compte), G3 (prospects : conservation et purge), G4 (registre et modèle de sous-traitance), G5 (fichiers volumineux : mesure, puis limite ou liens signés ; une partie livrée le 20/10) | 8/11 |
| Dirigeant | Paiement en **mode test** Stripe de bout en bout (C4), puis décision du passage en réel | 6/11 |
| Dirigeant | F3 : adresse de connexion dédiée du super-administrateur, second superviseur enrôlé | 8/11 |
| Amis | Contrôles différés : relance d'impayé à 5 jours, rappels d'intervention, rapport mensuel | selon la grille |
| DPO | Registre des traitements, durées (prospects, liste d'attente, comptes non confirmés), suppression de compte | 8/11 |

### Semaine du 9 au 15 novembre — contrat, paiement, signature

| Qui | Quoi | Échéance |
| --- | --- | --- |
| Juriste → Codex | G7 : CGU et pages légales réécrites pour l'offre V1, conditions artisans acceptées à l'inscription, `CONDITIONS_VERSION` incrémentée, acceptation par la case cochée | 15/11 |
| Codex | G8 : lien vers les CGV et rappel de rétractation à côté de la case, geste d'annulation et de remboursement, délai de coupure aligné sur les CGV | 15/11 |
| Dirigeant | Décisions signature (E6, E7) : quota, inclusion ou non dans l'abonnement, règles des devis ; puis E4–E5 par Codex si la signature reste ouverte au lancement, sinon fermeture écrite | 13/11 |
| Codex | D5 (retrait Yousign), D7 (prévisualisations), G9–G13 (fonction `abonnement_client_pose`, contenus, mineurs juridiques relus, sauvegarde de l'historique des migrations) | 15/11 |
| Dirigeant | **Paiement réel** avec sa carte, résiliation, remboursement (H5) ; consigné | 15/11 |
| Expert-comptable | Franchise de TVA, libellés HT/TTC, simulateurs, facturation électronique | 15/11 |

### Semaine du 16 au 22 novembre — gel et répétition générale

| Qui | Quoi | Échéance |
| --- | --- | --- |
| Tous | **Gel des fonctionnalités le vendredi 20/11** : après cette date, seules des corrections entrent, chacune relue et recettée | 20/11 |
| Codex | G6 : recette de production étendue (signature en essai, invitations locataire et artisan, retour de paiement, console) ; jouée en production | 20/11 |
| Dirigeant + Claude | Répétition générale : un particulier fictif suit le dossier Propriétaire de bout en bout en production, paiement réel compris, puis remboursement | 21/11 |
| Dirigeant | Textes de lancement (site, réseaux, message à l'entourage), [[Parrainage]] prêt, relecture des articles publiés (H4) | 22/11 |
| Dirigeant | Jetons et échéances (D6) : statistiques Meta vers le 26/11 ; calendrier des renouvellements | 22/11 |

### Semaine du 23 au 29 novembre — dernière ligne droite

| Qui | Quoi | Échéance |
| --- | --- | --- |
| Codex | Dernière PR de corrections ; CI verte ; sauvegarde ; déploiement ; recette verte | 27/11 |
| Dirigeant | **Décision d'ouverture écrite** dans `log.md` (H3), [[Prêt à démarcher]] et cette page mises à jour | 27/11 |
| Dirigeant | Relecture finale des pages légales en ligne avec l'identité réelle ; vérification des e-mails reçus par un compte neuf (confirmation, accès, quittance) | 28/11 |
| Claude | Lint du wiki ; registre des anomalies soldé ou reporté par décision | 29/11 |

### Lundi 30 novembre — ouverture

- **Matin** : dernier déploiement au plus tard à 12 h ; recette de production sur le SHA déployé ; sauvegarde ; sonde et e-mail de 5 h vérifiés.
- **Soir** : ouverture ; le premier client s'inscrit ; le dirigeant suit la console et sa boîte.
- **1er et 2 décembre** : surveillance rapprochée (erreurs Vercel, journaux, e-mail de 5 h) ; premier point du matin après ouverture.

## 3. Les jalons qui ne se négocient pas

| Date | Jalon | Pourquoi c'est une butée |
| --- | --- | --- |
| 24/10 | Juriste, DPO et expert-comptable mandatés ; identité de l'éditeur saisie | Deux à trois semaines de relecture et de corrections : commencer après le 24/10 repousse les CGU au-delà du 30/11 |
| 23/10 | Décisions C1, D2, D3, D4 écrites | Elles conditionnent le mode Stripe, la signature et la recette ; sans elles, les tests des amis portent sur un état flottant |
| 1/11 | Fin de la semaine 1 des amis ; constats P0/P1 connus | Les corrections lourdes doivent être codées avant le gel |
| 15/11 | Paiement réel réussi et remboursé ; CGU réécrites livrées | Le paiement du premier client s'appuie sur ces deux faits |
| 20/11 | Gel des fonctionnalités | Dix jours de corrections seules, recettées, avant l'ouverture |
| 27/11 | Décision d'ouverture écrite | Sans décision écrite, pas d'ouverture le 30 au soir |

## 4. La publicité dans l'entourage, dès maintenant

Le wiki pose une règle : les particuliers ne sont pas démarchés directement (décision du 19/09, [[Expansion territoriale autonome]]) ; les leviers sont la publicité sur Instagram et Facebook et le [[Parrainage]]. Parler de Gerimmo à son entourage et à des connaissances qui le demandent n'est pas du démarchage : c'est le bouche-à-oreille, et c'est le dirigeant qui parle. Ce qu'on peut dire aujourd'hui, et ce qu'on ne doit pas dire, est dans [[Prêt à démarcher]]. En résumé pour l'entourage :

- **On peut dire** : la gestion locative des propriétaires bailleurs et des SCI, partout en France, avec un espace locataire ; essai gratuit de deux mois sans carte pour toute inscription avant le 31/12/2026 ; les prix de la grille publique ; un réseau d'artisans qui s'ouvre commune par commune ; une sortie officielle le 30 novembre.
- **On ne promet pas** : la signature électronique (non proposée au public), l'offre agences (liste d'attente seulement), un paiement avant son ouverture, des services bancaires ou des SMS, une date d'ouverture du réseau d'artisans dans une commune donnée.
- **On ne fait pas** : d'inscription à la place de quelqu'un, de compte « pour voir » avec de vraies données d'un tiers, de promesse de prix hors grille.

Les proches qui s'inscrivent avant le 30/11 sont des utilisateurs réels : ils reçoivent de vrais e-mails, voient les vraies pages légales et le paiement tel qu'il est. Tant que l'identité de l'éditeur n'est pas saisie, le bouton de paiement refuse ; c'est voulu.

## 5. Ce que la liste d'attente des agences change

Rien à la date du 30 novembre : elle permet seulement de **ne pas perdre** les agences qui se manifestent. Le processus est décrit dans [[Liste d'attente des agences]]. Deux décisions restent au dirigeant, à écrire dans `log.md` : la date à laquelle il recontacte les agences inscrites (après le 30/11, quand l'offre agences aura une date), et la durée de conservation de leurs coordonnées (le repère usuel pour des prospects est de trois ans après le dernier contact ; à confirmer avec le juriste ou le DPO).

## 6. Risques et plans de repli

| Risque | Signal | Plan de repli |
| --- | --- | --- |
| Le juriste rend tard ou demande des changements lourds | Pas de retour le 10/11 | Ouvrir avec les pages actuelles corrigées de l'identité, et une décision écrite qui l'assume ; relecture et nouvelle version des CGU après ouverture (préavis d'un mois, article 16) |
| Stripe réel non prêt | Paiement test non joué le 6/11 | Ouvrir en essai seul : le premier paiement d'un inscrit du 30/11 n'arrive qu'à la fin janvier 2027 ; le bouton reste fermé par la garde jusqu'à l'identité saisie |
| Les amis trouvent un P0 ou un P1 tard | Constat après le 15/11 | Correction unique relue et recettée, ou retrait de la fonction concernée du parcours ; jamais de correction non recettée après le 20/11 |
| Signature électronique non tranchée | Décisions E6/E7 absentes le 13/11 | Fermer les interrupteurs Zoho jusqu'à décision ; rien n'est promis au public à ce sujet |
| Capacité de correction insuffisante | Plus de dix constats ouverts au 8/11 | Réduire le périmètre de l'ouverture au parcours du § 1 ; les autres écrans restent accessibles mais ne sont pas mis en avant |
| Indisponibilité le jour J | Sonde rouge, erreurs Vercel | Retour à la version précédente par Vercel ; les migrations ont leurs retours arrière (LISEZ-MOI des retours) |

## 7. Suivi

- Cette page est relue chaque lundi par le dirigeant avec Claude ou Codex ; les lignes faites passent en **fait (date)**, les lignes glissées reçoivent une nouvelle date et une raison.
- Chaque jalon franchi reçoit une entrée dans `log.md` ; les décisions reçoivent une entrée `decision`.
- La grille de suivi des amis (document « Dossiers de test par persona ») et le [[Registre des anomalies — audit du 13 octobre 2026]] alimentent la liste des corrections.

> [!warning] Points à trancher
> - Ouvrir le 30/11 **sans** relecture juridique rendue : oui ou non, et qui l'écrit.
> - Stripe en mode réel avant ou après le 30/11 ; le premier paiement réel du dirigeant est-il fait avant l'ouverture (recommandé) ?
> - La signature électronique est-elle ouverte au public le 30/11 (non recommandé tant que E1 et E6 ne sont pas tranchés) ?
> - Qui recontacte les agences de la liste d'attente, et quand.
> - Les amis gardent-ils leurs comptes après la bêta (décision du 20/10 : oui, en les déconnectant), et sous quelle adresse.

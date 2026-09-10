---
type: synthesis
tags: [audit, securite, regles-metier, mobile, recette]
status: stable
created: 2026-09-10
updated: 2026-09-10
sources: ["[[Comptabilité]]", "[[Quittancement des loyers]]", "[[Isolation multi-organisation]]", "[[Agent immobilier]]", "[[2026-07-24-gerimmo-v3-module-19-mobile|Module 19 — Mobile]]"]
---

# Audit du 10 septembre 2026

Audit complet demandé en carte blanche : **mobile d'abord**, puis **tests et
audit de tout**. Quatre dimensions cherchées en parallèle (sécurité des RPC,
conformité aux règles métier, invariants des données de production, couverture
RLS), chaque trouvaille non triviale soumise à un **vérificateur adversarial**
chargé de la réfuter. **18 confirmées, 4 réfutées, 13 P2.** Les deux P0 de
sécurité et le P0 documentaire ont été rejoués, corrigés, testés et appliqués
en production le jour même.

## Ce qui a rendu l'audit possible

Le cloud de cette session n'atteint ni Supabase ni Vercel (politique réseau).
Une **pile locale fidèle** a donc été montée (`app/e2e/local/`, mode d'emploi
dans `app/docs/recette-hors-ligne.md`) : Postgres portant les 128 migrations
**dans l'ordre réel de la production**, et un émulateur de l'API Supabase où
chaque requête s'exécute sous `set_config('request.jwt.claims') + SET ROLE` —
donc **avec le vrai RLS**. C'est ce banc qui a permis de rejouer les failles
sous l'identité d'un attaquant, et non de raisonner sur le code.

> [!warning] Leçon de méthode — deux tests faux avant le bon
> Les premiers rejeux de la fuite ont conclu à tort qu'elle n'existait pas :
> l'UUID passé en paramètre était lui-même lu par un `select` filtré par RLS,
> donc `NULL`. **Un test d'étanchéité doit utiliser un identifiant EN DUR** —
> c'est ce dont dispose un attaquant. Le vérificateur adversarial avait
> raison contre deux vérifications successives.

## Les deux failles d'étanchéité (P0)

**1. Lecture inter-agences.** Un compte authentifié **sans aucune adhésion**,
connaissant l'UUID d'un bail, obtenait tout son échéancier par
`etat_loyers_bail` : périodes, montants appelés, encaissés, impayés. La
fonction est `SECURITY DEFINER` — elle contourne le RLS — et sa seule garde
était le **périmètre de portefeuille**. Or cette famille de gardes ne répond
qu'à une question : *cet agent restreint a-t-il ce lot ?* Pour un étranger,
elle répond « rien ne s'oppose », ce qui valait autorisation.

**2. Écriture inter-agences.** Un admin de l'agence B insérait un encaissement
portant *son* organisation et *le bail de l'agence A*. Le loyer de A passait
« payé », une quittance libératoire pouvait partir pour un loyer jamais reçu,
et les écritures de A atterrissaient au journal de B. Les politiques RLS ne
vérifiaient que l'appartenance de l'appelant à l'organisation **de la ligne**,
jamais la cohérence entre la ligne et l'objet visé.

**Corrections.** Contrôle d'appartenance ajouté dans les RPC qui en manquaient
(sans toucher aux gardes de portefeuille : 30 politiques RESTRICTIVE les
traversent, dont celles des locataires) ; **clés étrangères composites
`*_meme_org_fk`** généralisées aux 13 tables qui ne les avaient pas — la
parade était déjà nommée par le référentiel, elle n'était simplement pas
appliquée partout.

## Le document qui survivait à l'argent (P0)

Constaté sur données réelles : un encaissement de 5 000 € émet 5 quittances,
puis il est supprimé. La contre-écriture partait bien au journal, mais **les
quittances restaient libératoires** — l'agence attestait par écrit 4 350 € de
loyers jamais perçus, en violation durable de RM-3.4.1 et RM-3.4.2
([[Quittancement des loyers]]). Cause : l'émission ne visitait que les appels
payés ou partiels, jamais ceux redevenus impayés.

Désormais **le document suit l'argent** : `resynchroniser_quittances` aligne
tous les appels sur l'encaissé réel (promotion, rétrogradation, retrait) et un
déclencheur sur les encaissements s'en charge sans que l'appelant y pense.
Rattrapage en production : 5 quittances retirées, 1 rétrogradée en reçu, les 7
légitimes conservées.

## Durcissement (P1)

| Ce qui était possible | Ce qui le rend impossible |
|---|---|
| Modifier un encaissement déjà écrit au journal | UPDATE révoqué — corriger = supprimer (contre-passation) puis ressaisir (RM-A6.3) |
| Forger `est_quittance` et le montant d'une quittance | UPDATE limité à l'horodatage d'envoi |
| Contre-passer deux fois la même écriture | Index unique sur `contre_ecriture_de` |
| Deux baux vivants sur un même lot | Index unique partiel sur `baux(lot_id)` |
| Rejouer une révision IRL (hausse composée) | Index unique `(bail_id, date_effet)` |
| Injecter une alerte chez autrui (`poser_alerte_seuil`) | Retirée de l'API publique |

Deux corrections fonctionnelles : la **signature de l'agence** n'apparaissait
jamais sur les documents générés (la politique comparait deux colonnes de la
même table au lieu du nom de l'objet), et **retirer un lot d'un mandat en
brouillon** échouait silencieusement (ni privilège ni politique DELETE).

Huit tables de chantiers non câblés (invitations, signature, reprise de
portefeuille, fonds mandants…) portaient RLS **sans aucune politique** :
fermées explicitement plutôt qu'ouvertes prématurément.

## Mobile — 89 défauts, l'application tient dans la main

Audit à 390×844 tactile, code **et** rendu réel. Corrections en trois étages :
un **socle transverse** (contrôles à 16 px — fin du zoom iOS ; cibles à 40 px ;
libellés de navigation rendus aux icônes ; motif de vue scindée où le détail
remplace la liste au lieu d'être rendu des centaines de rangs plus bas), les
**composants partagés** (modale fermable au doigt, corps défilant), puis
**chaque zone**. Le [[2026-07-24-gerimmo-v3-module-19-mobile|module 19]] a reçu
son cœur : **brouillon local de la grille d'EDL** (sauvegarde automatique,
indicateur permanent de synchronisation, alerte avant fermeture, reprise au
retour du réseau, conflit multi-appareils signalé et non verrouillé) et
**photos compressées à la prise**. Vérifié : 44/44 écrans sans débordement ni
erreur, sur build de production.

## Points à trancher (humain)

> [!warning] Ce que l'audit a soulevé et que l'agent n'a pas tranché
> - **Colocation meublée et dépôt de garantie** : le code plafonne à 1 mois
>   (colocation = bail nu, [[Dépôt de garantie]]) ; l'audit soutient que la
>   colocation *meublée* relève juridiquement des 2 mois. Le wiki tranche
>   aujourd'hui pour 1 mois — **le code est conforme au wiki**, la question
>   est de savoir si le wiki doit changer.
> - **Congé du bailleur** : accepté à toute date, alors que le congé ne vaut
>   qu'au terme du bail. Corriger suppose de calculer l'échéance avec ses
>   reconductions — règle à écrire avant de coder.
> - **Prorata de sortie** : si le congé est saisi après l'émission de l'appel
>   du dernier mois, le prorata est perdu et aucune voie de correction
>   n'existe. Rectificatif à spécifier ([[Solde de tout compte]]).
> - **Création de bien par un agent** : refusée depuis le périmètre du 09/09
>   (l'agent ne voit que ses mandats). Cohérent avec [[Agent immobilier]],
>   mais l'écran « Nouveau bien » lui reste proposé — à masquer ou à ouvrir.

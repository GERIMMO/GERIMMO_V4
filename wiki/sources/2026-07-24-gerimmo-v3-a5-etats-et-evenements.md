---
type: source
tags: [etats, evenements, machines-a-etats, webhooks, idempotence, audit]
status: stable
created: 2026-07-24
updated: 2026-07-24
source-file: raw/assets/GERIMMO-V3-A5-Etats-et-evenements.md
source-type: livrable-transverse (référentiel V3, issu de l'audit externe du 2026-07-24, point P0.6)
source-date: 2026-07-24
sources: []
---

# GERIMMO V3 — Livrable A5 : États et événements

**En une phrase :** registre unifié des **huit machines à états** du référentiel (46 états
au total) et **contrats d'événements** (internes et externes) — un document de référence
pour le développement, qui **consolide sans rien modifier**.

## Le problème traité

Les modules définissaient des transitions d'état **dispersées, sans registre commun** ni
contrat d'événements. Surtout, ils disaient ce qui est **permis**, jamais ce qui est
**impossible** : les transitions interdites manquaient (un bail ne passe pas de brouillon
à terminé ; un incident clos ne revient pas en déclaré). Et les intégrations externes
(Stripe, Yousign, WhatsApp) appelaient rejeu, idempotence et compensation, décrits nulle part.

## Affirmations clés

1. **Huit machines, quarante-six états** : Lot (module 0, 4 états), [[Bail]] (module 1,
   7 états), Mandat (module 5, 5 états), [[Incident]] (module 7, 7 états), [[Devis]]
   (module 9, 6 états), Rendez-vous (module 10, 7 états), Demande de signature
   (module 13, 6 états), Alerte (module 14, 4 états).
   Détail complet : [[Machines à états et événements]].
2. **Toute transition non listée est interdite** (RM-A5.1) et les interdictions
   s'implémentent **comme des contrôles, pas des conventions**. Un état terminal n'a
   aucune sortie (RM-A5.2).
3. **Une transition, plusieurs effets — tout ou rien** : les effets *immédiats*
   réussissent ensemble dans une même transaction (RM-A5.3) ; un effet *différé*
   (email, notification) qui échoue n'annule pas la transition — il est retenté, puis
   alerte (RM-A5.4). Exemple canonique : **bail signé** → lot loué + échéancier créé +
   alerte EDL + archivage (RM-1.7.1 à 1.7.3).
4. **Sept chaînes critiques** documentées : bail signé, mandat signé, encaissement
   enregistré, facture validée, incident clos, période clôturée, rapport envoyé.
5. **Événements externes** (Yousign, Stripe, Meta) : signature de webhook vérifiée
   (RM-A5.5), **idempotence** par identifiant unique d'événement (RM-A5.6/A5.7 — un
   événement reçu deux fois ne produit qu'un effet), **conservation trente jours**
   (RM-A5.8, décision actée), **rejeu manuel par le super admin** (RM-A5.9, console au
   module 18), réponse immédiate + traitement asynchrone (RM-A5.10), alerte après trois
   échecs (RM-A5.11).
6. **Une alerte se ferme par l'action, jamais manuellement** (RM-14.3.2) : la transition
   « ouverte → fermée » résulte du traitement de l'échéance dans le module d'origine.

## Les 11 règles RM-A5

| Code | Règle | Bloquant |
|---|---|---|
| RM-A5.1 | Toute transition non listée est interdite | **Oui** |
| RM-A5.2 | Un état terminal n'a aucune transition sortante | **Oui** |
| RM-A5.3 | Les effets immédiats réussissent ensemble | **Oui** |
| RM-A5.4 | Un effet différé qui échoue n'annule pas la transition | Structurel |
| RM-A5.5 | Tout événement externe est vérifié par sa signature | **Oui** |
| RM-A5.6 | Chaque événement porte un identifiant unique | **Oui** |
| RM-A5.7 | Un événement déjà reçu est ignoré sans erreur | **Oui** |
| RM-A5.8 | Les événements reçus sont conservés trente jours | Structurel |
| RM-A5.9 | Le super admin peut rejouer un événement conservé | Structurel |
| RM-A5.10 | Un webhook répond immédiatement, traite en asynchrone | Structurel |
| RM-A5.11 | Trois échecs consécutifs déclenchent une alerte | Non |

## Ce que le livrable impose

Transitions interdites en contrôles ; transaction partagée pour les effets immédiats ;
**file de traitement** pour les différés ; **table d'événements** (nouvelle table
technique) ; **console de rejeu** super admin (module 18).

## Fin de la phase A

A5 clôt les livrables transverses : A1 (identité), A2 (conservation RGPD), A3 (documents
et preuve), A4 (socle sécurité), A5 (états et événements). Les six points bloquants de
l'audit sont couverts, **sauf le positionnement comptable** — décision commerciale plus
que technique, toujours ouverte.

## Pages mises à jour par cet ingest

[[Machines à états et événements]] (créée) · [[Bien]] · [[Bail]] ·
[[Cycle de vie d'un incident]] · [[Devis]] · [[Planification d'intervention]] ·
[[Agenda et échéances]] · [[Canaux de communication]] ·
[[État du projet et décisions ouvertes]]

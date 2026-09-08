---
type: source
tags: [maquette, agence, agent, admin-agence, ui]
status: stable
created: 2026-09-08
updated: 2026-09-08
source-file: raw/maquettes/2026-09-08-espace-agence-v6.html
source-type: maquette HTML interactive
source-date: 2026-09-08
sources: []
---

# Maquette espace agence v6 (agent + admin d'agence)

Maquette interactive fournie par l'humain le 08/09 : l'espace agence monté en
gamme, avec **deux vues** — Marie Dubois (agent immobilier) et Sophie Renard
(admin d'agence) — dans le même langage premium que les espaces locataire et
propriétaire (barre latérale encre, entrée active laiton, badges).

## Inventaire

**Chrome** : barre latérale (logo + tagline, sélecteur d'agence, menu à badges,
bot « Discuter avec GERIMMO », version) ; en-tête avec recherche ⌘K, cloche de
notifications, aide, profil.

**Menu agent** : Tableau de bord · Mon portefeuille · Incidents · Personnes ·
Loyers & charges · Documents · Agenda · Messages · Mes statistiques · Paramètres.
**Menu admin (en plus)** : Parc de l'agence · Compta & mandants · Mandats &
rapports · Reprise de portefeuille · Administration.

**Pages** : tableau de bord « À faire aujourd'hui » (qualifier un incident,
relancer une assurance, valider un devis, EDL du jour — côté admin : versement
mandant J+12, factures d'honoraires, règlement artisan, contrôle RIB
anti-fraude) + fil d'activité + RDV + messages + colonne droite (donut du parc,
jauge des loyers, fonds mandants, carte éditoriale) ; portefeuille groupé par
mandant avec fiche lot (bail, détenteur du DG, incidents, documents) ; parcours
incident qualifié → devis → planifié ; quittancement avec séquence de relance
graduée ; personnes (mandants, locataires, artisans) ; documents à échéances ;
messagerie unifiée (WhatsApp + interne) ; statistiques (résolution, délais,
coûts) ; compta mandants (« à qui appartient chaque euro »), mandats & CRG avec
bordereaux de versement, reprise de portefeuille en 3 étapes, administration
(agents & portefeuilles, abonnement Stripe, journal d'audit).

## Contradictions avec le référentiel (à ne pas intégrer telles quelles)

> [!warning] Points à trancher / contradictions
> 1. **« Compta & fonds mandants »** (soldes mandants, dépôts détenus,
>    provisions, TVA « à qui appartient chaque euro ») contredit frontalement
>    **RM-A6.1** actée : *« journal de gestion, jamais comptabilité de
>    gérance »* — pas de comptes mandants, pas de séquestre, pas de FEC. La
>    V0 garde le journal ; si l'ambition « gérance complète loi Hoguet »
>    devient réelle, c'est une **révision majeure du référentiel** à trancher
>    par l'humain, pas un écran à copier.
> 2. **Cloche de notifications** : retirée par décision du 30/08 (doublon de
>    l'onglet Alertes) — l'onglet Alertes prime, la cloche n'est pas reprise.
> 3. **WhatsApp/bot omniprésents** (quittance WhatsApp, bot d'accueil,
>    messagerie fusionnée) → S12, canal non construit. Libellés adaptés.
> 4. **Devis artisans, réseau, notation, agenda des interventions** → T5/S9b.
> 5. **Reprise de portefeuille** : la maquette en donne une spécification en
>    3 étapes (source / bascule / balance d'ouverture à écart nul) — précieuse
>    pour T7, non construite en V0.
> 6. **Abonnement agence « 306 €/mois Stripe au lot »** : la grille actée dit
>    paliers de lots sur devis (grandes tranches) + S11 pour Stripe.
> 7. **Factures d'honoraires FH + TVA** : les honoraires existent en écriture
>    au fil des encaissements ; la facturation TTC formelle est un chantier
>    (module 18.6), pas un bouton.
> 8. **Délégation de portefeuille en un geste** : rôles V3 (S9b).
> 9. Photos d'immeubles (picsum), animations de chiffres, recherche ⌘K,
>    éditorial « À découvrir » : hors vague (⌘K optionnelle au backlog).

## Découpage d'intégration (vague F, 08/09)

- **F1 — Chrome premium agence** : barre latérale pour agent et admin (mêmes
  classes que locataire/propriétaire), libellés par rôle (« Mon portefeuille »
  vs « Parc de l'agence »), badges incidents/alertes/messages, sortie mobile.
- **F2 — Pages réelles nouvelles** : Messages (fils par personne), Mandats &
  rapports (admin — mandats, taux, dernier CRG, versements : tables et RPC
  existants), Administration (admin — agents et portefeuilles réels,
  abonnement honnête, journal d'audit si accessible), Statistiques (métriques
  réelles des incidents), Documents ouvert aux agents.
- **F3 — Tableau de bord** : salutation + « À faire aujourd'hui » branché sur
  les alertes réelles (liens directs), fil d'activité conservé, colonne droite
  (donut du parc + jauge des loyers réels).
- Reporté : cf. contradictions ci-dessus.

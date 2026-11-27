---
type: synthesis
tags: [audit, ux, ui, ergonomie, esthetique, mobile, proprietaire, locataire, artisan, superadmin]
status: archived
archived: 2026-11-26
superseded-by: "[[Historique des audits]]"
created: 2026-11-18
updated: 2026-11-18
sources: []
---

# Audit UX-UI complet — dca39641 — 18 novembre 2026

> [!note] Page archivée le 26/11/2026
> Historique : cette page n'est plus tenue à jour. La référence actuelle est [[Historique des audits]].


Audit indépendant demandé par le dirigeant, du point de vue d'un utilisateur non technique. Version auditée :
**dca396418053c9edb01351a6dd5b39dd9a087dc4**.

**Périmètre** :
- [[Propriétaire bailleur]] (particulier, SCI, multi-patrimoine, débutant, compte neuf) ;
- [[Locataire]] (avec et sans bail actif) ;
- [[Artisan]] ;
- [[Super Admin|super-administrateur]] ;
- pages d'entrée communes.

Les espaces agence et agent sont hors périmètre.

**Audit uniquement** : aucun code modifié, aucune donnée réelle lue ni modifiée.

Le rapport complet est dans le dépôt, sous `livrables/audit-ux-ui/` :
- `README.md` : vue d'ensemble ;
- `synthese.md` : synthèse par espace et verdict ;
- `recommandations.md` : 41 recommandations classées ;
- `plan.md` : 12 chantiers ;
- `inventaire.md` : 163 écrans ;
- `lots/` et `captures/` : constats détaillés et planches.

## Méthode

- **Inventaire** : routes relevées dans le code, puis confrontées aux liens réellement affichés dans chaque espace
  par un robot en lecture seule.
  - 163 écrans.
  - 159 notés ; 4 redirections ou écrans évalués dans un autre parcours.
- **Banc local fictif** : application construite à la version auditée, base locale isolée, comptes fictifs.
- **Captures** : 390, 768 et 1440 px, chacune regardée. Aucun débordement horizontal mesuré.
- **Grille** : le test des 10 secondes, trois notes sur 5, les défauts significatifs.

## Constats principaux

- **Identité premium réelle et cohérente** dans les quatre espaces : elle est à préserver.
- **Les gestes courts sont excellents** :
  - la quittance ;
  - le parcours de mission de l'artisan au téléphone ;
  - le signalement par le locataire ;
  - l'accueil d'un propriétaire qui a un loyer encaissé.
- **La densité et le vocabulaire freinent** :
  - accueil propriétaire surchargé, avec des chiffres contradictoires ;
  - bandeau « suspendus » sur toutes les pages ;
  - Finances en double, au vocabulaire comptable ;
  - fiche incident de 12 sections ;
  - console pensée pour un développeur ;
  - facturation artisan sans total dû ;
  - bailleur particulier présenté au locataire comme « Mon gestionnaire — Parc de … ».

## Notes sur 10

| Critère | Propriétaire | Locataire | Artisan | Super-admin |
|---|---|---|---|---|
| Compréhension immédiate | 6 | 8 | 7 | 4 |
| Simplicité de navigation | 6 | 8 | 6 | 4 |
| Cohérence visuelle | 6 | 6 | 6 | 6 |
| Esthétique premium | 8 | 7 | 7 | 7 |
| Expérience mobile | 6 | 8 | 8 | 5 |

## Plan (12 chantiers, 1 à 7 avant l'acquisition)

1. Un accueil propriétaire « À faire maintenant » ; un compte neuf réduit à « Ajoutez votre premier bien ».
2. Le bandeau « suspendus » retiré des pages.
3. Une inscription en trois champs.
4. Des Finances sans comptabilité, avec « Pour mon comptable » à part.
5. L'incident en « ce qu'il vous reste à faire ».
6. Le locataire voit son bailleur et ses documents.
7. L'artisan voit ce qu'on lui doit ; « Factures » dans la barre du bas.
8. Une console de dirigeant (« Aujourd'hui », menu en 5 groupes).
9. Des fiches courtes.
10. Des gestes artisan plus courts.
11. Des liens et des invitations sans impasse.
12. La finition commune (gabarits, volets, couleurs, tablette).

## Réponse à la question finale

On a envie d'utiliser Gerimmo et l'on se débrouille seul pour les gestes courants. On décroche :
- en propriétaire : à l'inscription, devant le bandeau « suspendus », dans les Finances et le détail d'un incident ;
- en artisan : dans la facturation ;
- en dirigeant : dès l'arrivée dans la console.

## Liens

- Audit précédent : [[Audit de qualité commerciale V1 — a776ed43 — 16 novembre 2026]].
- Audit ergonomique précédent : [[Audit avant vente — ergonomie, visuel et fonctions — 16 novembre 2026]].

> [!warning] Points à trancher / contradictions
> - Le bandeau « suspendus » était déjà signalé en P1 le 16/11 ; la formulation a progressé mais il reste sur toutes
>   les pages. À trancher : le retirer des pages ou rétablir les envois.
> - « Mon gestionnaire » pour un propriétaire particulier : le vocabulaire d'agence persiste côté locataire. À
>   trancher : le libellé à afficher pour un particulier et pour une SCI.

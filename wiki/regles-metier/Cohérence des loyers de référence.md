---
type: business-rule
tags: [bail, loyer, encadrement, X08]
status: active
created: 2026-10-16
updated: 2026-10-16
---

# Cohérence des loyers de référence

Sources primaires consultées le **16 octobre 2026**, avant l’implémentation X08 :

- [Loi ELAN, article 140, Légifrance](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000046194150) : accès direct refusé (403). Le texte a été lu dans la [copie Légifrance publiée par la Ville de Paris](https://cdn.paris.fr/paris/2019/09/30/6c3a0340a4ed2a389481de6dc67aedbe.pdf), pages 1–2. Cette copie date de 2019 : elle établit les formules ci-dessous, mais ne constitue pas une lecture intégrale de la version consolidée en vigueur en 2026. La durée de l’expérimentation et toutes ses évolutions ne sont pas déduites de cette archive.
- [Service Public : loyer à Paris](https://www.service-public.gouv.fr/particuliers/vosdroits/F34407), page vérifiée le 1er juillet 2026, rubriques « Loyer de base » et « Complément de loyer » : confirme actuellement la limite du loyer de base, la composition du loyer hors charges et les conditions du complément.

## Règle retenue

Lorsque des loyers de référence sont effectivement imposés par arrêté local, leurs montants sont exprimés par mètre carré de **surface habitable**. Le loyer de référence majoré correspond au loyer de référence augmenté de 20 %. Le loyer de base doit rester au plus au montant majoré applicable au logement. Le loyer hors charges comprend le loyer de base et l’éventuel complément.

Un complément suppose un loyer de base au niveau majoré et des caractéristiques du logement le justifiant, mentionnées au bail. Une justification écrite ne démontre pas à elle seule que le complément est admissible : Service Public décrit aussi des caractéristiques qui l’interdisent. Le contrôle X08 reste une aide de cohérence, sans certification juridique.

## Application dans Gerimmo

- Activer ce contrôle uniquement lorsque `baux.encadrement_loyer === true`. Une zone tendue seule ne l’active pas.
- Utiliser `lots.surface_m2` (surface habitable), jamais la surface Carrez.
- Le champ `baux.loyer_hc` est le total déjà utilisé par la facturation ; calcul indicatif du loyer de base = `loyer_hc - complement_loyer`. Aucun montant enregistré n’est recalculé.
- Signaler les données manquantes, un écart référence/majoré, une base supérieure au plafond, un complément supérieur au loyer, un complément sans justification ou une base sous le plafond avec complément.
- Pour un contrat individuel de chambre, demander la vérification de l’ensemble des loyers du logement : aucune comparaison de ce seul contrat avec le plafond du logement entier. Le ratio référence/majoré reste contrôlable.
- Comparer les montants mensuels arrondis au centime. Pour le ratio au mètre carré, tolérer 0,05 €/m² d’écart pour les valeurs publiées au dixième d’euro (choix de tolérance de l’avertissement, sans modifier le plafond saisi).
- Afficher les avertissements à la saisie, après enregistrement, sur la fiche du contrat et dans les baux de la fiche lot. Ils ne désactivent aucun bouton et ne bloquent ni la saisie ni la sauvegarde.

Les montants de référence restent saisis par le gestionnaire : Gerimmo ne vérifie pas ici l’arrêté, sa date, le secteur ou la catégorie du logement. Les exceptions, interdictions de complément et règles particulières de relocation ou de révision restent à vérifier séparément. Voir aussi [[Mentions obligatoires du bail]] et [[Bail]].

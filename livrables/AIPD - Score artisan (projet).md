# Analyse d'impact relative à la protection des données (AIPD) — Score artisan

> **Projet rédigé par l'agent (2026-07-25)**, art. 35 RGPD. Traitement analysé : le
> **score composite artisan** (module 11 du référentiel V3), dont Gerimmo est
> **responsable de traitement** (livrable A2, RM-A2.9). Document interne, à tenir à
> jour à chaque évolution de la formule.

## 1. Description du traitement

**Finalité** : éclairer le choix d'un artisan par les agences (liste d'affectation
triée par score) et récompenser la fiabilité.

**Données traitées** : évaluations du gérant (qualité, délai, rapport qualité-prix —
50 %), du locataire (satisfaction sur place — 25 %), indicateurs calculés par la
plateforme (25 % : délais d'acceptation et d'intervention, taux de refus, RDV
manqués, ponctualité documentaire). Rattachées au profil global de l'artisan (SIRET).

**Effet sur la personne** : le score influence le **classement dans les recherches
d'affectation** — donc l'accès de l'artisan à des missions. C'est ce qui justifie la
présente analyse : notation automatisée à effet significatif sur un professionnel.

## 2. Nécessité et proportionnalité

- **Base légale** : intérêt légitime (aider les agences à choisir un intervenant
  fiable ; l'artisan bénéficie lui-même d'un canal d'apport d'affaires).
- **Minimisation** : seuls des indicateurs objectifs liés à la prestation sont
  calculés ; le locataire n'évalue pas le prix (qu'il n'a pas payé) ; pas de données
  hors prestation.
- **Exactitude** : publication du score **au-delà de 3 évaluations seulement**
  (mention « nouveau » avant) — évite qu'une note isolée fasse loi ; retrait d'une
  note = recalcul immédiat.
- **Conservation** : évaluations individuelles **3 ans**, score agrégé tant que le
  profil est actif, motifs de blacklist 3/5 ans (matrice A2) — « un artisan doit
  pouvoir repartir sans que son passé le suive ».

## 3. Risques et mesures

| Risque | Gravité | Mesures |
|---|---|---|
| Décision « purement automatisée » privant d'accès au travail | Élevée | Le score **éclaire** le choix, il ne l'impose pas : la sélection reste une décision humaine (agent/propriétaire) ; le filtre bloquant est la décennale, pas le score |
| Note injuste ou malveillante | Moyenne | **Contestation arbitrée par le super admin** (l'agence est juge et partie) — qualifiée de **droit à l'intervention humaine** (RM-A2.11) et **présentée comme telle** à l'artisan ; accès au détail exceptionnel et tracé |
| Opacité du calcul | Moyenne | L'artisan **voit sa moyenne et son score de fiabilité** (« le cacher serait déloyal ») ; la pondération 25/50/25 et les 5 indicateurs sont documentés |
| Ré-identification des évaluateurs | Faible | L'artisan ne voit jamais le détail par évaluateur ; pas de réponse publique |
| Fuite du profil | Moyenne | Socle sécurité A4 (chiffrement, RLS, journaux d'accès) |

## 4. Conclusion

Le traitement est **proportionné** sous quatre conditions, toutes déjà actées au
référentiel : (1) le score ne déclenche jamais seul une exclusion — seule la
blacklist (décision humaine motivée) exclut ; (2) la contestation avec intervention
humaine est effective et annoncée ; (3) le seuil de 3 évaluations est respecté ;
(4) les durées de la matrice A2 sont appliquées. **À réévaluer si** : la formule
change, le score devient un filtre bloquant, ou un tri inter-agences public apparaît.

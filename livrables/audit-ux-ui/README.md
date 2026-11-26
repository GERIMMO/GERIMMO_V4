# Audit UX/UI complet et indépendant — Gerimmo

**Version auditée** : `dca396418053c9edb01351a6dd5b39dd9a087dc4` · **Date** : 18 novembre 2026 ·
**Périmètre** :
- propriétaire bailleur (particulier, SCI, multi-patrimoine, débutant, compte neuf) ;
- locataire (avec et sans bail actif) ;
- artisan ;
- super-administrateur ;
- pages d'entrée communes.

Les espaces agence et agent immobilier sont hors périmètre.

> Audit uniquement : aucune correction n'a été faite dans le code, aucune donnée réelle n'a été lue ni modifiée.

## Les livrables

| Fichier | Contenu |
|---|---|
| [`synthese.md`](synthese.md) | **B.** Synthèse par espace (ce qui marche, complique, surcharge ; à simplifier, supprimer, regrouper ; incohérences ; meilleures améliorations) et **verdict** (notes sur 10, réponse à la question finale). **À lire en premier.** |
| [`recommandations.md`](recommandations.md) | **C.** 41 recommandations classées par impact, avec page, capture, problème, conséquence, solution, priorité P1/P2/P3. |
| [`plan.md`](plan.md) | **D.** Plan en 12 chantiers, avec l'effet attendu pour chacun et l'ordre proposé. |
| [`inventaire.md`](inventaire.md) | **A.** Inventaire des 163 écrans : profil, adresse, captures, statut de vérification, notes de simplicité, d'esthétique et de cohérence sur 5, principaux défauts. |
| [`lots/`](lots/) | Constats détaillés, lot par lot (9 lots), avec le test des 10 secondes. |
| [`captures/`](captures/) | Une planche par écran (1440 px à gauche, 390 px à droite) et neuf planches tablette (768 px). |
| [`donnees/`](donnees/) | Liste des écrans et évaluations au format JSON (source de l'inventaire). |
| [`AVANCEMENT.md`](AVANCEMENT.md) | Suivi des lots et méthode de reprise. |

## En une minute

**L'identité est premium et cohérente.** Elle tient dans les quatre espaces : photographie, titres à empattements,
bleu nuit et or, cartes aérées. Il faut la garder telle quelle.

**Les gestes courts sont excellents** : la quittance, le parcours de mission de l'artisan au téléphone, le
signalement du locataire, l'accueil d'un propriétaire qui a encaissé un loyer.

**Ce qui freine, c'est la densité et le vocabulaire** :
- trop de blocs au même niveau (accueil propriétaire, fiche incident de 12 sections, fiche logement de 12 blocs) ;
- des Finances qui parlent comme un comptable ;
- une console qui parle comme un développeur ;
- le bandeau « suspendus » sur toutes les pages du propriétaire.

**Notes sur 10** :

| Critère | Propriétaire | Locataire | Artisan | Super-admin |
|---|---|---|---|---|
| Compréhension immédiate | 6 | 8 | 7 | 4 |
| Simplicité de navigation | 6 | 8 | 6 | 4 |
| Cohérence visuelle | 6 | 6 | 6 | 6 |
| Esthétique premium | 8 | 7 | 7 | 7 |
| Expérience mobile | 6 | 8 | 8 | 5 |

**Réponse à la question finale** : oui, on a envie d'utiliser Gerimmo, et l'on se débrouille seul pour les gestes
courants. On décroche :
- en propriétaire : à l'inscription, devant le bandeau « suspendus », dans les Finances et dans le détail d'un
  incident ;
- en artisan : dans la facturation ;
- en dirigeant : dès l'arrivée dans la console.

Sept chantiers (plan, 1 à 7) sont à faire avant d'ouvrir l'acquisition.

## Méthode

1. **Inventaire** : les routes ont été relevées dans le code. Un robot a ensuite parcouru les liens réellement
   affichés dans chaque espace, en lecture seule, pour trouver les écrans et onglets manquants (lot 8 bis).
   - 163 écrans au total.
   - 4 sont des redirections, ou un écran évalué dans un autre parcours.
2. **Banc fictif local** :
   - application construite à partir de la version auditée ;
   - base PostgreSQL locale isolée et émulateur des services ;
   - comptes et données fictifs (propriétaire avec SCI et 4 biens, propriétaire débutant inscrit par le vrai
     parcours, compte neuf, locataires avec et sans bail, artisan, super-admin) ;
   - aucun courriel ni paiement réel.

   Pour voir trois écrans de l'artisan (compte rendu, bilan, facture), une mission fictive du banc a été avancée :
   passage « en cours » par écriture sur la base locale, puis photo et bilan déposés par l'interface.
3. **Captures** :
   - chaque écran à 390, 768 et 1440 px, page entière ;
   - mesures automatiques : débordement horizontal, petites cibles, petits textes, nombre de mots.

   Aucun débordement horizontal n'a été mesuré.
4. **Revue visuelle** : chaque planche a été regardée, par lots de 15 à 25 écrans, avec :
   - le test des 10 secondes (« Où suis-je ? Que dois-je faire ? Où cliquer ? ») ;
   - trois notes sur 5 (simplicité, esthétique, cohérence) ;
   - les défauts significatifs.

**Artefacts du banc, non comptés comme défauts** :
- montants à 0,00 € pour des baux créés sans échéancier ;
- montants aberrants des Statistiques (émulateur) ;
- noms « E2E » ou « ESSAI » ;
- champs de date au format américain ;
- barre du bas dupliquée sur les captures pleine page ;
- lien « Aller au contenu » visible ;
- photo non chargée sur une fiche de mission.

**Correction en cours d'audit** : la fenêtre de synthèse des alertes (P38) avait d'abord été notée « non
déclenchée ». Elle figurait en fait sur les captures. Elle est évaluée au lot 8 bis.

# Clôture ciblée du chantier UX 8B

18 novembre 2026. Un agent, contrôle commencé à 13 h 08 UTC, limite fixée à 13 h 23. Aucun nouvel audit, aucune modification applicative, aucun push, fusion, migration ni déploiement.

**Candidat : `81642c5b54c4351e210a8e239050b2ca227c5e26`. Référence avant 8B : `debd04abaa563f06360143617b6ed443d0b1803f`.**

## Navigation ordinateur : OK

Chromium, 1440 × 1000 px, session du super-admin fictif avec second facteur, application et base locales. Sorties réseau externes interdites. La session précédente avait expiré : seule cette session fictive a été renouvelée.

- Les cinq catégories s’ouvrent et donnent accès à leurs 17 destinations principales, chacune parcourue **par clic**.
- Les neuf onglets secondaires ont été parcourus **par clic**, avec titre de page visible et onglet actif correct : Personnalisation des agences, Couverture, Articles, Demandes de contact, Liste d’attente, Consignes, Demandes sur les données, Conservation et Veille.
- **26 destinations accessibles, zéro échec restant, aucun débordement horizontal constaté sur le parcours principal.** Les deux premiers passages Devis/Liste d’attente ont dépassé le délai court du banc pendant les compilations locales. Ces deux seuls scénarios ont été rejoués avec le délai standard de navigation, sans modification applicative ; réussite confirmée. Les résultats bruts sont conservés.
- Santé : le lien vers les services ouvre la section puis les détails. Automatismes : les détails et l’horaire s’affichent. Aucun bouton métier de lancement, pause, approbation ou envoi n’a été exécuté.
- Comparaison du plan de navigation : les 30 URL distinctes (destinations, onglets et anciens chemins de rattachement) sont strictement conservées par rapport à 8A. Les fonctions serveur, contrôles d’accès et actions métier n’ont pas changé. Les preuves antérieures de conservation des 12 formulaires Santé et 11 formulaires Automatismes restent acquises, sans nouveau rejeu.

## Erreur JavaScript antérieure

Signal initial : `Invalid or unexpected token`, rencontré lors d’un parcours précédent du serveur de développement. Le journal initial ne contient ni URL du script, ni ligne, ni pile permettant de l’attribuer. D’autres passages avaient été interrompus par un redémarrage mémoire et par des navigations pendant la compilation.

Sur le candidat stable : **aucune erreur JavaScript et aucun script refusé par le parseur**, contrôlés avec les événements `pageerror` et `Debugger.scriptFailedToParse` du navigateur sur le parcours complet. Les interruptions de navigation ne sont pas assimilées à cette erreur JavaScript.

La copie de référence 8A est exécutée séparément, sans modifier la branche, avec les mêmes données fictives et les mêmes restrictions réseau. **Les mêmes 26 destinations y sont accessibles : zéro échec, zéro erreur JavaScript, zéro script refusé au parsing.** Son résultat est conservé dans `cloture-reference.json`.

**Aucune régression JavaScript reproductible n’est démontrée et aucune correction du logiciel n’est appliquée.** L’origine du message ancien reste indéterminée ; l’hypothèse d’un script incomplet pendant une interruption de développement n’est pas présentée comme une cause prouvée. Si le message réapparaît, conserver l’URL de la page, l’URL et la ligne du script, sa pile, l’événement de parsing et l’état du serveur avant de rouvrir un correctif. Ne pas modifier le logiciel sur ce seul message historique.

## Preuves et portée

`cloture-synthese.json`, `cloture-candidat.json` (essai brut), `cloture-secondaires.json` (deux reprises), `cloture-destinations.json`, `cloture-reference.json` et leurs journaux. Captures du menu, des détails Santé et Automatismes à 1440 px dans `captures/cloture-*.png`.

Les **68 tests ciblés précédemment réussis**, TypeScript, ESLint et les contrôles de permissions restent ceux du commit candidat : ils n’ont pas été relancés inutilement. Cette clôture vérifie l’accès aux écrans et aux détails, pas une nouvelle recette des opérations métier de toutes les pages. Aucun test de production et aucune donnée réelle utilisés.

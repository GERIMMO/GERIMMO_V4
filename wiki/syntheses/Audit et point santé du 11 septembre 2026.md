---
type: synthesis
tags: [audit, sante, accessibilite, securite, performance, design, parcours]
status: stable
created: 2026-09-11
updated: 2026-09-11
sources: ["[[État des lieux du design et des parcours]]", "[[Audit du 10 septembre 2026]]", "[[Marque blanche]]", "[[Dossier locataire]]", "[[État des lieux]]"]
---

# Audit et point santé du 11 septembre 2026

Point de fin de chantier, après la passe de design, le journal éditorial et la
simplification des parcours. **Tout ce qui suit est mesuré, pas estimé** : le
navigateur a rendu les pages, la base de production a été interrogée
directement. Là où une mesure contredit une mesure antérieure, les deux sont
données et l'écart s'explique.

## 1. En une phrase

Le produit est **sain et cohérent** ; les défauts trouvés aujourd'hui ne sont
pas des approximations mais des **écrans qui affirmaient ce qu'ils n'avaient
pas lu** — et l'un d'eux allait jusqu'à l'imprimer dans un document signé par
les deux parties.

## 2. Ce qui a été mesuré, et comment

| Mesure | Étendue | Méthode |
|---|---|---|
| Nom accessible des contrôles | **107 pages** | parcours réel des 4 espaces, liens suivis depuis la porte d'entrée |
| Violations WCAG 2.0/2.1 A et AA | **65 pages** | axe-core sur les pages rendues |
| Débordement horizontal | 107 pages | la page se déplace-t-elle vraiment, à 390 px |
| Effet d'un changement de CSS | **7 551 éléments**, 44 rendus | style *calculé*, relevé avant et après |
| Étanchéité des fonctions | 123 fonctions | fermeture transitive sur `pg_proc`, en production |
| Index et politiques | 49 tables | `pg_index`, `pg_policy`, `pg_constraint`, en production |
| Parcours utilisateur | 4 parcours | marche pas à pas dans le code, chaque étape ancrée, puis recomptée par un critique |

La méthode a été corrigée en cours de route : un premier relevé signalait
« cinq pages sans titre de niveau 1 » — elles en avaient une, la sonde mesurait
avant la fin du rendu. Le défaut était dans l'instrument. Corrigé, puis
re-mesuré.

## 3. Les défauts trouvés, et ce qu'ils coûtaient

### 3.1 Trois requêtes que PostgREST refusait d'arbitrer

Le schéma porte, vers la même cible, **deux clés étrangères** : la clé simple et
la clé composite qui garde l'agence cohérente. **Vingt-huit paires de tables**
sont dans ce cas. Une requête qui imbrique la cible sans dire laquelle suivre
est refusée (PGRST201). Trois l'étaient :

| Écran | Ce qui se passait |
|---|---|
| Export CSV du journal de gestion | **500 à chaque appel** — l'export ne fonctionnait pas |
| Détentions de la fiche bien | échec, au moins affiché |
| **Veille DPE de l'accueil propriétaire** | **échec silencieux** |

Le troisième est le plus grave : l'erreur n'était pas lue, la liste vide se
rendait comme « aucune passoire », et le propriétaire d'un lot classé G ne
voyait **rien** de son interdiction de louer ([[Diagnostic]], loi
Climat et résilience). Après correction, l'encadré affiche *« DPE classe G —
Appartement T2 — 12 rue des Lilas. Location interdite »*.

Un test d'intégration relit désormais **les paires ambiguës dans la base** — il
suivra le schéma — et échoue aussi s'il n'arrive pas à lire une requête : une
requête illisible ne doit jamais passer pour une requête saine.

### 3.2 La charte battait toutes les utilitaires

Les classes de la charte étaient écrites **hors couche CSS**. Une règle sans
couche l'emporte sur n'importe quelle règle en couche, quelle que soit sa
spécificité : **60 utilitaires Tailwind étaient muets**.

- `hidden` sur `.barre` — l'élément restait visible ;
- `px-4` sur `.section-vitrine` — la marge demandée n'existait pas ;
- `text-[var(--or)]` sur `.eyebrow` — le sur-titre du site sortait en **gris
  ardoise sur fond encre, à 2,39:1**, là où le laiton (5,55:1) était écrit.

**Les douze défauts de contraste relevés par axe-core venaient tous de là.** La
palette n'était pas en cause : le laiton sur crème échoue (2,26:1) mais le
jeton `--or-texte` existait déjà pour ce cas ; c'est la cascade qui empêchait
l'écrit de s'appliquer.

Le changement a été mesuré, pas supposé. Il a d'abord produit **une
régression** — les 38 cartes reprenaient l'arrondi de shadcn (8,4 px) quand la
maquette les veut presque vives — d'où les deux règles qui corrigent ce
composant tiers, laissées hors couche à dessein. Les 63 différences restantes
sont toutes des **restitutions** : l'écran fait enfin ce que le balisage
demandait.

### 3.3 Vingt-neuf contrôles sans nom accessible

Un placeholder n'est pas un libellé : il disparaît à la première frappe, et la
synthèse vocale annonce alors « zone de texte ». Trente champs ont reçu un vrai
libellé — visible là où les voisins en ont un, réservé à la synthèse vocale sur
les rangées compactes. Au passage : un `<Label>` sans `htmlFor`, un identifiant
en dur dans un formulaire rendu deux fois, « Type de pièce » porté par deux
champs de la même page, et autant de listes « Nature de la charge » que de
postes.

### 3.4 Ce qui restait

- **Douze liens en texte suivi** distingués par la seule couleur (1,74:1 contre
  le texte voisin, il en faut 3) : soulignés.
- **Vingt-deux tables** dont *toutes* les politiques RLS filtrent sur
  `organization_id` **sans index sur cette colonne**. Sans effet aujourd'hui
  (0 à 44 lignes), c'est la falaise classique du multi-agence — on ne la
  découvre que sous la charge. Les 49 tables concernées en ont un désormais.
- **Quatorze variables d'environnement** non documentées, dont le garde-fou qui
  empêche les tests d'écrire en production.
- Un échafaudage mort à la racine, qui désignait un projet Supabase qui n'est
  plus celui du produit.

## 4. Les parcours

Quatre parcours refaits pas à pas dans le code, chaque étape ancrée sur un
`fichier:ligne`, puis recomptés par un critique.

| Parcours | Relevé du matin | Marche dans le code | Recompte |
|---|---:|---:|---:|
| Inscription → premier bail actif | 50 | **19** | 19 |
| EDL de sortie → restitution | 60 | **37** | 35 |
| Incident : signalement → clôture | 18 | **7** | 5 à 6 |
| Les quatre gestes du locataire | 13 | **8** | 6 |

> [!warning] L'écart va du simple au triple, et il ne se moyenne pas
> Les deux mesures ne comptent pas la même chose : la seconde a reçu une
> définition explicite — *remplir dix champs d'un même formulaire compte pour
> un geste de validation* — et le parcours « premier bail » traverse trois
> formulaires longs. **Aucune des deux n'a été faite au navigateur, une main
> sur la souris** ; tant que ce relevé-là n'existe pas, c'est la seconde qu'il
> faut retenir pour décider, parce qu'elle porte ses ancrages et qu'un tiers
> les a vérifiés. Le **classement**, lui, ne bouge pas : la restitution reste
> de loin le chemin le plus long.

Ce que la simplification a réellement retiré, c'est **moins de clics que de
recopies**. Le gain net le plus net : l'état des lieux de sortie reprend les
compteurs et les clés de l'entrée — la structure seulement, jamais le constat —
et les relevés partent en un envoi au lieu de huit.

Le reste tient en une phrase : **plusieurs écrans annonçaient un état sans
offrir le geste correspondant**. « Prêt à recevoir un bail » sans le bail,
« Créez votre premier bien » dans une pastille qu'on ne peut pas cliquer,
« traitez ce qui bloque ci-dessous » sans un seul lien. Ils offrent désormais
ce qu'ils annoncent.

## 5. Ce que les vérificateurs ont arrêté

Chaque lot a été reproché par un agent dont le travail était de le contredire.
Ils ont arrêté **cinq défauts bloquants**, tous réels :

1. **La copie des clés posait `nombre = 0`.** Le document que les deux parties
   signent imprime cette colonne : « 0 » y atteste que le locataire n'a rendu
   *aucune* clé — le fait même qui fonde une retenue de serrurerie
   ([[Vétusté et décote]]). La colonne devient *nullable* : NULL veut dire
   « pas encore compté », s'imprime en pointillés et remonte dans la liste des
   champs restés à remplir, comme le fait déjà l'index de compteur.
2. **L'accueil du propriétaire annonçait « il ne lui manque que son bail »**
   sans avoir lu les blocages. « Disponible » ne veut pas dire « prêt » : la
   garde de transition ne les revérifie qu'au passage brouillon → disponible,
   et l'ERP ne vaut que six mois.
3. **Le rappel d'assurance à J-30 restait muet** sur le dossier le plus
   réaliste : toute attestation jamais vérifiée passait pour « en cours de
   vérification ». Le bon test existait cinq écrans plus loin.
4. **Un bouton d'enregistrement s'affichait sans que sa fonction existe en
   base.**
5. **Un test laissé rouge** par un changement de cible.

Ils ont aussi rattrapé de la **prose fausse** : un rapport qui inventait une
lacune restante (le champ portait déjà son `aria-label`), deux « précédents
maison » invoqués qui n'existaient pas, un commentaire justifiant `useId()` par
un composant rendu plusieurs fois — alors qu'il ne l'est qu'une.

## 6. Point santé

| Indicateur | État |
|---|---|
| Tests | **370 — 367 passent**, 1 rouge assumé, 2 ignorés |
| Tests de bout en bout | **20 passent**, 1 ignoré |
| Typecheck | **0 erreur** |
| ESLint | **0 erreur**, 9 avertissements (style) |
| Build de production | **vert** |
| Nom accessible des champs | **0 défaut / 107 pages** |
| axe-core (sérieux ou critique) | **0 / 65 pages** |
| Débordement horizontal à 390 px | **0 / 107 pages** |
| Couleurs en dur hors jetons | **0** |
| Avis de sécurité Supabase | **0 ERROR** |
| Migrations au dépôt | 153, dont 15 le 11/09 |

**Le rouge assumé** est le plafond du dépôt de garantie en colocation
**meublée** (RM-2.1.2) : il attend un arbitrage humain, il n'attend pas un
correctif.

### Sécurité — ce qui est prouvé, et ce qui ne l'est pas

**123 fonctions `SECURITY DEFINER`** sont exposées au rôle `authenticated`.
C'est la posture voulue : toute écriture passe par une fonction qui porte
elle-même sa règle. Vérification : **les 123 atteignent `auth.uid()`** — 62
directement, les autres par une fonction d'autorisation — par fermeture
transitive sur `pg_proc`, avec qualification stricte `public.nom(`.

> [!warning] Ce que cette mesure ne prouve pas
> Atteindre `auth.uid()` établit que la fonction **consulte** l'appelant, pas
> qu'elle le fait **correctement sur toutes ses branches**. La preuve de
> l'étanchéité vient des tests d'attaque inter-agences, pas de ce comptage.

**Huit tables** ont RLS activée **sans aucune politique** : elles refusent donc
tout. Aucune n'est lue par l'application (vérifié) — ce sont des modules à
venir. C'est fermé, pas ouvert.

### Performance

Les clés étrangères sans index couvrant passent de **105 à 49**. Les 49
restantes sont 9 gardes composites (jamais des chemins de jointure), 13
références d'auteur, et le reste sur des tables que le produit ne lit pas
encore. À revoir sous trafic réel, pas avant.

## 7. Ce qui reste à trancher — par un humain

Ces points ne se codent pas : ils se décident.

1. **Les conditions d'utilisation n'existent pas**, alors que la case
   d'inscription les fait accepter et que l'action serveur refuse
   l'inscription sans elle. Un site marchand français doit publier ses
   mentions légales. Ce sont des documents juridiques : ils se rédigent.
2. **Plafond du dépôt en colocation meublée** (RM-2.1.2) — le test rouge.
3. **RM-2.4.8 : la provision de 20 %** conservable après une régularisation de
   charges n'existe nulle part dans le code.
4. **RM-A3.5 : la date de première présentation de la LRAR** n'a toujours pas
   de champ — le wiki le dit lui-même.
5. **RM-A6.7 « la précision du débiteur prime »** : aucune colonne au modèle.
6. **Le barème de vétusté** diverge entre le code et le wiki sur quatre postes,
   et RM-2.4.9 le veut paramétrable par agence — il vit encore en dur.
7. **RM-19.2.2 contre le code** : le wiki dit « deux photos et la pièce
   suffisent, aucune autre saisie obligatoire » ; la catégorie est exigée.
8. **Date à laquelle figer les impayés** d'une restitution.
9. **Le vocabulaire de l'incident** : le produit dit tour à tour
   « signalement », « demande » et « incident » pour la même chose. Le rail de
   menu a été rangé sous « Mes signalements », mais l'unification est une
   décision de contenu.
10. **La signature du bail** reste hors plateforme (générer → imprimer →
    signer → scanner → redéposer) : c'est le poste le plus lourd du parcours
    « premier bail », et [[Bail]] le fige sans dire jusqu'à quand.

> [!warning] Points à trancher / contradictions
> - Les deux mesures de parcours du 11/09 se contredisent du simple au triple
>   (§4). Ni l'une ni l'autre n'a été faite au navigateur.
> - `generer_grille_edl` retient « l'entrée signée » par `created_at`, la page
>   de l'EDL par `date_edl` : sur un bail à deux entrées signées, les deux
>   écrans peuvent désigner des documents différents.
> - Le comptage « X blocages de mise en location » du Parc regroupe plusieurs
>   messages de la base sous une même étiquette : le total affiché peut
>   dépasser le nombre de lots réellement concernés.

---
type: synthesis
tags: [design, charte, parcours, ergonomie, audit]
status: stable
created: 2026-09-11
updated: 2026-09-11
sources: ["[[Marque blanche]]", "[[Proposition de valeur]]", "[[Audit du 10 septembre 2026]]"]
---

# État des lieux du design et des parcours

Relevé du 2026-09-11 : huit zones de design et six parcours lus en parallèle,
code en main, chaque trouvaille portant un fichier et une ligne. **254
trouvailles — 47 P1, 145 P2, 62 P3.**

## Ce que le relevé dit du produit

Le fond est solide et le relevé le dit lui-même, zone après zone : « le fond
métier est remarquable », « le socle est bon et visiblement travaillé », « les
textes sont écrits pour un locataire, pas pour un gestionnaire ». Le défaut
n'est pas la qualité de ce qui est fait — c'est que **chaque écran l'a fait
dans son coin**.

| Famille | Nombre | Ce que c'est |
|---|---:|---|
| **Incohérence** | **74** | Le même problème résolu différemment d'un écran à l'autre |
| États | 39 | Chargement, vide, erreur, trop-plein : rarement les quatre |
| Réinvention | 31 | Du balisage qui refait à la main ce qu'une classe maison fait déjà |
| Contenu | 26 | Ce que l'écran dit, ou ne dit pas |
| Hiérarchie | 22 | Ce que l'œil rencontre en premier n'est pas ce qui compte le plus |
| Accessibilité | 22 | Étiquettes, titres, rôles, contrastes |
| Densité | 14 | Écrans étouffés, ou vides et étirés |
| Mobile | 13 | Ce qui contredit les acquis du 10/09 |
| Couleur en dur | 13 | Autant de trous dans la [[Marque blanche]] |

**L'incohérence domine tout le reste.** Trois exemples mesurés : une alerte se
rend de **trois façons** dans la même zone, à un clic d'écart ; la même
information — ce qui empêche une mise en location, issue du même RPC — est
rendue de **trois façons** selon l'écran ; l'espace locataire fait cohabiter
**deux systèmes de cartes** (29 usages de l'un) et **deux systèmes de
pastilles** sur la même page.

## Le défaut systémique : l'échec qui ne se voit pas

39 trouvailles d'« états », et la même partout : **le champ `error` des lectures
n'est jamais consulté**. Tout retombe sur `?? []`. Une requête qui échoue
produit donc un écran *vide et rassurant* — un parc sans biens, un livre sans
écritures, une console sans agences. L'utilisateur croit n'avoir rien ; il a
seulement perdu la connexion. C'est le défaut le plus répandu du produit, et le
plus silencieux.

## Les parcours, en clics

| Parcours | Aujourd'hui | Au mieux |
|---|---:|---:|
| Inscription → premier bail actif | **50** | 31 |
| EDL de sortie → restitution du dépôt | **60** | 51 |
| Incident : signalement → clôture | 18 | 13 |
| Les quatre gestes du locataire | 13 | 9 |
| Quittance reçue par email (session expirée) | 4 | 2 |
| Encaisser un loyer | 3 | 2 |

Le geste le plus **fréquent** est déjà court (3 clics). Ce sont les parcours
**rares et tendus** qui coûtent — précisément ceux où l'on se trompe.

> [!warning] Ces nombres sont contredits par une seconde mesure du même jour
> Un second relevé du 2026-09-11 a refait les quatre parcours lourds **dans le
> code**, étape par étape, chacun ancré sur un `fichier:ligne` portant le lien
> ou le bouton, puis un **critique a rouvert chaque ancrage** et recompté.
>
> | Parcours | Table ci-dessus | Marche dans le code | Recompte du critique |
> |---|---:|---:|---:|
> | Inscription → premier bail actif | 50 | **19** | 19 (compte jugé crédible) |
> | EDL de sortie → restitution | 60 | **37** | 35 |
> | Incident : signalement → clôture | 18 | **7** | 5 à 6 |
> | Les quatre gestes du locataire | 13 | **8** | 6 |
>
> **L'écart va du simple au triple ; il ne se moyenne pas, il s'explique.** Les
> deux relevés ne comptent pas la même chose. Le second a reçu une définition
> explicite — *un clic = une action de pointage ou de frappe décisive ; remplir
> dix champs d'un même formulaire compte pour UN geste de validation* — et le
> parcours « premier bail » traverse trois formulaires longs (11, 11 et 12
> contrôles). Le premier relevé n'énonce pas sa règle de comptage. La
> différence, à elle seule, suffirait à expliquer l'essentiel.
>
> **Ce qui n'est pas tranché** : aucune des deux mesures n'a été faite au
> navigateur, sur l'application, une main sur la souris. Tant que ce relevé-là
> n'existe pas, **aucun des deux nombres n'est le bon** — et c'est le second
> qu'il faut retenir pour décider, parce qu'il porte ses ancrages et qu'un
> tiers les a vérifiés.
>
> À retenir quand même, et indépendant du désaccord : **le classement des
> parcours ne change pas**. La restitution reste, de loin, le chemin le plus
> long ; l'encaissement reste le plus court. C'est sur ce classement que les
> corrections ont été priorisées.

## Les écrans qui mentent

La catégorie la plus grave n'est pas une catégorie du relevé : ce sont les
endroits où **l'écran promet ce que la base refuse**.

- La déclaration d'incident **photo seule** est annoncée « facultative si vous
  joignez une photo » (c'est RM-19.2.2) et **refusée par la base**.
- Le bouton d'encaissement promet un terme, la base **impute le plus ancien**
  (RM-3.3.2, règle légale), et l'écran ne bouge pas.
- Un bail peut devenir **actif sans loyer ni date d'entrée**, deux mentions
  obligatoires.
- Le reçu partiel réclamait **433 € de trop** sur un mois au prorata *(corrigé)*.

## Ce qui perd le travail de l'utilisateur

- Les **photos d'un signalement** sont effacées à la moindre erreur — au pire
  endroit possible, sur un téléphone, dans un local à poubelles.
- La **date d'un encaissement refusé** repart silencieusement à aujourd'hui,
  alors que RM-A6.7 pose que « la banque fait foi sur les montants et les dates ».
- Le **justificatif d'une retenue** part en GED *avant* que la retenue soit
  acceptée : refus légitime = pièce orpheline portant des données du locataire.
- La **destination demandée** n'est jamais mémorisée : un locataire qui ouvre la
  quittance reçue par email atterrit sur l'accueil de son espace.

## Deux alertes écartées après vérification

Le relevé n'a pas toujours raison, et c'est pour cela qu'on rejoue avant de
corriger :
- « le document public n'est pas public » — une quittance porte des données
  personnelles et son destinataire a un compte. **Le comportement est juste.**
- « la modale d'alertes s'ouvre à chaque page » — non, **une fois par session**.
  C'est un contexte de test neuf qui la rouvrait.

> [!warning] Points à trancher (humain)
> - **Les conditions d'utilisation n'existent pas.** La case d'inscription fait
>   pourtant accepter « les conditions d'utilisation », et l'action serveur
>   refuse l'inscription sans elle : on fait cocher un contrat introuvable, sur
>   un site marchand français qui doit publier ses mentions légales. Ce sont des
>   documents juridiques — ils ne s'inventent pas, ils se rédigent.
> - **Les impayés de la restitution** sont figés au démarrage du décompte. Si le
>   locataire règle entre-temps, on lui impute une dette soldée. Figer a
>   peut-être une raison (la stabilité du décompte en cours d'établissement) —
>   le wiki ne le dit pas.
> - **Le bloc « devis agence » ferme la vitrine** alors que cinq sections sur
>   six s'adressent au bailleur : le parcours du bailleur se termine sur un
>   formulaire qui ne le concerne pas.

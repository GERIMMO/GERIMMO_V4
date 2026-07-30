# Recette fonctionnelle — Sprint 2 (le parc)

> Remise le 2026-07-30, à dérouler sur **https://gerimmo-v4.vercel.app**.
> Comptes de démo : `admin.alpha@` · `agent.alpha@` · `admin.beta@` · `multi@` ·
> `superadmin@gerimmo-demo.fr`. Le sprint est terminé quand tous les scénarios
> passent (définition de « terminé » du [[Plan de livraison et sprints]]).

## Scénario 1 — Pop-up d'alertes à la connexion !

Persona : Administrateur d'agence (admin.alpha@)
1. S'assurer qu'il existe au moins une alerte ouverte (en créer une via Agenda & alertes si besoin) → se déconnecter puis se reconnecter → la pop-up de synthèse s'affiche : compteur d'alertes, mention « dont N critique(s) », tri critique → normale → informative, la plus ancienne d'abord.
2. Presser Échap (ou cliquer à l'extérieur de la fenêtre) → la pop-up se ferme, jamais bloquante.
3. Naviguer et rafraîchir les pages → la pop-up ne réapparaît pas dans la même session ; cliquer la **cloche** de l'en-tête → elle se rouvre à la demande, badge = nombre d'alertes ouvertes (rouge si au moins une critique, ambre sinon).
4. Cliquer « Traiter » sur une ligne → arrivée sur la page Alertes de l'agence concernée pour répondre et fermer sans perdre le fil.
5. Fermer toutes les alertes puis se reconnecter → aucune pop-up (elle ne s'affiche que s'il existe des alertes ouvertes).

## Scénario 2 — Pop-up multi-agences et console Super Admin !

Persona : compte multi-agences (multi@) puis Super Admin (superadmin@)
1. multi@ → page « Mes espaces » → la cloche est présente et la pop-up agrège les alertes de **toutes** ses agences, avec un intertitre par agence.
2. superadmin@ → console `/admin` → la cloche est présente (vision toutes agences) ; « Traiter » renvoie vers la **fiche agence de la console**, pas vers l'espace agence.

## Scénario 3 — Créer un bien = créer son lot unique !

Persona : Agent immobilier (agent.alpha@)
1. Espace agence → Parc → « Nouveau bien » : appartement, année de construction 1930, surface 45 m², 2 pièces → arrivée directe sur la fiche du bien, avec un lot « Lot unique » à l'état **Brouillon** (le multi-lots est invisible tant qu'on ne découpe pas).
2. Ouvrir la fiche du lot → la carte Diagnostics affiche les **attendus déduits** du bien : DPE, plomb (avant 1949), amiante, électricité, gaz ; côté fiche bien : ERP, amiante parties communes, termites.
3. Tableau de bord → la carte Parc affiche 1 bien avec le badge « 1 brouillon ».

## Scénario 4 — Bail bloqué par un DPE expiré (démo du sprint) !

Persona : Agent immobilier (agent.alpha@)
1. Sur la fiche du lot en brouillon → l'encart « Ce qui empêche la mise en location » liste : détention incomplète (0 %), DPE absent, ERP absent.
2. Cliquer « Passer en disponible » → refus, avec la liste des blocages dans le message.
3. Détention → « + Nouvelle personne… », nom libre, quote-part 100 % → « Détention active : 100 % » passe au vert.
4. Fiche bien → déposer un **ERP** (l'expiration se pré-remplit à +6 mois) → badge **Valide**.
5. Fiche lot → déposer un **DPE avec une date de réalisation d'il y a 11 ans** (l'expiration pré-remplie est passée) → badge **Expiré** ; « Passer en disponible » → refus : « DPE absent ou expiré (obligatoire en habitation) ».
6. Déposer un DPE daté d'aujourd'hui (expiration pré-remplie à +10 ans) → l'ancien DPE disparaît de la liste (**archivé automatiquement** — le dépôt lève seul le blocage), badge **Valide**.
7. « Passer en disponible » → accepté ; le badge **Disponible** apparaît sur la fiche, la liste du parc et le tableau de bord.

## Scénario 5 — Quote-parts : jamais plus de 100 %, jamais supprimées !

Persona : Agent immobilier (agent.alpha@)
1. Sur un lot neuf, ajouter une détention à 60 % puis tenter d'en ajouter une à 50 % → refus : « La somme des quote-parts... dépasserait 100 % ».
2. Ajouter 40 % → accepté, total 100 %.
3. Cliquer « Clore » sur une détention → elle reste dans l'historique (barrée, avec ses dates de début et de fin) — jamais de suppression, les rapports passés restent justes.

## Scénario 6 — Découpage en lots + clé de répartition !

Persona : Agent immobilier (agent.alpha@)
1. Fiche d'un bien dont le lot est disponible (détention 100 %) → « Découper en lots » : « Lot 2 — RDC gauche », 20 m² → 2 lots affichés, **tous repassés en Brouillon**, message « la clé de répartition est à (re)valider ».
2. Ouvrir la fiche du Lot 2 → le propriétaire du lot d'origine y est **hérité** (100 %).
3. Tenter de repasser un lot en disponible → refus : « Clé de répartition à (re)valider ».
4. Fiche bien → carte « Clé de répartition » : la proposition par **Surface** est pré-remplie ; forcer un total ≠ 100 → le total s'affiche en rouge et la validation est refusée ; valider la proposition → « Clé en vigueur » affichée avec le mode, la date d'effet et les pourcentages par lot.
5. Repasser le lot en disponible → accepté (les diagnostics du scénario 4 restent valides).

## Scénario 7 — Équipements : liste fermée de l'agence !

Personas : Administrateur d'agence (admin.alpha@) puis Agent immobilier (agent.alpha@)
1. admin.alpha@ → Parc → carte « Équipements (liste fermée) » → ajouter « Réfrigérateur » puis « Lave-linge » → ils apparaissent en pastilles ; redéposer « Réfrigérateur » → refus : « Cet équipement existe déjà. »
2. agent.alpha@ → même carte → **pas de formulaire d'ajout** (le catalogue est réservé à l'admin) ; fiche lot → cocher des équipements du catalogue → enregistrés, la sélection persiste au rechargement.

## Scénario 8 — Verrouillage du lot loué + machine à états !

Personas : Agent immobilier (agent.alpha@) puis Administrateur d'agence (admin.alpha@)
1. Sur un lot disponible → « Marquer loué » (raccourci de démo — le bail réel arrive au S4).
2. Formulaire du lot → surface/Carrez/pièces sont **désactivées** ; renommer le lot ou changer sa description → accepté (seuls les champs contractuels sont verrouillés).
3. Fiche bien → modifier l'**adresse** → refus : « Un lot de ce bien est loué : adresse verrouillée (avenant au bail requis) » ; renommer la référence interne → accepté.
4. Lot loué → « Passer en préavis » → « Sortie effective (disponible) » → transitions acceptées ; puis « Archiver ».
5. agent.alpha@ → « Réactiver (admin agence) » → refus : réservé à l'admin ; admin.alpha@ → « Réactiver » → le lot revient en **Brouillon**.

## Scénario 9 — Isolation entre agences, étendue au parc !

Persona : Administrateur d'agence Beta (admin.beta@)
1. Se connecter → Parc de Beta : **aucun** bien d'Alpha visible, tableau de bord à zéro.
2. Coller l'URL directe d'une fiche bien d'Alpha (`/agence/<id-alpha>/parc/<id-bien>`) → redirection ou page introuvable — jamais les données d'Alpha.

## Rappel — non-régression Sprint 1 (à re-dérouler rapidement)

Persona : Agent immobilier (agent.alpha@)
1. GED : déposer un PDF, le consulter (lien stable, retracé), le télécharger sans casser la page.
2. Alertes : créer, escalader, fermer par une action.
3. Mot de passe oublié : lien email → nouveau mot de passe conforme (12 caractères).

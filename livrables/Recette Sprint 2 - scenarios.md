# Recette fonctionnelle — Sprint 2 (le parc)

> Remise le 2026-07-30, à dérouler sur **https://gerimmo-v4.vercel.app**.
> Comptes de démo : `admin.alpha@` · `agent.alpha@` · `admin.beta@` · `multi@` ·
> `superadmin@gerimmo-demo.fr`. Le sprint est terminé quand tous les scénarios
> passent (définition de « terminé » du [[Plan de livraison et sprints]]).
> Mise à jour 2026-07-31 (retour recette) : la mise en location se fait désormais
> **depuis la fiche du bien** (scénarios 3 et 4) — la fiche lot garde les mêmes boutons.

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
1. Espace agence → Parc → « Nouveau bien » : appartement, année de construction 1930, surface 45 m², 2 pièces → arrivée directe sur la fiche du bien, avec un lot « Lot unique » à l'état **Brouillon**, l'encart « Ce qui empêche la mise en location » et les boutons d'état **directement sur la fiche du bien** (le multi-lots est invisible tant qu'on ne découpe pas).
2. Ouvrir la fiche du lot → la carte Diagnostics affiche les **attendus déduits** du bien : DPE, plomb (avant 1949), amiante, électricité, gaz ; côté fiche bien : ERP, amiante parties communes, termites.
3. Tableau de bord → la carte Parc affiche 1 bien avec le badge « 1 brouillon ».

## Scénario 4 — Bail bloqué par un DPE expiré (démo du sprint) !

Persona : Agent immobilier (agent.alpha@)
1. Sur la fiche du **bien** dont le lot est en brouillon (même encart sur la fiche du lot) → « Ce qui empêche la mise en location » liste : détention incomplète (0 %), DPE absent, ERP absent.
2. Cliquer « Passer en disponible » depuis la fiche du bien → refus, avec la liste des blocages dans le message.
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

## Scénario 8 (version complète) — Machine à états et verrouillages du lot loué !

Personas : Agent immobilier (agent.alpha@, étapes 1–11) puis Administrateur d'agence (admin.alpha@, étapes 12–13)
1. Préparer un lot **Disponible** (détention 100 %, DPE et ERP valides — sortie du scénario 4).
2. Vérifier les transitions proposées depuis Disponible : « Marquer loué », « Repasser en brouillon », « Archiver » — et **aucune autre** (les boutons ne proposent que les transitions légales de la machine à états).
3. « Repasser en brouillon » puis « Passer en disponible » → aller-retour accepté (les blocages sont revérifiés au retour).
4. « Marquer loué » *(raccourci de démo — le bail réel arrive au S4)* → badge **Loué** sur la fiche, la liste du parc et le tableau de bord.
5. Champs verrouillés, un à un : dans le formulaire du lot, surface, surface Carrez et pièces sont **désactivées** ; toute tentative de modification (même en réactivant les champs via les outils du navigateur) → refus en base : « Lot loué : surface et pièces sont verrouillées (avenant au bail requis) ».
6. Champs restant modifiables sur un lot loué : nom du lot, étage, description, tantième, meublé → acceptés.
7. Fiche bien : modifier l'**adresse** (voie, complément, code postal ou ville) → refus : « Un lot de ce bien est loué : adresse verrouillée (avenant au bail requis) » ; renommer la référence interne ou changer l'année de construction → accepté.
8. « Découper en lots » pendant que le lot est loué → refus : « Lot loué : résilier, archiver puis recréer (RM-0.3.8) ».
9. « Passer en préavis » → badge **Préavis** ; refaire l'étape 5 → les champs restent verrouillés en préavis.
10. Depuis Préavis, tester les **deux sorties** : « Préavis annulé (re-loué) » → retour **Loué** ; repasser en préavis puis « Sortie effective (disponible) » → **Disponible**.
11. « Archiver » → badge **Archivé**, le lot disparaît des pastilles de la liste du parc ; « Réactiver (admin agence) » avec agent.alpha@ → refus : « Réactivation réservée à l'admin de l'agence ».
12. admin.alpha@ → « Réactiver » → retour **Brouillon** ; repasser en disponible → accepté seulement si détention/diagnostics/clé sont toujours au vert (blocages revérifiés).
13. Décence : sur un lot **non loué**, mettre la surface à 8 m² → bandeau d'alerte « Surface habitable < 9 m² : sous le seuil de décence » (non bloquant) ; à 9 m² → le bandeau disparaît.

## Scénario 9 — Isolation entre agences, étendue au parc !

Persona : Administrateur d'agence Beta (admin.beta@)
1. Se connecter → Parc de Beta : **aucun** bien d'Alpha visible, tableau de bord à zéro.
2. Coller l'URL directe d'une fiche bien d'Alpha (`/agence/<id-alpha>/parc/<id-bien>`) → redirection ou page introuvable — jamais les données d'Alpha.

---

# Tests de régression — cœur des processus S0/S1

> **Principe (acté le 2026-07-30)** : la régression ne reteste que le **cœur des
> processus des sprints passés**. Exclus : ce qui est exercé de fait en testant
> (connexion, navigation, sélecteur d'espaces) et ce que les scénarios du sprint
> en cours couvrent déjà (ex. isolation du parc = scénario 9, alertes en pop-up =
> scénarios 1–2). L'isolation RM-A1.7 et « RLS actif partout » tournent en CI à
> chaque push.

## Régression R1 — GED : dépôt des documents (S1) !

Persona : Agent immobilier (agent.alpha@)
1. Espace agence → Documents → déposer un PDF, type « Courrier », titre libre, rattaché à une personne → le document apparaît dans la liste avec type, date, taille et rattachement.
2. Renommer un fichier .txt ou .exe en .pdf et le déposer → refusé : « Format refusé : … contenu réel vérifié » (l'extension ne fait pas foi).
3. Redéposer exactement le même PDF qu'en 1 → refusé : doublon détecté par empreinte, avec le titre du document existant.

## Régression R2 — GED : consultation tracée, lien stable, téléchargement (S1) !

Persona : Agent immobilier (agent.alpha@) puis Super Admin (superadmin@)
1. « Consulter » un document → il s'ouvre sur une URL applicative stable ; attendre plus de 60 s puis rafraîchir → le fichier se réaffiche (plus jamais le JSON « InvalidJWT » de Supabase).
2. « Télécharger » → le fichier descend **sans casser la page** (correctif recette S1).
3. superadmin@ → Journaux → journal d'accès aux pièces : chaque consultation et chaque rafraîchissement = une trace (« sans trace, pas d'accès »).

## Régression R3 — Alertes : escalade et fermeture (S1) !

> La création et l'affichage sont déjà exercés par les scénarios 1–2 du sprint ;
> on ne reteste ici que la mécanique non touchée par le S2.

Persona : Administrateur d'agence (admin.alpha@)
1. Escalader une alerte vers un autre gérant → l'alerte **se déplace** (jamais dupliquée), l'historique d'escalade est conservé ; une alerte « informative » ne propose pas d'escalade.
2. La fermer → l'« action effectuée » est obligatoire ; l'alerte passe fermée avec l'action enregistrée.

## Régression R4 — Rétention et purge (S1) !

Persona : Agent immobilier (agent.alpha@) puis Super Admin (superadmin@)
1. agent : déposer un « Document de test (purge immédiate) ».
2. superadmin@ → Journaux → lancer la purge → compte rendu : le document de test est purgé (fichier supprimé physiquement), les autres documents intacts, journaux nettoyés.
3. agent : tenter de consulter le document purgé → page française « 410 — document purgé ».

## Régression R5 — Mot de passe oublié (S1, RM-A4.3) !

Persona : compte de test avec une adresse email réelle
1. `/connexion` → « Mot de passe oublié ? » → réponse **neutre identique** que le compte existe ou non (pas d'énumération).
2. Ouvrir le lien reçu (usage unique, 1 h) → saisir un mot de passe de 8 caractères → refusé (politique : 12 caractères minimum) ; en saisir un de 12+ → accepté, les sessions actives sont invalidées, reconnexion demandée.
3. Re-cliquer le lien déjà consommé → aucune session ne doit s'ouvrir (point noté au S1 : si une session apparaît, relever l'heure exacte pour vérification en logs).
> Limite connue : service email Supabase limité à 2 emails/heure tant que Resend n'est pas branché (prérequis de mise en service).

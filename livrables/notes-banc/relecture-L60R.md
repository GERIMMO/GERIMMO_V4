# L60R — relecture adverse du commit 9c54271c (Phase 3, lot 60, espace artisan)

Lecture seule. Code extrait par `git archive` dans `L60R/src`. Aucune base créée, aucun port du banc utilisé, aucun processus laissé.

**Verdict : rien de bloquant.** Deux défauts importants (vérité des textes), sept mineurs. Aucune règle d'accès relâchée, aucune donnée d'un tiers exposée, aucune régression trouvée sur les onglets partagés.

## Défauts

### R1 — important — « Exporter toutes mes données (fichier JSON) » : l'export ne contient pas tout
- Preuve : `app/src/app/api/artisan-prive/export/route.ts` rend le registre privé plus `export_artisan_plateforme()`. Cette fonction (`app/supabase/migrations/20261024130000_fermeture_comptes.sql`) ne parcourt que les tables qui ont une clé étrangère directe vers `artisans`.
- Sont donc absents : les messages de l'artisan dans les discussions (`intervention_messages`, liée par `intervention_id` et `auteur_id`), ses créneaux proposés (`intervention_creneaux`), ses photos (`intervention_photos`), et tous les fichiers (PDF, justificatifs : le JSON ne porte que des lignes).
- Le libellé est affiché dans `clients/elements.tsx:28` et `clients/resumes.tsx:15`. L'ancien libellé sous-annonçait ; le nouveau sur-annonce, et voisine avec « Mes données personnelles » (/compte/donnees).
- Correction minimale : « Exporter mon activité (fichier JSON) », ou garder le mot « données » en précisant « sans les pièces jointes ni les discussions ». La question 4 de l'auteur au dirigeant doit mentionner cet écart.

### R2 — important — « Sur place » sans téléphone renvoie à une discussion que l'occupant ne lit pas forcément
- Texte : `missions/[interventionId]/page.tsx:485`, « pour un message, voyez la discussion de l'intervention, plus bas ».
- Preuve : l'occupant affiché est `persons` du `locataire_principal` du bail (`20261101201608_interventions_parties_communes.sql:191-192`). L'accès à la discussion (`role_echange_intervention`, `20261101190943_echanges_intervention_partages.sql`) exige que cette personne ait un compte (`p.account_id = auth.uid()`), une adhésion locataire et un bail actif ou en préavis. Un locataire sans compte Gerimmo ne lit rien : seul le gestionnaire reçoit le message.
- La phrase s'affiche aussi quand la discussion est fermée ou illisible (`echanges-intervention.tsx`).
- Correction minimale : « …écrivez dans la discussion de l'intervention, plus bas : votre client la lit, et le locataire aussi s'il a un compte Gerimmo. »

### R3 — mineur — E002 corrigé jusqu'à 420 px seulement ; le débordement subsiste de 421 à environ 470 px
- Preuve : `onglets-dossier.module.css:14`, le `min-width:min-content` est dans `@media(max-width:420px)`. Au-delà, la police repasse à 14 px avec 12 px de marge et quatre onglets égaux.
- Sonde Chromium (`L60R/sonde/sonde2.cjs`, CSS recopié, police Arial) : à 421 et 430 px, « Coordonnées » et « Disponibilités » débordent ; plus rien à 480 px. Calcul sur la capture réelle : à 430 px un onglet fait environ 94 px pour un mot d'environ 110 px.
- 390 et 1440 px, les deux largeurs exigées, sont bons (capture `apres-390-entreprise.png`).
- Correction minimale : sortir `min-width:min-content` de la requête de média (le mettre dans `.onglets button`).

### R4 — mineur — E005 n'a aucun test qui échoue avant
- Preuve : `e2e/lot60-espace-artisan.spec.ts:143-152`, le bloc est sous `if (await surPlace.count())`, et l'attribut `data-contact-occupant` n'existe qu'après correction.
- L'incident que le test insère n'a pas de `bail_id`, donc pas d'occupant, donc pas de carte « Sur place » : le bloc ne s'exécute jamais, même après correction. Aucun test unitaire ne couvre la phrase. Seule la capture `apres-390-mission.png` en témoigne.
- Correction minimale : insérer l'incident avec le `bail_id` d'un bail du jeu d'essai et affirmer sans condition.

### R5 — mineur — E002 et E119 : l'échec « avant » n'est pas démontré sur l'assertion visée
- Preuve : `L60/e2e-avant.log`. Le parcours « Ma fiche entreprise » échoue ligne 97 sur le titre renommé, avant le contrôle des onglets. Le parcours mission échoue sur la liste de l'agenda, avant le compte rendu.
- Le test unitaire échoue à l'import (`vitest-avant.log` : « no tests »), donc aucun cas n'est prouvé un par un.
- Les tests passent bien après : 48 sur 48 relancés par moi sur l'extrait pour les trois fichiers vitest. Les trois tests modifiés ne sont pas affaiblis (assertions inversées ou précisées, commentées).
- Correction minimale : un test par défaut, ou placer les assertions indépendantes en `expect.soft`.

### R6 — mineur — agenda : le nombre et la liste peuvent se contredire sur la même carte
- Preuve : `creneaux_en_attente` compte les dates de l'artisan sans filtre de date (`20261101201608…sql:175-177`). `mes_creneaux_artisan` ne rend que `debut > now()` (`20260927122000…sql`).
- Effet : une date passée sans réponse donne « 3 dates au choix du locataire » suivi de 2 dates. Si toutes sont passées, l'agenda dit « 3 dates au choix » sans liste, alors que la fiche dit « Proposez de nouvelles dates ».
- Le calcul des dates est bien le même que sur la fiche (même fonction, même filtre `propose` + `artisan`). L'écart de compteur existait déjà ; l'agenda le rend visible.
- Correction minimale : dans `agenda/page.tsx`, quand la lecture réussit, écrire le nombre d'après `datesAGarder(...).length`, et « Dates passées : proposez-en de nouvelles » s'il vaut 0.

### R7 — mineur — « Aide en cas de problème » : retour et contexte figés sur l'accueil
- Preuve : `nav-artisan.tsx:45`, adresse fixe `ecran=%2Fartisan&retour=%2Fartisan`.
- Le retour ramène bien dans l'espace artisan (« Retour à ma page » mène à /artisan, `contenu-assistance.tsx:67`), mais jamais à la page d'où l'on vient. La demande d'aide part avec l'écran « /artisan » même ouverte depuis une mission.
- Le « ? » de l'en-tête (`LienAssistance`, `bouton-assistance.tsx`) porte, lui, le chemin réel.
- Correction minimale : rendre cette entrée avec `LienAssistance`.

### R8 — mineur — compte rendu sans rendez-vous : deux mises en garde à la suite
- Preuve : `apres-390-compte-rendu.png`. « Si vous intervenez sans attendre le rendez-vous. » (`bouton-demarrer.tsx:53`) est suivi de « Aucun rendez-vous n'est fixé : démarrer sans rendez-vous n'a de sens que… » (`compte-rendu/page.tsx:89`).
- La phrase est exacte : la base accepte le démarrage depuis « acceptée ».
- Correction minimale : n'en garder qu'une.

### R9 — mineur — renvois possibles entre /artisan et /artisan/panne
- Preuve : `acces.ts:454` et `panne/page.tsx:29`. Chaque renvoi refait la lecture (`cache()` ne vaut que pour une requête). Il faut une alternance stricte échec/succès pour enchaîner.
- Aucun cas déterministe trouvé : même fonction des deux côtés, et le gabarit ne redirige pas. Le navigateur coupe à environ 20 renvois. L'auteur l'a signalé.
- Correction minimale, facultative : `/artisan/panne?essai=1` posé par la garde, la page ne renvoyant que sans ce paramètre.

## Points vérifiés sans défaut
- **Corrections** : E001/E122, E003/E008, E004, E006/E116, E007/E124, E011, E012/E123, E117, E118, E119, E120, E121/E127 sont visibles sur les captures « apres » à 390 et 1440 px et dans le code.
- **« Déjà corrigé par le lot 61 »** : vrai dans ce commit pour E009/E129, E010/E126 et E125 (`compte/donnees/page.tsx:31-73`, capture `apres-390-compte-donnees.png`).
- **CSS partagé des onglets** : aucune casse à 320, 360, 390 et 420 px sur le bail, la fiche de lot (4 onglets), la console, les documents du locataire et la facturation (sonde). La fiche de lot à 5 onglets est en grille (`fiche-lot.module.css:441-448`) et n'est pas affectée. Seul effet : à 360 px et moins, la barre de l'entreprise passe sur deux rangées.
- **Pastilles retirées** : Agenda et Facturation restent atteignables à toute largeur (barre du bas sous 1000 px, menu latéral à partir de 1000 px, même seuil que `min-[1000px]:hidden`).
- **Accessibilité** : un seul h1 par écran (mesures et captures), `aria-current` correct (menu, barre, pastilles), cibles de 44 à 48 px, pas de débordement à 390 px. Le point orange #b26d12 fait environ 4,1:1 sur blanc et 3,5:1 sur le fond actif. La légende de l'agenda est lisible au lecteur d'écran.
- **Sécurité** : aucune migration ni règle d'accès touchée. L'adresse affichée est celle de l'artisan connecté (filtre `artisan_id`). `mes_creneaux_artisan` ne rend que ses missions. La carte « Sur place » n'affiche rien de plus qu'avant.
- **Libellés** : plus aucun « Mon entreprise » pour désigner la page ; le courriel de décision est juste (le lien « Contactez Gerimmo » est bien sur cette page).

## Non vérifié
- Aucun parcours e2e relancé (banc interdit) : je m'appuie sur `banc-integ/L60-e2e.log` (76 passés) et sur les captures.
- La sonde des onglets utilise Arial, pas la police de l'application : les seuils (421 à 470 px) sont approximatifs.
- `vitest-complet.log` montre 3 fichiers en échec : deux exigent un service local, et `tests/api-isolation.test.ts` (« mot de passe du super admin… ») échoue sur une assertion. Sans rapport apparent avec ce commit, mais je n'ai pas vérifié qu'il échouait déjà sur le parent.
- Le contenu réel du JSON exporté n'a pas été téléchargé (R1 repose sur le SQL).
- La page de panne en échec réel n'a pas de capture « apres » (seul le test unitaire la rend).
- Non regardés à l'écran : rendu du courriel de décision, chevron E117 dans Safari, mode sombre, largeurs entre 391 et 1439 px hors onglets.

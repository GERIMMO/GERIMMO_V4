# Fusion des arbres palier1 (A) et palier1-t (B) — compte rendu (25/11/2026)

## 1. Résultat
- Arbre : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/fusion` (worktree git), lien
  `app/node_modules` → `…/scratchpad/integ/app/node_modules`.
- Branche locale **`claude/palier-1-fusion`**, partie de `d9380013` (tête de A). Tête : **`3aeeee947c010034eefdee4a7c1edfd6a2c36c59`**.
- **Rien poussé.** Aucune requête en production, aucun appel à Facebook, Stripe ou un service d'envoi. Arbres A et B
  intacts (vérifié : `palier1` = d9380013 sur `claude/palier-1-preproduction`, `palier1-t` = 35331720 détaché, aucun
  changement dans l'un ni l'autre).

| commit fusion | origine (`cherry-pick -x`) | contenu |
|---|---|---|
| 2996152e | 6b9d9e01 | D7 reprise + T4 (vendeur, médiateur, conditions, factures dix ans) |
| c8cf5de3 | a1093368 | D7/T4 seconde reprise (archive après client Stripe, type de vendeur) |
| 66d70f1e | 3ed997a1 | D4 (cinquième envoi, relance à la main, accord exprès) |
| 81a60518 | cb731af9 | D5 (ancien parcours de signature retiré) |
| 2563aef6 | 3788220b | D4 reprise (accord sur version archivée, chaîne des retours complétée) |
| 3fc33000 | b04d89f1 | défauts d'écran majeurs (public et console) |
| c6e83881 | 35331720 | décisions du 25/11 (IRL sans valeur, Facebook masqué à l'écran) |
| 0cb05a2a | — | fusion : trois tests de rang adaptés à l'ordre réuni |
| 6c4dd35f | — | correction (1) : le serveur refuse la diffusion Facebook sans Page « Relié » |
| 2ad62029 | — | vérification : trois assertions de `e2e/ecrans-majeurs-tour5.spec.ts` corrigées |
| 3aeeee94 | — | vérification : test T4R-10 (`factures-conservation-dix-ans-base`) corrigé |

## 2. Conflits et résolution (à la main, contrôlée)
Seuls les fichiers de listes ont été en conflit (les deux arbres n'ont modifié en commun que ces fichiers et
`src/lib/notifications.ts`, fusionné sans conflit : blocs distincts).
- Cherry-picks 1 à 5 : `app/e2e/local/ordre-migrations.txt`, `app/tests/relais-migrations-manifeste.test.ts`
  (MISSION_OCTOBRE), `app/supabase/retours-arriere/LISEZ-MOI.md` (tableau + chaîne « Ordre complet ») ; 1 et 2 aussi
  `app/vitest.config.ts` (FICHIERS_EN_SERIE). Cherry-picks 6 et 7 : aucun conflit.
- Règle appliquée : union, triée par horodatage. Manifeste et MISSION_OCTOBRE : 101500, 103000, 104000, 105000, 106000,
  110000, 111000, 140000, 150000, 151000, 152000. FICHIERS_EN_SERIE : entrées du bloc en conflit triées (les trois
  entrées que B avait placées plus haut, hors conflit, sont restées à leur place). Tableau du LISEZ-MOI : lignes du
  25/11 en ordre croissant (le tableau n'a pas d'ordre constant : croissant au 22-23/11, décroissant au 24/11).
- **Chaîne des retours** : ordre inverse exact : `20261125151000`, `20261125111000`, `20261125110000`, `…106000`,
  `…105000`, `…104000`, `…103000`, puis la suite inchangée. Vérifié par les tests qui la lisent et la REJOUENT
  (`jour-de-paris-suite-migrations-rejeu`, `relais-migrations-manifeste`, `textes-t3-reprise-base`,
  `courrier-impaye-version-conditions-base`, etc. : verts).
- Deux cas particuliers, traités par règle stricte (outil `…/scratchpad/fusion-resoudre.py`, `fusion-tableau.py`) :
  la ligne 103000 du tableau modifiée par B au commit 2 (version de B gardée car l'autre était mot pour mot celle du
  parent du commit B, donc non touchée par A) ; aux commits 3 à 5, git avait laissé des lignes B à la fois dans et sous
  le bloc : la zone entière a été réunie, doublons exigés identiques au caractère près.
- Aucun texte métier réécrit : les entrées ont seulement été réunies et rangées.

## 3. Contrôle de non-perte (après chaque cherry-pick)
Outil `…/scratchpad/fusion-controle.py` : (a) les lignes ajoutées/retirées par le commit d'origine sont exactement celles
de son équivalent ; (b) l'écart entre le commit d'origine et son équivalent est exactement l'apport de A
(e9e46692..d9380013), fichier par fichier. Résultat pour les 7 : **AUCUN ÉCART** (seules des lignes du tableau du
LISEZ-MOI « déplacées, même texte », effet du tri). Contrôle global symétrique (fusion − tête de A = apport total de B ;
fusion − tête de B = apport total de A) : **AUCUN ÉCART GLOBAL**.

## 4. Adaptations imposées par la fusion (0cb05a2a)
Trois tests figeaient ce qui suit leur migration dans un seul arbre : `relances-d4-base` (110000 « en tête » de la
chaîne → précédé exactement de 151000 puis 111000), `type-vendeur-vente-sans-mediateur-base` (liste exacte réunie + garde
ajoutée : aucune migration suivante ne touche `supervision_identite`), `textes-t2-reprises` (liste exacte réunie ; la
garde « seule 152000 touche `enregistrer_depart_colocataire` » est gardée). Vérifié avant : aucune migration intercalée
ne touche ces objets (grep).

## 5. Correction (1) — Facebook (6c4dd35f)
- Défaut confirmé : `diffuserPostsEchus` (`app/src/lib/missions-planifiees/marketing.ts`) faisait paraître puis envoyer
  tout post échu, quel que soit l'état de la Page ; `envoyerSurFacebook` ne vérifiait que la présence de l'identifiant et
  du jeton.
- Correction : même lecture que l'écran, `etatPageFacebook(await santeFacebook())`. Hors « Relié » : rien ne paraît,
  rien n'est réservé ni envoyé, le post reste programmé (« en attente »), le bilan porte `diffusion_suspendue` (texte de
  `RAISON_DIFFUSION_MASQUEE`). La Page n'est lue que s'il y a un post à diffuser. « Publier maintenant » passe par la
  mission : couvert. Même refus dans l'action « Publier sur Facebook » de l'éditeur (`app/src/app/actions/publications.ts`,
  avant réservation, journal et envoi).
- Tests : `tests/marketing-accord.test.ts`, `tests/publications-retrait-revalidation.test.ts` ; Facebook et la lecture de la
  Page simulés, `fetch` piégé. **Avant : 5 échecs** (le post paraissait et partait ; Page jamais lue) ; **après : 37/37** ;
  32 fichiers de tests liés aux modules touchés : 516 réussis, 4 sautés, 0 échec.

## 6. Correction (2) — ordre de 20261125150000
Analyse et ordre exact écrits dans `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/PLAN-PUBLICATION-NOTES.md`
(section « Ordre établi… »). En bref : la migration ne peut pas être rendue sûre en toute position sans affaiblir sa
garde (ses tests exigent le refus de toute version non archivée) ; ordre retenu : base sans 150000 (mais avec 151000 et
152000, nécessaires au code) → code → identité du vendeur → zéro abonné actif → archivage de 2026-11-24 → 150000 seule →
seulement ensuite ouverture des envois (D4R-03). Migration non modifiée.
**Constaté au banc** : avec 150000 et sans archive, l'inscription d'un propriétaire échoue au choix du mot de passe (voir 7).

## 7. Vérifications sur le commit final 3aeeee94
- `npx tsc --noEmit` : 0 (après `next typegen`, l'arbre neuf n'ayant pas de `.next`).
- eslint sur les 160 fichiers .ts/.tsx/.mjs/.js ajoutés ou modifiés depuis d9380013 : 0.
- vitest complet, banc remis à neuf (574 migrations de l'ordre réuni appliquées sans erreur), `--maxWorkers=1` :
  **16 445 réussis, 4 en échec, 37 sautés (16 486) ; fichiers : 1 085 réussis, 6 en échec, 4 sautés ; 1 erreur non gérée.**
  - Attendus et sans rapport : `lot2-auth-reel`, `lot3-notifications-base`, `lecteur-document-navigateur` (+ l'erreur non
    gérée : `public/pdfjs/…/pdf.worker.min.mjs` absent de l'arbre non construit), `ux-accueil-dirigeant-navigateur`,
    `ux-console-direction-navigateur`.
  - **`premier-mot-de-passe-session-banc` (3 tests), expliqué, non corrigé** : refus « L'acceptation des conditions n'a pas
    pu être enregistrée » ; cause prouvée : migration 20261125150000 sur un banc sans version archivée
    (`versions_conditions` vide). Avec la migration : 3 échecs ; son retour appliqué à la base de l'émulateur : 6/6 ;
    migration remise : 3 échecs. Code et migration de B, pas la fusion. La CI pose l'émulateur
    (`.github/workflows/ci.yml:186-187`) : ce test y sera rouge aussi. Non corrigé : une archive fictive dans le jeu
    d'essai changerait la garde des souscriptions (`garde-souscription-serveur.ts:62-69`) et d'autres parcours ; à trancher.
  - Premier passage (2ad62029) : `factures-conservation-dix-ans-base` T4R-10 échouait aussi — défaut du test (ligne
    identique déjà écrite par la préparation du banc, constatée dans `audit_log`) ; corrigé en 3aeeee94 (multiensemble,
    mêmes assertions) ; vert au passage final.
- precheck `FUSION-FINAL` 3aeeee94 (9 spécifications, `--retries=0 --workers=1`) : PREPARE/API/SEED/BUILD/E2E = 0,
  **39 réussis sur 39**. Premier precheck (6c4dd35f) : 36/39 ; les 3 échecs, tous dans `ecrans-majeurs-tour5.spec.ts`
  (jamais lancée par B), sans lien avec la fusion : mêmes pages qu'à 35331720 (diff vide), E173 et E089 échouent
  identiquement sur B seul (precheck `FUSION-B-SEUL`) ; corrigés en 2ad62029 (E173 : panneau visible dès 1024 px
  seulement → présent à 390, visible à 1280 ; E088/E089 : attente du rendu en flux avant lecture). Aucun « type de
  vendeur » manquant : jeu d'essai non modifié.
- Serveurs arrêtés (Next et émulateur) : 0 processus restant. Le banc partagé (`integ`) est laissé sur 3aeeee94, bases
  préparées et utilisées par le dernier precheck.

## 8. Non vérifié / supposé
- État de la production (version 2026-11-15 archivée ou non, abonnés) : non lu (règle). L'ordre du plan en dépend.
- Suite Playwright complète (seules les 9 spécifications demandées) ; d'autres parcours d'inscription de propriétaire
  pourraient échouer sur le banc pour la même cause que `premier-mot-de-passe-session-banc` (supposé, non rejoué).
- Aucun appel réel à Facebook/Meta : la lecture de la Page en production (`santeFacebook`) n'a pas été exercée.
- Textes officiels du recueil non recontrôlés sur Légifrance ; aucune référence légale ajoutée.
- Wiki non mis à jour (hors mission).

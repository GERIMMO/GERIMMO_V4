# Relecture adverse « argent et base de données » — commit 3aeeee94 (base fde4cbb4), lecture seule
**Verdict : rien de bloquant.** Un défaut important (A-01, solidarité), un mineur (A-02, ordre des retours).
Base de sonde `gerimmo_ci_sonde_argent` : 563 migrations d'avant le 25/11, instantané (fonctions, `proacl`, politiques, RLS,
colonnes, contraintes, déclencheurs, commentaires, `pg_dump -s`), puis les 11 migrations du 25/11. Base et extraction
supprimées, aucun processus laissé, arbre `fusion` intact (HEAD 3aeeee94). Sondes : `relecture-argent/scripts/`, sorties : `relecture-argent/out/`.
## Défauts
- **A-01 (important) — la case « mariés ou pacsés » vaut pour TOUT colocataire, y compris un tiers entré au bail après la
  signature.** `20261125152000:44-46` pose `v_fin := null` dès que la case du bail est cochée, quelle que soit la personne qui
  part. `ajouterBailPersonne` (`actions/baux.ts:898`, seul refus : bail `termine`, l. 916) ajoute un colocataire et son garant
  à un bail actif ; le formulaire est affiché sans condition (`formulaire-colocation.tsx:242`). Sonde (`out/sonde-epoux-remplacant.out`) :
  époux A et B ; tiers C et son garant ajoutés sous `authenticated` ; B part remplacé par C (fin vide, voulu) ; C part le
  31/03/2026 → fin de C VIDE, garant de C VIDE. C et sa caution restent destinataires des appels et relances (filtre
  `date_solidarite_fin is null`, vérifié : `out/sonde-epoux.out`) sans limite, alors que la décision vise « le départ de l'un
  d'eux ». Même effet probable pour un brouillon coché à deux, complété d'un troisième puis activé « papier » (aucune autre
  fonction ne lit la case ; non rejoué). Correction : fin vide seulement pour les deux personnes présentes à la signature,
  règle de l'article 8-1 VI pour toute personne ajoutée ensuite ; refus en base d'une case cochée avec plus de deux
  colocataires (contrôle de mise en location) ; question au juriste sur le tiers.
- **A-02 (mineur) — retours T3 dans le mauvais ordre : état faux, sans erreur.** Le retour de 111000 (`…111000…retour.sql:37`)
  saute la fonction si la ligne du lot T3 manque (« déjà revenue ») : joué AVANT celui de 151000, il ne rend pas le refus
  « prescrit », puis celui de 151000 rend la ligne T3. Sonde (`out/sonde-ordre-retours.out`) : deux retours réussis, puis appel
  direct à 6 paramètres, complément 2012 de 1 000 € sans confirmation → `-1000.00` (état T3R-1). L'ordre du LISEZ-MOI est juste ;
  seul le garde-fou manque (152000 en a un, retour l. 36). Correction : le retour de 111000 s'arrête si « reprise T3R-1 » est présent.
## Vérifié sans défaut (sondes rejouées)
- SECURITY DEFINER conservé, `search_path=""` et `anon` exclu sur les 31 fonctions touchées ; droits identiques aux versions
  remplacées (sauf 140000, retrait voulu) ; secondes signatures = droits de leur jumelle ; aucune politique ni RLS touchée ;
  diff des corps limité aux changements annoncés (aucun écrasement ; 111000 et 151000 se cumulent).
- Rejeu sans effet ; retours (ordre inverse et ordre du LISEZ-MOI) → schéma d'avant sauf l'annoncé (colonne gardée, règle
  facture à 120 mois, plancher 72) ; marche avant identique ; ordre du plan (150000 en dernier) = même schéma. Données
  écrites : 103000 (catalogue + journal) et 150000 (relances à la main en file, type créé par 110000), annoncées.
- T3R-1 sous `authenticated` : 6 paramètres, 7 à faux ou nul, appel nommé → « confirmation nécessaire » ; 7 à vrai → −400,00 ;
  trop-perçu +500,00 et 2023 sans confirmation ; 2022 refusé ; autre espace refusé ; `anon` refusé ; réglage vidé après
  l'appel ; seuils application = base. 8 fichiers de tests des auteurs : 72/72 sur ma base.
- Solidarité : époux → fin vide, appel et relance niveau 2 (garant compris) huit mois après ; colocation → 30/09/2026, exclu.
- Prorata T2 : 100 appels réels (`generer_appels_loyer_interne`) = formule du bail, 0 écart au centime.
- T4 : archive ancienne (72 mois) → échéance 31/12/2029, ni purgée ni proposée ; archive avec client Stripe gardée jusqu'à
  `client_stripe_supprime`, puis purgée ; archive sans client purgée ; `authenticated` refusé.
- 29/02/2024, nu 3 ans : terme 28/02/2027, limite 31/08/2026 ; congé reçu le 01/09 refusé, le 31/08 accepté (effet 28/02/2027).
## Non vérifié
PostgREST réel (sondes en SQL), production, activation « papier » d'un bail coché à trois, Légifrance, fond du droit (juriste).

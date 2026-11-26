# Notes — décision du dirigeant (24/11, nuit) : case « mariés ou pacsés » au bail

Commit local sur `$S/palier1`, après la reprise T3 (`7180794e`), non poussé. Migration `20261125152000_bail_locataires_epoux_pacses` (retour fourni). Demande : section « LOT À PART » de `PETITES-REPRISES.md`.

## 1. Ce que dit le texte (recueil `r2-refs10-24.txt`, lignes 1562-1621 ; non recontrôlé sur Légifrance)

- **Article 8-1, I** : la colocation est la location d'un même logement par plusieurs locataires « à l'exception de la location consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat ».
- **Article 8-1, VI** : « La solidarité d'un des colocataires et celle de la personne qui s'est portée caution pour lui prennent fin à la date d'effet du congé régulièrement délivré et lorsqu'un nouveau colocataire figure au bail. A défaut, elles s'éteignent au plus tard à l'expiration d'un délai de six mois après la date d'effet du congé. »
- **Donc, précisément** : une location consentie à deux époux ou partenaires de PACS n'est pas une colocation au sens du I ; le VI, qui vise « un des colocataires » et sa caution, ne s'applique pas — ni la fin à six mois, ni la fin au remplacement. **Le recueil ne fixe aucun autre terme** à la solidarité de ces locataires : elle reste celle que prévoit la clause du bail (« tenus solidairement et indivisiblement de l'exécution du présent contrat »). Le texte ne dit pas « jusqu'à la fin du bail » : il n'y a simplement pas d'extinction anticipée prévue par lui. Le recueil contient aussi l'article 220 du code civil (solidarité des époux pour les dettes d'entretien du ménage) et l'article 1751 (cotitularité du bail des époux, et des partenaires de PACS sur demande conjointe) : il ne dit pas si le loyer relève de l'article 220 ni ce que deviennent ces solidarités en cas de divorce ou de fin du PACS → JURISTE.

## 2. Fait

| Élément | Ce qui est fait |
|---|---|
| Donnée | `baux.locataires_epoux_pacses boolean not null default false` (migration additive ; faux pour tous les baux existants ; aucune ligne réécrite). Figée dès la signature pour un appel direct (verrou existant `verrouiller_bail_hors_fonctions`). Retour : rend la fonction, **garde la colonne** et ses valeurs. |
| Saisie | Étape « Personnes » de la préparation d'un bail commun, dès deux locataires : case « Les deux locataires sont mariés l’un à l’autre, ou liés l’un à l’autre par un PACS, à la signature du bail (location consentie à eux seuls) » + aide citant l'article 8-1. Action `enregistrerLocatairesEpouxPacs` (actions/baux.ts) : brouillon seulement, contrat commun de colocation seulement, **exactement deux locataires** pour la cocher (décocher toujours permis). |
| Contrat | Case non cochée : rendu **identique octet pour octet** (24 dossiers à 2 et 3 locataires, nu/meublé/colocation, avec/sans garant, rendu du jour et rendu archivé : empreintes relevées sur le code d'avant, inchangées). Case cochée : « Les locataires sont tenus solidairement… » puis « La location est consentie exclusivement à des époux ou à des partenaires liés par un pacte civil de solidarité au moment de la conclusion initiale du contrat : elle n’est pas une colocation au sens de l’article 8-1 de la loi du 6 juillet 1989, et la règle de cet article sur la fin de la solidarité d’un colocataire qui donne congé, et de celle de sa caution, ne s’applique pas. » (alinéa insécable). Pour ne pas se contredire, le titre, le pied et les cadres de signature disent « Contrat de location » et « Locataire 1 / 2 » au lieu de « Contrat commun de colocation » et « Colocataire 1 / 2 ». Case cochée sur un bail qui n'a pas deux locataires : contrat refusé (message qui dit quoi corriger). Rendu archivé (circuits préparés avant g8) : la case n'y change rien. |
| Base | `enregistrer_depart_colocataire` : case cochée → aucune date de fin (vide), avec ou sans remplaçant ; garant non daté. Case non cochée : six mois ou date du remplacement, comme avant. `appels_a_envoyer` et `relances_loyer_dues` NON modifiés : ils gardent déjà tout colocataire et tout garant dont la date est vide ou à venir. |
| Écrans | `formulaire-colocation.tsx` : option « Personne — aucune fin de solidarité enregistrée (époux ou pacsés) », aide du départ, pied des garants, ligne « parti le … · aucune fin de solidarité enregistrée (époux ou pacsés) », phrase d'en-tête. `actions/baux.ts` : refus de retrait d'un bail signé et message de départ propres au cas. Case non cochée : textes d'avant (règle de la colocation sous condition). |

## 3. Vérifié

- `tests/bail-epoux-pacses-base.test.ts` (10, avec base) : colonne (booléen, non nulle, faux par défaut) ; case non cochée → 30/09/2026 pour un congé du 31/03/2026, date d'effet avec remplaçant, et au 24/11/2026 ni l'appel, ni la relance, ni la caution ne visent plus le parti ; case cochée → fin vide avec ou sans remplaçant, garant vide, et sept mois après le congé l'appel, la relance (niveau 2) et l'information de la caution l'incluent encore ; isolation (autre espace : 0 ligne lue, 0 ligne modifiée ; bail signé : « Bail signé : son contenu est figé (locataires_epoux_pacses) » ; `anon` : permission refusée ; droits de la fonction inchangés) ; base d'avant reconstituée (colonne retirée) : la migration ne change ni un bail ni un départ, un départ déjà enregistré garde sa date ; rejeu sans effet, retour → empreinte d'avant (`e6150a8c…`) et, case cochée, de nouveau six mois (preuve de l'avant), marche avant ; définition inattendue et fonction réécrite → arrêt sans rien modifier.
- `tests/bail-epoux-pacses.test.ts` (53) : 24 empreintes identiques (×3 : case absente, fausse, nulle) ; clause cochée ; refus à 1 ou 3 locataires dans les trois assembleurs avant toute lecture ; action (2 locataires : enregistrée ; 1 ou 3 : refus ; bail signé, contrat individuel, bail nu : refus) ; messages ; **rendu PDF réel (Chrome)** colocation nu et meublé, case cochée et non cochée.
- `tests/personnes-bail-navigateur.test.ts` (Chrome) : case absente avec un seul locataire, présente avec deux, envoyée cochée, tient à 390 px.
- PDF regardés : `$S/lotmariage/pdf/` — clause page 3 (coché et non coché, nu en colocation et meublé), page 1 « Contrat de location », page 5 signatures « Locataire 1 / Locataire 2 » avec la caution, aucune page de signatures seule, aucun alinéa coupé.
- Empreintes des baux signés : `signature-empreinte-avant-g8`, `-avant-24-octobre`, `textes-t2-reprises`, `impayes-documents-phase3-lot53-reprise` verts sans changement.
- Tests liés des deux lots : 276 fichiers, 5 813 réussis ; seul échec l'attendu `lot3-notifications-base`. `tsc` 0, eslint 0.
- Mis à jour parce qu'ils affirmaient un état devenu faux : `textes-t2-reprises` (« aucune migration ne touche `enregistrer_depart_colocataire` » → seule celle-ci) ; banc navigateur de `personnes-bail-navigateur` (l'action de la case est isolée comme les autres).

## 4. Supposé / non vérifié

- Le rendu par `documents-org.sh` sur les dossiers fictifs n'a pas pu être fait : le banc a été remis à neuf par le dernier contrôle, les familles n'y sont plus. La preuve PDF passe par le vrai moteur de rendu (Chrome) sur des dossiers d'essai.
- PostgREST de production et définitions en production supposés identiques au banc.
- Lecture juridique ci-dessus (section 1) : celle du texte du recueil, sans recontrôle.

## 5. Questions pour le dirigeant (option prudente appliquée)

1. **Remplaçant** : case cochée, un nouveau colocataire au bail ne met pas fin à la solidarité de l'époux parti (le VI ne s'applique pas du tout). D'accord ?
2. **Exactement deux locataires** pour cocher (un couple ; « exclusivement à des époux ») ; avec trois, refus. D'accord ?
3. **Acte de cautionnement** : non modifié ; il imprime toujours la règle de la colocation avec la phrase « Cette règle ne s’applique pas si la location est consentie exclusivement à des époux… » (vraie, conditionnelle). L'adapter à la case ?
4. **Signature électronique** : le second signataire garde la qualité « Colocataire » dans le circuit (`partiesSignatureBail` non modifié, pour ne toucher aucune empreinte). À aligner sur « Locataire » ?
5. **Baux déjà signés** entre époux : la case ne se coche plus (bail figé). Faut-il un moyen de la poser (avenant, geste de gestion) ? Non fait.
6. Titre, pied et cadres de signature du contrat suivent la case (« Contrat de location ») : au-delà de la seule clause, pour que le document ne se contredise pas. D'accord ?

## 6. Points pour JURISTE.md

- À ajouter : solidarité de deux époux ou partenaires de PACS après le départ de l'un d'eux. Le recueil exclut le VI de l'article 8-1 ; la clause contractuelle de solidarité dure-t-elle alors jusqu'à la fin du bail (et ses renouvellements) ? Effet du divorce, de la séparation, de la fin du PACS (articles 220 et 1751 du code civil) ?
- À ajouter : « au moment de la conclusion initiale du contrat » — un mariage ou un PACS conclu après la signature laisse-t-il la colocation (Gerimmo : oui, la case ne se coche qu'à la préparation) ?
- À ajouter : « exclusivement à des époux ou à des partenaires » — un bail à plus de deux personnes peut-il entrer dans l'exception (Gerimmo : non) ?
- À ajouter : caution d'un des époux : sans le VI, l'engagement suit l'acte de cautionnement (durée, plafond, résiliation de l'article 22-1) ; le dire dans l'acte ?
- À alléger : le point T2R-1 (« le calcul de la base reste à six mois pour des époux ») est traité par la case.

## 7. État du banc

`precheck.sh EPX d9380013` (commit des deux lots) : préparation, émulateur, jeu d'essai et compilation réussis ; 13 parcours sur 13 réussis (`bail-epoux-pacses` nouveau, `textes-t3`, `prudences-juridiques`, `consommations-patrimoine`, `brouillon-bail-saisie`, `incident-gerant-colocation`, `relocation-bail`) — `$S/banc-integ/EPX.status`, `EPX-e2e.log`. Les bases du banc ont été remises à neuf par ce contrôle (les deux migrations y sont appliquées par le manifeste). Suite vitest complète avant commit : 15 944 réussis ; seuls échecs, les attendus (`api-isolation`, `lot2-auth-reel`, `lot3-notifications-base`, `ux-*-navigateur`). Aucun serveur laissé.

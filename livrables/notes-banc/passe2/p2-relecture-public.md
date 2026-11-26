# Passe 2 (89cb87ff) — relecture des écrans publics, défauts bloquants ou majeurs seulement

Captures regardées (Read sur les .png, découpées en tranches) : 26 à 390 px (toutes les pages publiques, plus leurs variantes « --ouvert » qui ne diffèrent que par le menu ouvert, contrôlé par comparaison d'images) et 8 à 1440 px (accueil, tarifs, outils, IRL, conditions, confidentialité, mentions légales, lien de signature). Tranches dans scratchpad/p2-relecture-public-crops/.

## Verdict : aucun défaut bloquant ni majeur dans l'espace public (vérifié)

## Défauts majeurs de la passe 1 (L62) : les 6 sont corrigés (vérifié capture + code)
- E054 / E167 (outil IRL, indices écrits en dur) : corrigés. 390/public/outils-calcul-irl.png et 1440/… : champs « Valeur de l'indice » vides, trimestres et années non cochés, pastille « À compléter », lettre en [indice] / [nouveau loyer], bouton « Imprimer la lettre » grisé avec la raison. Le seul exemple est le texte indicatif « Ex. 850 » ; « 12 rue des Lilas, Lyon » est aussi un texte indicatif (calculateur-irl.tsx:98-125, tous les useState à ""). Phrase « Aucune valeur d'indice n'est écrite » désormais vraie.
- E055 / E168 (OpenAI : annexe 1 contre Confidentialité) : corrigés. conditions.png, annexe 1, fiche OpenAI : assistant, lecture assistée (« fichier transmis en entier ») et devis ; confidentialite--ouvert.png : mêmes trois envois + supervision éditoriale. Conditions en version du 24 novembre 2026 (editeur.ts:383, 563-566). Annexe artisan : devis seuls, cohérent (ni assistant ni lecture assistée dans l'espace artisan, vérifié par recherche dans le code).
- E056 (date de la Confidentialité) : corrigé. « Dernière mise à jour : 24 novembre 2026 » via CONFIDENTIALITE_DATE (editeur.ts:576, page.tsx:75) ; aucun commit plus récent ne touche la page.
- E173 (lien non valable : « acte de cautionnement ») : corrigé. signature-caution-….png (390 et 1440) : « Un document à signer en ligne. » (signature/caution/[jeton]/page.tsx:48-51).

## Points de la consigne
- Outil IRL : aucun champ prérempli (vérifié). Mentions légales : aucune ligne « Capital » (type de vendeur non choisi sur le banc), médiateur dit « non désigné » avec renvoi à la réclamation écrite, cohérent avec l'article 17 des conditions. L'identité du vendeur est « (à venir) » sur le banc : non vérifiable ici.
- Tarifs, accueil (FAQ), article 8.1 : même grille (5,99 € ; +1,99 € du 2e au 7e ; 19,90 € de 8 à 20 ; +0,99 €). Calculs recalculés et justes : GLI 314,28 / 165,94 €, LMNP 2 265,60 € et 554,29 € reportés, rentabilité 5,29 % / 4,08 % et mensualité 927,94 €.

## IA coupée (p2-off)
Une seule capture publique diffère au cmp : 390/public/inscription--ouvert.png, avec 13 pixels différents dans un coin (bruit de rendu, contenu identique). Les écrans publics ne dépendent pas de l'IA et restent utilisables IA coupée ; la Confidentialité dit que ces aides « peuvent être désactivées ».

## À arbitrer, non classé majeur (supposé)
- Outil quittance : 850 €, 120 € et 970 € reçus, avec la date du jour, sont préremplis comme vraies valeurs (generateur-quittance.tsx:64-65), et « Imprimer la quittance » est actif. La décision du 25/11 ne vise que l'IRL. Si le dirigeant veut la même règle : useState("") aux lignes 64-65 et texte indicatif « Ex. 850 ».
- Défauts mineurs encore visibles, reportés (décision) : E057, E059, E061, E066, E067, E169, E176, E178.

## Non vérifié
Lecture réelle de l'Insee (le banc affiche « indices non chargés ») ; identité du vendeur, coordonnées des hébergeurs et versions archivées (« Aucune version n'est encore archivée » sur le banc) en production ; images de l'accueil absentes sur la capture (zone vide au-dessus de « Un incident, un suivi clair », chargement différé probable, déjà vu en passe 1).

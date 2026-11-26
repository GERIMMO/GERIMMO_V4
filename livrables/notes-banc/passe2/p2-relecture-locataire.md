# Passe 2 (89cb87ff) — espace du locataire : défauts bloquants ou majeurs seulement

Captures regardées (Read sur les .png) : les 26 de p2-on/390/locataire, 11 de p2-on/1440/locataire (accueil, paiements, reçu, attestation, documents, logement, demandes, gestionnaire, FAQ ouverte, compte, données), 4 de p2-off. Total : 41.

## Verdict : aucun défaut bloquant ; un défaut majeur, à arbitrer (texte vérifié, lecture trompeuse supposée)
- L-01 (majeur) : Mon logement, carte du dépôt de garantie : « il vous est restitué sous 1 mois […] (2 mois sinon ; toute retenue doit être justifiée, pièces à l'appui), l'usure normale déduite. » Lu simplement, cela veut dire que l'usure normale est retirée du dépôt. Le droit dit l'inverse, et la FAQ aussi : « elle ne peut pas vous être facturée ». C'est l'expression d'usage « vétusté déduite », mais placée après la parenthèse. Captures : 390/locataire/…-logement.png et 1440/…-logement.png. Code : app/src/app/locataire/[orgId]/logement/page.tsx:233-236 (déjà présent en passe 1, non relevé). Correction : remplacer « , l&apos;usure normale déduite. » par « . L&apos;usure normale du logement ne peut pas vous être retenue. ». Facultatif : faq/page.tsx:58, retirer « est déduite : ».

## Défauts majeurs de la passe 1 (L61) : les 6 sont corrigés (vérifié capture + code)
- E013 / E130 (« rien à demander ») : 390 et 1440 …-loyers.png affichent « votre quittance sera disponible ici dès que votre gestionnaire aura complété les informations obligatoires du document. Vous pouvez le lui demander : écrire à mon gestionnaire ». La FAQ (1440 faq--ouvert) dit « En principe, rien à demander. Si le document reste marqué "en préparation" […] ». Code : loyers/page.tsx:110-123 et 255-273 (trois cas).
- E014 / E131 (discussion détachée) : 390 et 1440 …-demandes.png. La discussion est placée juste sous « E2E Fuite sous l'évier » et indique « Pour votre demande : Fuite / robinetterie — E2E Fuite sous l'évier ».
- E019 / E140 (données de location) : 390 et 1440 compte-donnees.png. La carte « Les données de votre location » renvoie au lien « Mon gestionnaire ». Le formulaire est devenu « Faire une demande sur mon compte » et dit « ne lui est pas transmis ».

## Points de la consigne (vérifié)
- Signature : plus de carte « Documents à signer », ni de ligne « à signer » à l'accueil, ni de badge, ni de dépôt (documents.png, accueil). Aucun appel restant à mes_demandes_signature, DepotSignature ou retournerDocumentSigne dans app/src. La carte « Signature électronique » n'apparaît qu'avec un circuit. Elle ne propose aucun geste et dit « Rien n'est à déposer ici » (signatures-electroniques.tsx).
- Paiements et quittances : montants cohérents partout (650 + 50 = 700 ; 300 réglés ; 400 restants). Reçu partiel retenu avec le bouton « Écrire à mon gestionnaire ». Attestation : « sera disponible » (E015 corrigé).
- Congé : préavis « 1 mois si zone tendue et que votre lettre le précise et le justifie, 3 mois sinon » ; lettre recommandée, délai compté à partir de la réception effective (logement, FAQ, carte-conge.tsx).
- Fausse alerte écartée : la barre du bas qui cache du contenu au milieu des captures 390 est un artefact de la capture pleine page (position: fixed, globals.css:2249). Le corps de page réserve bien la place en bas (globals.css:1052).

## IA coupée (p2-off)
Écarts relevés par cmp : compte.png (390 et 1440 : seule l'heure de « Dernière connexion » change), contact--ouvert.png 390 (rendu identique à l'œil) et le reçu (autre identifiant, même contenu). Tout l'espace reste utilisable IA coupée. L'aide écrite « Une question sur vos démarches ? » remplace l'assistant (parcours assistant-prive vert dans les deux modes).

## Non vérifié
- IA avec un vrai fournisseur : le banc n'a pas de clé, donc IA activée affiche la même aide écrite.
- Carte de signature avec un circuit ouvert : vue seulement par le code et le parcours signature-electronique-locataire, qui est vert.
- Formulaire « Annoncer mon départ » ouvert, onglet « À transmettre », plan de paiement, quittance délivrée en PDF, relevé de compteur demandé : aucune capture.
- Mineurs encore visibles, reportés (décision du dirigeant) : E132, E135 ; nouveau mineur : quand la zone est inconnue, la liste des motifs du formulaire de congé omet la zone tendue.

# Gerimmo, palier 1 : la version préparée en une page

*Rédigé le 25/11/2026. **Rien n'est publié.** La production reste gelée jusqu'à votre message écrit « je valide la publication ».*
*Mots utiles : un **commit** est une version enregistrée du code ; une **migration** change la base de données ; le **banc** est une copie d'essai chez l'agent, avec des données fictives ; un **parcours navigateur** est un robot qui clique dans l'application comme un utilisateur.*

## 1. La version préparée
- C'est le commit `062296e2`, sur la branche `claude/palier-1-preproduction`. Il réunit le travail du 22 au 25/11, plus six commits du 25/11 au-dessus de `89cb87ff` : retours arrière corrigés (RET-01), défaut L-01 de la seconde passe, deux défauts d'écran trouvés par la vérification de GitHub (l'écran d'un bail remontait sous le doigt sur iPhone ; la fiche de mission de l'artisan se redessinait à l'ouverture quand le locataire avait annulé), et des tests rendus indépendants de la machine.
- Il contient `main` (`e1e442dc`, jamais publié) et la version en ligne (`81740dec`). **VÉRIFIÉ** avec git.
- 52 migrations à appliquer, chacune avec son retour arrière (le fichier qui la défait). **VÉRIFIÉ** avec git.
- Pas de lien d'aperçu : sans copie de la base (Q1 annulée), un aperçu se brancherait sur la production. Le premier vrai passage sera donc la production, avec un retour arrière prêt.

## 2. Ce qui change, pour qui
- **Propriétaire** : pointage des loyers avec le relevé de la banque ; agenda avec ses échéances ; rappel de révision du loyer, avec sa date limite ; case « mariés ou pacsés » au bail ; notice officielle à déposer avant une signature électronique ; une pièce exigée pour chaque retenue sur le dépôt ; congés mieux contrôlés ; plus aucune charge « récupérable » sans son accord ; 145 défauts de documents confirmés et traités (quelques-uns en partie).
- **Locataire** : il voit où en est sa signature électronique ; il donne ses disponibilités quand il signale un incident ; un nouveau message se voit tout de suite ; l'ancien écran « télécharger, signer, redéposer » est retiré ; 25 des 26 défauts d'écran relevés sont traités.
- **Artisan** : absences et semaine type ; garantie écrite sur ses devis ; lignes de devis gardées ; relance d'une facture ; facture refusée avec un motif, puis remplacée ; motifs d'un refus reçus par e-mail ; écrans repris.
- **Super admin** : interrupteur de l'IA ; cinq envois automatiques, fermés, à ouvrir un par un ; identité du vendeur (entrepreneur individuel) saisie dans la console ; réglage « vente aux particuliers sans médiateur » ; archivage des conditions du 24/11 ; repères fiscaux avec leur source ; Facebook bloqué tant que la Page n'est pas « Relié » ; six défauts majeurs de la console corrigés.
- **Visiteur** : nouvelles conditions du 24/11 ; mentions légales du vendeur ; factures gardées dix ans ; outil de calcul de l'IRL sans valeur préremplie ; mention « Rédigé avec l'aide de l'IA » sur les articles.

## 3. Ce qui est VÉRIFIÉ, et comment
- Vérification complète au banc sur `062296e2` : **16 578 tests réussis**. Seuls 2 fichiers échouent, comme attendu : ils exigent des services que seule la vérification automatique de GitHub installe.
- **355 parcours navigateur réussis au premier essai**, 3 ignorés. Types, style et construction du site : sans erreur.
- La réunion des deux branches de travail a été relue deux fois : 8 puis 4 défauts trouvés, tous corrigés. Chacun a un test qui échoue avant et passe après.
- Production lue en lecture seule le 24/11 : 10 comptes (tous de test d'après vous, 22/11 et Q64) ; aucun appel de charges ; un seul circuit de signature, terminé.
- Seconde passe complète sur `89cb87ff` (IA activée, puis coupée) : 355 puis 354 parcours réussis au premier essai ; documents sans anomalie ; aucune fuite entre espaces. Relecture des écrans : un seul défaut majeur (L-01 : la carte « Mon logement » laissait croire que l'usure normale est retenue sur le dépôt), corrigé. Défauts mineurs reportés (votre décision).

## 4. Ce qui reste SUPPOSÉ (non constaté)
- La production sert `81740dec` : dernier relevé les 21 et 22/11, non relu depuis.
- Aucun abonné payant et aucune version des conditions archivée : jamais lus pendant cette mission (dernier relevé des abonnements : audit du 19/11, aucun). Le plan les fait lire le jour J (C2, C6).
- Essayés au banc seulement, jamais en production : les 52 migrations d'un seul bloc (réussi) ; l'ancien code sur la nouvelle base (282 parcours réussis, un risque sur la lettre de révision de loyer, tenu par une consigne du plan) ; la chaîne des 52 retours arrière (réussie après correction).
- Aucun service réel essayé : paiement Stripe, vrais e-mails, signature Zoho, Facebook, Insee, appel réel à l'IA.
- **Aucun point de droit n'est présenté comme conforme.** Les textes suivent le recueil que vous avez fourni, non recontrôlé sur Légifrance.

## 5. Ce que vous devez décider ou faire avant la publication
1. **Clé des sauvegardes (Q9)** : créer une nouvelle clé, en garder une copie hors de GitHub, lancer une sauvegarde puis son contrôle de restauration. L'agent vous guide ; il ne voit jamais la clé.
2. **Médiateur (Q65, Q75)** : sans lui, la vente aux particuliers reste fermée. Vous seul pouvez l'ouvrir, par une décision datée. Le risque de droit n'est pas tranché.
3. **Stripe (Q80)** : régler l'en-tête des factures dans votre compte Stripe. Le paiement réel n'a jamais été essayé. Conseil (audit du 19/11) : n'ouvrir les souscriptions qu'après un premier paiement réel, remboursé.
4. **Retour arrière** : dire qui pourrait jouer les retours de la base, et comment l'accès serait donné (jamais par écrit). C'est bloquant (plan, P3). Relire vous-même les réglages chez Vercel et GitHub (liste au plan, P4).
5. **Ancien code sur la nouvelle base** : essayé au banc ; des points restent supposés (plan, P6 b). Votre accord écrit est demandé pour cocher « base compatible », avec la consigne sur les révisions de loyer.
6. **CI GitHub** : verte sur `062296e2` sans aucune reprise (exécution n° 45591695035 : 16 620 tests, 355 parcours au premier essai, 75 parcours WebKit mobile, envois, vrai PostgREST et invitation artisan). Elle sera refaite sur la PR et sur `main` le jour J ; rien ne se publie si elle n'est pas verte (plan, É2, É4).
7. **Questions prioritaires** : Q62 (lire Légifrance : compte PISTE) ; Q66 (activité déclarée et TVA, avec l'expert-comptable) ; Q117 et Q118 (relance à la main partie à une partie des locataires, ou non confirmée) ; Q116, Q121 et Q122 (bail de deux époux ou partenaires) ; Q93 (annonce des nouvelles conditions par e-mail, à écrire avant le premier abonné).
8. **Réserver une demi-journée**, puis écrire « je valide la publication ». Rien ne commence sans ce message.

## 6. Les autres livrables
- [Plan de publication](PLAN-DE-PUBLICATION.md) : l'ordre exact du jour J, les contrôles, le retour arrière.
- [Parcours de vérification](PARCOURS-15-MINUTES.md) : ce que vous contrôlez vous-même juste après la publication.
- [Ce qui n'a pas été fait](NON-FAIT.md) : quoi, pourquoi, quel risque, ce qu'il faudrait.
- [Guide de reprise](../GUIDE-DE-REPRISE.md) · [Questions](../QUESTIONS.md) · [Points de droit](../JURISTE.md) · [Journal](../JOURNAL.md) · [Vos décisions](../DECISIONS-2026-11-24.md)

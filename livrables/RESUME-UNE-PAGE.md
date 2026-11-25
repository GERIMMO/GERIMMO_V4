# Gerimmo, palier 1 : la version préparée en une page

*Rédigé le 25/11/2026. **Rien n'est publié.** La production reste gelée jusqu'à votre message écrit « je valide la publication ».*
*Mots utiles : un **commit** est une version enregistrée du code ; une **migration** change la base de données ; le **banc** est une copie d'essai chez l'agent, avec des données fictives ; un **parcours navigateur** est un robot qui clique dans l'application comme un utilisateur.*

## 1. La version préparée
- C'est le commit `89cb87ff`, sur la branche `claude/palier-1-preproduction`. Il réunit le travail du 22 au 25/11.
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
- Banc remis à neuf, 576 migrations jouées : **16 506 tests réussis**. Seuls 2 fichiers échouent, comme attendu : ils exigent des services que seule la vérification automatique de GitHub installe.
- **355 parcours navigateur réussis au premier essai**, 3 ignorés. Types, style et construction du site : sans erreur.
- La réunion des deux branches de travail a été relue deux fois : 8 puis 4 défauts trouvés, tous corrigés. Chacun a un test qui échoue avant et passe après.
- Production lue en lecture seule le 24/11 : 10 comptes (tous de test d'après vous, 22/11 et Q64) ; aucun appel de charges ; un seul circuit de signature, terminé.
- Seconde passe complète (IA activée, puis coupée) : [résultat de la seconde passe : à compléter]

## 4. Ce qui reste SUPPOSÉ (non constaté)
- La production sert `81740dec` : dernier relevé les 21 et 22/11, non relu depuis.
- Aucun abonné payant et aucune version des conditions archivée : jamais lus pendant cette mission (dernier relevé des abonnements : audit du 19/11, aucun). Le plan les fait lire le jour J (C2, C6).
- La vérification automatique de GitHub (la « CI ») n'a jamais tourné sur `89cb87ff` : le banc l'imite seulement.
- Jamais essayés : les 52 migrations d'un seul bloc, l'ancien code sur la nouvelle base, la chaîne complète des retours arrière.
- Aucun service réel essayé : paiement Stripe, vrais e-mails, signature Zoho, Facebook, Insee, appel réel à l'IA.
- **Aucun point de droit n'est présenté comme conforme.** Les textes suivent le recueil que vous avez fourni, non recontrôlé sur Légifrance.

## 5. Ce que vous devez décider ou faire avant la publication
1. **Clé des sauvegardes (Q9)** : créer une nouvelle clé, en garder une copie hors de GitHub, lancer une sauvegarde puis son contrôle de restauration. L'agent vous guide ; il ne voit jamais la clé.
2. **Médiateur (Q65, Q75)** : sans lui, la vente aux particuliers reste fermée. Vous seul pouvez l'ouvrir, par une décision datée. Le risque de droit n'est pas tranché.
3. **Stripe (Q80)** : régler l'en-tête des factures dans votre compte Stripe. Le paiement réel n'a jamais été essayé. Conseil (audit du 19/11) : n'ouvrir les souscriptions qu'après un premier paiement réel, remboursé.
4. **Retour arrière** : dire qui pourrait jouer les retours de la base, et comment l'accès serait donné (jamais par écrit). C'est bloquant (plan, P3). Relire vous-même les réglages chez Vercel et GitHub (liste au plan, P4).
5. **Ancien code sur la nouvelle base** : jamais essayé. Soit un essai au banc avant le jour J, soit votre accord écrit pour cocher « base compatible » sans preuve (plan, P6 b).
6. **Seconde passe complète** : attendre son résultat (plan, P5). Si elle corrige quelque chose, le commit change et tout se revérifie.
7. **Questions prioritaires** : Q62 (lire Légifrance : compte PISTE) ; Q66 (activité déclarée et TVA, avec l'expert-comptable) ; Q117 et Q118 (relance à la main partie à une partie des locataires, ou non confirmée) ; Q116, Q121 et Q122 (bail de deux époux ou partenaires) ; Q93 (annonce des nouvelles conditions par e-mail, à écrire avant le premier abonné).
8. **Réserver une demi-journée**, puis écrire « je valide la publication ». Rien ne commence sans ce message.

## 6. Les autres livrables
- [Plan de publication](PLAN-DE-PUBLICATION.md) : l'ordre exact du jour J, les contrôles, le retour arrière.
- [Parcours de vérification](PARCOURS-15-MINUTES.md) : ce que vous contrôlez vous-même juste après la publication.
- [Ce qui n'a pas été fait](NON-FAIT.md) : quoi, pourquoi, quel risque, ce qu'il faudrait.
- [Guide de reprise](../GUIDE-DE-REPRISE.md) · [Questions](../QUESTIONS.md) · [Points de droit](../JURISTE.md) · [Journal](../JOURNAL.md) · [Vos décisions](../DECISIONS-2026-11-24.md)

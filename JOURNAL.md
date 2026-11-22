# JOURNAL — mission palier 1

Cinq lignes par lot, en français simple : ce qui a été fait, ce qui a été vérifié, ce qui reste.

## 22/11/2026 — Mise en place et phase 1 (audit), première version

- **Fait** : production gelée (la publication du lot #357 est arrêtée, rien n'a changé en ligne) ; point de départ marqué par deux branches repères ; branche de travail créée ; audit en huit volets, sans rien modifier.
- **Vérifié** : contrôle automatique complet vert sur la version de départ ; cloisonnement des 227 tables prouvé par requête ; avis de sécurité de la base de production lus ; chaque constat de l'audit porte son niveau de preuve.
- **Résultat** : `AUDIT.md` (état des modules, écarts juridiques, écart avec les références, dépendance à l'IA, plan fermé P0/P1/P2), `QUESTIONS.md` (14 points), `JURISTE.md`, huit relevés détaillés dans `audit-palier-1/`.
- **Limite** : les sites officiels sont refusés par mon réseau ; aucun point juridique n'est noté « conforme » ; une seconde lecture, textes ouverts, est nécessaire.
- **Reste** : votre accord pour ouvrir les sites officiels (Q5) et pour la copie de base de la préproduction (Q1) ; puis la phase 2, dans l'ordre P0, interrupteur IA, P1, P2.

## 22/11/2026 — Lot 1 : décompte de sortie et échéancier de charges (P0-02)

- **Fait** : quand un complément de charges est réglé en plusieurs fois (échéancier), les versements confirmés sont maintenant déduits du solde du bail ; avant, ils restaient comptés « impayés » et pouvaient être retenus une seconde fois sur le dépôt de garantie.
- **Vérifié** : le défaut a d'abord été reproduit, puis 8 tests nouveaux rejouent la vraie chaîne (régularisation, échéancier publié, accepté par le locataire, versement confirmé, décompte de sortie) ; tests complets (seuls 4 échecs connus, propres à mon banc d'essai et sans rapport), compilation, puis les 285 parcours navigateur : 282 réussis, 3 ignorés comme d'habitude, 0 échec.
- **Où** : sur mon banc d'essai local (copie du schéma, données fictives). La préproduction n'a pas encore sa copie de base (Q1) : rien n'a été vérifié sur un aperçu en ligne.
- **Retour en arrière** : script d'annulation écrit et testé (la fonction retrouve exactement son état d'avant).
- **Reste** : rien sur ce point. Branche `claude/palier-1-preproduction` poussée (aucune publication).

## 22/11/2026 — Lot 2 : interrupteur « IA activée / désactivée »

- **Fait** : un réglage dans la console (Paramètres généraux, « Fonctions assistées par l'IA ») coupe toute l'IA d'un clic. La base refuse alors chaque appel, sans rien compter. Chaque fonction a son équivalent manuel : liens d'aide à la place de l'assistant, saisie directe à la place de la lecture d'une facture ou d'un compteur, devis vierge pour l'artisan, brouillon d'article vierge, veille rédigée à la main. Les tâches de fond se suspendent sans se signaler en panne ; la page Santé et l'e-mail du matin ne comptent plus l'IA coupée comme un défaut. Les boutons qui envoient un message ou un fichier nomment désormais OpenAI et les États-Unis.
- **Vérifié** : 39 tests nouveaux (base sous les vrais rôles, écrans dans les deux modes, tâches de fond) et un parcours navigateur de bout en bout : le super admin coupe l'IA, puis propriétaire, locataire et artisan gardent chacun leur équivalent manuel, puis l'IA est réactivée. Base du banc remise à neuf, toutes les migrations rejouées depuis zéro, compilation, 13 306 tests réussis sans échec, 283 parcours navigateur réussis sur 286 (3 ignorés comme d'habitude).
- **Limites, dites franchement** : (1) sur mon banc et en préproduction, aucun appel à l'IA ne peut partir (verrou « mode pilote » déjà présent) : le mode « IA activée » y est vérifié par des tests où le fournisseur est simulé, pas par un vrai appel. (2) Deux fichiers de tests exigent des services que seul le contrôle automatique de GitHub installe : ils n'ont pas tourné sur mon banc. (3) Un premier passage navigateur avait deux échecs : ils venaient de données laissées par le passage précédent, ce que le passage sur base neuve a confirmé.
- **Retour en arrière** : script écrit et testé (les deux gardes retrouvent exactement leur forme d'avant).
- **Reste** : vos réponses aux questions Q12, Q16 et Q17 de QUESTIONS.md (position par défaut, mode pilote, posts sans IA).

## 22/11/2026 — Lot 3 : ce qui part chez OpenAI est déclaré (P0-10)

- **Fait** : la page de confidentialité et la liste publique des prestataires disent maintenant que l'assistant transmet vos messages, et que la lecture assistée transmet le fichier choisi. Rien n'est promis au-delà de ce que le code fait.
- **Vérifié** : un test relit le code et les pages et échoue si l'un des deux envois n'est plus déclaré ou si un bouton ne prévient plus ; mêmes passages complets que le lot 2.
- **Non fait, volontairement** : l'annexe « prestataires » des conditions générales. La corriger crée une nouvelle version des conditions, que chaque client voit à sa connexion : c'est votre décision (Q15).
- **Juriste** : deux questions ajoutées (JURISTE.md, A19bis et A19ter). Ce point n'est pas présenté comme conforme.
- **Reste** : préparer la nouvelle version des conditions pour le jour de la publication, selon votre réponse à Q15.

## 22/11/2026 — Lot 4 : route planifiée et page des règles (P1-17, P1-19)

- **Fait** : un appel sans jeton à la route des tâches planifiées est refusé avant toute lecture en base ; « Les règles à connaître » est liée depuis la page d'aide du propriétaire.
- **Vérifié** : tests nouveaux (la base ne reçoit aucun appel sans jeton ; le déclencheur légitime passe toujours) ; mêmes passages complets que le lot 2.
- **Décision respectée** : le menu du propriétaire n'a pas été modifié (vos décisions du 24/09 et du 20/11 le tiennent court). Statistiques et Journal restent hors menu (Q18).
- **Non fait** : vérifier l'absence des comptes de démonstration en production (il faut une lecture de la base de production, que l'outil me fait approuver par vous) ; planifier l'exercice de restauration (à décider avec vous).
- **Reste** : ces deux points de P1-17.

## 22/11/2026 — Lot 5 : le lien de confirmation part au garant (P1-01)

- **Fait** : pour signer électroniquement un bail qui a un garant (ou un acte de cautionnement), Gerimmo envoie au garant un lien où il confirme lui-même son numéro de mobile. Cet e-mail était bloqué par la « liste fermée » des e-mails : la signature ne pouvait pas avancer. Il part maintenant, sous conditions strictes revérifiées en base juste avant l'envoi (lien encore valable, même garant, même adresse, aucun arrêt d'urgence). Rien d'autre n'est rouvert.
- **Vérifié** : 32 tests nouveaux, dont la vraie chaîne d'envoi avec un fournisseur d'e-mail simulé (l'e-mail part une seule fois, au garant ; un lien remplacé, utilisé ou annulé ne repart jamais) ; base du banc remise à neuf, migrations rejouées depuis zéro, compilation, 13 338 tests réussis sans échec, 283 parcours navigateur réussis sur 286 (3 ignorés comme d'habitude).
- **Non vérifié** : aucun e-mail réel n'a été envoyé, et la signature de bout en bout chez le prestataire (Zoho Sign) n'a pas été jouée : c'est un service payant, hors de mon banc. Mêmes deux fichiers de tests non exécutés sur mon banc qu'au lot 2.
- **Retour en arrière** : script écrit et testé (les e-mails de ce type encore en attente sont mis de côté, rien n'est perdu).
- **Reste** : votre avis sur Q19 (garder ou non ce lien admis). À la recette finale : un essai réel de signature avec garant, si vous le souhaitez.

## 22/11/2026 — Lot 6 : le bailleur corrige l'urgence d'un incident (P1-04)

- **Fait** : sur la fiche d'un incident ouvert, le gestionnaire peut repasser un dossier « urgent » en « normal », ou l'inverse, en écrivant pourquoi (5 à 500 caractères). Avant, l'urgence choisie à la déclaration ne se corrigeait plus. La correction s'écrit au fil du dossier : « ancien niveau → nouveau niveau — motif ». Un dossier clos ne se corrige pas.
- **Vérifié** : 20 tests nouveaux (base sous les vrais rôles : locataire, artisan, autre espace et visiteur sont refusés ; action et formulaire) et un parcours navigateur. Passage complet commun aux lots 6 à 10 : base du banc remise à neuf, migrations rejouées depuis zéro, compilation, 13 443 tests réussis, 287 parcours navigateur réussis sur 290 (3 ignorés comme d'habitude), aucun échec ni parcours instable.
- **Ce que l'écran dit franchement** : le locataire n'est pas prévenu de cette correction (aucun e-mail n'est ajouté).
- **Retour en arrière** : script écrit et testé. Le passage complet a relevé un défaut de ce script (il ne retirait le nouveau type d'événement que s'il était le dernier de la liste) : corrigé et retesté.
- **Reste** : rien sur ce point.

## 22/11/2026 — Lot 7 : le super admin examine et retire une évaluation d'artisan contestée (P1-07)

- **Fait** : quand un artisan conteste sa note, le super admin ouvre depuis la demande les évaluations de cet artisan (consultation enregistrée au journal), et peut en retirer une avec un motif et une case de confirmation. L'ancien bouton ne pouvait pas fonctionner : la console n'a qu'un droit de lecture dans les espaces des clients. Le retrait passe maintenant par le mécanisme de maintenance prévu pour cela, ligne par ligne. L'espace qui avait noté reçoit une information dans ses alertes, sans le motif ; l'artisan ne voit pas le motif non plus.
- **Vérifié** : 24 tests nouveaux (seul le super admin lit et retire ; une évaluation d'un autre artisan, déjà retirée ou sans contestation est refusée ; rien d'autre n'est modifié dans l'espace du client) et un parcours navigateur dans un espace fictif, supprimé à la fin. Même passage complet que le lot 6.
- **Limites, dites franchement** : la photo du travail jointe à une évaluation n'est pas montrée au super admin ; le motif du retrait est enregistré avec l'évaluation et n'est affiché nulle part à l'espace du client (question Q20).
- **Retour en arrière** : script écrit et testé.
- **Reste** : votre avis sur Q20.

## 22/11/2026 — Lot 8 : le recommandé électronique est masqué tant qu'aucun service n'est relié (P1-18)

- **Fait** : l'envoi d'une mise en demeure par recommandé électronique (AR24) n'est plus proposé au bailleur tant qu'aucun compte AR24 n'est relié à son espace ; le courrier en PDF reste disponible. Côté locataire, l'accord « recevoir des recommandés électroniques » n'est plus demandé dans ce cas ; un accord déjà donné reste visible et peut toujours être retiré. Le serveur refuse lui aussi un nouvel accord.
- **Vérifié** : 20 tests nouveaux et le parcours navigateur des accords du locataire adapté. Même passage complet que le lot 6.
- **Non vérifié** : aucun envoi réel par AR24 (service payant, aucun compte relié).
- **Retour en arrière** : aucun changement en base ; revenir à la version précédente du code suffit.
- **Reste** : votre décision Q10 (ouvrir ou non un compte AR24).

## 22/11/2026 — Lot 9 : la reprise des comptes ne se bloque plus après un rechargement (P1-02)

- **Fait** : en reprenant ses comptes depuis un autre logiciel, recharger la page après un premier contrôle bloquait l'écran (« une reprise est déjà en cours »), sans issue. L'écran retrouve maintenant la reprise ouverte, l'annonce avec sa date et sa trésorerie, la poursuit si les valeurs sont les mêmes, en ouvre une neuve si elles ont changé, et offre un bouton « Abandonner cette reprise ». La bascule est refusée si les valeurs ont changé depuis le dernier contrôle.
- **Vérifié** : 19 tests nouveaux et un parcours navigateur (contrôle, rechargement, poursuite, changement de trésorerie, abandon). Ce parcours a d'abord été instable une fois : il attendait un texte déjà affiché ; il attend maintenant le fait lui-même en base, et il est passé trois fois de suite puis dans le passage complet. Même passage complet que le lot 6.
- **Non vérifié** : aucune bascule réelle n'est jouée dans ce parcours (un contrôle n'écrit rien dans les comptes) ; la bascule garde ses propres tests, inchangés.
- **Retour en arrière** : aucun changement en base ; revenir à la version précédente du code suffit.
- **Reste** : rien sur ce point.

## 22/11/2026 — Lot 10 : le locataire voit où en est la signature électronique (P1-06)

- **Fait** : dans « Mes documents », le locataire lit l'état d'une signature électronique qui le concerne : « à signer », « vous avez signé », « signé par tous », « refusé » ou « expiré », avec le nombre de signatures reçues. Il ne voit ni le nom, ni l'adresse, ni le téléphone des autres signataires. Rien n'est à déposer : la signature se fait par le lien reçu par e-mail.
- **Vérifié** : 22 tests nouveaux (la lecture ne rend que les signatures où ce locataire est signataire ; un autre locataire, un autre espace, un visiteur ne lisent rien) et un parcours navigateur avec un locataire fictif. Même passage complet que le lot 6 ; il a relevé un compteur de titres à mettre à jour (43 au lieu de 42), corrigé et retesté.
- **Non vérifié** : la signature de bout en bout chez le prestataire (Zoho Sign, service payant) ; les états sont posés à la main dans le test.
- **Décision respectée** : l'ancien parcours « télécharger, signer, redéposer » est conservé pour les demandes déjà en cours (une décision antérieure, tenue par un test, a seulement fermé les nouveaux envois) : question Q21.
- **Retour en arrière** : script écrit et testé (une fonction de lecture seule à retirer).

## 22/11/2026 — Lot 11 : une facture d'artisan fausse se refuse, l'artisan en dépose une autre (P1-03)

- **Fait** : devant une facture d'artisan erronée, le gestionnaire n'avait qu'un bouton : « valider ». Il peut maintenant la refuser en écrivant ce qui est à corriger. La facture refusée n'est ni effacée ni modifiée : elle reste au dossier avec sa pièce, son numéro et le motif. L'artisan lit ce motif sur sa mission, dans sa facturation et au moment de corriger, puis dépose une facture corrigée. Il n'y a jamais qu'une seule facture « en vigueur » par intervention. Dans les documents du propriétaire, la facture refusée est dite « Refusée », plus « À valider ». Aucun e-mail n'est ajouté : tout se lit dans les espaces.
- **Vérifié** : 37 tests nouveaux (base sous les vrais rôles : locataire, artisan, autre espace et visiteur ne peuvent pas refuser ; refus et validation s'excluent ; une facture refusée ne se règle pas) et un parcours navigateur complet à trois temps (dépôt, refus, facture corrigée puis validée), captures relues. Passage complet : base du banc remise à neuf, migrations rejouées depuis zéro, compilation, 13 483 tests réussis sans échec, 287 parcours navigateur réussis sur 291 (3 ignorés comme d'habitude).
- **Un parcours en échec, expliqué** : celui de l'outil public de quittance, sans rapport avec ce lot. Je ne l'ai pas écarté sans preuve : rejoué seul, il échouait 2 fois sur 5 ; rejoué sur la version d'avant ce lot, 2 fois sur 10. Sa saisie arrivait avant que la page ait fini de se charger. Il attend maintenant que la page soit prête (rien n'est retiré de ce qu'il vérifie) : 30 passages sur 30. À savoir : un visiteur qui tape dans la toute première demi-seconde peut voir son champ revenir à la valeur de départ ; ce défaut mineur existait déjà, il n'est pas dans le plan.
- **Juriste / expert-comptable** : une question ajoutée (JURISTE.md, partie 4, point 6) : faut-il un avoir avant d'émettre la facture corrigée, et peut-on accepter le même numéro sur une pièce redéposée ? Ce parcours n'est pas présenté comme conforme.
- **Retour en arrière** : script écrit et testé (rien n'est effacé ; les factures refusées restent refusées). **Reste** : l'export du registre privé de l'artisan ne mentionne pas le refus (l'écran, lui, le dit).

## 22/11/2026 — Lot 12 : un nouveau message sur une intervention se voit sans ouvrir la fiche (P1-05)

- **Fait** : la discussion partagée entre le gestionnaire, le locataire et l'artisan n'avertissait personne : un message n'était lu que si quelqu'un rouvrait la fiche par hasard. Désormais chacun voit qu'un message l'attend : le gestionnaire dans ses alertes et sur la ligne de l'incident, le locataire en tête de « Mes demandes », l'artisan en tête de son écran d'arrivée (« Messages à lire »). Le signal s'éteint tout seul quand la personne a la discussion sous les yeux, et pour elle seule. Aucun e-mail n'est ajouté : tout se lit dans les espaces.
- **Vérifié** : 28 tests nouveaux (base sous les vrais rôles : on ne compte jamais ses propres messages ni ceux d'une discussion qu'on n'a pas le droit de lire ; l'alerte du gestionnaire ne contient jamais le texte du message et ne peut pas empêcher un message de partir) et un parcours navigateur à trois personnes, captures relues. Passage complet : base du banc remise à neuf, migrations rejouées depuis zéro, compilation, 13 511 tests réussis sans échec, 289 parcours navigateur réussis sur 292 (3 ignorés comme d'habitude), aucun échec.
- **Deux défauts trouvés en relisant mon propre travail, corrigés avant de pousser** : (1) « marquer lu » passait une heure, que le banc arrondit au millième de seconde : le message restait « non lu » pour toujours ; il désigne maintenant le dernier message affiché par son identifiant. (2) Un message resté non lu sur une mission remplacée n'aurait jamais pu s'éteindre : seule la mission en cours compte.
- **Non vérifié ici** : deux fichiers de tests ne se chargent que sur l'intégration continue (comme aux lots précédents) ; ils ne sont pas comptés comme réussis.
- **Retour en arrière** : script écrit et testé (les messages ne sont pas touchés ; les alertes ouvertes sont fermées avec leur raison). **Limite connue** : pas de notification hors de Gerimmo (e-mail, téléphone) ; cela relève des envois suspendus (P1-08), qui attendent votre décision (Q6).

## 22/11/2026 — Lot 13 : l'avenant signé s'enregistre et modifie le loyer (P1-14)

- **Fait** : Gerimmo savait préparer un avenant au bail, mais rien ne permettait d'enregistrer l'avenant signé : le loyer et la provision restaient ceux d'avant. Depuis la fiche du bail, on dépose maintenant l'avenant signé avec sa date de signature et sa date d'effet (toujours un 1er du mois), le nouveau loyer et la nouvelle provision. La pièce est classée dans les documents du bail. Les montants ne changent qu'à la date d'effet ; un avenant pas encore appliqué s'annule, avec un motif. Un loyer déjà appelé n'est jamais modifié.
- **Vérifié** : 63 tests nouveaux (base sous les vrais rôles : locataire, autre espace et visiteur ne peuvent ni enregistrer ni annuler ; dates refusées avec la première date possible écrite en clair) et un parcours navigateur complet (préparer, déposer, voir « en attente », annuler, puis effet immédiat et nouveau loyer affiché). Passage complet commun aux lots 13 et 14 : base du banc remise à neuf, compilation, types, 13 618 tests, 294 parcours navigateur.
- **Trois défauts trouvés par la vérification, corrigés avant de pousser** : (1) la migration reposait par mégarde une protection sur cinq tables qui n'en ont volontairement pas, ce qui cassait deux parcours d'abonnement : elle ne touche plus que sa propre table, et un test compare désormais toutes les autres avant et après ; (2) l'écran du bail ne s'affichait plus dans une famille de tests (chargement mal placé) ; (3) le retour arrière n'était pas inscrit dans l'ordre complet des retours.
- **Non vérifié / à trancher** : la règle « date d'effet au 1er du mois, jamais sur un loyer déjà appelé » est une prudence de ma part, pas une règle lue dans un texte : questions Q22 et JURISTE.md (points 26 à 34). Le locataire ne voit pas encore la pièce dans son espace (Q22).
- **Retour en arrière** : script écrit et testé (les avenants enregistrés et leurs pièces restent ; un avenant déjà appliqué reste appliqué).

## 22/11/2026 — Lot 14 : la révision annuelle est rappelée, l'indice se cherche chez l'Insee (P1-13)

- **Fait** : rien ne rappelait la révision annuelle du loyer, et l'indice se recopiait à la main. Un rappel « Révision annuelle du loyer possible » apparaît maintenant dans la liste « à faire » dès la date anniversaire du bail (et pendant 60 jours), et mène droit au formulaire. Un bouton « Chercher l'indice publié par l'Insee » remplit le formulaire avec l'indice de la série officielle, en affichant la source et le jour de la lecture. Si l'Insee ne répond pas, une phrase le dit et la saisie à la main reste possible. Aucun indice n'est écrit dans le code.
- **Vérifié** : 25 tests nouveaux (choix de l'indice sur des séries fictives, bail sans référence, indice pas encore publié, série illisible ; rappel absent si le loyer est déjà révisé ou si le dernier DPE classe le logement F ou G) et un parcours navigateur (rappel, formulaire, recherche, saisie, révision enregistrée, rappel effacé). Même passage complet que le lot 13.
- **Un parcours en échec dans le passage complet, expliqué** : celui de ce lot, sur téléphone. La liste « à faire » arrive en deux temps et le parcours ne regardait le rappel qu'une fois, trop tôt. Je n'ai rien retiré de ce qu'il vérifie : il attend maintenant que le rappel soit affiché. Rejoué trois fois de suite sur un banc remis à neuf : trois réussites. Aucun écran n'a été modifié pour cela.
- **Non vérifié** : la lecture réelle chez l'Insee. Depuis mon environnement, le site de l'Insee n'est pas joignable : le parcours accepte donc les deux réponses (« indice proposé » ou « l'Insee ne répond pas ») et seule la seconde a été vue ici. À contrôler en préproduction avec un vrai bail d'essai. Question au juriste : JURISTE.md, point 35 ; durée du rappel (60 jours) : Q23.
- **Retour en arrière** : aucun changement en base ; revenir à la version précédente du code suffit. **Non vérifié ici** : deux fichiers de tests ne se chargent que sur l'intégration continue, comme aux lots précédents.

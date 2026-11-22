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

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

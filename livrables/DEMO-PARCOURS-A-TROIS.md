# Une fuite sous l’évier, trois personnes, un dossier

**Démonstration Gerimmo · 5 minutes**

Une fuite apparaît dans la cuisine d’un logement loué. Suivez le même dossier depuis le signalement jusqu’à l’aide à la déclaration 2044 du propriétaire. Tous les comptes, pièces et montants sont fictifs.

| Temps | À montrer | Ce que chacun y gagne |
| --- | --- | --- |
| 0:00–0:40 | **Le locataire signale la fuite.** Il décrit le problème, joint une image et envoie son signalement depuis son espace. | Il peut expliquer le problème et retrouver sa demande au même endroit. |
| 0:40–1:30 | **Le propriétaire ouvre l’alerte.** Il lit le signalement, confirme la prise en charge et demande un devis à un plombier de son carnet. | Il retrouve la demande et le logement concernés. L’artisan reçoit les informations utiles pour établir son devis. |
| 1:30–2:20 | **L’artisan transmet un devis de 100 €.** Le propriétaire le consulte et le retient. L’artisan accepte la mission et propose trois créneaux. | Le propriétaire garde la décision sur le devis. L’artisan choisit ses disponibilités. |
| 2:20–3:00 | **Le locataire choisit son rendez-vous.** Il sélectionne un créneau et voit la confirmation dans son espace. | Le locataire choisit l’horaire qui lui convient. L’artisan sait quand se présenter. |
| 3:00–4:10 | **L’artisan rend compte des travaux et dépose sa facture.** Il indique que le joint a été remplacé. Le propriétaire retrouve le bilan et valide la facture de 100 €. | L’artisan transmet ses pièces dans le dossier. Le propriétaire vérifie les travaux et le justificatif avant de valider. |
| 4:10–5:00 | **Le propriétaire prépare son récapitulatif fiscal.** Il enregistre un règlement fictif censé avoir eu lieu hors de Gerimmo, puis confirme le classement à la ligne 224 pour cet exemple. | Il retrouve la dépense dans le récapitulatif du bien et conserve la référence de la facture. |

Pour tenir en cinq minutes, l’artisan saisit le compte rendu avant la date fictive du rendez-vous. Gerimmo le signale au propriétaire, qui peut contrôler le travail avant de valider. Pour un dossier réel, la qualification fiscale est à vérifier selon votre situation.

## Captures

Les captures ont été prises le 28 novembre 2026 dans Chromium. Le format 390 × 844 simule un écran de téléphone. Le format ordinateur est de 1440 × 1000.

[Voir le résumé vidéo de 27 secondes](demo-parcours-a-trois/parcours-a-trois.webm)

| Dans la démonstration | Téléphone | Ordinateur |
| --- | --- | --- |
| Le locataire joint son image | [390 px](demo-parcours-a-trois/390/01-signalement.png) | [1440 px](demo-parcours-a-trois/1440/01-signalement.png) |
| Le propriétaire reçoit l’alerte | [390 px](demo-parcours-a-trois/390/02-alerte.png) | [1440 px](demo-parcours-a-trois/1440/02-alerte.png) |
| Le propriétaire ouvre le signalement | [390 px](demo-parcours-a-trois/390/02b-dossier.png) | [1440 px](demo-parcours-a-trois/1440/02b-dossier.png) |
| Le propriétaire consulte le devis | [390 px](demo-parcours-a-trois/390/03-devis.png) | [1440 px](demo-parcours-a-trois/1440/03-devis.png) |
| L’artisan propose ses disponibilités | [390 px](demo-parcours-a-trois/390/04-creneaux.png) | [1440 px](demo-parcours-a-trois/1440/04-creneaux.png) |
| Le locataire confirme son rendez-vous | [390 px](demo-parcours-a-trois/390/05-rendez-vous.png) | [1440 px](demo-parcours-a-trois/1440/05-rendez-vous.png) |
| L’artisan rédige son compte rendu | [390 px](demo-parcours-a-trois/390/06-compte-rendu.png) | [1440 px](demo-parcours-a-trois/1440/06-compte-rendu.png) |
| Le propriétaire valide la facture | [390 px](demo-parcours-a-trois/390/07-facture-validee.png) | [1440 px](demo-parcours-a-trois/1440/07-facture-validee.png) |
| La dépense figure à la ligne 224 | [390 px](demo-parcours-a-trois/390/08-aide-2044.png) | [1440 px](demo-parcours-a-trois/1440/08-aide-2044.png) |

## Rejouer le parcours sur le banc local

Depuis `app/` dans une copie sans fichier d’environnement actif, installez les dépendances avec `npm ci` et Chromium avec `npx playwright install chromium`. Préparez un PostgreSQL local et jetable, avec une base vide appelée `gerimmo_ci_demo_vente` et l’utilisateur `postgres`. L’exemple suppose que PostgreSQL écoute sur le port local 56786.

```sh
SUPABASE_DB_URL=postgres://postgres@127.0.0.1:56786/gerimmo_ci_demo_vente \
  node e2e/local/preparer-ci.mjs

SUPALOCAL_DB=postgres://postgres@127.0.0.1:56786/gerimmo_ci_demo_vente_api \
  node e2e/local/lancer-demo-parcours-a-trois.mjs
```

Le lanceur démarre l’application locale, l’émulateur Supabase sur les ports 3286 et 54386. Les éventuels courriels sont simulés en mémoire. Le script joue les deux formats et écrit les captures dans `app/e2e/.results/demo-parcours-a-trois/`. Chaque passage prépare son logement et son bail fictifs avant de jouer les gestes à l’écran.

Les cinq minutes correspondent à une présentation commentée. Le premier lancement du test peut prendre plus de temps à cause de la compilation locale.

Avec FFmpeg et son encodeur VP9, le script suivant assemble les captures 1440 px en une vidéo de 27 secondes. Remplacez le premier chemin par le dossier produit par Playwright pour remonter une prise récente.

```sh
sh e2e/local/monter-demo-parcours-a-trois.sh \
  ../livrables/demo-parcours-a-trois/1440 parcours-a-trois.webm
```

---
type: synthesis
tags: [audit, livraison, v1, pr-341, migrations, securite, finances, ergonomie, demonstration]
status: in-progress
created: 2026-11-16
updated: 2026-11-16
sources: []
---

# Contre-vérification de la PR 341 — candidat V1 06d8e8fd — 16 novembre 2026

Revue finale ciblée et indépendante du candidat de livraison commerciale V1 :
[PR #341](https://github.com/GERIMMO/GERIMMO_V4/pull/341), SHA exact
**06d8e8fd1908aadd4cb2cd9d09e7a3f96f80d1f5**, base `main` = a6538f71. L'audit général
des 206 écrans n'a pas été refait ; seuls les changements de la PR et leur aptitude à
être publiés sont examinés (référence : [[Audit avant vente — ergonomie, visuel et fonctions — 16 novembre 2026]]).

Aucune donnée de production modifiée (lectures `SELECT` uniquement), aucune fusion,
aucun envoi réel. Toutes les écritures ont eu lieu sur des bases locales fictives.

## 1. Verdicts

<!-- VERDICTS -->

## 2. Ce qui a été vérifié, et comment

| Contrôle | Méthode | Résultat |
|---|---|---|
| CI du SHA exact | Run [43870196001](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/43870196001), journal brut relu | Vert. Vitest 12 558 réussis (18 ignorés, bac à sable Stripe). Chromium mobile 278 réussis, 1 instable (réussi au 2ᵉ passage), 3 ignorés. Boîte fictive 4, WebKit mobile 75, PostgREST réel 9, invitation isolée 2. |
| Version servie | `/api/sante` | **bd4cdfbe** (#335). a6538f71 n'en diffère que par 4 fichiers de recette. |
| Registre des migrations de production | `SELECT` sur `supabase_migrations.schema_migrations` | Identique au manifeste de `main` depuis le 01/11 ; dernière version 20261115130412 ; aucune des 5 nouvelles. |
| Données touchées en production | `SELECT` | 0 facture d'intervention, 2 factures externes aux numéros distincts, 0 agence, 0 adhésion d'agent, 0 créneau proposé, 0 mission ouverte. |
| Contrôleur de migrations du dépôt | `conditionner-migration.mjs lot` et `verifier` | Les 5 fichiers sont acceptés. |
| Migrations sur une copie « production simulée » | Schéma de `main` (499 migrations) + historique fictif, puis lot joué comme `migrations.yml` (une transaction, `lock_timeout` 5 s), simulation puis application | Simulation annulée sans trace ; application en **46 ms** ; registre à 504. |
| Tests SQL ciblés sur la base mise à niveau | 21 fichiers Vitest (rendez-vous, concurrence, créneaux, portefeuille, démarrage, factures, règlements, fermeture à `anon`) | **313 réussis, 0 échec, 0 saut.** |
| Quatre parcours métier | `e2e/local/v1-bailleurs.config.ts`, ordinateur 1440 et téléphone 390 simulé, banc local sur le build du candidat | **16/16 réussis** (voir § 4). |
| Sécurité en conditions réelles | Scripts sur le banc : sessions déjà ouvertes, appels directs à l'API | Voir § 5. |
| Démonstration | Reconstruite selon `LIVRAISON.txt`, figée puis restaurée | Voir § 8. |
| Code (sécurité et finances) | Relecture indépendante du diff | Voir § 5 et § 6. |
| Ergonomie | 26 captures avant/après de la PR + code des écrans + captures de la démonstration | Voir § 7. |

## 3. Les cinq migrations

| Migration | Objet | Constat |
|---|---|---|
| `20261116035047_disponibilites_et_droits_rendez_vous` | Créneaux filtrés (passés, occupés, chantier privé) ; choix et contre-proposition réservés à l'occupant d'un bail `actif` ou `preavis` ; verrou sur le planning de l'artisan | Signatures inchangées, droits conservés. `plage_artisan_occupee` est fermée à `public`, `anon` et `authenticated`. Le rejeu reste idempotent. |
| `20261116041536_numeros_factures_emises_intervention` | Registre `artisan_numeros_factures` (artisan, numéro normalisé) ; déclencheur avant insertion sur les deux tables de factures ; chemin `emises/` autorisé au stockage | Reprise de l'historique par `UNION` des numéros normalisés : aucune collision possible, doublons historiques absorbés (vérifié : `F-002` et ` f-002 ` donnent une seule ligne). `numero`, `artisan_id` et `document_id` sont déjà `NOT NULL`. Table sous RLS sans politique et sans droit pour `anon`/`authenticated`. Verrou `SHARE ROW EXCLUSIVE` bref, sur deux tables quasi vides en production. |
| `20261116083100_demarrage_encaissement` | L'étape « premier loyer » est validée par tout encaissement daté d'aujourd'hui ou avant | Signature et droits inchangés. |
| `20261116083200_gestion_collaborateurs_agence` | `gerer_collaborateur_agence` : retirer (avec repreneur obligatoire et réattribution des mandats en cours, journalisée) ou changer le rôle ; `lots_de_mon_portefeuille` exige une adhésion active | `SECURITY DEFINER`, `search_path` vide, droit pour `authenticated` seul. Refus vérifiés en base : agent, autre agence, soi-même. |
| `20261116084000_destinataire_facture_sci` | Identité de la SCI facturable pour l'artisan de **cette** mission terminée, si la SCI détient seule le lot et si l'artisan fournit le bon SIREN | Ne divulgue rien sans le SIREN exact ; fermée à `anon` et `service_role`. |

**Reprise.**
- Le lot est atomique : un échec annule tout.
- Si le code devait revenir à `main` après application, il reste compatible avec la base migrée : les signatures ne changent pas, et le dépôt de facture de `main` crée le document avant la facture, ce qu'exige le nouveau déclencheur.
- L'inverse n'est pas vrai : le nouveau code sans les migrations échoue sur les fonctions absentes. Il faut donc respecter l'ordre « migrations puis promotion ».
- Aucune migration n'a de retour arrière écrit. La procédure de `LIVRAISON.txt` (corriger en avant, conserver numéros, documents et écritures) est la bonne.

## 4. Les quatre parcours métier (rejeu indépendant)

| Parcours | Ordinateur | Téléphone | Ce qui est démontré |
|---|---|---|---|
| Première location (`premiere-location-continue`) | ✓ | ✓ | Inscription neuve, confirmation par la boîte fictive, bien, lot, locataire, bail papier, dépôt refusé puis corrigé, activation, premier appel de 640 €, confirmation, quittance PDF |
| Finances nom propre et SCI (`lot3-loyer-facture`) | ✓ ✓ | ✓ ✓ | Dépôt du justificatif, paiement déclaré, écriture rapprochée du lot et du fichier |
| Intervention (`artisan-fin-mission` : dépôt, création particulier, SCI, devis privé) | ✓ ✓ ✓ ✓ | ✓ ✓ ✓ ✓ | Fuite avec photo, devis PDF, décision, créneaux, report, compte rendu, facture, validation sans encaissement automatique, clôture |
| Assistance (`support-bailleur`) | ✓ | ✓ | Demande, traitement par la supervision, historique, réponse relue par le bailleur |

**Lecture du premier passage.** Le premier passage a donné 4 échecs, tous dus à l'environnement du banc :
- 2 échecs au devis, parce que l'artisan fictif n'avait pas encore d'adresse : c'est un test placé plus loin dans le même fichier qui la renseigne. La capture d'échec montre d'ailleurs la correction du candidat : l'alerte « Votre adresse d'entreprise manque sur le devis » s'affiche dès l'ouverture de la demande.
- 2 échecs à la première location, parce que la boîte fictive (port 55520) n'était pas lancée.

Une fois ces deux conditions remplies, les 11 cas rejoués passent. Les 5 autres avaient réussi au premier passage.

## 5. Sécurité

| Point | Vérification | Résultat |
|---|---|---|
| Collaborateur retiré, session déjà ouverte | Agent connecté → retrait par le responsable → mêmes jeton et cookies | Accès coupé immédiatement : portefeuille, lots, personnes, baux, documents, encaissements et incidents reviennent vides ; les pages ne montrent plus que le choix d'espace |
| Qui peut retirer | Appels directs | Refusé pour un agent, pour un responsable sur une autre agence et pour un responsable sur lui-même |
| Ancien locataire | Bail passé à `termine`, puis appels directs avec la session du locataire | Plus aucun créneau proposé ; `choisir_creneau` et `contre_proposer_creneaux` répondent « Accès refusé ». La lecture de l'historique des demandes reste possible, comme prévu. Après rétablissement du bail, le créneau est intact. |
| Isolation des organisations | Fonctions nouvelles relues ; appels croisés | <!-- ISOLATION --> |

<!-- SECURITE-CODE -->

## 6. Cohérence financière

<!-- FINANCES -->

## 7. Ergonomie et esthétique

Revue indépendante des 26 captures de la PR, du code des écrans modifiés et des captures
de la démonstration reconstruite (ordinateur et téléphone).

**Défauts du 16/11 : état dans le candidat**

| Réf. 16/11 | Défaut | État | Preuve |
|---|---|---|---|
| T1 | Bandeau « suspendus » au-dessus d'un bouton « Activer » ; signature promise | **Partiel.** La contradiction est levée : seules les quittances restent proposées à l'envoi automatique, et « Activer » mène à `profil#quittances`. La signature est devenue conditionnelle sur Tarifs et Abonnement (« si le service est ouvert »), et la mention « crédits Zoho » a disparu. **Le bandeau ambre reste sur tous les écrans** (`agence/[orgId]/layout.tsx:312`). | `lib/envois-automatiques.ts:15-21`, `tarifs/page.tsx:77`, `abonnement-2026.tsx:706,728` |
| A1 | 143 % sur le tableau de bord contre 300 € sur Loyers | **Corrigé.** Une seule fonction de calcul, plafonnée à l'échéance due. Le même chiffre porte encore 4 libellés différents (P3). | `lib/loyers-parc-mois.ts` ; démonstration : « 640,00 € sur 640,00 € — 100 % » |
| P2 (propriétaire) | 0 € après un encaissement d'avance ; compteurs de tâches différents | **Largement corrigé.** La ligne « X € reçus en novembre, toutes échéances confondues » est ajoutée, l'étape « premier loyer » est validée et le calcul des demandes est commun. Le grand chiffre reste à 0 € en cas d'avance. | `accueil-proprietaire.tsx:105-109`, migration `…083100` |
| A2 | Impossible de retirer un collaborateur | **Corrigé**, vérifié en conditions réelles (§ 5). Le message de succès disparaît avec la ligne retirée (P2). | `administration/gestion-collaborateur.tsx` |
| A3 | Erreur du bail cachée sous l'en-tête | **Corrigé.** Le champ est centré et entouré, le message visible, à 1440 comme à 390. | captures `depot-apres-1440/390` |
| L1 | Aucun retour après « Confirmer ce rendez-vous » | **Corrigé.** Le bloc « Rendez-vous confirmé — samedi 21 novembre 2026, de 08:00 à 12:00 » est vu en tête de « Mes demandes » sur la démonstration. | `components/rendez-vous-locataire-confirme.tsx` |
| R1 | Adresse de l'artisan découverte à la dernière étape ; « Total HT 0,00 € » | **Partiel.** L'adresse est annoncée dès l'ouverture (vu sur le banc), mais le HT reste à 0 € tant que la TVA n'est pas choisie, devis comme nouvelle facture (P2). | `artisan/lignes-devis.tsx:66`, `facture/formulaire-facture.tsx:149` |
| S1–S3 | Console : Santé, tour du matin, retards en vert | **Partiel.** Les pastilles ne sont plus contradictoires, la couleur suit l'état et les retards sont en rouge. Il reste du jargon et des identifiants techniques dans « À examiner en premier » (P2, interne). | `lib/sante-service.ts:190`, `admin/brief/faits-direction.tsx:26` |
| Données « E2E » | Démonstration non présentable | **Partiel.** Les noms sont crédibles (Résidence des Acacias, Élise Morel, SCI des Amandiers, Atelier Dubois Plomberie). Voir § 8 pour les restes. | démonstration |

**Défauts introduits ou restants (aucun ne bloque la livraison)**

| Grav. | Écran | Constat | Correction |
|---|---|---|---|
| P2 | Espaces propriétaire et agence | Le bandeau ambre reste permanent et parle de « courriers d'abonnement » | Ne le montrer que sur Loyers et Profil, avec un texte neutre |
| P2 | Fenêtre de synthèse (propriétaire) | Elle s'ouvre seule et annonce « N demandes à traiter », puis ne liste que les alertes | Ne pas l'ouvrir sans alerte, ou lister toutes les demandes |
| P2 | Administration | Après un retrait, la confirmation disparaît avec la ligne | Message au-dessus de la liste ; bouton « Retirer l'accès » en rouge |
| P2 | Nouvelle facture d'artisan | Identité contrôlée à l'envoi seulement ; pas d'aperçu avant de créer une facture numérotée ; champs SCI (escompte, pénalités) sans aide ; erreur en pied de formulaire | Alerte à l'ouverture, aperçu, textes par défaut modifiables |
| P2 | Devis et facture | « Total HT 0,00 € » sans TVA choisie | Afficher « — » ou calculer le HT seul |
| P2 | Finances › détail par titulaire | Triangles natifs, montants négatifs en vert, deux signes moins différents, libellé « facture Facture-eau-… » | Mise en forme et libellés |
| P2 | Quittance | Espaces avant la ponctuation (« Lyon , le 16/11/2026 . ») | Retirer la marge des champs variables |
| P2 | Démarrage propriétaire | Après une première location complète : « 5/6 — Prochaine étape : Un locataire — Créer sa fiche », alors que la fiche existe (le locataire n'est simplement pas invité) | Libellé « Inviter votre locataire » quand la fiche existe |
| P3 | Divers | Phrase en minuscule et heures « 08:00 » contre « 08 h » ; espace avant un point ; titre de quittance coupé à 1440 ; « Parc de Élise Morel » | Relecture |

**Notes sur 10** (agréable à voir / facile à utiliser / bien présenté), comparées au 16/11 :

| Espace | 16/11 | Candidat |
|---|---|---|
| Propriétaire | 8 / 6 / 7 | **8 / 7 / 7** |
| Agence | 7 / 6 / 7 | **7 / 6,5 / 7** |
| Locataire | 7,5 / 6 / 7 | **7,5 / 7 / 7** |
| Artisan | 8 / 7 / 7,5 | **8 / 7 / 7,5** |
| Console (interne) | 7 / 4 / 5 | **7 / 5 / 5,5** |

Les gains portent sur la facilité d'usage. La présentation stagne à cause du bandeau
permanent et de détails de démonstration ; le caractère premium (charte, quittance,
assistants) est intact.

## 8. Démonstration

Reconstruite de bout en bout selon `LIVRAISON.txt`, sur une base, une API (port 54409),
un site (port 3610) et un stockage dédiés.

| Critère | Résultat |
|---|---|
| Isolée | **Oui.** Le semis `--demonstration` refuse toute autre API ou base. La recette n'accepte que des bases `gerimmo_ci_…` sur la boucle locale. Le gel refuse un compte dont l'adresse n'est pas `example.com`/`example.invalid`, et refuse aussi de copier si les services tournent encore. |
| Réinitialisable | **Oui, vérifié.** Le gel crée le modèle `…_reference`. La restauration « visite » recopie la base et 32 fichiers identiques par SHA-256, puis la copie se sert normalement : connexion, documents. Les copies précédentes sont conservées. |
| Crédible | **Oui pour une démonstration guidée.** Les 8 scénarios passent (première location, intervention, assistance, agenda), et le script d'illustration rapproche 75 € (Élise Morel) et 180 € (SCI des Amandiers). |
| Exploitable | **Oui, sur le poste du présentateur.** Ce n'est pas une démonstration hébergée : il faut PostgreSQL, l'émulateur et un build dédié à l'API 54409. Le chemin de stockage `/private/tmp/…` vient de macOS ; sous Linux, il faut créer le dossier. Les pièces de démonstration lancent le Chromium de Playwright sans chemin explicite, ce qui demande la même version de Playwright que le dépôt. |

**À corriger avant de figer le modèle présenté aux prospects** (P1 pour la démonstration,
sans effet sur la livraison) :
- L'adresse technique `acacias-<identifiant>@example.invalid` (suivie de « · — ») s'imprime en tête de la quittance et figure dans le profil d'Élise Morel. Elle vient de `e2e/premiere-location-continue.spec.ts:18`. Il faut renseigner une adresse de présentation dans le profil avant de figer.

**Restes P2 de la démonstration :**
- « Parc de Élise Morel » au lieu de « Parc d'Élise Morel ».
- Deux bailleurs aux noms proches (Claire Moreau, Élise Morel), et Élise Morel apparaît aussi comme titulaire dans le parc de Claire Moreau.
- « Agence Alpha / Beta » et des adresses `@example.com` pour les comptes types.
- Le profil de Claire Moreau est incomplet (« Votre identité »).

## 9. Délai intermittent du PDF de devis

- **Constat CI.** Au premier essai, `artisan-fin-mission` (variante « création », téléphone) a attendu plus de 15 s le message « PDF validé et enregistré » après « Valider et générer le PDF ». Le second essai est passé.
- **Cause.** Ce n'est pas une régression de la PR : le moteur de rendu (`lib/documents/rendu.ts`) n'est pas modifié. Seuls la page de devis et son formulaire changent, pour l'avertissement d'adresse.
- **Rejeu local.** 9 générations de devis PDF (6 au rejeu des parcours, 3 à la démonstration), sans aucun dépassement du délai de 25 s du banc.
- **Risque pour un utilisateur : faible.**
  - L'interface n'a pas de délai d'expiration. Le bouton reste désactivé pendant la génération, ce qui évite les doubles envois.
  - En production, le rendu passe par le Chromium serverless (`@sparticuz/chromium`). Un démarrage à froid peut faire attendre quelques secondes. Aucune durée maximale propre à cette page n'est fixée : c'est la durée par défaut de la fonction Vercel qui s'applique.
- **Recommandation (P2).** Mesurer la durée réelle des premières générations pendant le pilote (journaux Vercel) et afficher « Génération du PDF… (quelques secondes) » pendant l'attente.

## 10. Essai, ventes fermées et protections de publication

- **Essai gratuit.** La durée n'est pas modifiée par la PR : 2 mois pour toute inscription jusqu'au 31/12/2026, puis 1 mois (`lib/editeur.ts`, `conditions-versions.json`). En production, 5 organisations sont en essai, avec des fins entre le **24 et le 29/12/2026**.
- **Ventes payantes.** Elles restent fermées : `souscriptions_payantes_ouvertes = false` et `blocage_souscription_identite = true` en production (lecture du 16/11). `verrou-pilote.ts` et `reglage-souscription-serveur.ts` ne sont pas modifiés. Toute tentative de souscription reçoit « Le paiement en ligne n'est pas encore ouvert » (`actions/abonnement.ts:128,261,773`).
- **Protections de publication.**
  - Seule l'étape d'installation de Chromium change dans `ci.yml`, pour exporter `GERIMMO_CHROME`.
  - `migrations.yml` (simulation, sauvegarde de moins de 90 min, garde par empreinte, CI verte exigée) et `publication-controlee.yml` sont inchangés.

## 11. Limites

- Banc PostgreSQL 16 (production : version Supabase) ; émulateur local de l'API et de l'authentification ; aucune notification réelle.
- Téléphone simulé dans Chromium, pas d'appareil réel.
- La copie « production simulée » reproduit le schéma de `main` et des cas historiques choisis, pas les données réelles. Les données réelles concernées par les migrations ont été comptées en lecture seule.
- Protections de branche et d'environnement GitHub non relues (API inaccessible depuis ce poste) ; les chantiers `migrations.yml` et `publication-controlee.yml` ne sont pas modifiés par la PR.

## Liens

- [[Audit avant vente — ergonomie, visuel et fonctions — 16 novembre 2026]]
- [[Audit final indépendant — PR 335 — 15 novembre 2026]]
- [[Contre-vérification ciblée — PR 335 — candidat 962f2c76]]

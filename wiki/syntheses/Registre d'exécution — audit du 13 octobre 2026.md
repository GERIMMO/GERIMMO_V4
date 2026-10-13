---
type: synthesis
tags: [audit, execution, registre, v1, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-13
sources: []
---

# Registre d'exécution — audit du 13 octobre 2026

Ce registre dit **ce qui a réellement été exécuté**, avec quel résultat, et ce qui ne l'a pas été. Il complète le
[[Registre des anomalies — audit du 13 octobre 2026]] (ce qui est cassé) par ce qui a été regardé. Il est régénéré
à chaque résultat ; aucune ligne n'est écrite sans un fichier de preuve ou un journal de commande derrière elle.

Vocabulaire de la mission : *exécuté avec succès*, *exécuté en échec*, *implémenté non vérifié*, *préparé*,
*en attente d'aval*, *bloqué par accès*, *hors V1*.

## 1. Contrôles automatiques

| Contrôle | Version de référence (`main` e9f31ac) | Version candidate (branche) |
|---|---|---|
| Lint | réussi | réussi |
| Build de production | réussi | réussi |
| Types (`tsc`) | réussi | réussi |
| Tests unitaires et base (vitest), fichiers | 323 passed, 1 skipped (324) | 330 passed, 1 skipped (331) |
| Tests unitaires et base (vitest), tests | 3333 passed, 14 skipped (3347) | 3460 passed, 14 skipped (3474) |
| Parcours navigateur (Playwright) | 147 passed | 1 skipped, 163 passed |
| Matrice des écrans | réussi | réussi |
| Audit des écrans à 768 px (tous profils) | non relevé | 8 passed |
| Audit des écrans à 1440 px (tous profils) | non relevé | 8 passed |

La référence est le code de `main` au commit e9f31ac, PR #177 incluse. La candidate est la tête de la branche
de l'audit : retrait des agences du site public, correctif pg_cron du marketing, correctif du récapitulatif
fiscal et corrections de l'audit. Banc local : Postgres 16, émulateur de l'API Supabase, `next start`,
aucun service externe (ni Resend, ni Stripe, ni signature, ni modèle de langage).

## 2. Scénarios exécutés par les agents

### Propriétaire (scénario A, 1re passe)

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| A2-parc | A2 création d'un bien (immeuble) et de deux lots, archivage puis restauration d'un bien de test, recherche | exécuté avec succès | captures/s2-12-apres-creation.png ; sql/s2k.out.txt |
| A3-bail | A3 personne locataire, invitation, bail brouillon → activation par dépôt du bail signé | exécuté avec succès | captures/s7-12-bail-signe-depose.png |
| A5-loyers | A5 échéance, encaissement partiel puis total, trop-perçu, annulation avec motif, quittance/reçu | exécuté avec succès | captures/s8-04-apres-partiel.png ; captures/s8-08-solde-regle.png ; captures/s8-10-quittance-html.png |
| A8-acces-croises | A8 accès croisés propriétaire n°2 vers Claire Moreau (n°1), Agence Alpha et une organisation propriétaire tierce : URL directe, API REST, RPC, stockage, routes sans session, IDOR (mon org + objet étranger) | exécuté avec succès | sql/s10a-urls-v2.json ; sql/s10c.out.json ; sql/s10d.out.txt ; sql/s10e.out.json ; sql/s10f-routes-sans-sessi… |

### Chaîne locataire → propriétaire (1/2)

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| E1-01 | Locataire : lien d'invitation avant connexion et avec un autre compte | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-02 | Locataire : acceptation de l'invitation avec double clic | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-03 | Locataire : parcours de l'espace en mobile 390x844 (accueil, logement, paiements, documents, demandes, messages, signalement, FAQ) et quittance en bureau | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-04 | Locataire : dépôt d'attestation d'assurance (formats, taille, date, doublon) | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-05 | Locataire : message au gestionnaire avec double clic et contenu HTML | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-06 | Locataire : signalement d'incident avec photo — champ omis, réseau coupé, réponse perdue après traitement serveur, double clic, actualisation, urgence | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-07 | Propriétaire n°2 : examen et qualification de l'incident INC-2026-0002 (double clic) | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-08 | Propriétaire n°2 : ouverture de la consultation (devis unique assumé, métier plomberie, entretien courant, validité 30 j) avec double clic | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures… |
| E1-09 | Demande de devis à artisan.alpha, vision de l'artisan, devis v1, refus, v2, acceptation, validation de la réalisation, isolation locataire par API | non exécuté |  |

### Chaîne intervention, facture, trace (2/2)

Aucun scénario consigné au rapport : rien n'est revendiqué.

### Super-administrateur

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| M1-RPC | Matrice des droits : 99 fonctions SQL citant super_admin appelées en transaction annulée par 7 profils (propriétaire, locataire, artisan, agent, admin d'agence, multi, super-admin en aal1) + anon | exécuté avec succès | sql/matrice_rpc_negative.json ; sql/valeurs_rpc_ok.txt ; sql/fonctions_super_admin.txt ; scripts/matrice_rpc.… |
| M1-TAB | Matrice des droits : 19 tables de supervision (consignes, vacances, arrêts, journal d'audit, points du matin, sessions artisan, retours…) en lecture/écriture directe par 7 profils | exécuté avec succès | sql/tables_negatif.json ; sql/tables_admin_rls.txt ; scripts/tables_neg.py |
| M1-UI | Matrice des droits : 21 URLs /admin/** + route de pièces artisan + replay d'action serveur, par propriétaire, locataire, artisan, agent, admin d'agence, anonyme, super-admin en aal1 (navigateur) | exécuté avec succès | sql/negatifs_ui_v2.json ; scripts/t04b_negatifs_ui.mjs |
| M1-LOGIN | Super-admin : connexion + sas MFA comme auth.setup.ts, puis /admin/brief | exécuté avec succès | captures/01-brief-initial.png |
| M3a-BRIEF | Scénario D(a) : brief quotidien depuis événements réels du banc — fixture '[TEST-superadmin] Parc brief' (3 loyers échus de 750 € couverts à 1 000 €, 1 loyer à venir, incident urgent, passage de mission interrompu), puis 'Préparer le point maintenant' dans /a… | exécuté avec succès | sql/verite_avant.txt ; sql/verite_apres_fixture.txt ; sql/brief_snapshot_faits.txt ; captures/03-brief-faits-… |

### Artisan (clients externes)

Aucun rapport lisible : rien n'est revendiqué pour ce rôle.

### Auditeur — autorisations et isolation

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| A1-1 | Inventaire RLS/politiques/vues/fonctions/droits anon | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/securi… |
| A1-2 | Fuzz des 354 fonctions exécutables par authenticated, 5 intrus hors organisation + 3 rôles internes + agent à portefeuille vidé | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travai… |
| A1-3 | Stockage : buckets, politiques, téléchargement par l'API avec 7 comptes et anonyme | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/securi… |
| A2-1 | Matrice de lecture API : 9 comptes x 141 relations | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/matric… |
| A2-2 | Écritures croisées par l'API : PATCH, DELETE, POST sur toutes les tables, 8 comptes vers Alpha et Claire | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/ecritu… |
| A2-3 | Droits d'écriture directs par rôle dans sa propre organisation | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/ecritu… |
| A2-4 | Locataire<->locataire, artisan<->artisan, agent<->autre agence, compte multi | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/matric… |
| A3-1 | Traçabilité : supprimer_encaissement, annuler_mission, contre_ecriture, supprimer_detention (diff de toutes les tables) | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travai… |
| A3-2 | Révocation, décision IA, consigne, mode vacances, suppression de bail brouillon | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/securi… |

### Auditeur — web, fichiers, secrets

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| B-ENTETES | En-têtes de sécurité et CSP (curl -sI) sur /, /connexion, /inscription, /api/sante, 404 | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/entete… |
| B-REDIRECTIONS | Redirections ouvertes : /auth/confirm?next=, ?code=&next=, /connexion?suite\|retour\|next=, /inscription?retour= | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/redire… |
| B-SECRETS | Recherche de secrets dans snap-main (hors node_modules) et dans .next/static, et présence de la clé de service du banc dans bundles/HTML | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/secret… |
| B-FICHIERS-ACCES | Routes de téléchargement agence/locataire/documents/[id]/fichier avec 6 identités (anonyme, propriétaire, locataire, artisan, agent ; session admin périmée) sur 6 couples org/document | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/fichie… |
| B-ACTIONS-SERVEUR | Server actions de supervision (renvoyerInvitation, controlerCompte) appelées par identifiant : sans session, avec 4 sessions sans droit (propriétaire, locataire, artisan, agent), et avec Origin étranger/null/absent | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/action… |
| B-ROUTES-API | Routes /api/devis/[id]/pdf, /api/artisan-prive/*, /admin/artisans/pieces/*, /artisan/attestations/*, /agence/*/comptabilite/export, /quittance/[id] avec identifiant inconnu et 5 identités | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/routes… |
| B-XSS-RENDU | Inscription propriétaire par l'interface avec prénom '"><img src=x onerror=…>', nom '<script>…</script>{{7*7}}' + RTL/emoji/apostrophe, adresse et ville avec HTML et SQL ; relecture de /espaces et /compte | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/xss-in… |
| B-XSS-ROLES | Script stocké cross-rôle : description d'incident hostile (img onerror, script, {{7*7}}, SQL, emoji) déclarée par le locataire Alpha puis relue par l'agent Alpha, le locataire et l'artisan | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/xss-re… |
| B-UPLOADS | Téléversement de photos d'incident par le locataire : HTML déguisé en .jpg, SVG actif, PNG de 11 Mo, JPEG valide contenant du script (polyglotte), PNG nommé shell.php.png et nommé '"><img onerror>.png' | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/incide… |
| B-SUITE-LOGIN | Connexion réelle avec /connexion?suite= valant //evil.example/x, https://evil.example, /\evil.example, javascript:alert(1), /assistance?x=1 | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/suite-… |
| B-SURFACE | Cartes sources dans .next/static, fichiers de public/, robots.txt, routes cron et webhooks sans secret ou avec secret faux | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/divers… |
| B-LIMITATION-CONNEX… | 12 mots de passe faux puis le bon sur l'API d'authentification émulée | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/host-h… |
| B-COOKIES | Drapeaux des cookies de session (état Playwright du propriétaire) | exécuté avec succès | lecture du fichier d'état e2e/.auth/proprietaire.json (valeurs non recopiées) |

### Auditeur — automatismes, résilience, cohérence

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| C-01 | 13 routes cron + /api/sante sans jeton, jeton faux, 'Bearer ' vide, schema sans Bearer (60 appels) ; HEAD/POST/PUT/OPTIONS sur /api/cron/purge | exécuté avec succès | sorties de session consignees dans inventaire-automatismes.md |
| C-02 | Chemin autorise du cron marketing avec le jeton pg_cron genere en base (2 appels doubles, jeton tronque, jeton sur mission=purge et /api/cron/purge) | exécuté avec succès | preuves/auditeur/c/cron-marketing-jeton-pgcron.txt |
| C-03 | Exercice de restauration local (export chiffre, verification, pg_restore dans base neuve, comparaison tables/politiques/droits) | exécuté avec succès | preuves/auditeur/c/restauration-exercice.log |
| C-04 | Archive de sauvegarde alteree d'un octet / tronquee / mauvaise cle / manifeste absent -> verifier | exécuté avec succès | sortie de session (scripts/sauvegarde/base.mjs verifier) |
| C-05 | Idempotence des fonctions des 8 taches pg_cron (cycle_mensuel_interne x3, alertes impayes/diagnostics/assurance/restitutions x2, retention x2, propositions publication x2) sur la copie | exécuté, résultat partiel | inventaire-automatismes.md section 2 |
| C-06 | Dedoublonnage du webhook Stripe (abonnement_evenement_a_traiter x2, rejouable, a_traiter) et verrou de mission (commencer_mission x2) | exécuté, résultat partiel | sorties de session (psql sur la copie) |
| C-07 | Encaissement atomique concurrent (2 demandes simultanees, la 1re retenue 2 s) et rejeu de commande, sur la copie | exécuté avec succès | coherence-regressions.md |
| D-01 | Coherence SQL / ecran admin / ecran locataire / ecran artisan / export CSV : 1 bail (E2E Lot 1, Agence Alpha), 2 incidents (INC-2026-0001 et -0002), 2 ecritures (loyer 300,00 et honoraires 18,00) | exécuté avec succès | coherence-ecrans.json, compta-ecran.txt, compta-export.csv, coherence-regressions.md |
| D-02 | Invariants SQL sur tout le banc partage (lecture) + calcul de prorata sur 5 cas limites (rollback) | exécuté avec succès | preuves-sql.txt, coherence-regressions.md |
| C-08 | Lecture des 10 workflows GitHub, vercel.json, 306 migrations vs ordre-migrations.txt, 22 migrations de la PR #177 | exécuté, résultat partiel | inventaire-automatismes.md sections 4 a 6 |

### Relecteur — finance et fiscalité

Relecture adverse du code livré : 13 constats au registre des anomalies. Périmètre : finance (migrations 20261012223000, 20261012224000, 20261012224100, 20261012224200 ; lib/fiscal*.ts, documents catalogue-gestion, actions quittancement/fiscalite, composants fiscaux)

### Relecteur — reprises et idempotence

Relecture adverse du code livré : 5 constats au registre des anomalies. Périmètre : reprises (migrations 20261012190000 .. 20261013107000 hors finance ; actions incidents/invitations/creation de bien/planning ; app/invitations ; locataire incident ; artisan agenda et creneaux ; lib reprise/idempotence)

### Relecteur — supervision

Relecture adverse du code livré : 9 constats au registre des anomalies. Périmètre : supervision

## 3. Ce qui n'a pas été exécuté

| Volet | Élément | Raison |
|---|---|---|
| Propriétaire (scénario A, 1re passe) | Inscription valide par le formulaire /inscription, double clic sur « Ouvrir mon espace » et actualisation pendant la création du compte : le serveur :3100 n'a pas la clé de service (PROP-BANC-01), le compte a été posé par l'API d'administration de l'émulateur (contournement_par_fixture) | non testable sur le banc local |
| Propriétaire (scénario A, 1re passe) | Consommation du lien de récupération de mot de passe et du lien d'invitation : l'émulateur répond 400 « verify non géré en mode local » (serveur-supabase-local.mjs) ; seule la demande côté écran a pu être vérifiée | non exécuté |
| Propriétaire (scénario A, 1re passe) | Claire Moreau (propriétaire n°1) n'a sur le banc remis à neuf ni bail, ni document, ni quittance, ni écriture : les accès croisés sur ces objets ont été faits contre Agence Alpha et une organisation propriétaire tierce (« TEST encaissement atomique », laissée par un autre test) ; l'accès à biens, lots et personnes de Claire est… | non testable sur le banc local |
| Propriétaire (scénario A, 1re passe) | choisir_personne_bail avec une personne étrangère sur un bail brouillon à moi : refusé ici pour une autre raison (« Seul un bail en brouillon se corrige », mon bail est actif) ; à rejouer sur un brouillon | bloqué par accès ou par la limite de session |
| Propriétaire (scénario A, 1re passe) | Liste de dossiers du stockage (/storage/v1/object/list) : l'émulateur répond 403 même pour mon propre dossier, test non concluant | non exécuté |
| Chaîne locataire → propriétaire (1/2) | Demande de devis à artisan.alpha et note de ce que voit l'artisan (périmètre nécessaire, pas la finance locative) : action refusée par le contrôle d'autorisation (ressource partagée) | bloqué par accès ou par la limite de session |
| Chaîne locataire → propriétaire (1/2) | Devis version 1 structuré, calcul HT/TVA/TTC à part au centime | non exécuté |
| Chaîne locataire → propriétaire (1/2) | Refus de la version 1 avec demande de révision, version 2, acceptation de la version 2, validation de la réalisation | bloqué par accès ou par la limite de session |
| Chaîne locataire → propriétaire (1/2) | Le locataire ne peut pas accepter le devis ni modifier l'incident ; l'artisan ne modifie aucune décision du propriétaire (tests par API) | non exécuté |
| Chaîne locataire → propriétaire (1/2) | Isolation locataire par URL et API vers le bail, les documents, loyers et incidents d'un autre locataire, du propriétaire n°1 et les finances du propriétaire | non exécuté |
| Chaîne locataire → propriétaire (1/2) | Notifications aux bons destinataires : aucune table d'envoi d'e-mails sur le banc (seule la table alerts existe), non évaluable autrement | non testable sur le banc local |
| Chaîne locataire → propriétaire (1/2) | Parcours locataire en bureau 1280x800 hors quittance, loyers et documents | non exécuté |
| Chaîne locataire → propriétaire (1/2) | Suivi côté locataire après la demande de devis (propose/choisit un créneau, reporter, confirmer la résolution) | non exécuté |
| Chaîne locataire → propriétaire (1/2) | Point de passage pour la seconde moitié dans coordination.jsonl (non écrit : l'acceptation v2 n'a pas eu lieu) | non exécuté |
| Auditeur — autorisations et isolation | Volets B (entrées/sorties, CSP, cookies, téléversements), C (automatismes, webhooks, sauvegardes, migrations) et D (cohérence 3 baux/3 incidents/3 écritures) : hors périmètre de ce volet a. | hors du périmètre de ce volet |
| Auditeur — autorisations et isolation | Fonctions de supervision exécutées avec MFA aal2 (consignes, vacances, décision du matin, révocation de relais) : refus constaté pour comptes ordinaires, exécution non faite. | bloqué par accès ou par la limite de session |
| Auditeur — autorisations et isolation | Isolation locataire<->locataire et artisan<->artisan en exécution (un seul compte de chaque par organisation) ; compte multi@ (cumul admin Beta + agent Alpha). | non exécuté |
| Auditeur — autorisations et isolation | Couverture du fuzz limitée par le jeu de données (1 bail, 2 incidents sur Alpha) : les fonctions qui exigent des objets absents répondent 'introuvable' sans prouver la garde. | non exécuté |
| Auditeur — autorisations et isolation | Écarts entre l'émulateur maison (PostgREST/Storage/GoTrue simulés) et Supabase réel : vérification de la signature des jetons et politiques de stockage de la plateforme non testables ici. | non testable sur le banc local |
| Auditeur — autorisations et isolation | supprimer_bail_brouillon : trace non observée (le bail de test n'était pas supprimable en l'état). | non exécuté |
| Auditeur — web, fichiers, secrets | Limitation de tentatives de connexion réelle (Supabase Auth de production, non présent sur l'émulateur) | non exécuté |
| Auditeur — web, fichiers, secrets | Expiration et réutilisation des liens de mot de passe (pas d'envoi d'e-mail sur le banc ; jetons non obtenus sans contourner le flux) | non testable sur le banc local |
| Auditeur — web, fichiers, secrets | Rejet d'une signature Stripe/YouTrust fausse et rejeu d'un même événement (secrets de signature absents du banc : 503) | non testable sur le banc local |
| Auditeur — web, fichiers, secrets | Relecture des champs libres dans l'espace administrateur et superviseur (sessions admin et superadmin périmées ; refaire le sas MFA réinitialiserait les facteurs du banc partagé) | bloqué par accès ou par la limite de session |
| Auditeur — web, fichiers, secrets | Refus serveur d'un fichier supérieur à 10 Mo et téléversement par les formulaires de GED, de bail, d'artisan (attestations, clients privés), de signature : lecture du code seulement (detecterMimeReel partout) | bloqué par accès ou par la limite de session |
| Auditeur — web, fichiers, secrets | Rendu réel des e-mails de relance/appel/rappel avec valeurs hostiles sur la chaîne complète (aucune clé Resend : prouvé par exécution de la fonction seulement) | non testable sur le banc local |
| Auditeur — web, fichiers, secrets | Contrôle de droit de controlerCompte et des autres actions de supervision par appel direct (encodage multipart non abouti, une seule action prouvée) | non exécuté |
| Auditeur — web, fichiers, secrets | Champs libres de l'artisan (devis, clients externes) et messagerie : non exercés | non exécuté |
| Auditeur — automatismes, résilience, cohérence | Chemin autorise (CRON_SECRET valide) des 10 missions et de l'orchestrateur, des routes directes : la variable est absente du serveur 3100 ; seul le jeton pg_cron du marketing a permis d'exercer un chemin autorise | non testable sur le banc local |
| Auditeur — automatismes, résilience, cohérence | Webhooks Stripe et Youtrust : signature absente/fausse/rejouee, effet unique d'un evenement rejoue de bout en bout (503 faute de configuration) ; seuls le dedoublonnage SQL et la cle primaire ont ete testes | non testable sur le banc local |
| Auditeur — automatismes, résilience, cohérence | pg_cron et pg_net reels (doublure de cron.schedule sur le banc) ; declencheur marketing toutes les 5 minutes | non testable sur le banc local |
| Auditeur — automatismes, résilience, cohérence | Fournisseur indisponible (Resend, Stripe, Facebook, Yousign, Supabase) : l'emulateur ne pouvait pas etre arrete ; comportement lu dans le code seulement | non testable sur le banc local |
| Auditeur — automatismes, résilience, cohérence | Workflows GitHub (sauvegarde vers Scaleway, migrations, publication controlee, restauration reelle) : non executables hors GitHub ; pg_dump 17/18 absent, restauration jouee en PostgreSQL 16 | non testable sur le banc local |
| Auditeur — automatismes, résilience, cohérence | Rejeu des 306 migrations depuis une base vierge, dans l'ordre du manifeste comme dans l'ordre des noms | non exécuté |
| Auditeur — automatismes, résilience, cohérence | Cohérence sur 3 baux et 3 incidents : un seul bail et deux incidents ont pu etre compares entre ecrans ; le bail de test du proprietaire (a142e461) et les trois baux 'TEST encaissement atomique' ne l'ont ete que par SQL (compte inconnu) ; un seul export CSV (agence Alpha) | non exécuté |
| Auditeur — automatismes, résilience, cohérence | Bouton 'Lancer' des missions dans Sante (depend de CRON_SECRET) et bouton 'diffusion maintenant' du marketing | non exécuté |
| Auditeur — automatismes, résilience, cohérence | Sections A et B de la mission (autorisations, entrees/sorties) : confiees aux autres volets de l'auditeur transversal | bloqué par accès ou par la limite de session |
| Relecteur — finance et fiscalité | Aucun accès production : les requêtes de contrôle sont fournies, non exécutées (voir sql/controles_prod_lecture_seule.sql, testées pour la syntaxe sur la copie). | non lu |
| Relecteur — finance et fiscalité | Chemin HTTP/PDF de génération du récapitulatif nu non exercé de bout en bout (écriture en GED sur la base d'intégration du banc interdite) : calcul et HTML exercés avec le vrai code. | non lu |
| Relecteur — finance et fiscalité | Aucun parcours navigateur (hors périmètre de la relecture) ; e2e/encaissement-reste.spec.ts et e2e/fiscalite-qualifiee.spec.ts non lus en détail. | non lu |
| Relecteur — finance et fiscalité | Règles fiscales 2044 (lignes 229/230, ALUR, rubriques manquantes 226) non confrontées à la notice officielle : impots.gouv.fr inaccessible depuis le banc (proxy 403). À consulter : notice 2044 et BOFiP BOI-RFPI-BASE-20-30-10. | non lu |
| Relecteur — finance et fiscalité | Plafond de lignes de l'API de production et fuseau de la base de production non consultés (FIN-12, FIN-13). | non lu |
| Relecteur — finance et fiscalité | Inter-blocage possible entre emettre_quittances (sans verrou de bail) et un encaissement concurrent, et condition de course sur resynchroniser_quittances : relevés en lecture, non testés (antérieurs à la PR). | non lu |
| Relecteur — finance et fiscalité | lib/charges.ts, ventilation-teom.ts, formulaire-appels-charges.tsx, app/actions/compta.ts : non modifiés par la PR, lus seulement en recherche de consommateurs. | non lu |
| Relecteur — reprises et idempotence | Hors perimetre : migrations et code finance (20261012223000..224200), supervision/IA (consignes, vacances, arret d'urgence), marketing (20261013110000), garde d'activation artisan 20261012225000 : non relus | non lu |
| Relecteur — reprises et idempotence | Les ~3 333 tests de la PR (seul tests/planning-conflits-concurrence.test.ts et .github/workflows/ci.yml lus) ; e2e/ non lu | non lu |
| Relecteur — reprises et idempotence | Comportements Supabase reels non reproductibles sur le banc : GoTrue (generateLink / recovery sur un compte insere directement dans auth.users sans identite), Storage reel (RETURNING/policies, suppression S3), statement_timeout de 8 s du role authenticated, delais de fonctions Vercel | non lu |
| Relecteur — reprises et idempotence | Parcours navigateur en ecriture : interdits par la consigne (base gerimmo_ci_integ_api en lecture seule) ; les interruptions reseau entre commit et courriel (REP-02) n'ont donc pas ete jouees de bout en bout | non lu |
| Relecteur — reprises et idempotence | Aucun courriel reel possible sur le banc (pas de cle Resend, pas de cle de service sur le serveur 3100) : envoi des invitations non observe | non lu |
| Relecteur — reprises et idempotence | Fonctions refuser_creneaux_locataire, intervention_hors_portefeuille, reseau_confirmer_commune, decouper_bien : lues seulement par comportement, non auditees en detail | non lu |
| Relecteur — supervision | api/cron/{relances,appels,rappels,territoire,marketing,veille,signatures,abonnements}/route.ts : seulement les appels de verifierAvantEffet (grep), pas la logique complète | non lu |
| Relecteur — supervision | app/src/app/admin/relais/page.tsx et admin/brief/page.tsx, decision-matin.tsx, preparer-point.tsx, ouvrir-alertes.tsx : survolés par grep | non lu |
| Relecteur — supervision | artisan/clients/{page,elements,formulaire,resumes}.tsx et [clientId]/page.tsx | non lu |
| Relecteur — supervision | lib/proposition-devis-ia.ts et le flux devis assisté (migration 20261012090000) : hors liste | non lu |
| Relecteur — supervision | Écrans /admin/relais, /admin/consignes, /admin/brief dans le navigateur (session superadmin expirée, double vérification MFA non rejouée) : seuls leurs appels RPC et leur code ont été examinés | bloqué par accès ou par la limite de session |
| Relecteur — supervision | Routes HTTP /api/cron/* avec arrêt actif : CRON_SECRET et base d'intégration en lecture seule ; l'arrêt n'a été prouvé qu'au niveau SQL (verifier_arret_supervision) et par lecture du code appelant | non exécuté |
| Relecteur — supervision | Appel réel au modèle de langage du brief (aucune clé OpenAI sur le banc) : seules les données envoyées ont été examinées | non testable sur le banc local |
| Relecteur — supervision | Dépôts Storage réels d'un PDF de devis et orphelins (SUP-09) | non exécuté |
| Relecteur — supervision | Plafond de 1 000 lignes de l'API (SUP-06) : émulateur sans ce plafond | non exécuté |

## 4. Totaux des scénarios consignés

50 scénarios : 37 exécutés avec succès, 12 à résultat partiel, 0 en échec, 1 non exécutés (consignés comme tels).

## 5. Ce qui a été livré en branche, et son état

| Élément | Statut |
|---|---|
| Retrait des agences du site public V1 (composants et code conservés) | implémenté et vérifié (tests, parcours navigateur) ; non déployé |
| Correctif de la préparation du soir du marketing (migration 20261013110000) | préparé ; testé sur la base locale ; **non appliqué en production** |
| Récapitulatif fiscal « location nue » (FIN-01, P1) | implémenté et vérifié (tests rouges puis verts) ; non déployé |
| Courriers, inscription, fiches, encaissements (AUD-B-01, AUD-B-02, PROP-02/04/07/12/13) | implémenté et vérifié (tests rouges puis verts) ; non déployé |
| Migration 20261013120000 (AUD-A-01 à A-04, SUP-02, SUP-08, REP-01) | préparée ; 8 tests rouges avant, verts après ; **non appliquée en production** |
| Sauvegarde avant migration, simulation `migrations.yml`, application | en attente d'autorisation |
| Déploiement en production | en attente d'autorisation explicite du dirigeant |

> [!warning] Ce que ce registre ne dit pas
> Il ne prouve pas l'absence d'anomalie dans ce qui n'a pas été exécuté. Les tâches planifiées (`pg_cron`), l'envoi réel
> d'e-mails, les paiements Stripe, la signature électronique et la restauration d'une sauvegarde de production ne sont pas
> testables sur le banc local. Les rôles sont joués par des agents (sessions séparées d'un même modèle), pas par de vrais
> utilisateurs : ils ne remplacent ni un test utilisateur ni une recette par le dirigeant.

Voir aussi : [[Registre des anomalies — audit du 13 octobre 2026]], [[Audit d'acquisition du 3 octobre 2026]].

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
| CI GitHub Actions (Postgres 18, lint, types, tests, build, parcours) | non relevé | réussie : exécution n° 636, tête 8b558c8, après fusion de la PR #178 |
| Simulation des deux migrations contre la production (tout annulé) | sans objet | réussie : exécution n° 70 de « Migrations Supabase », 13/10 à 21 h 43 UTC |

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

### Chaîne locataire → propriétaire (1/2, première passe)

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

### Chaîne devis → réalisation (1/2, reprise)

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| E1b-01 | Propriétaire n°2 : demande de devis à E2E Plomberie Dubois (artisan.alpha) depuis la fiche de l'incident INC-2026-0002 | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-02 | Artisan (artisan.alpha) : ce que montre la demande de devis du propriétaire n°2 (écran /artisan, /artisan/devis, /artisan/devis/<sollicitation>) | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-03 | Artisan : devis v1 structuré (diagnostic, 5 lignes à 2 taux de TVA, délai, durée, validité, contraintes, observations), validation, génération du PDF, envoi avec double clic | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-04 | Propriétaire n°2 : lecture du devis v1 reçu, actions offertes, notification de réception | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-05 | Contrôles de permission par API (sessions réelles locataire, artisan, second artisan non validé) avant la décision du propriétaire | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/sql/per… |
| E1b-06 | Propriétaire n°2 : « Retenir ce devis » avec double clic, puis actualisation | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-07 | Ce que l'artisan voit une fois son devis retenu (accueil et fiche de la mission) et ce que le locataire voit du suivi | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-08 | Contrôles de permission après la décision (locataire, artisan, second artisan, propriétaire n°1 d'une autre organisation) par API avec sessions réelles et par URL | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/sql/per… |
| E1b-09 | Humain : mobile 390x844, retour sur l'envoi d'e-mail, double clic sur « Réessayer l'envoi » | exécuté, résultat partiel | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/capture… |
| E1b-10 | Contrôle complémentaire du calcul du devis (écran contre base) : test différentiel sur 400 devis aléatoires et bornes de la fonction SQL | exécuté avec succès | /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/sql/dif… |

### Chaîne intervention, facture, trace (2/2)

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| E2-01 | Artisan : accepte la mission 6e870972 (double clic sur « Accepter la mission »), puis propose trois créneaux (double clic sur « Envoyer ») | exécuté avec succès | captures/a1-02-mission-acceptee.png, captures/c2-01-creneaux-envoyes.png, captures/c1-01-creneaux-invalides.p… |
| E2-02 | Locataire : choisit un créneau (double clic sur « Confirmer ce rendez-vous ») | exécuté avec succès | captures/l2-01-rdv-planifie-locataire.png, captures/o0-01-fiche-incident-planifie.png |
| E2-03 | Report du rendez-vous : l'artisan « Déplace le rendez-vous » (3 nouveaux créneaux), le locataire rechoisit ; répété jusqu'à la limite | exécuté, résultat partiel | sql/creneaux-faux-refus.txt, captures/c4-01-deplacement-erreur.png |
| E2-04 | Locataire : reporter ou annuler lui-même un rendez-vous confirmé | exécuté, en échec | captures/l2-01-rdv-planifie-locataire.png |
| E2-05 | Artisan : démarre l'intervention (double clic), photo de fin de chantier, compte rendu (quatre questions : ce que j'ai fait, dépassement du devis, autre cause constatée, autre intervention nécessaire), puis « Terminer » | exécuté avec succès | captures/d2-01-photo-fin-chantier.png, captures/d4-01-bilan-montant-superieur.png, captures/d5-01-interventio… |
| E2-06 | Artisan : dépose la facture (destinataire, montant, fichier) avec saisies invalides puis double clic | exécuté avec succès | captures/f3-01-facture-deposee.png, captures/f3-02-ma-facturation.png, captures/f2-01-facture-essais.png |
| E2-07 | Artisan : tente de marquer la facture payée / validée / de modifier sa facture, la mission et l'incident (UI, RPC, écritures directes) | exécuté avec succès | sql/artisan-refus-paiement.txt |
| E2-08 | Propriétaire n°2 : contrôle puis valide la facture (sans motif, puis avec motif, double clic) | exécuté avec succès | captures/o4-01-facture-validee.png, captures/o2-01-valider-facture.png |
| E2-09 | Propriétaire n°2 : règle la facture (déclaratif) en saisissant une écriture de dépense au journal, puis clôture l'incident (« Résolu ») | exécuté, résultat partiel | captures/o7-01-ecriture-reglement.png, captures/o8-01-incident-clos.png, sql/ecriture-reglement.txt |
| E2-10 | Locataire : lit la fiche de l'incident clos (compte rendu, photo), envoie son avis (note 4/5 + mot) avec double clic | exécuté avec succès | captures/l3-01-demande-cloturee-locataire.png, captures/l4-01-avis-locataire.png |
| E2-11 | Locataire : ouvre un second incident de test (serrurerie, INC-2026-0004), le propriétaire le qualifie et le clôture, le locataire clique « Le problème persiste » (sans puis avec précisions, double clic) | exécuté avec succès | captures/n2-01-second-incident.png, captures/n5-01-probleme-persiste.png, captures/n6-01-contestation-rouvert… |
| E2-12 | ISOLATION avec la session du locataire : lecture directe de 32 tables, 23 RPC de lecture sur 5 organisations (la sienne, propriétaire n°1, Agence Alpha, Agence Beta, un parc d'auditeur), 7 documents de natures diverses, 26 RPC de décision/écriture (devis, fac… | exécuté avec succès | sql/isolation-locataire-lecture.txt, sql/isolation-locataire-rpc-lecture.txt, sql/isolation-locataire-ecritur… |
| E2-13 | Locataire en mobile 390x844 : 8 écrans, mentions d'agence, liens, boutons sans action, hors ligne | exécuté avec succès | sql/locataire-etats-ux.txt, captures/ux1-01-hors-ligne-contact.png |
| E2-14 | Super-administrateur (aal2, sas MFA franchi comme e2e/auth.setup.ts) : traversée de l'espace du propriétaire n°2 et lecture de la trace complète de l'incident INC-2026-0002 ; comparaison des montants à mon calcul indépendant | exécuté avec succès | captures/sa4-01-incident-vu-par-supervision.png, captures/sa3-01-organisation-O2.png, sql/audit-log-chaine2.t… |
| E2-15 | Nouvelles traces de la version candidate : contre_ecriture (le propriétaire annule une écriture de test), mission_annulee, detention_supprimee | exécuté, résultat partiel | sql/audit-log-chaine2.txt, captures/sa5-01-journal-contre-ecriture.png, captures/o10-01-contre-ecriture-journ… |

### Super-administrateur

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| M1-RPC | Matrice des droits : 99 fonctions SQL citant super_admin appelées en transaction annulée par 7 profils (propriétaire, locataire, artisan, agent, admin d'agence, multi, super-admin en aal1) + anon | exécuté avec succès | sql/matrice_rpc_negative.json ; sql/valeurs_rpc_ok.txt ; sql/fonctions_super_admin.txt ; scripts/matrice_rpc.… |
| M1-TAB | Matrice des droits : 19 tables de supervision (consignes, vacances, arrêts, journal d'audit, points du matin, sessions artisan, retours…) en lecture/écriture directe par 7 profils | exécuté avec succès | sql/tables_negatif.json ; sql/tables_admin_rls.txt ; scripts/tables_neg.py |
| M1-UI | Matrice des droits : 21 URLs /admin/** + route de pièces artisan + replay d'action serveur, par propriétaire, locataire, artisan, agent, admin d'agence, anonyme, super-admin en aal1 (navigateur) | exécuté avec succès | sql/negatifs_ui_v2.json ; scripts/t04b_negatifs_ui.mjs |
| M1-LOGIN | Super-admin : connexion + sas MFA comme auth.setup.ts, puis /admin/brief | exécuté avec succès | captures/01-brief-initial.png |
| M3a-BRIEF | Scénario D(a) : brief quotidien depuis événements réels du banc — fixture '[TEST-superadmin] Parc brief' (3 loyers échus de 750 € couverts à 1 000 €, 1 loyer à venir, incident urgent, passage de mission interrompu), puis 'Préparer le point maintenant' dans /a… | exécuté avec succès | sql/verite_avant.txt ; sql/verite_apres_fixture.txt ; sql/brief_snapshot_faits.txt ; captures/03-brief-faits-… |
| D-CONSIGNES-SAISIE | Scénario D(b), version candidate : /admin/consignes au navigateur, super-admin aal2 : 3 consignes ([TEST-superadmin] D1 lecture claire, D2 ambiguë sans tâche, D3 avec injection + balises script/img) + 3 saisies invalides (fin avant début, heure répétée du cha… | exécuté avec succès | sql2/s02_consignes_sortie.txt ; captures2/02-consignes-saisie.png |
| D-CONSIGNES-DECISION | Scénario D(b) : autorisation d'une version précise, exécution de la lecture, plafond, suspension, reprise | exécuté avec succès | sql2/s03_decisions_sortie.txt ; sql2/s04_negatifs_consignes_sortie.txt ; sql2/s05_negatifs_bis_sortie.txt ; c… |
| D-CONSIGNES-HORS-DR… | Scénario D(b) : appels directs à enregistrer_consigne par un super-admin aal2 simulé avec des paramètres hors droits (transaction annulée) | exécuté avec succès | sql2/s04_negatifs_consignes_sortie.txt ; sql2/s05_negatifs_bis_sortie.txt |
| D-CONSIGNES-REVISION | Scénario D(b) : révision d'une consigne dans deux onglets (versionnage et conflit) | exécuté avec succès | captures2/04-revision-conflit.png ; sortie console dans sql2/s04_* |
| D-VACANCES-PLAN | Scénario D(c), candidate : /admin/relais, programmation d'une absence ([TEST-superadmin] Vacances essai) avec second superviseur habilité (fixture SQL : membership super_admin ajoutée au compte sa.relais.test, retirée en fin d'essai), consigne D8 autorisée, d… | exécuté avec succès | sql2/s07_vacances_sortie.txt ; sql2/s08_actif_sortie.txt ; captures2/05-vacances-programme.png ; captures2/06… |
| D-URGENCE-ESCALADE | Scénario D(c) : tâche ordinaire traitée puis urgence interne escaladée, sans élargir les permissions | exécuté avec succès | sql2/s08_actif_sortie.txt ; captures2/06-vacances-actives-urgence.png |
| D-ARRET-URGENCE | Scénario D(c) : arrêt d'urgence global, par mission, par plan, puis reprise ; effet pendant l'arrêt | exécuté avec succès | sql2/s10_arret_sortie.txt ; captures2/08-arret-global-actif.png |
| SUP-02-VERIF | Version candidate : l'arrêt d'urgence reste possible pendant un diagnostic artisan ouvert (SUP-02) | exécuté avec succès | sql2/s16_sup02_sortie.txt ; sql2/s18_diag_garde_db_sortie.txt ; captures2/09-diagnostic-artisan.png |
| SUP-08-VERIF | Version candidate : une alerte déjà escaladée n'est pas requalifiée quand le responsable perd son habilitation (SUP-08) | exécuté avec succès | sql2/s09_sup08_sortie.txt ; captures2/07-sup08-habilitation-perdue.png |
| S-DIAGNOSTIC-ARTISAN | Support : diagnostic de l'espace d'un artisan inscrit par moi ([TEST-superadmin] Plomberie Essai, compte sa.artisan.test@…) | exécuté avec succès | sql2/s15_diag3_sortie.txt ; sql2/s16_sup02_sortie.txt ; captures2/10-diagnostic-ecriture-refusee.png |
| S-RETOURS | Support : un utilisateur (artisan de test) envoie un signalement via /assistance, la supervision le qualifie, y répond et le résout | exécuté avec succès | sql2/s20_retours_sortie.txt ; captures2/11-retour-traite.png |
| M1-RPC-CANDIDATE | Régression de la matrice RPC sur la version candidate (migration 20261013120000 appliquée) : mêmes 99 fonctions, mêmes 7 profils + anon, transaction annulée | exécuté avec succès | sql2/matrice_rpc_negative_candidate.json ; sql2/matrice_rpc_candidate_sortie.txt ; scripts2/matrice_rpc_candi… |
| S-RECHERCHE | Support : recherche de la console (Ctrl+K) sur un utilisateur, une organisation, un artisan, un incident, un lot, une saisie malveillante | exécuté, résultat partiel | sql2/s21_recherche_sortie.txt ; captures2/12-recherche.png |
| S-SECRETS | Support : balayage des écrans de supervision (fiches de compte, Santé, Paramètres, Journaux, Relais, Consignes, Équipes, Retours, Clients) à la recherche de secrets | exécuté avec succès | sql2/ecran-*.txt (textes bruts des écrans) ; captures2/13-fiche-compte.png |
| S-CONTROLE-COMPTE | Support : geste 'Bloquer le compte' sur mon compte de test (sa.artisan.test@…) ; attribution dans le journal | exécuté, résultat partiel | sql2/s25_blocage_msg.txt ; sql2/emul_ban.txt ; captures2/15-blocage-compte.png |
| S-MOBILE | Support : /admin/relais, /consignes, /brief, /retours, /equipes, /journaux en 390×844 | exécuté avec succès | sql2/s26_mobile_sortie.txt ; captures2/16-relais-mobile.png |
| A-AUTOMATISMES | Mission 5 : état des lieux honnête des équipes IA et automatismes (lecture du code + écrans Équipes/Santé + base du banc) | exécuté, résultat partiel | sql2/ecran-equipes.txt ; sql2/ecran-sante.txt ; vercel.json ; supabase/migrations (cron.schedule) ; sql2/s10_… |

### Artisan (clients externes)

Aucun scénario consigné au rapport : rien n'est revendiqué.

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

### Relecteur PR #178 — navigateur (protection de sortie, brouillons)

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| PR178-A-E01 | Confirmation de sortie : formulaire modifié (alertes), clic sur un lien de la barre latérale, annuler puis accepter | exécuté avec succès | preuves/relecture/pr178/a/a05-sortie.txt |
| PR178-A-E02 | Retour arrière navigateur avec formulaire modifié après navigation douce (API Navigation) | exécuté avec succès | preuves/relecture/pr178/a/a05b-sortie.txt |
| PR178-A-E03 | Rechargement de page avec formulaire modifié | exécuté avec succès | preuves/relecture/pr178/a/a05-sortie.txt |
| PR178-A-E04 | Déconnexion (menu du compte) avec une fiche personne en cours de saisie | exécuté, résultat partiel | preuves/relecture/pr178/a/t2.mjs (sortie dans la fiche PR178-A-01) |
| PR178-A-E05 | Double clic rapide sur « Créer l'alerte » (action non idempotente) | exécuté avec succès | preuves/relecture/pr178/a/t6.mjs |
| PR178-A-E06 | Refus serveur (titre d'espaces), correction, nouvel envoi, sortie | exécuté avec succès | preuves/relecture/pr178/a/a12-sortie.txt |
| PR178-A-E07 | Formulaires de connexion, d'inscription et de mot de passe oublié : exclus de la confirmation de sortie | exécuté avec succès | preuves/relecture/pr178/a/a11-sortie.txt, a10-sortie.txt |
| PR178-A-E08 | Création d'une fiche personne avec une pièce, sans incident réseau | exécuté avec succès | preuves/relecture/pr178/a/t5.mjs (scénario S0), SQL documents |
| PR178-A-E09 | Création d'une fiche personne, réponse perdue (S1) puis rechargement et reprise | exécuté, en échec | preuves/relecture/pr178/a/a03-s1-sortie.txt |
| PR178-A-E10 | Filtres GET (Finances, catalogue de documents, recherche de clients artisan) | exécuté, en échec | preuves/relecture/pr178/a/a02-sortie.txt, a02b-sortie.txt |
| PR178-A-E11 | Session expirée pendant une saisie (alerte, fiche personne) | exécuté, en échec | preuves/relecture/pr178/a/a07b-sortie.txt, a07-sortie.txt |
| PR178-A-E12 | Coût de stockage de la copie locale avec 3 fichiers de 9 Mo | exécuté, en échec | preuves/relecture/pr178/a/a06-sortie.txt |
| PR178-A-E13 | Poste partagé : propriétaire déconnecté puis locataire connecté dans le même profil | exécuté, en échec | preuves/relecture/pr178/a/t2.mjs, captures/A-01-poste-partage-locataire.png |
| PR178-A-E14 | Création d'un client externe par l'artisan (gestionnaire d'envoi propre à ce formulaire, hors hooks de la PR) | exécuté avec succès | preuves/relecture/pr178/a/a09-sortie.txt |
| PR178-A-E15 | Reprise de la fiche personne à 390 x 844 | exécuté avec succès | preuves/relecture/pr178/a/a07-sortie.txt, captures/A-05-reprise-390.png |
| PR178-A-E16 | Dépôt de document (champ fichier) : refus serveur (contenu identique déjà présent) puis succès avec un autre fichier | exécuté avec succès | preuves/relecture/pr178/a/a15-sortie.txt, a15b-sortie.txt |
| PR178-A-E17 | Stockage local refusé (indexedDB.open en erreur) : la fiche personne reste-t-elle utilisable ? | exécuté, résultat partiel | preuves/relecture/pr178/a/a14-sortie.txt |

### Relecteur PR #178 — serveur, régressions, qualité des tests

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| PR178-B-E01 | proxy.ts : session expirée (last_sign_in_at vieilli de 2 jours sur mon compte de test propriétaire) puis GET/HEAD/POST sur pages publiques et privées, requêtes directes avec cookies de session | exécuté avec succès | preuves/relecture/pr178/b/proxy1.json |
| PR178-B-E02 | Encaissement de loyer et encaissement de dépôt de garantie (Agence Alpha, admin.alpha, bail démo) : montant trop élevé (10 000 000), montant valide, sortie par lien interne après chaque cas ; contexte isolé par cas | exécuté avec succès | preuves/relecture/pr178/b/scripts/enc1.mjs, scripts/enc2.mjs (sorties console) |
| PR178-B-E03 | Création de bien (propriétaire de test) : code postal « 7501 » et année 1500, d'abord avec la validation du navigateur, puis avec noValidate et attributs retirés (appel direct simulé) | exécuté avec succès | preuves/relecture/pr178/b/PR178-B-bien-erreurs-serveur.png ; scripts/bien1.mjs |
| PR178-B-E04 | Import CSV du parc (propriétaire de test) : contrôle puis import réel d'une ligne, puis sortie par lien interne | exécuté, en échec | preuves/relecture/pr178/b/PR178-B-import-apres-succes.png ; scripts/import1.mjs |
| PR178-B-E05 | Inscription artisan (/artisan/inscription, formulaire-compte puis formulaire-inscription) : confirmation de mot de passe différente, puis compte créé | exécuté avec succès | preuves/relecture/pr178/b/PR178-B-artisan-inscription.png ; scripts/artins.mjs |
| PR178-B-E06 | Fiche personne (propriétaire de test) : téléphone « abc » puis date de naissance 2030-01-01 jusqu'au récapitulatif | exécuté avec succès | preuves/relecture/pr178/b/PR178-B-personne-erreur-telephone.png ; scripts/pers1.mjs |
| PR178-B-E07 | Double clic sur « Envoyer le message » (locataire.alpha) et « Déclarer l'incident » (admin.alpha, Agence Alpha) | exécuté avec succès | preuves/relecture/pr178/b/scripts/dbl1.mjs (sortie console) |
| PR178-B-E08 | Envoi avant hydratation (fichiers JS bloqués par route) : témoin /inscription (useActionState de React) contre /artisan/inscription (useActionStateProtegee) | exécuté, en échec | preuves/relecture/pr178/b/scripts/sansjs.mjs (sortie console) |
| PR178-B-E09 | Formulaires de recherche/filtre sans attribut method (GET par défaut) : /artisan/clients (artisan.alpha) et /agence/<org>/documents/catalogue (admin.alpha) : saisie d'un terme puis Entrée / « Filtrer » | exécuté, en échec | preuves/relecture/pr178/b/PR178-B-recherche-bloquee.png ; scripts/recherche1.mjs |
| PR178-B-E10 | Encaissement de loyer (admin.alpha, bail démo), réponse perdue APRÈS écriture serveur (route.fetch puis abort), puis second clic sur « Encaisser » avec la même saisie (2 €) | exécuté, en échec | preuves/relecture/pr178/b/PR178-B-encaissement-reponse-perdue.png ; scripts/rejeu1.mjs ; requête SQL sur enca… |
| PR178-B-E11 | proxy.ts : GET /auth/confirm?token_hash=…&type=recovery avec session expirée (cookies d'un compte de test) | exécuté avec succès | preuves/relecture/pr178/b/proxy2.json |
| PR178-B-E12 | Artisan : zone d'intervention invalide « abcde, 7501 » (/artisan/entreprise, artisan.alpha) ; locataire : description d'incident d'un caractère | exécuté, résultat partiel | preuves/relecture/pr178/b/scripts/autres1.mjs (sortie console) |
| PR178-B-E13 | Relecture statique des parcours navigateur ajoutés par la PR (e2e/protection-saisie, creation-bien-reprise, devis-reprise, personne-reprise ×3, incidents-reprise, attestations-refus, demonstration, audit-ecrans, parcours-locataire) et du test proxy-redirectio… | exécuté, résultat partiel | preuves/relecture/pr178/b/lecture de pr178.diff (e2e/*.spec.ts, tests/proxy-redirection-post.test.ts) et de s… |

### Designer — public, propriétaire, locataire

| N° | Scénario | Statut | Preuve |
|---|---|---|---|
| DES-A-EX-01 | Reprise : relecture du dossier de preuves et vérification des sessions (proprietaire, locataire, locataire_pd) sur la candidate rebuild | exécuté avec succès | scripts/verif-sessions.mjs (sortie console) |

### Designer — artisan, super-administrateur, agence (hors V1)

Aucun rapport lisible : rien n'est revendiqué pour ce rôle.

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
| Chaîne locataire → propriétaire (1/2, première passe) | Demande de devis à artisan.alpha et note de ce que voit l'artisan (périmètre nécessaire, pas la finance locative) : action refusée par le contrôle d'autorisation (ressource partagée) | bloqué par accès ou par la limite de session |
| Chaîne locataire → propriétaire (1/2, première passe) | Devis version 1 structuré, calcul HT/TVA/TTC à part au centime | non exécuté |
| Chaîne locataire → propriétaire (1/2, première passe) | Refus de la version 1 avec demande de révision, version 2, acceptation de la version 2, validation de la réalisation | bloqué par accès ou par la limite de session |
| Chaîne locataire → propriétaire (1/2, première passe) | Le locataire ne peut pas accepter le devis ni modifier l'incident ; l'artisan ne modifie aucune décision du propriétaire (tests par API) | non exécuté |
| Chaîne locataire → propriétaire (1/2, première passe) | Isolation locataire par URL et API vers le bail, les documents, loyers et incidents d'un autre locataire, du propriétaire n°1 et les finances du propriétaire | non exécuté |
| Chaîne locataire → propriétaire (1/2, première passe) | Notifications aux bons destinataires : aucune table d'envoi d'e-mails sur le banc (seule la table alerts existe), non évaluable autrement | non testable sur le banc local |
| Chaîne locataire → propriétaire (1/2, première passe) | Parcours locataire en bureau 1280x800 hors quittance, loyers et documents | non exécuté |
| Chaîne locataire → propriétaire (1/2, première passe) | Suivi côté locataire après la demande de devis (propose/choisit un créneau, reporter, confirmer la résolution) | non exécuté |
| Chaîne locataire → propriétaire (1/2, première passe) | Point de passage pour la seconde moitié dans coordination.jsonl (non écrit : l'acceptation v2 n'a pas eu lieu) | non exécuté |
| Chaîne devis → réalisation (1/2, reprise) | Validation de la réalisation par le propriétaire : non faite dans cette moitié, menée à bien ensuite par la chaîne 2 (chaine/2/rapport.json : mission terminée, facture 239,68, incident clos) | non exécuté |
| Chaîne devis → réalisation (1/2, reprise) | Refus de la v1 avec motif et dépôt d'une v2 : fonctions absentes du produit, donc non exécutables (PRO2-12, ART-13) | bloqué par accès ou par la limite de session |
| Chaîne devis → réalisation (1/2, reprise) | Formulaire de devis en mobile 390x844 et saisie reprise sur l'appareil / conflit de révision entre deux fenêtres : le devis étant envoyé, rouvrir le formulaire sur une autre demande aurait modifié des données d'une autre organisation | non exécuté |
| Chaîne devis → réalisation (1/2, reprise) | TVA 0 % / mention de franchise en base sur le PDF, validité dans le passé ou très lointaine, devis supérieur au plafond, décennale requise : un seul devis possible sur ce dossier (les bornes du calcul de la base ont toutefois été vérifiées en SQL direct, E1b-10, mais pas l'effet à l'écran ni sur le PDF) | non exécuté |
| Chaîne devis → réalisation (1/2, reprise) | Réception réelle des e-mails (devis demandé, devis reçu, mission confiée) : aucun fournisseur sur le banc, seules les traces d'échec de tech_log sont lisibles | non testable sur le banc local |
| Chaîne devis → réalisation (1/2, reprise) | Suivi côté locataire après le choix du créneau (propose, choisit, reporte, confirme la résolution) | non exécuté |
| Chaîne devis → réalisation (1/2, reprise) | Lenteur réseau (throttling) sur les écrans de devis | non exécuté |
| Chaîne intervention, facture, trace (2/2) | Conflit de créneau avec un second rendez-vous (PLANNING_CONFLITS_CONCURRENCE=1) : exige une seconde mission pour artisan.alpha dans la chaîne (consultation, devis, sélection, acceptation, créneaux) ; non exécuté faute de budget ; seule la lecture de conflit_planning_artisan a été faite | non exécuté |
| Chaîne intervention, facture, trace (2/2) | Annulation d'une mission (mission_annulee dans la chronologie de l'incident) et suppression de détention (detention_supprimee) : aucun geste correspondant dans la chaîne ; libellés non vérifiés à l'écran | non exécuté |
| Chaîne intervention, facture, trace (2/2) | Vue de supervision d'une session artisan (« Entrée dans la session d'un artisan ») : non ouverte ; l'absence de finance locative côté artisan n'est prouvée que par l'API (0 ligne ecritures, baux, factures_honoraires) | bloqué par accès ou par la limite de session |
| Chaîne intervention, facture, trace (2/2) | Avenant au devis (demander_avenant_devis / decider_avenant_devis) : refusé au locataire par RPC, mais le geste artisan puis propriétaire n'a pas été joué | bloqué par accès ou par la limite de session |
| Chaîne intervention, facture, trace (2/2) | Facture avec montant différent du devis jusqu'au bout (justification puis décision du propriétaire) : seule l'apparition du champ de justification a été vue | non exécuté |
| Chaîne intervention, facture, trace (2/2) | Lenteur réseau (throttling) sur les écrans de l'intervention et de la facture ; mobile 390x844 seulement pour le locataire (pas pour l'artisan ni le propriétaire sur cette moitié de chaîne) | non exécuté |
| Chaîne intervention, facture, trace (2/2) | Notification (e-mail) envoyée à chaque étape : aucun fournisseur sur le banc, seules les lignes de base ont été lues | non testable sur le banc local |
| Chaîne intervention, facture, trace (2/2) | Fenêtre « 14 alertes à traiter » qui recouvre la page à l'ouverture (observée sur les écrans propriétaire et supervision, a intercepté deux de mes clics) : non déterminé si elle s'ouvre à chaque chargement ou une fois par session (chaque script ouvrait une session neuve) : hypothèse à vérifier, non enregistrée comme anomalie | bloqué par accès ou par la limite de session |
| Super-administrateur | Déclenchement planifié réel : Vercel Cron (11 entrées) et pg_cron (8 tâches). Sur le banc cron.job est une table souche sans extension ni journal d'exécution, et les routes /api/cron/* répondent 401/503 faute de CRON_SECRET : horaires effectifs, reprise après échec, arrêt d'urgence en cours d'exécution d'une mission restent non… | non testable sur le banc local |
| Super-administrateur | Exécution des 8 fonctions SQL planifiées (alertes d'impayés, cycle mensuel, rétention…) : volontairement non lancées à la main, elles écrivent des alertes dans les données des autres rôles | non exécuté |
| Super-administrateur | Effet réel du blocage et du déblocage d'un compte, et de la réinitialisation du second facteur : l'émulateur répond 404 'non géré' à PUT /auth/v1/admin/users (preuve sql2/emul_ban.txt) | non exécuté |
| Super-administrateur | Appels IA (analyse du brief, veille, publications, devis IA, visuel marketing) et atelier de corrections (workflow GitHub) : ni clé OpenAI ni jeton GitHub sur le banc | non testable sur le banc local |
| Super-administrateur | « Voir comme » (usurpation d'identité) : n'existe pas par décision du porteur (la supervision entre avec sa propre identité) ; seuls la traversée (SA-01) et le diagnostic artisan en lecture seule existent et ont été testés. Pas de diagnostic en lecture seule pour un propriétaire ou un locataire | non exécuté |
| Super-administrateur | Changement d'heure (25/10 02:30) : seule la saisie d'une heure répétée a été testée (refusée) ; le passage réel d'un plan de vacances à cette date n'a pas été simulé | bloqué par accès ou par la limite de session |
| Super-administrateur | Deux superviseurs actifs en même temps (double accusé d'une même alerte, SUP-03 déjà au registre) ; réseau lent (throttling) ; session expirée en cours de saisie d'une consigne | bloqué par accès ou par la limite de session |
| Super-administrateur | Partie 'analyse IA' du brief et envoi externe d'une urgence : aucun canal externe n'existe par conception (alertes internes seulement) | non exécuté |
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
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Safari/iOS et Firefox réels (geste Retour, quotas IndexedDB, comportement de la boîte beforeunload sur mobile) : seul Chromium est installé sur le banc ; la simulation sans API Navigation est la seule trace (PR178-A-09, hypothèse). | non testable sur le banc local |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Lecteur d'écran réel (NVDA, VoiceOver) : l'annonce répétée de la région role=status n'est mesurée que dans le DOM (PR178-A-06). | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Création d'un lot avec reprise du brouillon (gerimmo:bien:v1) : le formulaire est masqué pour proprietaire@gerimmo-demo.fr (profil incomplet), brouillon lu dans le code seulement. | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Envoi complet d'un devis et conflit de révision : couverts par e2e/devis-reprise.spec.ts, non rejoués ; seule la persistance locale a été vérifiée. | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Double encaissement après réponse perdue (formulaires de formulaire-loyers.tsx) : exigerait d'écrire sur des baux de démonstration que je n'ai pas créés ; le code ne montre aucune clé d'idempotence côté client pour l'encaissement (hypothèse à vérifier par le relecteur finance). | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Réponse perdue sur la déclaration d'incident du locataire : couverte par e2e/incidents-reprise.spec.ts ; la déduplication SQL (declarer_mon_incident_reprise : verrou consultatif, même requête, même compte) n'a été que lue. | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Conflit entre deux onglets (statut « conflit » de la copie locale) et expiration à 7 jours : lecture du code seulement. | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | proxy.ts, interaction avec les contrôles de saisie de l'audit et champs mot de passe/recherche hors confirmation de sortie (points 4 et 5) : périmètre du relecteur B ; seule l'exclusion de /connexion, /inscription et /mot-de-passe-oublie a été vérifiée ici. | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Boîtes confirm() supprimées ou refusées par certains navigateurs intégrés (WebView, « empêcher les boîtes de dialogue ») : liens inopérants si formulaire modifié, hypothèse non testée. | bloqué par accès ou par la limite de session |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Lenteur réseau (throttling) sur la fenêtre de 1,5 s de departAutorise : non rejouée ; la navigation douce de Next n'est pas concernée, une navigation dure lente pourrait redemander une confirmation (hypothèse). | non exécuté |
| Relecteur PR #178 — navigateur (protection de sortie, broui… | Environ 12 des 70 formulaires adaptés ont été exercés dans le navigateur (alertes, fiche personne, incident locataire en lecture IDB, devis, client artisan, dépôt de document, filtres GET) ; les formulaires d'administration et d'agence (hors V1 publique) ne l'ont pas été. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Protection des brouillons locaux (stockage navigateur, IndexedDB, durée de vie, poste partagé, effacement à la déconnexion) : périmètre (a), non traité ici. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Interface réelle du super-administrateur (MFA aal2) : aucun formulaire /admin testé en navigateur ; 22 formulaires admin lus seulement dans le diff. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Formulaires artisan devis, facture, bilan, créneaux, photos de chantier : lus dans le diff, non exécutés (devis couvert par le parcours de la PR, non rejoué). Aucun devis envoyé. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Reprise comptable (EtatReprise sans clé succes) : même mécanisme que l'import du parc, non reproduit. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Encaissement de dépôt de garantie et écriture de compta après réponse perdue : même absence de clé d'idempotence par lecture du code, non reproduit. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Cache de la CDN Vercel pour une page publique servie avec Set-Cookie de suppression (/tarifs : s-maxage + Set-Cookie sur le banc) : non testable sur next start ; le HTML public ne contient pas de donnée de visiteur, mais l'égalité octet à octet avec la réponse d'un anonyme n'a pas été vérifiée. Hypothèse à vérifier en productio… | non testable sur le banc local |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Déconnexion globale (signOut sans scope) déclenchée par une page publique depuis un appareil à l'activité ancienne alors qu'un autre appareil est actif : raisonné sur le code, non reproduit (hypothèse à vérifier, comportement antérieur à la PR pour les pages privées). | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Retour arrière sur mobile (événement navigate, annulation de traverse) : non testé, Playwright ne simule pas le bouton Retour du navigateur. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Accessibilité de la fenêtre confirm (focus, lecteur d'écran) : boîte native du navigateur, non évaluée. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Locataire : dépôt d'attestation, incident avec photos, formulaire de congé : non exécutés. | non exécuté |
| Relecteur PR #178 — serveur, régressions, qualité des tests | Effet des contrôles de saisie sur les écritures de compta manuelles (compta.ts lireMontant) : lu dans le diff de 0555f43, non exécuté. | non exécuté |
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

123 scénarios : 87 exécutés avec succès, 25 à résultat partiel, 10 en échec, 1 non exécutés (consignés comme tels).

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

# A2 — État réel des modules : espace locataire, incidents, espace artisan

Audit en lecture seule du 22/11/2026, code de `palier1/app` (commit `e1e442dc`).

## Méthode et limites

- **Lecture du code** : pages, composants, actions serveur, bibliothèques (chemins relatifs à `app/`).
- **Base d'essai locale** (`gerimmo_ci_sql`, 996 fonctions `public`, 235 tables) interrogée en lecture :
  - les **134 RPC** appelées par les trois ensembles **existent toutes** en base ;
  - les noms de paramètres `p_*` passés en littéral correspondent aux signatures en base (comparaison automatique, aucun écart dans le périmètre) ;
  - **aucune ligne** dans les tables `incidents`, `incident_*`, `intervention_*`, `artisan*`, `invitations_artisans` : rien n'a pu être constaté sur des données.
- **Tests** : repérés par nom d'action ou de RPC dans `tests/` et `e2e/`. **Aucun test n'a été lancé, aucun serveur démarré.**
- En conséquence : **tous les états ci-dessous sont « non vérifiés en exécution »**. « FONCTIONNE » veut dire : écran câblé à une action réelle, RPC présente, test automatisé existant.
- Aucun écran du périmètre n'est une maquette : chaque page lit la base ou appelle une action. Aucun texte « bientôt » / « à venir » / TODO. Aucun lien interne mort (routes `/locataire/<id>/*` et `/artisan/*` toutes présentes).
- **Parcours sans IA** : signalement d'incident, choix de créneau et rédaction de devis se font **tous sans IA** (détail dans le tableau).

## Tableau des modules

### 1. Espace locataire

| Module | État | Preuve (fichiers, RPC, tests) | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Accueil | FONCTIONNE | `src/app/locataire/[orgId]/page.tsx:52-86` (11 RPC `mon_*`/`mes_*`), `layout.tsx:65-70`. Tests : `accueil-locataire-depot.test.ts`, `ux-locataire-priorites.test.ts`, `audit-proprietaire-locataire-ecrans.test.ts`, `e2e/parcours-locataire.spec.ts` | Rien de bloquant relevé | — |
| Mon logement et bail | FONCTIONNE | `logement/page.tsx:31-40` (`mon_bail_locataire`, `mon_depot_locataire`, `mes_infos_pratiques_locataire`, `mes_edl_locataire`), `bail/fichier/route.ts:29` (`mon_bail_document_locataire`). Test : `e2e/fenetre-lot.spec.ts` | `mes_edl_locataire` et `mes_infos_pratiques_locataire` : aucun test ne les nomme | P2 |
| Intention de congé | FONCTIONNE | `logement/carte-conge.tsx:5` → `actions/conge-locataire.ts:33` (`mon_conge_locataire`) | **Aucun test** ne nomme l'action ni la RPC. Le geste n'envoie qu'une alerte (voulu : le congé reste un recommandé) | P2 |
| Mes documents (pièces, assurance, pièces demandées, consentements) | FONCTIONNE | `documents/page.tsx:94-98` ; `formulaire-attestation.tsx:8` → `actions/attestation-locataire.ts:95` (`deposer_mon_attestation`) ; `depot-piece.tsx:4` ; `consentements.tsx:3`. Tests : `mes-documents-locataire.test.ts`, `sprint3-lo-depot.test.ts`, `e2e/attestations-refus.spec.ts`, `e2e/recommandes-consentements.spec.ts` | Si la RPC échoue après le dépôt, le fichier reste au stockage sans fiche (`attestation-locataire.ts:88-104`, pas de suppression) | P2 |
| Signature côté locataire | PARTIEL | `documents/depot-signature.tsx:7` → `actions/signature-locataire.ts:60` (`retourner_document_signe`) ; lecture `mes_demandes_signature` | Le chemin « télécharger, signer, redéposer » **ne peut plus être alimenté** : `actions/signature.ts:86-88` (`envoyerPourSignature`) rend une erreur fixe, et la RPC `envoyer_pour_signature`, seule à écrire dans `demandes_signature`, n'est plus appelée. **Aucun état de signature électronique** (Zoho) n'apparaît dans l'espace locataire. Aucun test sur `retournerDocumentSigne` | P1 |
| Mes paiements | FONCTIONNE | `loyers/page.tsx:38-51` (échéancier, restitution, retenues, relances, plan d'apurement). Tests : `e2e/parcours-locataire.spec.ts:101`, `plan-apurement-base.test.ts` | Aucun paiement en ligne : virement, IBAN affiché (voulu) | — |
| Quittance et reçu | FONCTIONNE | `src/app/quittance/[quittanceId]/page.tsx:51-70`, `document/route.ts:18-32` (refus si mention obligatoire vide). Tests : `quittance-conforme.test.ts`, `quittance-document-route.test.ts`, `quittance-introuvable-404.test.ts` | Document HTML à imprimer, pas de fichier PDF remis | P2 |
| Attestation de loyer | FONCTIONNE | `src/app/attestation-loyer/[orgId]/page.tsx:49-52` (`attestation_emetteur_locataire`), refus si loyer dû ou émetteur incomplet (`:96-140`). Tests : `ux-locataire-priorites.test.ts`, `audit-proprietaire-locataire-base.test.ts` | Ni numéro ni archivage : imprimée à la demande. L'inventaire du wiki écrit `/attestation-loyer/{id}` ; la route réelle prend l'identifiant de l'espace | P2 |
| Dépôt de garantie | FONCTIONNE | `carte-depot-garantie.tsx`, `page.tsx:85` (`ma_restitution_locataire`), `loyers/page.tsx:40-41`. Test : `accueil-locataire-depot.test.ts` | — | — |
| Signaler un problème | FONCTIONNE, **sans IA** | Formulaire `incident/formulaire-incident-locataire.tsx:11` → `actions/incidents.ts:183-316` (`declarer_mon_incident_reprise`, `joindre_photo_incident`, `marquer_incident_urgent_notifie`). Tests : `incident-declaration.test.ts`, `incidents-reprise-base.test.ts`, `incident-photos-avant-creation.test.ts`, `e2e/incidents-reprise.spec.ts`, `e2e/parcours-locataire.spec.ts:28` | Voir « Qualification et urgence ». Un locataire à deux baux actifs ne choisit pas le logement : la base prend le plus récent (`declarer_mon_incident`, `order by created_at desc limit 1`) | P2 |
| Mes demandes (suivi, créneaux, report, annulation, contestation, note) | FONCTIONNE, **sans IA** | `demandes/page.tsx:41-54` ; `actions/incidents-locataire.ts:56,94,163,219,284,326` (`choisir_creneau`, `contre_proposer_creneaux`, `noter_artisan_locataire`, `demander_report_rdv`, `annuler_rdv_locataire`, `retirer_demande_rdv`). Tests : `sprint7-locataire-intervention.test.ts`, `rendez-vous-locataire*.test.ts`, `contre-proposition-locataire-action.test.ts`, `creneaux-locataire.test.ts`, `e2e/local/fuite-trois-acteurs.ts:151-166` | — | — |
| Contact et messagerie | FONCTIONNE | `contact/page.tsx:36-38`, `contact/fil-messages.tsx:6` → `actions/messages.ts:37` (`envoyer_message_locataire`). Tests : `commandes-locataire-hydratation.test.ts`, `messagerie-lecture.test.ts` | La RPC `envoyer_message_locataire` n'est nommée par aucun test. L'assistant IA (`contact/page.tsx:116`) est un complément : le fil fonctionne sans lui | P2 |
| Relevés de compteurs | FONCTIONNE | `releves/page.tsx`, `components/releves-locataire.tsx:5` → `actions/consommations.ts:178-194`. Test : `consommations-base.test.ts` | La lecture de photo par IA est facultative ; l'index se saisit à la main | — |
| Règles et FAQ | FONCTIONNE | `regles/page.tsx`, `faq/page.tsx` | FAQ : texte écrit dans le code, aucun test | P2 |
| Invitation du locataire | FONCTIONNE | `actions/invitations.ts:17,36,48`, `src/app/invitations/[invitationId]/page.tsx:18`. Tests : `invitations-actions.test.ts`, `invitations-cycle.test.ts`, `relances-invitations-locataires.test.ts`, `e2e/invitations-cycle.spec.ts`, `e2e/lot2-invitations.spec.ts` | La RPC `inviter_locataire` reste en base sans appelant | P2 |

### 2. Incidents de bout en bout

| Module | État | Preuve (fichiers, RPC, tests) | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Déclaration par le gestionnaire | FONCTIONNE, en double | (a) `agence/[orgId]/incidents/nouveau/formulaire-incident.tsx:5` → `actions/incidents.ts:381` (`ouvrir_incident_agence`) ; (b) `components/declaration-incident-bien.tsx:3` → `actions/incident-bien-simple.ts:15` (`declarer_incident_bien_simple`). Tests : `incident-gerant-colocation-base.test.ts`, `e2e/incident-gerant-colocation.spec.ts` | **Deux chemins** : (b) force la catégorie « autre » et l'urgence « normale ». Aucune alerte de doublon (référentiel module 7, variante V4) | P2 |
| Qualification et urgence | PARTIEL | `actions/incidents.ts:443-480` (`qualifier_incident` : imputation et justification). Tests : `sprint7-incidents.test.ts`, `incidents-portefeuille-agent.test.ts`, `repere-juridique-qualification.test.ts` | **L'urgence ne se corrige jamais** : aucune fonction de la base ne modifie `incidents.urgence` après la déclaration. Deux niveaux en base (`normale`, `urgente`) contre trois au référentiel (Urgent, Prioritaire, Normal). Pas de numéro d'astreinte de l'agence : seuls le 112 et le numéro gaz, écrits dans le code (`locataire/[orgId]/reflexes-urgence.tsx:36,43`) | P1 |
| Liste et fiche côté bailleur | FONCTIONNE | `agence/[orgId]/incidents/page.tsx:100-130`, `pane-incident.tsx:108-122`, `[incidentId]/page.tsx:17` (redirection vers `?sel=`). Tests : `incidents-liste-a-traiter.test.ts`, `incidents-portefeuille-agent.test.ts` | — | — |
| Demande et sélection de devis | PARTIEL | `actions/incidents.ts:657,704,740,776,826` (`ouvrir_consultation`, `solliciter_artisan`, `retenir_devis`, `refuser_devis`, `demander_revision_devis`). Tests : `devis-decisions-concurrence.test.ts`, `devis-refus-motive.test.ts`, `devis-revision-versions.test.ts`, `devis-a-decider-alerte.test.ts`, `fuite-trois-acteurs.ts:46-133` | **Le seuil de délégation du mandat n'est jamais contrôlé** : `mandats.seuil_delegation` est saisi (`actions/mandats.ts:31-40`) et imprimé dans le mandat, mais aucune fonction de la base ne le lit ; `retenir_devis` ne vérifie que l'expiration et la décennale. Le référentiel (RM-9.4.2) en fait un blocage. Sans objet pour un propriétaire en gestion directe | P0 à l'ouverture aux agences (risque légal), sinon P2 |
| Signature du devis par le propriétaire | FERMÉ PAR DRAPEAU | `incidents/volet-artisan.tsx:1159` : `ZOHO_SIGN_DEVIS_ACTIF` ou organisation d'essai ; sinon bouton « Retenir ce devis ». Tests : `signature-devis.test.ts`, `signature-devis-base.test.ts` | `.env.example:260` : `false` par défaut | P2 |
| Planification et rendez-vous | FONCTIONNE, **sans IA** | Artisan : `actions/artisan.ts:459,545,574` (`proposer_creneaux`, `accepter_creneau_locataire`, `refuser_creneaux_locataire`) ; locataire : voir « Mes demandes » ; gérant : `actions/incidents.ts:871` (`fixer_creneau_arbitrage_motive`) ; rappels : `lib/missions-planifiees/rappels.ts:97-252`. Tests : `planning-conflits*.test.ts`, `validation-creneaux.test.ts`, `creneaux-non-retenus-caducs.test.ts`, `relances-reports-rdv.test.ts`, `rappel-rendez-vous.test.ts`, `fuite-trois-acteurs.ts:138-173` | Le wiki dit encore que la relance, l'accusé d'annulation et le parcours en navigateur manquent : le code les a (`missions/[interventionId]/accuse-annulation.tsx`, `lib/relances-reports-rdv.ts`) | P2 (wiki) |
| Intervention (démarrage, photos, compte rendu, avenant) | FONCTIONNE | `actions/artisan.ts:521,739,800,856` (`demarrer_intervention`, `deposer_photo_intervention`, `deposer_compte_rendu`, `demander_avenant_devis`) ; `actions/incidents.ts:1042` (`decider_avenant_devis`). Tests : `sprint7-artisans.test.ts`, `chronologie-ecart-rendez-vous.test.ts`, `e2e/artisan-fin-mission.spec.ts` | Ni rapport d'intervention en PDF ni saisie de matériaux, que le wiki décrit encore | P2 (wiki) |
| Facture d'intervention : dépôt, contrôle, règlement | PARTIEL | Dépôt : `actions/artisan.ts:632-724` (`deposer_facture_artisan`) ; contrôle : `incidents/validation-facture.tsx:4` → `actions/incidents.ts:1062` ; règlement déclaré : `incidents/reglement-facture.tsx:4` → `actions/reglement-facture.ts`. Tests : `reglement-facture*.test.ts`, `facture-intervention-particulier.test.ts`, `e2e/artisan-fin-mission.spec.ts` (3 modes) | **Impasse si la facture est fausse** : une seule facture par intervention (index unique `intervention_factures_intervention_id_key`), le gérant ne peut que valider ; ni refus, ni remplacement, ni avoir (aucune fonction ne supprime ou ne remplace une ligne). Le référentiel prévoit « l'agent la refuse, l'artisan la corrige » (module 9, V5). Pas de créance sur le locataire à la validation (écart connu, D23-A) | P1 |
| Clôture, réouverture, révision d'imputation | FONCTIONNE | `actions/incidents.ts:488,519,929,351` (`cloturer_incident`, `rouvrir_incident`, `reviser_imputation_apres_diagnostic`). Tests : `sprint7-incidents.test.ts`, `incidents-portefeuille-agent.test.ts` | — | — |
| Notation | PARTIEL | Gérant : `actions/incidents.ts:1005` (`evaluer_artisan_gerant`) ; locataire : `actions/incidents-locataire.ts:179` ; artisan : `artisan/note/page.tsx` (`ma_note_artisan`). Test : `sprint7-artisans.test.ts` | L'écran artisan promet « une évaluation retirée est exclue du calcul » (`note/page.tsx:43`), mais la RPC `retirer_evaluation` **n'est appelée par aucun écran** ; la contestation n'ouvre qu'une demande d'assistance (`note/contestation.tsx:10`). « Les rendez-vous manqués ne sont pas encore mesurés » (`note/page.tsx:38`) | P1 |
| Messagerie d'intervention (propriétaire, locataire, artisan) | PARTIEL | `components/echanges-intervention.tsx:6-12`, `actions/echanges-intervention.ts:13-14` (`envoyer_message_intervention`, `fermer_echange_intervention`). Affichée dans `locataire/[orgId]/demandes/page.tsx:147`, `artisan/missions/[interventionId]/page.tsx:478`, `incidents/volet-artisan.tsx:560,875` | **Aucune notification** : la fonction n'écrit que le message (ni alerte, ni e-mail, ni compteur de non-lus). Discussion fermée dès que l'intervention est terminée. **Aucun test** : les deux tests qui citent le composant le remplacent par un vide (`audit-oct28-rendu.test.ts:117`, `rendez-vous-anticipe.test.ts:408`) | P1 |
| Photos | FONCTIONNE | Locataire et gérant : `actions/incidents.ts:85-164,573` (5 au plus, JPEG ou PNG, anti-doublon) ; artisan : `actions/artisan.ts:739` ; lecture : `artisan/missions/[interventionId]/photos/[documentId]/route.ts`. Tests : `photos-incident-reprise.test.ts`, `photos-demande-artisan.test.ts` | — | — |

### 3. Espace artisan

| Module | État | Preuve (fichiers, RPC, tests) | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Inscription | FONCTIONNE | `artisan/inscription/formulaire-compte.tsx:7`, `formulaire-inscription.tsx:9` → `actions/artisan.ts:184-227` (`inscrire_mon_entreprise_artisan`) ; validation : `actions/supervision-artisans.ts:44`. Tests : `sprint7-artisans.test.ts`, `supervision-artisans*.test.ts`, `e2e/lot2-artisan.spec.ts` | SIRET contrôlé sur sa forme seulement (14 chiffres, `artisan.ts:200`) ; la vérification est une case cochée par la supervision (`supervision-artisans.ts:35`), sans appel à un registre | P2 |
| Invitation par un propriétaire | PARTIEL | `actions/invitations-artisan.ts:70-190`, `artisan/invitation/[invitationId]/page.tsx:30`, `agence/[orgId]/artisans/invitations-artisan.tsx`. Tests : `invitation-artisan-*.test.ts` (6 fichiers), `renvoi-invitation-concurrence.test.ts`, `e2e/invitation-artisan.spec.ts` | **Réservée au propriétaire en gestion directe** (`invitations-artisan.ts:77,117,138`). Une agence crée une fiche (`agence/[orgId]/artisans/actions.ts:53-82`) mais n'a **aucun envoi d'invitation** : l'artisan doit s'inscrire seul et réclamer la fiche par son SIRET | P1 pour les agences |
| Mon entreprise | FONCTIONNE | `artisan/entreprise/reglages-entreprise.tsx:12` (`artisan_definir_metiers_zones`, `definir_ma_visibilite`), `documents-entreprise.tsx:6` → `devis/actions-preparation.ts:61-86`. Tests : `reseau-zone-artisan-*.test.ts`, `reseau-presence-artisan.test.ts` | Les mentions légales sont un texte libre facultatif (`actions-preparation.ts:69`) | voir Devis |
| Attestations | FONCTIONNE | `artisan/attestations/formulaire-piece.tsx:10` → `actions/artisan.ts:290-352` (`deposer_ma_piece_artisan`). Tests : `sprint7-artisans.test.ts`, `e2e/attestations-refus.spec.ts` | — | — |
| Accueil, sollicitations, missions | FONCTIONNE | `artisan/acces.ts:213-330` (10 RPC de lecture), `missions/[interventionId]/accepter-refuser.tsx:10` → `actions/artisan.ts:392,413`. Tests : `sprint7-artisans.test.ts`, `lot2-mission-notification.test.ts`, `e2e/parcours-artisan.spec.ts` | — | — |
| Devis : rédaction, lignes, PDF, versions, envoi | FONCTIONNE techniquement, **sans IA obligatoire** ; mentions PARTIELLES | `devis/[sollicitationId]/formulaire-devis.tsx:10-11`, `devis/actions-preparation.ts:20,39,88`, `api/devis/[sollicitationId]/pdf/route.ts:17-132`, `lib/documents/devis-artisan.ts`, `lib/devis-structure.ts:94-121`. Sans clé IA, repli sur le catalogue (`lib/proposition-devis-ia.ts:37-67`), saisie manuelle toujours possible. Tests : `proposition-devis.test.ts`, `devis-structure.test.ts`, `devis-document.test.ts`, `devis-envoi.test.ts`, `devis-assiste-base.test.ts`, `devis-pdf-versions-oct16.test.ts`, `e2e/devis-reprise.spec.ts` | **Mentions non garanties** : référence `DEV-` suivie de 8 caractères de l'identifiant, sans série (`devis-artisan.ts:14`) ; mentions de l'entreprise facultatives (`:40`) ; TVA à 0 % admise (`devis-structure.ts:13`) sans mention de franchise imposée ; ni assureur ni décennale en champ dédié ; ni caractère gratuit ou payant ; destinataire sans adresse ; lieu réduit à la commune (`:42`). **Pas d'acompte.** Catalogue de 4 repères de prix écrits dans le code, dont 2 de peinture **inatteignables** (`proposition-devis-ia.ts:31` cherche « peinture » dans la catégorie d'incident ; aucune catégorie ne le contient, `lib/incidents.ts:240-314`) | P0 à arbitrer (risque légal, à faire valider par un juriste) ; catalogue P2 |
| Facturation des missions | PARTIEL | `missions/[interventionId]/facture/formulaire-facture.tsx:6` → `actions/artisan.ts:632-724` ; PDF créé : `lib/documents/facture-intervention.ts:23-62`. Tests : `facture-intervention-particulier.test.ts`, `suivi-facturation-artisan.test.ts`, `ux-facturation-artisan.test.ts` | Numéro **saisi à la main** (`facture-intervention.ts:24`) : unicité par artisan garantie en base (`reserver_numero_facture_artisan`) pour une facture créée, pas la continuité de la série ; deux factures **déposées** peuvent porter le même numéro. Mentions de TVA et d'entreprise en texte libre obligatoire mais non contrôlé (`:30`). Pas d'acompte. Voir l'impasse « facture fausse » ci-dessus | P0 à arbitrer (risque légal) |
| Clients externes, chantiers, devis, factures, avoirs, règlements | FONCTIONNE | `artisan/clients/actions.ts:28-77` (`artisan_externe_ecrire`, `artisan_reglement_ecrire`), `lib/artisan-prive.ts:16-19`, `api/artisan-prive/export/route.ts`. Activation : `lib/artisan-activation.ts:6-15` et table `artisan_modules_locaux` (les deux modules à vrai en base). Tests : `artisan-externe-*.test.ts`, `artisan-avoir-*.test.ts`, `artisan-prive-*.test.ts`, `export-artisan-complet.test.ts`, `e2e/parcours-artisan.spec.ts:92,136` | La facture externe est un fichier **déposé** avec son numéro, non créé par Gerimmo. Le menu affiche « Clients externes » même module fermé (`artisan/layout.tsx:160,201`) | P2 |
| Agenda | FONCTIONNE | `artisan/agenda/page.tsx` (`mon_agenda_artisan`). Tests : `artisan-agenda-jour-paris.test.ts`, `e2e/parcours-artisan.spec.ts:64` | — | — |
| Note | PARTIEL | Voir « Notation » | Voir « Notation » | P1 |
| Panne et règles | FONCTIONNE | `artisan/panne/page.tsx`, `artisan/regles/page.tsx:26`. Tests : `e2e/parcours-artisan.spec.ts`, `e2e/finalisation.spec.ts` | — | — |
| Réseau d'artisans et carnet | FONCTIONNE | `agence/[orgId]/reseau/page.tsx` (`reseau_disponibilite`, `artisans_disponibles_bien`), `actions/reseau.ts`, `agence/[orgId]/artisans/actions.ts:82-198`. Tests : `reseau-couverture.test.ts`, `reseau-zone-artisan-rejeu.test.ts`, `liste-noire-locale-relation.test.ts`, `e2e/reseau-couverture.spec.ts` | Liste noire globale posable en base seulement, sans écran (le wiki le dit) | P2 |
| Paiement | SANS OBJET | Aucun paiement en ligne dans les trois ensembles. Règlements **déclarés** des deux côtés : `intervention_facture_reglements` (client) et `artisan_reglements` (artisan) | Deux registres déclaratifs que rien ne rapproche | P2 |

## Doubles, abandons, contradictions

**Code en double**

- Deux déclarations d'incident côté gestionnaire : `src/app/actions/incidents.ts:381` et `src/app/actions/incident-bien-simple.ts:9`.
- Deux actions de même nom dans deux fichiers :
  - `deposerMaPiece` : `src/app/actions/artisan.ts:290` et `src/app/actions/pieces-demandees.ts:133` ;
  - `proposerMesCreneaux` : `src/app/actions/artisan.ts:459` et `src/app/actions/incidents-locataire.ts:94`.
- Même calcul d'heure de Paris écrit deux fois, et le commentaire le dit (« jumelle ») : `src/app/actions/incidents.ts:619` et `src/app/locataire/[orgId]/demandes/creneaux.ts:44-52` (`instantParis`).

**Code abandonné**

- `deposerMonDevis` (`src/app/actions/artisan.ts:376-384`) : aucun appelant, aucun test.
- `envoyerPourSignature` (`src/app/actions/signature.ts:86-88`) : coquille qui rend une erreur ; seul un test l'appelle. Elle laisse orphelins `depot-signature.tsx`, `signature-locataire.ts` et le compteur de signatures du menu (`locataire/[orgId]/layout.tsx:70,123`).
- Fonctions de la base sans aucun appelant (ni écran, ni autre fonction, ni politique) : `retirer_evaluation`, `reseau_rattacher_artisan`, `reseau_regler_ouverture` (règle supplantée le 23/10), `inviter_locataire`, `mon_dossier_locataire`, `lire_devis_structure`, `artisans_affectables`, `ma_session_artisan`, `noter_envoi_invitation_artisan`.

**Modules fermés par un drapeau**

- Signature du devis : `ZOHO_SIGN_DEVIS_ACTIF` (`volet-artisan.tsx:1159`).
- Clients externes et règlements de l'artisan : `lib/artisan-activation.ts:6-15` et `artisan_modules_locaux` (ouverts en base).

**Contradictions entre écran et base**

- Écran artisan « une évaluation retirée est exclue du calcul » sans geste de retrait (`artisan/note/page.tsx:43`).
- Seuil de délégation saisi et imprimé, jamais appliqué (`actions/mandats.ts:31-40`, `lib/documents/modeles/mandat-gestion.ts:164` : 500 € par défaut).
- Repères de peinture du catalogue jamais proposés (`lib/references-prix-travaux.ts`, `lib/proposition-devis-ia.ts:31`).

**Données écrites dans le code**

- Numéros d'urgence : `locataire/[orgId]/reflexes-urgence.tsx:36,43`.
- Catalogue de prix et ses adresses de source : `lib/references-prix-travaux.ts:4-13`.
- Modèle d'IA par défaut `gpt-5.6-luna` : `lib/proposition-devis-ia.ts:47`, `lib/conversation-privee-ia.ts:17` (validité du nom à confirmer).

**Wiki en retard sur le code**

- `wiki/processus/Planification d'intervention.md` (lignes 133-144) : annonce comme non livrés la relance, l'accusé d'annulation et le parcours en navigateur.
- `wiki/processus/Intervention et clôture.md` (étapes 1 à 5) : décrit l'ancien code (rapport PDF, matériaux, note à cinq critères).

**Hors périmètre, à transmettre**

- `src/lib/stripe-evenements.ts:411,431` appelle `abonnement_defaut_a_regulariser` et `abonnement_regulariser_facture`, absentes du schéma `public`. La migration `20261116201034` les traite comme des noms d'action d'un aiguilleur : à confirmer par l'auditeur de l'abonnement.

## À vérifier en exécution

1. **Chaîne complète à trois acteurs** : rejouer `e2e/artisan-fin-mission.spec.ts` (qui enchaîne `e2e/local/fuite-trois-acteurs.ts`) sur le banc local : déclaration, prise en charge, devis PDF, sélection, créneaux, report, démarrage, photo, bilan, facture dans les trois modes, réception. Ces tests sont sautés sans `SUPALOCAL_DB`.
2. **Facture fausse** : l'artisan dépose une facture au mauvais montant ; côté gérant, chercher un geste de refus ; côté artisan, tenter un second dépôt. Attendu d'après le code : « La facture de cette intervention a déjà été déposée », sans issue.
3. **Urgence** : le locataire déclare « urgent » à tort ; chercher côté gérant un moyen de repasser en « normal ». Attendu : aucun.
4. **Seuil du mandat** : agence avec mandat à 300 € ; un agent retient un devis à 900 €. Attendu d'après le code : accepté sans accord du propriétaire.
5. **Messagerie d'intervention** : l'artisan écrit sur une mission planifiée ; vérifier ce que voient le locataire et le gérant sans ouvrir la fiche (attendu : rien, ni badge ni e-mail) ; puis terminer l'intervention et tenter d'écrire.
6. **Devis sans mentions** : artisan dont la fiche n'a que l'adresse ; valider un devis à TVA 0 % ; lire le PDF (mention de franchise, assurance, référence).
7. **Devis sans IA** : sans `OPENAI_API_KEY`, ouvrir une demande de catégorie « serrurerie » ; attendu : une ligne « Prestation à préciser », saisie libre possible.
8. **Agence et artisan sans compte** : une agence crée une fiche puis sollicite cet artisan ; vérifier qu'il peut répondre (e-mail reçu, réclamation par SIRET avec la même adresse).
9. **Document à signer** : en base de production, compter les lignes de `demandes_signature` non signées ; s'il n'y en a aucune, la carte « À signer » du locataire est du code mort.
10. **Locataire à deux baux actifs** dans le même espace : déclarer un incident et vérifier sur quel logement il est rattaché.
11. **Dépôt interrompu** : provoquer un refus de `deposer_mon_attestation` (même fichier deux fois) et vérifier si le premier fichier envoyé reste au stockage.

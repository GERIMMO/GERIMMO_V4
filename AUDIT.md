# AUDIT — Gerimmo, palier 1

**Date : 22 novembre 2026. Version auditée : `e1e442dc` (branche `claude/palier-1-preproduction`, identique à `main`).**
**Rien n'a été modifié pendant cet audit** : ni code, ni base, ni production.

> **État de ce document : première version.** Les sites officiels (Légifrance, service-public, ANIL, CNIL, INSEE) et
> les sites des plateformes de référence sont **refusés par la règle réseau de mon environnement de travail**. Les
> volets b) et c) reposent donc sur des extraits de recherche, pas sur les textes ouverts. En conséquence :
> **aucun point juridique n'est noté « conforme »**, et tout écart juridique est marqué « à confirmer à la source ».
> Une seconde lecture, textes ouverts, est nécessaire avant de corriger ces points (voir QUESTIONS.md, Q5).

## En une page

**Ce qui tient.** Le cœur de Gerimmo fonctionne : parc, baux (création, contrat, activation par le contrat signé),
états des lieux, loyers, encaissements, quittances, dépôt de garantie, documents, messagerie, espace locataire,
chaîne complète d'un incident (signalement, devis, rendez-vous, intervention, clôture), espace artisan, console du
super admin. Aucun écran n'est une simple maquette. Aucune fonction appelée par un écran n'est absente de la base.
Le contrôle automatique complet est vert sur cette version (run 45013333857 : lint, types, construction, environ
13 200 tests, parcours navigateur par profil, téléphone compris).

**La sécurité de base est bonne, et c'est prouvé.** Les 227 tables ont leur cloisonnement actif ; un compte d'une
organisation ne voit aucune ligne d'une autre (sonde sur 108 tables) ; aucun secret dans le dépôt ; aucune fonction
ouverte aux visiteurs anonymes. Aucun défaut de sécurité grave n'a été trouvé.

**Ce qui ne va pas, par ordre de gravité.**

1. **Un risque d'argent compté deux fois** : un complément de charges payé par l'échéancier pourrait être retenu une
   seconde fois sur le dépôt de garantie à la sortie. À confirmer en rejouant le cas, puis à corriger (P0).
2. **Des écarts juridiques probables**, tous à confirmer sur les textes ouverts : la notice d'information annexée au
   bail est un résumé maison et non le texte officiel ; les congés du bailleur pour vente ou pour reprise n'ont pas
   toutes leurs mentions obligatoires ; les charges de copropriété sont classées « récupérables » par mots-clés, avec
   des erreurs démontrées ; le bailleur peut demander n'importe quelle pièce à un candidat, RIB compris ; une retenue
   sur dépôt peut être figée sans justificatif ; l'état des lieux de sortie n'imprime pas la date de l'entrée.
3. **Deux envois de données à OpenAI ne sont pas déclarés** dans la page de confidentialité : l'assistant
   « Demander à Gerimmo » et la lecture assistée de factures (qui envoie le fichier entier).
4. **Des fonctions fermées ou cassées** : la signature électronique d'un bail avec garant ne part plus ; la reprise
   comptable se bloque après un rechargement ; une facture d'artisan erronée ne peut être ni refusée ni remplacée ;
   l'urgence d'un incident ne se corrige jamais ; les avis d'échéance, relances et rappels de rendez-vous sont codés
   mais leur envoi est suspendu.
5. **L'IA** : le cœur du métier ne dépend pas de l'IA (l'incident se signale déjà par formulaire, le créneau se
   choisit déjà à la main). Mais aucun réglage ne permet aujourd'hui de couper l'IA proprement, et deux fonctions de
   la console (article, posts automatiques) n'ont pas de chemin sans IA.
6. **Par rapport aux plateformes de référence**, l'écart principal n'est pas un manque de fonctions : ce sont ces
   envois suspendus, la signature électronique fermée, l'absence de photos à l'état des lieux, et quelques outils de
   l'artisan (semaine type, lignes de devis réutilisables, numérotation des factures).

**Ce que je ne peux pas régler par du code** (voir QUESTIONS.md et JURISTE.md) : l'adhésion à un médiateur de la
consommation, la copie hors GitHub de la clé des sauvegardes, les accords de traitement avec les prestataires, le
choix d'un antivirus, et tous les points à faire relire par un juriste.

---

## 0. Méthode : ce qui est vérifié, ce qui est supposé

| Niveau de preuve | Ce que cela veut dire | Où il s'applique |
|---|---|---|
| **Prouvé par exécution** | Contrôle automatique vert sur la version exacte (run 45013333857, 22/11, 11:12 UTC) ; requêtes sur la base d'essai ; avis de sécurité de la base de production lus le 22/11. | Construction, types, tests, parcours navigateur couverts, cloisonnement des tables. |
| **Lu dans le code** | Le fichier et la ligne ont été lus ; le comportement n'a pas été rejoué à la main. | L'essentiel du volet a) : chaque défaut signalé reste « à confirmer en exécution » avant correction. |
| **Lu sur un extrait de recherche** | La règle vient d'un résultat de recherche citant un site officiel, pas du texte ouvert. | Tout le volet b) et le volet c). |
| **Supposé** | Déduction, signalée comme telle. | Marqué dans le texte. |

Huit relevés détaillés, avec fichiers, lignes, requêtes et sources, sont dans le dossier `audit-palier-1/` :
`a1-modules-bailleur.md`, `a2-modules-locataire-incidents-artisan.md`, `a3-super-admin-securite.md`,
`b1-bail-loi-1989.md`, `b2-edl-charges-pieces.md`, `b3-rgpd-flux-financiers.md`, `c-ecart-fonctions.md`,
`d-dependance-ia.md`, plus `prod-advisors-securite.md` (avis de sécurité de la production).

**Périmètre.** Palier 1 : propriétaire bailleur en gestion directe, locataires, artisans, incidents, gestion
administrative, super admin. Les agences (palier 2) sont hors périmètre ; ce qui ne concerne qu'elles est noté
« palier 2 » et n'entre pas dans le plan.

**État de la production au 22/11** : gelée, version du 21/11 (`81740dec`). Le lot #357 est dans le code, non publié.

---

## a) État réel de chaque module

Légende : **FONCTIONNE** = écran, actions et base reliés, couverts par des tests ; **PARTIEL** = relié mais un
geste manque, ou un envoi est fermé ; **CASSÉ** = un geste ne peut pas aboutir ; **MAQUETTE** = écran sans effet.
**Aucun module n'est une simple maquette.**

### a.1 Espace du propriétaire bailleur et gestion administrative

| Module | État | Comment c'est établi | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Charges : régularisation annuelle | PARTIEL, avec risque de double comptage | Code lu ; tests automatisés : `regularisation-fournitures.test.ts`, `echeanciers-charges.test.ts` | Double comptage probable : un complément reçu par l'échéancier s'écrit dans `ecritures` (`agir_echeancier_charges`), jamais dans `encaissements` ; or le décompte de sortie (`montants_reels_bail`, redéfini le 12/11, migration `20261112120300`) ajoute `sum(regularisations_charges.ecart)` à la dette et n'en retranche que… | P0 (à confirmer en… |
| Cautions et garanties | PARTIEL — signature électronique CASSÉE | Code lu ; tests automatisés : `signature-caution-mobile.test.ts`, `signature-caution-assemblage.test.ts`, `mention-caution.test.ts` | Le lien envoyé au garant part sans `contexteMetier` (`lib/confirmation-mobile-caution.ts:198`) : il est suspendu par la liste fermée, et l'action répond « Le lien est prêt, mais l'e-mail n'est pas parti ». La liste fermée date du 10/11 (#285), le circuit du 24/10. Le test simule `@/lib/email`… | P1 |
| Bail : signature électronique | PARTIEL (cassée dès qu'il y a un garant) | Code lu seulement, aucun test trouvé | Bail avec garant : `envoyerSignatureBail` attend que chaque garant confirme son mobile par le lien ci-dessus, qui ne part pas (`actions/signature-bail.ts:196-216`). Bail sans garant : non vérifié en exécution. Repli qui fonctionne : signature papier puis dépôt du PDF. | P1 |
| Comptabilité : reprise des comptes (balance d'ouverture) | CASSÉ en cas de reprise interrompue | Code lu ; tests automatisés : `reprise-comptable.test.ts` | L'identifiant de la reprise ouverte ne vit que dans l'état du formulaire (`formulaire-reprise.tsx:84`). Après un premier « Contrôler », un rechargement le perd ; le clic suivant rappelle `ouvrir_reprise`, qui refuse (« une reprise est deja en cours »). La page lit les reprises (`page.tsx:35-48`) mais n'en retient que la… | P1 |
| Loyers : mise en demeure | PARTIEL | Code lu ; tests automatisés : `recommandes-consentements.spec.ts` | L'envoi AR24 exige une ligne `connexions_ar24` par espace (`actions/recommandes.ts:39-43`). Cette table est en lecture seule pour le bailleur (migration `20261028150004:38-41`) et aucun écran ni action ne l'écrit : seul l'opérateur peut la remplir (`docs/recommandes-ar24.md:11`). Table vide sur la base d'essai. | P1 |
| Loyers : relances | PARTIEL | Code lu ; tests automatisés : `relances-loyer-auto.test.ts`, `paliers-reception-loyer.test.ts`, `reception-loyer-proprietaire.spec.ts` | Aucun e-mail de relance ne part : envoi manuel masqué (`components/rappels-loyers.tsx:18`), envoi automatique suspendu (`lib/missions-planifiees/relances.ts:161-196`). L'écran le dit (`formulaire-profil.tsx:365`). `envoyerRelanceReception` (`actions/reception-loyer.ts:86-153`) est donc du code dormant. | P1 |
| Bail : avenant | PARTIEL | Code lu seulement, aucun test trouvé | Texte libre mis en PDF, sans effet sur le bail. Un bail actif ne se modifie pas (`actions/baux.ts:258-260`) et `devalider_bail` renvoie « passez par un avenant ou un congé » dès qu'un loyer est appelé : provision, colocataire ou échéance ne peuvent plus changer dans la base. | P1 |
| Loyers : révision IRL | PARTIEL | Code lu ; tests automatisés : `sprint4-bail.test.ts` | Indice saisi à la main à chaque révision : pas de table d'indices (RM-3.8.3), alors que l'outil public lit la série INSEE (`lib/outils/irl-insee.ts`, `app/outils/calcul-irl/page.tsx:4`). Aucune alerte d'anniversaire ni de prescription (attendues : `GERIMMO-V3-Module-14…md:51-52`) ; les tâches `pg_cron` ne couvrent… | P1 |
| Loyers : échéancier et appels | PARTIEL | Code lu ; tests automatisés : `cycle-mensuel.test.ts`, `prorata.test.ts` | L'avis d'échéance par e-mail est suspendu (`lib/missions-planifiees/appels.ts:138,154` ; dit à l'écran, `formulaire-profil.tsx:336`). Le PDF `avis-echeance` reste disponible. | P2 |
| Abonnement | PARTIEL | Code lu ; tests automatisés : `abonnement.spec.ts`, `blocage-souscription.spec.ts` | Souscription fermée tant que `GERIMMO_MODE` n'est pas `commercial` et que les ventes ne sont pas ouvertes (`actions/abonnement.ts:250`, `lib/verrou-pilote.ts:2-17`) ; médiateur exigé (`lib/garde-souscription.ts:71`). Paiement jamais exercé en réel (audit du 19/11). Aucun parcours navigateur sur résiliation ni rétractation. | P1 avant vente, P2 pour le… |
| Récapitulatif fiscal | PARTIEL | Code lu ; tests automatisés : `fiscalite-qualifiee.spec.ts` | Aide à la déclaration 2044 (location nue, réel) uniquement. Meublé (BIC) et SCI sont exclus et renvoyés à d'autres déclarations (`recapitulatif-fiscal.tsx:350-366,461-463`). Seuil 15 000 € et abattement 30 % écrits en dur dans le texte. | P2 |
| Agenda | PARTIEL | Code lu ; tests automatisés : `agenda-gestion.test.ts` | Calendrier en lecture des seules interventions d'artisans. Ni échéance de loyer, ni état des lieux, ni fin de bail, ni création de rendez-vous. | P2 |
| Statistiques | PARTIEL, non lié pour le propriétaire | Code lu seulement, aucun test trouvé | Absent du menu du propriétaire (`lib/navigation-espace.ts:113-134`) et de tout lien : atteignable par adresse seulement. Ne mesure ni loyers ni occupation. | P2 |
| Fermeture de compte | PARTIEL (par conception) | Code lu ; tests automatisés : `fermeture-compte-action.test.ts` | Le bailleur ne ferme pas son compte lui-même : il dépose une demande, traitée à la main par le super admin. | P2 |
| Dépôt de garantie et restitution | FONCTIONNE | Code lu ; tests automatisés : `sprint3-lo-depot.test.ts`, `sprint8-restitution.test.ts`, `retenue-justificatif.test.ts` … | L'écran promet un « décompte rectificatif » après finalisation (`formulaire-restitution.tsx:838-841`) : aucun geste ne le produit (une restitution par bail). Le versement effectif n'est pas daté : l'écriture porte la date de finalisation. Barème de vétusté en dur (`formulaire-restitution.tsx:70-81`). Voir aussi le double… | P1 |
| Bail : création et contrat | FONCTIONNE | Code lu ; tests automatisés : `sprint4-bail.test.ts`, `brouillon-bail-saisie.spec.ts`, `premiere-location-continue.spec.ts` | `creerBail` en double (voir plus bas). | P2 |
| Bail : activation par contrat signé papier | FONCTIONNE | Code lu ; tests automatisés : `depot-bail-signe-papier.spec.ts`, `bail-signe-non-actif.spec.ts` | Rien relevé. | — |
| Bail : congé et sortie | FONCTIONNE | Code lu ; tests automatisés : `sprint4-comparatif-conges.test.ts`, `conge-date-presentation.test.ts` | Aucun parcours navigateur ne joue un congé. | P2 |
| États des lieux | FONCTIONNE | Code lu ; tests automatisés : `sprint4-edl.test.ts`, `edl-brouillon.spec.ts` | Signature électronique de l'EDL dépendante de `ZOHO_SIGN_DOCUMENTS_ACTIF` : non vérifiée. | P2 |
| Encaissements | FONCTIONNE | Code lu ; tests automatisés : `encaissement-reste.spec.ts`, `reception-loyer-proprietaire.spec.ts` | Listes de modes de règlement différentes selon la porte (voir contradictions). | P2 |
| Quittances et reçus | FONCTIONNE | Code lu seulement, aucun test trouvé | Rien relevé. | — |
| Comptabilité : livre, saisie, clôture | FONCTIONNE | Code lu ; tests automatisés : `comptabilite-vues.test.ts`, `finances.test.ts`, `comptabilite-vues.spec.ts` | Rien relevé. | — |
| Comptabilité : export | FONCTIONNE | Code lu ; tests automatisés : `export-journal-pagination.test.ts`, `csv-sur.test.ts` | Ce n'est pas un FEC (dit en tête du fichier, ligne 9). | P2 |
| Parc et lots | FONCTIONNE | Code lu ; tests automatisés : `sprint2-parc.test.ts`, `import-parc.test.ts`, `creation-bien-reprise.spec.ts` … | Rien relevé. | — |
| Diagnostics | FONCTIONNE | Code lu ; tests automatisés : `diagnostics.test.ts`, `diagnostic-rapport-range.spec.ts` | Deux actions pour corriger la classe du DPE, dont une inatteignable (voir plus bas). | P2 |
| Personnes et locataires | FONCTIONNE | Code lu ; tests automatisés : `invitations-actions.test.ts`, `pieces-demandees-actions.test.ts`, `personne-reprise.spec.ts` … | La relance d'une invitation restée sans réponse est suspendue (`lib/lien-mot-de-passe.ts:275`). | P2 |
| Documents (GED) | FONCTIONNE | Code lu ; tests automatisés : `sprint1-ged-retention.test.ts`, `depot-document-lot.spec.ts`, `depot-direct.spec.ts` | `envoyerPourSignature` est un reliquat (voir plus bas). | P2 |
| Messagerie | FONCTIONNE | Code lu ; tests automatisés : `messages-locataire-sans-espace.spec.ts` | Texte seul, sans pièce jointe. | P2 |
| Alertes (« À faire ») | FONCTIONNE | Code lu ; tests automatisés : `actions-du-jour.test.ts`, `alerte-impaye-proprietaire.spec.ts` | Pas d'alerte de révision IRL (voir plus haut). | — |
| Artisans et réseau | FONCTIONNE | Code lu ; tests automatisés : `sprint7-artisans.test.ts`, `invitation-artisan.spec.ts`, `reseau-couverture.spec.ts` | Rien relevé. | — |
| Profil et paramètres | FONCTIONNE | Code lu ; tests automatisés : `marque-profil.test.ts`, `profil-bailleur-manquant.test.ts`, `conservation-reglages.spec.ts` | Rien relevé. | — |
| Export complet | FONCTIONNE | Code lu ; tests automatisés : `export-complet.test.ts`, `export-complet-route.test.ts` | Aucun parcours navigateur. | P2 |
| Inscription, connexion, espaces, compte, sécurité | FONCTIONNE | Code lu ; tests automatisés : `onboarding.spec.ts`, `compte-securite.spec.ts` | Second facteur facultatif pour un bailleur. | P2 |
| Administration | Hors périmètre propriétaire | Code lu seulement, aucun test trouvé | Écran d'agence. | — |

### a.2 Espace locataire

| Module | État | Comment c'est établi | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Accueil | FONCTIONNE | Code lu ; tests automatisés : `accueil-locataire-depot.test.ts`, `ux-locataire-priorites.test.ts`, `audit-proprietaire-locataire-ecrans.test.ts` … | Rien de bloquant relevé | — |
| Mon logement et bail | FONCTIONNE | Code lu ; tests automatisés : `fenetre-lot.spec.ts` | `mes_edl_locataire` et `mes_infos_pratiques_locataire` : aucun test ne les nomme | P2 |
| Intention de congé | FONCTIONNE | Code lu seulement, aucun test trouvé | Aucun test ne nomme l'action ni la RPC. Le geste n'envoie qu'une alerte (voulu : le congé reste un recommandé) | P2 |
| Mes documents (pièces, assurance, pièces demandées, consentements) | FONCTIONNE | Code lu ; tests automatisés : `mes-documents-locataire.test.ts`, `sprint3-lo-depot.test.ts`, `attestations-refus.spec.ts` … | Si la RPC échoue après le dépôt, le fichier reste au stockage sans fiche (`attestation-locataire.ts:88-104`, pas de suppression) | P2 |
| Signature côté locataire | PARTIEL | Code lu seulement, aucun test trouvé | Le chemin « télécharger, signer, redéposer » ne peut plus être alimenté : `actions/signature.ts:86-88` (`envoyerPourSignature`) rend une erreur fixe, et la RPC `envoyer_pour_signature`, seule à écrire dans `demandes_signature`, n'est plus appelée. Aucun état de signature électronique (Zoho) n'apparaît dans l'espace locataire.… | P1 |
| Mes paiements | FONCTIONNE | Code lu ; tests automatisés : `parcours-locataire.spec.ts`, `plan-apurement-base.test.ts` | Aucun paiement en ligne : virement, IBAN affiché (voulu) | — |
| Quittance et reçu | FONCTIONNE | Code lu ; tests automatisés : `quittance-conforme.test.ts`, `quittance-document-route.test.ts`, `quittance-introuvable-404.test.ts` | Document HTML à imprimer, pas de fichier PDF remis | P2 |
| Attestation de loyer | FONCTIONNE | Code lu ; tests automatisés : `ux-locataire-priorites.test.ts`, `audit-proprietaire-locataire-base.test.ts` | Ni numéro ni archivage : imprimée à la demande. L'inventaire du wiki écrit `/attestation-loyer/{id}` ; la route réelle prend l'identifiant de l'espace | P2 |
| Dépôt de garantie | FONCTIONNE | Code lu ; tests automatisés : `accueil-locataire-depot.test.ts` | — | — |
| Signaler un problème | FONCTIONNE, sans IA | Code lu ; tests automatisés : `incident-declaration.test.ts`, `incidents-reprise-base.test.ts`, `incident-photos-avant-creation.test.ts` … | Voir « Qualification et urgence ». Un locataire à deux baux actifs ne choisit pas le logement : la base prend le plus récent (`declarer_mon_incident`, `order by created_at desc limit 1`) | P2 |
| Mes demandes (suivi, créneaux, report, annulation, contestation, note) | FONCTIONNE, sans IA | Code lu ; tests automatisés : `sprint7-locataire-intervention.test.ts`, `contre-proposition-locataire-action.test.ts`, `creneaux-locataire.test.ts` | — | — |
| Contact et messagerie | FONCTIONNE | Code lu ; tests automatisés : `commandes-locataire-hydratation.test.ts`, `messagerie-lecture.test.ts` | La RPC `envoyer_message_locataire` n'est nommée par aucun test. L'assistant IA (`contact/page.tsx:116`) est un complément : le fil fonctionne sans lui | P2 |
| Relevés de compteurs | FONCTIONNE | Code lu ; tests automatisés : `consommations-base.test.ts` | La lecture de photo par IA est facultative ; l'index se saisit à la main | — |
| Règles et FAQ | FONCTIONNE | Code lu seulement, aucun test trouvé | FAQ : texte écrit dans le code, aucun test | P2 |
| Invitation du locataire | FONCTIONNE | Code lu ; tests automatisés : `invitations-actions.test.ts`, `invitations-cycle.test.ts`, `relances-invitations-locataires.test.ts` … | La RPC `inviter_locataire` reste en base sans appelant | P2 |

### a.3 Incidents, de bout en bout

| Module | État | Comment c'est établi | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Déclaration par le gestionnaire | FONCTIONNE, en double | Code lu ; tests automatisés : `incident-gerant-colocation-base.test.ts`, `incident-gerant-colocation.spec.ts` | Deux chemins : (b) force la catégorie « autre » et l'urgence « normale ». Aucune alerte de doublon (référentiel module 7, variante V4) | P2 |
| Qualification et urgence | PARTIEL | Code lu ; tests automatisés : `sprint7-incidents.test.ts`, `incidents-portefeuille-agent.test.ts`, `repere-juridique-qualification.test.ts` | L'urgence ne se corrige jamais : aucune fonction de la base ne modifie `incidents.urgence` après la déclaration. Deux niveaux en base (`normale`, `urgente`) contre trois au référentiel (Urgent, Prioritaire, Normal). Pas de numéro d'astreinte de l'agence : seuls le 112 et le numéro gaz, écrits dans le code… | P1 |
| Liste et fiche côté bailleur | FONCTIONNE | Code lu ; tests automatisés : `incidents-liste-a-traiter.test.ts`, `incidents-portefeuille-agent.test.ts` | — | — |
| Demande et sélection de devis | PARTIEL | Code lu ; tests automatisés : `devis-decisions-concurrence.test.ts`, `devis-refus-motive.test.ts`, `devis-revision-versions.test.ts` … | Le seuil de délégation du mandat n'est jamais contrôlé : `mandats.seuil_delegation` est saisi (`actions/mandats.ts:31-40`) et imprimé dans le mandat, mais aucune fonction de la base ne le lit ; `retenir_devis` ne vérifie que l'expiration et la décennale. Le référentiel (RM-9.4.2) en fait un blocage. Sans objet pour un… | P0 à l'ouverture aux agences (risque… |
| Signature du devis par le propriétaire | FERMÉ PAR DRAPEAU | Code lu ; tests automatisés : `signature-devis.test.ts`, `signature-devis-base.test.ts` | `.env.example:260` : `false` par défaut | P2 |
| Planification et rendez-vous | FONCTIONNE, sans IA | Code lu ; tests automatisés : `validation-creneaux.test.ts`, `creneaux-non-retenus-caducs.test.ts`, `relances-reports-rdv.test.ts` … | Le wiki dit encore que la relance, l'accusé d'annulation et le parcours en navigateur manquent : le code les a (`missions/[interventionId]/accuse-annulation.tsx`, `lib/relances-reports-rdv.ts`) | P2 (wiki) |
| Intervention (démarrage, photos, compte rendu, avenant) | FONCTIONNE | Code lu ; tests automatisés : `sprint7-artisans.test.ts`, `chronologie-ecart-rendez-vous.test.ts`, `artisan-fin-mission.spec.ts` | Ni rapport d'intervention en PDF ni saisie de matériaux, que le wiki décrit encore | P2 (wiki) |
| Facture d'intervention : dépôt, contrôle, règlement | PARTIEL | Code lu ; tests automatisés : `facture-intervention-particulier.test.ts`, `artisan-fin-mission.spec.ts` | Impasse si la facture est fausse : une seule facture par intervention (index unique `intervention_factures_intervention_id_key`), le gérant ne peut que valider ; ni refus, ni remplacement, ni avoir (aucune fonction ne supprime ou ne remplace une ligne). Le référentiel prévoit « l'agent la refuse, l'artisan la corrige » (module… | P1 |
| Clôture, réouverture, révision d'imputation | FONCTIONNE | Code lu ; tests automatisés : `sprint7-incidents.test.ts`, `incidents-portefeuille-agent.test.ts` | — | — |
| Notation | PARTIEL | Code lu ; tests automatisés : `sprint7-artisans.test.ts` | L'écran artisan promet « une évaluation retirée est exclue du calcul » (`note/page.tsx:43`), mais la RPC `retirer_evaluation` n'est appelée par aucun écran ; la contestation n'ouvre qu'une demande d'assistance (`note/contestation.tsx:10`). « Les rendez-vous manqués ne sont pas encore mesurés » (`note/page.tsx:38`) | P1 |
| Messagerie d'intervention (propriétaire, locataire, artisan) | PARTIEL | Code lu seulement, aucun test trouvé | Aucune notification : la fonction n'écrit que le message (ni alerte, ni e-mail, ni compteur de non-lus). Discussion fermée dès que l'intervention est terminée. Aucun test : les deux tests qui citent le composant le remplacent par un vide (`audit-oct28-rendu.test.ts:117`, `rendez-vous-anticipe.test.ts:408`) | P1 |
| Photos | FONCTIONNE | Code lu ; tests automatisés : `photos-incident-reprise.test.ts`, `photos-demande-artisan.test.ts` | — | — |

### a.4 Espace artisan

| Module | État | Comment c'est établi | Ce qui manque ou cloche | Priorité |
|---|---|---|---|---|
| Inscription | FONCTIONNE | Code lu ; tests automatisés : `sprint7-artisans.test.ts`, `lot2-artisan.spec.ts` | SIRET contrôlé sur sa forme seulement (14 chiffres, `artisan.ts:200`) ; la vérification est une case cochée par la supervision (`supervision-artisans.ts:35`), sans appel à un registre | P2 |
| Invitation par un propriétaire | PARTIEL | Code lu ; tests automatisés : `renvoi-invitation-concurrence.test.ts`, `invitation-artisan.spec.ts` | Réservée au propriétaire en gestion directe (`invitations-artisan.ts:77,117,138`). Une agence crée une fiche (`agence/[orgId]/artisans/actions.ts:53-82`) mais n'a aucun envoi d'invitation : l'artisan doit s'inscrire seul et réclamer la fiche par son SIRET | P1 pour les agences |
| Mon entreprise | FONCTIONNE | Code lu ; tests automatisés : `reseau-presence-artisan.test.ts` | Les mentions légales sont un texte libre facultatif (`actions-preparation.ts:69`) | voir Devis |
| Attestations | FONCTIONNE | Code lu ; tests automatisés : `sprint7-artisans.test.ts`, `attestations-refus.spec.ts` | — | — |
| Accueil, sollicitations, missions | FONCTIONNE | Code lu ; tests automatisés : `sprint7-artisans.test.ts`, `lot2-mission-notification.test.ts`, `parcours-artisan.spec.ts` | — | — |
| Devis : rédaction, lignes, PDF, versions, envoi | FONCTIONNE techniquement, sans IA obligatoire ; mentions… | Code lu ; tests automatisés : `proposition-devis.test.ts`, `devis-structure.test.ts`, `devis-document.test.ts` … | Mentions non garanties : référence `DEV-` suivie de 8 caractères de l'identifiant, sans série (`devis-artisan.ts:14`) ; mentions de l'entreprise facultatives (`:40`) ; TVA à 0 % admise (`devis-structure.ts:13`) sans mention de franchise imposée ; ni assureur ni décennale en champ dédié ; ni caractère gratuit ou payant ;… | P0 à arbitrer (risque légal, à faire… |
| Facturation des missions | PARTIEL | Code lu ; tests automatisés : `facture-intervention-particulier.test.ts`, `suivi-facturation-artisan.test.ts`, `ux-facturation-artisan.test.ts` | Numéro saisi à la main (`facture-intervention.ts:24`) : unicité par artisan garantie en base (`reserver_numero_facture_artisan`) pour une facture créée, pas la continuité de la série ; deux factures déposées peuvent porter le même numéro. Mentions de TVA et d'entreprise en texte libre obligatoire mais non contrôlé (`:30`). Pas… | P0 à arbitrer (risque légal) |
| Clients externes, chantiers, devis, factures, avoirs, règlements | FONCTIONNE | Code lu ; tests automatisés : `export-artisan-complet.test.ts`, `parcours-artisan.spec.ts` | La facture externe est un fichier déposé avec son numéro, non créé par Gerimmo. Le menu affiche « Clients externes » même module fermé (`artisan/layout.tsx:160,201`) | P2 |
| Agenda | FONCTIONNE | Code lu ; tests automatisés : `artisan-agenda-jour-paris.test.ts`, `parcours-artisan.spec.ts` | — | — |
| Note | PARTIEL | Code lu seulement, aucun test trouvé | Voir « Notation » | P1 |
| Panne et règles | FONCTIONNE | Code lu ; tests automatisés : `parcours-artisan.spec.ts`, `finalisation.spec.ts` | — | — |
| Réseau d'artisans et carnet | FONCTIONNE | Code lu ; tests automatisés : `reseau-couverture.test.ts`, `reseau-zone-artisan-rejeu.test.ts`, `liste-noire-locale-relation.test.ts` … | Liste noire globale posable en base seulement, sans écran (le wiki le dit) | P2 |
| Paiement | SANS OBJET | Code lu seulement, aucun test trouvé | Deux registres déclaratifs que rien ne rapproche | P2 |

### a.5 Console du super admin

Les 26 écrans existent, sont reliés au menu et à la base ; 13 fonctionnent, 13 sont partiels. Trois gestes prévus
par la base n'ont aucun écran : retirer une évaluation d'artisan, autoriser un dossier d'orchestration, purger les
motifs de liste noire.

| Écran | État | Comment c'est établi | Ce qui manque | Priorité |
|---|---|---|---|---|
| finances (`/admin`, onglet « Clients et abonnements ») | PARTIEL | Code lu ; tests : `console-clients.spec.ts`, `ux-abonnements-admin.test.ts` | Lecture seule. Les chiffres dépendent de Stripe ; le paiement réel n'a jamais été exercé (audit du 19/11). | P1 |
| trésorerie (`/admin`, onglet « Encaissements et coûts ») | PARTIEL | Code lu ; `admin/tresorerie.tsx` (garde `is_permanent_super_admin` l. 11, relevé Stripe… | Coûts saisis à la main, justificatif en texte libre (pas de fichier), aucun rapprochement bancaire, pas de test navigateur dédié. L'écran dit lui-même « ni le bénéfice comptable, ni le solde bancaire ». | P2 |
| artisans | PARTIEL | Code lu ; tests : `supervision-artisans.test.ts` | Retirer une évaluation : la RPC `retirer_evaluation` existe (réservée au super admin, RM-11.4.4) et n'est appelée par aucun écran. Purge des motifs de liste noire : `maintenance_artisans()` la porte, rien ne l'appelle (ni écran, ni `pg_cron`). | P1 |
| autonomie (deux vues : « Activité et dossiers », «… | PARTIEL | Code lu ; tests : `arret-urgence-ecrans.test.ts` | `autoriser_orchestration` n'est appelée nulle part : un dossier en mode « autorisation » n'a pas de bouton. La boucle de correction dépend de GitHub (voir équipes). | P2 |
| brief (vue d'ensemble, décisions, comptes rendus par équipe) | FONCTIONNE | Code lu ; `brief/actions.ts` : `analyserBriefIA` l. 19 (garde l. 21),… | L'analyse par IA dépend de la clé OpenAI et du plafond. Envoi de l'e-mail du matin : en échec du 12 au 19/11 (audit du 19/11, OPS-1), effet du correctif non constaté ici. | P2 |
| clients (utilisateurs, fiche artisan, fiche personne) | FONCTIONNE | Code lu ; tests : `clients-supervision.test.ts` | — | — |
| comptes (`/admin/comptes/[accountId]`) | FONCTIONNE | Code lu ; tests : `controle-compte-journal-blocage.test.ts` | Indisponible sans clé de service (message explicite). | — |
| conservation | PARTIEL | Code lu ; `actions/retention.ts:8` (garde l. 10, RPC `modifier_duree_conservation`).… | Les 16 règles inactives : fiches de personnes, messages, incidents, invitations, inscriptions non confirmées, listes d'attente, journal d'authentification… | P1 |
| consignes | FONCTIONNE | Code lu ; tests : `consigne-sans-tache.test.ts` | — | — |
| couverture | FONCTIONNE | Code lu ; tests : `reseau-couverture.test.ts` | Restes de l'ancien modèle « ouverture par commune » en base (2 tables, 2 fonctions, annexe B). | P2 |
| devis (libellé du menu : « Demandes de contact ») | FONCTIONNE | Code lu ; tests : `demande-rappel.test.ts` | Pas de test navigateur. Nom trompeur : le dossier et la table s'appellent « devis » mais portent les demandes de contact du site. | P2 |
| donnees | PARTIEL | Code lu ; tests : `fermeture-compte-action.test.ts` | Le bilan affiche « Nettoyage pas encore écrit dans le code » pour les catégories sans purge (`donnees/bilan-conservation.tsx:21`). | P1 |
| equipes (« Tâches automatiques ») | PARTIEL | Code lu ; tests : `actions-equipes.test.ts` | L'atelier de correction : « un premier essai complet doit encore confirmer la préparation et la démonstration » (`equipes/qualite.tsx:14`) ; dépend d'un jeton GitHub. | P2 |
| journaux | FONCTIONNE | Code lu ; tests : `journaux-filtres.test.ts` | — | — |
| liste-attente | FONCTIONNE | Code lu ; tests : `liste-attente-agences-console.test.ts` | Doublon : la table `liste_attente` (propriétaires) n'a aucun écran. | P2 |
| marketing | PARTIEL | Code lu ; `admin/marketing/actions.ts` : réglages l. 14, `programmerCampagne` l. 73,… | Publication gratuite seulement : « Les campagnes payantes ne sont pas lancées depuis Gerimmo » (l. 86). Dépend des jetons Meta. Colonne `meta_campaign_id` jamais lue. | P2 |
| marque-blanche | PARTIEL | Code lu ; `marque-blanche/page.tsx` ; `actions/verification-marque.ts:8` (garde l. 9,… | Aucun test ne cite l'écran. Le domaine se déclare à la main chez l'hébergeur ; le proxy ne route rien par nom d'hôte (aucune occurrence de `host` dans `src/proxy.ts`). | P2 |
| organisations (fiche, ouverture, support) | FONCTIONNE | Code lu ; `actions/organisations-admin.ts:33` → RPC `ouvrir_organisation` l. 86 ;… | — | — |
| parametres | FONCTIONNE | Code lu ; tests : `console-identite-mediateur.test.ts` | Médiateur de la consommation non renseigné (audit du 19/11). | P1 |
| publications | PARTIEL | Code lu ; `actions/publications.ts` (garde l. 36 ; publier l. 212, retirer l. 246,… | Pas de test navigateur. Rédaction et diffusion dépendent d'OpenAI et de Meta. | P2 |
| relais | FONCTIONNE | Code lu ; `actions/consignes-vacances.ts` (`enregistrerVacances` l. 41,… | Alerte e-mail du relais : voir brief (OPS-1). | P2 |
| retours (« Assistance clients ») | FONCTIONNE | Code lu ; RPC `file_retours_supervision` ; `actions/retours.ts` : `deciderRetour` l. 34,… | — | — |
| sante | PARTIEL | Code lu ; Lecture des connexions, tâches, sauvegarde, Stripe ;… | « Antivirus à connecter » (`sante/page.tsx:318-327`). | P1 |
| securite | PARTIEL | Code lu ; Page d'aiguillage et contrôles en lecture (`securite/controles.tsx` :… | Aucun geste, un seul test (`rubriques-supervision`), pas de test navigateur. La vue `security_function_audit` (contrôle des fonctions, `verifie_le_contexte` à `false` en dur) n'est lue par aucun écran. | P2 |
| territoire | PARTIEL | Code lu ; tests : `conservation-prospection-base.test.ts` | Six colonnes `source_*` de `territory_market_data` jamais lues ; un seul test cite l'écran. | P2 |
| veille | FONCTIONNE | Code lu ; tests : `tri-decisions.test.ts` | Dépend de la collecte planifiée (mission `veille`). | — |

### a.6 Sécurité, cloisonnement, secrets, sauvegardes

**Aucun défaut de sécurité de niveau P0 n'a été trouvé.** Preuves par requête sur la base d'essai (toutes les
migrations du dépôt), recoupées avec les avis de la base de production (mêmes chiffres : 30 tables fermées sans
politique, 420 fonctions réservées aux comptes connectés, 1 vue et 1 fonction signalées).

| Constat | Preuve | Gravité | Correction proposée | Priorité |
|---|---|---|---|---|
| Aucune table sans RLS dans `public` | Requête R1 : 227 tables, `relrowsecurity` vrai sur 227, `relforcerowsecurity` 0. Test : `tests/socle.test.ts:32`. | Conforme | — | — |
| Isolation entre organisations tenue | Sonde R9 (transaction `read only`, rôle `authenticated`, identité d'un administrateur d'agence du jeu d'essai) : 108 tables et vues avec `organization_id`, 16 lignes visibles, 0 d'une autre organisation.… | Conforme | — | — |
| Aucune fonction ouverte à `anon` dans `public` | R5 : 996 fonctions, 809 SECURITY DEFINER, 0 exécutable par `anon`, 420 par `authenticated`. Seule fonction ouverte à `anon` : `gerimmo_session_interne.verifier_session_api` (SECURITY INVOKER, garde de session… | Conforme | — | — |
| Les fonctions SECURITY DEFINER contrôlent l'appelant | R6 : sur 441 (420 dans `public`, 21 dans les schémas internes), 398 portent une garde directe dans leur corps (`auth.uid()`, `is_super_admin`, `org_ids_avec_roles`…). Les 43 autres, toutes relues : 38… | Conforme | — | — |
| Antivirus absent sur les fichiers déposés | `src/app/admin/sante/page.tsx:318-327` (« antivirus à connecter ») ; wiki « Socle de sécurité », RM-A4.8 (« analyse antivirus systématique », acté). Seuls format et taille sont bornés (R8 : compartiments… | Élevée | Relier le service prévu (`docs/antivirus-depots.md`) ; refuser le fichier en cas d'échec d'analyse. | P1 |
| Reprise d'activité : sauvegarde prouvée, remise en service non prouvée | `.github/workflows/sauvegarde.yml` (quotidien, chiffré, relu après dépôt) ; `restauration-sauvegarde.yml` : **`workflow_dispatch` seul**, aucun passage planifié. `docs/sauvegarde-et-restauration.md` :… | Élevée | Planifier l'exercice (mensuel) ; jouer une fois la remise en service complète sur un projet de secours et mesurer le RTO. | P1 |
| Garde de la clé de chiffrement des sauvegardes non prouvée | `sauvegarde.yml:37` : `GERIMMO_BACKUP_KEY` vit dans les secrets GitHub, qui ne se relisent pas. `docs/sauvegarde-et-restauration.md:89` : « doit être conservée séparément » — rien ne prouve que c'est fait.… | Élevée (non prouvé) | Vérifier la copie hors GitHub ; la consigner au plan de reprise. | P1 |
| Comptes de démonstration à mot de passe connu | `app/supabase/seed.sql:2,22,157` : `Gerimmo-Demo-2026`, comptes `@example.com` ; repris en clair dans plusieurs fichiers de test. Le fichier se dit « développement uniquement » ; aucune garde technique ne… | Élevée si présents en production (non… | En production : `select count(*) from auth.users where email like '%@example.com'` doit rendre 0. | P1 |
| Conservation RGPD partiellement active | R11 : `retention_rules`, 42 actives, 16 inactives (`personne:fiche`, `message:locatif`, `incident:dossier`, `invitation:*`, `compte:inscription_non_confirmee`, `contact:attente*`, `journal:auth_audit`,… | Moyenne | Activer règle par règle après le bilan de l'écran Données. | P1 |
| Vue `organisations_portail` en SECURITY DEFINER | R4 : `reloptions = {security_barrier=true}`, sans `security_invoker` ; propriétaire `postgres`. Avis de production : `security_definer_view` (ERROR). Elle filtre l'appelant (`user_org_ids()`, IBAN au seul… | Faible (voulu, mais classé ERROR par… | La remplacer par une fonction, ou consigner l'exception. Les 7 autres vues sont en `security_invoker`. | P2 |
| Droits par défaut ouverts sur les objets futurs | R12 (`pg_default_acl`, banc local) : fonctions `anon=X`, tables `anon=r`, `authenticated=arwd`. Une table ou fonction neuve naît ouverte. Garde : les tests du socle, et `migrations.yml` qui exige une CI verte… | Moyenne | Interdire toute application hors chantier ; rejouer R1, R2 et R5 en production après chaque application. | P2 |
| Table abandonnée où `anon` écrit : `liste_attente` | R3 : `anon` INSERT sur `email, biens, source`, politique `inscription anonyme` (`with check (true)`). Aucun `.from("liste_attente")` dans `app/src` ; aucun écran ne la lit. Bornée : 30 inscriptions par heure… | Faible | Trancher : la brancher ou la supprimer. | P2 |
| Table abandonnée lisible par `anon` : `site_pages` | R1, R2 : `anon` SELECT, politique `using (true)`. Aucune référence dans `app/src` ni dans une fonction SQL ; 0 ligne au banc ; le commentaire renvoie à une fonction hébergée absente du dépôt. Contenu en… | Faible | Vérifier le contenu en production puis supprimer. | P2 |
| Droits de table sans politique correspondante | R13 : sur 21 tables, `authenticated` détient un droit sans politique permissive pour la commande (INSERT sur 13, UPDATE sur 17, DELETE sur 16) (`quittances`, `ecritures`, `restitutions`, `revisions_loyer`,… | Faible | Révoquer ces droits inutilisés. | P2 |
| Politique à condition toujours vraie | R2 : `paiements_fourniture_lecture` compare `f.organization_id = f.organization_id`. Pas de fuite (la sous-requête passe par la RLS de `factures_fourniture`), mais la ligne n'est pas liée à sa propre… | Faible | Comparer à `paiements_factures_fourniture.organization_id`. | P2 |
| Fonction sans `search_path` | R5 : `public.fermetures_comptes_nuit()` (procédure SECURITY INVOKER, non exécutable par les rôles de l'API). Avis de production : `function_search_path_mutable`. | Faible | `set search_path = ''`. | P2 |
| Deux fonctions SECURITY DEFINER sans garde d'appelant | R6 : `ged_securite_interne.fichier_reference(text)` et `purge_reservee(text)` répondent vrai ou faux sur l'existence d'un chemin, toutes organisations confondues. Chemins à identifiants aléatoires. | Faible | Réserver leur exécution aux politiques de stockage. | P2 |
| Table sans RLS hors `public` | R1 : `gerimmo_session_interne.reconnexions_requises`, RLS inactive, aucun droit pour `anon` ni `authenticated`. | Faible | Activer la RLS par principe. | P2 |
| Second facteur obligatoire pour la seule supervision | R6 : `second_facteur_valide()` n'exige `aal2` que si un facteur est enrôlé ; `is_super_admin()` l'exige toujours. Wiki « Socle de sécurité » : « MFA facultative des autres personas reste à développer ». | Moyenne (décision actée) | Rendre l'enrôlement obligatoire pour les administrateurs d'agence. | P2 |
| Clé `service_role` confiée à GitHub pour la sauvegarde | `sauvegarde.yml:39,99,187` : `GERIMMO_BACKUP_SERVICE_KEY`. Elle contourne toute la RLS. | Moyenne | Rôle dédié, borné à la copie des fichiers et à l'écriture du journal. | P2 |
| Lecture en base avant autorisation sur une route planifiée | `src/app/api/cron/equipes/route.ts:29-32` : pour `mission=marketing`, un appel sans secret déclenche la RPC `jeton_declencheur_marketing` avant le refus. | Faible | Refuser d'abord l'appel sans en-tête `Authorization`, comme `api/cron/relais/route.ts:48-52`. | P2 |
| Retours arrière incomplets et jamais joués en production | 526 migrations, 169 retours. Aucun retour avant le 13/10 (298 migrations). Depuis : 59 sur 228 sans retour, dont `20261113022742_session_active_api`, `20261119142934_securite_provenance_fichiers`,… | Moyenne | Le vrai filet est la sauvegarde exigée avant migration (`migrations.yml`). Écrire les retours des migrations de sécurité. | P2 |
| Extension `pg_net` dans `public` (production) | Avis de production `extension_in_public`. Absente du banc (R14). | Faible | La déplacer dans un schéma dédié. | P2 |
| Aucun secret dans le dépôt | `git ls-files` : seul `app/.env.example` suivi ; `.gitignore:47-48`. Recherche de motifs (clés Stripe, Resend, JWT, clés privées, URL avec mot de passe) : uniquement le mot de passe du banc local et des… | Conforme | — | — |
| Variables `NEXT_PUBLIC_` légitimes | 4 noms : `SITE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `VERCEL_ENV`. | Conforme | — | — |
| Routes planifiées et webhooks contrôlés | `src/lib/tache.ts:49-57` (`timingSafeEqual` sur `CRON_SECRET`) appelé par les 4 routes `api/cron/*` ; Stripe `api/stripe/webhook/route.ts:56` (`constructEventAsync`) ; Zoho `api/zoho-sign/webhook/route.ts:33`… | Conforme | — | — |
| Actions serveur : contrôle avant écriture | 113 fichiers « use server ». 14 prennent directement la clé de service ; chacun contrôle d'abord (voir § 3.3). Aucune écriture au client de service sans contrôle préalable trouvée. Limite : les chemins… | Conforme | — | — |
| Stockage : 5 compartiments privés, 1 public | R8 : seul `marketing-visuels` est public (JPEG, 10 Mo, aucune politique d'écriture pour les comptes). 35 politiques sur `storage.objects`, dont 17 restrictives (session valide, second facteur, provenance).… | Conforme | Borner `exports-complets` par principe. | P2 |

**Constat ajouté par moi (réglages de l'hébergeur, lus le 22/11)** : les aperçus Vercel (environnement « Preview »)
reçoivent l'adresse et la clé publique de la base de **production** (`NEXT_PUBLIC_SUPABASE_URL` et
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` partagées). Les aperçus sont protégés par une connexion Vercel, donc non
publics, mais un aperçu utilisé écrirait dans la base de production. À corriger avant tout usage de la
préproduction (P0-01).

**Non vérifié** : la base de production elle-même (hors avis de sécurité), les secrets réellement posés, la présence
d'une copie de la clé des sauvegardes hors GitHub, l'absence en production des comptes de démonstration du jeu
d'essai. Le cloisonnement côté locataire et côté artisan est prouvé par des tests automatisés, non par une sonde
directe.

### a.7 Doubles, abandons, contradictions

- **Code en double** : deux actions `creerBail` ; deux actions pour corriger la classe du DPE, dont une inatteignable ;
  trois portes d'encaissement avec des listes de modes de règlement différentes ; deux déclarations d'incident côté
  gestionnaire (l'une force catégorie « autre » et urgence « normale »).
- **Code abandonné** : `envoyerPourSignature` (reliquat qui rend une erreur fixe) ; `deposerMonDevis` sans appelant ;
  31 fonctions de base jamais appelées, dont l'ancienne intégration de signature Youtrust ; écrans Statistiques,
  Règles et Journal sans lien pour le propriétaire.
- **Tables abandonnées** : `site_pages` (lisible par un visiteur, vide sur la base d'essai, contenu en production non
  vérifié), `signature_evenements`, `reseau_ouvertures`, `reseau_artisan_communes`, `liste_attente` (un visiteur peut
  y écrire, plafonné à 30 par heure ; aucun écran ne la lit).
- **Contradictions** : l'écran de l'artisan promet qu'une évaluation retirée est exclue du calcul, mais aucun écran
  ne permet de la retirer ; l'écran de restitution promet un « décompte rectificatif » qu'aucun geste ne produit ;
  l'écran de veille dit « aucune analyse ne vous est demandée » alors que, sans IA, c'est au super admin d'écrire.
- **Wiki en retard sur le code** : pages « Planification d'intervention » et « Intervention et clôture ».

Détail, avec fichiers et lignes : annexes a1, a2, a3.

---

## b) Conformité légale

> **Limite, à lire avant tout.** Aucun texte officiel n'a pu être **ouvert** : le réseau de mon environnement refuse
> Légifrance, service-public, l'ANIL, la CNIL et l'INSEE. Les règles ci-dessous viennent d'extraits de recherche du
> 22/11/2026 citant ces sites. Le code de Gerimmo, lui, a été lu ligne à ligne.
> Verdicts possibles ici : **« écart probable, à confirmer à la source »**, **« concordant sur extrait, à confirmer »**,
> **« à faire vérifier par un juriste »**. **Aucun « conforme ».**
> Les annexes b1, b2 et b3 listent, article par article, les pages à relire.

**Le texte applicable aux baux conclus à partir du 1er octobre 2026** : d'après les extraits, il s'agit du décret
n° 2026-596 du 6 juillet 2026 (clause résolutoire à six semaines, mention de résidence principale, téléphone
facultatif). Gerimmo cite ce décret dans son contrat ; la comparaison rubrique par rubrique avec les annexes reste à
faire, textes ouverts. Les extraits signalent aussi un arrêté du 9 octobre 2026 qui aurait remplacé la notice
d'information pour les baux conclus depuis le 18/10/2026 : il est absent du code et du wiki. **À confirmer.**

### b.1 Bail et vie du bail (loi du 6 juillet 1989, contrat type, congés, dépôt, cautionnement)

6 points en P0, 11 en P1, 15 en P2. Ci-dessous les P0 et P1 ; le reste est en annexe b1.

| Point | Ce que fait Gerimmo | Verdict (provisoire) | Correction proposée | Priorité |
|---|---|---|---|---|
| 1. Contrat type en vigueur depuis le 01/10/2026 | Un seul gabarit par régime, toujours dans la version 2026 : `src/lib/documents/modeles/mentions-location.ts:1-3` cite le décret ; titre « Contrat type — annexe 1 du décret n° 2015-587 du 29 mai 2015 » (`bail-nu.ts:87-90`) ; téléphone imprimé « — » s'il… | À faire vérifier — concordant sur les trois changements connus ; la comparaison rubrique par rubrique avec les annexes… | Ouvrir les deux annexes en vigueur et comparer chaque rubrique aux PDF nu et meublé ; consigner la source et la date au wiki. | P1 |
| 2. Clause résolutoire : rédaction | `mentions-location.ts:42-44` : « Le défaut de paiement du loyer ou des charges aux échéances convenues, ou le non-versement du dépôt de garantie, entraîne la résiliation de plein droit du contrat. Cette clause ne prend effet que six semaines après un… | À faire vérifier — même sens, rédaction différente de celle du contrat type ; clauses facultatives non lues. | Reprendre mot pour mot la rédaction de l'annexe ; relire les trois clauses facultatives sur le texte. | P1 |
| 3. Notice d'information annexée au bail | `src/lib/documents/modeles/notice.ts:1-4` : « contenu de la notice officielle sous forme condensée ». Onze rubriques de quelques lignes (`:21-66`). Titre : « Arrêté du 29 mai 2015 pris en application de l'article 3 » (`:83`). C'est ce PDF que la signature… | Non conforme (sur extrait). | Remplacer le résumé par le texte intégral de l'annexe de l'arrêté, dans sa version du 18/10/2026, en PDF fixe et daté. En attendant, faire déposer la notice officielle par le bailleur et ne plus générer le résumé. | P0 |
| 4. Mentions obligatoires du bail (art. 3) | Parties (`bail-nu.ts:95-137`), consistance, surface, destination (`:139-172`), date d'effet et durée (`:174-188`), loyer, encadrement, précédent loyer (`mentions-location.ts:67-85`), révision (`bail-nu.ts:195-205`), charges, paiement, travaux (`:210-228`),… | À faire vérifier — concordant avec l'extrait. | Dresser la table « mention de l'article 3 → champ du PDF » une fois l'article ouvert. | P1 |
| 6. Bail nu à durée réduite | Un seul champ texte `duree_reduite_evenement`, sans durée ni date de fin. Le PDF imprime quand même « Durée du contrat : trois ans » puis « Un contrat d'une durée réduite (au moins un an) n'est possible que si un événement précis justifie la reprise du… | Non conforme — fonction incomplète : le contrat se contredit. | Ajouter la durée convenue (au moins un an), les raisons, le contrôle du type de bailleur ; retirer le paragraphe du meublé ; sinon retirer l'option. | P1 |
| 10. Restitution : majoration, copropriété, nouvelle adresse | La majoration est imprimée (`decompte-restitution.ts:232-235`) mais jamais calculée (hors périmètre V1 selon le wiki). L'alerte dit « délai légal dépassé depuis le … (intérêts de retard dus) » (fonction `generer_alertes_restitution`) : ce ne sont pas des… | À faire vérifier — fonction incomplète. | Calculer la majoration due ; corriger le libellé de l'alerte ; ajouter le champ « nouvelle adresse du locataire » ; proposer la provision plafonnée à 20 % en copropriété. | P1 |
| 14. Interdiction de louer selon la classe DPE | **Erratum du 22/11 : le point (a) est faux, voir « Errata » en fin de document.** (a) `lot_blocages_location` (`supabase/migrations/20261027100200_diagnostics_validite_dpe_et_rapports.sql:75-80`) bloque « DPE classe G : logement interdit à la location (loi Climat) » dès qu'un DPE non archivé est classé G, même si un DPE plus récent ne… | À faire vérifier — trois défauts : un ancien DPE bloque à tort ; un bail signé après le 01/01/2025 sur un logement G… | Retenir le DPE valide le plus récent ; pour un bail en cours, comparer la date de conclusion ou de dernière reconduction au 01/01/2025 et dire le risque en clair ; préparer l'échéance F de 2028 ; traiter l'outre-mer par le code… | P1 |
| 15. Dossier de diagnostic technique (art. 3-3) | Nouveau bail : DPE valide et ERP valide exigés à l'activation (`lot_blocages_location`). Signature électronique : ERP exigé, tout diagnostic enregistré doit avoir un PDF non expiré (`src/lib/signature-bail.ts:65-73`). Plomb, électricité et gaz sont «… | À faire vérifier. | Lister au bail les diagnostics réellement joints, avec leur date ; avertir avant la signature si plomb, électricité ou gaz attendus manquent ; ajouter le diagnostic « bruit ». | P1 |
| 16. Préavis du locataire (logement nu) | `enregistrer_conge` (`supabase/migrations/20261112120300_conge_ajuste_dernier_terme_et_depot_au_centime.sql:644-663`) : en zone tendue, un mois imposé, même si le locataire n'a rien invoqué. Écran : « En zone tendue, le préavis d'un mois s'applique de plein… | Non conforme (sur extrait) pour la zone tendue : le bailleur ne peut pas enregistrer trois mois quand le locataire n'a… | Demander si la lettre invoque la zone tendue : oui, un mois ; non, trois mois. Corriger le texte d'aide. Compléter la liste des motifs. | P1 |
| 19. Congé du bailleur : délai avant le terme | `enregistrer_conge` : six ou trois mois, motif obligatoire, effet au terme calculé (début + durée − un jour, `terme_bail_calcule`), refus si « réception + préavis » dépasse « terme + un jour » (`:679`). Exemple : bail meublé du 21/09/2025, terme calculé le… | À faire vérifier — écart possible d'un jour, au détriment du bailleur (congé nul, bail reconduit). | Exiger « réception + préavis ≤ terme », sans le jour de plus, ou afficher la date limite avec un jour de marge. | P1 |
| 20. Congé du bailleur : point de départ du délai | L'écran dit juste : « Le délai commence à la réception effective du congé. Pour un recommandé, retenez le jour où le destinataire reçoit la lettre, pas le passage du facteur. » (`formulaires-bail.tsx:246-247`). Le PDF dit l'inverse : « le délai s'apprécie à… | Non conforme (sur extrait) pour le PDF. | Écrire dans le PDF que le délai court à la réception effective et qu'une lettre non retirée ne le fait pas courir ; remplacer « huissier » par « commissaire de justice » ; renommer le champ. | P0 |
| 21. Congé pour vente (nu) : mentions à peine de nullité | `conge-bailleur.ts:170-182` : prix exigé, conditions facultatives, trois phrases résumant les droits du locataire. Les alinéas de l'article 15 II ne sont pas reproduits. Les locaux ne sont désignés que par l'adresse (cave, parking absents). | Non conforme (sur extrait). | Reproduire intégralement les alinéas exigés (texte daté, relu par un juriste) ; rendre obligatoires les conditions de la vente ; décrire les locaux comme au bail. | P0 |
| 22. Congé pour reprise : mentions à peine de nullité | Deux champs seulement, nom et lien du bénéficiaire (`conge-bailleur.ts:184-187`). Pas d'adresse. Aucun champ pour exposer les raisons de la reprise, seulement un rappel général (`:188-192`). `enregistrer_conge` n'exige qu'un texte « nom et lien » (`:632-634`). | Non conforme (sur extrait). | Rendre obligatoires l'adresse du bénéficiaire, le lien (liste fermée) et l'exposé des raisons ; refuser le PDF sinon. | P0 |
| 23. Congé pour vente ou reprise : notice à joindre | Aucune notice jointe ni rappelée (`conge-bailleur.ts`, `generer-conge-bailleur.tsx`). | Non conforme (sur extrait) ; portée de la sanction à faire préciser. | Joindre la notice officielle au PDF de tout congé pour vente ou reprise d'un logement nu. | P0 |
| 24. Congé du bailleur : qui peut donner congé, cas restreints | Aucun contrôle sur la qualité du bailleur : une SCI non familiale peut générer un « congé pour reprise ». Aucune question sur la date d'achat. Protection des 65 ans : simple rappel (`conge-bailleur.ts:257-260`). | À faire vérifier. | Refuser « reprise » pour « SCI » et « Personne morale » ; limiter la SCI familiale à ses associés ; demander la date d'acquisition et la situation du locataire, avec avertissement. | P1 |
| 28. Cautionnement : forme de l'acte | Loyer, charges et clause de révision (`cautionnement.ts:137-145`) ; alinéa reproduit (`:51-52`, `:166-167`) ; mention apposée par la caution et comparée mot pour mot au retour de signature (`src/lib/mention-caution.ts`) ; plafond en lettres et en chiffres ;… | À faire vérifier — concordant sur la structure ; alinéa reproduit et mention à comparer au texte. | Retirer « pénalités » de l'acte et de la mention ; faire relire les deux textes. | P1 |
| 29. Cautionnement : cas interdits | Assurance : case obligatoire, « Je certifie n'avoir souscrit aucune assurance ni aucune autre garantie… » (`src/lib/textes-signature-actes.ts:44-45` ; `cautionnement.ts:73`). Personne morale : aucun contrôle ; un bailleur « SCI » ou « Personne morale » peut… | Non conforme (sur extrait) pour la SCI non familiale et les autres personnes morales. | Refuser l'acte quand un bailleur a la qualité « SCI » ou « Personne morale », sauf locataire étudiant non boursier déclaré ou caution apportée par un organisme agréé. | P0 |

Concordants sur extrait (à confirmer) : plafond et délais du dépôt de garantie, quittance et reçu, mécanique de la
révision IRL, durées des baux, solidarité de colocation.

### b.2 États des lieux, vétusté, charges récupérables, pièces justificatives

8 points en P0, 21 en P1, 10 en P2, 12 sans écart relevé sur extrait. P0 et P1 ci-dessous ; le reste en annexe b2.

| Point | Ce que fait Gerimmo | Verdict (provisoire) | Correction proposée | Priorité |
|---|---|---|---|---|
| A3. Domicile ou siège social du bailleur | En-tête : `src/lib/documents/gabarit.ts:171` + `src/lib/documents/modeles/communs.ts:286-296`. Propriétaire direct : nom et adresse des bailleurs, PDF refusé si une adresse manque. Agence : c'est l'adresse de l'agence qui s'imprime, pas celle du bailleur. | propriétaire direct : non lu à la source — aucun écart relevé sur l'extrait ; mode agence : non conforme (sur extrait,… | En mode agence, imprimer aussi le domicile ou le siège du bailleur. | P1 |
| A7. Description précise, pièce par pièce, des sols, murs, plafonds, équipements et éléments | `generer_grille_edl` : 7 éléments par pièce (sols, murs, plafonds, fenêtres et volets, portes, prises, éclairage) + équipements du lot ; état sur 5 niveaux + commentaire facultatif ; `signer_edl` refuse une ligne sans état. Si le lot n'a pas de pièces… | grille générique : non conforme (sur extrait, à confirmer à la source) ; sinon à faire vérifier par un juriste (une… | Refuser la signature d'une grille sans pièce ; rendre l'observation obligatoire pour « Mauvais » et « Absent ». | P1 |
| A10. Sortie : adresse du nouveau domicile ou du lieu d'hébergement du locataire | Champ obligatoire intitulé « Adresse de restitution du dépôt de garantie » (`src/app/actions/edl.ts:54-56`, `edl.ts:205`). Ce n'est pas la même notion : une adresse de restitution peut ne pas être le domicile. | à faire vérifier par un juriste | Renommer « Nouvelle adresse du locataire (domicile ou lieu d'hébergement) ». Utile aussi pour l'article 22 : la majoration de retard tombe si l'adresse n'a pas été transmise. | P1 |
| A11. Sortie : date de l'état des lieux d'entrée | Absente du PDF de sortie : `edl.ts:171-205` imprime la synthèse des écarts et les retenues, sans la date de l'entrée. L'écran de saisie la connaît (`page.tsx:57-70`) mais le modèle ne la reçoit pas. | non conforme (sur extrait, à confirmer à la source) | Imprimer « État des lieux d'entrée établi le … » dans le PDF de sortie. | P0 |
| A14. Remise à chaque partie au moment de la signature, en main propre ou par voie dématérialisée | Voie électronique : le PDF signé est rattaché au bail et aux locataires (`edl.ts:308-312`). Voie papier : la preuve est rattachée au bail seulement (`signer_edl`) ; l'accès du locataire à cette pièce n'a pas été vérifié de bout en bout. | à faire vérifier par un juriste | Vérifier que la preuve papier est visible dans l'espace du locataire, ou faire cocher « exemplaire remis au locataire ». | P1 |
| A15. Complément dans les dix jours ; chauffage pendant le premier mois de chauffe | Rappel imprimé et envoyé : `src/lib/textes-signature-actes.ts:14-17`, `edl.ts:210-216`, `notice.ts:40`. La formule « dans les dix jours qui suivent son établissement » est fidèle. Mais un état des lieux signé est figé (`edl_lignes_fige`,… | information du locataire : non lu à la source — aucun écart relevé sur l'extrait ; enregistrement du complément :… | Ajouter un « complément à l'état des lieux d'entrée » daté, joint au document d'origine, sans rouvrir la grille. | P1 |
| A17. Absence d'état des lieux d'entrée | `ajouter_retenue` exige alors un justificatif ; le décompte le dit (`decompte-restitution.ts:157-164`). Mais « sans état des lieux d'entrée » veut dire « aucune entrée signée dans Gerimmo » (`demarrer_restitution`). Pour un bail repris en cours (migration… | règle : non lu à la source — aucun écart relevé sur l'extrait ; phrase imprimée pour un bail repris : non conforme… | Demander au bailleur : « un état des lieux d'entrée a-t-il été établi hors Gerimmo ? » ; si oui, le faire déposer et retirer la phrase. | P1 |
| B2. Grille de vétusté | Barème écrit dans le code, sans accord collectif cité (`…/baux/[bailId]/formulaire-restitution.tsx:70-81` ; le commentaire parle de « durée réglementaire », que le décret ne fixe pas). Durée et âge sont saisis librement à chaque retenue. Dans le bail, la… | à faire vérifier par un juriste | Ne pas présenter ce barème comme une grille opposable. Proposer d'annexer au bail, à la signature, une grille issue d'un accord collectif ; à défaut, écrire au décompte « durées retenues par le bailleur, aucune grille n'ayant… | P1 |
| B3. Retenue du coût intégral, sans vétusté | Durée de vie laissée vide = coût retenu à 100 % (`ajouter_retenue` ; écran `formulaire-restitution.tsx:617-618` : « dégradation, non-vétusté »). Aucun motif demandé. | à faire vérifier par un juriste | Exiger un motif écrit quand aucune vétusté n'est déduite, repris au décompte. | P1 |
| B4. Sommes retenues « dûment justifiées » | Une retenue se saisit sans pièce (simple alerte « difficilement défendable » : `ajouter_retenue`). `finaliser_decompte` ne contrôle rien : le solde se fige et le PDF imprime « Non fourni » (`decompte-restitution.ts:61-63`, `:236-237`). La fenêtre de… | non conforme (sur extrait, à confirmer à la source) | Refuser la finalisation tant qu'une retenue n'a pas son justificatif (devis, facture, constat). | P0 |
| B5. Délai : un mois si la sortie est conforme à l'entrée, deux mois sinon, à compter de la remise des clés | `demarrer_restitution` + `restitution_date_limite` ; date de remise des clés jamais future ; alerte à J-7 et à l'échéance. Trois réserves : (a) tout changement d'état, même une usure normale, compte comme écart → deux mois… | calcul du délai : non lu à la source — aucun écart relevé sur l'extrait ; (a) à faire vérifier par un juriste ; (b)… | (b) Quand les deux états des lieux sont signés et sans écart, imposer un mois. | P1 |
| B6. Majoration de retard | Mention imprimée (`decompte-restitution.ts:230-235`) et alerte « délai légal dépassé (intérêts de retard dus) » (`generer_alertes_restitution`). Aucun calcul : `finaliser_decompte` n'ajoute jamais la majoration au solde. L'exception n'est pas dite. Le mot «… | non conforme (sur extrait, à confirmer à la source) — majoration annoncée par Gerimmo lui-même, jamais appliquée | Calculer la majoration à la finalisation tardive et l'ajouter au solde ; écrire « majoration de retard » ; citer l'exception. | P1 |
| B7. Immeuble collectif : provision d'au plus 20 % du dépôt jusqu'à l'arrêté annuel des comptes | Rien : aucune occurrence dans le décompte ni dans les actions de restitution. | non lu à la source — aucun écart relevé sur l'extrait (faculté du bailleur, non proposée) | Fonction à ajouter pour la copropriété. | P1 |
| C1. Liste limitative des charges récupérables | Appels du syndic : la nature de chaque poste est proposée par mots-clés (`src/lib/charges.ts:14-27`, `:37-49` ; `src/app/actions/appels-charges.ts:86-95`). Règle rejouée à l'identique le 22/11 : « Travaux ascenseur », « Modernisation ascenseur », «… | non conforme (sur extrait, à confirmer à la source) | Ne plus proposer « récupérable » par défaut : toute ligne naît « à qualifier » avec une suggestion, et l'agent confirme poste par poste. Ajouter aux exclusions « travaux, réparation, réfection, rénovation, peinture,… | P0 |
| C2. Même liste — défaut du mot-clé « eau » | Le mot-clé `"eau "` (`charges.ts:15`) est cherché à l'intérieur des mots : « Nouveau tableau électrique », « Panneau d'affichage hall », « Bureau de contrôle ascenseur » sortent « récupérable » (rejoué le 22/11). | non conforme (sur extrait, à confirmer à la source) | Chercher des mots entiers, pas des morceaux de mots. | P0 |
| C3. Gardien, concierge, employé d'immeuble | La nature d'un poste est tout ou rien (contrainte `appel_charges_postes_nature_check`). « Gardien » et « Concierge » sortent « à qualifier », mais « Salaire gardien nettoyage » sort « récupérable » à 100 %. Aucun taux possible. | non conforme (sur extrait, à confirmer à la source) | Permettre une part récupérable en pourcentage ; proposer 75 % ou 40 % pour un gardien, avec la question des deux tâches. | P0 |
| C4. Désinsectisation | « Désinsectisation (prestation) » sort « récupérable » en entier (`charges.ts:19`). | à faire vérifier par un juriste | Tant que la source n'est pas lue : « à qualifier ». | P1 |
| C6. Factures de fournitures : catégories proposées | Dix catégories (`src/lib/consommations.ts:34-38`). Présélection « récupérable » : eau, électricité des parties communes, gaz, chauffage, ordures ménagères (`src/lib/conseil-repartition.ts:39`). Exclues : électricité du logement, internet, assurance, autre… | eau, électricité des communs, ordures ménagères : non lu à la source — aucun écart relevé sur l'extrait ; gaz et… | Pour « gaz » et « chauffage », demander « installation collective ? » avant de précocher. | P1 |
| C8. Suite donnée au solde de la régularisation | Le solde n'est ni appelé ni remboursé : aucune écriture ; il est seulement « repris au décompte de sortie » (`src/app/actions/loyers.ts:309-312`, `src/lib/baux.ts:191-204`). Un trop-perçu attend donc le départ du locataire. | non conforme (sur extrait, à confirmer à la source) — fonction incomplète | Créer, à la validation, l'avoir ou l'appel correspondant sur l'échéance suivante. | P1 |
| C9. Décompte par nature de charges, communiqué un mois avant ; mode de répartition ; note sur le chauffage… | Voie simple : un seul montant « charges réelles de l'exercice, logement entier » et une pièce jointe (`formulaire-loyers.tsx:804` ; `loyers.ts:259-261`). Gerimmo ne produit pas de décompte par nature et ne tient aucun délai d'un mois. Voie « fournitures » :… | non conforme (sur extrait, à confirmer à la source) — délai d'un mois absent, décompte par nature non garanti | Séparer deux temps : envoi du décompte (daté), puis régularisation au plus tôt un mois après. Produire le décompte par nature dans les deux voies. | P1 |
| C11. Régularisation tardive : paiement par douzième si le locataire le demande | `regulariser_charges` : tardive si faite après le 31/12 de N+1 ; douze mensualités sur demande ; refus hors de ce cas. Case « le locataire demande l'étalement » (`formulaire-loyers.tsx:819-820`). | non lu à la source — aucun écart relevé sur l'extrait | Aucune sur la règle. Les mensualités ne sont pas appelées automatiquement (`baux.ts:191-193`). | P1 |
| C12. Prescription de trois ans | `regulariser_charges` refuse un complément si le 31/12 de l'exercice date de plus de trois ans. Le point de départ retenu (fin de l'exercice) n'est pas celui du texte. | à faire vérifier par un juriste | Voir question 6. D'ici là, avertir au lieu de refuser. | P1 |
| C14. Référence légale du forfait affichée à l'écran | L'écran écrit « le forfait est définitif (loi 89-462, art. 23-1) » (`formulaire-loyers.tsx:755-759`). | non conforme (sur extrait, à confirmer à la source) — référence fausse | Écrire « art. 25-10 (meublé) et art. 8-1 (colocation) ». | P1 |
| D1. Liste fermée ; sanction | Le bailleur demande une pièce par un libellé libre de 1 à 120 caractères (`src/app/actions/pieces-demandees.ts:41-47`). Seul le type est borné (identité, justificatif, attestation d'assurance). La demande est ouverte aux personnes sans bail ou avec un bail… | non conforme (sur extrait, à confirmer à la source) | Avant la signature du bail : n'offrir que la liste du décret (cases à cocher), sans libellé libre. Garder le libellé libre pour un locataire en place, avec un rappel. | P0 |
| D2. RIB | Bouton « + RIB » en tête des demandes fréquentes (`carte-pieces-demandees.tsx:29-34`), exemple « ex. : RIB » (`:182`), message « ex. : RIB, avis d'imposition » (`pieces-demandees.ts:44`), invite « identité, RIB, attestation… » (`page.tsx:597`). Proposé aussi… | avant le bail : non conforme (sur extrait, à confirmer à la source) ; après le bail : à faire vérifier par un juriste | Retirer le RIB des demandes fréquentes et des exemples ; ne le proposer qu'une fois le bail signé. | P0 |
| D4. Nombre de pièces | Aucune limite : plusieurs demandes du même type possibles. | à faire vérifier par un juriste | Avant le bail, une seule demande d'identité et une seule de domicile par personne. | P1 |
| D5. Attestation d'assurance demandée avant le bail | Type « attestation d'assurance » demandable à toute personne, bail signé ou non (`pieces-demandees.ts:46`). | à faire vérifier par un juriste | Ne l'ouvrir qu'à partir de la signature du bail. | P1 |
| D6. Pièces versées par le bailleur lui-même | Le bailleur dépose au dossier d'une personne une pièce de type « Autre » au titre libre (`src/lib/dossier.ts:3-8`, `src/app/actions/dossier.ts:45`). Rien n'empêche d'y verser un relevé de compte ou une carte Vitale. | à faire vérifier par un juriste | Rappel à l'écran du dépôt, pour une personne sans bail signé. | P1 |
| D7. Caution | Mêmes écrans que le locataire, aucune liste distincte. L'acte de cautionnement imprime nom, date et commune de naissance, adresse (`cautionnement.ts:114-115`) : ce sont des données d'identité, pas des justificatifs. | demandes de pièces : non conforme (sur extrait, à confirmer à la source), voir D1 et D2 | Liste de l'annexe II pour une personne au rôle de garant. | P0 |

### b.3 RGPD, décisions automatisées, flux financiers, activités réglementées

3 points en P0, 14 en P1, 28 en P2. P0 et P1 ci-dessous ; le reste en annexe b3.

| Point | Ce que fait Gerimmo | Verdict (provisoire) | Correction proposée | Priorité |
|---|---|---|---|---|
| A2. Artisans : note, indicateurs de fiabilité, classement | Table `artisan_evaluations` (`20260911180000_module8_artisans_socle.sql:558-597`). `artisan_note()` : moyenne pondérée (propriétaires 2/3, locataires 1/3), « publiable » à partir de 3 évaluations (l. 746-769). `artisan_indicateurs_fiabilite()` : délais, taux… | À faire vérifier par un juriste (profilage avec effet sur l'accès aux demandes ; analyse d'impact). | Rédiger l'analyse d'impact avant d'ouvrir le réseau au-delà du pilote. Ouvrir la contestation à la note agrégée et aux indicateurs, pas seulement à une évaluation. Écrire dans l'écran de l'artisan comment la note est calculée… | P1 |
| A3. Artisans : validation, refus, suspension, exclusion | Décisions humaines : `artisan_decider_plateforme` réservée au super administrateur, motif obligatoire pour refus, suspension et liste noire, trace dans `artisan_validations` ; action `src/app/actions/supervision-artisans.ts:14-63` (confirmation exigée pour… | Non conforme à l'engagement publié (A10) ; à faire vérifier pour le règlement 2019/1150. | Envoyer le courriel de motifs dans la même opération que la décision, ou réécrire A10 pour dire ce qui est fait. Prévoir l'avis trente jours avant une fermeture définitive (A10) : aucun mécanisme ne le porte aujourd'hui. | P1 |
| A7. Abonnement : échec de prélèvement, lecture seule, résiliation | Courrier automatique le jour de l'échec, qui « vaut mise en demeure » (conditions 15.2, `conditions/page.tsx:945-953` ; `src/lib/relances-paiement.ts:1-12`). Lecture seule automatique à J+15, ou dès l'échec pour un premier prélèvement (15.3), après preuve de… | À faire vérifier par un juriste (restriction d'accès automatique : exception « contrat » et garanties du § 3). | Ajouter à l'article 15.3 et au courrier d'échec une phrase : comment contester et obtenir un réexamen par une personne. Vérifier dans Stripe qu'aucune annulation automatique ne précède la décision humaine. | P1 |
| A9. Pièces demandées au candidat, au locataire, à la caution | Quatre types larges (`src/lib/dossier.ts:3-8`) et un libellé libre. Boutons d'un clic « RIB », « Avis d'imposition », « Justificatif de domicile », « Pièce d'identité » (`agence/[orgId]/personnes/[personId]/carte-pieces-demandees.tsx:29-34`), exemple du… | À faire vérifier par un juriste (le bailleur est responsable ; l'outil suggère une pièce hors liste pour un candidat). | Ne proposer « RIB » que pour une personne titulaire d'un bail signé. Afficher sous le champ la liste légale et l'interdiction des pièces exclues. Avertir, sans bloquer, sur un libellé interdit (relevé de compte, carte Vitale,… | P1 |
| A13. Dossier d'un candidat non retenu ou d'une personne sans bail | Règle `dossier:sans_bail` : 3 mois, inactive (`actif = false`). La page publique annonce « 3 mois, puis suppression » (`confidentialite/page.tsx:514-516`) et signale, dans un volet replié, les catégories dont le nettoyage est désactivé… | Non conforme à la durée publiée (elle n'est pas appliquée). | Faire le bilan sans suppression puis activer la règle, comme prévu par le wiki (`Durées de conservation.md`). | P1 |
| A16. Factures d'abonnement émises par Gerimmo | Règle `archive:facture` : 72 mois. Fiche client Stripe supprimée au terme des six ans (`src/lib/comptes-fermeture-serveur.ts:569`). Textes publiés : « six ans (… art. L. 102 B) » (`confidentialite/page.tsx:164, 663, 679-680, 739-741`), écran… | Non conforme d'après l'extrait (à confirmer à la source). Aucune suppression ne tombe avant 2032. | Passer `archive:facture` à 120 mois, corriger les quatre passages de la page confidentialité et l'écran de fermeture, garder la fiche client Stripe dix ans. Publier une nouvelle date de page. | P1 |
| A17. Artisans : évaluations, motif d'exclusion, inscription sans suite | Évaluations : règle `artisan:evaluation` 36 mois, inactive. Motif d'exclusion : échéance posée (`purge_motif_le`, 3 ou 5 ans) mais purge non planifiée, seulement rejouable à la main par `maintenance_artisans`. Inscription sans document : échéance à six mois… | Non conforme aux durées publiées. | Planifier la purge des motifs, coder ou retirer la suppression à six mois, activer la règle des évaluations après bilan. | P1 |
| A19. OpenAI : ce qui lui est envoyé, et ce qui en est dit | Trois envois à `api.openai.com`, tous avec `store: false`. (1) Devis : seulement la catégorie et des mots d'un lexique fermé (`proposition-devis-ia.ts:13-19, 43-50`). (2) Assistant privé : la question et l'historique en texte libre du propriétaire ou du… | Non conforme : les deux circuits ne sont décrits ni dans l'information des personnes ni dans la liste contractuelle… | Avant toute activation : (a) décrire les deux circuits dans la page confidentialité et dans `PRESTATAIRES`, donc publier une nouvelle version des conditions (l'annexe 1 fait partie du texte accepté) ; (b) nommer OpenAI et les… | P0 |
| A20. AR24 (recommandé électronique) | Le code envoie à AR24 le destinataire, son courriel, la dette et le texte du courrier (`src/lib/ar24.ts:4-12`, `src/app/actions/recommandes.ts`, tables `connexions_ar24`, `recommandes_ar24`). AR24 n'est ni dans `PRESTATAIRES` ni à l'annexe 1… | Non conforme si le service est activé ; sans objet tant qu'il reste éteint. | Ajouter AR24 à la liste et à l'annexe avant toute activation ; préciser qui contracte avec AR24 (le propriétaire ou Gerimmo). | P1 |
| A21. Transferts hors Union et accords de traitement | Prestataires déclarés (`src/lib/editeur.ts:175-290`) : Supabase (Paris), Vercel (fonctions à Paris, `vercel.json` `regions: ["cdg1"]`), Resend (Irlande, société américaine), Stripe (Irlande), Zoho Sign (centre de données de l'Union), OpenAI et GitHub… | À faire vérifier par un juriste. | Accepter et archiver, daté, l'accord de chaque prestataire ; relever pour chacun la certification ou les clauses ; consigner au registre. | P1 |
| A22. Sauvegarde quotidienne en clair sur des machines de GitHub | La base et les fichiers sont exportés sur les machines de GitHub Actions (États-Unis) puis chiffrés ; ils y passent en clair le temps du chiffrement (`src/lib/editeur.ts:244-271`, page confidentialité l. 386-390). | À faire vérifier par un juriste (et par l'audit de sécurité). | Chiffrer dans le même flux que l'export, ou exécuter la sauvegarde sur une machine située dans l'Union. | P1 |
| A23. Information des personnes | `src/app/confidentialite/page.tsx` : identité lue en base, absence de délégué, bases légales par traitement (l. 139-238), données, destinataires, hébergement et transferts, durées lues dans le catalogue, sécurité, droits, réclamation à la CNIL. Bandeau «… | Verdict réservé (non lu à la source), hors A19 et A20. | Corriger A19 et A20 ; mettre à jour la date de la page à chaque changement. | P1 |
| A29. Sécurité : deux points relevés au journal, non vérifiés ici | `log.md` l. 7853 : les aperçus Vercel reçoivent l'adresse et la clé publique de la base de production. `log.md` (entrées des 25/10 et suivantes) : antivirus des dépôts non raccordé. | À traiter par l'audit de sécurité. | Donner aux aperçus leurs propres réglages avant tout usage de la préproduction. | P0 |
| B7. Mise en relation de propriétaires et d'artisans | Le propriétaire sollicite un artisan, reçoit un devis et peut l'accepter par signature électronique dans Gerimmo (`api/devis/[sollicitationId]/signature`). Classement décrit dans les conditions 8.8 (`conditions/page.tsx:577-596`) et A5, « aucun artisan ne… | À faire vérifier par un juriste (qualification de place de marché ; obligations d'information à l'écran). | Si la qualification est retenue : une rubrique accessible depuis la liste (paramètres du classement, artisans professionnels validés, absence de rémunération), et près des notes : contrôle ou non des avis, période couverte. | P1 |
| B11. Médiation de la consommation | Les trois champs du médiateur sont vides par défaut (`src/lib/editeur.ts:40-42`). Sans eux : « Adhésion à venir : aucun organisme n'est désigné » (`mentions-legales/page.tsx:62-70`) et, à l'article 17, « sera désigné aux mentions légales dès l'adhésion »… | Non conforme d'après l'extrait tant que des consommateurs contractent sans médiateur désigné (à confirmer à la source… | Adhérer à un médiateur référencé et saisir ses coordonnées avant toute ouverture des ventes. Garder le verrou. | P0 |
| B12. Mentions légales | Tous les faits sont lus en base (`supervision_identite.valeurs`) et affichés ; un fait manquant s'affiche « à fournir » et la page se signale incomplète (`mentions-legales/page.tsx:25-47`, `src/lib/editeur.ts:66-75`). Hébergeurs : Vercel et Supabase,… | À faire vérifier par un juriste (et relever la page publiée). | Lire `/mentions-legales` en production : aucune mention « à fournir », forme « EI » présente. Corriger la référence d'article dans le commentaire de `editeur.ts:6-9` une fois lue. | P1 |
| B13. Conditions générales de vente et information précontractuelle | Conditions du 15/11/2026 (`CONDITIONS_VERSION`, `src/lib/editeur.ts:403-406`) : parcours de souscription (3.2), prix (8.1), rétractation et formulaire type (8.10), reconduction (8.7 et annexe 2), garanties (14 bis), impayé (15). Le prix de l'article 8.1… | À faire vérifier par un juriste. | Relire les articles 8.7, 8.10, 14 bis et 15 contre les textes ouverts ; mettre à jour la page wiki des tarifs (hors de ce volet). | P1 |

**Constats de fait, lus dans le code** :
- **Article 22 du RGPD** : aucune note ni sélection de candidat locataire ; aucune attribution automatique d'une
  intervention ; aucune mise en demeure d'un locataire sans geste humain ; aucune décision prise par l'IA. Le
  classement des artisans par note et la suspension d'un abonnement après un impayé sont les deux sujets à faire
  examiner (JURISTE.md).
- **Encaissement** : Stripe n'encaisse que l'abonnement du propriétaire. Aucun loyer payé en ligne, aucun dépôt de
  garantie détenu, aucun paiement d'artisan, **aucune commission**. Les ventes sont fermées.
- **Assurance** : aucune vente ni recommandation active ; les « conseils pour choisir son locataire » sont masqués.
- **Mise en relation avec des artisans** : c'est le point d'activité réglementée le plus sérieux à faire qualifier
  (obligations d'information des plateformes) : JURISTE.md.

---

## c) Écart de fonctions avec les plateformes de référence

> **Limite** : pages publiques **non ouvertes** (réseau), fonctions relevées sur des extraits de recherche. Rien n'a
> été copié : seules des fonctions sont relevées, reformulées.

**Déjà au niveau** : baux nu, meublé et colocation ; 54 modèles de documents ; quittances ; régularisation des
charges ; aide à la déclaration 2044 ; espace locataire ; cycle d'incident complet ; artisans vérifiés ; notes.

**Les écarts qui comptent pour le palier 1** (détail et tableau complet en annexe c) :

| # | Écart | Pour qui | Taille | Dépend d'un service payant ou d'un point juridique ? |
|---|---|---|---|---|
| 1 | Avis d'échéance et relances d'impayé : codés, envoi suspendu | Propriétaire | Petit | Relecture des textes des courriers |
| 2 | Signature électronique (bail, état des lieux, caution, devis) : codée, sous interrupteurs | Propriétaire | Petit | Service payant (Zoho Sign) |
| 3 | Recommandé électronique pour la mise en demeure : codé, jamais relié | Propriétaire | Petit | Service payant (AR24), accord du locataire |
| 4 | Photos à l'état des lieux | Propriétaire, locataire | Moyen | Non |
| 5 | Indice de révision du loyer proposé au lieu d'être saisi | Propriétaire | Petit à moyen | Non (série INSEE déjà lue par l'outil public) |
| 6 | Pointage des loyers à partir d'un relevé exporté de la banque | Propriétaire | Moyen | Non (la lecture bancaire directe, elle, demande un prestataire agréé) |
| 7 | Repère de prix avant de solliciter un artisan | Propriétaire | Moyen | Formulation à faire relire |
| 8 | Rappels de rendez-vous : codés, envoi suspendu | Locataire | Petit | Non |
| 9 | Disponibilités demandées dès la déclaration de l'incident | Locataire | Petit | Non |
| 10 | Garantie annoncée par l'artisan, affichée | Locataire | Petit | Non |
| 11 | Semaine type et périodes d'absence | Artisan | Moyen | Non |
| 12 | Lignes de devis réutilisables, sans IA | Artisan | Moyen | Non |
| 13 | Numérotation automatique des factures et contrôle des mentions | Artisan | Petit à moyen | À valider avec un expert-comptable |
| 14 | Relance d'une facture en retard ; rendez-vous manqué consigné | Artisan | Petit | Non |

**À ne pas faire** (hors sujet ou activité réglementée) : encaisser pour le compte d'un tiers ; vendre de
l'assurance ; tenir une comptabilité complète, produire des liasses, télétransmettre ; noter ou classer des
candidats locataires ; garantir les interventions ou fixer les prix ; baux commerciaux ; outils de chantier ; offres
pour agences (palier 2). La facturation électronique et l'acompte au devis sont des décisions à prendre
(QUESTIONS.md).

---

## d) Dépendance à l'IA

Un seul fournisseur : OpenAI. **Le cœur du métier n'appelle jamais l'IA** : baux, loyers, quittances, relances,
charges, signatures, **déclaration d'incident (c'est déjà un formulaire, il n'existe aucun bot)**, choix de
l'artisan, **créneaux de rendez-vous (déjà choisis à la main)**, envoi de devis.

| # | Fonction qui utilise l'IA | Pour qui | Sans IA aujourd'hui | Équivalent manuel | À construire |
|---|---|---|---|---|---|
| 1 | Assistant « Demander à Gerimmo » | Propriétaire, locataire | Le bloc reste affiché et renvoie une erreur après la saisie | Messagerie, formulaire de signalement, FAQ, « Aide et retours » | Masquer le bloc, afficher les liens d'aide (petit) |
| 2 | Lecture assistée d'une facture | Propriétaire | Message « non activée », saisie conservée | Oui : tous les champs se remplissent à la main | Masquer le bouton (petit) |
| 3 | Lecture d'une photo de compteur | Locataire | Idem | Oui : index saisi à la main | Masquer le bouton (petit) |
| 4 | Proposition de devis | Artisan | Repli sur un catalogue, mais première ligne préremplie sans rapport avec la panne | Partiel : pas de vrai devis vierge | Devis vierge (petit) |
| 5 | Brief IA | Super admin | Section masquée | Oui : le point du matin est calculé sans IA | Brancher sur l'interrupteur (petit) |
| 6 | Rédaction d'un article | Super admin | **Écran sans autre chemin** | Non depuis cet écran | Brouillon vierge (petit) |
| 7 | Étude d'une actualité réglementaire | Tâche de fond | La mission ressort en échec chaque jour | Oui, mais l'écran ne le dit pas | État neutre et libellé (petit à moyen) |
| 8 | Rédaction d'un post | Tâche de fond | Repli automatique sur un sujet du catalogue | Oui | Rien |
| 9 | Image d'un post | Tâche de fond | **Bloquant : aucun post sans image générée** | Non pour le circuit automatique | Image sans IA, ou post sans image (moyen) |
| 10 | Atelier de corrections | Super admin | Bouton désactivé | Sans objet | Masquer (petit) |

**Où Gerimmo ne fonctionne pas sans IA aujourd'hui** : posts automatiques (9), écran « Créer un article » (6),
étude de veille (7, la décision manuelle existe mais n'est pas proposée), assistant (1, erreur après saisie). Et la
page Santé prend l'IA coupée pour une panne.

**Aucun réglage ne permet aujourd'hui « IA coupée, tout le reste en marche »** : la limite à zéro, les arrêts
d'urgence et l'absence de clé coupent trop large ou affichent des messages faux. Le garde-fou central existe déjà
(toute fonction IA passe par une réservation en base) : l'interrupteur s'y branche.

**Décisions sur des personnes** : aucune n'est prise par l'IA. Deux points d'attention : les posts rédigés par l'IA
paraissent seuls sur le site et sur Facebook sauf veto (réglage par défaut des migrations ; valeur de production non
lue) ; les réponses de l'assistant sont affichées sans relecture humaine.

Détail et proposition d'interrupteur : annexe d.

---

## e) Plan de correction — liste fermée

Règle : ce plan est la liste complète du travail. Aucune fonction n'est ajoutée en dehors.
« **Source à ouvrir** » = la correction touche une règle de droit ; elle n'est faite qu'après lecture du texte
officiel. Si le texte ne peut pas être ouvert, ou s'il laisse un doute, le point part dans JURISTE.md et Gerimmo
garde le comportement le plus prudent (avertir plutôt qu'affirmer, ne pas bloquer sans base).

### P0 — risque légal, sécurité, perte ou erreur sur les données

| N° | Correction | Pourquoi | Condition |
|---|---|---|---|
| P0-01 | Donner à la préproduction ses propres réglages : les aperçus ne doivent plus pointer vers la base de production | Un aperçu utilisé écrirait en production | Copie de base (QUESTIONS Q1) |
| P0-02 | Complément de charges payé par l'échéancier : le rejouer, puis faire que le décompte de sortie ne le retienne pas une seconde fois | Somme réclamée deux fois au locataire | Confirmer en exécution |
| P0-03 | Charges de copropriété : plus de « récupérable » par défaut ; chaque ligne naît « à qualifier » avec une suggestion ; recherche par mots entiers ; part récupérable en pourcentage (gardien) | Dépenses non récupérables mises à la charge du locataire | Source à ouvrir (décret 87-713) |
| P0-04 | Pièces demandées : avant la signature du bail, liste fermée ; « RIB » retiré des demandes rapides ; liste propre à la caution ; attestation d'assurance seulement à partir du bail | Pièces interdites, amende | Source à ouvrir (décret 2015-1437) |
| P0-05 | Dépôt de garantie : refuser de finaliser un décompte dont une retenue n'a pas de justificatif | Retenues « dûment justifiées » | Source à ouvrir (art. 22) |
| P0-06 | État des lieux de sortie : imprimer la date de l'état des lieux d'entrée | Mention obligatoire | Source à ouvrir (décret 2016-382) |
| P0-07 | Notice d'information : remplacer le résumé maison par le texte officiel en vigueur, daté | Annexe obligatoire du bail | Source à ouvrir (arrêté) |
| P0-08 | Congés du bailleur pour vente ou reprise : mentions obligatoires (adresse du bénéficiaire, raisons, texte de la loi reproduit, notice jointe), point de départ du délai écrit juste | Nullité du congé | Source à ouvrir (art. 15) |
| P0-09 | Cautionnement : refuser l'acte quand le bailleur est une personne morale hors les cas permis | Cautionnement interdit | Source à ouvrir (art. 22-1) |
| P0-10 | Déclarer les deux envois à OpenAI (assistant, lecture de factures) dans la page de confidentialité et la liste des prestataires ; prévenir sur le bouton | Information des personnes | — |
| P0-11 | Devis et factures d'artisan produits par Gerimmo : numérotation automatique et continue, contrôle des mentions avant envoi, mention de franchise de TVA | Mentions obligatoires | Source à ouvrir ; expert-comptable (JURISTE) |

Deux P0 ne se règlent pas par du code : l'adhésion à un **médiateur de la consommation** (les ventes restent
fermées tant qu'il manque) et la qualification de la **mise en relation avec des artisans** : QUESTIONS.md et
JURISTE.md.

### Interrupteur IA (demandé par la mission)

| N° | Travail |
|---|---|
| IA-01 | Réglage super admin « IA activée / désactivée » dans les paramètres généraux, enregistré en base, journalisé ; refus en base de tout appel quand l'IA est coupée |
| IA-02 | Un seul état lu par tous les écrans : « active », « désactivée », « non connectée » |
| IA-03 | Équivalents manuels : assistant masqué avec liens d'aide ; boutons de lecture masqués ; **devis vierge** ; **brouillon d'article vierge** ; veille en saisie manuelle annoncée ; atelier masqué |
| IA-04 | Tâches de fond : veille et marketing sans échec quand l'IA est coupée ; post sans image générée (image déposée ou visuel fixe de marque) |
| IA-05 | Page Santé et e-mail du matin : l'IA coupée n'est plus comptée comme une panne |
| IA-06 | Tests des deux modes, par espace (propriétaire, locataire, artisan, super admin) |

### P1 — fonction cassée ou incomplète

| N° | Correction | Condition |
|---|---|---|
| P1-01 | Signature électronique d'un bail avec garant : le lien de confirmation du mobile doit partir | — |
| P1-02 | Reprise comptable : retrouver la reprise ouverte après un rechargement ; bouton « abandonner » | — |
| P1-03 | Facture d'artisan erronée : refus motivé et remplacement | — |
| P1-04 | Incident : le bailleur peut corriger l'urgence après la déclaration | — |
| P1-05 | Messagerie d'intervention : notification des nouveaux messages, tests | — |
| P1-06 | Signature côté locataire : retirer le chemin mort, afficher l'état de la signature en cours | — |
| P1-07 | Évaluation d'artisan : écran du super admin pour retirer une évaluation (promis à l'artisan) | — |
| P1-08 | Envois prévus et suspendus : avis d'échéance, relances amiables, rappels de rendez-vous, relance d'invitation — prêts, testés en préproduction, activables par réglage | Activation = votre décision (QUESTIONS) |
| P1-09 | Restitution du dépôt : majoration de retard calculée ; nouvelle adresse du locataire ; délai d'un mois quand la sortie est conforme ; « décompte rectificatif » promis par l'écran | Source à ouvrir (art. 22) |
| P1-10 | Régularisation des charges : suite donnée au solde (appel ou avoir) ; décompte par nature ; référence d'article fausse à l'écran | Source à ouvrir (art. 23) |
| P1-11 | Bail : durée réduite cohérente dans le contrat ; rédaction de la clause résolutoire ; préavis du locataire en zone tendue ; date limite du congé du bailleur ; reprise refusée à une société non familiale ; DPE : retenir le diagnostic valide le plus récent (**erratum du 22/11 : sans objet, voir « Errata »**) | Source à ouvrir |
| P1-12 | État des lieux : pas de signature d'une grille sans pièce ; observation obligatoire pour « mauvais » ou « absent » ; complément des dix jours ; état des lieux d'entrée établi hors Gerimmo ; barème de vétusté présenté pour ce qu'il est | Source à ouvrir |
| P1-13 | Révision du loyer : indice proposé (table tenue à jour, source et date affichées) ; alerte à la date anniversaire | — |
| P1-14 | Avenant : enregistrer l'avenant signé et appliquer ses effets sur le loyer et la provision | — |
| P1-15 | Conservation des données : activer les règles inactives après bilan ; purge planifiée des motifs d'exclusion ; durée des factures | Source à ouvrir |
| P1-16 | Artisans : courriel de motifs lors d'un refus ou d'une suspension | — |
| P1-17 | Sécurité : vérifier l'absence des comptes de démonstration en production ; planifier l'exercice de restauration ; refuser d'abord l'appel sans secret sur la route planifiée | Lecture seule en production |
| P1-18 | Mise en demeure par recommandé électronique : la fonction n'est reliée à rien — la masquer tant que le service n'est pas décidé, garder le courrier PDF | Décision (QUESTIONS) |
| P1-19 | Écrans sans lien pour le propriétaire (Statistiques, Règles, Journal) : les relier ou les retirer ; une seule déclaration d'incident côté gestionnaire | — |

### P2 — écart avec les références, hygiène

| N° | Correction |
|---|---|
| P2-01 | Photos à l'état des lieux |
| P2-02 | Disponibilités du locataire demandées dès la déclaration d'un incident ; garantie de l'intervention affichée |
| P2-03 | Artisan : semaine type et périodes d'absence |
| P2-04 | Artisan : lignes de devis réutilisables ; relance d'une facture en retard ; rendez-vous manqué consigné |
| P2-05 | Pointage des loyers à partir d'un relevé de banque exporté |
| P2-06 | Agenda du propriétaire : échéances de loyer, états des lieux, fins de bail |
| P2-07 | Repère de prix avant de solliciter un artisan (formulation à faire relire) |
| P2-08 | Ménage : tables et fonctions abandonnées, code en double, droits sans politique, vue signalée par Supabase, fonction sans chemin de recherche fixé, pages du wiki en retard |
| P2-09 | Récapitulatif fiscal : seuils sortis du code |

### Hors plan

- **Palier 2 (agences)** : contrôle du seuil de délégation du mandat ; invitation d'un artisan par une agence ;
  domicile du bailleur sur les documents en mode agence ; second facteur obligatoire pour les administrateurs
  d'agence.
- **À ne pas faire** : voir la fin du volet c).
- **Hors de ma portée** : médiateur, accords de traitement signés avec les prestataires, copie de la clé des
  sauvegardes, choix d'un antivirus et d'un prestataire de signature : QUESTIONS.md.

---

## Errata

L'audit est une lecture du code. Chaque point est réexécuté avant d'être corrigé (phase 2) ; quand l'exécution
contredit la lecture, le point est rectifié ici plutôt que réécrit en silence.

- **22/11/2026 — relevé 14, point (a), et ligne P1-11 du plan (« DPE : retenir le diagnostic valide le plus
  récent »).** L'audit affirmait qu'un ancien diagnostic classé G continuait de bloquer la location après
  l'enregistrement d'un diagnostic plus récent. **C'est faux.** Exécuté sur une base d'essai : enregistrer un nouveau
  diagnostic archive le précédent (déclencheur `diagnostics_remplacement`), et un diagnostic archivé ne bloque plus
  rien. La lecture du code n'avait pas vu ce déclencheur. Aucune correction n'est donc livrée sur ce point ; la
  correction commencée a été retirée entièrement, et un test tient le comportement réel
  (`tests/dpe-remplace-ne-bloque-plus-base.test.ts`). Ce que l'exécution a montré à la place : c'est le dernier
  diagnostic ENREGISTRÉ qui décide, pas le plus récent par sa date — décision laissée au dirigeant (QUESTIONS.md, Q28).
  Les deux autres défauts du relevé 14 (bail signé après le 01/01/2025, échéance de 2028) ne sont pas concernés par
  cet erratum : ils restent « à faire vérifier », faute de texte officiel ouvert.

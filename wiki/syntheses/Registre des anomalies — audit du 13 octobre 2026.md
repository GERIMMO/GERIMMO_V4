---
type: synthesis
tags: [audit, anomalies, registre, v1, mission-operationnelle]
status: in-progress
created: 2026-10-13
updated: 2026-10-13
sources: []
---

# Registre des anomalies — audit du 13 octobre 2026

Registre vivant de la mission opérationnelle du 12/10/2026, tenu au fil des résultats. Version testée :
commit `e9f31ac` de `main` (PR #177 incluse), banc local isolé et gratuit, aucun effet réel. **Chaque ligne vient d'une
observation ou d'une preuve citée par l'agent qui l'a relevée** ; une ligne « hypothèse » n'a pas été reproduite.

Gravité : **P0** sécurité critique, perte de données ou service indisponible ; **P1** parcours essentiel bloqué ou calcul
erroné ; **P2** dégradation avec contournement ; **P3** cosmétique. Statuts : *ouverte*, *corrigée en branche* (commit poussé, non déployé), *déployée* (en production), *à trancher*
(aval du dirigeant), *acceptée*, *hypothèse* (à vérifier), *réfutée*.

## Synthèse

| Gravité | ouverte | corrigée en branche | déployée | à trancher | acceptée | hypothèse | réfutée | Total |
|---|---|---|---|---|---|---|---|---|
| **P0** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| **P1** | 0 | 1 | 0 | 0 | 0 | 0 | 0 | **1** |
| **P2** | 9 | 24 | 0 | 11 | 1 | 0 | 0 | **45** |
| **P3** | 53 | 12 | 0 | 2 | 0 | 0 | 0 | **67** |
| **Total** | 62 | 37 | 0 | 13 | 1 | 0 | 0 | **113** |

Sources lues : auditeur/a, auditeur/b, auditeur/c, chaine/1, chaine/1b, chaine/2, coordinateur, proprietaire/s01, relecture/finance, relecture/pr178/a, relecture/pr178/b, relecture/reprises, relecture/supervision, superadmin.

> [!warning] Couverture à ne pas surestimer
> Ce registre ne couvre que ce que les agents ont effectivement exécuté (voir le registre d'exécution à venir).
> Les rôles ou volets absents de la colonne « Sources lues » n'ont pas encore rendu de rapport : leur absence n'est
> pas une preuve d'absence d'anomalie.

## P0 — sécurité critique, perte de données, service indisponible (0)

Aucune anomalie de cette gravité à ce jour.

## P1 — parcours essentiel bloqué ou calcul erroné (1)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `FIN-01` | relecture/finance | Le document « Récapitulatif annuel · location nue » appelle le nouveau recapitulatifFiscal sans qualifications, composantes ni exercices : toutes les rubriques s'impriment à 0,00 €. | corrigée en branche — commit cddf339 (tests rouges puis verts) |

### Fiches P1

#### `FIN-01` — Le document « Récapitulatif annuel · location nue » appelle le nouveau recapitulatifFiscal sans qualifications, composantes ni exercices : toutes les rubriques s'impriment à 0,00 €.

- **Observé** : Propriétaire direct, lot nu avec 3 loyers encaissés (3 x 840 €, composantes bien capturées par le déclencheur) et 3 dépenses (assurance 300, travaux 1 200, taxe foncière 900) en 2026. Il génère le document « Récapitulatif annuel · location nue » depuis le catalogue (intérêts 0). Le PDF stocké dans la GED affiche 211 = 0,00 €, 223/224/227 = 0,00 € et « Périmètre : 6 écritures enregistrées », puis affirme « Les loyers et provisions sont ventilés selon les montants du bail enregistrés lors de la génération ». L'ancienne fonction (1e464f1) donnait 211 = 2 340, 223 = 300, 224 = 1 200, 227 = 900. Le générateur passe encore l'option ventilationLoyers, que la nouvelle fonction ignore, et ne lit jam…
- **Cause probable** : app/src/lib/documents/modeles/catalogue-gestion.ts:131-148 (appel à recapitulatifFiscal ligne 143)
- **Correction proposée** : Faire charger au générateur les mêmes données que l'écran (qualifications, composantes, exercices du lot et de l'année) et appeler recapitulatifFiscal avec exigerPerimetre:true ; imprimer les alertes et « à compléter » à la place de 0,00 € ; retirer la phrase sur la ventilation par les montants du bail. À défaut, refuser le document avec un message renvoyant à l'écran fiscal tant que des pièces sont à qualifier.
- **Preuve (banc)** : preuves/relecture/finance/ts/extrait_document_recap_fiscal_nu.txt (sortie du vrai assemblerComplementGestion, lignes lues dans la copie gerimmo_ci_rel_finance) ; comparaison ancien/nouveau : exécution de preuves/relecture/finance/ts/t2.mts (ancien 2340/300/1200/900 ; nouveau 0 partout, 3 alertes) ; banc 3100 non utilisé (la génération écrirait en GED sur la base d'intégration). Chemin HTTP/PDF non exercé, calcul et HTML exercés.
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : documents « récapitulatif nu » produits depuis la mise en ligne (à ouvrir : rubriques à 0,00 € attendues). select d.id, d.organization_id, d.titre, d.created_at from public.documents d where d.titre = 'Récapitulatif annuel · location nue' and d.created_at >= '2026-10-12' order by d.created_at;`
- **Statut** : corrigée en branche — commit cddf339 (tests rouges puis verts)

## P2 — dégradation avec contournement (45)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `AUD-B-04` | auditeur/b | Hypothèse à vérifier : la limite de corps des fonctions Vercel (4,5 Mo, d'après la documentation de la plateforme) est inférieure aux 10 Mo annoncés pour un dépôt de pièce *(hyp.)* | ouverte |
| `AUD-C-02` | auditeur/c | Les 8 taches pg_cron (cycle mensuel des appels de loyer, retention, alertes d'impayes, declencheur marketing) ne sont ni sauvegardees, ni decrites dans la procedure de restauration, ni surveillees par Sante | ouverte — complète SUP-01 : même cause, côté sauvegarde et restauration |
| `PROP-03` | proprietaire/s01 | Un fichier de plus de 10 Mo provoque une erreur HTTP 500 et un message sans rapport avec la cause | ouverte |
| `PROP-14` | proprietaire/s01 | Entrée en cours de mois : le premier terme (prorata) est exigible le 1er du mois, avant l'entrée, et passe tout de suite en « Impayé » | ouverte |
| `FIN-07` | relecture/finance | Le filtre par mot-clé « fonds travaux / alur » écarte la pièce avant de consulter la qualification justifiée du propriétaire : une dépense qualifiée « déductible 224 » reste exclue des charges et la qualification est enregistrée mais sans effet. | ouverte |
| `FIN-11` | relecture/finance | Les migrations ne rétro-capturent aucun loyer existant et la reprise « retrouver_ventilation_fiscale » refuse tout bail qui a plus d'un appel : sur les données réelles déjà en production, le récapitulatif 2044 passe à 0 € de loyers et chaque pièce doit être q… | ouverte |
| `PR178-A-03` | relecture/pr178/a | Après une réponse perdue à la création d'une fiche personne, le bouton d'envoi reste désactivé pour toujours : la saisie et les pièces « restent disponibles » mais ne peuvent plus être envoyées ; seule issue : effacer la copie et tout ressaisir | ouverte — 36219ec corrige le cas de la session expirée ; le cas de la réponse perdue demande une décision (reprendre la… |
| `SUP-01` | relecture/supervision | L'arret d'urgence (global ou par mission) ne couvre pas les 8 taches SQL planifiees par pg_cron : seules les routes Next/Vercel appellent verifier_arret_supervision. | ouverte |
| `SUP-05` | relecture/supervision | Les « faits de direction » copient, pour toutes les organisations, des données personnelles (titres d'alertes contenant le nom du locataire, ex. « État des lieux d'entrée — Lot 1 · Marie Durand ») dans brief_direction_snapshots, sans aucune trace d'audit par… | ouverte |
| `AUD-A-01` | auditeur/a | Un agent restreint modifie les équipements d'un lot hors de son portefeuille (RPC definir_equipements_lot) | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — garde de portefeuille, test rouge puis vert |
| `AUD-A-02` | auditeur/a | L'annulation d'une écriture comptable (contre_ecriture) n'enregistre pas son auteur | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit avec auteur |
| `AUD-A-03` | auditeur/a | L'annulation d'une mission artisan (annuler_mission) ne garde ni auteur ni événement | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — événement « mission annulée » au fil de l'inci… |
| `AUD-A-04` | auditeur/a | La suppression d'une détention (quote-part de propriété d'un lot) ne laisse aucune trace | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit « détention supprimée » |
| `AUD-B-01` | auditeur/b | E-mails de relance, d'appel et de rappel : valeurs saisies insérées sans échappement HTML | corrigée en branche — 35b2501 — les valeurs saisies sont échappées dans les quatre courriers, 7 tests rouges puis verts |
| `AUD-B-02` | auditeur/b | Aucune limite de longueur à l'inscription : un nom très long rend le compte inutilisable (HTTP 431 sur tout le site) | corrigée en branche — bf73fdc — garde de longueur côté serveur et maxLength, 2 familles de tests |
| `AUD-C-01` | auditeur/c | Un encaissement a 3 decimales (ou 0,004 EUR) et date dans le futur est accepte et ecrit au journal comptable | corrigée en branche — 0555f43 pour la saisie ; les contraintes CHECK en base ne sont pas ajoutées (données de productio… |
| `PRO2-14` | chaine/1b | La justification de la qualification, rédigée comme note de décision, est affichée mot pour mot au locataire sans que le formulaire le dise | corrigée en branche — 611dce2 — le formulaire dit que la justification est montrée au locataire |
| `MKT-01` | coordinateur | La préparation du soir du marketing n'a jamais été déclenchée par pg_cron : pas de fenêtre de veto la veille, seul le rattrapage de la matinée préparait les posts | corrigée en branche — commit 9d5ed9d ; migration 20261013110000 à appliquer en production |
| `PUB-01` | coordinateur | Le formulaire « Agences » de l'accueil était le seul canal de contact des pages légales (exercice des droits sur les données) tant que l'adresse de l'éditeur manque ; il restait une demande de devis commerciale | corrigée en branche — commit e7982a7 |
| `PROP-02` | proprietaire/s01 | Code postal à 4 chiffres et année 1500 acceptés et enregistrés à la création du bien | corrigée en branche — d6ef891 — code postal du bien sur cinq chiffres, année de construction de 1600 à année+5 |
| `PROP-07` | proprietaire/s01 | Fiche personne : date de naissance future, téléphone « abc » et code postal « 75 » acceptés | corrigée en branche — d6ef891 — date de naissance, téléphone et code postal contrôlés côté serveur |
| `PROP-12` | proprietaire/s01 | Encaissement à 3 décimales accepté et stocké tel quel : totaux affichés incohérents au centime | corrigée en branche — 0555f43 — montant au centime près refusé côté serveur (la colonne numeric(12,2) n'est pas modifié… |
| `PROP-13` | proprietaire/s01 | Un encaissement daté dans le futur (01/01/2027) est accepté et compté comme déjà reçu | corrigée en branche — 0555f43 — date d'encaissement dans le futur refusée côté serveur, sélecteur plafonné à aujourd'hui |
| `PR178-A-01` | relecture/pr178/a | Les brouillons de fiche personne et d'incident (identité, naissance, adresse, e-mail, téléphone, pièces jointes) restent en clair dans IndexedDB 7 jours, ne sont pas effacés à la déconnexion et restent lisibles depuis la session d'un autre compte sur le même… | corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes, message mis à jour ; la durée de 7 j… |
| `PR178-A-02` | relecture/pr178/a | Les formulaires de filtre GET sans attribut method (Finances, catalogue de documents, récapitulatif fiscal) sont suivis comme des saisies à protéger : « Afficher » ou Entrée déclenche la boîte native « Quitter le site ? » et « Rester » bloque le filtre | corrigée en branche — 36219ec — seuls les formulaires qui confirment un envoi sont suivis |
| `PR178-A-04` | relecture/pr178/a | Chaque frappe dans la fiche personne réécrit tous les fichiers joints dans IndexedDB : 3 pièces de 9 Mo + 40 caractères = 1,2 Go d'écritures disque transitoires (copie de 27 Mo) | corrigée en branche — 36219ec — copie écrite 500 ms après la dernière frappe (les pièces sont encore réécrites une fois… |
| `PR178-A-05` | relecture/pr178/a | Session expirée : un envoi refusé par redirection est présenté comme « confirmation non reçue » (aucune mention de la session, aucun lien de reconnexion) ; sur la fiche personne il verrouille en plus le formulaire (création « incertaine » alors que rien n'est… | corrigée en branche — 36219ec — message « session expirée » dédié ; reconnexion par un autre onglet |
| `PR178-B-01` | relecture/pr178/b | Session expirée pendant la saisie : l'envoi échoue avec « La confirmation n'a pas pu être reçue… Votre saisie est conservée » sans jamais dire que la session a expiré ; le renvoi échoue de la même façon ; la saisie est perdue à la reconnexion | corrigée en branche — 36219ec — même correction que PR178-A-05 |
| `PR178-B-05` | relecture/pr178/b | Les formulaires de recherche ou de filtre sans attribut method="get" sont suivis comme des saisies à protéger : chaque recherche déclenche l'avertissement « Quitter le site ? » et reste bloquée si l'on refuse | corrigée en branche — 36219ec — même correction que PR178-A-02 |
| `REP-01` | relecture/reprises | contre_proposer_creneaux n'est pas rejouable : un second envoi (reponse perdue, double envoi) marque comme REFUSEES les propositions du locataire lui-meme, porte le compteur a 6 et declenche une alerte critique d'arbitrage fantome | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — second envoi sans effet, liste corrigée = anci… |
| `SUP-02` | relecture/supervision | Pendant une session de diagnostic artisan ouverte (30 min), le trigger de lecture seule est pose sur TOUTES les tables de public, y compris supervision_arrets / supervision_operations : l'arret d'urgence est refuse. | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — l'arrêt d'urgence ne dépend plus d'un diagnost… |
| `SA-04` | superadmin | Mode relais actif et arrêt d'urgence invisibles hors de /admin/relais : aucun bandeau dans la console, les pages Équipes et Brief ne signalent pas l'arrêt | corrigée en branche — 9978efa — bandeau d'arrêt d'urgence et de relais sur toute la console |
| `SA-08` | superadmin | Journal d'audit : 9 types d'actions sans libellé (« Action enregistrée (libellé manquant) »), dont l'octroi du rôle de super-administrateur et les décisions de support, et la suppression d'un encaissement présentée comme « Nettoyage de données arrivé à échéan… | corrigée en branche — 9978efa — neuf codes nommés, plus de repli « suppression = nettoyage » |
| `PRO2-01` | chaine/1 | Un propriétaire dont la commune n'est pas ouverte au réseau ne peut solliciter aucun artisan, même un artisan connu : le carnet ne se remplit que par une intervention déjà confiée | à trancher — choix produit : réseau fermé pour la commune du propriétaire, carnet sans formulaire d'ajout |
| `ART-13` | chaine/1b | L'artisan ne peut pas déposer une version 2 de son devis : la demande close devient lecture seule, sans « réviser mon devis » | à trancher — fonction manquante : l'artisan ne peut pas déposer une version 2 de son devis |
| `PRO2-12` | chaine/1b | Un devis reçu ne peut être que retenu : ni refus motivé, ni demande de révision (écart avec le référentiel : déposé, validé, refusé ou expiré) | à trancher — fonction manquante : un devis reçu ne peut pas être refusé ni renvoyé en révision |
| `PRO2-13` | chaine/1b | Réception d'un devis : aucune alerte dans l'application, seulement un e-mail ; l'incident n'est pas compté « À traiter » | à trancher — aucune alerte dans l'application à la réception d'un devis (e-mail seul) : création d'une alerte en base à… |
| `ART-21` | chaine/2 | Rien n'empêche de démarrer, de terminer et de facturer plusieurs jours avant le rendez-vous confirmé avec le locataire | à trancher — règle métier : démarrer, terminer et facturer avant le rendez-vous confirmé |
| `CHN-01` | chaine/2 | Les créneaux non retenus sont enregistrés « refusés » : après trois reports, l'artisan est bloqué et l'écran impute au locataire des refus qu'il n'a jamais faits | à trancher — règle métier : les créneaux non retenus comptent aujourd'hui comme refusés (six refus = arbitrage) ; une c… |
| `LOC-21` | chaine/2 | Le locataire ne peut ni reporter ni annuler un rendez-vous confirmé : aucun geste après la confirmation | à trancher — fonction manquante : le locataire ne peut ni reporter ni annuler un rendez-vous confirmé |
| `PRO2-21` | chaine/2 | Le règlement de la facture de l'artisan n'est pas un geste de l'application : l'écriture du journal n'est liée à rien et la facture ne passe jamais à « réglée » | à trancher — fonction manquante : le règlement d'une facture d'artisan n'est lié ni à la facture ni à l'incident |
| `PR178-B-04` | relecture/pr178/b | Les formulaires passés par useActionStateProtegee ne s'envoient plus avant l'hydratation : l'amélioration progressive des actions serveur est perdue sur une soixantaine de formulaires | à trancher — clic avant hydratation sans effet visible : désactiver le bouton jusqu'à l'hydratation, formulaire par for… |
| `PR178-B-06` | relecture/pr178/b | Encaissement après réponse perdue : la saisie conservée et le bouton actif permettent de rejouer l'envoi, et l'action serveur n'a pas de clé d'idempotence (double encaissement constaté) | à trancher — rejeu possible d'un encaissement après réponse perdue : demande une clé d'idempotence et une contrainte en… |
| `SA-01` | superadmin | Traversée de la supervision dans un espace client : écriture financière possible sans motif ni durée, et la ligne d'audit 'traversee_action' ne dit ni quelle action, ni sur quel objet, ni avec quel résultat | à trancher — limite déjà actée au wiki (audit du 25/09) : entrée dans un espace client sans motif ni durée ; l'écriture… |
| `PROP-BANC-01` | proprietaire/s01 | Banc : serveur :3100 démarré sans SUPABASE_SERVICE_ROLE_KEY (inscription et liens bloqués) | acceptée — défaut du banc d'essai, pas du produit ; banc-up.sh vérifie la clé de service |

### Fiches P2

#### `AUD-B-04` — Hypothèse à vérifier : la limite de corps des fonctions Vercel (4,5 Mo, d'après la documentation de la plateforme) est inférieure aux 10 Mo annoncés pour un dépôt de pièce

- **Attendu** : Dépôt accepté jusqu'à 10 Mo ou message clair
- **Observé** : next.config.ts règle bodySizeLimit à 55 Mo pour toutes les actions et l'application annonce 10 Mo par fichier (TAILLE_MAX_OCTETS). Sur Vercel, une requête de plus de 4,5 Mo vers une fonction est refusée par la plateforme avant le code de l'application ; un bail ou un diagnostic scanné de 5 à 10 Mo échouerait alors avec une page d'erreur de plateforme et non le message de l'application. Non observable sur le banc local (pas de plateforme) ; la limite de 4,5 Mo vient de ma connaissance de la documentation Vercel et n'a pas été relue ici.
- **Cause probable** : Dépôts de fichiers par action serveur (comme le note le commentaire S11 du fichier de configuration)
- **Correction proposée** : Aligner la limite annoncée sur la limite de la plateforme, ou déposer via URL signée de stockage ; mesurer en préproduction
- **Preuve (banc)** : snap-main/app/next.config.ts:147-158 ; snap-main/app/src/lib/file-type.ts (TAILLE_MAX_OCTETS)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `AUD-C-02` — Les 8 taches pg_cron (cycle mensuel des appels de loyer, retention, alertes d'impayes, declencheur marketing) ne sont ni sauvegardees, ni decrites dans la procedure de restauration, ni surveillees pa…

- **Attendu** : La procedure de reprise liste la recreation des taches pg_cron et l'activation de pg_cron/pg_net ; un ecran ou une alerte signale qu'un cycle mensuel n'a pas tourne.
- **Observé** : Apres une restauration, les appels de loyer du mois (cycle-mensuel, le 1er a 05:00 UTC), les alertes d'impayes, la retention et le declencheur marketing ne repartent pas, sans aucun signal (hypothese sur l'effet en production : seule l'exclusion du dump, l'absence de documentation et l'absence de lecteur sont prouvees). Contournement : bouton 'generer les appels' bail par bail.
- **Cause probable** : app/scripts/sauvegarde/base.mjs (SCHEMAS) ; app/docs/sauvegarde-et-restauration.md ; app/src/lib/tache.ts (dernieresTaches ne retient que tache_*).
- **Correction proposée** : Ajouter a la procedure l'etape 'rejouer les cron.schedule des migrations et activer pg_cron/pg_net' ; exporter select jobname, schedule, command from cron.job dans la sauvegarde ; faire consigner cycle_mensuel sous tache_cycle_mensuel (ou lire cycle_mensuel dans Sante, retard > 32 jours).
- **Preuve (banc)** : preuves/auditeur/c/preuves-sql.txt ; inventaire-automatismes.md section 2
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte — complète SUP-01 : même cause, côté sauvegarde et restauration

#### `PROP-03` — Un fichier de plus de 10 Mo provoque une erreur HTTP 500 et un message sans rapport avec la cause

- **Attendu** : message « Fichier trop volumineux (10 Mo max) » (le formulaire annonce « 10 Mo maximum »)
- **Observé** : POST renvoie HTTP 500 ; message affiché : « La confirmation n’a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer. » ; aucun diagnostic créé. Un fichier de 9,95 Mio (10 433 329 octets) est accepté.
- **Cause probable** : le message de taille (src/app/actions/parc.ts → deposerFichierGed, TAILLE_MAX_OCTETS=10 Mio dans src/lib/file-type.ts:57) n'est jamais atteint : la requête échoue avant l'action, très probablement à la mise en mémoire tampon du corps par le proxy Next (limite par défaut de 10 Mo, indépendante de serverActions.bodySizeLimit 55mb, next.config.ts:157) — hypothèse à vérifier
- **Correction proposée** : contrôler la taille côté client avant l'envoi (File.size) avec message explicite ; régler proxyClientMaxBodySize ; traduire le 500 en « fichier trop lourd »
- **Preuve (banc)** : captures/s4-07-fichier-12Mo-erreur-vague.png ; sql: diagnostics inchangé (1 ligne active)
- **Correction sans aval** : oui
- **Statut** : ouverte

#### `PROP-14` — Entrée en cours de mois : le premier terme (prorata) est exigible le 1er du mois, avant l'entrée, et passe tout de suite en « Impayé »

- **Attendu** : première échéance au plus tôt à la date d'entrée (16/10/2026) : pas d'impayé avant le début du bail ni de relance possible
- **Observé** : appels_loyer : période 2026-10-01, loyer 438.71, charges 46.45, total 485.16 (prorata correct), date_echeance = 2026-10-01 (15 jours avant l'entrée) ; l'écran affiche « Impayé » et « impayé en cours » avant tout paiement ; le bloc Relances est actif
- **Cause probable** : supabase/migrations/20260927102000_appels_terme_echu.sql (generer_appels_loyer_interne) : date_echeance = début de mois + jour_echeance − 1, sans max(date_debut)
- **Correction proposée** : date_echeance = greatest(date_echeance calculée, date_debut) pour le premier terme
- **Preuve (banc)** : captures/s8-03-echeancier.png ; sql: select periode,date_echeance from appels_loyer
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte

#### `FIN-07` — Le filtre par mot-clé « fonds travaux / alur » écarte la pièce avant de consulter la qualification justifiée du propriétaire : une dépense qualifiée « déductible 224 » reste exclue des charges et la…

- **Observé** : Le propriétaire saisit « Appel de fonds travaux ravalement 2026 » (800 €, travaux votés payés dans l'année), la qualifie « Dépense déductible vérifiée », rubrique 224, justification « facture approuvée en assemblée ». La base accepte et versionne la qualification (audit_log inclus) ; le récapitulatif compte 224 = 0 et 800 € dans « Fonds travaux ALUR — à part » (« ne sont pas comptés dans les charges »). Aucun message n'explique que son choix est ignoré, et le libellé du journal étant immuable, seul un contournement par contre-écriture et ressaisie sous un autre libellé est possible. Contredit le principe posé en tête du fichier : « seuls les faits figés et choix justifiés chiffrent les tota…
- **Cause probable** : app/src/lib/fiscal.ts:60 (test estFondsTravauxAlur avant la lecture de la qualification), 22 (regex)
- **Correction proposée** : Ne mettre à part que les pièces sans qualification (ou ajouter une nature « fonds_travaux_alur » qualifiable) et laisser une qualification « deductible » l'emporter ; resserrer l'expression (« fonds (de )?travaux.*alur » ou « fonds alur ») pour ne plus attraper « appel de fonds travaux ».
- **Preuve (banc)** : preuves/relecture/finance/ts/t6.mts (224 = 0 et fondsTravauxAlur = 800 pour « Appel de fonds travaux… » et « Cotisation fonds de travaux » malgré la qualification ; « travaux plomberie » donne 224 = 800)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : dépenses au libellé « fonds travaux / alur » et leur qualification éventuelle. select e.organization_id, e.id, e.date_piece, e.categorie, e.montant, q.nature, q.rubrique, q.version from public.ecritures e left join lateral (select * from public.fiscal_qualifications_ecritures x where x.ecriture_id=e.id order by version desc limit 1) q on true where e.sens='depense' and e.contre_ecriture_de is null and lower(e.categorie) ~ 'fonds (de )?travaux\|fonds alur\|alur' order by e.organization_id, e.date_piece;`
- **Statut** : ouverte

#### `FIN-11` — Les migrations ne rétro-capturent aucun loyer existant et la reprise « retrouver_ventilation_fiscale » refuse tout bail qui a plus d'un appel : sur les données réelles déjà en production, le récapitu…

- **Observé** : Bail régulier, trois appels de 840 € (780 + 60) et trois paiements de 840 € antérieurs à la migration : la fonction répond trois fois « Plusieurs échéances ou aucune échéance : la ventilation doit être justifiée », 0 capture. Avec exigerPerimetre, le récapitulatif ne compte rien tant que l'exercice du lot n'est pas confirmé, puis refuse chaque loyer ancien (« attendent leur ventilation historique ») tant qu'il n'a pas reçu une qualification justifiée (nature, lot, parts HC et charges, justification, case de confirmation) : une pièce par mois et par lot. Le comportement précédent (ventilation au prorata du bail) affichait des totaux. Le choix de « ne rien réécrire » est assumé dans les comme…
- **Cause probable** : app/supabase/migrations/20261012224000_fiscalite_historique_qualifiee.sql et app/src/lib/fiscal.ts:migration 56-97 (capture seulement à l'INSERT), 155-183 (reprise limitée à un seul appel) ; fiscal.ts 54-60 et 76-84
- **Correction proposée** : Offrir une reprise explicite par lot (action unique, auditée, non silencieuse) pour les baux dont les appels sont cohérents (montant_du = loyer_hc + charges), dont chaque paiement s'impute sans avance sur les appels existants, et qui n'ont ni annulation ni anomalie ; la même règle FIFO que le déclencheur peut être rejouée en SQL sur les paiements existants dans l'ordre (created_at, id). Annoncer dans l'interface le nombre de pièces à qualifier.
- **Preuve (banc)** : preuves/relecture/finance/sql/t14_historique_reel.sql (sortie : sql/t14_sortie.txt : trois refus, 0 capture ; état d'avant-migration simulé par session_replication_role=replica dans une transaction annulée) ; ts/t2.mts pour le contraste avec l'ancien calcul
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `-- Lecture seule : combien de loyers existants sont sans capture, par organisation (c'est le nombre de pièces à qualifier à la main). select e.organization_id, count(*) filter (where c.ecriture_id is null) as loyers_sans_capture, count(*) as loyers_total, min(e.date_piece) premiere, max(e.date_piece) derniere from public.ecritures e left join public.fiscal_encaissements_composantes c on c.ecriture_id=e.id where e.categorie='loyer' and e.sens='recette' and e.contre_ecriture_de is null group by 1 order by 2 desc;`
- **Statut** : ouverte

#### `PR178-A-03` — Après une réponse perdue à la création d'une fiche personne, le bouton d'envoi reste désactivé pour toujours : la saisie et les pièces « restent disponibles » mais ne peuvent plus être envoyées ; seu…

- **Attendu** : Le garde-fou anti-doublon est réaffirmé (la fiche n'est pas recréée), mais l'utilisateur doit pouvoir poursuivre : par exemple vérifier la fiche puis rattacher les pièces préparées à la fiche existante, ou relancer la création après confirmation explicite.
- **Observé** : Une seule ligne persons est créée en base (aucun rejeu : bon point). L'écran affiche « Un enregistrement a été interrompu… Votre saisie et vos documents restent disponibles ici » mais le bouton « Créer la fiche » est désactivé (disabled=true) ; après rechargement et « Reprendre ma saisie », même état : la copie locale contient bilan.creationIncertaine=true et rien ne permet de lever ce drapeau. La seule issue est « Effacer cette copie » (écran de reprise), donc ressaisie complète et nouveau choix des fichiers, ou ajout des pièces à la main depuis la fiche. Le même drapeau est posé AVANT l'appel serveur (creation-fiche-personne.ts:54) : si l'utilisateur ferme l'onglet pendant l'envoi alors q…
- **Cause probable** : src/lib/creation-fiche-personne.ts:44 (retour immédiat si precedent.creationIncertaine), :54 (drapeau posé avant l'appel), :61 (pièces incertaines jamais renvoyées) ; src/app/agence/[orgId]/personnes/formulaire-personne.tsx:199 (BoutonEnvoi disabled={etat.creationIncertaine}) ; aucun bouton « J'ai vérifié, la fiche n'existe pas, réessayer » ni « Rattacher à la fiche existante ».
- **Correction proposée** : Ajouter dans le bandeau d'incertitude deux actions explicites : « La fiche existe : continuer avec elle » (rechercher la personne par e-mail côté serveur puis envoyer les pièces) et « La fiche n'existe pas : réessayer » ; ou donner à creerPersonne une clé d'idempotence stockée avec la copie (comme la commande d'incident) pour rejouer sans risque de doublon.
- **Preuve (banc)** : preuves/relecture/pr178/a/a03-s1-sortie.txt, a03-s2-sortie.txt, captures/A-03-S1-apres-reponse-perdue.png, captures/A-03-S2-apres-reponse-perdue.png, t5.mjs ; SQL : 1 ligne persons pour test-pr178-s1-23092@example.test
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : ouverte — 36219ec corrige le cas de la session expirée ; le cas de la réponse perdue demande une décision (reprendre la fiche trouvée par son e-mail ou réessayer)

#### `SUP-01` — L'arret d'urgence (global ou par mission) ne couvre pas les 8 taches SQL planifiees par pg_cron : seules les routes Next/Vercel appellent verifier_arret_supervision.

- **Observé** : La supervision enregistre un arret 'global' (ou 'purge', 'quittances', 'appels'). verifier_arret_supervision(...) renvoie false pour les 13 cles, les routes /api/cron/* s'arretent. Mais pg_cron continue : retention-quotidienne (appliquer_retention : DELETE sur tech_log, audit_log, demandes_devis, intentions_conge, demandes_signature, purge/anonymisation de documents), cycle-mensuel (generation des appels de loyer et quittances), alertes-*, propositions-publication-hebdo.
- **Cause probable** : verifier_arret_supervision exige auth.role()='service_role' ou un superviseur ; pg_cron s'exécute sans JWT, donc les fonctions planifiées (appliquer_retention, cycle_mensuel_interne, generer_alertes_*, proposer_publications_interne) ne l'appellent pas.
- **Correction proposée** : Ajouter un prédicat interne (sans exigence de JWT) lu en tête de chaque fonction planifiée par pg_cron, ou documenter dans l'écran de relais que l'arrêt ne couvre pas les 8 tâches SQL. Décision métier requise.
- **Preuve (banc)** : preuves/relecture/supervision/20-arret-pgcron.sortie.txt (arret global actif ; appliquer_retention() appelee en contexte cron supprime la ligne de test : avant=1, apres=0) + requete pg_proc : seules 4 fonctions referencent supervision_arrets/verifier_arret_supervision (commander_, executer_tache_consigne, traiter_vacances, verifier_).
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select jobname, schedule, command from cron.job where active order by jobname; select cle, arrete, motif, modifie_le from public.supervision_arrets where arrete;`
- **Statut** : ouverte

#### `SUP-05` — Les « faits de direction » copient, pour toutes les organisations, des données personnelles (titres d'alertes contenant le nom du locataire, ex. « État des lieux d'entrée — Lot 1 · Marie Durand ») da…

- **Observé** : Un superviseur clique « Préparer le point maintenant » : preparer_faits_direction lit alerts.titre de toutes les organisations et stocke la copie dans sources->echeances->donnees->faits (jusqu'à 20 faits x 5 sources par clic, un instantané par clic, conservé indéfiniment). Delta audit_log = 0 et supervision_operations = 0 pour l'appel SQL ; côté TypeScript une seule ligne générique point_du_matin_prepare (sans organisation, écrite après coup et non transactionnelle). La lecture de l'écran /admin/brief (lire_faits_direction) n'est jamais tracée. Écart à la règle documentée « traversée par le Super Admin autorisée mais journalisée » (wiki/regles-metier/Isolation multi-organisation.md, RM-A1.1…
- **Cause probable** : 20261012222000 : collecter_source_direction('echeances') renvoie le titre brut ; aucune écriture log_sa_access ; aucune clause de rétention dans appliquer_retention().
- **Correction proposée** : Ne stocker que des identifiants et libellés génériques (type d'alerte + href) au lieu de alerts.titre ; journaliser via log_sa_access(org,'consultation_faits_direction') pour chaque organisation citée ou une ligne d'audit par préparation dans la même transaction ; ajouter une purge à 90 jours dans appliquer_retention().
- **Preuve (banc)** : preuves/relecture/supervision/94-faits-donnees-personnelles-trace.sortie.txt (delta journaux 0/0, nom présent dans la copie durable, 0 fonction de rétention citant la table)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select count(*) nb, min(jour), max(jour), pg_size_pretty(pg_total_relation_size('public.brief_direction_snapshots')) taille from public.brief_direction_snapshots; -- puis, pour voir si des noms y figurent : select jour, jsonb_path_query_array(sources,'$.echeances.donnees.faits[*].titre') from public.brief_direction_snapshots order by genere_le desc limit 3;`
- **Statut** : ouverte

#### `AUD-A-01` — Un agent restreint modifie les équipements d'un lot hors de son portefeuille (RPC definir_equipements_lot)

- **Attendu** : Refus 'hors de votre portefeuille' comme pour demarrer_restitution, enregistrer_conge, generer_grille_edl (garde_portefeuille_agent).
- **Observé** : Appel accepté sans erreur ; équipements du lot passés de 1 à 0. L'agent voit 0 ligne de ce lot (lots visibles : 1 sur 18). Les 32 autres tables rattachées aux lots portent le déclencheur garde_portefeuille_agent, pas lot_equipements.
- **Cause probable** : app/supabase/migrations/20260909190000_correctifs_audit_hors_documents.sql:460 (fonction SECURITY DEFINER qui ne teste que le rôle) ; app/supabase/migrations/20260909230000_perimetre_agent_serveur_et_base.sql:~244 (liste des tables gardées sans lot_equipements).
- **Correction proposée** : Dans definir_equipements_lot, refuser si public.lot_hors_portefeuille(v_org, p_lot) ; ou ajouter lot_equipements à la liste des tables du déclencheur garde_portefeuille_agent (via lot_id).
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/preuve-agent-definir-equipements-lot.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — garde de portefeuille, test rouge puis vert

#### `AUD-A-02` — L'annulation d'une écriture comptable (contre_ecriture) n'enregistre pas son auteur

- **Attendu** : Auteur, cible, date, motif, résultat tracés (audit_log ou colonne auteur), comme supprimer_encaissement qui écrit audit_log.
- **Observé** : Seule la table ecritures change (20 -> 21 lignes) : la contre-écriture porte motif, contre_ecriture_de et created_at, mais ecritures n'a aucune colonne auteur/created_by et audit_log ne reçoit rien. Dans une agence à plusieurs gestionnaires, qui a annulé l'écriture est introuvable.
- **Cause probable** : app/supabase/migrations/20260927182000_contre_ecriture_ecritures_liees.sql:56 (aucun insert dans audit_log) ; colonnes de public.ecritures sans auteur.
- **Correction proposée** : Insérer dans audit_log (action 'contre_ecriture', account_id = auth.uid(), organisation, détails : écriture annulée, nouvelle écriture, montant, motif) dans la fonction.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/trace-5.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit avec auteur

#### `AUD-A-03` — L'annulation d'une mission artisan (annuler_mission) ne garde ni auteur ni événement

- **Attendu** : Événement d'incident avec acteur (comme demarrer_intervention qui écrit incident_evenements.acteur_account_id) ou ligne audit_log.
- **Observé** : Quatre tables changent (incident_interventions, incident_devis passé 'annule', intervention_creneaux 'caduc', incidents requalifié) mais ni incident_evenements ni audit_log ne reçoivent de ligne ; la mission garde annulee_le et annulation_motif sans annulee_par. L'artisan perd son devis retenu sans trace de qui a décidé.
- **Cause probable** : app/supabase/migrations/20260911240000_module8_correctifs_bloquants.sql:146 (update sans insert d'événement).
- **Correction proposée** : Ajouter un insert dans incident_evenements (type 'mission_annulee', acteur_account_id = auth.uid(), détails : intervention, motif) comme demarrer_intervention.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/trace-3.txt
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — événement « mission annulée » au fil de l'incident

#### `AUD-A-04` — La suppression d'une détention (quote-part de propriété d'un lot) ne laisse aucune trace

- **Attendu** : Trace de la suppression d'un droit de propriété (auteur, cible, date), ou archivage plutôt que suppression (wiki 'Archivage plutôt que suppression').
- **Observé** : La table detentions passe de 22 à 21 lignes ; audit_log et tous les autres journaux inchangés.
- **Cause probable** : fonction supprimer_detention (delete sans audit_log) ; migration non localisée dans l'extrait lu (hypothèse sur le fichier).
- **Correction proposée** : Journaliser dans audit_log (détails : lot, personne, quote-part supprimée) ou archiver la ligne.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/a/travail/trace-4.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — ligne d'audit « détention supprimée »

#### `AUD-B-01` — E-mails de relance, d'appel et de rappel : valeurs saisies insérées sans échappement HTML

- **Attendu** : Texte échappé (&lt;a&gt;…) comme dans quittance-email.ts (echapperHtml) et notifications.ts (echapperMarque)
- **Observé** : corpsRelanceLoyer et corpsInformationCaution (lib/relance-loyer-email.ts) insèrent prenom, lot, emetteur, locataire tels quels dans le HTML du message ; appel-email.ts (prenom, emetteur, lien) et rappel-email.ts (lot, adresseBien, prenom, emetteur) interpolent aussi les valeurs sans échappement ; relance-paiement-email.ts n'a aucun échappement mais je n'y ai pas relevé d'insertion de donnée saisie (non vérifié ligne à ligne). Exécution de la fonction avec prenom='<img src=x onerror=...>', lot='<a href="https://evil.example">', emetteur='<script>': le HTML sortant contient ces balises intactes. Les valeurs viennent de la RPC relances_loyer_dues : lot=lots.nom, prenom/locataire=persons.prenom…
- **Cause probable** : snap-main/app/src/lib/relance-loyer-email.ts:54,60,77-98 ; lib/appel-email.ts:64,80 ; lib/rappel-email.ts:69,80,91,93 ; aucun appel à echapperMarque (marque-organisation.ts:57)
- **Correction proposée** : Passer chaque valeur interpolée par echapperMarque() (déjà dans marque-organisation.ts) dans relance-loyer-email.ts, appel-email.ts, rappel-email.ts (et relire relance-paiement-email.ts) ; ajouter un test unitaire avec entrée '<b>'.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/t-relance-sortie.txt (exécution de la fonction réelle du snapshot avec entrées hostiles ; seuls eur/formaterDate/moisDeLaPeriode sont substitués)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 35b2501 — les valeurs saisies sont échappées dans les quatre courriers, 7 tests rouges puis verts

#### `AUD-B-02` — Aucune limite de longueur à l'inscription : un nom très long rend le compte inutilisable (HTTP 431 sur tout le site)

- **Attendu** : Refus lisible au-delà d'une longueur raisonnable (nom, adresse, ville ≤ 100–200 caractères), côté serveur et par maxlength
- **Observé** : Inscription avec un nom de ~24 000 caractères : acceptée (raw_user_meta_data de 24 249 caractères, e-mail confirmé, aucune organisation créée). À la connexion, les cookies de session pèsent 77 824 octets sur 25 cookies ; /espaces répond 431 puis toute adresse du site (y compris /connexion) répond 431 tant que les cookies ne sont pas effacés. Une nouvelle connexion remet les mêmes cookies : le compte est inutilisable et le navigateur est bloqué sur le site. Seuil estimé ~5 000 caractères (extrapolation 3,2 octets par caractère contre 16 Kio d'en-têtes : à confirmer). Aucune validation de longueur dans app/actions/auth.ts ni lib/inscription.ts.
- **Cause probable** : snap-main/app/src/app/actions/auth.ts (inscription) et app/inscription/formulaire-inscription.tsx : pas de borne ; les métadonnées sont recopiées dans le jeton/cookie de session
- **Correction proposée** : Borner nom, prénom, adresse, ville, téléphone (maxLength HTML + contrôle serveur) ; ne pas faire transiter ces champs par les métadonnées de session ou les tronquer ; vérifier de même les noms saisis par un propriétaire pour un tiers invité.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/long-inscription-mobile.png ; /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/auditeur/b/long-login-431.png ; SQL : longueur du raw_user_meta_data du compte auditeur.b.long.* = 24249
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — bf73fdc — garde de longueur côté serveur et maxLength, 2 familles de tests

#### `AUD-C-01` — Un encaissement a 3 decimales (ou 0,004 EUR) et date dans le futur est accepte et ecrit au journal comptable

- **Attendu** : Refus : un montant en euros a deux decimales au plus, une date de paiement plausible, un plafond raisonnable.
- **Observé** : Accepte. L'ecriture de loyer recette 0.004 est creee avec date_imputation 2031-01-01. Sur le banc partage, deux ecritures a 12.345 existent deja (e768b993 et sa contre-ecriture b487429f, annulee ensuite par le proprietaire) et des encaissements dates 2027 et 2030. L'export CSV arrondit avec toFixed(2) alors que le SQL somme les sous-centimes ; un encaissement date de 2031 sort des totaux de l'annee en cours tout en marquant le terme paye sur le bail.
- **Cause probable** : Seules contraintes : CHECK (montant > 0) sur encaissements et ecritures (aucune echelle ni borne de date) ; app/src/app/actions/loyers.ts : Number(montant) sans arrondi ni plafond, date_paiement transmise telle quelle ; comptabilite/export/route.ts montantFr toFixed(2).
- **Correction proposée** : CHECK (montant = round(montant, 2) et montant < 1 000 000) et CHECK (date_paiement <= current_date + interval '1 day') sur encaissements ; round(montant, 2) et message d'erreur dans ajouterEncaissement ; meme echelle sur ecritures.montant. Nettoyer l'existant avant d'ajouter la contrainte (NOT VALID puis VALIDATE).
- **Preuve (banc)** : preuves/auditeur/c/preuves-sql.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 0555f43 pour la saisie ; les contraintes CHECK en base ne sont pas ajoutées (données de production à contrôler d'abord)

#### `PRO2-14` — La justification de la qualification, rédigée comme note de décision, est affichée mot pour mot au locataire sans que le formulaire le dise

- **Attendu** : Le formulaire précise que le texte sera lu par le locataire, ou le locataire ne voit qu'une formule neutre
- **Observé** : Le formulaire invite à « Décrivez le constat et la raison de votre décision » et indique seulement « Le locataire est informé immédiatement ». Chez le locataire : « Qui prend en charge · Le propriétaire — vous n'avancez rien ([justification complète]) ». Un propriétaire qui note un jugement sur le locataire ou une stratégie le lui publie.
- **Cause probable** : imputation_justification rendue telle quelle dans incidents-locataire.tsx.
- **Correction proposée** : Ajouter sous le champ « Cette justification est visible du locataire » ou la scinder en motif visible et note interne.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/captures/l1-01-demandes-apres-mission.png (affichage locataire, observé) ; code lu dans la photographie snap-main-178 : app/agence/[orgId]/incidents/[incidentId]/actions-incident.tsx lignes 90-110 (libellé du champ) et app/locataire/[orgId]/incidents-locataire.tsx lignes 195-215 (affichage)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 611dce2 — le formulaire dit que la justification est montrée au locataire

#### `MKT-01` — La préparation du soir du marketing n'a jamais été déclenchée par pg_cron : pas de fenêtre de veto la veille, seul le rattrapage de la matinée préparait les posts

- **Attendu** : à 18 h (Paris) la veille d'un jour de publication, pg_cron juge la préparation due et déclenche /api/cron/equipes?mission=marketing
- **Observé** : cible_preparation_marketing() filtrait sur auth.role() = 'service_role' ; pg_cron appelle declencher_marketing() avec le rôle de la base, sans jeton JWT : auth.role() est nul, aucune ligne, préparation jamais due. Seule la diffusion (requête directe sur publications) partait. Un seul appel pg_net en production depuis le 7/10 (09/10, rattrapage).
- **Cause probable** : supabase/migrations/20261007100000_marketing_fenetre_de_veto.sql (cible_preparation_marketing, garde auth.role())
- **Correction proposée** : migration 20261013110000 : version interne sans garde, fermée à tous les rôles ; la version publique garde sa garde service_role ; aucun droit élargi
- **Preuve (banc)** : tests/marketing-veto.test.ts (deux tests rouges sur le schéma d'avant, verts après) ; cron.job_run_details en production (lecture seule) : 1 097 exécutions réussies, une seule requête pg_net
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — commit 9d5ed9d ; migration 20261013110000 à appliquer en production

#### `PUB-01` — Le formulaire « Agences » de l'accueil était le seul canal de contact des pages légales (exercice des droits sur les données) tant que l'adresse de l'éditeur manque ; il restait une demande de devis…

- **Attendu** : un canal de contact général, indépendant de l'offre agence, vers lequel renvoient les pages légales
- **Observé** : FORMULAIRE_ACCUEIL = /#agences ; formulaire à champs « Votre agence » et « lots en gestion » ; relevé déjà fait le 24/09 (lib/editeur.ts). Le retrait des agences du site public aurait supprimé ce canal.
- **Correction proposée** : formulaire de contact général (ancre #contact, message obligatoire), pages légales renvoyées vers lui ; l'adresse e-mail de l'éditeur reste à fournir (src/lib/editeur.ts)
- **Preuve (banc)** : app/src/lib/editeur.ts, app/src/components/coquille-legale.tsx, app/src/app/page.tsx (avant correction)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — commit e7982a7

#### `PROP-02` — Code postal à 4 chiffres et année 1500 acceptés et enregistrés à la création du bien

- **Attendu** : refus d'un code postal qui n'a pas 5 chiffres (France) et d'une année de construction invraisemblable, message clair
- **Observé** : le formulaire passe à l'étape 2 (« Bâtiment — Renseigné »), puis le bien est créé : biens.postal_code='7501', annee_construction=1500, commune_insee NULL ; l'adresse affichée est « 1 rue Test, 7501 Paris »
- **Cause probable** : aucun contrôle de forme du code postal (champ texte maxlength 12, formulaire parc/nouveau) ; seule contrainte en base : annee_construction entre 1000 et 2100 (biens_annee_construction_check)
- **Correction proposée** : valider ^\d{5}$ côté serveur et client (pattern + inputmode), borner l'année (ex. 1800 à année en cours + 3)
- **Preuve (banc)** : captures/s2-03-cp4-annee1500.png ; captures/s2-07-bien-cp-invalide-cree.png ; SQL select postal_code,annee_construction from biens (bien '[TEST-proprietaire] Bien invalide')
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — d6ef891 — code postal du bien sur cinq chiffres, année de construction de 1600 à année+5

#### `PROP-07` — Fiche personne : date de naissance future, téléphone « abc » et code postal « 75 » acceptés

- **Attendu** : refus d'une naissance dans le futur, d'un téléphone et d'un code postal mal formés
- **Observé** : les étapes avancent et la fiche est créée : persons.date_naissance='2030-01-01', telephone saisi libre ; l'écran de fiche affiche « né(e) le 01/01/2030 ». Seule la validation native de l'e-mail bloque.
- **Cause probable** : aucun contrôle de plausibilité dans l'assistant de création de fiche (champ date sans max, champs tel/cp sans pattern)
- **Correction proposée** : max=aujourd'hui (et âge majeur pour un locataire), pattern téléphone/code postal côté client et serveur
- **Preuve (banc)** : captures/s6-04-recap-invalide.png ; captures/s6-07-fiche-locataire.png ; SQL select date_naissance from persons (corrigée ensuite à 1990-05-14 par « Modifier la fiche »)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — d6ef891 — date de naissance, téléphone et code postal contrôlés côté serveur

#### `PROP-12` — Encaissement à 3 décimales accepté et stocké tel quel : totaux affichés incohérents au centime

- **Attendu** : refus d'un montant à plus de deux décimales (comme le fait l'étape Loyer du bail : « au plus deux décimales ») ou arrondi explicite au centime avant stockage
- **Observé** : encaissements.montant = 12.345 enregistré ; carte « Loyers & paiements » : DÛ 485,16 € · ENCAISSÉ 222,35 € · RESTE DÛ 262,82 € (485,16 − 222,35 = 262,81) ; le texte de la ligne dit « (reste 262,81 €) » ; le reçu est enregistré pour 222.35
- **Cause probable** : l'action d'encaissement ne contrôle que montant > 0 (message « Montant invalide. ») ; la colonne encaissements.montant est numeric sans échelle ; l'affichage arrondit après addition
- **Correction proposée** : refuser les montants avec plus de 2 décimales (client et serveur) et contraindre numeric(12,2)
- **Preuve (banc)** : captures/s8-05-incoherence-reste-du.png ; sql: encaissements 12.345@2026-10-13 (retiré ensuite avec motif)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 0555f43 — montant au centime près refusé côté serveur (la colonne numeric(12,2) n'est pas modifiée)

#### `PROP-13` — Un encaissement daté dans le futur (01/01/2027) est accepté et compté comme déjà reçu

- **Attendu** : refus (ou alerte) d'une date de paiement postérieure à aujourd'hui ; le paiement non encore reçu ne doit pas couvrir l'appel
- **Observé** : encaissement créé ; « couvert 222,35 € » inclut les 10 € ; la liste affiche « 10,00 € 01/01/2027 Virement » ; le bloc ENCAISSÉ le compte aujourd'hui
- **Cause probable** : aucun contrôle de borne sur date_paiement (champ date sans max, action sans contrôle)
- **Correction proposée** : max = aujourd'hui (fuseau Paris) côté client et serveur
- **Preuve (banc)** : captures/s8-05-incoherence-reste-du.png
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 0555f43 — date d'encaissement dans le futur refusée côté serveur, sélecteur plafonné à aujourd'hui

#### `PR178-A-01` — Les brouillons de fiche personne et d'incident (identité, naissance, adresse, e-mail, téléphone, pièces jointes) restent en clair dans IndexedDB 7 jours, ne sont pas effacés à la déconnexion et reste…

- **Attendu** : Données personnelles de tiers (identité, naissance, adresse, pièce d'identité) non conservées sur le poste après la déconnexion, ou chiffrées/liées à la session ; avertissement explicite sur poste partagé à chaque affichage de l'état « conservé ».
- **Observé** : 1) La déconnexion s'exécute en 210 ms sans aucune confirmation ni nettoyage. 2) La copie « gerimmo:personne:v1:<id compte>:<id org> » reste dans IndexedDB (nom, prénom, date de naissance, commune de naissance, e-mail, téléphone, adresse, code postal, ville, fichier File de la pièce d'identité), lisible en JavaScript depuis la session du locataire (même origine) : 1 copie visible. 3) Sur disque, le journal LevelDB du profil contient les valeurs en clair (UTF-16 : 21 occurrences de « Camille », 17 de « Nantes », 11 de « Lilas ») et le fichier de la pièce est dans le dossier .blob. 4) Une fois la copie enregistrée, le texte affiché ne dit plus « Évitez un appareil partagé » (cette mise en gard…
- **Cause probable** : seDeconnecter() (app/actions/auth.ts:25) est une action serveur sans purge côté client ; aucune écoute de la déconnexion ni de SIGNED_OUT ne vide la base « gerimmo-reprises » (brouillon-fichiers.ts) ni les clés localStorage « gerimmo:bien:v1 » et « gerimmo:devis:v1 ». Durée de 7 jours et purge « à la prochaine utilisation » seulement (lireCopieFichiers).
- **Correction proposée** : Vider les trois stockages (IndexedDB gerimmo-reprises, clés gerimmo:*) dans le geste de déconnexion (formulaire du menu et de /compte) et à l'expiration de session ; afficher « Évitez un appareil partagé » dans tous les états ; ramener la durée à 24-48 h ; ne pas stocker les fichiers d'identité (ne garder que les champs texte) ou les chiffrer avec une clé de session.
- **Preuve (banc)** : preuves/relecture/pr178/a/t2.mjs (sortie : copies=1 après déconnexion et depuis la session locataire), captures/A-01-poste-partage-locataire.png, a01-disque-sortie.txt (comptage d'occurrences dans le journal LevelDB du profil), src/lib/brouillon-fichiers.ts:1-65, src/components/reprise-locale/index.tsx:66-75, src/app/actions/auth.ts:25-30, a01-incident-sortie.txt (copie incident avant/après déconnexion), a01-devis-sortie.txt (clé devis avant/après déconnexion)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes, message mis à jour ; la durée de 7 jours reste à trancher

#### `PR178-A-02` — Les formulaires de filtre GET sans attribut method (Finances, catalogue de documents, récapitulatif fiscal) sont suivis comme des saisies à protéger : « Afficher » ou Entrée déclenche la boîte native…

- **Attendu** : Un filtre (formulaire GET, sans effet d'écriture) n'est jamais traité comme une saisie non enregistrée ; le filtre s'applique sans boîte de confirmation (le brief demande que les formulaires de recherche soient exclus).
- **Observé** : Une boîte beforeunload s'ouvre à chaque validation du filtre. Réponse « Rester » : l'URL reste /agence/<org>/loyers (filtre non appliqué, page inchangée) ; réponse « Quitter » : navigation vers ?bien=&annee=2025&mois=10. Même comportement sur le catalogue (URL inchangée en refusant, ?q=bail en acceptant). Le message natif n'explique rien (Chromium ignore le texte), l'utilisateur croit perdre une saisie alors qu'il ne fait que filtrer. Contrôle témoin : le sélecteur d'année de /comptabilite/fiscal n'a qu'une option, non testable. Même défaut côté artisan : /artisan/clients (recherche de clients, <form className="flex gap-3"> sans method) : saisir « Dupont » puis Entrée ouvre aussi une boîte…
- **Cause probable** : src/lib/protection-saisie.ts:46-51 (eligible) : `formulaire.getAttribute("method")?.toLowerCase() !== "get"` est vrai quand l'attribut est absent alors que la méthode par défaut du navigateur est GET ; role="search" n'est pas posé sur ces formulaires. Et avantSortie (l.128-130) ne tient pas compte d'une soumission en cours (le WeakSet enSoumission ne sert qu'au gestionnaire formdata).
- **Correction proposée** : Dans eligible, utiliser la propriété normalisée `formulaire.method !== "get"` (ou `formulaire.matches('form:not([method=post i])')`), ignorer aussi tout formulaire dont l'action est une URL (pas d'action serveur) ; dans avantSortie, ne pas bloquer quand un formulaire GET vient d'être soumis (poser departAutorise dans le gestionnaire submit).
- **Preuve (banc)** : preuves/relecture/pr178/a/a02-sortie.txt (lignes « réponse=Rester » / « réponse=Quitter » et catalogue), captures/A-02-loyers-filtre-bloque.png, formulaires : src/components/page-finances.tsx:41, src/app/agence/[orgId]/documents/catalogue/page.tsx:61, src/components/recapitulatif-fiscal.tsx:198, a02b-sortie.txt (artisan/clients)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 36219ec — seuls les formulaires qui confirment un envoi sont suivis

#### `PR178-A-04` — Chaque frappe dans la fiche personne réécrit tous les fichiers joints dans IndexedDB : 3 pièces de 9 Mo + 40 caractères = 1,2 Go d'écritures disque transitoires (copie de 27 Mo)

- **Attendu** : Les fichiers déjà conservés ne sont pas réécrits quand seul un champ texte change ; l'occupation disque reste voisine de la taille des fichiers (≈27 Mo).
- **Observé** : Dossier IndexedDB du profil : 55 432 Ko après les trois fichiers, puis 1 244 536 Ko (≈1,2 Go) après 40 frappes, retombé à 28 052 Ko seulement à la fermeture du navigateur. Cause constatée : chaque changement de snapshot appelle enregistrer(...) qui fait copies.put({revision, date, donnees}) avec les objets File dans donnees, donc une nouvelle copie de chaque blob par frappe ; le ramasse-miettes du navigateur n'intervient pas à temps. La latence de saisie reste correcte (40 frappes : 322 ms avec fichiers), le risque est l'usure disque, le dépassement de quota (surtout iOS Safari, quota par origine plus bas) et l'état « refuse » qui déclenche alors une alerte de sortie. Non mesuré hors Chromi…
- **Cause probable** : Un seul enregistrement monolithique (texte + File) réécrit à chaque modification du snapshot, sans temporisation ni séparation des fichiers du texte.
- **Correction proposée** : Séparer les enregistrements (clé texte et clé par fichier, écrite une seule fois à l'ajout), et temporiser l'écriture du texte (500 ms) ; ou ne conserver que le texte et exiger la re-sélection des fichiers.
- **Preuve (banc)** : preuves/relecture/pr178/a/a06-sortie.txt (sortie de t11.mjs), t11.mjs ; src/app/agence/[orgId]/personnes/formulaire-personne.tsx:72-73 (useEffect sur snapshot, à chaque frappe), src/lib/brouillon-fichiers.ts:58 (put complet), src/components/reprise-locale/index.tsx:38-56
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 36219ec — copie écrite 500 ms après la dernière frappe (les pièces sont encore réécrites une fois par pause, à découper si besoin)

#### `PR178-A-05` — Session expirée : un envoi refusé par redirection est présenté comme « confirmation non reçue » (aucune mention de la session, aucun lien de reconnexion) ; sur la fiche personne il verrouille en plus…

- **Attendu** : Message explicite « Votre session a expiré, reconnectez-vous (nouvel onglet) puis réessayez » avec lien ; saisie conservée ; aucun verrou sur un envoi qui n'a pas atteint l'action.
- **Observé** : A) La réponse de l'action est un 303 (redirection vers la connexion) ; l'écran reste sur /alertes avec « La confirmation n'a pas pu être reçue. Votre saisie reste dans cette page. Vérifiez le dossier avant de recommencer l'envoi. » ; aucun lien vers la connexion (0 lien) ; le titre est conservé ; chaque nouvel essai donne le même message. Un rechargement renvoie à la connexion et fait perdre la saisie, contrairement à « reste dans cette page ». B) Même cause : le bilan passe à creationIncertaine=true (« Un enregistrement a été interrompu… La création n'a pas pu être confirmée »), le bouton « Créer la fiche » est désactivé et la copie locale (1) garde ce drapeau : après reconnexion le formul…
- **Cause probable** : src/lib/use-action-state-protegee.ts:18-24 et use-action-formulaire.ts:35-38 : tout rejet (sauf redirect/notFound reconnus par unstable_rethrow) devient le même message générique ; src/lib/creation-fiche-personne.ts:54-56 : toute exception de creer() pose creationIncertaine. La redirection du proxy vers /connexion arrive comme réponse HTML inattendue, pas comme redirect() reconnu.
- **Correction proposée** : Dans les deux hooks, tester `erreur` (réponse non RSC / redirection) ou ping /api/session avant d'afficher le message ; afficher « session expirée » avec lien ouvert dans un nouvel onglet ; dans creation-fiche-personne, ne pas poser creationIncertaine quand l'échec précède l'envoi (session expirée, hors ligne).
- **Preuve (banc)** : preuves/relecture/pr178/a/a07b-sortie.txt (cas A : 303, message, 0 lien), a07-sortie.txt (cas B), captures/A-06-session-expiree-alerte.png, captures/A-05-session-expiree.png ; SQL : count(persons où email like 'test-pr178-exp%') = 0
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 36219ec — message « session expirée » dédié ; reconnexion par un autre onglet

#### `PR178-B-01` — Session expirée pendant la saisie : l'envoi échoue avec « La confirmation n'a pas pu être reçue… Votre saisie est conservée » sans jamais dire que la session a expiré ; le renvoi échoue de la même fa…

- **Attendu** : Un message qui dit que la session a expiré, qu'il faut se reconnecter, avec un lien vers /connexion ; ou une redirection vers la connexion ; la saisie n'est pas annoncée « conservée » si elle ne survit pas à la reconnexion.
- **Observé** : Étapes 3 et 4 : le même bandeau « La confirmation n'a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer. » (aucun lien vers /connexion, 0 occurrence), les cookies sont déjà supprimés par le proxy (303 vers /connexion suivi par fetch). Étape 5 : redirection vers /connexion?suite=… ; étape 6 : retour sur la page, champ titre vide (saisie perdue). Aucune ligne créée.
- **Cause probable** : src/lib/use-action-formulaire.ts (catch : message unique) et src/lib/use-action-state-protegee.ts : toute exception de l'appel d'action est traitée comme « réponse perdue ». Le 303 vers /connexion du proxy (src/proxy.ts, bloc session expirée) donne une réponse HTML que le client Next rejette ; le hook ne distingue pas ce cas d'une coupure réseau. Précision : le même message existait déjà dans use-action-formulaire.ts (formulaires en onSubmit) avant la PR ; la PR l'a étendu aux formulaires en useActionState (une soixantaine), qui affichaient auparavant la page d'erreur.
- **Correction proposée** : Dans les deux hooks, tester l'état de session (ou le type de réponse, ou un en-tête dédié posé par le proxy sur les actions serveur) et afficher « Votre session a expiré. Reconnectez-vous : cette saisie n'a pas été enregistrée » avec un lien /connexion?suite=<page>. Ne pas écrire « saisie conservée » pour un formulaire sans copie locale.
- **Preuve (banc)** : preuves/relecture/pr178/b/PR178-B-session-expiree-envoi.png ; scripts/expire2.mjs (sortie console reproduite deux fois)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 36219ec — même correction que PR178-A-05

#### `PR178-B-05` — Les formulaires de recherche ou de filtre sans attribut method="get" sont suivis comme des saisies à protéger : chaque recherche déclenche l'avertissement « Quitter le site ? » et reste bloquée si l'…

- **Attendu** : La recherche s'exécute sans fenêtre : un formulaire GET n'est pas une saisie à conserver.
- **Observé** : Une boîte beforeunload s'ouvre (type constaté : beforeunload, dismiss par défaut du banc) ; en choisissant de rester, l'URL ne change pas et le filtre n'est pas appliqué. Il faut accepter de « quitter » pour chercher.
- **Cause probable** : src/lib/protection-saisie.ts, fonction eligible : formulaire.getAttribute("method")?.toLowerCase() !== "get" vaut true quand l'attribut est absent (null?.toLowerCase() = undefined), alors que la méthode par défaut est GET. Les tests de la PR (e2e/protection-saisie.spec.ts, « recherche et champs techniques ») n'essaient que <form method="get">. Le champ q est suivi, la soumission n'est jamais « confirmée » (pas d'attribut data-saisie-confirmee), donc avantSortie bloque.
- **Correction proposée** : Dans eligible, ne suivre que les formulaires qui déclarent une action serveur ou onSubmit : par exemple exiger data-saisie-confirmee ou un attribut posé par useActionFormulaire ; au minimum exclure aussi les formulaires dont la propriété form.method vaut « get » sans attribut action React. Ajouter un cas de test avec un formulaire sans method.
- **Preuve (banc)** : preuves/relecture/pr178/b/PR178-B-recherche-bloquee.png ; scripts/recherche1.mjs
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 36219ec — même correction que PR178-A-02

#### `REP-01` — contre_proposer_creneaux n'est pas rejouable : un second envoi (reponse perdue, double envoi) marque comme REFUSEES les propositions du locataire lui-meme, porte le compteur a 6 et declenche une aler…

- **Observé** : Le locataire (bail actif, mission 'acceptee', 3 creneaux de l'artisan en attente) envoie ses 3 disponibilites ; la reponse reseau se perd (la page n'affiche pas le succes) et il renvoie le meme formulaire - ou double envoi. Le 2e appel passe (la mission est toujours 'acceptee', aucune garde 'mes propositions sont deja en attente') : l'UPDATE vise TOUS les creneaux statut='propose', y compris ceux proposes par le locataire au 1er appel -> 3 'refuse/locataire' + 3 'refuse/artisan' = 6 refus (RM-10.4.1) alors que le locataire n'a refuse que 3 creneaux. Consequences observees : (a) alerte 'creneaux_arbitrage' de criticite 'critique' ouverte pour le gerant ('6 creneaux refuses : reglez le rendez…
- **Cause probable** : app/supabase/migrations/20261012190000_validation_creneaux.sql:111-190 (contre_proposer_creneaux : update ... set statut='refuse' where intervention_id=... and statut='propose', l.~163-166 de la fonction)
- **Correction proposée** : Dans contre_proposer_creneaux : (1) refuser si le locataire a deja des propositions en attente : 'if exists (select 1 from intervention_creneaux where intervention_id=p_intervention and statut='propose' and propose_par='locataire' and debut>now()) then raise exception 'Vos disponibilites sont deja transmises ...'' ; (2) limiter l'UPDATE a propose_par='artisan' ; (3) idempotence applicative : transmettre une cle de tentative (comme declarer_mon_incident_reprise) pour rejouer sans effet. Test de non-regression : appeler 2 fois avec les memes dates et verifier 1 seul tour locataire et 0 alerte.
- **Preuve (banc)** : preuves/relecture/reprises/t11-contre-proposition.sortie.txt et t11b-suite.sortie.txt (scripts ts/t11-contre-proposition.mjs, ts/t11b-suite.mjs) : apres 1 envoi {propose/locataire:3, refuse/artisan:3, alertes:0} ; apres rejeu {propose/locataire:3, refuse/artisan:3, refuse/locataire:3, alertes:1} ; 2 envois simultanes : meme etat final (alerte:1) ; evenements refuses_cumules 3 puis 6 ; proposer_creneaux ensuite : 'Six creneaux ont deja ete refuses'
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select a.intervention_id, a.tour as tour_locataire_refuse, min(b.tour) as tour_locataire_suivant, (select count(*) from public.intervention_creneaux r where r.intervention_id=a.intervention_id and r.statut='refuse') as refus_cumules, exists (select 1 from public.alerts al where al.type='creneaux_arbitrage' and al.details->>'intervention_id'=a.intervention_id::text) as alerte_arbitrage from public.intervention_creneaux a join public.intervention_creneaux b on b.intervention_id=a.intervention_id and b.propose_par='locataire' and b.tour>a.tour where a.propose_par='locataire' and a.statut='refuse…`
- **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — second envoi sans effet, liste corrigée = anciens créneaux caducs

#### `SUP-02` — Pendant une session de diagnostic artisan ouverte (30 min), le trigger de lecture seule est pose sur TOUTES les tables de public, y compris supervision_arrets / supervision_operations : l'arret d'urg…

- **Observé** : Un super-administrateur ouvre un diagnostic sur un artisan, puis doit declencher l'arret d'urgence : commander_arret_supervision echoue avec 'Diagnostic artisan en lecture seule : aucune modification autorisee' (message affiche tel quel par l'ecran, sans dire qu'il faut quitter la session). L'arret redevient possible apres fermer_session_artisan().
- **Cause probable** : 20261012222100:poser_gardes_diagnostic_artisan exclut seulement supervision_sessions_artisan et audit_log ; supervision_arrets, supervision_operations, supervision_vacances, supervision_alertes_internes, supervision_consignes* reçoivent le trigger refuser_mutation_diagnostic_artisan.
- **Correction proposée** : Ajouter les tables supervision_* à la liste d'exclusion (l'arrêt d'urgence ne doit jamais dépendre de l'état d'une session de diagnostic) puis rejouer poser_gardes_diagnostic_artisan() ; à défaut, faire fermer la session par commander_arret_supervision et préciser le message d'erreur.
- **Preuve (banc)** : preuves/relecture/supervision/21-arret-pendant-diagnostic.sortie.txt
- **Correction sans aval** : non (aval du dirigeant requis)
- **Contrôle en production (lecture seule)** : `select count(*) from public.supervision_sessions_artisan where fermee_le is null and expire_le>now(); -- sessions pendant lesquelles un arrêt d'urgence serait refusé`
- **Statut** : corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — l'arrêt d'urgence ne dépend plus d'un diagnostic ouvert

#### `SA-04` — Mode relais actif et arrêt d'urgence invisibles hors de /admin/relais : aucun bandeau dans la console, les pages Équipes et Brief ne signalent pas l'arrêt

- **Attendu** : L'état 'arrêt d'urgence en cours' et 'relais actif jusqu'à …' sont visibles de partout dans la console (bandeau), et la page Équipes ne promet pas de 'Prochain passage' pendant un arrêt global
- **Observé** : Aucune mention sur les 5 pages (seuls /admin/relais, section 'Arrêt avant les prochains effets', en bas de page, et le lien 'Relais et absences →' du brief). La page Équipes continue d'afficher 'Premier passage attendu' et 'Prochain passage : vers 9 h' pendant un arrêt global. Dans le code, executerMission revient 503 avant commencer_mission quand l'arrêt est actif (src/lib/execution-mission.ts) : aucun passage n'est écrit, donc un arrêt oublié ne laisse aucune trace dans Équipes ni dans le brief (lecture de code, non exécuté sur le banc faute de CRON_SECRET : hypothèse à vérifier). Aucun lieu n'affiche non plus qui a arrêté ni quand ; seul le motif apparaît.
- **Cause probable** : src/app/admin/layout.tsx et src/app/admin/equipes/page.tsx ne lisent jamais supervision_arrets / supervision_vacances (grep) ; src/lib/execution-mission.ts:8-9
- **Correction proposée** : Afficher dans le bandeau de la console 'Arrêt d'urgence en cours depuis … par … (motif)' et 'Relais actif jusqu'à …' ; sur Équipes, remplacer 'Prochain passage' par 'Arrêté' ; écrire un passage 'arrêté' (ou une opération) quand une exécution planifiée est refusée par l'arrêt
- **Preuve (banc)** : sql2/s10_arret_sortie.txt (lignes 'bandeau/indicateur d'arrêt visible sur … AUCUN') ; captures2/08-arret-global-actif.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : corrigée en branche — 9978efa — bandeau d'arrêt d'urgence et de relais sur toute la console

#### `SA-08` — Journal d'audit : 9 types d'actions sans libellé (« Action enregistrée (libellé manquant) »), dont l'octroi du rôle de super-administrateur et les décisions de support, et la suppression d'un encaiss…

- **Attendu** : Chaque action sensible a un libellé lisible, un auteur, une cible, une date et un résultat (ex. 'Droit de supervision accordé à X par Y')
- **Observé** : Les lignes existent en base (adhesion_creee {role: super_admin, statut: active}), mais l'écran affiche 'Action enregistrée (libellé manquant)' sans cible. Sans aucune correspondance ni repli : adhesion_creee, adhesion_retiree, decision_retour (auteur et heure visibles, ni cible ni résultat), bien_retabli, bien_retire, point_du_matin_prepare, invitation_locataire, invitation_locataire_acceptee, invitation_locataire_envoi_echec (9 types, 9 lignes dans la première page du journal). Libellés trompeurs par expressions régulières de repli : suppression_encaissement et suppression_encaissement_depot -> 'Nettoyage de données arrivé à échéance' (alors que c'est un geste humain sur la comptabilité, a…
- **Cause probable** : src/lib/libelles-journaux.ts:50-58 (table ACTIONS incomplète ; replis par expressions régulières /purge\|retention\|suppression/, /modif\|update\|change/, /creat\|ajout\|insert/ ; défaut 'libellé manquant')
- **Correction proposée** : Ajouter les libellés explicites avec cible (compte, rôle, retour, encaissement) ; retirer le repli /suppression/ ; mettre en évidence tout octroi du rôle super_admin ; test qui échoue si une action écrite au journal n'a pas de libellé explicite
- **Preuve (banc)** : sql2/ecran-journaux-2.txt ; sql2/s23 (sortie console) ; sql2/s20_retours_sortie.txt ; requête audit_log par action (13/10 00:24 adhesion_creee super_admin)
- **Correction sans aval** : oui
- **Statut** : corrigée en branche — 9978efa — neuf codes nommés, plus de repli « suppression = nettoyage »

#### `PRO2-01` — Un propriétaire dont la commune n'est pas ouverte au réseau ne peut solliciter aucun artisan, même un artisan connu : le carnet ne se remplit que par une intervention déjà confiée

- **Attendu** : Soit un moyen de confier le dossier à un artisan connu du propriétaire (invitation, ajout au carnet), soit un chemin explicite vers la clôture ou l'attente ; à confirmer par la décision produit sur l'ouverture progressive du réseau
- **Observé** : Bouton « Ouvrir la mise en concurrence » désactivé, message « Le réseau d'artisans Gerimmo n'est pas encore disponible pour ce métier dans cette zone », bouton secondaire « Signaler mon intérêt » (n'envoie rien). Le carnet est vide et sans formulaire d'ajout. Seuls le super-administrateur (ouverture de communes, rattachement d'artisans) ou une insertion en base (artisan_agences) débloquent le parcours. Pour poursuivre la chaîne il a fallu une fixture SQL (zone 75011 pour artisan.alpha qui ne couvrait que 75012, et lien carnet). Peut être un choix produit voulu de la V1 (réseau fermé par défaut) : non recoupé avec le wiki.
- **Cause probable** : src/app/agence/[orgId]/incidents/formulaires-artisan.tsx:188 (disabled={!autorisee}) ; migrations reseau_disponibilite / reseau_contact_personnel (contact personnel = ligne artisan_agences active, créée seulement par le rattachement)
- **Correction proposée** : Décision produit : permettre à un propriétaire d'inviter ou d'ajouter un artisan à son carnet personnel, ou afficher la voie de sortie (clôturer, appeler soi-même) à côté du message de réseau fermé
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures/p3-05-ouverture-consultation.png ; /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1/captures/p3-07-carnet-artisans.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — choix produit : réseau fermé pour la commune du propriétaire, carnet sans formulaire d'ajout

#### `ART-13` — L'artisan ne peut pas déposer une version 2 de son devis : la demande close devient lecture seule, sans « réviser mon devis »

- **Attendu** : Un moyen explicite de déposer une version 2 (numérotée, v1 conservée) quand le propriétaire le demande
- **Observé** : L'écran affiche « Ma réponse » (montant, validité, lien PDF) sans action. L'appel RPC renvoie « Cette demande n'attend plus de devis (état : devis_depose) ». Corollaire de PRO2-12 : aucune numérotation de versions n'existe (un seul incident_devis par sollicitation).
- **Cause probable** : deposer_devis n'accepte que les sollicitations à l'état envoyee ; pas de notion de version.
- **Correction proposée** : Voir PRO2-12 (décision produit préalable).
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/sql/permissions-api.txt (ligne A.deposer_devis_structure) ; /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/captures/a7-02-apres-envoi.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — fonction manquante : l'artisan ne peut pas déposer une version 2 de son devis

#### `PRO2-12` — Un devis reçu ne peut être que retenu : ni refus motivé, ni demande de révision (écart avec le référentiel : déposé, validé, refusé ou expiré)

- **Attendu** : Possibilité de refuser le devis (motif conservé et transmis) ou de demander une révision, l'artisan pouvant alors déposer une version 2 (wiki concepts/Devis : déposé, validé, refusé ou expiré)
- **Observé** : Les seules actions sont « Télécharger le détail du devis (PDF) », « Ouvrir le devis » et « Retenir ce devis ». Aucun refus, aucun motif, aucune révision. Le statut devis_statut du schéma ne compte que depose, retenu, non_retenu, expire, annule. Pour obtenir une autre offre il faut ouvrir une nouvelle consultation avec un autre artisan, déjà exclu ici car « tous les artisans qui correspondent sont déjà sollicités ». Parcours étapes 3 et 4 de la mission (refus v1, dépôt v2) impossible. À trancher : choix produit V1 ou fonction manquante.
- **Cause probable** : Le code n'implémente que retenir_devis (app/actions/incidents.ts retenirDevis) ; wiki 'Divergences code et référentiel V3' signale déjà l'écart d'états.
- **Correction proposée** : Décision produit : soit documenter que la V1 ne propose que « retenir » (et le dire à l'écran), soit ajouter un refus motivé + une demande de révision qui rouvre la sollicitation à l'artisan.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/captures/o2-01-devis-recu.png ; liste des boutons dans la sortie du script scripts/o3.mjs ; énumération devis_statut en base
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — fonction manquante : un devis reçu ne peut pas être refusé ni renvoyé en révision

#### `PRO2-13` — Réception d'un devis : aucune alerte dans l'application, seulement un e-mail ; l'incident n'est pas compté « À traiter »

- **Attendu** : Une alerte « Devis reçu — à décider » (comme pour « Incident à qualifier » ou « Nouveau message »), l'incident compté dans « À traiter »
- **Observé** : Le compteur d'alertes reste à 6, aucune ligne alerts de type devis, « À traiter » reste à 2 (INC-0001 et INC-0003 à qualifier) alors que INC-0002 attend la décision du propriétaire. Seule trace : l'événement « Devis déposé » dans la chronologie de l'incident et l'e-mail devis_recu (échec tracé dans tech_log faute de fournisseur). Si l'e-mail est perdu, le dossier dort.
- **Cause probable** : notifierDevisRecu (lib/notifications.ts) n'envoie que l'e-mail ; aucune insertion dans alerts à la création du devis.
- **Correction proposée** : Créer une alerte (type devis_recu, criticité normale) dans la même transaction que le dépôt du devis et compter l'incident dans « À traiter » tant qu'un devis attend la décision.
- **Preuve (banc)** : /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/captures/o2-01-devis-recu.png ; /tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/preuves/chaine/1b/sql/notifications-tech-log.txt (notification_echec, evenement devis_recu)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — aucune alerte dans l'application à la réception d'un devis (e-mail seul) : création d'une alerte en base à décider

#### `ART-21` — Rien n'empêche de démarrer, de terminer et de facturer plusieurs jours avant le rendez-vous confirmé avec le locataire

- **Attendu** : Au minimum un avertissement (ou une garde) quand la mission est démarrée/terminée avant le début du rendez-vous confirmé, ou une confirmation par le locataire avant facturation
- **Observé** : demarrer_intervention n'accepte que les statuts acceptee/planifiee et ne compare pas la date : la mission passe en cours puis terminée cinq jours avant le rendez-vous, la facture est déposée, le propriétaire reçoit « facture déposée » alors que le locataire attend encore l'artisan ; la photo « après » et le compte rendu ne sont pas vérifiables par le système (une photo quelconque suffit)
- **Cause probable** : supabase/migrations: demarrer_intervention (aucune comparaison avec debut_prevu) ; terminer/deposer_compte_rendu idem
- **Correction proposée** : Avertir (non bloquant) l'artisan qui démarre avant debut_prevu - 2 h, journaliser l'écart dans la chronologie, et faire figurer « rendez-vous prévu le … / intervention terminée le … » sur la fiche de validation du propriétaire
- **Preuve (banc)** : sql/etat-apres-facture.txt, captures/d5-01-intervention-terminee.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — règle métier : démarrer, terminer et facturer avant le rendez-vous confirmé

#### `CHN-01` — Les créneaux non retenus sont enregistrés « refusés » : après trois reports, l'artisan est bloqué et l'écran impute au locataire des refus qu'il n'a jamais faits

- **Attendu** : Seuls les créneaux réellement refusés par le locataire (« Aucun ne me convient ») comptent pour l'arbitrage à six refus ; les créneaux non choisis sont « caducs » ou « non retenus »
- **Observé** : Chaque choix passe les 2 autres créneaux proposés à « refuse » (choisir_creneau) ; le décompte de l'arbitrage compte tous les « refuse ». Après 3 tours : 6 refus, 0 proposition du locataire, l'artisan reçoit « Six créneaux ont déjà été refusés : le rendez-vous se règle désormais avec le gérant » et ne peut plus déplacer ; la fiche du propriétaire affiche « Refusé » en face de créneaux que le locataire n'a pas refusés ; le texte « refus persistant du locataire tracé et opposable » (RM-10.4.4) s'appuie donc sur des données fausses
- **Cause probable** : app/supabase/migrations/20261013102000_planning_conflits.sql:86 (choisir_creneau : set statut='refuse', refuse_le=now() sur les autres créneaux 'propose') et 20261012190000_validation_creneaux.sql:73 (garde 'six refus' sur count statut='refuse'), 20260927160000_creneaux_passes_non_retenables.sql:222 (drapeau arbitrage)
- **Correction proposée** : Passer les créneaux non choisis à 'caduc' (statut existant) ou distinguer le refus par un champ dédié, et ne compter que les créneaux refusés par refuser_creneaux_locataire. Prévoir un test : 3 cycles choix/report ne déclenchent pas l'arbitrage.
- **Preuve (banc)** : sql/creneaux-faux-refus.txt, captures/c4-01-deplacement-erreur.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — règle métier : les créneaux non retenus comptent aujourd'hui comme refusés (six refus = arbitrage) ; une correction en base les rendrait « caducs »

#### `LOC-21` — Le locataire ne peut ni reporter ni annuler un rendez-vous confirmé : aucun geste après la confirmation

- **Attendu** : Un geste « Je ne peux plus » (reporter avec nouvelles disponibilités, ou prévenir) comme le prévoit la machine à états du rendez-vous (confirmé → reporté → proposé) du wiki Planification d'intervention ; le brief de la chaîne l'attend aussi
- **Observé** : La fiche ne montre plus que « Prévoyez d'être présent, ou de faire ouvrir — nous vous le rappellerons la veille » ; les gestes de report n'existent que côté artisan (« Déplacer le rendez-vous ») et d'annulation que côté propriétaire (« Retirer la mission à cet artisan ») ; le seul contournement est d'écrire un message libre à « Mon gestionnaire »
- **Cause probable** : app/src/app/locataire/[orgId]/demandes/suivi-intervention.tsx (aucun formulaire à l'étape planifiee) ; pas de RPC locataire de report (refuser_creneaux_locataire n'agit qu'avant le choix)
- **Correction proposée** : Ajouter à l'étape planifiée « Je ne peux pas être là » : ouvre la contre-proposition (trois disponibilités), invalide le créneau retenu et prévient l'artisan et le propriétaire ; à défaut, un lien direct vers le message au gestionnaire pré-rempli
- **Preuve (banc)** : captures/l2-01-rdv-planifie-locataire.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — fonction manquante : le locataire ne peut ni reporter ni annuler un rendez-vous confirmé

#### `PRO2-21` — Le règlement de la facture de l'artisan n'est pas un geste de l'application : l'écriture du journal n'est liée à rien et la facture ne passe jamais à « réglée »

- **Attendu** : Un geste « Marquer comme réglée » (déclaratif, sans paiement réel) qui crée l'écriture liée à la facture et à l'incident, et met à jour l'état visible par le propriétaire, l'artisan et le super-administrateur
- **Observé** : Le formulaire d'écriture n'a ni champ facture ni champ incident ; l'écriture (id cc2e2c0f…) est libre (catégorie, lot, libellé), la facture reste validee sans date de règlement ; le seul « payé » du produit est le registre privé de l'artisan (déclaratif, non confirmé par le client) : les deux états peuvent diverger sans que personne ne le voie
- **Cause probable** : app/src/app/agence/[orgId]/comptabilite (saisie libre) ; intervention_factures n'a pas de colonne de règlement (id, numero, montant, validee_le, decision_motif, imputation_validee)
- **Correction proposée** : Ajouter à la validation (ou après) « Enregistrer le règlement » : date, moyen, référence, qui crée l'écriture de dépense avec lien intervention_factures.id et trace d'audit ; afficher « réglée le … » côté propriétaire et artisan
- **Preuve (banc)** : sql/ecriture-reglement.txt, captures/o6-01-saisie-ecriture.png
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — fonction manquante : le règlement d'une facture d'artisan n'est lié ni à la facture ni à l'incident

#### `PR178-B-04` — Les formulaires passés par useActionStateProtegee ne s'envoient plus avant l'hydratation : l'amélioration progressive des actions serveur est perdue sur une soixantaine de formulaires

- **Attendu** : L'envoi aboutit comme sur /inscription (POST natif de l'action serveur).
- **Observé** : Formulaire protégé : rien ne se passe (action HTML = javascript:throw new Error('React form unexpectedly submitted.'), aucun message). Témoin : le serveur répond et affiche son message. Contournement : attendre la fin du chargement et recliquer.
- **Cause probable** : src/lib/use-action-state-protegee.ts : l'action passée à useActionState devient une fonction cliente (async) enveloppant l'action serveur ; React ne peut plus sérialiser une référence d'action serveur dans le HTML rendu côté serveur. 70 formulaires concernés (grep use-action-state-protegee).
- **Correction proposée** : Documenter le compromis ; ou désactiver visuellement le bouton d'envoi tant que la page n'est pas hydratée (état « chargement ») pour que le clic précoce ne soit pas silencieux ; ou conserver l'action serveur en action du formulaire et poser la protection par écouteurs (formdata) plutôt que par enveloppe.
- **Preuve (banc)** : preuves/relecture/pr178/b/scripts/sansjs.mjs (sortie console des deux cas)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — clic avant hydratation sans effet visible : désactiver le bouton jusqu'à l'hydratation, formulaire par formulaire

#### `PR178-B-06` — Encaissement après réponse perdue : la saisie conservée et le bouton actif permettent de rejouer l'envoi, et l'action serveur n'a pas de clé d'idempotence (double encaissement constaté)

- **Attendu** : Un seul encaissement ; ou impossibilité de renvoyer sans avoir rouvert le dossier.
- **Observé** : Après l'étape 2 : l'encaissement est déjà enregistré, le formulaire garde 2 et le bouton reste actif ; l'étape 3 crée un second encaissement de 2,00 € (2 lignes en base). L'invitation « Vérifiez le dossier avant de recommencer » n'est pas actionnable sans quitter la page, et quitter la page déclenche en plus l'avertissement « modifications non enregistrées ». Corrigeable ensuite par « Retirer » (journal), mais le déclencheur a pu émettre un reçu en trop. Avant la PR, la même panne affichait la page d'erreur (formulaire perdu), pas un formulaire prêt à rejouer.
- **Cause probable** : src/app/actions/loyers.ts:ajouterEncaissement (insert sans clé) ; idem encaisserDepot (depot.ts) et ajouterEcriture (compta.ts), lecture seule, non reproduits pour ces deux-là. Seules parc.ts (creation_id), auth.ts et retours.ts (cle_envoi) portent une clé. src/lib/use-action-state-protegee.ts conserve la saisie et ne désactive pas l'envoi après l'échec.
- **Correction proposée** : Ajouter un champ caché cle_envoi (UUID par formulaire monté, régénéré après succès confirmé) et une contrainte d'unicité sur l'encaissement ; à défaut, après une réponse perdue, remplacer le bouton par « Vérifier l'encaissement » qui relit l'état du bail avant de réarmer l'envoi. À arbitrer P1 si l'on juge l'avertissement insuffisant face à l'effet comptable et au reçu envoyé au locataire.
- **Preuve (banc)** : preuves/relecture/pr178/b/PR178-B-encaissement-reponse-perdue.png ; scripts/rejeu1.mjs
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — rejeu possible d'un encaissement après réponse perdue : demande une clé d'idempotence et une contrainte en base (migration)

#### `SA-01` — Traversée de la supervision dans un espace client : écriture financière possible sans motif ni durée, et la ligne d'audit 'traversee_action' ne dit ni quelle action, ni sur quel objet, ni avec quel r…

- **Attendu** : Action sensible attribuable : auteur, cible (bail/montant), date, résultat ; l'entrée dans un espace client motivée (motif) et bornée (durée) comme l'exige la mission ; l'écriture financière rattachée à son auteur
- **Observé** : L'encaissement de 10 € est écrit (encaissements : 3 lignes, 1 010 €) ; les tables encaissements et ecritures n'ont aucune colonne d'auteur ; le seul indice est une ligne audit_log action='traversee_action', details={} (account_id, organization_id, date). Cette même action est aussi émise à la simple ouverture de la page (ligne 19:06:55 avant tout envoi du formulaire), donc elle ne distingue pas lecture et écriture. Chaque navigation écrit en plus 1 à 15 lignes 'traversee_espace' vides (15 en une minute). Aucun motif demandé, aucune durée. C'est la limite déjà actée dans le wiki ('Entrer dans son espace reste sans motif ni durée', audit 25/09) ; l'écriture complète dans l'espace client la pr…
- **Cause probable** : src/lib/ged-acces.ts:56 (log_sa_access sans détails) ; src/lib/espace.ts:44 ; fonction SQL log_sa_access (insert avec details vide par défaut)
- **Correction proposée** : Passer en détails l'objet et le geste (route ou action, identifiant de l'objet, résultat) ; émettre traversee_action seulement sur les écritures ; demander un motif court et borner la traversée en écriture (30 min, comme pour l'artisan) ; ajouter l'auteur aux écritures financières
- **Preuve (banc)** : sql/brief_snapshot_faits.txt ; captures/05-dossier-depuis-brief.png ; captures/06-encaisser-formulaire.png ; sortie SQL : audit_log (traversee_action, details={}) et ecritures da8357d8… (sans auteur)
- **Correction sans aval** : non (aval du dirigeant requis)
- **Statut** : à trancher — limite déjà actée au wiki (audit du 25/09) : entrée dans un espace client sans motif ni durée ; l'écriture complète la prolonge

#### `PROP-BANC-01` — Banc : serveur :3100 démarré sans SUPABASE_SERVICE_ROLE_KEY (inscription et liens bloqués)

- **Attendu** : compte créé et espace ouvert (comme en première passe)
- **Observé** : /api/sante = 503 {motif: 'SUPABASE_SERVICE_ROLE_KEY absente.'} ; inscription valide = « Inscription impossible : L’envoi des liens de connexion n’est pas configuré. Contactez l’administrateur. »
- **Cause probable** : environnement du processus 3100 (hors produit) ; lib/supabase/service.ts:30-33 renvoie null sans la clé
- **Correction proposée** : relancer le serveur du banc avec la clé de service (hors périmètre de ce rôle)
- **Preuve (banc)** : sql/api-sante.txt ; captures/s1-12-espace-ouvert-bureau.png (état dégradé)
- **Correction sans aval** : oui
- **Statut** : acceptée — défaut du banc d'essai, pas du produit ; banc-up.sh vérifie la clé de service

## P3 — cosmétique ou mineur (67)

| ID | Source | Anomalie | Statut |
|---|---|---|---|
| `AUD-A-05` | auditeur/a | Écart documentation/code : la piste d'audit générique documentée n'existe pas | ouverte |
| `AUD-A-06` | auditeur/a | Insertion anonyme directe dans demandes_devis sans limite de débit | ouverte |
| `AUD-B-03` | auditeur/b | Cookie de session lisible par script et marqué Secure seulement si NEXT_PUBLIC_SITE_URL commence par https:// *(hyp.)* | ouverte |
| `AUD-B-05` | auditeur/b | Dépôt de deux fichiers identiques : un seul conservé, sans le dire | ouverte |
| `AUD-C-03` | auditeur/c | L'ordre d'application des migrations n'est pas l'ordre des noms de fichiers *(hyp.)* | ouverte |
| `AUD-C-04` | auditeur/c | Trois versions de PostgreSQL dans les preuves de sauvegarde, sans garde de coherence (hypothese a verifier) *(hyp.)* | ouverte |
| `AUD-C-05` | auditeur/c | L'arret d'urgence ne couvre pas les e-mails declenches par le webhook Stripe (hypothese a verifier) *(hyp.)* | ouverte |
| `AUD-C-06` | auditeur/c | L'export CSV du journal ne neutralise pas les formules de tableur (hypothese a verifier) *(hyp.)* | ouverte |
| `AUD-C-07` | auditeur/c | Les routes cron directes n'ont ni verrou de mission ni reservation avant envoi (doublon d'e-mail possible, hypothese a verifier) *(hyp.)* | ouverte |
| `AUD-C-08` | auditeur/c | Fichiers PDF orphelins possibles si le webhook Youtrust et la tache de nuit traitent le meme evenement en meme temps (hypothese a verifier) *(hyp.)* | ouverte |
| `LOC-01` | chaine/1 | Dépôt d'une attestation déjà déposée : message technique générique au lieu de « ce fichier est déjà dans votre dossier » | ouverte |
| `ART-11` | chaine/1b | Quantité et taux de TVA écrits avec un point décimal (« 2.5 », « 5.5 % ») sur le PDF du devis et dans le détail vu par le propriétaire, alors que les montants et le sélecteur sont en virgule | ouverte |
| `ART-12` | chaine/1b | Quantité ou prix invalide (0, « abc », 12,345, -5) : le total reste à 0,00 € sans dire quel champ est en cause | ouverte |
| `ART-15` | chaine/1b | La photo jointe par le locataire n'est visible de l'artisan ni au stade du devis ni sur la fiche de mission | ouverte |
| `PRO2-11` | chaine/1b | Élision manquante dans le nom de parc généré : « Parc de Éloïse … » (même famille que LOC-02) | ouverte |
| `CHN-02` | chaine/2 | La validation de la facture, l'écriture de règlement et la clôture de l'incident ne laissent aucune ligne au journal d'audit : seule la chronologie de l'incident les garde | ouverte |
| `LOC-22` | chaine/2 | Un locataire connecté qui ouvre /artisan arrive sur le formulaire d'inscription artisan | ouverte |
| `PRO2-22` | chaine/2 | Un propriétaire direct lit « privé à votre agence » sur la notation de l'artisan, et l'artisan lit « l'agence le tranchera » sur l'écart de facture (recoupe PROP-09) | ouverte |
| `PROP-05` | proprietaire/s01 | Nom d'espace sans élision : « Parc de Éloïse … » | ouverte |
| `PROP-08` | proprietaire/s01 | Recherche globale (⌘K) insensible à la casse mais pas aux accents ; code postal non recherchable | ouverte |
| `PROP-09` | proprietaire/s01 | Libellés d'agence ou de permission dans l'espace propriétaire direct | ouverte |
| `PROP-10` | proprietaire/s01 | Message serveur de la clé de répartition avec point décimal : « fait 99.99 » | ouverte |
| `PROP-11` | proprietaire/s01 | Un même PDF ne peut pas être déposé pour deux lots (DPE collectif) et la consigne n'est pas réalisable depuis le formulaire | ouverte |
| `PROP-16` | proprietaire/s01 | Hypothèse à vérifier : aucune cohérence contrôlée entre loyer, loyer de référence et loyer de référence majoré | ouverte |
| `FIN-02` | relecture/finance | Sur une organisation dont l'abonnement est suspendu, « Encaisser » répond « Accès refusé. » au lieu du message d'abonnement suspendu renvoyé par toutes les autres écritures. | ouverte |
| `FIN-03` | relecture/finance | Aucune contrainte de centime sur encaissements.montant / ecritures.montant : un paiement à 3 décimales est capturé avec un écart de 0,005 et ne peut plus jamais être qualifié (les parts doivent réconcilier exactement un montant que deux décimales ne peuvent p… | ouverte |
| `FIN-04` | relecture/finance | La régularisation 230 reste exigée (et est réintégrée si saisie) pour les lots passés en meublé ou hors périmètre, alors que leurs pièces sont exclues de la 2044. | ouverte |
| `FIN-05` | relecture/finance | « Montant net à qualifier » additionne recettes et dépenses non qualifiées en valeurs positives : ce n'est pas un net. | ouverte |
| `FIN-06` | relecture/finance | « Retrouver la ventilation historique » annonce un succès sans rien changer quand la pièce a déjà une capture avec une part non ventilée (avance). | ouverte |
| `FIN-08` | relecture/finance | Toute dépense qualifiée « Hors revenus fonciers » est présentée au propriétaire comme de la taxe d'enlèvement des ordures ménagères, et toute recette « hors 2044 » comme des provisions de charges encaissées. | ouverte |
| `FIN-09` | relecture/finance | La capture fiscale calcule « déjà encaissé avant » en sommant tous les AUTRES encaissements du bail présents en fin d'ordre : un INSERT à plusieurs lignes pour un même bail répartit faux (hypothèse : aucun chemin actuel de l'application n'insère plusieurs pai… | ouverte |
| `FIN-10` | relecture/finance | Le wiki métier n'a pas été mis à jour : il décrit encore la ligne 229 comme « part non récupérable seulement, postes récupérables retirés lot par lot », alors que le code ne retire plus rien (coproRecuperableExclue vaut toujours 0) et traite la réintégration… *(hyp.)* | ouverte |
| `FIN-12` | relecture/finance | Hypothèse à vérifier : les lectures de qualifications, de captures et d'écritures n'ont ni filtre d'année (captures, qualifications) ni garde contre la limite de 1 000 lignes de l'API, alors que d'autres écrans du dépôt la connaissent (« trop de lignes »). *(hyp.)* | ouverte |
| `FIN-13` | relecture/finance | Hypothèse à vérifier : l'encaissement en un clic prend la date par défaut de la base (current_date, fuseau UTC), pas la date de Paris ; entre 00 h 00 et 01 h 59 (heure de Paris) un règlement est daté de la veille, y compris le 31 décembre pour un 1er janvier. *(hyp.)* | ouverte |
| `PR178-A-06` | relecture/pr178/a | Accessibilité des copies locales : la région role=status change de phrase à chaque frappe (25 changements pour 12 caractères) et le focus tombe sur le body après « Reprendre ma saisie » | ouverte |
| `PR178-A-09` | relecture/pr178/a | Sans API Navigation (hypothèse Safari/iOS et Firefox), le geste Retour abandonne silencieusement un formulaire modifié *(hyp.)* | ouverte |
| `PR178-B-03` | relecture/pr178/b | Encaissement de 0,01 € accepté par le nouveau contrôle au centime mais refusé par la base avec le message générique « Gerimmo n'a pas pu terminer cette action » | ouverte |
| `PR178-B-07` | relecture/pr178/b | Les parcours navigateur ajoutés n'auraient détecté aucun des constats B-01 à B-06 : les tests du garde sont en partie synthétiques et aucun ne couvre les succès financiers, la session expirée ou les formulaires de recherche sans method | ouverte |
| `REP-02` | relecture/reprises | Le courriel d'urgence au gestionnaire n'est envoye qu'a la premiere execution : si la premiere tentative a cree l'incident puis s'est arretee avant l'e-mail, la reprise (rejoue:true) ne l'envoie jamais *(hyp.)* | ouverte |
| `REP-03` | relecture/reprises | Clients externes (module desactive en production) : apres un refus de validation, le meme justificatif ne peut plus etre remplace par un autre fichier de meme type tant que le formulaire n'est pas recharge, et un devis re-genere ne peut pas etre redepose *(hyp.)* | ouverte |
| `REP-04` | relecture/reprises | choisir_creneau et accepter_creneau_locataire ne sont pas rejouables : une reponse perdue suivie d'un nouvel envoi affiche une erreur alors que le rendez-vous est confirme | ouverte |
| `REP-05` | relecture/reprises | Ecart au wiki : l'expiration J+30 et le refus trace sont livres, mais les relances J+3 / J+10 prevues par le module 16 n'existent nulle part | ouverte |
| `SUP-03` | relecture/supervision | N'importe quel super-administrateur permanent peut accuser réception d'une alerte de relais adressée à un autre responsable : la fonction ne compare pas auth.uid() au destinataire (message d'erreur annonce pourtant « Responsable habilité requis »), et l'écran… | ouverte |
| `SUP-04` | relecture/supervision | Pas de séparation des rôles pour une consigne : le même superviseur peut la rédiger, se désigner responsable et l'approuver (alors que enregistrer_vacances impose « un autre responsable »). L'« approbation » n'est donc pas une double vérification humaine. | ouverte |
| `SUP-06` | relecture/supervision | Ces trois lectures font db.from('accounts').select('id,email') sans filtre puis filtrent en JavaScript : au-delà de la limite de lignes de l'API (1 000 par défaut chez Supabase), la liste des responsables habilités et les noms des destinataires sont tronqués… *(hyp.)* | ouverte |
| `SUP-07` | relecture/supervision | Le périmètre d'arrêt « Sauvegarde » est proposé au superviseur et accepté par la base, mais aucun code (workflow GitHub de sauvegarde, scripts app/scripts/sauvegarde/*) ne lit verifier_arret_supervision('sauvegarde') : l'arrêt n'arrête rien. *(hyp.)* | ouverte |
| `SUP-09` | relecture/supervision | Chaque validation d'un devis téléverse un nouveau PDF (chemin aléatoire) dans le compartiment devis-preparations et n'efface jamais l'ancien (ni celui d'une validation perdante en cas de conflit 409) : des PDF orphelins contenant les coordonnées de l'entrepri… *(hyp.)* | ouverte |
| `SA-02` | superadmin | Brief de direction : les montants des faits datés s'affichent avec un point décimal ('500.00 €') alors que les mesures s'affichent à la française ('4 870,00 €') | ouverte |
| `SA-03` | superadmin | Une consigne ambiguë (sans aucune tâche) peut être « autorisée » : l'écran dit « Aucune tâche proposée. Précisez les lectures » mais propose quand même « Autoriser la version 1 », et la base enregistre l'accord | ouverte |
| `SA-07` | superadmin | En diagnostic artisan, le bouton d'enregistrement de la fiche entreprise répond « Connectez-vous à votre espace artisan. » au lieu d'expliquer la lecture seule | ouverte |
| `SA-09` | superadmin | La recherche de la console ne trouve ni un bien, ni un lot, ni un incident : le brief du support demande de retrouver « un dossier (utilisateur, bien, incident) » | ouverte |
| `SA-10` | superadmin | Hypothèse à vérifier : aucun plafond de dépense applicatif pour les appels IA, et l'arrêt d'urgence ne couvre pas les appels IA déclenchés à la main (analyse du brief, rédaction de publications) *(hyp.)* | ouverte |
| `SA-11` | superadmin | Journal du blocage d'un compte : « Compte bloqué » est écrit avant l'effet ; si le blocage échoue, le journal garde « Compte bloqué » suivi d'une ligne d'échec sans cause | ouverte |
| `LOC-02` | chaine/1 | Élision manquante : « Dernier document — quittance de octobre 2026 » | corrigée en branche — 9978efa — « d'octobre » (espace locataire) |
| `ART-14` | chaine/1b | Mobile 390 px : la fiche d'une demande de devis close et l'accueil artisan débordent horizontalement avec un nom de client long | corrigée en branche — 611dce2 — en-tête du devis : min-width et retour à la ligne |
| `PUB-02` | coordinateur | Offre agence présentée au public alors que les agences sont hors périmètre V1 publique : accueil (repères, espaces, bandeau tarif, FAQ), tarifs, connexion, inscription artisan, choix d'espace, pied de page, métadonnées, deux sujets éditoriaux | corrigée en branche — commit e7982a7 |
| `PUB-04` | coordinateur | La mention de taxes de l'accueil et des tarifs citait encore les agences (« pour les particuliers comme pour les agences ») | corrigée en branche — 35b0ae8 — phrase de taxes sans agences, 4 tests |
| `PROP-04` | proprietaire/s01 | Surface démesurée : message technique « numeric field overflow » affiché à l'utilisateur | corrigée en branche — d6ef891 — surface bornée à 9 999,99 m² avec message clair |
| `PROP-06` | proprietaire/s01 | La page /connexion présente encore l'offre agence alors que les agences sont hors V1 publique | corrigée en branche — commit e7982a7 (/connexion sans offre agence) |
| `PR178-A-07` | relecture/pr178/a | Les copies de devis (une clé localStorage par demande) ne sont jamais purgées si l'artisan ne rouvre pas la même demande : l'expiration de 7 jours n'est contrôlée qu'à la lecture de la clé *(hyp.)* | corrigée en branche — 36219ec — copies effacées à la déconnexion et entre comptes ; les copies d'un même compte expiren… |
| `PR178-A-08` | relecture/pr178/a | Quand le stockage local est refusé, l'écran « La fiche est créée » affiche encore l'alerte « Gardez cet onglet ouvert jusqu'à confirmation de l'enregistrement » et chaque sortie déclenche la boîte « Quitter le site ? » alors qu'il n'y a plus rien à perdre | corrigée en branche — 36219ec — l'effacement qui échoue après un envoi confirmé ne laisse plus ni alerte ni boîte de so… |
| `PR178-B-02` | relecture/pr178/b | Import du parc : la confirmation de sortie « modifications non enregistrées » se déclenche encore après un import réussi (l'état de retour n'a pas de clé succes) | corrigée en branche — 36219ec — l'import du parc n'est plus suivi |
| `SUP-08` | relecture/supervision | Quand le responsable désigné perd son habilitation, traiter_vacances passe TOUTES les alertes non accusées du plan en « non_acheminee », y compris celles déjà escaladées vers le créateur (qui, lui, est habilité) ; elles ne peuvent alors plus escalader (l'esca… | corrigée en branche — 725f994 · migration 20261013120000 (à appliquer) — seules les alertes du responsable concerné son… |
| `SA-05` | superadmin | Les dates des retours utilisateurs s'affichent en UTC, sans mention de fuseau : 2 h de décalage (et parfois un jour) avec l'heure de Paris utilisée partout ailleurs dans la console | corrigée en branche — 9978efa — dates des retours à l'heure de Paris |
| `SA-06` | superadmin | Pluriels fautifs dans les écrans de relais et de consignes : 'après 1 minutes', 'Plafonds : 1 lectures au total, 1 par mois' | corrigée en branche — 9978efa — pluriels accordés |
| `EDI-01` | coordinateur | La ligne éditoriale de la veille accepte « agence » comme public valide (PUBLICS_JOURNAL) : un article visant seulement les agences passerait le filtre de pertinence en V1 | à trancher — ligne éditoriale |
| `PUB-03` | coordinateur | Les textes juridiques (conditions générales, mentions légales, confidentialité) décrivent encore l'offre et la tarification agence | à trancher — textes juridiques non modifiés |

---

Voir aussi : [[Audit d'acquisition du 3 octobre 2026]], [[Design system Gerimmo]].

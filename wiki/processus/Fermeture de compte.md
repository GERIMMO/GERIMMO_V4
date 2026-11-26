---
type: process
tags: [compte, fermeture, effacement, inactivite, rgpd, stripe, conformite, demandes, droits, support]
status: draft
created: 2026-10-24
updated: 2026-11-26
sources: ["[[Demandes sur les données et fermeture de compte]]", "[[Durées de conservation]]", "[[Registre des traitements]]", "log.md — entrées « decision » des 23/10/2026 (valeurs par défaut du plan) et 24/10/2026 (choix délégués 2 et 3), « deploy » du 24/10/2026 (PR #246 et PR #248, migration 20261024150000_activation_inactivite_v1)", "app/supabase/migrations/20261024130000_fermeture_comptes.sql", "app/src/lib/comptes-fermeture.ts", "app/src/app/actions/fermeture-compte.ts", "[[Recueil des textes officiels (v6)]]", "livrables/recueil/analyse-refs-25-37.md (réf. 31 et 34)", "livrables/notes-banc/notes-T4.md et relecture-T4R.md", "DECISIONS-2026-11-24.md (Q15, Q64)", "JOURNAL.md — lot T4 et contrôle de production du 24/11/2026", "QUESTIONS.md — Q64, Q86, Q87", "JURISTE.md — partie 9, points 28 et 35", "code de la branche fusionnée claude/palier-1-fusion (89cb87ff, complétée jusqu'à 062296e2, en production depuis le 25/11/2026 ; lecture seule) : migrations 20261125103000 et 20261125105000, lib/comptes-fermeture-serveur.ts, admin/donnees/programmer-fermeture.tsx, confidentialite/page.tsx ; code en ligne jusqu'au 25/11/2026 : 81740dec : lib/comptes-fermeture.ts", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)", "JOURNAL.md — entrée du 26/11/2026 (matin) (réglage R2)", "code relu le 26/11/2026 (lecture seule) : app/src/app/actions/demandes-donnees.ts, app/src/app/compte/donnees/, app/src/app/admin/donnees/, app/src/lib/signature-suivi.ts, app/src/lib/email.ts"]
---

# Fermeture de compte

**En une phrase :** depuis le 24/10/2026, un compte se ferme **sur demande** (programmée
par la supervision avant le 30/11, en libre-service ensuite) ou, une fois la V1 des
conditions publiée, **après 24 mois d'inactivité** et deux avertissements ; l'effacement a
lieu la nuit de la date d'effet, après la sauvegarde du jour, et ne garde que la preuve du
contrat, les références des factures et la trace de la demande.

> [!info] En production depuis le 24/10/2026
> PR #246 (`f79674c`), migration `20261024130000_fermeture_comptes.sql` (plan du 23/10,
> lot 1E, constats R14, R15, R51). Tâche pg_cron « fermetures-comptes » chaque nuit à
> 3 h 20 UTC ; **sa première exécution réelle est à vérifier le 25/10** dans
> `cron.job_run_details` (geste consigné au journal du 24/10). La règle d'inactivité est
> **inactive** : `VERSION_MIN_INACTIVITE` vaut `null` (aucun avertissement, aucune
> suppression) jusqu'à la publication des conditions V1, qui l'annoncent.
>
> *Mise à jour du 25/11/2026* : la V1 des conditions a été publiée le 24/10 (PR #248). Le même jour, la migration
> `20261024150000_activation_inactivite_v1` a passé la règle `compte:inactif` à **active**, et le code en ligne
> (`81740dec` jusqu'au 25/11, puis `062296e2` depuis le 25/11/2026, même valeur, relue le 26/11 dans `main`)
> pose `VERSION_MIN_INACTIVITE = "2026-10-24"` (log.md, entrée « deploy » du 24/10). La règle ne vise que
> les comptes qui ont accepté la V1 ou une version plus récente. La phrase « inactive » ci-dessus décrit l'état d'avant
> cette publication.

## Déclencheurs
1. **Demande du titulaire** : demande « Fermer mon compte » ou « effacement » déposée depuis
   « Mes données personnelles » (`/compte/donnees`, voir la section « Demandes sur les
   données personnelles » plus bas). Avant le 30/11, c'est le **super-administrateur permanent (second facteur)**
   qui la programme depuis `/admin/donnees` ; une demande écrite est exigée. Le bouton
   libre-service « Fermer mon compte » est prévu au lot 5.
2. **Inactivité** (dès que la règle sera active — *active depuis le 24/10/2026, voir l'encadré ci-dessus*) : compte d'un espace sans connexion d'un
   membre actif ni abonnement en cours depuis 22 mois (avertissement J-60), puis 23,5 mois
   (J-15) ; à 24 mois, la tâche quotidienne programme la fermeture (origine
   « inactivité »), seulement après les deux avertissements consignés. La règle ne vise que
   les comptes qui ont accepté la V1 (ou plus récente). Même règle pour un compte de
   locataire ou d'artisan : seuls son compte et ses propres données sont effacés.

## Étapes (fermeture sur demande)
1. **« Afficher le bilan »** (`simuler_fermeture_compte`) : ce que la fermeture effacerait,
   sans rien effacer (espaces effacés et leurs biens, lots, baux, personnes, documents,
   fichiers ; adhésions retirées ; dossiers d'autres propriétaires détachés ; archive
   requise ; abonnement en cours ; mode prévu, suppression ou neutralisation).
2. **Date d'effet** :
   - abonnement payé en cours : **fin de la période payée**, ou **J+14 avec remboursement au
     prorata** de la part non utilisée, au choix du titulaire (J+14 refusé et masqué si la
     période payée finit avant le quatorzième jour, ou sans facture lisible) ;
   - sinon : **J+14**.
   L'état de la souscription chez Stripe est relevé, puis l'arrêt posé à la date d'effet
   (marque `gerimmo_fermeture` : ni accusé de résiliation, ni courrier « résilié faute de
   règlement ») ; refus avant tout geste si plusieurs souscriptions vivent ou si la
   fermeture laisserait une souscription à des gestionnaires restants.
3. **Programmation** (`programmer_fermeture_compte`) ; « Mon abonnement » affiche alors la
   fermeture programmée et la nuit d'effacement, sans proposer « Résilier » ni « Annuler la
   résiliation ».
4. **Nuit de la date d'effet** (`executer_fermeture_compte`, une transaction par fermeture).
   Gardes : arrêt d'urgence, **sauvegarde quotidienne réussie le jour même**, date atteinte,
   **aucun gel**, bilan enregistré et **refait** (s'il a grandi : état « bilan_change », à
   réenregistrer), aucune souscription Stripe vivante, compte qui n'est pas un
   super-administrateur ; une rétractation en cours (non remboursée ou sans accusé) fait
   attendre.
5. **Ordre d'effacement** : archive de la preuve dans `archives_comptes` ; données de
   plateforme du compte ; espaces dont il est le **seul gérant actif** (dossiers, documents,
   fichiers, demandes Zoho relevées pour suppression chez le prestataire, fiche prospect
   liée) ; sinon, retrait de ses seules adhésions ; dans les dossiers d'**autres
   propriétaires**, `persons.account_id` mis à null avec une alerte à chacun ; tentative de
   suppression du compte d'authentification, et si une référence subsiste (journaux, demande
   de droits, dossier d'un tiers), **neutralisation** (adresse remplacée par une adresse en
   `.invalid`, mot de passe et métadonnées vidés, accès bloqué).
6. **Courriel « Votre compte Gerimmo est fermé »** : date et cause (« à votre demande du … »
   ou « faute de connexion depuis le … ») ; ce qui est effacé ; ce qui est conservé, chacun
   avec sa date de fin ; le remboursement (fait, en cours, ou clos avec son motif).

## Ce qui n'est jamais touché
- L'invitation ou la fiche d'**un autre propriétaire** ; les dossiers des propriétaires et
  gestionnaires restent sous leur responsabilité.
- Le **client Stripe** avant le terme des factures (six ans après la fin du dernier
  abonnement payé, jusqu'au 25/11/2026). *Depuis le 25/11/2026, version `062296e2` : dix ans, et jamais avant
  l'échéance recalculée de la dernière facture archivée — voir « Version préparée `062296e2` ».*
- Ce qui appartient à un autre compte : règlement déclaré par un artisan (détaché, référence
  de la facture gardée), demande d'aide d'un autre membre (détachée), parrainage (détaché,
  l'avantage de l'autre client reste), fiche d'un artisan citée par un propriétaire
  (détachée, retirée du réseau).
- Les **déclarations de rétractation** : gardées dix ans, détachées de l'espace effacé
  (choix délégué n° 2 du 24/10).

## Ce qui est conservé, avec un accès restreint

| Élément | Jusqu'à |
|---|---|
| Preuve du contrat (versions des conditions acceptées et dates, dates d'abonnement, identifiant de facturation, adresse électronique) | 10 ans après la fin du dernier abonnement payé ; **aucune** si le compte n'a jamais payé |
| Références des factures d'abonnement (les factures elles-mêmes restent chez Stripe) | 6 ans après la fin de l'exercice de la facture, à défaut après la fin du dernier abonnement payé (production jusqu'au 25/11/2026) ; **10 ans**, et jamais moins de dix ans après l'émission (version `062296e2`, en production depuis le 25/11/2026) |
| Déclaration de rétractation et trace de son remboursement | 10 ans après la déclaration |
| Trace de la demande (ou de la fermeture pour inactivité et de ses avertissements) | 3 ans |
| Registre des effacements à réappliquer après une restauration | 4 mois |
| Journaux de sécurité | Leur durée propre ([[Durées de conservation]]) |

Un compte qui a accepté les conditions et appartient à un espace qui a payé au moins une
facture **ne peut pas être supprimé** sans que sa preuve soit d'abord copiée dans
`archives_comptes` (déclencheur avant suppression) ; la preuve est aussi archivée dès qu'une
adhésion de titulaire d'un espace payant est retirée.

## Remboursement J+14
Dû dès l'arrêt chez Stripe, même si la fermeture est gelée ou annulée ensuite. Avant de
rembourser, l'application relit la souscription et les remboursements existants chez
Stripe (clé d'idempotence par facture) ; le remboursement est **clos à zéro avec son motif**
si une rétractation a déjà tout remboursé, si le paiement était déjà remboursé, ou si la
souscription s'est poursuivie au-delà de l'arrêt prévu. Le courriel de fin attend le
remboursement sept jours au plus, puis part en l'annonçant « en cours ».

## Annuler, geler, restaurer
- **Annuler** (`annuler_fermeture_compte`) : l'état de la souscription relevé avant la
  programmation est remis à l'identique (une résiliation demandée par le client reste
  demandée), la marque est retirée, l'échéance remise « à préparer ».
- **Geler** (`geler_fermeture_compte`) : litige ou créance, motif écrit ; aucune exécution
  tant que le gel est posé.
- **Restauration d'une sauvegarde** : `reappliquer_effacements` rejoue chaque fermeture
  exécutée avec le remboursement et le courriel déjà faits, sans rien redemander.

## Avertissements d'inactivité (quand la règle sera active)
*Règle active en production depuis le 24/10/2026 (encadré du début de page).*
- J-60 : « Votre compte Gerimmo sera supprimé le {date} » — « Personne ne s'est connecté à
  votre espace Gerimmo {organisation} depuis le {date} et aucun abonnement n'y est en cours.
  Conformément aux conditions générales, le compte et ses données de gestion seront
  supprimés le {date}. Pour les garder, il suffit de vous connecter avant cette date… »,
  avec le lien vers l'archive complète ([[Export complet des données]]) ; « Vous recevrez un
  dernier rappel quinze jours avant. »
- J-15 : « Dernier rappel : votre compte Gerimmo sera supprimé le {date} » ; un rappel envoyé
  en retard annonce une date à quinze jours au moins.
- Variantes : un agent est renvoyé vers le titulaire de l'espace ; un artisan vers l'export
  de son activité ; un locataire lit que les documents de la location restent chez le
  propriétaire. **La connexion de n'importe quel membre actif de l'espace compte** (choix
  délégué n° 3 du 24/10, lecture du plan).

## Demandes sur les données personnelles
*Reprise de [[Demandes sur les données et fermeture de compte]] (pages des 21 au 24/10/2026), fusionnée ici le
26/11/2026 ; formulaire et file de supervision relus dans le code le 26/11/2026.*

### Le formulaire et la file de supervision
- **`/compte/donnees`** (« Mes données personnelles ») : le titulaire connecté demande une copie, une rectification, un
  effacement ou la fermeture de son compte. La demande et les réponses restent **privées entre lui et la
  supervision**, même s'il appartient à une organisation. **Le formulaire ne supprime rien** et ne résilie aucun
  abonnement (l'écran le dit : « Aucune donnée n'a été supprimée »). Depuis le 24/10, une demande « Fermer mon
  compte » ou « effacement » peut être exécutée par la fermeture décrite plus haut.
- Même page : le titulaire télécharge l'**archive complète** de son espace (second facteur validé ou mot de passe
  récent) — [[Export complet des données]].
- **`/admin/donnees`** : file paginée qui sépare demandes ouvertes et terminées et affiche l'échéance d'**un mois
  civil** (jour de Paris), les réponses et leur historique. Une demande qui a reçu une réponse n'est plus signalée
  « sans première réponse ». « Résolu » ne s'emploie qu'après contrôle des résultats. L'alerte de délai est indicative :
  une réponse intermédiaire ne suffit pas forcément à remplir l'obligation.
- **En base** : `retours_utilisateurs` et `soumettre_retour` (nature « question », organisation nulle, auteur tiré de
  la session, clé d'envoi stable ; `app/src/app/actions/demandes-donnees.ts`) ; les politiques existantes protègent
  aussi `retours_historique`. Ni nouvelle permission ni migration (21/10).

### Traitement contrôlé (procédure du 21/10/2026)
Écrite avant que la fermeture programmée existe ; depuis le 24/10, la fermeture et l'effacement d'un compte suivent les
étapes de cette page.
1. Qualifier le titulaire, le responsable du traitement et les catégories demandées ; ne demander une preuve
   complémentaire qu'en cas de doute justifié.
2. Séparer ce qui peut être effacé de ce qui doit être conservé : motif, périmètre réduit, accès limité et échéance pour
   chaque catégorie.
3. Fournir les exports par un canal privé. Avant toute suppression : inventaire approuvé, sauvegarde vérifiée,
   simulation, puis validation. Vérifier à part l'abonnement et les dossiers partagés.
4. Zoho : vérifier la copie signée et son certificat dans le stockage privé de Gerimmo (lisibilité, empreintes) avant
   toute purge chez le prestataire ; la suppression par l'API documentée déplace en corbeille et ne prouve pas un
   effacement définitif. Contrôler aussi les autres prestataires et les sauvegardes.
5. Révoquer sessions et accès, traiter les références partagées, vérifier les fichiers physiques. La suppression du
   seul compte d'authentification n'invalide pas les jetons déjà délivrés ; une anonymisation doit être irréversible,
   pas un simple changement de nom. Réappliquer les effacements après une restauration.
6. Répondre précisément : effacé, conservé (avec motif et durée), copies encore en attente. Ne garder que les preuves
   nécessaires.

Durées : [[Durées de conservation]] (58 règles depuis le 24/10, contre 29 au 21/10 ; pièces de la gestion directe :
36 mois après la fin du bail). La durée générale de cinq ans citée par certains anciens documents ne doit pas être
présentée comme la prescription universelle des baux d'habitation : Service-Public distingue notamment un délai de
trois ans.

### Courriels et signatures (relevé des 21 et 22/10/2026)
- **Accords du dirigeant du 21/10** : adresse de réponse `contact@gerimmo.app`, un seul essai vers son adresse
  professionnelle approuvée, réception MX par Resend, DMARC en observation (`p=none` : il observe, ne rejette rien) ;
  SPF et DKIM inchangés. Domaine et réception vérifiés par Resend, e-mail d'essai « Delivered » ; la réponse entrante
  n'était pas encore constatée.
- **Zoho Sign** : rappels par e-mail à J+7 et J+21, puis alerte interne à J+28 (jamais de troisième rappel au
  signataire) ; SMS de vérification gardés ; rappels natifs de Zoho désactivés à la création du circuit, pour éviter le
  cumul ; le rapprochement vérifie l'identité des signataires et archive le PDF signé et le certificat avant de terminer
  le circuit ; une réservation d'envoi incertaine n'est pas répétée automatiquement. Variables `RESEND_REPONDRE_A` et
  `ZOHO_SIGN_RELANCES_ACTIVES` (lues par `app/src/lib/email.ts` et `app/src/lib/signature-suivi.ts`), enregistrées pour
  la production dans Vercel le 21/10. Le contact propre à une organisation reste prioritaire ; un échec réseau après
  l'appel d'envoi est déclaré « incertain », pour ne pas proposer de renvoi aveugle. Aucun circuit de signature n'était
  en production au moment du contrôle.
- **Rétention automatique globale de Zoho : désactivée** — elle toucherait des documents anciens dont l'archivage local
  n'est pas démontré ; les copies passent par la procédure ci-dessus avant une purge qualifiée.
- **Décision du 22/10** : l'expéditeur des signatures garde pour le moment l'adresse personnelle du dirigeant, à changer
  plus tard ; cela remplace l'objectif d'une adresse professionnelle immédiate pour les signatures, sans toucher au
  courriel de contact du site. Envoi standard Zoho, aucun SMTP ajouté. Changements locaux de conservation :
  [le bilan du 22 octobre](../../app/docs/signatures-conservation-22-octobre.md).

### Vérifications du 21/10/2026
161 tests ciblés (demandes, courrier, signatures), 130 tests sur base fictive (suivi, atomicité, supervision) et 21
tests de support et d'actions (recouvrement partiel avec les 130), tous réussis ; aucun droit supplémentaire, aucune
donnée métier de production modifiée. Parcours local : dépôt, confirmation, persistance après rechargement,
historique, refus d'accès à la supervision pour un gestionnaire, réponse du super-administrateur fictif retrouvée après
rechargement ; écrans d'ordinateur et de téléphone (390 px) sans débordement. Ces tests locaux ne valent pas recette
humaine des prestataires externes.

### Sources consultées (21/10/2026)
- [CNIL — exercice des droits et délai](https://www.cnil.fr/fr/passer-laction/les-droits-des-personnes-sur-leurs-donnees).
- [CNIL — effacement](https://www.cnil.fr/fr/comprendre-mes-droits/le-droit-leffacement-supprimer-vos-donnees-en-ligne).
- [CNIL — durées de conservation](https://www.cnil.fr/sites/default/files/atoms/files/guide_durees_de_conservation.pdf).
- [Service-Public — conservation des papiers](https://www.service-public.gouv.fr/particuliers/vosdroits/F19134) et [prescription locative](https://www.service-public.gouv.fr/particuliers/vosdroits/F479).
- [Zoho — rétention des documents](https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/account-settings/document-retention/articles/document-retention) et [suppression API vers la corbeille](https://www.zoho.com/sign/api/document-managment/delete-document.html).
- [Resend — DMARC](https://resend.com/docs/dashboard/domains/dmarc).

## Relations
[[Export complet des données]] ·
[[Durées de conservation]] · [[Registre des traitements]] (P13, P15) · [[RGPD]] ·
[[Rétractation en ligne]] · [[Résiliation de l'abonnement]] · [[Super Admin]] ·
[[Compte, personne et adhésion]]

> [!warning] Points à trancher / contradictions
> - **Inactivité** : la connexion d'un locataire garde l'espace d'un bailleur absent (choix
>   délégué n° 3) ; à confirmer par le dirigeant. Durée de 24 mois et avertissements à deux
>   mois et quinze jours — à confirmer sur Légifrance (source non ouverte le 23/10/2026) :
>   RGPD art. 5.1 e, recommandation CNIL sur les comptes inactifs.
> - **Brouillons de devis d'un artisan** : ils partent avec la sollicitation effacée (choix
>   délégué n° 4 du 24/10) ; garder une copie chez l'artisan reste une option.
> - **Comptes d'avant la V1** : la règle ne vise que les comptes qui ont accepté la V1 ; la
>   production comptait un seul compte et aucune organisation au 24/10.
>   - *25/11* : contrôle en lecture seule du 24/11 : 10 comptes en tout, dont 2 créés le 19/11, que le dirigeant dit
>     être des comptes de test (Q64) ; aucun autre depuis le 14/11 (JOURNAL.md).
> - **Suppression chez Zoho** : l'API documentée déplace en corbeille ; l'effacement
>   définitif n'est pas garanti (lot 5).
> - **Demandes de personnes sans compte** : tenues à la main dans `/admin/donnees` ; la table dédiée
>   (`demandes_droits_externes`) est prévue au lot 5 — absente des migrations au 26/11/2026.
> - **Conservation des demandes** (`support:demande_droits`, 36 mois après la clôture) : règle créée le 24/10,
>   **inactive** jusqu'à son bilan ([[Durées de conservation]] ; la version `062296e2` n'active aucune règle).
> - **Droit à l'effacement et délais** (RGPD art. 12.3, 17, 18, 19, 28.3 g) : à confirmer sur
>   Légifrance (source non ouverte le 23/10/2026). Même réserve pour le délai d'un mois affiché aux demandes et pour
>   une réponse donnée par une seule personne (le dirigeant).
>   - *25/11 — recueil fourni par le dirigeant, non recontrôlé* : il reproduit les articles 5, 6, 12 à 15, 22, 28 et 33
>     du RGPD ; l'article 17 (effacement) n'y est pas, ni les articles 18 et 19. L'analyse du recueil n'a relevé aucun
>     écart sur la réponse sous un mois, prolongeable de deux mois, telle que l'écrit la page confidentialité
>     ([[Recueil des textes officiels (v6)]], réf. 34).
> - **Recette Stripe en mode test** à faire : remboursement J+14 après une hausse de formule,
>   relecture des remboursements, remise de l'état à l'annulation, suppression d'un client au
>   terme de ses factures.

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.

## Version préparée `062296e2`, en production depuis le 25/11/2026 : factures dix ans (lot T4)

Fait dans la branche `claude/palier-1-fusion` (`89cb87ff`, complétée jusqu'à `062296e2`, poussée le 25/11 sur la branche de préproduction `claude/palier-1-preproduction`), vérifié sur le banc local, **en
production depuis le 25/11/2026** (PR #358, `main` = `8f9dd9ce` ; les deux migrations ci-dessous font partie des 52
appliquées le 25/11 à 22:09Z ; `log.md`, entrée « deploy » du 25/11/2026). Le
déroulé de la fermeture (déclencheurs, étapes, gardes, remboursement, annulation, gel) ne change pas. Ce qui change
tient aux durées gardées après la fermeture ([[Durées de conservation]]) :

- **Factures d'abonnement : dix ans au lieu de six**, d'après le recueil fourni par le dirigeant (**non recontrôlé sur
  Légifrance**) : loi n° 2026-534, article 36, qui modifie l'article L. 102 B du livre des procédures fiscales
  ([[Recueil des textes officiels (v6)]], réf. 31). La copie des factures jointe à l'archive du compte fermé est
  retirée dix ans après la fin de l'exercice de la facture (à défaut, après la fin du dernier abonnement payé), jamais
  moins de dix ans après son émission ; les archives déjà constituées ne sont pas réécrites, mais leur ancienne date ne
  sert plus seule à supprimer.
- **Client Stripe** : jamais supprimé (avec ses factures) avant dix ans après la fin du dernier abonnement payé, ni
  avant l'échéance recalculée de sa dernière facture archivée (`clients_stripe_au_terme`, migration `20261125103000`).
- **L'archive attend la suppression du client Stripe** (migration `20261125105000`, reprise T4R-01) : sans elle, la
  preuve du contrat et la dernière facture échéant le même jour, la purge aurait effacé l'archive avant que la mission
  « purge » ne supprime le client, laissé alors chez Stripe sans limite.
- **Textes** : la console de fermeture (`/admin/donnees`) dit « Preuve du contrat payé archivée avant l'effacement
  (dix ans ; factures dix ans) » ; la page confidentialité et l'article 9 des conditions générales (version du
  24/11/2026 ; `/conditions` affiche « Version du 24 novembre 2026, en vigueur depuis cette date » ; archivée dans la
  console le 26/11/2026 à 05:56Z, réglage R2 du plan de publication, vérifié en base par l'agent : `JOURNAL.md`,
  entrée du 26/11 (matin)) disent dix ans. Le courriel
  « Votre compte Gerimmo est fermé » donne la date de fin calculée par la base, donc dix ans.
- **Banc d'essai seulement** : aucun e-mail réel, aucun appel à Stripe pendant ces travaux ; aucune purge n'a pu
  supprimer de facture à six ans (aucune n'a six ans avant 2032 ; production non lue). Les migrations devaient être
  appliquées avant le 1er janvier 2027 au plus tard : elles le sont depuis le 25/11/2026 (22:09Z).

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Six ans (production jusqu'au 25/11/2026) / dix ans (version `062296e2`, en production depuis le 25/11/2026)** :
>   un compte fermé avant le lot T4 a reçu un courriel disant
>   que ses factures sont gardées six ans ; elles le seront dix ans. Faut-il le prévenir ? (Q86 ; supposé : aucun compte
>   payant fermé à ce jour, non vérifié en production.)
> - **Conditions acceptées par un abonné existant** : la version du 24/11/2026 (article 9 : dix ans) demande l'accord
>   exprès de l'abonné au prochain acte (décision Q15) ; un abonné qui n'a pas répondu n'a accepté qu'une version qui
>   annonce six ans, alors que la purge appliquera dix ans à tous. Quelle version le régit ? (JURISTE.md, partie 9,
>   point 35 ; aucun abonné aujourd'hui.)
> - **Point de départ des dix ans** : le recueil ne donne pas la rédaction de L. 102 B au 1er janvier 2027 (JURISTE.md,
>   partie 9, point 28).
> - **Écran de simulation du nettoyage** : il compte encore parmi les preuves arrivées à leur terme une archive que la
>   purge fait désormais attendre (Q87) — écart d'affichage seulement.
> - **Libre-service** : l'énoncé en tête de page annonce la fermeture « en libre-service » après le 30/11 ; la version
>   `062296e2`, en production depuis le 25/11/2026, ne l'apporte pas : le bouton « Fermer mon compte » reste prévu au
>   lot 5, et d'ici là la demande déposée depuis « Mes données personnelles » est exécutée par la supervision (commentaire de la page confidentialité,
>   branche fusionnée).

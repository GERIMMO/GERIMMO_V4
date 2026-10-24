---
type: process
tags: [compte, fermeture, effacement, inactivite, rgpd, stripe, conformite]
status: draft
created: 2026-10-24
updated: 2026-10-24
sources: ["[[Demandes sur les données et fermeture de compte]]", "[[Durées de conservation]]", "[[Registre des traitements]]", "log.md — entrées « decision » des 23/10/2026 (valeurs par défaut du plan) et 24/10/2026 (choix délégués 2 et 3), « deploy » du 24/10/2026 (PR #246)", "app/supabase/migrations/20261024130000_fermeture_comptes.sql", "app/src/lib/comptes-fermeture.ts", "app/src/app/actions/fermeture-compte.ts"]
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

## Déclencheurs
1. **Demande du titulaire** : demande « Fermer mon compte » ou « effacement » déposée depuis
   « Mes données personnelles » (`/compte/donnees`,
   [[Demandes sur les données et fermeture de compte]]). Avant le 30/11, c'est le **super-administrateur permanent (second facteur)**
   qui la programme depuis `/admin/donnees` ; une demande écrite est exigée. Le bouton
   libre-service « Fermer mon compte » est prévu au lot 5.
2. **Inactivité** (dès que la règle sera active) : compte d'un espace sans connexion d'un
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
  abonnement payé).
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
| Références des factures d'abonnement (les factures elles-mêmes restent chez Stripe) | 6 ans après la fin de l'exercice de la facture, à défaut après la fin du dernier abonnement payé |
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

## Relations
[[Demandes sur les données et fermeture de compte]] · [[Export complet des données]] ·
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
> - **Suppression chez Zoho** : l'API documentée déplace en corbeille ; l'effacement
>   définitif n'est pas garanti (lot 5).
> - **Droit à l'effacement et délais** (RGPD art. 12.3, 17, 18, 19, 28.3 g) : à confirmer sur
>   Légifrance (source non ouverte le 23/10/2026).
> - **Recette Stripe en mode test** à faire : remboursement J+14 après une hausse de formule,
>   relecture des remboursements, remise de l'état à l'annulation, suppression d'un client au
>   terme de ses factures.

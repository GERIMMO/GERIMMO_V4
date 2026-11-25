---
type: process
tags: [compte, fermeture, effacement, inactivite, rgpd, stripe, conformite]
status: draft
created: 2026-10-24
updated: 2026-11-25
sources: ["[[Demandes sur les données et fermeture de compte]]", "[[Durées de conservation]]", "[[Registre des traitements]]", "log.md — entrées « decision » des 23/10/2026 (valeurs par défaut du plan) et 24/10/2026 (choix délégués 2 et 3), « deploy » du 24/10/2026 (PR #246 et PR #248, migration 20261024150000_activation_inactivite_v1)", "app/supabase/migrations/20261024130000_fermeture_comptes.sql", "app/src/lib/comptes-fermeture.ts", "app/src/app/actions/fermeture-compte.ts", "[[Recueil des textes officiels (v6)]]", "livrables/recueil/analyse-refs-25-37.md (réf. 31 et 34)", "livrables/notes-banc/notes-T4.md et relecture-T4R.md", "DECISIONS-2026-11-24.md (Q15, Q64)", "JOURNAL.md — lot T4 et contrôle de production du 24/11/2026", "QUESTIONS.md — Q64, Q86, Q87", "JURISTE.md — partie 9, points 28 et 35", "code de la branche fusionnée claude/palier-1-fusion (89cb87ff, lecture seule) : migrations 20261125103000 et 20261125105000, lib/comptes-fermeture-serveur.ts, admin/donnees/programmer-fermeture.tsx, confidentialite/page.tsx ; code en ligne 81740dec : lib/comptes-fermeture.ts"]
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
> (`81740dec`) pose `VERSION_MIN_INACTIVITE = "2026-10-24"` (log.md, entrée « deploy » du 24/10). La règle ne vise que
> les comptes qui ont accepté la V1 ou une version plus récente. La phrase « inactive » ci-dessus décrit l'état d'avant
> cette publication.

## Déclencheurs
1. **Demande du titulaire** : demande « Fermer mon compte » ou « effacement » déposée depuis
   « Mes données personnelles » (`/compte/donnees`,
   [[Demandes sur les données et fermeture de compte]]). Avant le 30/11, c'est le **super-administrateur permanent (second facteur)**
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
  abonnement payé). *Version préparée (non publiée) : dix ans, et jamais avant l'échéance recalculée de la dernière
  facture archivée — voir « Version préparée, à publier ».*
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
| Références des factures d'abonnement (les factures elles-mêmes restent chez Stripe) | 6 ans après la fin de l'exercice de la facture, à défaut après la fin du dernier abonnement payé (production) ; **10 ans**, et jamais moins de dix ans après l'émission (version préparée) |
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
>   - *25/11* : contrôle en lecture seule du 24/11 : 10 comptes en tout, dont 2 créés le 19/11, que le dirigeant dit
>     être des comptes de test (Q64) ; aucun autre depuis le 14/11 (JOURNAL.md).
> - **Suppression chez Zoho** : l'API documentée déplace en corbeille ; l'effacement
>   définitif n'est pas garanti (lot 5).
> - **Droit à l'effacement et délais** (RGPD art. 12.3, 17, 18, 19, 28.3 g) : à confirmer sur
>   Légifrance (source non ouverte le 23/10/2026).
>   - *25/11 — recueil fourni par le dirigeant, non recontrôlé* : il reproduit les articles 5, 6, 12 à 15, 22, 28 et 33
>     du RGPD ; l'article 17 (effacement) n'y est pas, ni les articles 18 et 19. L'analyse du recueil n'a relevé aucun
>     écart sur la réponse sous un mois, prolongeable de deux mois, telle que l'écrit la page confidentialité
>     ([[Recueil des textes officiels (v6)]], réf. 34).
> - **Recette Stripe en mode test** à faire : remboursement J+14 après une hausse de formule,
>   relecture des remboursements, remise de l'état à l'annulation, suppression d'un client au
>   terme de ses factures.

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les corrections retenues et les réserves encore ouvertes. Les mentions « non publié » ci-dessus décrivent l’état avant la mise en ligne ; seule une entrée `deploy` du journal en atteste l’achèvement.

## Version préparée, à publier : factures dix ans (lot T4, non publié)

Fait dans la branche `claude/palier-1-fusion` (`89cb87ff`, complétée par `ee28d874`, poussée le 25/11 sur la branche de préproduction `claude/palier-1-preproduction`), vérifié sur le banc local, **pas en production**. Le
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
  24/11/2026) disent dix ans. Le courriel « Votre compte Gerimmo est fermé » donne la date de fin calculée par la base,
  donc dix ans.
- **Banc d'essai seulement** : aucun e-mail réel, aucun appel à Stripe pendant ces travaux ; aucune purge n'a pu
  supprimer de facture à six ans (aucune n'a six ans avant 2032 ; production non lue). Migrations à appliquer avant le
  1er janvier 2027 au plus tard.

> [!warning] Points à trancher / contradictions (25/11/2026)
> - **Six ans (production) / dix ans (version préparée)** : un compte fermé avant le lot T4 a reçu un courriel disant
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
>   préparée ne l'apporte pas : le bouton « Fermer mon compte » reste prévu au lot 5, et d'ici là la demande déposée
>   depuis « Mes données personnelles » est exécutée par la supervision (commentaire de la page confidentialité,
>   branche fusionnée).

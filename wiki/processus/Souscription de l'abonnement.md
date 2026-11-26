---
type: process
tags: [abonnement, souscription, stripe, consommateur, support-durable, mediateur, vendeur, accord-expres, onboarding, essai, invitations, import]
status: in-progress
created: 2026-10-24
updated: 2026-11-26
sources: ["[[Abonnement]]", "[[Cycle de vie de l'abonnement]]", "[[Conditions générales]]", "[[Grille tarifaire]]", "[[Recueil des textes officiels (v6)]]", "log.md — entrées « decision » du 23/10/2026 et « deploy » du 24/10/2026 (PR #246, PR #247)", "DECISIONS-2026-11-24.md (Q7, Q15, Q76, compléments du 24/11)", "QUESTIONS.md (Q7, Q63, Q65, Q75, Q76, Q78, Q80 à Q83, Q91, Q92, Q96)", "JURISTE.md, partie 9 (points 26, 29, 32)", "JOURNAL.md — lots D7, T4 et D4 (24-25/11/2026)", "livrables/notes-banc/notes-D7.md, notes-T4.md (§ 1.1, 9), notes-D4.md, fusion/corrections-fusion-notes.md (E-01, R-01), fusion/PLAN-PUBLICATION-NOTES.md", "livrables/recueil/analyse-refs-25-37.md (réf. 25, 28, 29)", "code en production jusqu'au 25/11 : 81740dec — app/src/lib/garde-souscription.ts, garde-souscription-serveur.ts, courriers-contrat.ts", "version lue avant la publication : 89cb87ff (branche claude/palier-1-fusion, complétée jusqu'à 062296e2, en production depuis le 25/11) — mêmes fichiers, app/src/app/actions/abonnement.ts, app/src/app/agence/[orgId]/abonnement/abonnement-2026.tsx et boutons-abonnement.tsx", "log.md — entrée « deploy » du 25/11/2026 (publication de 062296e2)", "livrables/PLAN-DE-PUBLICATION.md (§ 4, réglages R1, R2, R6 à R8)", "JOURNAL.md — entrée du 26/11/2026 (matin) : réglages R1 à R4", "[[Onboarding et abonnement]]", "[[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]", "[[2026-09-28-decision-tarification]]", "[[Recette de production]]", "[[Parrainage]]", "code relu le 26/11/2026 (lecture seule) : migrations 20261115094646_essai_deux_mois_permanent, 20261115130412_cloture_audit_contrats_marketing (ouvrir_organisation), 20261116083100_demarrage_encaissement (parcours_demarrage), 20261117092314_import_parc_identite_bien, 20261024110000_vente_et_impaye (org_ecriture_ouverte) ; app/src/components/parcours-demarrage.tsx, app/src/lib/relances-invitations.ts, app/src/lib/lien-mot-de-passe.ts"]
---

# Souscription de l'abonnement

**En une phrase :** le propriétaire choisit sa formule dans « Mon abonnement », lit un récapitulatif qui rappelle son
droit de rétractation, coche une case de confirmation, paie sur la page sécurisée de Stripe, puis reçoit **une seule
fois** un courriel de confirmation sur support durable, avec les conditions acceptées et le formulaire de
rétractation. En amont : l'ouverture de l'espace (inscription en ligne du propriétaire, ouverture d'une agence par le
super admin), l'essai de deux mois et le parcours de démarrage — section « Avant la souscription » plus bas.

> [!info] Où en est-on (26/11/2026)
> - **En production depuis le 25/11/2026** à 23:17Z (26/11 à 00 h 17, heure de Paris) : version `062296e2` (branche
>   fusionnée `89cb87ff`, complétée jusqu'à `062296e2`, vérifiée en entier sur le banc), publiée par la PR #358
>   (`main` = `8f9dd9ce`, identique à `062296e2`) ; ses 52 migrations sont appliquées (25/11, 22:09Z) et la recette de
>   production n° 58 a réussi (`log.md`, entrée « deploy » du 25/11/2026) : vendeur complet exigé, médiateur traité à
>   part, accord exprès aux nouvelles conditions (lots D7, T4, D4). Les **ventes restent fermées** (réglage « Ouvrir
>   les souscriptions » non ouvert, Q7 ; `/tarifs` relue le 25/11 après la publication).
> - **Jusqu'au 25/11** : code `81740dec`, servi depuis le 21/11, production gelée du 22/11 à la publication ; ventes
>   fermées. Le parcours ci-dessous existe depuis le 24/10 (PR #246 et #247).
> - **Fait le 26/11 au matin** par le dirigeant (`livrables/PLAN-DE-PUBLICATION.md`, § 4), vérifié par l'agent (pages
>   publiques, base en lecture seule ; `JOURNAL.md`, entrée du 26/11 matin) : identité du vendeur (R1 ; forme affichée
>   « Entrepreneur individuel (EI) », sans nom commercial ; médiateur : « aucun organisme n'est désigné à ce jour ») et
>   archivage des conditions du 24/11 dans la console (R2, 05:56Z).
> - **Pas encore fait au 26/11 (06:10Z)** : en-tête des factures dans Stripe (R7). Décisions non prises : ouverture des
>   souscriptions (R8), vente aux particuliers sans médiateur (R6). Les **ventes restent fermées**.

## Déclencheur
Le titulaire de l'espace, pendant ou après l'essai, ouvre « Mon abonnement » et choisit une périodicité et une formule
([[Grille tarifaire]]). L'ouverture de l'espace et l'essai qui précèdent : section « Avant la souscription ».

## Ce qui doit être vrai avant d'ouvrir le paiement

| Condition | Jusqu'au 25/11 (`81740dec`) | En production depuis le 25/11/2026 (`062296e2`) |
|---|---|---|
| Ventes ouvertes | Réglage de la console, fermé | Inchangé : **toujours fermé au 26/11** (case « Ouvrir les souscriptions » non cochée ; `/tarifs` relue le 25/11 après la publication) ; à ouvrir par le dirigeant, s'il le décide, après les autres réglages (R8) |
| Identité du vendeur | Complète, sauf si le super admin a « levé le blocage » | **Complète pour toute première souscription, agence comprise, blocage levé ou non**, avec un « type de vendeur » choisi et, pour un entrepreneur individuel, le nom suivi de « EI » ; « Lever le blocage » ne vaut plus que pour les hausses de capacité (Q78). Identité saisie le 26/11 (R1), forme affichée « Entrepreneur individuel (EI) » |
| Médiateur de la consommation | Exigé pour la première souscription d'un particulier depuis le 13/11 (PR #332) | Exigé par défaut pour un particulier ; ouverture sans lui sur **décision datée** du dirigeant, réglage à part « Vente aux particuliers sans médiateur de la consommation » (case « j'ai lu les deux articles », inscrite à l'historique, « Retirer cette décision » la défait). Jamais exigé pour une agence ni pour une hausse |
| Conditions acceptées | Une acceptation de la version en vigueur (`2026-11-15`) | Une acceptation de la version en vigueur (`2026-11-24`) **portant l'empreinte du texte archivé** ; sans archive, la case est redemandée et la souscription attend. Version du 24/11 archivée le 26/11 à 05:56Z (R2) |
| Archive des conditions | Particulier : toute l'identité saisie doit être celle archivée | Toute première souscription : seuls le nom, l'adresse, l'e-mail et l'encadré imprimés dans le contrat sont comparés ; saisir le médiateur ne referme plus rien (D7R-02, E-01) |

Phrases servies au client (en production depuis le 25/11/2026) : « Le paiement en ligne n'est pas encore ouvert : les mentions légales
de l'éditeur sont en cours de publication. » ; « Le paiement en ligne n'est pas encore ouvert aux particuliers. Un
médiateur de la consommation doit d'abord être désigné, et ses coordonnées publiées, avant la première
souscription. » ; « Les souscriptions sont en attente de la vérification de la version archivée des conditions
générales. » Pendant l'essai, chacune finit par « Votre essai continue. »

Fondements cités pour le médiateur et la mention « EI » : code de la consommation L612-1 et L616-1 ; code de commerce
R526-27 — **textes du [[Recueil des textes officiels (v6)]], fournis par le dirigeant, non recontrôlés sur
Légifrance**. Voir [[Médiation de la consommation]] et [[Entrepreneur individuel (EI)]] (pages à créer).

## Étapes
1. **Conditions** : si le compte n'a pas accepté la version en vigueur, une case « J'ai lu et j'accepte la version du …
   des conditions générales » l'enregistre (`acceptations_cgu`, document `conditions_clients`).
2. **Récapitulatif avant paiement** : formule, prix, date du premier prélèvement, durée et reconduction, puis :
   - « Droit de rétractation : vous pouvez renoncer à cet abonnement, sans motif, pendant 14 jours après la
     souscription (jusqu'au {date} inclus si vous validez aujourd'hui), depuis « Mon abonnement » (bouton « Renoncer au
     contrat ici ») ou avec le formulaire de l'article 8.10 des conditions générales. Vous êtes alors remboursé
     intégralement, sous 14 jours, sur la carte utilisée. » ;
   - « Paiement par carte bancaire, sur la page sécurisée de notre prestataire de paiement. »
   - Depuis le 25/11/2026 (`062296e2`) : pour un particulier, les coordonnées du médiateur si elles sont saisies, sinon « Médiateur de la
     consommation : aucun n'est désigné à ce jour ; ses coordonnées figureront dans les mentions légales dès sa
     désignation. » (lu seulement si le dirigeant a décidé de vendre sans médiateur).
   Le lien « Conditions générales d'utilisation et de vente, version du … » reste affiché sous le bouton.
3. **Case de confirmation** (texte du plan, mot pour mot) : « J'ai vérifié le montant de {total} {période} et
   j'accepte qu'il soit prélevé {à partir du {date} / dès la validation du paiement}, selon les conditions ci-dessus.
   Je demande que mon abonnement payant commence à cette date, même pendant mon délai de rétractation, que je
   conserve : si je l'exerce, je suis remboursé intégralement. » Son horodatage entre dans la preuve du contrat.
4. **Page de paiement Stripe** (« Continuer vers le paiement sécurisé ») : langue française et, sous le bouton de
   Stripe, « En cliquant, vous commandez l'abonnement Gerimmo {formule} avec obligation de paiement : {montant} {par
   mois / par an}{, premier prélèvement le {date}}. » Le libellé du bouton lui-même est celui de Stripe.
5. **Conclusion** : l'abonnement payant est conclu quand Stripe confirme la souscription ; le webhook enregistre sa
   date (`abonnements.souscrit_le`), qui fait courir le délai de [[Rétractation en ligne]]. Journal d'audit :
   `abonnement_commande_confirmee`.
6. **Courriel de confirmation** (« Confirmation de votre abonnement Gerimmo »), envoyé **une seule fois par
   souscription** (clé `souscription-{id}`), à l'adresse de facturation :
   - souscription, formule et nombre de biens, prix — « TVA non applicable, **article** 293 B du CGI » en franchise
     depuis le 25/11/2026 (« art. » jusqu'au 25/11, version `81740dec`) —, paiement par carte, premier prélèvement, durée (mensuel :
     durée indéterminée, résiliable pour la prochaine échéance ; annuel : douze mois reconduits tacitement, avis entre
     trois mois et un mois avant l'échéance) ;
   - droit de rétractation jusqu'au {date limite} inclus, bouton ou formulaire ;
   - médiation : coordonnées du médiateur si elles sont saisies ; sinon, jusqu'au 25/11 (`81740dec`), « Médiateur de la
     consommation : adhésion en cours ; ses coordonnées figureront dans les mentions légales dès qu'elle sera
     effective. » et, depuis le 25/11/2026 (`062296e2`), « Médiateur de la consommation : aucun n'est désigné à ce jour ; ses
     coordonnées figureront dans les mentions légales dès sa désignation. » (aucune adhésion n'est établie, Q7) ;
   - les conditions acceptées **en PDF** si leur version est archivée ([[Conditions générales]]), sinon leur adresse ;
   - le formulaire de rétractation de la version en vigueur (« adresse de l'éditeur » depuis le 25/11/2026), puis
     l'identité de l'éditeur.
   Un échec d'envoi ne fait pas échouer le webhook : la confirmation est retentée à la mise à jour suivante d'une
   souscription de moins de 30 jours, puis par le **rattrapage de nuit**. Journal d'audit :
   `abonnement_confirmation_envoyee`.

## Après la souscription : accord aux nouvelles conditions (en production depuis le 25/11/2026, Q15)
Quand une nouvelle version « au prochain acte » est archivée, l'abonné l'accepte par une case non cochée sous le
bouton de son **prochain acte** : hausse de formule ou de capacité, changement de périodicité, reprise après
résiliation. Sans la case, l'acte est refusé ; la résiliation et le renouvellement tacite ne demandent rien ; rien
n'est coupé et l'abonnement n'est jamais mis en non-reconduction pour la version du 24/11. Version non archivée :
l'acte passe comme avant. Détail : [[Conditions générales]]. *26/11 : la version du 24/11 est archivée depuis le 26/11
à 05:56Z (réglage R2) ; aucun abonné actif (contrôle C2 refait le 26/11), ventes fermées.*

## Résultat / sorties
- Souscription active, preuve de la commande et de la confirmation gardée dix ans (`journal:audit_preuve_contrat`,
  [[Durées de conservation]]).
- **Factures** : fabriquées par Stripe. Gerimmo n'écrit que le pied (« TVA non applicable, article 293 B du CGI. »
  depuis le 25/11/2026) ; le nom, l'adresse et le SIREN du vendeur en tête viennent des **réglages du compte
  Stripe**, à faire par le dirigeant (Q80 ; réglage R7, pas encore fait au 26/11). Un client Stripe existant ne reçoit le nouveau pied qu'à sa prochaine
  souscription ou hausse (T4R-10). Factures gardées dix ans depuis le 25/11/2026 ([[Registre des traitements]],
  P2).
- **Ensuite** : [[Cycle de vie de l'abonnement]]. Révision tarifaire notifiée au moins un mois avant (conditions,
  article 8.9) ; résiliation par la seule page « Résilier votre contrat » ([[Résiliation de l'abonnement]]) ;
  rétractation par le bouton « Renoncer au contrat ici » ([[Rétractation en ligne]]) ; impayé :
  [[Impayé de l'abonnement]]. [[Parrainage]] : un mois offert au parrain à la conversion de son filleul (depuis le
  30/09/2026), rien de plus pour le filleul.

## Gestes du jour de la publication (plan de publication ; publication faite le 25/11/2026)
1. Migrations avant le code (dont `20261125106000` : type de vendeur et vente sans médiateur), puis le code. **Fait**
   le 25/11/2026 : 52 migrations appliquées à 22:09Z, code publié à 23:17Z (`log.md`, entrée « deploy »).
2. Console, « Contact et entreprise » : choisir le **type de vendeur** (entrepreneur individuel), saisir l'identité
   donnée le 24/11 (Q76), relire nom, adresse et e-mail **avant** d'archiver.
3. Contrôler zéro abonné actif, puis archiver la version du 24 novembre 2026 depuis Santé ; vérifier « L'identité du
   vendeur est complète. »
4. Après « je valide la publication » (message donné le 25/11) : « Ouvrir les souscriptions » (réglage R8, si le
   dirigeant le décide).
5. Médiateur : le saisir dès qu'il est désigné, ou décision datée de vendre sans lui aux particuliers (Q75).
6. Hors Gerimmo : en-tête des factures dans le compte Stripe ; intitulé du compte bancaire professionnel avec la
   dénomination « … EI » (R526-27, alinéa 3, recueil non recontrôlé).

*26/11 (06:10Z) : gestes 2 et 3 faits par le dirigeant le 26/11 au matin, vérifiés par l'agent (R1 : identité saisie,
forme affichée « Entrepreneur individuel (EI) » ; R2 : contrôle C2 refait, aucun abonné actif, puis version du 24/11
archivée à 05:56Z ; `JOURNAL.md`, entrée du 26/11 matin ; le message « L'identité du vendeur est complète. » de Santé
n'y est pas repris). Reste le geste 6 (en-tête des factures dans Stripe et
intitulé du compte bancaire, R7). Décisions non prises : ouverture des souscriptions (geste 4, R8) et vente aux
particuliers sans médiateur (geste 5, R6). Les ventes restent fermées (case « Ouvrir les souscriptions » non cochée).*

## Relations
[[Abonnement]] · [[Cycle de vie de l'abonnement]] · [[Onboarding et abonnement]] · [[Rétractation en ligne]] ·
[[Résiliation de l'abonnement]] · [[Impayé de l'abonnement]] · [[Grille tarifaire]] · [[Conditions générales]] ·
[[Registre des traitements]] · [[Médiation de la consommation]] · [[Entrepreneur individuel (EI)]] ·
[[Recueil des textes officiels (v6)]]

> [!warning] Points à trancher / contradictions
> - **Vente sans médiateur** : le dirigeant a décidé « on peux ouvrir les ventes même sans ce dernier » ; sa règle
>   générale est « tout doit respecter les textes de loi », et le texte fourni (L612-1, L616-1, recueil non
>   recontrôlé) ne prévoit aucune exception, ni pour l'essai gratuit. Option appliquée : fermé aux particuliers par
>   défaut, ouverture sur décision datée (Q65, Q75 ; juriste, partie 9, point 26).
> - **Contradiction avec l'ancienne version de cette page** : elle disait « le médiateur ne bloque plus » (décision du
>   23/10). C'est faux en production depuis le 13/11 (PR #332), y compris dans la version `062296e2` publiée le 25/11,
>   sauf décision datée.
> - **« Particulier »** = tout espace au tarif propriétaire, SCI et propriétaire professionnel compris : le médiateur
>   leur est exigé comme à un consommateur (Q81) — option la plus protectrice, à confirmer.
> - **Mention de franchise** : « TVA non applicable » gardée « pour l'instant » (décision du 24/11) ; le vendeur a pour
>   activité déclarée « formation continue d'adultes » (Q66) ; après le 1er janvier 2027, la franchise passe dans le
>   code des impositions sur les biens et services et la nouvelle mention n'est pas fixée (recueil, réf. 30). Juriste,
>   partie 9, point 32.
> - **En-tête des factures Stripe** : « EI », adresse et SIREN réglés hors de Gerimmo (réglage R7, pas encore fait au
>   26/11), non vus ; aucune facture réelle
>   relue (Q80 ; juriste, partie 9, point 29 c). À partir de septembre 2027, une facture à une SCI ou à un
>   professionnel devra porter son SIREN, que Gerimmo ne demande pas (recueil, réf. 29, non recontrôlé).
> - **Libellé du dernier bouton** : le plan voulait « Payer » (C. conso L. 221-14 al. 2) ; Stripe refuse
>   `submit_type: "pay"` en mode abonnement. Le texte d'obligation de paiement sous le bouton est gardé — texte non
>   lu sur Légifrance. Le recours du plan (mode « setup », bouton Gerimmo « Commander avec obligation de paiement »)
>   reste possible si un juriste l'exige.
> - **PDF des conditions joint à la confirmation** seulement si la version acceptée est archivée ; l'archivage de la
>   version du 15/11 en production n'est pas constaté dans les sources lues ([[Conditions générales]]). Depuis le 25/11,
>   la version en vigueur en production est celle du 24/11, archivée le 26/11 à 05:56Z (R2) ; la jonction du PDF n'est
>   pas vérifiée (ventes fermées ; aucun abonné actif au contrôle C2 du 26/11).
> - **Confirmation sur support durable** (C. conso L. 221-13, C. civ. 1127-2) et case de demande expresse (L. 221-25) :
>   absents du recueil, non lus sur Légifrance.
> - **Changement de périodicité** : la fonction de la base peut être appelée directement sans l'accord à la nouvelle
>   version (Q96) — non corrigé.
> - **Non vérifié** : paiement réel avec Stripe (jamais exercé au banc), parcours navigateur complet de la souscription
>   sans médiateur. *26/11* : identité saisie (R1) et version du 24/11 archivée (R2) sont vérifiées par l'agent (pages
>   publiques, base en lecture seule).

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les
corrections retenues et les réserves de la V1. Point résolu : archive du 30 septembre enregistrée avant publication,
le 24 octobre à 08:13 UTC ; les conditions V1 ont été archivées le même jour à 09:23:25 UTC.

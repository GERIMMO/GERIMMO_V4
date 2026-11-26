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

## Avant la souscription : ouverture de l'espace, essai et démarrage
*Reprise de [[Onboarding et abonnement]], fusionnée ici le 26/11/2026. Ouverture, essai, parcours de démarrage, import
du parc et relances d'invitation relus dans le code le 26/11/2026 (lecture seule).*

### Ouverture de l'espace
- **Propriétaire en gestion directe : inscription en ligne** (décision du 19/08/2026, livrée le 30/08, sprint 9a).
  `/inscription` → Supabase Auth (compte créé par l'API d'administration, lien de confirmation envoyé par Gerimmo
  depuis le 30/09 ; `app/src/app/actions/auth.ts`) → `initialiser_espace_proprietaire`, appelée depuis `/espaces` dès
  qu'une session existe : il crée seul son compte et son espace (`proprietaire_direct`), démarre l'essai, puis souscrit
  par le parcours décrit plus haut ; pas de circuit commercial.
  Le [[Super Admin]] peut aussi créer tout profil, propriétaire direct compris (voie de secours ou de support). Détail :
  [[Propriétaire bailleur]].
- **Agence : ouverte par le super admin après la signature du contrat commercial** (RM-16.1.1), depuis la console
  (livré le 11/09/2026 ; avant, il fallait un client SQL). `ouvrir_organisation` crée l'organisation, le compte de son
  premier responsable et l'adhésion qui les relie ; l'application envoie ensuite l'invitation par le même chemin que
  « mot de passe oublié ». Le rôle découle du type : une agence a un administrateur, un parc son propriétaire. Un compte
  existant est **réutilisé** (le responsable gère peut-être une autre agence, ou est locataire ailleurs). L'écran
  s'ouvre aussi depuis une demande de devis du site (« Demandes de devis », `/admin/devis`), qu'il préremplit et marque
  traitée. Depuis le 05/11/2026, l'ouverture exige une adresse postale complète (adresse, code postal, ville) pour les
  courriers (migration `20261105141000_coordonnees_courriers_ouverture`).
- **Case des conditions à l'inscription** (depuis le 24/10/2026, PR #246) : propriétaire, conditions générales
  d'utilisation et de vente ; artisan, conditions de l'espace artisan dès leur publication ; personne invitée, « J'ai
  pris connaissance des règles d'utilisation des espaces invités » ([[Conditions générales]]).

### Essai
- **Deux mois calendaires** pour toute nouvelle inscription, sans carte, comptés au jour de Paris (`essai_ordinaire_fin`,
  migration `20261115094646_essai_deux_mois_permanent` ; conditions du 15/11/2026, article 8.2 ; [[Grille tarifaire]]).
  Les échéances déjà accordées sont conservées. Historique : 14 jours à l'origine ; 2 mois à partir du 30/09/2026, en
  offre de lancement jusqu'au 31/12/2026, puis 1 mois prévu (migrations `20260930100000_essai_deux_mois` et
  `20260930110000_offre_lancement_essai`) ; remplacé le 15/11 par 2 mois sans échéance.
- À l'ouverture par le super admin : essai ordinaire par défaut, autre durée de 0 à 365 jours, ou espace actif
  d'emblée ; pour un propriétaire, jamais moins que l'essai ordinaire (plancher du 15/11, migration
  `20261115130412_cloture_audit_contrats_marketing`).
- Fin de l'essai portée par `organizations.essai_fin`. **Aucun bien n'est offert, à personne** (règle du 28/09/2026,
  [[2026-09-28-decision-tarification]]) : seul l'essai l'est. À son terme sans abonnement, l'espace est **fermé à
  l'écriture** — ses données restent lisibles et exportables — jusqu'au paiement (`org_ecriture_ouverte`). Suite :
  [[Cycle de vie de l'abonnement]].

### Parcours de démarrage
`parcours_demarrage(org)` rend **six étapes**, dans l'ordre où la base les exige : identité · premier bien · lot en état
d'être loué · locataire · bail · premier loyer encaissé (sixième étape ajoutée le 27/09/2026). Chacune est **constatée
sur les données**, jamais cochée à la main : un parcours qu'on coche finit par affirmer une étape que les données
démentent.
- « Identité » suit les champs obligatoires de « Mon profil » : nom, adresse, code postal, ville, e-mail ; pour une
  agence, SIRET, carte professionnelle et garantie financière en plus.
- « Lot prêt » interroge `lot_blocages_location`, la fonction qui décide déjà de la mise en location : une seule liste
  de conditions dans le produit, et elle dit ce qui bloque (détention incomplète, DPE absent…). Chez un propriétaire,
  le bloc rappelle qu'un bail déjà en cours s'active par son contrat signé ([[Bail]], décision du 20/11/2026).
- « Locataire » ne compte que les adhésions de locataire actives ; « Bail », les baux actifs ou en préavis ; « Premier
  loyer » est fait dès qu'un encaissement est enregistré, avance comprise (migration
  `20261116083100_demarrage_encaissement` ; du 27/09 au 16/11, il fallait une quittance).
- L'étape suivante porte le bouton, chaque autre étape non faite un lien (25/09) ; le bloc **disparaît** quand les six
  étapes sont faites (`app/src/components/parcours-demarrage.tsx`).

### Import courant du parc (16.3) — livré le 11/09/2026
Une agence qui arrive avec cinquante lots les saisissait un par un : six écrans, cinquante fois.
`/agence/<org>/parc/import` (`importer_parc`) reprend le parc depuis un tableur, **une ligne par lot** — le bien, son
lot, son propriétaire et sa quote-part, le locataire en place s'il y en a un.
- **Deux passes.** Le contrôle n'écrit rien et rend, ligne par ligne, ce qui passera ; l'import ne devient possible
  qu'ensuite. On ne fait pas basculer un parc sur un fichier que personne n'a regardé.
- **Le fichier du client, pas un format.** Séparateur détecté (le point-virgule d'Excel francophone comme la virgule des
  exports), guillemets honorés, en-têtes reconnus sans accents ni casse, colonnes inconnues ignorées et non refusées. Le
  gabarit se télécharge depuis l'écran et **se relit lui-même** (un test le vérifie).
- **Rien n'est dupliqué** : un propriétaire nommé deux fois n'a qu'une fiche, et rejouer un fichier corrigé ne fabrique
  pas un second parc. Depuis le 17/11/2026 (migration `20261117092314_import_parc_identite_bien`), un immeuble est
  reconnu à son **nom et à son adresse** (rue, code postal, ville, complément) : deux lignes de même nom et de même
  adresse vont dans le même immeuble, deux homonymes à des adresses différentes restent distincts, et un complément
  d'adresse qui ne permet pas de trancher fait refuser la ligne.
- **Une ligne qui tombe n'emporte pas les autres** : elle est rapportée avec le motif donné par la base, les autres
  passent.

> [!warning] Les baux arrivent en BROUILLON — et c'est la règle, pas une limite
> Activer un bail passe par les contrôles de mise en location (`controler_mise_en_location` : diagnostics, mentions
> obligatoires, plafond du dépôt, un seul bail en cours par lot, détention à 100 % — [[Bail]]). Un import qui
> créerait des baux **actifs** contournerait ces contrôles en masse — exactement ce qu'ils existent pour empêcher.
> L'import pose les montants et les dates ; ce qui manque pour activer est dit lot par lot par `lot_blocages_location`.

### Reprise comptable (depuis le 18/09/2026)
L'import ci-dessus reprend les biens, les lots et les baux — pas l'argent. Une seconde reprise prend les **soldes** :
`/agence/[orgId]/comptabilite/reprise`, même forme que l'import du parc (gabarit, contrôle qui n'écrit rien, bascule
ensuite).
- **Pourquoi les tables ne servaient à rien.** `reprises_portefeuille` et `reprise_soldes` étaient nées le 03/09 avec
  leur RLS activée, **aucune politique et aucun droit de table** ; `mouvements_mandants`, le compte mandant, était dans
  le même cas. Les trois sont lisibles depuis le 18/09 par les gestionnaires de leur organisation ; l'écriture passe par
  les fonctions, jamais en direct, parce que c'est le contrôle d'écart zéro qui donne son sens à la bascule.
- **L'écart zéro.** L'agence annonce la trésorerie qu'elle reprend ; la somme des lignes qui représentent de l'argent
  qu'elle DÉTIENT doit l'égaler. N'y entrent ni un dépôt gardé par le propriétaire, ni une dette de locataire. Tant que
  l'écart n'est pas nul, le bouton de bascule n'existe pas.

| Nature | Ce que la bascule en fait |
|---|---|
| Dépôt de garantie détenu par l'agence | `depot_encaissements` du bail — là où la restitution et le solde de tout compte iront le chercher |
| Dépôt détenu par le propriétaire | Enregistré et signalé ; hors trésorerie |
| Avance du locataire | `encaissements` à la date de bascule : le prochain appel s'impute dessus |
| Dette du locataire | **Non écrite** — voir ci-dessous |
| Provisions et fonds mandants | `mouvements_mandants`, ventilés par propriétaire |

> [!warning] Une dette de locataire n'est pas écrite au compte
> Elle serait un appel de loyer pour une période que Gerimmo n'a pas connue : elle polluerait l'échéancier et
> déclencherait des quittances fausses. Elle est enregistrée dans la balance, signalée ligne à ligne, et reste à traiter
> par le parcours de [[Relances et mise en demeure]].

**Ce qui bloque** : un dépôt sans détenteur (personne ne saurait qui le rend) ; un dépôt déjà encaissé dans Gerimmo (le
compter deux fois) ; une ligne qu'aucun bail ni aucun propriétaire ne porte ; un type inconnu. La bascule est
**définitive** : après elle, on corrige par écritures rectificatives.

> [!warning] Ce qui manque encore
> Le **compte mandant ne vit pas encore au quotidien** : la reprise y écrit sa balance d'ouverture et l'écran de
> comptabilité la donne à lire, mais aucun mouvement courant (encaissement de loyer, versement au propriétaire,
> honoraires, TVA) ne l'alimente — toujours vrai au 26/11/2026 : seule la reprise écrit dans `mouvements_mandants`
> (migration `20260918070000_reprise_comptable_utilisable`). C'est le chantier suivant du module 16.

### Invitation d'un locataire : ce que fait le code (relevé du 16/10/2026, revu le 26/11/2026)
Décision X16 : le 14/10, le dirigeant avait retenu d'amender le wiki plutôt que de livrer les relances ; le 15/10, il
revient sur ce choix et fait livrer les relances J+3 et J+10 (journal `log.md`, entrée « decision » du 15/10, point 5).
En production depuis le 15/10 (PR #190, fusion `f93ec6e`, migration
`20261014830000_relances_invitations_locataires.sql`, module `app/src/lib/relances-invitations.ts`). Voir
[[Compte, personne et adhésion]].
- **Premier envoi.** Un e-mail part à l'envoi de l'invitation. L'**invitation** vaut **30 jours** ; le **lien** de
  l'e-mail, à usage unique, vaut **une heure** (3 600 s, réglage du projet Supabase depuis le 16/10 au soir —
  [[Recette de production]] ; commentaire de `lien-mot-de-passe.ts`) : passé ce délai, une relance en apporte un neuf,
  ou le locataire passe par « Mot de passe oublié ». J+0 est le **jour de Paris** du premier envoi confirmé ; un renvoi
  manuel ne le déplace pas.
- **Deux relances au plus**, objet « Rappel : Votre invitation locataire Gerimmo » : le rang 1 est dû de J+3 à J+9, le
  rang 2 de J+10 jusqu'à l'expiration (un rang 1 manqué n'est plus envoyé une fois J+10 atteint). Elles partent avec la
  mission planifiée « rappels » (« Rendez-vous, invitations et suivi des dossiers » depuis le 24/10, programmée à
  06 h 00 UTC), jamais hors de la plage 7 h – 21 h à Paris, au plus 50 par passe. Une même relance n'est jamais envoyée deux fois (réservée en base
  avant l'envoi ; un envoi sans réponse du service d'e-mail est noté « incertain » et n'est pas renvoyé).
- **Arrêt.** Les relances s'arrêtent dès l'acceptation, le refus, l'annulation ou l'expiration. Jamais de relance pour
  une personne propriétaire ou mandante, une fiche archivée ou dont l'adresse a changé, un compte qui a déjà accès à
  l'organisation, ni pour une organisation fermée à l'écriture (abonnement suspendu, essai échu). Jamais deux e-mails
  d'invitation à moins de trois jours : un renvoi manuel retarde la relance, il ne relance pas le cycle.
- **Arrêt d'urgence.** L'arrêt « global » ou la clé « rappels » bloque toute relance (lu avant chaque réservation et
  avant chaque envoi).
- **Limite par organisation.** La même que celle des invitations, avec le même compteur : 30 liens par heure et par
  organisation, partagés entre relances et envois manuels ; chaque organisation passe à son tour.
- **Invitations antérieures au déploiement : jamais relancées** (colonne `relances_prevues` à faux pour toutes les
  invitations déjà en base le 15/10 ; vérifié en lecture seule au déploiement).
- **Trace.** La fiche personne affiche « Relancé le … » ; chaque relance est notée au journal d'audit.
- **Renvoi manuel** : depuis la fiche personne, « Renvoyer l'invitation » renvoie l'e-mail tant que l'invitation est en
  attente (même limite de 30 liens par heure et par organisation) ; « Annuler l'invitation » la retire. L'écran signale
  « L'envoi de l'e-mail reste à confirmer » quand l'envoi a échoué ou n'est pas enregistré.
- **Expiration à 30 jours, silencieuse.** Passé le délai, la fiche affiche l'invitation comme expirée (calculé à
  l'affichage) ; l'état enregistré ne passe à « expirée » que lorsque le locataire tente d'y répondre ou que l'agent
  envoie une nouvelle invitation. Aucun message au locataire ni à l'agent à l'échéance ; l'agent doit renvoyer
  lui-même (« Envoyer une nouvelle invitation »).
- **Refus tracé.** Le refus est enregistré (état « refusée » et ligne du journal d'audit) et arrête les relances (le
  courrier de relance le dit : « Si vous la refusez, vous ne recevrez plus de rappel »). Rien n'empêche ensuite l'agent
  d'envoyer une nouvelle invitation.
- **Aucun accès n'est accordé avant l'acceptation** par le locataire, connecté avec l'adresse qui a reçu l'invitation.

### Cible du cahier V3 (module 16) et ancien dépôt
- **Cible V3** ([[2026-07-24-gerimmo-v3-module-16-onboarding-et-invitations]]) : l'agence ouverte par le super admin
  reçoit un **jeu complet de paramètres par défaut** (modèles, grilles, plan comptable, équipements, seuils) pour
  « travailler immédiatement » ; paramétrage initial : identité, agents, **indice IRL obligatoire**, seuil de
  délégation ; marque blanche et WhatsApp optionnels. Invitations depuis la fiche personne (module 0b) : une personne
  sans compte **reste gérable**, le mandant n'est **jamais** invité ; à la première connexion, mot de passe et
  conditions, puis proposition d'**enrôlement WhatsApp** (consentement daté, révocable, repli e-mail —
  [[Canaux de communication]]). Import courant 16.3 (admin agence, dizaines de lots, ligne par ligne, sans reprise du
  passé), avec un gabarit et des contrôles **communs** avec l'import de migration 0.12 du [[Super Admin]]. Ces points
  de cible n'ont pas été relus dans le code le 26/11.
- **Ancien dépôt (Gerimmo V3)** : auto-inscription `createOrganization`, essai de 14 jours, parcours en dix étapes avec
  Telegram (`organization_onboarding_progress`), e-mail de bienvenue sur l'événement `trial.started`. Rien de cela
  n'existe dans l'application (aucune occurrence dans `app/src` ni dans les migrations, relu le 26/11/2026).

## Relations
[[Abonnement]] · [[Cycle de vie de l'abonnement]] · [[Propriétaire bailleur]] · [[Super Admin]] ·
[[Compte, personne et adhésion]] · [[Parrainage]] · [[Rétractation en ligne]] ·
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
> - **Relances d'invitation J+3/J+10** (RM-16.6.1, fiche REP-05, décision X16) : livrées le 15/10/2026 (PR #190),
>   **non vérifiées** en production (aucune relance partie au 19/10, [[Recette de production]]). À trancher par le
>   dirigeant : relancer ou non les invitations déjà en attente au déploiement (choix prudent du lot : non ; journal
>   `log.md`, entrée « deploy » de la PR #190). Choix relevés dans le code sans décision consignée : un renvoi manuel
>   retarde la relance sans relancer le cycle ; la mission « rappels » part à 06 h 00 UTC (`app/vercel.json`), soit
>   8 h à Paris en été et 7 h en hiver, au bord de la plage 7 h – 21 h.
> - **Contradictions relevées à la fusion de [[Onboarding et abonnement]]** (26/11/2026), corrigées dans la section
>   « Avant la souscription » d'après le code et les pages plus récentes : lien d'invitation valable 24 h (86 400 s)
>   dans l'ancienne page, une heure depuis le 16/10 au soir ; essai de 2 mois jusqu'au 31/12/2026 puis 1 mois, devenu
>   2 mois sans échéance le 15/11 ; formules « Solo à Patrimoine », remplacées le 11/11 par l'abonnement unique pour les
>   nouvelles souscriptions ([[Grille tarifaire]]) ; « aucun avantage tarifaire lié au parrainage » (28/09), alors
>   qu'un mois est offert au parrain depuis le 30/09 ; parcours de démarrage en cinq étapes, effacé au premier bail
>   actif, alors qu'il en a six depuis le 27/09 et ne disparaît qu'une fois toutes faites ; état des lieux d'entrée cité
>   parmi les contrôles d'activation, simple alerte depuis le 30/08 ([[Bail]]) ; clé d'arrêt « rappels » affichée
>   « Rendez-vous et suivi des dossiers » sans mention des invitations, nommée « Rendez-vous, invitations et suivi des
>   dossiers » depuis le 24/10 (`app/src/lib/missions.ts`).
> - **Agences** : l'articulation entre essai, contrat commercial et abonnement Stripe pour une agence ouverte par le
>   super admin restait « à clarifier (module 18 ?) » ; l'offre agences et sa grille ne sont pas publiées au 26/11
>   ([[Grille tarifaire]]).

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les
corrections retenues et les réserves de la V1. Point résolu : archive du 30 septembre enregistrée avant publication,
le 24 octobre à 08:13 UTC ; les conditions V1 ont été archivées le même jour à 09:23:25 UTC.

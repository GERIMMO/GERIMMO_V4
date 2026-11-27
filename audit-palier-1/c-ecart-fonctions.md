# Audit palier 1 — volet C : écart de fonctions avec cinq références

Relevé du 22 novembre 2026. Lecture seule : aucun code, aucune base, aucun wiki, aucun dépôt modifié.
Code lu : `scratchpad/palier1/app/src` (tête `e1e442dc`). Les chemins cités sont relatifs à `app/src/`.

## 0. Méthode et limites (à lire avant le reste)

- **Premier passage : aucune page n'a été lue sur le site lui-même.** La lecture directe a échoué pour
  `www.qalimo.fr`, `www.ownily.fr` et `www.obat.fr` (hôtes hors des domaines autorisés du réseau de la session).
  Je n'ai pas essayé les deux autres sites après ces trois refus, et je n'ai demandé aucune ouverture. La liste des
  hôtes et des pages à ouvrir pour un second passage est en section 7.
- **Ce qui a été lu à la place.** Les pages publiques ont été lues par l'outil de recherche, limité au domaine de
  chaque éditeur. Il rend un résumé de la page indexée, pas la page du jour. **Toutes les fonctions des sections
  1.1 à 1.5 sont donc « non lues sur le site » : elles viennent d'extraits de recherche.** Conséquences : une
  fonction peut avoir changé depuis l'indexation ; certaines pages de MesDépanneurs sont anciennes (plusieurs
  années) ; les prix diffèrent d'une page à l'autre chez Qalimo, Ownily et Obat. **Aucune fonction n'est
  inventée** : ce qui n'a pas été trouvé est écrit « non relevé ».
- **Aucun compte créé**, aucun essai de produit. Les fonctions sont celles que les éditeurs annoncent, pas celles
  que j'ai vues marcher.
- **Côté Gerimmo.** « Présent » veut dire : un écran et une action serveur (ou une fonction de base) existent dans
  le code. Je n'ai pas lancé l'application. Je ne lis pas les variables de l'hébergeur : quand une fonction dépend
  d'un interrupteur, je l'écris.
- **Constat transversal important.** Le code contient une « liste fermée » des courriels de la V1
  (`lib/perimetre-pilote.ts` : `piloteLimite()` rend toujours vrai). Un courriel qui n'est pas dans cette liste ne
  part pas. Sont dans la liste : quittances, bail signé, accès au compte, invitations, et une série de notifications
  d'incident (urgence, mission, devis demandé ou reçu, pièce demandée, signature demandée, rendez-vous fixé,
  créneaux proposés, report de rendez-vous). **N'y sont pas** : les avis d'échéance, les relances de loyer, les
  rappels de rendez-vous de la veille et de J-7, les relances d'invitation. Ces envois sont codés mais ne partent
  pas. L'écran du profil le dit au propriétaire (`agence/[orgId]/profil/formulaire-profil.tsx`, « envoi suspendu »).
- **Effort** : petit = quelques jours ; moyen = une à deux semaines ; gros = plus, ou dépend d'un tiers.

## 1. Fonctions essentielles de chaque référence

### 1.1 Qalimo — gestion locative pour bailleurs

Pages lues : [accueil](https://www.qalimo.fr/) · [fonctionnalités](https://www.qalimo.fr/fonctionnalites/) ·
[services](https://www.qalimo.fr/services/) · [tarif](https://www.qalimo.fr/tarif/) ·
[contrat de location](https://www.qalimo.fr/logiciel-contrat-de-location/) ·
[candidature locataire](https://www.qalimo.fr/candidature-locataire/) ·
[bailleur particulier](https://www.qalimo.fr/gestion-locative-particulier/) ·
[LMNP](https://www.qalimo.fr/gestion-locative-lmnp/) · [comptabilité SCI](https://www.qalimo.fr/comptabilite-sci/) ·
[colocation](https://www.qalimo.fr/colocation/) · [protection juridique](https://www.qalimo.fr/protection-juridique/) ·
[comparatif de l'éditeur](https://www.qalimo.fr/comparatif-qalimo-vs-gererseul/).

1. Baux générés pour plusieurs régimes (nu, meublé, étudiant, commercial, professionnel) et une cinquantaine de
   modèles de courriers.
2. Signature électronique du bail et des documents, payée à l'unité (par document).
3. État des lieux sur téléphone ou tablette : formulaire par pièce, photos, signature sur place.
4. Quittance en PDF envoyée chaque mois au locataire ; avis d'échéance par courriel.
5. Lecture des comptes bancaires (lecture seule, par un agrégateur) pour reconnaître les virements des locataires
   et tenir les soldes à jour. Incluse dans l'abonnement.
6. Relances d'impayé graduées à dates fixes après l'échéance.
7. Révision annuelle du loyer : alerte à la date anniversaire, calcul sur l'indice du bail, courrier au locataire.
8. Régularisation des charges : provisions comparées au réel, solde, décompte adressé au locataire.
9. Aide à la déclaration des revenus fonciers (réel ou micro) ; liasse LMNP ou SCI à l'IS télétransmise en option
   payante.
10. Suivi des recettes, des charges et des travaux ; tableau des loyers attendus, reçus, en retard.
11. Dossier du candidat locataire : invitation par lien, dépôt des pièces, analyse des documents, indice pour
    comparer les candidats.
12. Lettre recommandée électronique, payée à l'unité.
13. Espace du locataire : quittances, bail, documents.
14. Assurances vendues en complément (loyers impayés, propriétaire non occupant, protection juridique).
15. Prix par bien et par mois, forfait au-delà de quelques biens, essai gratuit.

Non relevé sur les pages lues : déclaration d'incident par le locataire, suivi d'artisan, dépôt de garantie et
solde de sortie. Le paiement du loyer en ligne par carte ou prélèvement est cité par un annuaire tiers
([Appvizer](https://www.appvizer.fr/operations/gestion-locative/qalimo)), pas par le site de l'éditeur : non confirmé.

### 1.2 Ownily — comptabilité et fiscalité des revenus locatifs

Pages lues : [accueil](https://www.ownily.fr/) · [tarifs](https://www.ownily.fr/tarifs) ·
[déclarations fiscales SCI](https://www.ownily.fr/services/declarations-fiscales) ·
[déclaration LMNP](https://www.ownily.fr/services/declaration-fiscale-lmnp) ·
[gestion des locations](https://www.ownily.fr/services/gestion-des-locations) ·
[SCI à l'IS](https://www.ownily.fr/lp/sci-is) ·
[tableau d'amortissement LMNP](https://www.ownily.fr/blog/tableau-amortissement-lmnp) ·
aide publique : [export des écritures](https://ownily.crisp.help/fr/article/ou-editer-un-fichier-des-ecritures-comptables-fec-sur-ownily-1x036dn/),
[paramétrage LMNP](https://ownily.crisp.help/fr/article/lmnp-realiser-le-parametrage-initial-de-votre-activite-143srp7/).

1. Récupération quotidienne des mouvements bancaires, sur un ou plusieurs comptes, et classement automatique.
2. Reconnaissance du loyer encaissé, qui déclenche la mise à jour du suivi et l'envoi de la quittance.
3. SCI à l'impôt sur le revenu : déclaration de résultat de la société et part de chaque associé à reporter.
4. SCI à l'impôt sur les sociétés : déclaration de résultat et liasse, bilan, balance.
5. Loueur en meublé au réel : déclaration et annexes, tableau d'amortissement par composant, report des
   amortissements non déduits.
6. Envoi des déclarations à l'administration depuis l'outil (télétransmission).
7. Clôture annuelle guidée ; export des écritures et de la balance.
8. Volet locatif : appels de loyer, relances, quittances, révision du loyer, régularisation des charges.
9. Archivage des documents ; assistance par messagerie en semaine.
10. Formules à l'année selon le nombre de biens et de comptes bancaires ; simulateur LMNP public.

Non relevé : préparation d'assemblée générale, rapport de gérance, accès dédié pour un comptable. L'éditeur précise
qu'il fournit un outil en autonomie et non une prestation d'expertise comptable (relevé par un site tiers, à
confirmer dans ses conditions).

### 1.3 Obat — devis et factures pour artisans du bâtiment

Pages lues : [accueil](https://www.obat.fr/) · [devis et factures](https://www.obat.fr/devis-factures/) ·
[tarifs](https://www.obat.fr/tarifs/) · [bibliothèques de prix](https://www.obat.fr/devis-factures/bibliotheques/) ·
[facturation électronique](https://www.obat.fr/devis-factures/facturation-electronique/) ·
[plombier](https://www.obat.fr/devis-factures/plombier/) ·
[entreprises de 2 à 50 salariés](https://www.obat.fr/entreprises-de-2-a-50-salaries/) ·
[situation de travaux](https://www.obat.fr/blog/situation-de-travaux/) ·
[services financiers](https://www.obat.fr/services-financiers/).

1. Devis et factures illimités, à l'en-tête de l'entreprise, avec les mentions légales posées automatiquement.
2. Bibliothèque d'ouvrages chiffrés (prix et temps de pose) et modèles de devis par métier ; catalogues de prix
   du marché en option payante.
3. Signature en ligne du devis par le client.
4. Acomptes prévus au devis, factures d'acompte, de situation et de solde ; retenues de garantie.
5. Avoirs, complets ou partiels.
6. Suivi des factures en retard et relance du client, avec modèles de message.
7. Paiement en ligne et connexion bancaire.
8. Fichier clients ; planning des chantiers et des interventions, affectation aux équipes.
9. Achats, bons de commande, rentabilité par chantier, pointage des heures (formules supérieures).
10. Facturation électronique par une plateforme partenaire.
11. Accès pour le comptable ; application sur le web et sur téléphone.
12. Services annexes : assurance, financement, création de site.

Les pages lues ne donnent pas le même calendrier pour la facturation électronique : à vérifier à la source officielle.

### 1.4 Prise de rendez-vous — Doctolib (fonctions de créneaux seulement)

Pages lues : [agenda du professionnel](https://info.doctolib.fr/solution/agenda/) ·
[agenda en ligne](https://info.doctolib.fr/doctolib-patient/agenda-en-ligne/) ·
[rendez-vous non honorés](https://info.doctolib.fr/solutions-rdv-non-honores/) · aide publique :
[paramétrage de l'agenda et des motifs](https://doctolib.zendesk.com/hc/fr/articles/23521218336276-G%C3%A9rer-le-param%C3%A9trage-de-votre-agenda-et-de-vos-motifs-de-consultation),
[plage d'ouverture](https://doctolib.zendesk.com/hc/fr/articles/210175963-Cr%C3%A9er-une-plage-d-ouverture),
[délais de réservation](https://doctolib.zendesk.com/hc/fr/articles/360054003732-Modifier-les-d%C3%A9lais-d-ouverture-et-de-fermeture-des-r%C3%A9servations-en-ligne),
[absence](https://doctolib.zendesk.com/hc/fr/articles/207811593-Cr%C3%A9er-une-absence),
[annuler et prévenir](https://doctolib.zendesk.com/hc/fr/articles/4402839123476-Supprimer-annuler-un-ou-plusieurs-rendez-vous-et-pr%C3%A9venir-mes-patients),
[notifications envoyées](https://doctolib.zendesk.com/hc/fr/articles/360056017052-Comprendre-quelles-notifications-SMS-e-mail-push-sont-envoy%C3%A9es-%C3%A0-mes-patients),
[déplacer un rendez-vous](https://doctolib.zendesk.com/hc/fr/articles/4406831561876-D%C3%A9placer-un-rendez-vous) ·
[côté client](https://www.doctolib.fr/sante/rendez-vous-non-honores/).

Côté professionnel :
1. Plages d'ouverture récurrentes ou ponctuelles ; types de rendez-vous avec leur durée ; un ou plusieurs lieux.
2. Fenêtre de réservation réglable (délai minimum avant le créneau, horizon maximum).
3. Absences, qui retirent les créneaux ; annulation groupée avec message automatique aux personnes concernées.
4. Annulation d'un rendez-vous avec notification, ou marquage « absent excusé » sans notification.
5. Rendez-vous non honoré tracé dans l'historique ; blocage possible de la réservation après plusieurs absences.
6. Délai limite d'annulation par le client, réglable par type de rendez-vous.

Côté client :
7. Réservation à toute heure sur les créneaux libres ; le rendez-vous apparaît aussitôt chez le professionnel.
8. Confirmation par courriel ; liste « mes rendez-vous » à venir et passés.
9. Rappels automatiques avant le rendez-vous (courriel, SMS, notification du téléphone), plusieurs par rendez-vous.
10. Annulation ou déplacement en ligne jusqu'au délai limite ; au-delà, il faut appeler.
11. Liste d'attente : alerte quand un créneau plus proche se libère.

### 1.5 Dépannage à la demande — MesDépanneurs

Pages lues : [accueil](https://www.mesdepanneurs.fr/) · [questions fréquentes](https://www.mesdepanneurs.fr/faq) ·
[mode d'emploi](https://www.mesdepanneurs.fr/mode-demploi) · [plomberie](https://www.mesdepanneurs.fr/plomberie) ·
[serrurerie](https://www.mesdepanneurs.fr/serrurerie) · [projet travaux](https://www.mesdepanneurs.fr/projet-travaux) ·
[artisans à Paris](https://www.mesdepanneurs.fr/artisan/paris) ·
[questions des artisans](https://espacepro.mesdepanneurs.fr/faq). Plusieurs de ces pages sont anciennes.

1. Demande en ligne ou par téléphone : choix du métier, puis du problème dans une liste ; « autre » sinon.
2. Fourchette de prix affichée avant la demande, avec un prix maximum annoncé (déplacement, main-d'œuvre et pièces).
3. Le demandeur indique ses disponibilités ; l'artisan le rappelle pour fixer le créneau.
4. Urgence : commande possible à toute heure, rappel rapide ; intervention immédiate seulement si un artisan
   d'astreinte est disponible dans le secteur.
5. Devis gratuit sur place avant travaux ; rien à payer si le devis est refusé.
6. Paiement après l'intervention, à l'artisan ; ou paiement en ligne avec montant bloqué puis ajusté au devis
   signé ; paiement en plusieurs fois par un partenaire.
7. Suivi : rubrique « suivre ma commande » et SMS d'avancement.
8. Facture acquittée envoyée par courriel après règlement.
9. Garantie annoncée sur l'intervention (durée variable selon le métier) ; retour de l'artisan sans frais si le
   même problème revient ; service après-vente avec délai de réponse annoncé.
10. Artisans sélectionnés : assurances (responsabilité civile, décennale), immatriculation, diplôme, ancienneté,
    entretien ; entrée gratuite dans le réseau.
11. Avis clients publiés ; contact de satisfaction après intervention.
12. Service client joignable par téléphone sur une large plage horaire.

Non relevé : procédure d'annulation d'une demande.

## 2. Tableau d'écart

Abréviations : Q = Qalimo, Ow = Ownily, Ob = Obat, D = Doctolib, M = MesDépanneurs.
P = propriétaire bailleur, L = locataire, A = artisan, SA = super admin.

### 2.1 Gestion locative

| Fonction essentielle | Référence(s) | Gerimmo (preuve) | Persona | Effort | Point juridique ou service payant ? |
|---|---|---|---|---|---|
| Fiche des biens et des lots, import | Q, Ow | **Présent** — `agence/[orgId]/parc`, `parc/import`, `actions/parc.ts`, `actions/import-parc.ts` | P | — | Non |
| Bail généré : nu, meublé, colocation | Q | **Présent** — `agence/[orgId]/baux/[bailId]`, `actions/baux.ts`, `lib/documents/modeles/bail-*.ts` | P, L | — | Juridique : relecture des modèles |
| Autres régimes (étudiant, mobilité, commercial, professionnel) | Q | **Absent** — `lib/baux.ts` ne connaît que nu, meublé, colocation | P | Moyen par régime | Juridique : chaque régime a ses règles |
| Bibliothèque de courriers types | Q | **Présent** — 54 entrées dans `lib/documents/catalogue.ts`, écran `documents/catalogue` | P | — | Juridique : relecture des modèles |
| Signature électronique des actes | Q, Ob | **Partiel** — circuit complet (`actions/signature-bail.ts`, `lib/zoho-sign.ts`, `api/zoho-sign/webhook`), ouvert ou fermé par interrupteurs et plafond mensuel (`lib/ouverture-signatures.ts`) ; voie papier toujours là (`deposerBailSigne`) | P, L | Petit (ouvrir, rejouer) | Payant : crédits du prestataire. Juridique : portée d'une signature simple |
| État des lieux numérique, pièce par pièce | Q | **Partiel** — grille, compteurs, clés, mentions, signature (`baux/[bailId]/edl/[edlId]`, `actions/edl.ts`) ; **aucune photo par élément** (aucune occurrence dans l'écran ; le wiki « État des lieux » le note absent) | P, L | Moyen | Non (stockage seulement) |
| Avis d'échéance envoyés automatiquement | Q, Ow | **Partiel — codé, envoi suspendu** — `lib/missions-planifiees/appels.ts` ; écarté par `lib/perimetre-pilote.ts` ; le profil affiche « suspendu » | P, L | Petit (admettre le circuit, recette) | Juridique : accord du locataire pour l'envoi par courriel |
| Quittance générée et envoyée | Q, Ow | **Présent** — `actions/quittancement.ts`, `lib/missions-planifiees/quittances.ts`, `quittance/[quittanceId]/document` ; accord du locataire géré (`locataire/[orgId]/documents/consentements.tsx`) | P, L | — | Non |
| Lecture bancaire et reconnaissance des loyers | Q, Ow | **Absent** — encaissement déclaré à la main (`actions/reception-loyer.ts`, `ajouterEncaissement`) ; choix assumé au wiki | P | Gros | Payant : agrégateur agréé. Juridique : contrat et données bancaires |
| Relances d'impayé graduées | Q, Ow | **Partiel — codé, envoi suspendu** — `lib/missions-planifiees/relances.ts`, seuils au profil ; le courriel ne part pas (`components/rappels-loyers.tsx` : `envoiRelanceDisponible={!piloteLimite()}`) ; le PDF de relance se prépare et se transmet à la main | P | Petit | Juridique : ton et contenu d'une relance |
| Lettre recommandée électronique | Q | **Partiel — codé, fermé** — `lib/ar24.ts`, `actions/recommandes.ts` ; bloqué par `lib/verrou-pilote.ts` tant que le mode commercial n'est pas ouvert | P, L | Petit | Payant : envoi à l'unité. Juridique : accord préalable du destinataire |
| Révision annuelle du loyer avec courrier | Q, Ow | **Présent, indice saisi à la main** — `reviserLoyer` (`actions/loyers.ts`), modèle `revision-irl.ts` ; pas de table d'indices (`lib/outils/irl.ts` le dit) | P | Petit à moyen | Juridique : date d'effet, délai. Indices publics gratuits |
| Régularisation des charges | Q, Ow | **Présent** — `regulariserCharges`, `actions/appels-charges.ts`, `actions/echeanciers-charges.ts`, `api/decompte-charges` | P, L | — | Non |
| Suivi recettes, charges, travaux ; loyers attendus, reçus, en retard | Q, Ow | **Présent** — `agence/[orgId]/loyers`, `comptabilite`, `actions/compta.ts`, `actions/depense-simple.ts` (justificatif obligatoire) | P | — | Non |
| Espace du locataire : quittances, bail, documents | Q | **Présent** — `locataire/[orgId]/documents`, `loyers`, `bail/fichier` | L | — | Non |
| Dossier du candidat locataire avec comparaison | Q | **Absent** — seulement des pièces demandées au locataire retenu (`actions/pieces-demandees.ts`) et des conseils sans notation (`lib/conseils-locataire.ts`) | P | Gros | Juridique : pièces exigibles encadrées, non-discrimination, données personnelles |
| Paiement du loyer en ligne | Q (non confirmé) | **Absent** — le locataire voit l'échéancier et l'IBAN du bailleur (`locataire/[orgId]/loyers/bouton-copier-iban.tsx`) | L | Gros | Oui : prestataire de paiement agréé. Voir « à ne pas faire » |
| Colocation | Q | **Présent** — `bail-colocation.ts`, `bail-individuel.ts`, `actions/chambres.ts` | P, L | — | Non |
| Assurances vendues | Q | **Absent** — un comparateur d'information public seulement (`outils/comparateur-gli-visale`) | P | — | Oui. Voir « à ne pas faire » |

### 2.2 Comptabilité et fiscalité

| Fonction essentielle | Référence(s) | Gerimmo (preuve) | Persona | Effort | Point juridique ou service payant ? |
|---|---|---|---|---|---|
| Aide à la déclaration des revenus fonciers | Q, Ow | **Présent** — `agence/[orgId]/comptabilite/fiscal`, `lib/fiscal.ts`, export `comptabilite/fiscal/preparation/route.ts` | P | — | Fiscal : le wiki dit les règles non confrontées à une source officielle |
| Classement des écritures par nature fiscale | Ow (automatique) | **Partiel** — catégories du livre et qualification pièce par pièce (`actions/fiscalite.ts`), saisie manuelle | P | Moyen | Non |
| SCI à l'impôt sur le revenu : résultat et part des associés | Ow, Q | **Absent** — orientation seulement : `lib/profil-fiscal.ts` nomme le formulaire et liste les points à vérifier | P | Gros | Fiscal : validation par un expert-comptable |
| Meublé au réel : amortissements et liasse | Ow, Q (option) | **Absent** — simulateur public (`outils/simulateur-lmnp`), orientation | P | Gros | Fiscal. Voir « à ne pas faire » |
| SCI à l'impôt sur les sociétés | Ow | **Absent** — orientation seulement | P | Gros | Fiscal. Voir « à ne pas faire » |
| Télétransmission des déclarations | Ow, Q (option) | **Absent** | P | Gros | Payant : partenaire de télétransmission |
| Clôture, balance, export des écritures | Ow | **Partiel** — clôture mensuelle (`cloturerMois`), exercice fiscal (`enregistrerExerciceFiscal`), export `comptabilite/export/route.ts` ; le code écrit lui-même que ce n'est « ni une liasse ni un FEC » | P | Moyen | Fiscal : format d'export |
| Justificatifs archivés | Ow | **Présent** — dépôt obligatoire à la dépense (`actions/depense-simple.ts`), GED (`actions/ged.ts`) | P | — | Non |
| Accès d'un tiers (associé, comptable) | Ow, Ob | **Partiel** — invitation de collaborateurs (`actions/organisation.ts`, `administration/gestion-collaborateur.tsx`) ; pas de rôle en lecture seule pour un comptable | P | Petit à moyen | Non |

### 2.3 Devis et factures de l'artisan

| Fonction essentielle | Référence(s) | Gerimmo (preuve) | Persona | Effort | Point juridique ou service payant ? |
|---|---|---|---|---|---|
| Devis par lignes, totaux HT, TVA, TTC, PDF | Ob | **Présent** — `artisan/devis/[sollicitationId]`, `lib/devis-structure.ts`, `api/devis/[sollicitationId]/pdf` | A | — | Non |
| Bibliothèque d'ouvrages et modèles par métier | Ob | **Partiel** — quatre repères de prix (`lib/references-prix-travaux.ts`) et une proposition assistée par l'IA (`lib/proposition-devis-ia.ts`) ; pas de bibliothèque personnelle de lignes | A | Moyen (lignes réutilisables) | Payant seulement si base de prix du marché sous licence |
| Mentions obligatoires posées automatiquement | Ob | **Partiel** — SIRET, adresse, validité ; mentions libres saisies par l'artisan (`enregistrerProfilDocuments`) ; aucun contrôle de leur présence | A | Petit à moyen | Juridique : liste des mentions à faire valider |
| Signature en ligne du devis par le client | Ob | **Partiel** — acceptation par le propriétaire (`retenirDevis`) ; signature du devis codée (`lib/signature-devis.ts`, `api/devis/[sollicitationId]/signature`) sous interrupteur | P, A | Petit | Payant : crédits de signature |
| Acompte au devis et facture d'acompte | Ob | **Absent** — aucune occurrence côté artisan | A, P | Moyen | Fiscal : mentions et TVA de l'acompte |
| Factures de situation, retenue de garantie | Ob | **Absent** | A | — | Hors sujet. Voir « à ne pas faire » |
| Facture tirée du devis | Ob | **Présent** — `artisan/missions/[interventionId]/facture`, `lib/documents/facture-intervention.ts` ; ou dépôt de sa propre facture (`deposerMaFacture`) | A | — | Fiscal : voir ligne suivante |
| Numérotation continue automatique | Ob | **Partiel** — numéro saisi par l'artisan, unicité contrôlée (`lib/artisan-prive-facture.ts`) ; seuls les avoirs sont numérotés par l'outil | A | Petit à moyen | Fiscal : règle de numérotation |
| Avoirs | Ob | **Partiel** — `lib/artisan-prive-avoir.ts`, pour les factures de clients externes seulement ; le wiki le dit en attente de validation comptable | A | Petit | Fiscal |
| Suivi des règlements et relance des retards | Ob | **Partiel** — règlement déclaré (`actions/reglement-facture.ts`, `artisan/facturation`) ; pas de relance | A, P | Petit | Non |
| Paiement en ligne de la facture | Ob, M | **Absent** | A, P | Gros | Oui. Voir « à ne pas faire » |
| Facturation électronique | Ob | **Absent** — aucune occurrence | A | Gros | Juridique : calendrier à vérifier. Payant : plateforme agréée |
| Clients et chantiers hors plateforme | Ob | **Présent sous interrupteur** — `artisan/clients`, `artisan/chantiers/[chantierId]`, `artisan/devis/nouveau` ; ouverture décidée en base (`artisan_module_actif`), état de production à vérifier | A | — | Fiscal : même sujet que les avoirs |
| Planning des interventions | Ob | **Présent** — `artisan/agenda` (toutes organisations), refus des chevauchements (`conflit_planning_artisan`) | A | — | Non |
| Export pour le comptable | Ob | **Partiel** — `api/artisan-prive/export/route.ts` (données brutes) | A | Petit | Non |
| Achats, rentabilité de chantier, pointage | Ob | **Absent** | A | — | Hors sujet. Voir « à ne pas faire » |

### 2.4 Rendez-vous

| Fonction essentielle | Référence(s) | Gerimmo (preuve) | Persona | Effort | Point juridique ou service payant ? |
|---|---|---|---|---|---|
| Disponibilités récurrentes du professionnel | D | **Absent** — l'artisan saisit au moins trois créneaux à chaque mission (`proposerMesCreneaux`, `actions/artisan.ts`) | A | Moyen | Non |
| Absences qui retirent les créneaux | D | **Absent** — aucune période d'indisponibilité ; l'artisan reste sollicité | A | Petit | Non |
| Le client choisit seul son créneau | D | **Partiel** — le locataire choisit parmi les créneaux proposés ou répond par trois dates (`choisirMonCreneau`, `proposerMesCreneaux`, `actions/incidents-locataire.ts`) ; le gérant arbitre (`fixerRendezVous`) | L | — | Non |
| Disponibilités du client dès la demande | M | **Absent** — le formulaire d'incident ne les demande pas (`locataire/[orgId]/incident/formulaire-incident-locataire.tsx`) | L | Petit | Non |
| Confirmation du rendez-vous | D | **Présent** — notification « rendez-vous fixé » admise dans la liste des courriels | L, A | — | Non |
| Rappels avant le rendez-vous | D | **Partiel — codé, envoi suspendu** — `lib/missions-planifiees/rappels.ts` (veille et J-7) ; le courriel n'a pas de contexte admis par `lib/perimetre-pilote.ts` ; ni SMS ni notification du téléphone | L, A | Petit (courriel) ; moyen (SMS) | SMS : payant, et accord de la personne |
| Le client déplace ou annule en ligne | D | **Présent** — `demanderReportRdv`, `annulerRdvLocataire`, `retirerDemandeRdv` | L | — | Non |
| Le professionnel déplace ou annule, le client est prévenu | D | **Présent** — « Déplacer le rendez-vous » (`artisan/missions/[interventionId]/creneaux`), `refuserMaMission`, `annulerMission` | A, P | — | Non |
| Rendez-vous non honoré tracé | D | **Absent** — l'écran de la note dit que les rendez-vous manqués ne sont pas encore mesurés (`artisan/note/page.tsx`) | L, A, P | Petit à moyen | Juridique si une conséquence financière y est attachée |
| Liste « mes rendez-vous » | D | **Présent** — `locataire/[orgId]/demandes`, `artisan/agenda` | L, A | — | Non |
| Liste d'attente, créneau plus proche | D | **Absent** | L | — | Peu utile ici. Voir « à ne pas faire » |

### 2.5 Dépannage et incidents

| Fonction essentielle | Référence(s) | Gerimmo (preuve) | Persona | Effort | Point juridique ou service payant ? |
|---|---|---|---|---|---|
| Demande guidée : type de problème, description | M | **Présent** — catégorie, pièce, photos, ancienneté, urgence (`declarerMonIncident`, `locataire/[orgId]/incident`) ; côté bailleur `incidents/nouveau` | L, P | — | Non |
| Fourchette de prix avant la demande | M | **Absent côté demandeur** — les repères ne servent qu'à préparer le devis de l'artisan | P | Moyen | Juridique : un repère ne doit pas valoir engagement de prix |
| Urgence traitée à part | M | **Partiel** — question « est-ce urgent ? », consignes et numéros d'urgence (`reflexes-urgence.tsx`), courriel immédiat au gestionnaire ; pas d'astreinte | L, P | — | Astreinte : voir « à ne pas faire » |
| Devis avant travaux, refus sans frais | M | **Présent** — devis retenu, refusé avec motif ou à réviser (`retenirDevis`, `refuserDevis`, `demanderRevisionDevis`), jusqu'à deux devis en concurrence (`ouvrirConsultation`) ; les frais de déplacement ne sont pas traités | P, A | Petit (dire la règle) | Juridique : devis payant ou gratuit |
| Artisans vérifiés | M | **Présent** — pièces déposées (`artisan/attestations`), validation (`admin/artisans`, `actions/supervision-artisans.ts`), expiration surveillée | A, SA | — | Non |
| Notes après intervention | M | **Présent** — `noterMonIntervention`, `evaluerArtisan`, `artisan/note` avec contestation | L, P, A, SA | — | Juridique : déjà suivi au wiki (avis, contestation) |
| Suivi de la demande | M | **Partiel** — suivi dans l'espace (`locataire/[orgId]/demandes/suivi-intervention.tsx`) et courriels ; pas de SMS | L | — | SMS : payant |
| Garantie annoncée, retour sans frais | M | **Partiel** — le locataire rouvre le signalement (`signalerProblemePersiste`) ; aucune garantie écrite au devis ni au dossier | L, P, A | Petit | Juridique : Gerimmo ne garantit rien lui-même |
| Facture transmise au client | M | **Présent** — facture validée par le gérant (`validerFactureArtisan`), part du locataire (`actions/decompte-facture.ts`) | P, A | — | Non |
| Service client par téléphone | M | **Partiel** — assistance écrite (`/assistance`) et « être rappelé » sur la vitrine (`demanderRappel`) | Tous, SA | — | Non |

## 3. Écarts qui comptent vraiment pour le palier 1

Classés par utilité. Les trois premiers ne demandent pas de fonction nouvelle : le code existe, l'envoi est fermé.

**Pour le propriétaire bailleur**
1. Rouvrir l'envoi des **avis d'échéance** et des **relances d'impayé**. C'est le cœur de ce que vendent Qalimo et
   Ownily, et Gerimmo l'affiche « suspendu ». Petit, après relecture des textes.
2. Ouvrir pour de bon la **signature électronique** (bail, état des lieux, caution, devis), ou écrire partout que
   la voie papier est la voie normale. Petit ; service payant.
3. Ouvrir le **recommandé électronique** pour la mise en demeure. Petit ; payant à l'envoi ; accord du locataire.
4. Ajouter les **photos à l'état des lieux**. Sans photo, une retenue sur le dépôt est difficile à défendre. Moyen.
5. Proposer l'**indice de révision du loyer** au lieu de le faire saisir (table tenue à jour, source et date
   affichées). Petit à moyen.
6. Rapprocher les loyers **sans agrégateur** : import d'un relevé exporté de la banque pour pointer les loyers
   reçus. Ce n'est pas une fonction relevée chez les références : c'est la voie sobre vers leur fonction centrale.
   Moyen. La lecture bancaire directe reste une décision du dirigeant (prestataire agréé, payant).
7. Montrer un **repère de prix** avant de solliciter un artisan, présenté comme un ordre de grandeur. Moyen ;
   formulation à faire relire.
8. SCI à l'impôt sur le revenu : un **récapitulatif annuel par associé**. Gros ; rien avant l'avis de
   l'expert-comptable. À défaut, l'export de préparation existant suffit au palier 1.

**Pour le locataire**
9. Rouvrir les **rappels de rendez-vous** (veille), et en ajouter un le matin même. Petit. Le SMS vient après.
10. Demander ses **disponibilités dès la déclaration** de l'incident : cela raccourcit l'aller-retour des créneaux.
    Petit.
11. Afficher la **garantie annoncée par l'artisan** et rattacher une réouverture à l'intervention d'origine. Petit.

**Pour l'artisan**
12. **Semaine type et périodes d'absence**, pour préremplir les trois créneaux et ne pas être sollicité en congé.
    Moyen.
13. **Lignes de devis réutilisables** (sa propre bibliothèque), utilisables sans l'IA. Moyen.
14. **Numérotation automatique** des factures et **contrôle des mentions** avant envoi. Petit à moyen ; à valider
    avec l'expert-comptable.
15. **Relance d'une facture en retard** auprès du gestionnaire. Petit.
16. **Rendez-vous manqué** : le consigner, en disant qui était absent. Petit à moyen.
17. **Acompte** au devis : à trancher (utile pour un remplacement d'équipement, inutile pour un dépannage). Moyen.
18. **Facturation électronique** : décision à prendre avant d'étendre la facture produite par Gerimmo. Tant qu'elle
    n'est pas prise, garder le dépôt de la facture émise par l'outil de l'artisan comme voie principale.

## 4. À ne pas faire

- **Encaisser pour le compte d'un tiers** : loyer payé en ligne, prélèvement, paiement en ligne d'une facture
  d'artisan, montant bloqué sur une carte, paiement en plusieurs fois. Cela demande un agrément ou un prestataire
  de paiement agréé. Le dirigeant l'a déjà tranché le 10/09/2026 (wiki « Proposition de valeur »).
- **Vendre de l'assurance** (loyers impayés, propriétaire non occupant, protection juridique, décennale) :
  activité réglementée. Un comparateur d'information suffit.
- **Tenir une comptabilité complète et produire des liasses** (meublé au réel, SCI à l'impôt sur les sociétés,
  amortissements, bilan) et **télétransmettre** : c'est le métier d'Ownily, avec validation d'expert-comptable et
  partenaire de télétransmission. Gerimmo reste une aide à la déclaration.
- **Noter ou classer les candidats locataires**, analyser automatiquement leurs pièces : risque de discrimination
  et de décision automatisée. Le code s'y refuse déjà (`lib/conseils-locataire.ts`).
- **Garantir les interventions, fixer les prix, tenir une astreinte, opérer un service après-vente** : Gerimmo
  deviendrait le prestataire. Il met en relation et trace ; l'artisan s'engage.
- **Baux commerciaux et professionnels**, indices associés : hors du palier 1.
- **Outils d'entreprise du bâtiment** : achats, bons de commande, rentabilité de chantier, pointage, factures de
  situation, retenue de garantie, financement, création de site. Hors sujet pour du dépannage locatif.
- **Base de prix du marché sous licence**, **devis dicté à la voix** : coût récurrent, dépendance à un tiers.
- **Fonctions propres à la santé** dans la référence de rendez-vous : liste d'attente, blocage d'un client après
  des absences, rendez-vous de groupe, consultation à distance.
- **Offres pour agences et collectivités** : palier 2.

## 5. Ce que Gerimmo fait et que ces références n'annoncent pas

Pour mémoire, sans y voir un écart : déclaration d'incident par le locataire, mise en concurrence des devis,
planification à trois, compte rendu avec photo, évaluation et contestation, réseau d'artisans validés
(`actions/incidents.ts`, `actions/artisan.ts`) ; restitution du dépôt de garantie (`actions/restitution.ts`) ;
plan d'apurement (`actions/plan-apurement.ts`) ; congé du locataire (`actions/conge-locataire.ts`) ; relevés de
compteurs (`actions/consommations.ts`) ; export complet des données (`agence/[orgId]/export-complet`).

## 6. Points à confirmer

- Relire les cinq sites en direct une fois les hôtes autorisés (section 7) : les résumés du moteur peuvent dater.
- État réel des interrupteurs en production (signature, recommandé, module « clients externes » de l'artisan) :
  je ne lis pas les variables de l'hébergeur.
- Paiement du loyer en ligne chez Qalimo : cité par un annuaire, pas par l'éditeur.
- Calendrier de la facturation électronique : les pages d'Obat ne concordent pas ; à lire à la source officielle.
- Tous les points marqués « juridique » ou « fiscal » ci-dessus sont des questions, pas des affirmations de droit.

## 7. Pages à ouvrir (second passage)

État du premier passage : **toutes ces pages sont « non lues sur le site »**. Trois hôtes ont été essayés en lecture
directe et refusés (`www.qalimo.fr`, `www.ownily.fr`, `www.obat.fr`) ; les autres n'ont pas été essayés. Les
adresses ci-dessous sont celles que le moteur de recherche a rendues ; aucune n'est devinée. Quand une page de
tarifs n'a pas été trouvée, c'est écrit.

### Noms d'hôte exacts à autoriser

| Référence | Hôte | Usage | Essai direct au premier passage |
|---|---|---|---|
| Qalimo | `www.qalimo.fr` | Site, fonctionnalités, tarif | Refusé |
| Ownily | `www.ownily.fr` | Site, services, tarifs | Refusé |
| Ownily | `ownily.crisp.help` | Centre d'aide public | Non essayé |
| Obat | `www.obat.fr` | Site, fonctionnalités, tarifs | Refusé |
| Doctolib | `info.doctolib.fr` | Pages de fonctions pour les professionnels | Non essayé |
| Doctolib | `doctolib.zendesk.com` | Centre d'aide public (professionnels et clients) | Non essayé |
| Doctolib | `www.doctolib.fr` | Pages côté client | Non essayé |
| MesDépanneurs | `www.mesdepanneurs.fr` | Site, questions fréquentes, pages par métier | Non essayé |
| MesDépanneurs | `espacepro.mesdepanneurs.fr` | Questions fréquentes des artisans | Non essayé |

Hôtes secondaires, utiles seulement pour recouper : `community.doctolib.fr` (feuille de route publiée),
`about.doctolib.fr` (communiqués).

### Qalimo — `www.qalimo.fr`

- Fonctionnalités : https://www.qalimo.fr/fonctionnalites/
- Tarif : https://www.qalimo.fr/tarif/
- Accueil : https://www.qalimo.fr/
- Services et options : https://www.qalimo.fr/services/
- Contrat de location et signature : https://www.qalimo.fr/logiciel-contrat-de-location/
- Candidature du locataire : https://www.qalimo.fr/candidature-locataire/ et
  https://www.qalimo.fr/fonctionnalites-gestion-candidatures-locataires/
- Bailleur particulier : https://www.qalimo.fr/gestion-locative-particulier/
- LMNP : https://www.qalimo.fr/gestion-locative-lmnp/
- Comptabilité SCI : https://www.qalimo.fr/comptabilite-sci/
- Questions fréquentes : https://www.qalimo.fr/faq/
- À vérifier en priorité : existence d'un espace du locataire et son contenu ; paiement du loyer en ligne (oui ou
  non) ; ce qui est inclus ou en option ; photos et signature de l'état des lieux.

### Ownily — `www.ownily.fr` et `ownily.crisp.help`

- Tarifs : https://www.ownily.fr/tarifs
- Accueil : https://www.ownily.fr/
- Déclarations fiscales des SCI : https://www.ownily.fr/services/declarations-fiscales
- Déclaration LMNP : https://www.ownily.fr/services/declaration-fiscale-lmnp
- Gestion des locations : https://www.ownily.fr/services/gestion-des-locations
- SCI à l'IS : https://www.ownily.fr/lp/sci-is
- Conditions générales (nature du service) : https://www.ownily.fr/legal/conditions-generales-utilisation
- Aide, export des écritures :
  https://ownily.crisp.help/fr/article/ou-editer-un-fichier-des-ecritures-comptables-fec-sur-ownily-1x036dn/
- Aide, paramétrage LMNP :
  https://ownily.crisp.help/fr/article/lmnp-realiser-le-parametrage-initial-de-votre-activite-143srp7/
- À vérifier en priorité : ce que chaque formule inclut (comptes bancaires, nombre de biens, gestion locative) ;
  accès d'un associé ou d'un comptable ; ce que l'éditeur dit ne pas faire.

### Obat — `www.obat.fr`

- Devis et factures : https://www.obat.fr/devis-factures/
- Tarifs : https://www.obat.fr/tarifs/
- Accueil : https://www.obat.fr/
- Bibliothèques de prix : https://www.obat.fr/devis-factures/bibliotheques/
- Facturation électronique : https://www.obat.fr/devis-factures/facturation-electronique/
- Page d'un métier du dépannage (plombier) : https://www.obat.fr/devis-factures/plombier/
- Artisan seul : https://www.obat.fr/artisans-seuls/
- Sommaire destiné aux robots, s'il est servi : https://www.obat.fr/llms.txt
- À vérifier en priorité : liste des mentions posées automatiquement ; acompte et avoir ; ce que couvre la
  facturation électronique et à quelle date.

### Doctolib — `info.doctolib.fr`, `doctolib.zendesk.com`, `www.doctolib.fr`

- Agenda du professionnel : https://info.doctolib.fr/solution/agenda/
- Agenda en ligne : https://info.doctolib.fr/doctolib-patient/agenda-en-ligne/
- Rendez-vous non honorés : https://info.doctolib.fr/solutions-rdv-non-honores/
- **Page de tarifs : adresse non relevée par la recherche.** À chercher depuis `info.doctolib.fr` ; sans intérêt
  direct pour l'audit, qui ne porte que sur les fonctions de créneaux.
- Aide, paramétrage de l'agenda et des motifs :
  https://doctolib.zendesk.com/hc/fr/articles/23521218336276-G%C3%A9rer-le-param%C3%A9trage-de-votre-agenda-et-de-vos-motifs-de-consultation
- Aide, plage d'ouverture : https://doctolib.zendesk.com/hc/fr/articles/210175963-Cr%C3%A9er-une-plage-d-ouverture
- Aide, délais de réservation :
  https://doctolib.zendesk.com/hc/fr/articles/360054003732-Modifier-les-d%C3%A9lais-d-ouverture-et-de-fermeture-des-r%C3%A9servations-en-ligne
- Aide, absence : https://doctolib.zendesk.com/hc/fr/articles/207811593-Cr%C3%A9er-une-absence
- Aide, annuler et prévenir :
  https://doctolib.zendesk.com/hc/fr/articles/4402839123476-Supprimer-annuler-un-ou-plusieurs-rendez-vous-et-pr%C3%A9venir-mes-patients
- Aide, notifications envoyées :
  https://doctolib.zendesk.com/hc/fr/articles/360056017052-Comprendre-quelles-notifications-SMS-e-mail-push-sont-envoy%C3%A9es-%C3%A0-mes-patients
- Aide, déplacer un rendez-vous : https://doctolib.zendesk.com/hc/fr/articles/4406831561876-D%C3%A9placer-un-rendez-vous
- Côté client : https://www.doctolib.fr/sante/rendez-vous-non-honores/
- À vérifier en priorité : nombre et moment des rappels ; délai limite d'annulation ; ce que voit le client après
  une annulation par le professionnel ; export vers un agenda personnel (non relevé au premier passage).

### MesDépanneurs — `www.mesdepanneurs.fr` et `espacepro.mesdepanneurs.fr`

- Accueil : https://www.mesdepanneurs.fr/
- Mode d'emploi : https://www.mesdepanneurs.fr/mode-demploi
- Questions fréquentes : https://www.mesdepanneurs.fr/faq
- **Pas de page de tarifs unique relevée.** Les fourchettes de prix sont sur les pages par métier :
  https://www.mesdepanneurs.fr/plomberie et https://www.mesdepanneurs.fr/serrurerie
- Projet de travaux : https://www.mesdepanneurs.fr/projet-travaux
- Page d'une ville : https://www.mesdepanneurs.fr/artisan/paris
- Questions fréquentes des artisans : https://espacepro.mesdepanneurs.fr/faq
- À vérifier en priorité : la date de ces pages (plusieurs semblent anciennes) ; durée et conditions de la
  garantie ; suivi de la commande ; annulation d'une demande (non relevée) ; conditions générales de vente.

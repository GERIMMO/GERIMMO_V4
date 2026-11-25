---
type: business-rule
tags: [rgpd, registre, traitements, sous-traitance, conformite, dpo]
status: draft
created: 2026-09-20
updated: 2026-11-25
sources: ["[[RGPD]]", "[[Durées de conservation]]", "[[Fermeture de compte]]", "[[Prospection commerciale]]", "[[Rétractation en ligne]]", "[[Conditions générales]]", "[[Souscription de l'abonnement]]", "[[Liste d'attente des agences]]", "[[Socle de sécurité]]", "[[Plan de reprise d'activité]]", "[[Modèle de données]]", "[[Relecture adverse et publication conformité V1 — 24 octobre 2026]]", "[[Recueil des textes officiels (v6)]]", "log.md — entrées « decision » des 23 et 24/10/2026, « deploy » du 24/10/2026 (PR #246, PR #248)", "DECISIONS-2026-11-24.md (Q6, Q8, Q11, Q13, Q15, Q16, Q20, Q21, Q24, Q36, Q37, Q39, Q46, Q76, Q101)", "QUESTIONS.md (Q19, Q25, Q36, Q46, Q68, Q79, Q84, Q86, Q87, Q90, Q113)", "JURISTE.md, partie 9 (points 23, 28, 30, 31)", "JOURNAL.md — lots D3, D4, D5, D7, T3, T4 et case « mariés ou pacsés » (24-25/11/2026)", "livrables/notes-banc/notes-T4.md (§ 1.2, 1.5, 9), notes-D4.md, notes-D5.md, notes-T3.md, fusion/corrections-fusion-notes.md", "livrables/recueil/analyse-refs-25-37.md (réf. 31, 34)", "app/supabase/migrations/20261024140000_conservation_et_prospection.sql", "app/supabase/migrations/20261024130000_fermeture_comptes.sql", "app/supabase/migrations/20261024150000_activation_inactivite_v1.sql", "version préparée 89cb87ff : migrations 20261125103000, 20261125105000, 20261125106000, 20261125140000, 20261125152000, 20261124180000 ; app/src/lib/editeur.ts (annexe 1)"]
---

# Registre des traitements

**Énoncé :** Gerimmo tient le registre des activités de traitement de l'article 30 du
RGPD, en deux volets : ce qu'il traite **pour son propre compte** (plateforme, volet 1)
et ce qu'il traite **pour le compte des propriétaires bailleurs** (gestion locative,
volet 2), selon la qualification posée dans [[RGPD]] (A2, 24/07/2026).

> [!note] Statut : réécrit le 24/10/2026 (lot 6 du plan de conformité juriste/DPO du 23/10), mis à jour le 25/11/2026
> Le dirigeant n'a mandaté **ni juriste ni DPO** (décision du 23/10). Ce registre décrit :
> - ce que fait le code **en production** : les lots du 24/10 (PR #246, migrations `20261024090000` à
>   `20261024140000`), la publication de la V1 des conditions, de la page confidentialité et de la règle d'inactivité
>   le 24/10 (PR #248, migration `20261024150000`), puis le code servi depuis le 21/11 (`81740dec`) ;
> - les changements de la **version préparée** (`89cb87ff`, complétée par `ee28d874`, vérifiée en entier sur le banc et poussée le 25/11 sur la
>   branche de préproduction, non publiée en production), marqués
>   « **préparée** ».
> Aucune source juridique n'a pu être ouverte sur Légifrance. Les textes cités depuis le
> [[Recueil des textes officiels (v6)]] sont **fournis par le dirigeant et non recontrôlés sur Légifrance**. Chaque
> base légale et chaque durée reste une **proposition prudente, à faire relire**. Le référentiel CNIL de la gestion
> locative (délibération 2021-057) est cité comme **repère non contraignant**. **Aucune règle de conservation n'est
> activée pendant la mission** (décision du 24/11, Q39).

## Fondement
- Article 30 du RGPD : registre du responsable (§ 1) et du sous-traitant (§ 2) — article absent du recueil.
- Qualification des rôles : [[RGPD]] (RM-A2.8/9) — Gerimmo **sous-traitant** pour les
  données de gestion locative, **responsable** pour la plateforme ; article 11 des conditions générales et annexe 1
  « article 28 » ([[Conditions générales]] : version du 15/11/2026 en production, version du 24/11/2026 préparée).
- Durées : catalogue `retention_rules`, détaillé dans [[Durées de conservation]] ; purge chaque nuit par
  `appliquer_retention`, une règle inactive ne purge rien.

## Identité

| Rubrique | Valeur |
|---|---|
| Responsable de traitement (volet 1) | L'Éditeur de Gerimmo : **entrepreneur individuel** (avis Sirene du 24/11/2026 : nom commercial SAUVEXPERT ; ce n'est pas une société). Dénomination, adresse, SIRET, immatriculation, téléphone, e-mail de contact et directeur de publication sont lus en base par `lireEditeur()` (table `supervision_identite`) et publiés sur `/mentions-legales` : **ils ne sont pas recopiés ici**. Production : identité saisie non lue. **Préparée** : un « type de vendeur » (entrepreneur individuel ou société) se choisit dans la console ; pour un entrepreneur individuel, le nom doit porter « EI » (code de commerce R526-27, recueil) ; SIREN et SIRET s'affichent sur les mentions légales ; valeurs à saisir le jour de la publication (`DECISIONS-2026-11-24.md`, Q76). Activité déclarée : 85.59A (Q66). |
| Capital social | **Sans objet** (entreprise individuelle) ; **préparée** : la console refuse un capital pour un entrepreneur individuel, la ligne ne paraît que pour une société. |
| Représentant dans l'Union | Sans objet (éditeur établi en France). |
| Délégué à la protection des données | **Non désigné** : la désignation ne paraît pas obligatoire (à confirmer sur l'art. 37 du RGPD, absent du recueil) ; **référent : le dirigeant** ; à réévaluer à l'ouverture de l'offre aux agences. |
| Médiateur de la consommation | **Aucun désigné** (Q7, Q75) ; voir [[Souscription de l'abonnement]]. |
| Contact pour l'exercice des droits | L'adresse de contact des mentions légales et la page « Mes données personnelles » (`/compte/donnees`) ; pour les données de gestion locative, le propriétaire bailleur responsable de son dossier. **Préparée** (page confidentialité, E141) : le titulaire d'un espace télécharge son archive complète ; les autres comptes demandent une copie des données de leur compte ; le locataire s'adresse à son bailleur pour les données d'une location. |

## Volet 1 — Gerimmo responsable de traitement (plateforme)

État du code en production ; les changements de la version préparée sont marqués « **préparée** ». « Inactive » : la
règle existe au catalogue mais ne purge rien tant que la supervision ne l'a pas activée (activation une par une, après
un bilan sans suppression ; aucune pendant la mission, Q39).

| # | Traitement | Finalité | Base légale (proposée) | Personnes | Données | Destinataires / sous-traitants | Durée |
|---|---|---|---|---|---|---|---|
| P1 | **Comptes, authentification et preuve des conditions acceptées** | Ouvrir et sécuriser l'accès ; prouver quelle version des conditions a été acceptée, quand, et pour quel espace | Exécution du contrat (conditions générales, ou conditions de l'espace artisan, publiées le 24/10) ; **intérêt légitime** pour le compte des invités (locataires, cautions), qui ne contractent pas ; preuve des conditions : **obligation légale** de conserver les contrats conclus par voie électronique d'au moins 120 € (C. conso, L. 213-1, absent du recueil) et **intérêt légitime** dans les autres cas | Tous les utilisateurs | Adresse électronique, mot de passe haché, second facteur, acceptations (`acceptations_cgu` : document, version, empreinte, date), connexions et erreurs (`tech_log`). **Préparée** : accord exprès à une nouvelle version par une case non cochée (date du serveur, version, empreinte du texte archivé, compte ; ni adresse IP ni copie envoyée) ; seule une acceptation qui porte l'empreinte vaut preuve | Supabase Auth (Paris) ; Resend (courriers d'accès) | Compte : tant qu'il est utilisé ; **24 mois** après la dernière connexion d'un membre ou la fin du dernier abonnement payé, après avertissements J-60 et J-15 (`compte:inactif`, **active depuis le 24/10**, migration `20261024150000`) ; inscriptions jamais confirmées **1 mois** (`compte:inscription_non_confirmee`, inactive) ; comptes d'invités jamais utilisés **3 mois** (`compte:invitation_jamais_utilisee`, inactive) ; preuve des conditions : **10 ans** après la fin du dernier abonnement payé, copiée dans `archives_comptes` avant toute suppression (`archive:preuve_contrat`, active), **supprimée avec le compte s'il n'a jamais payé** ; journal technique 6 mois. **Aucune finalité de test sur des données réelles** (décision 10 du 23/10). |
| P2 | **Abonnement, facturation, rétractation, résiliation, impayé** | Encaisser l'abonnement ; gérer essai, lecture seule, résiliation, rétractation et impayé ; confirmer la souscription sur support durable et accuser réception des déclarations du client | Exécution du contrat ; **obligation légale** (code de la consommation) pour la rétractation, la résiliation et les réclamations ; factures : **obligation fiscale** (livre des procédures fiscales, art. L. 102 B ; délai porté de six à dix ans par la loi n° 2026-534, art. 36, pour les pièces dont le délai expire après le 1er janvier 2027 — **recueil, non recontrôlé**) | Titulaires d'un espace (propriétaires bailleurs) | Organisation, formule, périodicité, date de souscription, états Stripe, échecs de prélèvement et paliers de relance, adresse de facturation, déclarations de rétractation (`retractations_abonnement`), marques de résiliation ; **jamais le numéro de carte** | Stripe (Irlande) ; Resend | Événements Stripe traités **6 mois** (`journal:abonnement_evenements`) ; références des factures d'un compte fermé : **6 ans** en production, **10 ans** dans la version **préparée** (`archive:facture` à 120 mois, plancher 120, migration `20261125103000` ; rien n'est raccourci ni supprimé, aucune facture n'a six ans avant 2032) ; client Stripe (et ses factures) jamais supprimé avant ce terme — **préparée** : pas avant dix ans après la fin du dernier abonnement payé ni avant l'échéance recalculée de sa dernière facture archivée ; déclarations de rétractation **10 ans**, gardées même après la fermeture du compte (`contrat:retractation`) ; preuves du contrat écrites au journal d'audit **10 ans** (`journal:audit_preuve_contrat`). Voir [[Souscription de l'abonnement]], [[Rétractation en ligne]], [[Résiliation de l'abonnement]], [[Impayé de l'abonnement]]. |
| P3 | **Annuaire des artisans, évaluations, classement, exclusions** | Mettre en relation propriétaires et artisans ; garantir la fiabilité (SIRET, attestations, évaluations, exclusions) ; classer | Exécution des conditions de l'espace artisan (publiées le 24/10/2026) | Artisans (personnes physiques ou représentants) | Raison sociale, SIRET, contact, métiers, zone, attestations, comptes rendus, évaluations, note, indicateurs, exclusions ; **préparée** : motif du retrait d'une évaluation, lisible par le seul auteur de la note (Q20), absent de l'export (Q68) ; absences déclarées et semaine type | Propriétaires qui le sollicitent ; Supabase | Évaluations **3 ans** après dépôt (`artisan:evaluation`, inactive) ; motif d'exclusion 3 ans (espace client) ou 5 ans (réseau), purge non planifiée ; classement : note prise en compte **à partir de trois évaluations** (migration `20261024100000`) |
| P4 | **Demandes de contact et de devis du site** | Répondre à la demande du visiteur | **Intérêt légitime** (répondre à la demande faite) | Visiteurs du site (particuliers, professionnels) | Nom, adresse, téléphone, message, objet de la demande | Supervision ; Supabase | **24 mois** après le dernier traitement ou le dépôt (`contact:devis`, active) ; la fiche prospect d'un particulier suit le sort de sa demande |
| P5 | **Contestation d'une évaluation d'artisan** | Réexamen humain d'une note (RM-A2.11) | Exécution des conditions de l'espace artisan | Artisans, auteurs d'évaluations | Contestation, échanges, décision | Supervision | **3 ans** après la clôture (`support:contestation`, inactive) |
| P6 | **Journaux de sécurité** | Détecter et qualifier les incidents, tracer les actions sensibles, les accès de la supervision et les consultations de pièces | **Intérêt légitime** (sécurité) | Tous | Événements techniques, actions sensibles, accès et exports de la supervision, consultations de pièces ; **préparée** : décisions de la console (vente aux particuliers sans médiateur, ouverture des envois automatiques) inscrites à l'historique | Supervision | Journal technique **6 mois** ; journal d'audit **12 mois** (`journal:audit_log`, délibération CNIL 2021-122 citée par la migration) ; contrôle interne **36 mois** ; preuves du contrat **10 ans** ; accès aux pièces **12 mois** ; journal d'authentification Supabase **6 mois** (`journal:auth_audit`, inactive) |
| P7 | **Courriers du service** | Envoyer les courriers d'accès, d'abonnement, de rétractation, de résiliation, d'impayé, de fermeture et d'alerte de conservation | Exécution du contrat ; obligation légale pour les accusés de réception | Titulaires, gérants, invités, artisans, garants | Adresse électronique, contenu du courrier | Resend (domaine d'envoi en Irlande, société américaine) | Traces d'envoi dans les tables métier ; durée chez Resend **à vérifier**. **Préparée** : cinq envois automatiques (avis d'échéance, relance amiable de loyer, rappel de rendez-vous, relance d'une invitation, relance d'une demande de report de rendez-vous), chacun avec son interrupteur, **fermés à la livraison**, à ouvrir à la publication (Q6, Q37) ; l'avis et la relance automatique exigent en plus l'accord de l'espace (Q24) ; la relance de loyer envoyée à la main suit l'interrupteur de la relance (jamais à la caution) ; lien envoyé au garant pour confirmer son mobile (Q19) ; motifs d'un refus ou d'une suspension envoyés à l'artisan (Q25) ; courriel « Document à signer » de l'ancien parcours **retiré** (Q21, lot D5) |
| P8 | **Assistance rédactionnelle de la supervision** | Étude de la veille, brouillons et illustrations du Journal, aide à la décision du matin | Intérêt légitime | — | Textes éditoriaux publics, sans donnée de locataire ni de bailleur (d'après le code) | OpenAI (États-Unis, transfert hors UE) | Chez OpenAI : **à vérifier** (Q84). **Préparée** : l'origine de chaque article est enregistrée ; « Rédigé avec l'aide de l'IA » sur la page de l'article et à la fin du post Facebook (Q13, Q67) |
| P9 | **Journal public et diffusion Facebook** | Informer le public | Intérêt légitime | — | Titre, texte, illustration, sans donnée personnelle | Meta (Irlande, transfert vers les États-Unis) | Chez Meta : **à vérifier**. **Préparée** : diffusion masquée et refusée par le serveur tant que la Page n'est pas vérifiée (« Relié ») (Q101) |
| P10 | **Liste d'attente des propriétaires** (`liste_attente`, distincte de P11) | Prévenir les visiteurs de l'ouverture du service, à leur demande | **Intérêt légitime** (par analogie avec P11 ; qualification à relire) | Visiteurs du site | Adresse, nombre de biens, page d'origine, horodatage | Supervision ; Supabase | **36 mois** depuis l'inscription (`contact:attente`, inactive) ; **table vide** (contrôle en production du 24/11) ; décision du 24/11 (Q36) : rien n'est supprimé pendant la mission, la table est **à retirer dans un lot à part après la publication** |
| P11 | **Liste d'attente des agences** ([[Liste d'attente des agences]]) | Prévenir les agences de l'ouverture de leur offre, à leur demande | **Intérêt légitime** (donner suite à la demande faite) | Représentants d'agences | Agence, contact, adresse, téléphone, code postal, tranche de lots, message, statut de suivi | Supervision (console, export sans les inscriptions retirées ni opposées) ; Supabase | **36 mois depuis l'inscription** (`contact:attente_agences`, inactive) ; inscription retirée supprimée dès que son empreinte d'opposition est posée, même règle inactive ; inscription convertie supprimée 3 mois après la conversion. Décision du 24/11 : « Ne touche jamais à liste_attente_agences » (Q36) |
| P12 | **Suivi commercial** (prospects, [[Prospection commerciale]]) | Recontacter un prospect | **Deux régimes** : professionnels, **intérêt légitime** ; particuliers, **consentement** — aucun consentement n'étant enregistré, **aucune fiche prospect d'un particulier hors de sa demande** (choix du 24/10) | Prospects | Identité, coordonnées, origine (liste fermée), dates de contact, opposition | Supervision | Professionnels : **3 ans** après leur dernier contact (`contact:prospect`, active) ; particuliers : avec leur demande (`contact:devis`) ; opposition (« Stop ») : fiches supprimées aussitôt, **empreinte SHA-256** de l'adresse gardée **3 ans** (`prospect:opposition`, active) |
| P13 | **Demandes sur les données personnelles** ([[Demandes sur les données et fermeture de compte]]) | Répondre aux demandes d'exercice des droits | **Obligation légale** (RGPD, art. 12 à 22 ; les articles 12 à 15 et 22 sont reproduits au recueil, non recontrôlé) | Titulaires de compte ; personnes sans compte (tenue manuelle) | Demande, réponses, historique, trace d'une fermeture | Supervision | Échéance de réponse : **un mois civil** (jour de Paris) ; conservation **3 ans** après la clôture (`support:demande_droits`, inactive) |
| P14 | **Parrainage** ([[Parrainage]]) | Attribuer l'avantage du parrain à la conversion de son filleul | Exécution du contrat (offre de parrainage) — qualification à relire | Titulaires parrain et filleul | Codes, liens de parrainage, avantage attribué | Stripe (solde client) | Aucune règle propre au catalogue ; à la fermeture d'un espace, le parrainage est détaché et l'avantage de l'autre client reste |
| P15 | **Fermetures de comptes et archives** ([[Fermeture de compte]]) | Exécuter la fermeture ; garder la preuve du contrat et des factures ; réappliquer les effacements après une restauration | **Obligation légale** : factures (LPF, art. L. 102 B) ; contrats conclus en ligne d'au moins 120 € (C. conso, L. 213-1) ; **intérêt légitime** sinon | Titulaires et membres fermés | `fermetures_comptes`, `archives_comptes` (identifiant d'origine, organisation, adresse, client Stripe, acceptations, dates d'abonnement, références de factures), `effacements_a_reappliquer` | Super-administrateur permanent avec second facteur ; Stripe (remboursement) | Trace de la fermeture **3 ans** ; preuve **10 ans** après la fin du dernier abonnement payé ; références des factures **6 ans** en production, **10 ans préparée** ; **préparée** : une archive n'est plus supprimée tant que le client Stripe n'a pas été supprimé (migration `20261125105000`) ; effacements à réappliquer **4 mois** ; client Stripe supprimé au terme des factures |
| P16 | **Aide et retours** ([[Retours utilisateurs]]) | Support, réponses, amélioration du produit, réclamations | Exécution du contrat ; obligation légale pour les réclamations (renvoi au médiateur) | Utilisateurs connectés | Compte, message, contexte d'écran anonymisé, réponses | Supervision | Signalements de problème **6 mois** (`support:bug`, active) ; questions et idées **24 mois** (`support:question_idee`, inactive) ; **réclamations : aucune règle au catalogue** (point à trancher). **Préparée** : la réponse qui clôt une réclamation rappelle le médiateur, ou dit qu'« aucun n'est désigné à ce jour » |

## Volet 2 — Gerimmo sous-traitant (gestion locative)

**Responsables de traitement :** chaque propriétaire bailleur, pour son espace ; la liste
des espaces et de leurs responsables se lit dans la console (annuaire `/admin/clients`,
fiche `/admin/organisations/<id>`). Les agences sont retirées de l'offre (décision du
dirigeant) ; leurs règles propres (mandats, rapports de gestion) restent au catalogue.
**Instructions :** les réglages et gestes du propriétaire dans l'application.
**Contrat de sous-traitance :** l'annexe 1 « article 28 » des conditions générales, complétée par la V1 **publiée le
24/10/2026** (objet, durée, nature, obligations du Client, instructions, sous-traitants ultérieurs, transferts, fin du
traitement). **Préparée** : la version du 24/11 décrit en entier ce qui part chez OpenAI (voir plus bas) ; elle
demande l'accord exprès des abonnés à leur prochain acte (décision Q15, [[Conditions générales]]).

| Catégorie | Données | Durée (règle) | Sort | Active (production) |
|---|---|---|---|---|
| Fiche de la personne | Identité, coordonnées | 36 mois après la fin du dernier bail et la clôture des comptes (`personne:fiche`) | Retrait des informations nominatives | Non (lot 5, avant novembre 2028) |
| Pièces du [[Dossier locataire]] | Pièce d'identité, justificatifs de revenus et d'imposition. **Préparée** : avant tout bail signé et pour une caution, seules les pièces de la liste du décret n° 2015-1437 (annexes I et II, 34 intitulés repris du recueil, non recontrôlé) peuvent être demandées ; le libellé libre est refusé, sauf au locataire d'un bail signé en cours et, depuis la reprise T3R-2, à qui n'est ni candidat ni caution (locataire sorti d'un bail signé, détenteur d'un lot, mandant) ([[Dossier locataire]]) | 36 mois après la fin du dernier bail (`document:piece_identite`, `document:justificatif`) | Suppression | Oui |
| Pièces d'une personne sans bail | Candidature non retenue, dossier abandonné | 3 mois après le dernier dépôt, alerte J-15 (`dossier:sans_bail`) | Suppression | Non (après le bilan) |
| [[Bail]] et [[État des lieux]] | Contrats, constats. **Préparée** : case « mariés ou pacsés » au bail (donnée de situation familiale des deux locataires, migrations `20261125152000` à `154000`) ; à la sortie, « adresse du nouveau domicile ou du lieu d'hébergement du locataire » (même donnée qu'avant, nouveau libellé) | 36 mois après la fin du bail (`document:bail`, `document:etat_des_lieux`) | Retrait du fichier | Oui |
| Notice d'information déposée par le bailleur | **Préparée** (lot D3, Q46) : PDF déposé à l'étape Documents du bail, exigé pour l'envoi en signature électronique d'un bien d'habitation ; anciennes versions visibles | **Non fixée** (Q46) | — | — |
| Courriers, attestations d'assurance, règlements de copropriété | Pièces du bail | 36 mois après la fin du bail | Suppression | Oui |
| Quittances | Quittances émises | 36 mois après la fin du bail ; sans bail rattaché, 120 mois après l'émission (`document:quittance`) | Retrait du fichier | Oui |
| Autres documents | Pièces sans type | 60 mois après le dépôt ; 36 mois après la fin du bail s'il est rattaché à un bail (`document:autre`) | Suppression | Oui |
| Preuves de signature | Circuits, PDF signés, certificats. **Préparée** : l'ancien parcours « télécharger, signer, redéposer » est retiré (Q21, lot D5) — écran, action et courriel supprimés du code, droits retirés en base, **rien n'est supprimé** (table `demandes_signature` vide en production au contrôle du 24/11) ; la signature électronique est proposée en premier, le papier reste possible (Q11) | 36 mois après la fin du bail (`preuve:signature`) | Suppression | Oui |
| Diagnostics | Diagnostics du lot | 60 mois après la fin de gestion du bien | Suppression | Oui |
| Écritures et encaissements | Loyers, paiements | 36 mois après la fin du dernier bail et la clôture des comptes (`comptable:loyers`) | Retrait des informations nominatives | Non (lot 5) |
| Incidents | Dossiers ; photos | Dossiers 24 mois après la clôture (`incident:dossier`, inactive) ; photos 24 mois (active) | Retrait des informations nominatives ; suppression | Partiel |
| Messages de la location | Échanges | 24 mois après la fin du dernier bail (`message:locatif`) | Suppression | Non (lot 5) |
| Intentions de congé traitées, alertes traitées | Historique opérationnel | 24 mois ; 12 mois | Suppression | Oui |
| Invitations non acceptées | Adresse de la personne invitée | 3 mois (`invitation:locataire`, `invitation:artisan`) | Suppression | Non (après le bilan) |
| Mandats, rapports de gestion (agences) | Contrats et comptes rendus | 60 mois ; 120 mois après l'émission (commerçant, C. com. L. 123-22) | Retrait du fichier | Oui |
| Devis et factures d'artisans | Pièces de l'intervention | Tant que le compte existe ; durée propre **non fixée** | — | — |

**Gel en cas de litige :** depuis le 24/10, le propriétaire suspend la suppression des
pièces d'un bail depuis sa fiche (douze mois au plus, renouvelable, motif écrit,
journalisé) ; il est prévenu trente jours avant la suppression des pièces d'un bail et
quinze jours avant celle des pièces d'une personne sans bail. Détail : [[Durées de conservation]].

**Sous-traitants ultérieurs** (liste figée de l'annexe 1 des conditions, plan du 23/10, R11) : Supabase (base,
authentification, fichiers — Paris) · Vercel (exécution — Paris) · Resend (courriers) · **Zoho Sign** (signature
électronique, centre de données européen) · Scaleway (copie chiffrée des sauvegardes, Paris, 90 jours) · GitHub
Actions (exécution de la sauvegarde ; données en clair le temps du chiffrement ; États-Unis) · **OpenAI** (États-Unis).
Rôle d'OpenAI : en production, l'annexe 1 ne cite que les propositions de devis ; **préparée** (annexe 1 du 24/11,
déjà sur la page confidentialité préparée depuis le 22/11), les trois envois réels faits à la demande de
l'utilisateur — assistant « Demander à Gerimmo » (sujet et messages), lecture assistée d'une facture ou d'une photo de
compteur (le fichier entier), propositions de devis (catégorie, symptômes d'une liste fermée, catalogue). Hors mode
« commercial » (`GERIMMO_MODE`, à régler à la publication, Q16), ces fonctions n'appellent jamais l'IA. Les conditions
de l'espace artisan ne citent d'OpenAI que les propositions de devis. Stripe relève du volet 1. La **Base Adresse
Nationale** n'est pas un sous-traitant : le navigateur l'appelle directement. **Yousign** est retiré de la liste
publique : aucun circuit en production, clés révoquées le 23/10 ; l'ancien adaptateur et le format des archives restent
dans le code, sans en supprimer les anciennes preuves.

**Accords de sous-traitance (DPA)** : à accepter par le dirigeant dans les consoles de
Supabase, Vercel, Resend, Zoho Sign, Scaleway, GitHub et OpenAI, copie datée gardée
(décision 12 du 23/10) ; **acceptation non constatée** dans les sources lues au 25/11.

## Mesures de sécurité (renvoi)
Chiffrement en transit et au repos, cloisonnement par organisation (RLS), mot de passe de
douze caractères vérifié contre les fuites, second facteur obligatoire pour la
supervision, fichiers servis sans adresse publique, consultation des pièces sensibles
tracée, journaux à durée propre. **Aucun antivirus** sur les fichiers déposés (décision du 24/11, Q8) : dépôts bornés
en taille et en format (PDF, JPEG, PNG, 10 Mo). Clé de chiffrement des sauvegardes : aucune copie hors de GitHub, une
nouvelle clé et une sauvegarde relisible sont à faire avant la publication (Q9). Détail : [[Socle de sécurité]],
[[Isolation multi-organisation]], [[Plan de reprise d'activité]]. Violation de données :
[[Procédure de notification de violation]] ; la notification au client « sous 48 h »
(décision 9 du 23/10) suppose une personne joignable en l'absence du dirigeant, non
désignée : le texte garde « dans les meilleurs délais » (mots de l'article 33 du RGPD tel que reproduit au recueil).

## Transferts hors Union européenne
GitHub Actions (sauvegarde) et OpenAI (propositions de devis, assistant, lecture assistée, assistance rédactionnelle) :
transferts vers les États-Unis, encadrés par les clauses contractuelles types intégrées à leurs accords de traitement
(page confidentialité publiée le 24/10) ; leur certification au cadre UE–États-Unis n'est pas vérifiée (articles 44 à 46
du RGPD absents du recueil). Resend : domaine d'envoi en Irlande, société américaine (fondement d'un accès depuis les
États-Unis à lire dans son DPA). Meta : P9, et plus tard WhatsApp ([[Canaux de communication]]).

## Implications pour l'application
- Toute nouvelle règle de `retention_rules` se reporte ici et dans [[Durées de conservation]] ; un test compare le
  tableau de la page confidentialité et le catalogue.
- La page publique `/confidentialite` reprend ce registre en langage courant (publiée avec la V1 le 24/10). **Préparée**
  : datée du jour de la dernière modification de son texte (24 novembre 2026, décision Q99), factures dix ans,
  médiateur, droits des comptes sans espace.

> [!warning] Points à trancher / contradictions
> - **Toutes les bases légales et durées ci-dessus** : propositions du plan du 23/10, sans juriste ni DPO. RGPD art. 6,
>   12 à 15, 22, 28 et 33 lus dans le recueil (**non recontrôlé sur Légifrance**) ; RGPD art. 30 et 37, C. conso
>   L. 213-1 et D. 213-1, délibération CNIL 2021-122 et référentiel 2021-057 (repère) : non lus.
> - **Factures : six ans en production, dix ans dans la version préparée** (loi n° 2026-534, art. 36, recueil). Point
>   de départ retenu (la plus tardive de l'émission et de la fin de l'exercice, toujours au moins dix ans après
>   l'émission) à confirmer (JURISTE.md, partie 9, point 28) ; la rédaction de L. 102 B au 1er janvier 2027 n'est pas
>   dans le recueil. Migrations à jouer avant le 1er janvier 2027. Un compte fermé avant le lot T4 a été informé de six
>   ans : faut-il le prévenir ? (Q86 ; supposé : aucun compte payant fermé). L'écran de simulation du nettoyage compte
>   encore une archive que la purge fait désormais attendre (Q87).
> - **Annexe 1 élargie (OpenAI)** : l'information des abonnés « au moins un mois à l'avance » est-elle due pour une
>   description élargie ? (juriste, partie 9, point 31). **Durée de conservation chez OpenAI** non fournie (Q84) : la
>   page confidentialité renvoie aux informations d'OpenAI.
> - **Lecture seule automatique** (impayé, fin d'essai) : décision automatisée au sens de l'article 22 ? (Q82 ; juriste,
>   partie 9, point 30).
> - **Pièces demandées à une caution après la signature** : toujours limitées à la liste du décret (Q113 ; juriste,
>   partie 9, point 23). ~~Reprise du lot T3 en cours (libellé libre à rendre au locataire sorti et au propriétaire
>   mandant).~~ → *25/11 : reprise faite (T3R-2, commit `7180794e`, contenu dans `89cb87ff`, complétée par `ee28d874`) ; reste ouvert le cas de
>   l'ancien propriétaire ou de l'ancienne caution sans autre lien, qui retombent sur la liste des candidats
>   (`livrables/notes-banc/notes-T3.md`, reprise, question 3).*
> - **Case « mariés ou pacsés »** : nouvelle donnée de situation familiale au bail (version préparée) ; minimisation et
>   information des locataires non examinées.
> - **Notice d'information déposée** : durée de conservation et accès du locataire à décider (Q46).
> - **DPO non désigné** : la non-obligation (art. 37) n'est pas vérifiée ; à réévaluer à l'ouverture aux agences.
> - **Règles inactives** (`compte:inscription_non_confirmee`, `compte:invitation_jamais_utilisee`, `dossier:sans_bail`,
>   `artisan:evaluation`, `support:*` sauf `support:bug`, `contact:attente`, `contact:attente_agences`, invitations,
>   et les quatre règles du lot 5) : la page confidentialité les annonce ; aucune n'est activée pendant la mission
>   (Q39). `compte:inactif` est active depuis le 24/10.
> - **Réclamations (P16)** : aucune durée au catalogue. **Parrainage (P14)** et **devis et factures d'artisans** :
>   aucune durée propre.
> - **Comptes d'invités (P1)** : base « intérêt légitime » à relire ; idem pour la liste des propriétaires (P10).
> - **Accords de sous-traitance** (décision 12) et **certification UE–États-Unis** d'OpenAI et de GitHub : non
>   constatées.
> - **Score artisan** : AIPD à produire avant tout usage automatisé de la note ([[RGPD]]).
> - **Resend** : durée de rétention des journaux d'envoi et DPA à lire.
> - **Export de l'artisan** : un fichier JSON seul, sans ses messages, créneaux, photos ni fichiers joints (Q90).
> - ~~**Compte fermé** : aucune règle ne fixe ce qu'il advient d'un compte fermé~~ → **réglé le 24/10**
>   ([[Fermeture de compte]]).
> - ~~**Liste d'attente des agences (P11)** : base légale et durée à décider~~ → **intérêt légitime, 36 mois depuis
>   l'inscription** (plan du 23/10, décision du dirigeant « OK aux valeurs par défaut »).
> - ~~**Liste d'attente des propriétaires (P10)** : un site tiers l'utilise-t-il encore ?~~ → **table vide au 24/11, à
>   retirer après la publication** (Q36).
> - ~~**Publication des conditions V1 et de la page confidentialité V1**~~ → **publiées le 24/10** (PR #248).

## Historique
- 20/09/2026 : premier brouillon (volets 1 et 2, P1 à P9).
- 16/10 : durées D13, D14, D48 amorcées dans [[RGPD]].
- 19-20/10 : P10 et P11 ajoutées.
- 22/10 : préparation locale de la conservation des preuves et des invitations
  ([dossier](../../app/docs/signatures-conservation-22-octobre.md)).
- 24/10 : réécriture complète (P1 à P16, identité lue en base, DPO non désigné, durées du
  lot 2 en production) ; publication de la V1 des conditions et de la page confidentialité, règle `compte:inactif`
  activée.
- 25/11 : version préparée (lots D3, D4, D5, D7, T3, T4, case « mariés ou pacsés ») reportée, marquée « préparée » :
  vendeur entrepreneur individuel, factures dix ans, annexe OpenAI, envois automatiques, ancien parcours de signature
  retiré, pièces du décret, notice déposée.

## Relecture avant publication du 24 octobre

Voir [[Relecture adverse et publication conformité V1 — 24 octobre 2026]] pour les sources officielles consultées, les
corrections retenues et les réserves de la V1.

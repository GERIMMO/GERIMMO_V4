---
type: business-rule
tags: [rgpd, registre, traitements, sous-traitance, conformite, dpo]
status: draft
created: 2026-09-20
updated: 2026-10-24
sources: ["[[RGPD]]", "[[Durées de conservation]]", "[[Fermeture de compte]]", "[[Prospection commerciale]]", "[[Rétractation en ligne]]", "[[Conditions générales]]", "[[Liste d'attente des agences]]", "[[Socle de sécurité]]", "[[Plan de reprise d'activité]]", "[[Modèle de données]]", "log.md — entrées « decision » des 23 et 24/10/2026, « deploy » du 24/10/2026 (PR #246)", "app/supabase/migrations/20261024140000_conservation_et_prospection.sql", "app/supabase/migrations/20261024130000_fermeture_comptes.sql"]
---

# Registre des traitements

**Énoncé :** Gerimmo tient le registre des activités de traitement de l'article 30 du
RGPD, en deux volets : ce qu'il traite **pour son propre compte** (plateforme, volet 1)
et ce qu'il traite **pour le compte des propriétaires bailleurs** (gestion locative,
volet 2), selon la qualification posée dans [[RGPD]] (A2, 24/07/2026).

> [!note] Statut : réécrit le 24/10/2026 (lot 6 du plan de conformité juriste/DPO du 23/10)
> Le dirigeant n'a mandaté **ni juriste ni DPO** (décision du 23/10 : « côté juriste fais
> de manière logique et selon tes conseil, dpo pareil »). Ce registre décrit ce que fait le
> code **en production depuis le 24/10** (PR #246, `f79674c`, migrations `20261024090000`
> à `20261024140000`) et les qualifications retenues par le plan. Aucune source juridique
> n'a pu être ouverte le 23/10 (Légifrance, CNIL, EUR-Lex inaccessibles) : chaque base
> légale et chaque durée reste une **proposition prudente, à faire relire**. Le référentiel
> CNIL de la gestion locative (délibération 2021-057) est cité comme **repère non
> contraignant**, jamais comme une obligation.

## Fondement
- Article 30 du RGPD : registre du responsable (§ 1) et du sous-traitant (§ 2).
- Qualification des rôles : [[RGPD]] (RM-A2.8/9) — Gerimmo **sous-traitant** pour les
  données de gestion locative, **responsable** pour la plateforme ; article 11 des
  conditions générales en vigueur (version du 30/09/2026) et annexe « article 28 ».
- Durées : catalogue `retention_rules` (58 règles depuis le 24/10), détaillé dans
  [[Durées de conservation]] ; purge chaque nuit par `appliquer_retention`, une règle
  inactive ne purge rien.

## Identité

| Rubrique | Valeur |
|---|---|
| Responsable de traitement (volet 1) | L'Éditeur de Gerimmo, **entrepreneur individuel non commerçant** (décision du 23/10). Dénomination, adresse, immatriculation, SIRET, téléphone et adresse de contact sont lus en base par `lireEditeur()` (`app/src/lib/editeur-serveur.ts`, table `supervision_identite`) et publiés sur la page `/mentions-legales` : **ils ne sont pas recopiés ici** ; s'y reporter. Faits saisis en production au relevé du 23/10, sauf les trois coordonnées du médiateur (non bloquantes, adhésion à venir). |
| Capital social | **Sans objet** (entreprise individuelle ; décision du 23/10 ; `EDITEUR.capital` vaut `null`, ligne masquée sur les mentions légales). |
| Représentant dans l'Union | Sans objet (éditeur établi en France). |
| Délégué à la protection des données | **Non désigné** : la désignation ne paraît pas obligatoire (à confirmer sur l'art. 37 du RGPD) ; **référent : le dirigeant** ; à réévaluer à l'ouverture de l'offre aux agences. |
| Contact pour l'exercice des droits | L'adresse de contact des mentions légales et la page « Mes données personnelles » (`/compte/donnees`) ; pour les données de gestion locative, le propriétaire bailleur responsable de son dossier. |

## Volet 1 — Gerimmo responsable de traitement (plateforme)

État du code au 24/10/2026. « Inactive » : la règle existe au catalogue mais ne purge
rien tant que la supervision ne l'a pas activée (activation une par une, après un bilan
sans suppression, plan du 23/10, lot 2).

| # | Traitement | Finalité | Base légale (proposée) | Personnes | Données | Destinataires / sous-traitants | Durée |
|---|---|---|---|---|---|---|---|
| P1 | **Comptes, authentification et preuve des conditions acceptées** | Ouvrir et sécuriser l'accès ; prouver quelle version des conditions a été acceptée, quand, et pour quel espace | Exécution du contrat (conditions générales, ou conditions de l'espace artisan une fois publiées) ; **intérêt légitime** pour le compte des invités (locataires, cautions), qui ne contractent pas ; preuve des conditions : **obligation légale** de conserver les contrats conclus par voie électronique d'au moins 120 € (C. conso, L. 213-1) et **intérêt légitime** dans les autres cas | Tous les utilisateurs | Adresse électronique, mot de passe haché, second facteur, acceptations (`acceptations_cgu` : document `conditions_clients`, `conditions_artisans` ou `regles_invites`, version, empreinte, date), connexions et erreurs (`tech_log`) | Supabase Auth (Paris) ; Resend (courriers d'accès) | Compte : tant qu'il est utilisé ; **24 mois** après la dernière connexion d'un membre ou la fin du dernier abonnement payé, après avertissements J-60 et J-15 (`compte:inactif`, **inactive** jusqu'à la V1 des conditions) ; inscriptions jamais confirmées **1 mois** (`compte:inscription_non_confirmee`, inactive) ; comptes d'invités jamais utilisés **3 mois** (`compte:invitation_jamais_utilisee`, inactive) ; preuve des conditions : **10 ans** après la fin du dernier abonnement payé, copiée dans `archives_comptes` avant toute suppression (`archive:preuve_contrat`, active), **supprimée avec le compte s'il n'a jamais payé** ; journal technique 6 mois. **Aucune finalité de test sur des données réelles** (décision 10 du 23/10 : recettes sur comptes fictifs). |
| P2 | **Abonnement, facturation, rétractation, résiliation, impayé** | Encaisser l'abonnement ; gérer essai, lecture seule, résiliation, rétractation et impayé ; confirmer la souscription sur support durable et accuser réception des déclarations du client | Exécution du contrat ; **obligation légale** (code de la consommation) pour la rétractation, la résiliation et les réclamations ; factures : **obligation fiscale** (livre des procédures fiscales, art. L. 102 B — éditeur non commerçant) | Titulaires d'un espace (propriétaires bailleurs) | Organisation, formule, périodicité, date de souscription, états Stripe, échecs de prélèvement et paliers de relance, adresse de facturation, déclarations de rétractation (`retractations_abonnement`), marques de résiliation ; **jamais le numéro de carte** | Stripe (Irlande) ; Resend | Événements Stripe traités **6 mois** (`journal:abonnement_evenements` ; un paiement de facture reste tant qu'un abonnement porte ce client) ; références des factures d'un compte fermé **6 ans** après la fin de l'exercice de la facture, à défaut après la fin du dernier abonnement payé (`archive:facture`) ; client Stripe jamais supprimé avant ce terme ; déclarations de rétractation **10 ans**, gardées même après la fermeture du compte (`contrat:retractation`) ; preuves du contrat écrites au journal d'audit (commande, confirmation, résiliation, mise en demeure, rétractation, confirmations de signature) **10 ans** (`journal:audit_preuve_contrat`). Voir [[Souscription de l'abonnement]], [[Rétractation en ligne]], [[Résiliation de l'abonnement]], [[Impayé de l'abonnement]]. |
| P3 | **Annuaire des artisans, évaluations, classement, exclusions** | Mettre en relation propriétaires et artisans ; garantir la fiabilité (SIRET, attestations, évaluations, exclusions) ; classer | Exécution des conditions de l'espace artisan (non publiées au 24/10 : l'artisan accepte encore les conditions clients) | Artisans (personnes physiques ou représentants) | Raison sociale, SIRET, contact, métiers, zone, attestations, comptes rendus, évaluations, note, indicateurs, exclusions | Propriétaires qui le sollicitent ; Supabase | Évaluations **3 ans** après dépôt (`artisan:evaluation`, règle créée le 24/10, inactive) ; motif d'exclusion 3 ans (espace client) ou 5 ans (réseau), purge non planifiée ; classement : note prise en compte **à partir de trois évaluations** (migration `20261024100000`) |
| P4 | **Demandes de contact et de devis du site** | Répondre à la demande du visiteur | **Intérêt légitime** (répondre à la demande faite) | Visiteurs du site (particuliers, professionnels) | Nom, adresse, téléphone, message, objet de la demande | Supervision ; Supabase | **24 mois** après le dernier traitement ou le dépôt (`contact:devis`, active) ; la fiche prospect d'un particulier suit le sort de sa demande |
| P5 | **Contestation d'une évaluation d'artisan** | Réexamen humain d'une note (RM-A2.11) | Exécution des conditions de l'espace artisan | Artisans, auteurs d'évaluations | Contestation, échanges, décision | Supervision | **3 ans** après la clôture (`support:contestation`, inactive) |
| P6 | **Journaux de sécurité** | Détecter et qualifier les incidents, tracer les actions sensibles, les accès de la supervision et les consultations de pièces | **Intérêt légitime** (sécurité) | Tous | Événements techniques, actions sensibles, accès et exports de la supervision, consultations de pièces | Supervision | Journal technique **6 mois** ; journal d'audit **12 mois** (`journal:audit_log`, délibération CNIL 2021-122 citée par la migration) ; contrôle interne (accès et exports de la supervision, support, maintenance, purges, fermetures, effacements) **36 mois** ; preuves du contrat **10 ans** ; accès aux pièces **12 mois** ; journal d'authentification Supabase **6 mois** (`journal:auth_audit`, inactive : 0 ligne aux relevés des 23 et 24/10) |
| P7 | **Courriers du service** | Envoyer les courriers d'accès, d'abonnement, de rétractation, de résiliation, d'impayé, de fermeture et d'alerte de conservation | Exécution du contrat ; obligation légale pour les accusés de réception | Titulaires, gérants, invités | Adresse électronique, contenu du courrier | Resend (domaine d'envoi en Irlande, société américaine) | Traces d'envoi dans les tables métier ; durée chez Resend **à vérifier** |
| P8 | **Assistance rédactionnelle de la supervision** | Étude de la veille, brouillons et illustrations du Journal, aide à la décision du matin | Intérêt légitime | — | Textes éditoriaux publics, sans donnée de locataire ni de bailleur (d'après le code) | OpenAI (États-Unis, transfert hors UE) | Chez OpenAI : **à vérifier** |
| P9 | **Journal public et diffusion Facebook** | Informer le public | Intérêt légitime | — | Titre, texte, illustration, sans donnée personnelle | Meta (Irlande, transfert vers les États-Unis) | Chez Meta : **à vérifier** |
| P10 | **Liste d'attente des propriétaires** (`liste_attente`, distincte de P11) | Prévenir les visiteurs de l'ouverture du service, à leur demande | **Intérêt légitime** (par analogie avec P11 ; qualification à relire) | Visiteurs du site | Adresse, nombre de biens, page d'origine, horodatage | Supervision ; Supabase | **36 mois** depuis l'inscription (`contact:attente`, inactive) ; **compter les lignes en production ; fermée si vide** : 0 ligne aux relevés des 23 et 24/10 ; fermer l'inscription anonyme si aucun site tiers ne l'utilise (question au dirigeant, non bloquante : un site tiers utilise-t-il encore cette liste ?) |
| P11 | **Liste d'attente des agences** ([[Liste d'attente des agences]]) | Prévenir les agences de l'ouverture de leur offre, à leur demande | **Intérêt légitime** (donner suite à la demande faite) | Représentants d'agences | Agence, contact, adresse, téléphone, code postal, tranche de lots, message, statut de suivi | Supervision (console, export sans les inscriptions retirées ni opposées) ; Supabase | **36 mois depuis l'inscription** (`contact:attente_agences`, inactive au déploiement, à activer après le bilan) ; inscription retirée supprimée dès que son empreinte d'opposition est posée, même règle inactive ; inscription convertie supprimée 3 mois après la conversion |
| P12 | **Suivi commercial** (prospects, [[Prospection commerciale]]) | Recontacter un prospect | **Deux régimes** : professionnels, **intérêt légitime** ; particuliers, **consentement** — aucun consentement n'étant enregistré, **aucune fiche prospect d'un particulier hors de sa demande** (choix du 24/10) | Prospects | Identité, coordonnées, origine (liste fermée : formulaire, échange direct, recommandation), dates de contact, opposition | Supervision | Professionnels : **3 ans** après leur dernier contact (`contact:prospect`, active) ; particuliers : avec leur demande (`contact:devis`) ; opposition (« Stop ») : toutes les fiches de l'adresse supprimées aussitôt, **empreinte SHA-256** de l'adresse gardée **3 ans** (`prospect:opposition`, active ; intérêt légitime : ne plus écrire) |
| P13 | **Demandes sur les données personnelles** ([[Demandes sur les données et fermeture de compte]]) | Répondre aux demandes d'exercice des droits | **Obligation légale** (RGPD, art. 12 à 22) | Titulaires de compte ; personnes sans compte (tenue manuelle) | Demande, réponses, historique, trace d'une fermeture | Supervision | Échéance de réponse : **un mois civil** (jour de Paris) ; conservation **3 ans** après la clôture (`support:demande_droits`, inactive) |
| P14 | **Parrainage** ([[Parrainage]]) | Attribuer l'avantage du parrain à la conversion de son filleul | Exécution du contrat (offre de parrainage) — qualification à relire | Titulaires parrain et filleul | Codes, liens de parrainage, avantage attribué | Stripe (solde client) | Aucune règle propre au catalogue ; à la fermeture d'un espace, le parrainage est détaché et l'avantage de l'autre client reste ; il part avec ses avantages quand les deux espaces sont effacés |
| P15 | **Fermetures de comptes et archives** ([[Fermeture de compte]]) | Exécuter la fermeture ; garder la preuve du contrat et des factures ; réappliquer les effacements après une restauration | **Obligation légale** : factures (LPF, art. L. 102 B, éditeur non commerçant) ; contrats conclus en ligne d'au moins 120 € (C. conso, L. 213-1) ; **intérêt légitime** sinon | Titulaires et membres fermés | `fermetures_comptes` (origine, dates, choix, bilan, gel), `archives_comptes` (identifiant d'origine, organisation, adresse, client Stripe, acceptations, dates d'abonnement, références de factures), `effacements_a_reappliquer` | Super-administrateur permanent avec second facteur ; Stripe (remboursement) | Trace de la fermeture **3 ans** ; preuve **10 ans** après la fin du dernier abonnement payé ; références des factures **6 ans** ; effacements à réappliquer **4 mois** (`journal:effacements_a_reappliquer`) ; client Stripe supprimé au terme des factures |
| P16 | **Aide et retours** ([[Retours utilisateurs]]) | Support, réponses, amélioration du produit, réclamations | Exécution du contrat ; obligation légale pour les réclamations (renvoi au médiateur) | Utilisateurs connectés | Compte, message, contexte d'écran anonymisé, réponses | Supervision | Signalements de problème **6 mois** (`support:bug`, active) ; questions et idées **24 mois** après le dernier échange (`support:question_idee`, inactive) ; **réclamations : aucune règle au catalogue** (point à trancher) |

## Volet 2 — Gerimmo sous-traitant (gestion locative)

**Responsables de traitement :** chaque propriétaire bailleur, pour son espace ; la liste
des espaces et de leurs responsables se lit dans la console (annuaire `/admin/clients`,
fiche `/admin/organisations/<id>`). Les agences sont retirées de l'offre (décision du
dirigeant) ; leurs règles propres (mandats, rapports de gestion) restent au catalogue.
**Instructions :** les réglages et gestes du propriétaire dans l'application.
**Contrat de sous-traitance :** l'annexe « article 28 » des conditions générales. La
version en vigueur (30/09/2026) en porte une, incomplète ; la V1 la complète (« annexe 1 » :
objet, durée, nature, obligations du Client, instructions, sous-traitants ultérieurs,
transferts, fin du traitement). **Publication des conditions V1 prévue le 24/10.**

| Catégorie | Données | Durée (règle) | Sort | Actif au 24/10 |
|---|---|---|---|---|
| Fiche de la personne | Identité, coordonnées | 36 mois après la fin du dernier bail et la clôture des comptes (`personne:fiche`) | Retrait des informations nominatives | Non (lot 5, avant novembre 2028) |
| Pièces du [[Dossier locataire]] | Pièce d'identité, justificatifs de revenus et d'imposition | 36 mois après la fin du dernier bail (`document:piece_identite`, `document:justificatif`) | Suppression | Oui |
| Pièces d'une personne sans bail | Candidature non retenue, dossier abandonné | 3 mois après le dernier dépôt, alerte J-15 (`dossier:sans_bail`) | Suppression | Non (après le bilan) |
| [[Bail]] et [[État des lieux]] | Contrats, constats | 36 mois après la fin du bail (`document:bail`, `document:etat_des_lieux`) | Retrait du fichier | Oui |
| Courriers, attestations d'assurance, règlements de copropriété | Pièces du bail | 36 mois après la fin du bail | Suppression | Oui |
| Quittances | Quittances émises | 36 mois après la fin du bail ; sans bail rattaché, 120 mois après l'émission (`document:quittance`) | Retrait du fichier | Oui |
| Autres documents | Pièces sans type | 60 mois après le dépôt ; 36 mois après la fin du bail s'il est rattaché à un bail (`document:autre`) | Suppression | Oui |
| Preuves de signature | Circuits, PDF signés, certificats | 36 mois après la fin du bail (`preuve:signature`) | Suppression | Oui |
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

**Sous-traitants ultérieurs** (liste figée de l'annexe des conditions V1, plan du 23/10,
R11) : Supabase (base, authentification, fichiers — Paris) · Vercel (exécution — Paris) ·
Resend (courriers) · **Zoho Sign** (signature électronique, centre de données européen) ·
Scaleway (copie chiffrée des sauvegardes, Paris, 90 jours) · GitHub Actions (exécution de
la sauvegarde ; données en clair le temps du chiffrement ; États-Unis) · **OpenAI**
(propositions de devis ; États-Unis). Stripe relève du volet 1. La **Base Adresse
Nationale** n'est pas un sous-traitant : le navigateur l'appelle directement pour compléter
une adresse. **Yousign** est retiré de la liste publique : aucun circuit en production,
clés révoquées le 23/10 ; l'ancien adaptateur et le format des archives restent dans le
code, sans en supprimer les anciennes preuves.

**Accords de sous-traitance (DPA)** : à accepter par le dirigeant dans les consoles de
Supabase, Vercel, Resend, Zoho Sign, Scaleway, GitHub et OpenAI, copie datée gardée
(décision 12 du 23/10) ; **acceptation non constatée** dans le journal au 24/10.

## Mesures de sécurité (renvoi)
Chiffrement en transit et au repos, cloisonnement par organisation (RLS), mot de passe de
douze caractères vérifié contre les fuites, second facteur obligatoire pour la
supervision, fichiers servis sans adresse publique, consultation des pièces sensibles
tracée, journaux à durée propre. Détail : [[Socle de sécurité]],
[[Isolation multi-organisation]], [[Plan de reprise d'activité]]. Violation de données :
[[Procédure de notification de violation]] ; la notification au client « sous 48 h »
(décision 9 du 23/10) suppose une personne joignable en l'absence du dirigeant, non
désignée : le texte garde « dans les meilleurs délais ».

## Transferts hors Union européenne
GitHub Actions (sauvegarde) et OpenAI (propositions de devis, assistance rédactionnelle) :
transferts vers les États-Unis, encadrés par les clauses contractuelles types intégrées à
leurs accords de traitement (texte de la page confidentialité V1, non publiée) ; leur
certification au cadre UE–États-Unis n'est pas vérifiée. Resend : domaine d'envoi en
Irlande, société américaine (fondement d'un accès depuis les États-Unis à lire dans son
DPA). Meta : P9, et plus tard WhatsApp ([[Canaux de communication]]).

## Implications pour l'application
- Toute nouvelle règle de `retention_rules` se reporte ici et dans
  [[Durées de conservation]] ; un test compare déjà le tableau de la page confidentialité
  V1 et le catalogue (branche des textes, non publiée).
- La page publique `/confidentialite` reprend ce registre en langage courant ; sa version
  V1 (DPO non désigné, tableau complet des durées, fermeture du compte) paraît avec les
  conditions V1.

> [!warning] Points à trancher / contradictions
> - **Toutes les bases légales et durées ci-dessus** : propositions du plan du 23/10, sans
>   juriste ni DPO — à confirmer sur Légifrance (source non ouverte le 23/10/2026) : RGPD
>   art. 6, 30 et 37 ; C. conso L. 213-1 et D. 213-1 ; LPF L. 102 B ; délibération CNIL
>   2021-122 ; référentiel CNIL 2021-057 (repère).
> - **DPO non désigné** : la non-obligation (art. 37) n'est pas vérifiée ; à réévaluer à
>   l'ouverture aux agences — à confirmer sur Légifrance (source non ouverte le 23/10/2026).
> - **Règles inactives au déploiement** (`compte:inactif`, `compte:inscription_non_confirmee`,
>   `compte:invitation_jamais_utilisee`, `dossier:sans_bail`, `artisan:evaluation`,
>   `support:*` sauf `support:bug`, `contact:attente`, `contact:attente_agences`,
>   invitations, et les quatre règles du lot 5) : la page confidentialité V1 les annonce ;
>   chacune doit être activée après son bilan, `compte:inactif` en même temps que
>   `VERSION_MIN_INACTIVITE` à la publication de la V1.
> - **Réclamations (P16)** : la nature « Faire une réclamation » existe depuis le 24/10 mais
>   n'a aucune durée au catalogue.
> - **Parrainage (P14)** et **devis et factures d'artisans** : aucune durée propre.
> - **Comptes d'invités (P1)** : base « intérêt légitime » choisie par le lot 4 — qualification
>   à relire ; idem pour la liste des propriétaires (P10).
> - **Accords de sous-traitance** (décision 12) et **certification UE–États-Unis** d'OpenAI et
>   de GitHub : non constatées.
> - **Score artisan** : AIPD à produire avant tout usage automatisé de la note ([[RGPD]]).
> - **Resend** : durée de rétention des journaux d'envoi et DPA à lire.
> - ~~**Compte fermé** : aucune règle ne fixe ce qu'il advient d'un compte fermé~~ →
>   **réglé le 24/10** ([[Fermeture de compte]]).
> - ~~**Liste d'attente des agences (P11)** : base légale et durée à décider~~ → **intérêt
>   légitime, 36 mois depuis l'inscription** (plan du 23/10, décision du dirigeant
>   « OK aux valeurs par défaut »).

## Historique
- 20/09/2026 : premier brouillon (volets 1 et 2, P1 à P9).
- 16/10 : durées D13, D14, D48 amorcées dans [[RGPD]].
- 19-20/10 : P10 et P11 ajoutées.
- 22/10 : préparation locale de la conservation des preuves et des invitations
  ([dossier](../../app/docs/signatures-conservation-22-octobre.md)).
- 24/10 : réécriture complète (P1 à P16, identité lue en base, DPO non désigné, durées du
  lot 2 en production).

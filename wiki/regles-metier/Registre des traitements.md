---
type: business-rule
tags: [rgpd, registre, traitements, sous-traitance, conformite]
status: draft
created: 2026-09-20
updated: 2026-09-27
sources: ["[[RGPD]]", "[[Socle de sécurité]]", "[[Plan de reprise d'activité]]", "[[Modèle de données]]", "[[Modèle de rôles et permissions]]", "[[Grille tarifaire]]", "[[Canaux de communication]]", "[[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]"]
---

# Registre des traitements

**Énoncé :** Gerimmo tient le registre des activités de traitement prévu par
l'article 30 du RGPD, en deux volets — ce qu'il traite **pour son propre
compte** (plateforme) et ce qu'il traite **pour le compte des agences et des
propriétaires bailleurs** (gestion locative), conformément à la qualification
actée dans [[RGPD]] (A2, 2026-07-24).

> [!note] Statut : brouillon établi à partir du code et de la base (20/09/2026)
> Rédigé par l'agent pour préparer le lancement, à partir de ce que le produit
> fait réellement : tables, fonctions, table `retention_rules`, sous-traitants
> du déploiement. Ce n'est pas un avis juridique ; le référentiel A2 prévoit
> une **validation par un conseil spécialisé** avant qu'il fasse foi.

## Fondement
- Article 30 du RGPD : registre du responsable (§ 1) et registre du
  sous-traitant (§ 2) — obligatoire dès lors que le traitement n'est pas
  occasionnel, ce qui est le cas d'un logiciel de gestion.
- Qualification des rôles : [[RGPD]] (RM-A2.8/9) — Gerimmo **sous-traitant**
  pour les données d'agence, **responsable** pour la plateforme.
- Durées : table `retention_rules` (matrice A2), reprise dans [[RGPD]].

## Identité

| Rubrique | Valeur |
|---|---|
| Responsable de traitement (volet plateforme) | L'éditeur de Gerimmo — dénomination, siège, contact **à fournir** (`src/lib/editeur.ts`, tous les faits sont encore vides) |
| Représentant | Sans objet (éditeur établi en France) |
| Délégué à la protection des données | **Non désigné** — à trancher (voir bas de page) |
| Contact pour l'exercice des droits | L'adresse de contact de l'éditeur (à fournir) ; pour les données de gestion locative, l'organisation cliente |

## Volet 1 — Gerimmo responsable de traitement (plateforme)

| # | Traitement | Finalité | Base légale | Personnes | Données | Destinataires / sous-traitants | Durée | 
|---|---|---|---|---|---|---|---|
| P1 | **Comptes et authentification** | Ouvrir et sécuriser l'accès au service | Exécution du contrat (CGU) | Tous les utilisateurs (gérants, agents, propriétaires, locataires, artisans, supervision) | Adresse électronique, mot de passe haché, facteur TOTP, version et date d'acceptation des CGU, code de parrainage, connexions et erreurs (`tech_log`) | Supabase Auth (Paris) ; Resend pour les courriers d'accès (via SMTP) | Vie du compte ; journal technique **6 mois** |
| P2 | **Facturation des abonnements** | Encaisser l'abonnement, gérer l'essai, la lecture seule et la résiliation | Exécution du contrat ; obligation comptable pour les pièces | Responsables d'organisation (admin d'agence, propriétaire direct) | Organisation, quantité facturée (lots ou biens), état de l'abonnement, échecs de prélèvement, adresse de facturation ; **jamais le numéro de carte** (chez Stripe) | Stripe (Irlande) | Durée du contrat ; pièces comptables selon l'obligation légale (dix ans, à confirmer par le conseil) |
| P3 | **Annuaire des artisans, évaluations, décisions de plateforme** | Mettre en relation agences et artisans, garantir la fiabilité (SIRET vérifié, pièces, évaluations, blacklist globale) | Contrat (artisan inscrit) ; intérêt légitime (évaluations, blacklist) | Artisans (personnes physiques ou représentants) | Raison sociale, SIRET, contact, métiers, zones, justificatifs déposés, comptes rendus, évaluations, contestations, décisions | Agences utilisatrices (fiche consultable selon visibilité) ; Supabase | Évaluations **3 ans**, blacklist locale 3 ans / **globale 5 ans** ([[RGPD]]) ; pièces : voir `retention_rules` |
| P4 | **Demandes de devis depuis le site** | Répondre à une demande commerciale | Mesures précontractuelles | Prospects (agences) | Nom, adresse électronique, agence, téléphone, taille du portefeuille, message | Supervision | **24 mois** après dépôt |
| P5 | **Retours utilisateurs et contestations** | Support, amélioration du produit, réexamen humain d'une note contestée (RM-A2.11) | Contrat ; intérêt légitime | Utilisateurs connectés | Compte, message, contexte d'écran, réponses | Supervision | Selon `retention_rules` (règle « signalements support », migration du 14/09) |
| P6 | **Journaux de sécurité** | Détecter et qualifier les incidents, tracer les actions sensibles et les consultations de pièces | Intérêt légitime (sécurité) ; recommandation CNIL pour l'audit | Tous | Événements techniques, actions sensibles (traversées de supervision, purges, exports), consultations de pièces | Supervision | Technique **6 mois** · audit **3 ans** · accès aux pièces **1 an** |
| P7 | **Courriers du service** | Envoyer quittances, avis d'échéance, relances, rappels de rendez-vous, courriers d'abonnement | Contrat (pour le compte des organisations, voir volet 2) | Locataires, artisans, responsables | Adresse électronique, contenu du courrier | Resend — domaine d'envoi en région **eu-west-1 (Irlande)**, constaté le 27/09 ; société établie aux États-Unis | Chez Gerimmo : traces d'envoi dans les tables métier ; chez Resend : **à vérifier** |
| P8 | **Assistance rédactionnelle de la supervision** (ajout du 27/09, audit sécurité) | Préparer l'étude de la veille réglementaire, les brouillons et illustrations du Journal, l'aide à la décision du matin | Intérêt légitime | — | Textes éditoriaux et actualités publiques, **sans donnée de locataire ni de bailleur** d'après le code (`lib/analyse-veille.ts`, `lib/visuel-marketing.ts`, `admin/brief`, `admin/publications`) | OpenAI — États-Unis (**transfert hors UE**) | Chez OpenAI : **à vérifier** |
| P9 | **Publication du Journal sur Facebook** (ajout du 27/09, audit sécurité) | Diffuser les articles du Journal sur la page Facebook de Gerimmo | Intérêt légitime | — | Titre, texte et illustration de l'article, sans donnée personnelle (`lib/facebook.ts`) | Meta (Facebook) — Irlande, avec transfert vers les États-Unis | Chez Meta : **à vérifier** |

## Volet 2 — Gerimmo sous-traitant (gestion locative)

**Responsables de traitement :** chaque agence et chaque propriétaire bailleur
en gestion directe, pour son organisation. **Instructions :** celles que
l'organisation donne à travers l'application (paramètres, gestes, envois
automatiques activés ou non). **Contrat de sous-traitance :** à produire
(RM-A4.13, [[Socle de sécurité]]) — les CGU, article 11, posent déjà la
répartition des rôles.

| Catégorie | Personnes | Données | Durée (`retention_rules`) | Sort |
|---|---|---|---|---|
| Identité et coordonnées | Locataires, garants, propriétaires mandants, occupants | Nom, prénom, date de naissance, adresse, téléphone, courriel | 5 ans après la fin du dernier contrat | Anonymisation |
| Pièces du [[Dossier locataire]] | Locataires, garants | Pièce d'identité, revenus, avis d'imposition, attestations d'assurance | **5 ans** après la fin du dernier bail | Suppression |
| Contrats | Locataires, propriétaires | [[Bail]], [[État des lieux]], [[Mandat de gestion|mandats]], congés | **5 ans** après la fin du contrat | Anonymisation |
| Loyers et comptabilité | Locataires, propriétaires | Termes, encaissements, quittances, rapports de gestion, écritures | **10 ans** après émission | Anonymisation |
| Incidents et interventions | Locataires, artisans | Déclarations, photos, devis, comptes rendus, imputation | Photos **2 ans** après clôture ; devis non retenus 1 an | Suppression |
| Alertes traitées | — | Historique opérationnel | **1 an** | Suppression |
| Courriers et messagerie | Locataires, propriétaires | Courriers émis, échanges | 5 ans après la fin du bail | Suppression |
| Diagnostics | — | Diagnostics du lot | Gestion du bien + 5 ans | Suppression |

**Sous-traitants ultérieurs** (à déclarer aux organisations, RM-A4.13) :
Supabase (base, authentification, fichiers — région eu-west-3, Paris) ·
Vercel (exécution de l'application — région cdg1, Paris, fixée dans
`vercel.json` le 20/09) · Resend (courriers) · Stripe (abonnement de
l'organisation, volet 1) · **Yousign** (adaptateur « Youtrust » dans le code,
branché le 22/09 : le document à signer, le nom, l'adresse électronique et le
téléphone de chaque signataire — France). À venir : Meta pour WhatsApp (hors
UE — consentement explicite et clauses types, [[Canaux de communication]]).
Pour le volet 1 seulement (aucune donnée de gestion locative d'après le code) :
**OpenAI** (P8, États-Unis) et **Meta** pour Facebook (P9, Irlande et
États-Unis).

**Ajout du 27/09 (audit artisan / pages publiques)** — la sauvegarde
(**quotidienne** depuis l'audit sécurité du 27/09, RPO 24 h du
[[Plan de reprise d'activité]] ; elle était hebdomadaire), telle que le code l'établit (`.github/workflows/sauvegarde.yml`,
`app/docs/sauvegarde-et-restauration.md`), fait intervenir deux prestataires
qui n'étaient déclarés nulle part :
- **GitHub (Actions)** — exécute la sauvegarde : la base complète (schémas
  `public`, `auth`, `storage`) et les fichiers transitent **en clair** par ses
  machines le temps d'être chiffrés (AES-256-GCM), puis les copies locales
  sont effacées ; la clé de chiffrement vit dans ses secrets. Prestataire
  établi aux États-Unis.
- **Scaleway** (Object Storage, région `fr-par`, Paris) — conserve la copie
  **chiffrée**, 90 jours, sans la clé. La copie inclut désormais les droits de
  la base (GRANT/REVOKE, audit sécurité du 27/09). Durée de 90 jours actée
  par le porteur le 27/09 ([[Plan de reprise d'activité]]).
S'y ajoute la **Base Adresse Nationale** (`api-adresse.data.gouv.fr`), qui
reçoit le texte des adresses tapées dans la fiche d'un bien (autocomplétion).
Les trois figurent désormais dans la liste des prestataires des pages légales
(`app/src/lib/editeur.ts`).

## Mesures de sécurité (renvoi)

Chiffrement en transit et au repos, cloisonnement par organisation dans la
base (RLS), mot de passe de douze caractères vérifié contre les fuites,
second facteur ouvert à tous et **obligatoire pour la supervision**, fichiers
servis par l'application sans adresse publique, consultation des pièces
sensibles tracée, journaux à durée propre. Détail : [[Socle de sécurité]],
[[Isolation multi-organisation]]. Sauvegardes et restauration :
[[Plan de reprise d'activité]] — le premier test de restauration reste à faire.

## Transferts hors Union européenne

Pour les données de gestion locative, **un transfert est établi depuis le
27/09** : la sauvegarde (quotidienne) s'exécute sur les machines de **GitHub
Actions** (prestataire américain), par lesquelles la base et les fichiers
transitent en clair avant chiffrement (voir ci-dessus). À couvrir (clauses
contractuelles types, ou exécution de la sauvegarde sur une machine située
dans l'UE). **Resend** : le domaine d'envoi est en région européenne (eu-west-1,
Irlande, constaté le 27/09) ; la société reste américaine, le fondement d'un
éventuel accès depuis les États-Unis (contrat de traitement, clauses types)
est à lire dans son DPA. Plus tard, **Meta** pour WhatsApp.

## Implications pour l'application
- Les durées vivent dans `retention_rules` et s'appliquent chaque nuit : le
  registre et la table doivent rester alignés — toute nouvelle règle en base
  se reporte ici.
- La page publique `/confidentialite` (réécrite le 20/09) reprend ce registre
  en langage courant ; les deux se relisent ensemble.
- Le contrat de sous-traitance type reprendra le volet 2 tel quel.

> [!warning] Points à trancher
> - **DPO** : pas d'obligation manifeste pour un éditeur de cette taille sans
>   suivi à grande échelle de données sensibles ; désigner tout de même un
>   référent nommé simplifie la relation avec la CNIL. Décision du porteur.
> - **Score artisan** : base légale (intérêt légitime) et **AIPD** à produire
>   avant tout usage automatisé de la note ([[RGPD]], reste à produire).
> - **Compte fermé** : aucune règle ne fixe encore ce qu'il advient d'un
>   compte fermé (suppression immédiate ? délai de rétractation ?).
> - **Resend** : région de l'envoi réglée (Irlande, 27/09) ; restent la durée de rétention des journaux d'envoi et le fondement contractuel (DPA).
> - **GitHub Actions** (audit sécurité du 27/09) : fondement du transfert hors
>   UE à établir, ou exécution de la sauvegarde sur une machine européenne.
> - **Validation** : ce brouillon attend la relecture d'un conseil spécialisé.

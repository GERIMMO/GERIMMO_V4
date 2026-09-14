---
type: business-rule
tags: [securite, mfa, mot-de-passe, session, chiffrement, antivirus]
status: draft
created: 2026-07-25
updated: 2026-09-14
sources: ["[[2026-07-24-gerimmo-v3-a4-socle-securite]]"]
---

# Socle de sécurité

**Énoncé :** exigences de sécurité transverses de la plateforme (authentification,
chiffrement, fichiers, incidents), fixées par le
[[2026-07-24-gerimmo-v3-a4-socle-securite|livrable A4]] après le constat de l'audit :
« aucune exigence de sécurité dans les 22 modules ». **À valider avant mise en
production** ; exigences fonctionnelles, pas une architecture — un **audit de
sécurité externe reste recommandé avant lancement**.

## MFA proportionné au risque (acté)

| Rôle | MFA | Périmètre du compromis |
|---|---|---|
| [[Super Admin]] | **OBLIGATOIRE** (RM-A4.1, bloquant) | Toutes les agences |
| [[Administrateur d'agence]] | Recommandé, activable (RM-A4.2) | Une agence entière |
| [[Agent immobilier]] / [[Locataire]] / [[Artisan]] | Optionnel | Mandats / dossier / interventions |

Justification actée : l'imposer partout produirait des contournements (mot de passe
partagé, session jamais fermée) — « la sécurité théorique nuirait à la sécurité
réelle ».

## Mise en œuvre vérifiée le 14 septembre 2026

L’écran `/securite` configure un facteur TOTP Supabase Auth, vérifie le code,
permet d’annuler une configuration inachevée et reprend la destination interne.
Le proxy exige AAL2 pour le super administrateur, y compris dans une agence.
La migration `20260914160000_supervision_second_facteur.sql` impose également
AAL2 dans `is_super_admin()` : cacher l’écran ne suffit pas à obtenir les données.
Une adhésion inactive et les autres rôles restent refusés même avec AAL2.

Déploiement : publier l’écran d’abord, appliquer la migration ensuite. À la
première connexion, chaque super administrateur doit configurer sa propre
application. Une perte de facteur nécessite une réinitialisation par le
propriétaire du projet Supabase, après vérification d’identité. Aucun contournement
par mot de passe seul n’est ajouté.

Preuves : suites `mfa-base`, `mfa-api`, `mfa-proxy`, `mfa` et `destination-sure` ;
1 022 tests locaux réussis, compilation/types/lint réussis. Recette navigateur :
annulation, mauvais code, activation, ouverture des espaces et de la console.
Le banc utilise le SDK réel et les politiques SQL réelles, mais émule Auth :
il ne certifie pas le service hébergé ni la lecture d’un QR par téléphone.
Les facteurs de recette sont en mémoire et disparaissent au redémarrage du banc.
La MFA facultative des autres personas (01.9/01.10) reste à développer.

Sources de mise en œuvre : [Supabase — TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp),
[Supabase — niveaux d’assurance](https://supabase.com/docs/guides/auth/auth-mfa).
La source métier A4 ci-dessus reste inchangée.

## Mots de passe et sessions

- **12 caractères minimum**, **vérification contre les fuites connues** (RM-A4.3,
  bloquant) ; pas de complexité imposée (« la longueur prime sur les symboles ») ;
  **aucune expiration périodique** (RM-A4.4 — « produit des variantes prévisibles ») ;
  historique des 5 derniers ; blocage temporaire après 10 échecs.
- **Sessions par rôle** (RM-A4.5) — inactivité / absolu : SA **30 min / 8 h** ·
  admin agence 2 h / 12 h · agent 4 h / 12 h · locataire et artisan **7 j / 30 j**
  (un locataire se connecte quatre fois par an ; un artisan ressaisirait son mot de
  passe avec des gants).
- Politique appliquée dès la première connexion (module 16).

## Chiffrement et hébergement

**Chiffrement en transit (TLS 1.2 min) et au repos — base, fichiers, sauvegardes —
sans exception** (RM-A4.6, bloquant). **Hébergement en région européenne** (RM-A4.7,
acté : « une réponse européenne clôt la discussion »), redondance multi-zone, base
non exposée publiquement, accès administrateur sous MFA et journalisé. Le
cloisonnement applicatif reprend RM-A1.6/7/11/12 —
voir [[Isolation multi-organisation]].

## Fichiers déposés

Cycle à l'entrée (locataires et artisans téléversent — « un point d'entrée souvent
négligé ») : extensions PDF/JPG/PNG · **type réel vérifié, pas l'extension**
(RM-A4.9 — « attestation.pdf » peut être un exécutable renommé) · 10 Mo max ·
**analyse antivirus systématique** (RM-A4.8, acté — échec = refus + alerte ; service
à choisir) · empreinte anti-doublon. Accès : **jamais d'URL directe** (RM-A4.10),
lien temporaire à expiration rapide, droits contrôlés à chaque accès par le type de
document, consultation de pièce sensible tracée. Voir [[Document]].

## Sauvegardes

RPO **24 h** (RM-A4.11) / RTO 4 h, rétention 30 jours glissants, **test de
restauration annuel documenté** (RM-A4.12, bloquant — premier test avant mise en
production). Détail et procédure : [[Plan de reprise d'activité]]. La **corbeille
applicative** (3 mois, RM-0b.8.5) traite les suppressions accidentelles isolées sans
mobiliser une restauration.

## Sous-traitants et transferts

Liste **déclarée aux agences** dans le contrat de sous-traitance, tenue à jour,
information préalable à tout changement (RM-A4.13, bloquant) : hébergeur (UE) ·
Yousign (France) · Stripe (Irlande) · **Meta (hors UE** — acceptable par consentement
explicite + canal optionnel + repli email permanent, encadré par clauses
contractuelles types — [[Canaux de communication]]) · service antivirus (à
déterminer). Voir [[RGPD]] pour la qualification sous-traitant/responsable (A2).

## Incidents de sécurité et journaux

Chaîne : détection immédiate → qualification 2 h → confinement 4 h (SA) →
**information des agences sans délai si données touchées** (RM-A4.14) →
**notification CNIL sous 72 h** par l'agence ou Gerimmo selon la qualification A2 →
information des personnes si risque élevé.
Journalisation (durées RM-A2.6) : connexions et mots de passe → **technique,
6 mois** · traversée SA, modifications de rôle, exports → **audit, 3 ans** ·
consultation de pièce sensible → **accès, 1 an**.

## Reste à faire (A4)

Choix du service antivirus et configuration d'hébergement (avant développement) ;
contrat de sous-traitance type (avant commercialisation) ; procédure de notification
et premier test de restauration (avant production).
→ [[État du projet et décisions ouvertes]]

> [!note] Audit de sécurité externe — écarté (humain, 2026-07-25)
> Décision : **pas d'audit externe avant lancement** ; la revue de sécurité est
> assurée en interne avec l'agent LLM comme auditeur. **Limite assumée et
> documentée** : une revue documentaire/de code ne remplace pas un test d'intrusion
> réel — à réévaluer si un client agence l'exige contractuellement.

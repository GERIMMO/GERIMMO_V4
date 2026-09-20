---
type: business-rule
tags: [rgpd, securite, incident, violation, cnil, procedure]
status: draft
created: 2026-09-20
updated: 2026-09-20
sources: ["[[Socle de sécurité]]", "[[RGPD]]", "[[Plan de reprise d'activité]]", "[[Registre des traitements]]", "[[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]"]
---

# Procédure de notification de violation

**Énoncé :** toute violation de données personnelles (accès, divulgation,
altération ou perte non autorisés — art. 4.12 du RGPD) suit une chaîne unique,
avec des délais fixés : **qualification sous 2 h, confinement sous 4 h,
information des organisations touchées sans délai, notification à la CNIL sous
72 h** par le responsable du traitement concerné, information des personnes si
le risque est élevé. La chaîne et ses délais sont actés dans
[[Socle de sécurité]] (A4, RM-A4.14) ; cette page dit **qui fait quoi, avec
quels gestes, et quoi écrire**.

> [!note] Statut : brouillon opérationnel (20/09/2026)
> Rédigé par l'agent pour le lancement, à partir de la chaîne A4 et des outils
> réellement disponibles (console de supervision, tableau de bord Supabase,
> Vercel, Resend, Stripe). Les gestes techniques sont ceux que la supervision
> peut faire aujourd'hui ; les modèles de message sont des propositions.

## Fondement
- RGPD, art. 33 (notification à l'autorité sous 72 h, contenu, registre
  interne des violations — § 5, **même sans notification**) et art. 34
  (communication aux personnes en cas de risque élevé).
- Répartition : pour les **données de gestion locative**, l'agence ou le
  propriétaire bailleur est responsable de traitement — **c'est lui qui
  notifie la CNIL** ; Gerimmo, sous-traitant, l'**informe sans délai** et
  l'assiste (RM-A2.10). Pour les **données de plateforme** (comptes,
  facturation, annuaire artisan), **Gerimmo notifie lui-même**
  ([[Registre des traitements]]).

## Qui fait quoi

| Rôle | Qui | Responsabilité |
|---|---|---|
| Pilote de l'incident | Le [[Super Admin]] de garde (aujourd'hui : le porteur du projet) | Tient la chronologie, décide du confinement, rédige les notifications |
| Responsable de traitement plateforme | L'éditeur (porteur du projet) | Signe la notification CNIL du volet plateforme |
| Responsables de traitement gestion locative | Chaque organisation touchée | Notifie la CNIL pour ses données ; Gerimmo lui fournit les faits |
| Appui | L'agent LLM (auditeur interne, décision du 25/07) | Lecture des journaux, reconstitution des faits, relecture des messages |

## La chaîne, étape par étape

### 0. Détecter — en continu
Signaux à regarder : le journal technique et le journal d'audit
(`/admin/journaux`), l'écran **Santé du service** (`/admin/sante`, tâches en
échec), les alertes du tableau de bord Supabase (connexions inhabituelles,
erreurs d'authentification), les rebonds et plaintes chez Resend, les
webhooks en échec chez Stripe, un signalement d'utilisateur (retours,
contestations) ou d'un tiers. **Un doute se traite comme un incident**
jusqu'à preuve du contraire.

### 1. Qualifier — dans les 2 heures
Ouvrir une **fiche d'incident** (gabarit ci-dessous) et répondre à cinq
questions : *quoi* (quelles données, quelles tables ou fichiers), *qui* (quelles
organisations, combien de personnes), *comment* (vecteur : compte compromis,
faille, erreur humaine, prestataire), *depuis quand* (première trace au
journal), *toujours en cours ?* Puis qualifier : **violation avérée**, **suspicion**
ou **fausse alerte** — et, si violation, le **niveau de risque** pour les personnes
(faible / élevé : pièces d'identité, revenus, coordonnées de locataires
exposées = élevé).

### 2. Confiner — dans les 4 heures
Gestes disponibles, du plus ciblé au plus large :
1. **Couper l'accès en cause** : révoquer les sessions et bloquer le compte
   compromis (Supabase → Authentication → Users → *ban*), retirer l'adhésion
   depuis la console.
2. **Faire tourner les secrets** exposés : `SUPABASE_SERVICE_ROLE_KEY`,
   `CRON_SECRET`, clé Resend, clé et secret de webhook Stripe — dans Vercel,
   puis redéployer. La clé publiable Supabase ne protège rien seule (la RLS
   protège) mais se régénère aussi.
3. **Fermer une organisation** en lecture seule (suspension) si ses données
   sont en cause.
4. **Mettre le projet Supabase en pause** — dernier recours : tout le service
   s'arrête, pour tout le monde.
5. **Restaurer** si des données ont été altérées : jamais directement en
   production, procédure de [[Plan de reprise d'activité]].
Consigner chaque geste, avec l'heure, dans la fiche.

### 3. Informer les organisations touchées — sans délai
Dès la qualification, avant même la fin du confinement si des données de
gestion locative sont concernées : un message au responsable de chaque
organisation (admin d'agence ou propriétaire direct), par courriel et depuis la
messagerie de l'espace. Il dit **ce qui s'est passé, quelles données, depuis
quand, ce que Gerimmo a fait, ce que l'organisation doit faire** (notifier la
CNIL pour son volet, informer ses locataires si risque élevé) — et propose
l'aide de Gerimmo pour la notification. Modèle en annexe.

### 4. Notifier la CNIL — sous 72 heures à compter de la connaissance
Pour le volet plateforme, par l'éditeur ; pour la gestion locative, par chaque
organisation, avec les faits fournis par Gerimmo. Téléservice de la CNIL
(notification de violation). Contenu exigé (art. 33.3) :
- nature de la violation, catégories et nombre approximatif de personnes et
  d'enregistrements concernés ;
- coordonnées du contact (DPO ou référent) ;
- conséquences probables ;
- mesures prises ou proposées, y compris pour atténuer les effets.
Une notification **en plusieurs temps** est admise si tout n'est pas connu à
72 h : on notifie ce que l'on sait, on complète. Un retard se motive.

### 5. Informer les personnes — si le risque est élevé
En langage clair, individuellement (courriel depuis le service, et par
l'organisation pour ses locataires) : ce qui s'est passé, ce que la personne
peut craindre, ce qu'elle peut faire (changer son mot de passe, surveiller ses
courriers, signaler une usurpation), qui contacter. Modèle en annexe. Pas
d'information individuelle si les données étaient chiffrées de manière à rester
inintelligibles, ou si le risque a été neutralisé — décision motivée dans la
fiche.

### 6. Consigner — toujours, même sans notification
Le **registre des violations** (art. 33.5) reçoit une entrée pour chaque
incident qualifié, fausse alerte comprise : faits, effets, mesures, décisions
de notifier ou non et pourquoi. Il vit dans le wiki, dossier `regles-metier/`,
page « Registre des violations » (à créer à la première entrée), et une ligne
dans `log.md` renvoie vers l'entrée.

### 7. Tirer les leçons — sous quinze jours
Retour d'expérience : cause racine, ce qui a manqué (détection, geste,
contact), correctifs produits (tests, règles, alertes), mise à jour de cette
page.

## Annexes — gabarits

**Fiche d'incident** (une par incident, dans le registre des violations)
```
Référence : VIOL-AAAA-MM-JJ-n
Détection : date/heure — par qui — signal
Qualification (≤ 2 h) : violation avérée / suspicion / fausse alerte
  Données : … · Organisations : … · Personnes (approx.) : …
  Vecteur : … · Début probable : … · En cours : oui/non
  Risque pour les personnes : faible / élevé — motif
Confinement (≤ 4 h) : geste 1 (heure), geste 2 (heure)…
Information des organisations : date/heure, destinataires
Notification CNIL : oui/non — motif — date/heure — référence
Information des personnes : oui/non — motif — date
Retour d'expérience : cause racine, correctifs, date
```

**Message aux organisations touchées** (proposition)
> Objet : Incident de sécurité concernant vos données Gerimmo
> Bonjour, nous avons constaté le [date] un accès non autorisé à [données]
> concernant [périmètre]. Nous l'avons fermé le [date/heure] en [geste]. À ce
> stade, [ce que l'on sait des conséquences]. En tant que responsable du
> traitement de vos données de gestion, il vous revient d'apprécier la
> notification à la CNIL (sous 72 h) et l'information de vos locataires ; nous
> vous fournissons ci-joint les faits établis et restons à votre disposition
> pour rédiger ces notifications. Nous vous tiendrons informés de toute
> évolution. — Gerimmo, [contact]

**Message aux personnes** (proposition, si risque élevé)
> Objet : Information importante sur vos données
> Bonjour, un incident de sécurité survenu le [date] a pu exposer [données]
> vous concernant. Voici ce que nous avons fait : [mesures]. Ce que nous vous
> recommandons : [changer votre mot de passe / rester attentif à …]. Pour toute
> question : [contact]. — [Organisation ou Gerimmo]

## Implications pour l'application
- Les journaux existants suffisent à reconstituer les faits ; ce qui manque
  est une **alerte** : un événement technique d'échec d'authentification répété
  ou une traversée de supervision inhabituelle devrait remonter au tableau de
  bord de supervision (à proposer après le lancement).
- Un geste « suspendre l'organisation » existe ; « bloquer un compte » passe
  encore par le tableau de bord Supabase.

> [!warning] Points à trancher
> - **Qui est joignable, et comment** : une seule personne de garde aujourd'hui ;
>   adresse et téléphone de contact à fixer (les mêmes que `lib/editeur.ts`).
> - **DPO ou référent** nommé dans les notifications (voir
>   [[Registre des traitements]]).
> - **Seuil de « risque élevé »** : la liste proposée (pièces d'identité,
>   revenus, coordonnées de locataires) est à confirmer par le conseil.
> - **Contrat de sous-traitance** : il devra reprendre l'engagement « information
>   sans délai » et le partage des rôles décrits ici.

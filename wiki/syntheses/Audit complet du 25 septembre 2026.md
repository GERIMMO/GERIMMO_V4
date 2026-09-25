---
type: synthesis
tags: [audit, production, console, supervision, point-du-matin, notifications, ergonomie, personas, ci]
status: stable
created: 2026-09-25
updated: 2026-09-25
sources: ["[[Design system Gerimmo]]", "[[Gerimmo en autonomie]]", "[[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]]", "[[Fonctionnalités par persona]]", "[[Modèle de rôles et permissions]]"]
---
# Audit complet du 25 septembre 2026

**En une phrase :** la veille du lancement, le porteur a demandé un audit
« extrêmement complet » de l'application telle qu'elle sort de sa nuit de
travail avec ChatGPT (douze fusions sur `main`, 122 fichiers), avec carte
blanche pour corriger. Cette page garde ce qui a été trouvé, ce qui a été
corrigé, et ce qui ne peut l'être que par lui.

**La demande, mot pour mot (résumée)** : détecter bugs, incohérences,
améliorations, problèmes d'affichage ; remettre en question boutons, menus,
informations, interactions. Deux objectifs : la **partie utilisateur se gère
seule au maximum** ; la **console du super administrateur** reçoit chaque
matin le point de plusieurs équipes d'agents, en montre le détail, permet de
valider ou refuser, donne le contrôle et la supervision sur toute
l'application et toutes les sessions — pour **une heure de travail par matin,
consacrée aux seules décisions importantes** (développement, accréditations).

ChatGPT annonçait « on peut publier » et laissait : crédits IA, signature en
production, sauvegardes réelles, informations légales, essais finaux des
prestataires ; publicité payante en attente des droits et du paiement Meta.
L'audit confirme cette liste et l'allonge (§ 4).

---

## 1. Méthode

Trois audits de code en lecture seule, menés en parallèle sur `main`
(`a4f215f`), puis un tour d'écrans par persona sur le banc local :

| Volet | Périmètre | Relevé |
|---|---|---|
| Console de supervision | `src/app/admin/**`, tâches planifiées, missions | 13 bugs · 14 incohérences · 9 écarts avec l'objectif · 22 améliorations |
| Espaces utilisateurs | agence, propriétaire direct, locataire, artisan, actions serveur | 9 bugs · 8 incohérences · 10 impasses ou gestes manuels évitables · 14 améliorations |
| Préparation à la production | sécurité, robustesse, conformité, configuration, avis Supabase | 43 points, dont 12 P1 |
| Écrans agence (agent + admin) | 56 écrans × 2 largeurs = 112 captures | 28 défauts uniques, 1 P1 |
| Écrans propriétaire + locataire | 32 écrans, 64 captures | 44 défauts uniques, 5 P1 |
| Écrans artisan + public + console | 46 écrans, 92 captures | 57 défauts uniques, 6 P1 |

Chaque écran a été jugé à la même aune que le 24/09 ([[Design system
Gerimmo]] : un seul bandeau, tout le carré se clique, pas de clic pour rien,
44 px au doigt, les mots du persona) et, pour la console, à l'aune de
l'objectif du porteur : *ce qu'on voit d'abord, ce qui coûte un clic, ce qui
est de l'information sans décision, ce qui manque pour décider*.

Les corrections ont été faites par lots de fichiers disjoints, chacun
vérifié (types, lint, tests unitaires, recaptures relues), puis commité sur la
branche de la PR #108.

---

## 2. Ce qui a été corrigé — dix lots

### Le point du matin (nouveau)

C'est la réponse au cœur de la demande. Chaque passage d'une mission
automatique laisse un **bilan structuré** ; à la fin de la nuit, un **point
daté par équipe** (sept équipes : exploitation locative, finance et
fiscalité, incidents et artisans, conformité et documents, marketing,
développement territorial, qualité et corrections) est enregistré dans
`points_du_matin`, avec ses **décisions** (`decisions_du_matin`) à valider ou
refuser. La page **« Aujourd'hui »** (`/admin/brief`) ouvre sur *ce qui
attend une décision* — points des équipes, santé bloquante, artisans à
valider, alertes critiques, demandes commerciales — chacun avec son bouton ;
puis les cartes d'équipes (« Dernier passage : … à l'heure de Paris · N
résultats · N échecs · N à valider ») qui mènent au détail
(`/admin/brief/[equipe]`) ; puis les jours précédents. Le badge « À décider »
de la barre haute, le menu, la vue d'ensemble et la page Aujourd'hui lisent
**un seul calcul** (`lib/decisions-attendues.ts`).

Migration `20260925120000_point_du_matin.sql` (tables, RPC
`enregistrer_point_du_matin`, `marquer_point_lu`, `decider_point_du_matin`,
colonne `agent_passages.bilan`, politiques super administrateur).

### La console, remise dans l'ordre

- Trois écrans revendiquaient le début de journée ; il n'en reste **un**. La
  vue d'ensemble renvoie vers Aujourd'hui, garde clients et organisations, et
  ne montre le bloc de mesure de l'autonomie qu'une fois. Un seul écran
  « Relais en mon absence ».
- **Santé du service** : chaque ligne rouge porte la commande qui la règle —
  « Lancer maintenant » pour une tâche (route cron), ou le **nom de la
  variable à poser et le prestataire** (Stripe, Resend, Yousign, Supabase,
  Vercel). Les missions non configurées (signatures, abonnements) consignent
  « non configurée — à vérifier » au lieu d'échouer en 503.
- **Mêmes missions, un seul nom** : table de libellés dans `lib/missions.ts`
  partagée par Santé, Équipes, journaux et accueil ; titre de page = entrée
  de menu partout.
- Éditeur d'article : « Enregistrer » garde un article paru **en ligne** ;
  « Passer en brouillon » et « Retirer du journal » deviennent secondaires,
  avec confirmation. Journaux avant règles de conservation ; purge en
  secondaire avec confirmation et compte. Une seule barre au téléphone.
- Heure de Paris partout (`lib/heure-paris.ts`) ; journaux filtrables et
  paginés ; « Lancer maintenant » remet l'état d'origine si l'atelier échoue ;
  l'orchestration des dossiers a sa propre tâche (05:45) et ne tourne plus
  deux fois dans les rappels.
- Marketing : « Noter une intention éditoriale » remplace un formulaire de
  campagne qui créait des lignes mortes ; « Publier automatiquement » est
  désactivé tant qu'aucune Page n'est reliée.

### Les notifications sortantes (nouveau `lib/notifications.ts`)

Les événements qui touchent un tiers envoient désormais un e-mail en marque
blanche : mission confiée, annulée ou refusée, devis reçu, créneaux à
choisir, créneau choisi ou contre-proposition du locataire, pièce demandée,
message, signature. Rappels J+2 / J+3 / J+7 tracés dans `tech_log`. Quand
c'est l'artisan ou le locataire qui agit, le destinataire est de l'autre côté
de la RLS : le client de service n'est utilisé qu'**après** que la RPC
métier a accepté l'écriture, ne remonte jamais dans la réponse, et
n'inscrit aucune adresse au journal (exception documentée en tête du
fichier ; alternative rejetée : une RPC *definer* aurait élargi durablement
ce que l'artisan peut lire).

### La production

En-têtes de sécurité et CSP (`upgrade-insecure-requests` seulement sur
Vercel : la CI et le banc servent la construction en http), webhook Stripe
sans en-tête de motif, échecs des tâches de nuit consignés avec leur détail
et rejoués visuellement après une heure, prestataires déclarés dans
`lib/editeur.ts` (Yousign, OpenAI, Meta ajoutés), page de confidentialité
alignée, export chiffré de sauvegarde (`scripts/sauvegarde/base.mjs`,
`docs/sauvegarde-et-restauration.md`).

### Les espaces utilisateurs

- **Alertes et actions du jour** : les doublons entre alertes et actions
  (impayé ↔ loyer impayé, assurance ↔ pièce, diagnostic) sont fusionnés ;
  l'accueil du propriétaire lit la **même source** que la pastille et la page
  Alertes ; le bandeau d'essai ne s'affiche que quand l'écriture est
  réellement fermée ; les montants d'abonnement viennent de l'état Stripe,
  plus de 5,99 en dur.
- **Agence** : un seul titre « Écritures & rapports de gestion » (agent et
  admin), et l'entrée de menu qui va avec ; les pièces rattachées à un bail
  ou à un diagnostic **par colonne** appartiennent au portefeuille du lot
  (migration `20260925130000_documents_portefeuille_bail_diagnostic.sql`,
  fonctions `document_dans_portefeuille` et `documents_courants` : l'agent
  titulaire voyait 1 document là où l'admin en voyait 4) ; « À faire » compte
  les baux en retard ; rangs avec flèche et détail non tronqué ; « ← Parent »
  au-dessus de l'en-tête ; vues à zéro masquées ; champs obligatoires étoilés.
- **Propriétaire et locataire** : un bien sans lot visible reste listé ;
  reçu et page Compte à la marque de l'émetteur quand le compte n'a que des
  adhésions locataire ; nouveau `ChampFichier` sur les cinq formulaires de
  dépôt ; la bulle d'aide quitte l'espace locataire (entrée « Aide et retours »
  dans la barre) ; attestation grisée jusqu'au mois soldé ; formulaire
  d'incident avec en-tête et retour ; pastille = étape de l'intervention.
- **Artisan** : agenda sur sept jours avec les rendez-vous fixés d'abord ;
  devis **sans taux de TVA par défaut** (choix obligatoire) et totaux
  affichés dès le départ ; fiche de mission qui dit quand il n'y a rien à
  faire ; zones photo masquées tant que la mission n'est pas démarrée ;
  compteurs nuls → « Pas encore mesuré » ; veille réglementaire dans la
  coquille artisan (`/artisan/regles`) ; la bulle d'aide ne recouvre plus un
  rang à action au téléphone.
- **Public** : mêmes mots aux deux largeurs, trois portes de création à la
  connexion (propriétaire, artisan, agence), lien direct quand un lien de
  réinitialisation est invalide, illustration de la carte « Incident »
  chargée d'emblée, grille du journal selon le nombre d'articles.

### Le bandeau photo de la nuit

Le bloc « un seul en-tête illustré par page » ajouté pendant la nuit
plaquait une photo et une boîte blanche sur chaque `.entete-page`, contre la
décision du 24/09 (le porteur : le bandeau photo « en trop »). Retiré ; les
accueils gardent leur bandeau.

**Compteurs de la journée** : 129 défauts d'écrans relevés, 12 P1 ; environ
110 corrigés (les 19 restants sont structurels, hors périmètre ou attendent
un fait ou une décision du porteur, § 4) ; 4 lots d'audit de code corrigés ;
2 migrations ; 1 781 tests unitaires ; suite navigateur complète rejouée sur
le banc.

---

## 3. Ce qui n'a pas été corrigé, et pourquoi

- **Faits légaux** (P1) : les mentions légales, la confidentialité et les CGU
  affichent 14 champs « à venir » (éditeur, médiateur, adresse de
  signalement, localisation de l'hébergeur d'e-mails). Ce sont des constantes
  dans `lib/editeur.ts` (`EDITEUR`) : **rien n'est inventé**, le porteur
  fournit les faits.
- **Suspendre une validation d'artisan** validée sans justificatif : aucune
  opération côté base ; l'écran signale l'incohérence, sans action.
- **Traversée bornée d'une organisation** (motif + 30 min) : n'existe que pour
  les artisans ; « Entrer dans son espace » reste sans motif ni durée.
- **Sélecteur de date maison** (champs `date`/`time` natifs en anglais sur
  un navigateur anglais) ; **scission du long formulaire de profil** ;
  fenêtre ou page pour le lot (décision) ; route `/admin/devis` à renommer.
- **Contrôle sur toutes les sessions utilisateurs** : seule la traversée
  artisan existe. Un vrai « voir comme » pour chaque compte est un chantier
  de sécurité à part (journalisé, borné, révocable).

---

## 4. Ce qui ne dépend que du porteur

> [!warning] À faire avant ou juste après la mise en ligne
> - **Migrations en production** : `20260925120000_point_du_matin` et
>   `20260925130000_documents_portefeuille_bail_diagnostic` — à appliquer via
>   l'outil MCP Supabase au moment de la fusion (non appliquées tant que la
>   PR n'est pas fusionnée).
> - **Faits légaux** : renseigner `EDITEUR` (raison sociale, forme, capital,
>   RCS, siège, directeur de publication, e-mail et téléphone, médiateur,
>   adresse de signalement) ; registre RGPD.
> - **Stripe en mode réel** : clés, webhook (`STRIPE_WEBHOOK_SECRET`),
>   tarifs ; **Resend** : domaine d'envoi avec SPF, DKIM, DMARC ; **Yousign**
>   production ; **OpenAI** : clé et crédits (l'aide à la décision du brief
>   s'affiche seulement si la clé est posée) ; **Meta** : droits et paiement
>   (la publicité payante n'est pas dans le code).
> - **Sauvegardes** : programmer l'export chiffré et lui donner une
>   destination externe ; tester une restauration.
> - **Données de développement en production** : 12 comptes et 3
>   organisations à purger ou à marquer.
> - **Vercel** : `NEXT_PUBLIC_SITE_URL` (liens des e-mails), `CRON_SECRET`,
>   9 à 10 tâches quotidiennes et `maxDuration` selon le plan ; variables de
>   la chaîne de publication contrôlée (`GERIMMO_RELEASE_ENABLED`,
>   `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `VERCEL_TOKEN`,
>   `VERCEL_AUTOMATION_BYPASS_SECRET`) et relecteurs d'environnement.
> - **Lire les erreurs d'exécution Vercel** : le connecteur Vercel a été
>   autorisé dans claude.ai mais n'est utilisable que dans une **nouvelle**
>   session.

---

## Relations

- [[Design system Gerimmo]] — les règles d'écran appliquées ; § 5 pour les
  points ouverts du 24/09.
- [[Gerimmo en autonomie]] — les cinq boucles que le point du matin rend
  visibles.
- [[Lancement dans 10 jours — ce qu'il reste à faire (20 septembre 2026)]] —
  la liste de départ, que cette page met à jour.
- [[Modèle de rôles et permissions]] — pourquoi le client de service reste
  cantonné à l'envoi des notifications.

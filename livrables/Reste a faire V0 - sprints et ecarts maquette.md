# Reste à faire V0 — sprints et écarts maquette

> Établi le **2026-08-26** à la demande de l'humain, à partir du
> [[Plan de livraison et sprints]], du journal de développement et d'une
> **comparaison écran par écran** entre la maquette de référence
> (`raw/maquettes/2026-08-23-gerimmo-prototype.html`) et l'application.
> Trois écarts avaient été repérés en recette : l'onglet « Mes documents »
> locataire, l'agenda agence, la section Documents agence — ils sont confirmés
> et replacés dans l'inventaire complet ci-dessous.

---

## 1. Où on en est

Développé et en recette : **S3 → S8 partiel**. Le S8 « partiel » couvre en
réalité l'essentiel : dépôt de garantie (encaissement, tiers payeur, écriture),
restitution complète (remise des clés, compteur 1/2 mois, imputabilité,
décote de vétusté, restitution intégrale sans EDL d'entrée, décompte figé,
solde de tout compte avec créance locataire) et copropriété (appel de charges
poste à poste, régularisation bloquée sans appel).

Reste pour la V0 : **la fin du S8, le S9a, le S9b**, plus les **écarts
maquette** listés en §5 — dont une partie relève de ces sprints et une partie
n'est couverte par aucun sprint du plan (à trancher, §6).

---

## 2. Sprint 8 — ce qui reste précisément

Au regard du plan, les items **sans scénario de recette et non retrouvés dans
le code** (à confirmer en planification de sprint) :

- **Caution formalisée** : dépôt de l'acte de caution (V0), **garanties
  externes Visale / GLI** comme objets suivis (aujourd'hui Visale n'est
  qu'une mention dans le formulaire de dépôt), **extinction de la garantie
  avec le bail** sans effacer la fiche du garant.
- **Alertes avant échéance du compteur de restitution** (le compteur et
  l'alerte d'envoi à la finalisation existent ; les alertes d'approche
  d'échéance restent à vérifier).
- **Provision de 20 % max** si une régularisation de charges est en attente
  au moment du décompte.
- **Relances du mandant qui tarde à transmettre l'appel de charges copro**
  (3 semaines, puis escalade).
- Côté maquette (voir §5) : le sous-onglet comptabilité **Impayés /
  Recouvrement** affiche les **délais GLI** (déclaration 60-90 j, « une
  déclaration tardive fait tomber la garantie ») — cohérent avec la caution
  externe du S8.

---

## 3. Sprint 9a — Propriétaire direct (le détail)

Décision du 19/08 : le PD est le cœur de l'appli, sprint dédié avant les
transverses. Personas : **PD** (naissance complète de son espace).

- **Auto-inscription en ligne** (remontée du S11) : page publique → compte +
  organisation `independent_owner` → **essai 14 jours**. Le paiement Stripe
  (2,50 €/bien/mois, 1ᵉʳ bien gratuit) reste au S11.
- **Espace PD complet** : parcours agent repris **sans** honoraires, mandats
  ni multi-agents ; « ses lots » remplacent « ses mandats ».
- **Livre recettes-dépenses** (sans honoraires), clôture recommandée mais
  jamais bloquante pour lui.
- **Récapitulatif fiscal** — aide à la déclaration des revenus locatifs,
  seul persona qui en bénéficie.
- Garde-fous : exclusivité PD/PM par personne (pas de parc mixte),
  `can_manage_organization()` limité à sa propre organisation.
- **La maquette a déjà son espace** (6 onglets : Mes lots · Locataires &
  baux · Incidents · Planning · Comptes rendus · Actualités + « Mes
  documents ») — le S9a a donc sa cible d'écrans.
- Terrain préparé : le rôle `proprietaire_direct` passe déjà par les mêmes
  écrans et fonctions que l'agence (vérifié en base), workflow incidents
  générique inclus.

**Démo cible : un PD s'inscrit seul, crée son bien, signe un bail, quittance
et sort son livre — autonome de bout en bout.**

## 4. Sprint 9b — Administration et transverses (le détail)

Personas : AA, SA (administrent) · AG (agenda, messagerie) · LO (messagerie).

- **Rôles V3 définitifs** : agent **limité à ses mandats**, transfert
  temporaire de portefeuille (sans changer le titulaire), désactivation
  bloquée tant que les mandats ne sont pas réaffectés ; AA = agent ++.
- **Paramétrage en 9 familles** : IRL, seuils de relance, grille de vétusté,
  équipements, catégories comptables, modèles… — IRL et seuil de délégation
  bloquants.
- **Agenda unique + alertes** : les ~27 types d'alertes branchés au fil des
  sprints, consolidés dans un agenda ; escalade nominative ; seuils légaux
  maintenus par le SA. → C'est ici que se rattache l'**Agenda maquette**
  (calendrier mensuel, filtres par nature, prochaines échéances — §5).
- **Messagerie interne** : toute conversation **rattachée à un objet** (bail,
  incident, lot), le locataire peut ouvrir, fil à trois sur incident,
  traçage des échanges qui engagent, archivage avec le bail. → l'onglet
  **Messages** de la maquette.
- **Vue scindée du bien** : sélection → détail à droite, non concerné
  assombri (le motif existe déjà sur les incidents).
- **Console SA (essentiel)** : création d'agence et de tout profil (PD
  compris), indicateurs, files d'attente (modèles, contestations),
  suspension lecture seule / archivage.

**Démo cible : une journée type d'agence.**

---

## 5. Écarts maquette ↔ application (inventaire du 26/08)

Chaque écart est rattaché à un sprint du plan quand il en relève, ou marqué
**[hors plan]** quand aucun sprint ne le couvre (décision à prendre, §6).

### 5.1 Espace locataire

| Écart | Détail maquette | Rattachement |
|---|---|---|
| **Onglet « Mes documents » — MANQUANT** | Tableau des 5 dernières pièces (bail signé, quittance, EDL, annexe, garantie) : nom, type, date, actions **Ouvrir / Télécharger / Me l'envoyer par e-mail** | **Chantier V0 à planifier** (aucun sprint dédié) |
| **Attestations d'assurance : une seule visible** | L'app n'affiche que la dernière déposée : dès qu'un renouvellement est déposé, **l'attestation validée encore valide disparaît**. Attendu : voir la dernière **validée** ET celle **en cours de vérification**, et pouvoir consulter les fichiers | Même chantier — « Mes documents » est l'emplacement naturel |
| Onglet « Mes rendez-vous » — MANQUANT | Cartes de RDV d'intervention : date, catégorie, heure · lot, artisan, statut | S9b (agenda) — les créneaux eux-mêmes : S13 (module devis-artisans) |
| Onglet « Conseils » (articles) — MANQUANT | Articles éditoriaux poussés par le réseau | **[hors plan]** (éditorial) |
| « Donner mon préavis » + ligne « Préavis si je pars — 1 mois (zone tendue) » — MANQUANTS | Bouton dans la carte Mon bail | Chantier V0 (le congé locataire existe côté agence depuis le S4) |
| Accroche + bot WhatsApp — MANQUANTS | Carte en tête de Mon logement, bot complet (documents, créneaux, notation) | **S12** (V1) |
| Choix de créneau (3 propositions), notation artisan 1-5★, « Voir les échanges » sur Mes demandes — MANQUANTS | Blocs de la carte demande | S13 (créneaux), S14 (notation), S9b (messagerie) |
| « Mes loyers » en onglet | L'app l'a ajouté (validé en recette) ; la maquette met « Mes quittances » dans la carte Mon bail | Écart assumé, acté en recette |

### 5.2 Espace agence

| Écart | Détail maquette | Rattachement |
|---|---|---|
| **Onglet « Agenda » — MANQUANT** | Calendrier mensuel (‹ › Aujourd'hui), pastilles colorées par jour, clic → fiche liée, modale « N événements », **filtres à puces par nature** (Interventions · Fins de bail · Documents officiels · Versements · Échéances de mandats), colonne « Prochaines échéances » (6). Agrège RDV d'intervention, fins de bail, échéances de documents, versements aux mandants, échéances de mandats. Seule survivance dans l'app : la carte « Cette semaine » du tableau de bord | **S9b** (agenda unique) |
| Onglet « Messages » — MANQUANT | Vue scindée conversations / fil, réponse, rattachement aux objets | **S9b** (messagerie) |
| **Section « Documents » — DIFFÉRENTE** | Maquette : **maître-détail** (liste à gauche, vue d'ensemble ou détail à droite) ; vue d'ensemble = doctrine « pas de dossiers », carte rouge **« Pièces à renouveler »**, carte **« Par type »** (barre proportionnelle + types cliquables comme filtres) ; **page de détail d'une pièce** : aperçu du document, rattachements multiples (lot/bail/personne/bien) + « Rattacher à une autre fiche », cycle de vie (type / conservation / **« Visible par »**), **Télécharger / Remplacer** (historique conservé) ; dépôt via **assistant guidé** (le type pilote conservation et visibilité). L'app : grille simple + formulaire plat, actions Consulter/Télécharger seulement, pas de page de détail, pas de conservation affichée, rattachements personne uniquement | **Chantier V0 à planifier** (la GED fonctionnelle date du S1 ; l'écran maquette est plus riche) |
| Comptabilité sans sous-onglets | Maquette : **Écritures / Propriétaires mandants / Impayés / Rapports et décomptes**. Manquent : compte mandant par mandant (solde, mouvements, puce Provisionné/À découvert), vue Impayés-recouvrement (donut créances, délais J+8 / J+30 / GLI 60-90 j, fiche créance), groupe Rapports et décomptes avec puces À envoyer/Envoyé/Versé | S6 est développé (journal, rapport) — la **présentation maquette** est un chantier V0 ; les délais GLI touchent la fin du S8 |
| Parc sans sous-onglets Lots/Biens | + barre de **complétude par lot**, KPI filtrants, carte « Éléments à compléter », panneau latéral de lot, écran « Compléter le lot », sous-vue Interventions | Chantier V0 (présentation) ; Interventions : S13 |
| Réglages de l'espace (⚙) — MANQUANT | Utilisateurs & rôles (dernière connexion, Actif/Invité), « Inviter quelqu'un », matrice « ce que chaque rôle peut faire » | **S9b** (rôles) |
| **Administration agence (8 sous-onglets) — MANQUANTE en totalité** | Pilotage (SLA, charge par agent, rentabilité du mandat) · **Conformité et registres** (carte pro T, garantie financière, RCP avec échéances, **registre des mandats loi Hoguet**) · Fonds mandants · Abonnement · Modèles · Éditorial · Équipe · Journal d'audit | S9b (équipe, journal, paramètres), S11 (abonnement), **[hors plan]** : pilotage avancé, conformité/registres, éditorial |
| Recherche globale ⌘K — MANQUANTE | Overlay lot/personne/bail… | **[hors plan]** (confort transverse) |
| Assistants guidés (bien, bail, personne, document) | Parcours multi-étapes avec récapitulatif vivant ; l'app a des formulaires plats | Chantier V0 (présentation) — l'assistant bail 2 étapes existe déjà en partie |
| Tableau de bord : carte « À lire », lien « Tout le planning › » | Articles + accès agenda | S9b (agenda) / [hors plan] (éditorial) |
| Détails de charte | Couleur d'accent par section, badge incidents ambre (l'app : rouge), menu compte avec avatar | Passe transverse T.1 / à arbitrer |

### 5.3 Autres espaces (rappel)

- **Espace propriétaire bailleur** : absent — **S9a** (maquette prête, 6 onglets).
- **Espace artisan** : absent — **S13** (module devis-artisans ; la maquette
  montre aussi « Mes documents » artisan avec attestation débloquant les devis).
- **Console SA** : partielle (`/admin` : agences, journaux) — S9b pour
  l'essentiel ; Modèles/Éditorial/Règles du réseau **[hors plan]** en partie.

---

## 5 bis. Sprint « Alertes & documents » (créé le 29/08 — à prioriser, non développé)

> Sprint créé pour regrouper les demandes alertes/documents ; ordre à fixer
> par rapport à S9a/S9b (voir [[Plan de livraison et sprints]]). **Revient sur une partie de la
> livraison du 29/08** (bouton « Valider », EDL d'entrée en prérequis) — à
> arbitrer en début de sprint.

**Fiche bail — plus de bouton « Valider »** ; deux conditions vérifiées
automatiquement :
- **Bail signé déposé** ⇒ le bail passe **actif** et le lot passe **loué**
  immédiatement (l'état du bien change au dépôt, plus d'action séparée). Les
  contrôles de mise en location (détention 100 %, diagnostics, un seul bail en
  cours sur le lot, plafond du dépôt) s'appliquent au moment du dépôt.
- **EDL d'entrée non signé** ⇒ **alerte automatique**, liée au bail (origine =
  bail), qui se ferme d'elle-même à la signature de l'EDL d'entrée (mécanique
  livrée le 29/08 : [[Agenda et échéances]]).

**Section Bail › Bail signé — prévisualisation et envoi** :
- **Prévisualiser** le bail → ouverture dans une **modale** (composant Modale
  unique) avec deux actions : **Envoyer** ou **Corriger**.
- **Envoyer** ⇒ envoi au **locataire renseigné** sur le bail (canal à préciser :
  email — SMTP/Resend encore à configurer — ou espace locataire « Mes
  documents »).
- **Corriger** ⇒ retour au brouillon éditable.

**Autres éléments regroupés dans ce sprint** :
- Alertes : dédoublonnage des crons diagnostics/assurance (filtre de statut),
  alertes d'approche du compteur de restitution (§ 2), vue « traitées » enrichie.
- Documents : règlement de copropriété dans « Mes documents » du locataire ;
  règle de conservation du règlement (hypothèse « fin du bail + 60 mois ») à
  confirmer ; pièces du bail exposées au locataire.
- **Interface : suppression de la cloche de l'en-tête** (demande du 30/08) —
  doublon de l'entrée « Alertes » du menu avec son badge. Conserver la pop-up de
  synthèse à la connexion ; vérifier que « Mes espaces » (multi-agences) et la
  console SA, qui n'ont pas de menu Alertes, gardent un point d'accès aux alertes.
  Scénarios à reprendre : Recette Sprint 2 (1.3, 2.1, 2.2), Recette S3-S8 (§1),
  Recette S7, Recette par sprint et persona (« cloche inchangée »).

Points à trancher au cadrage : ce qui est prévisualisé (PDF déposé ou bail
généré depuis le modèle — génération prévue en V1, S10 Yousign) ; sort de la
règle « sans EDL d'entrée, aucune retenue » (reste vraie côté restitution) ;
reprise des tests et scénarios 29.1 qui décrivent le bouton « Valider ».

## 6. Synthèse — le vrai périmètre restant de la V0

1. **Fin du Sprint 8** : caution et garanties externes (Visale/GLI),
   alertes de compteur, provision 20 %, relances copro (§2).
2. **Sprint 9a** : espace propriétaire direct complet (§3).
3. **Sprint 9b** : rôles, paramétrage, **agenda** (écart maquette n°1 agence),
   **messagerie**, réglages, console SA (§4).
4. **Chantiers maquette V0 sans sprint attitré — à planifier** (proposition :
   les intégrer à la planification de la fin du S8 et du S9b, ou en passe
   dédiée avant la Recette V0) :
   - **« Mes documents » locataire** + visibilité des deux attestations
     (validée + en cours) — remonté en recette le 26/08 ;
   - **Documents agence** au niveau de la maquette (maître-détail, pièces à
     renouveler, par type, détail de pièce, Remplacer, visibilité) ;
   - sous-onglets Comptabilité (mandants, impayés, rapports) et Parc
     (Lots/Biens, complétude) ;
   - « Donner mon préavis » côté locataire ;
   - assistants guidés ; recherche globale ⌘K (optionnelle).
5. **Décisions à prendre** (maquetté mais couvert par aucun sprint du plan) :
   pilotage avancé et **conformité/registres** de l'administration agence
   (carte T, garantie financière, RCP, registre des mandats), volet
   **éditorial/articles** (agence + locataire + réseau), rentabilité du
   mandat. À trancher : V0, V1 ou abandon.

> [!warning] Points à trancher
> - Les items « hors plan » du §5 viennent de la maquette du 23/08 mais ne
>   figurent dans aucun sprint du [[Plan de livraison et sprints]] — le plan
>   ou la maquette doit être ajusté(e).
> - La visibilité « deux attestations » (validée + en cours) n'est pas non
>   plus explicitement dans la maquette : c'est un besoin exprimé en recette
>   le 26/08, l'onglet « Mes documents » en est l'emplacement naturel.

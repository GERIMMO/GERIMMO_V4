---
type: synthesis
tags: [audit, acquisition, strategie, fonctionnel, design, technique, juridique]
status: stable
created: 2026-10-03
updated: 2026-10-03
sources: []
---

# Audit d'acquisition du 3 octobre 2026

Posture demandée par le porteur : **un acquéreur qui veut gagner de l'argent vite**
et qui regarde Gerimmo pour l'acheter, le plus critique possible, sans rien corriger.
Lecture seule du dépôt (code `app/`, wiki, journal), des captures d'écran de recette
(bureau et mobile, six profils) et de la production (comptes purgés le 1er octobre).
Trois relevés spécialisés (produit, technique, commercial-juridique) ont été fusionnés
ici ; leurs affirmations ont été recoupées dans le code. Ce qui ne vient pas du dépôt
est signalé **[hors dépôt]**.

Échelle : **rédhibitoire** (bloque l'achat ou l'exploitation) · **fort** (fait baisser
le prix) · **moyen** (à budgéter) · **faible** (détail).

## 1. Verdict en une page

**Ce qu'on achète.** Un socle logiciel de 97 000 lignes TypeScript et 43 000 lignes SQL,
278 migrations, 2 045 tests dont 763 jouant réellement les droits en base, une CI verte
en neuf minutes, une sauvegarde chiffrée quotidienne restaurée une fois, 55 modèles de
documents conformes, une charte sobre et cohérente, zéro violation d'accessibilité
automatisée, un wiki métier de 300 entrées. Un cycle incident → devis → créneaux →
intervention réellement abouti.

**Ce qu'on n'achète pas.** Un client. Un euro de revenu. Une équipe. Une identité
légale. Une preuve de performance. Un seul des six standards qui font vendre une
gestion locative en France (encaissement en ligne, signature probante, mise en
location, état des lieux avec photos, comptabilité de gérance, inscription agence en
libre-service).

**Lecture d'acquéreur.** Gerimmo est un actif technologique à relancer, pas un SaaS en
exploitation. Le revenu théorique de la grille actuelle pour 120 clients (100
propriétaires à deux biens, 20 agences à 25 lots) est d'environ 2 400 € par mois. Le
produit a été écrit en dix semaines par une personne pilotant des agents IA ; personne
d'autre ne l'a jamais lu. Toute valorisation repose sur le code et la connaissance,
avec une dépendance totale au porteur.

## 2. Les cinq rédhibitoires

| # | Constat | Preuve | Pourquoi ça bloque |
|---|---|---|---|
| 1 | **Éditeur anonyme.** Dénomination, forme, siège, RCS, SIRET, directeur de publication, e-mail, téléphone, médiateur : tous `null`. Les pages légales affichent « (à venir) » et un bandeau rouge « Document en cours de finalisation ». | `src/lib/editeur.ts` l. 20-42 ; `coquille-legale.tsx` | Site marchand sans mentions légales (LCEN), pas de médiateur, pas de rétractation exerçable, pas de contact RGPD. Aucun contrat consommateur solidement formé. Coût de régularisation faible, mais tant que ce n'est pas fait, rien n'est vendable. |
| 2 | **Zéro client, zéro revenu, zéro mesure.** Comptes de test purgés le 1er octobre ; deux abonnements Stripe ayant existé, tous deux des testeurs, annulés. Aucun analytics sur le site. Essai de deux mois sans carte : premier euro possible en décembre 2026. | `log.md`, `layout.tsx` (aucun traceur) | Pas de traction, pas de courbe, pas de taux de conversion : impossible de valoriser autrement qu'au coût de reconstruction. |
| 3 | **Pas d'encaissement en ligne, pas de rapprochement bancaire.** Le locataire copie un IBAN ; le gérant saisit chaque paiement à la main. Pas de SEPA, pas de carte, pas d'open banking. | `locataire/[orgId]/loyers/page.tsx` l. 35-43 ; `actions/loyers.ts` | C'est la fonction pour laquelle une agence paie un logiciel. Sans elle, Gerimmo est un second outil, jamais le premier. |
| 4 | **Aucune mise en location.** Pas d'annonce, pas de multidiffusion, pas de gestion de candidatures, pas de DossierFacile. La table `annonces` est un panneau d'affichage d'immeuble. | `actions/annonces.ts` l. 13-15 | Le cycle de vie d'un lot commence avant le bail ; Gerimmo commence après. |
| 5 | **Croissance bornée par un humain.** Une agence ne peut pas s'inscrire (« écrivez-nous ») ; chaque artisan est validé à la main ; le réseau d'artisans est fermé commune par commune et métier par métier, ouvert à la main par le super admin. | `inscription/page.tsx` l. 20-21 ; `tarifs/page.tsx` l. 70 ; `actions/reseau.ts` l. 94-115 | Le segment le plus rentable (agences) n'a pas de libre-service ; l'argument « réseau » est vide partout où le porteur n'est pas passé. |

Ajout à la même hauteur, par ricochet : **facteur bus égal à un**. Un humain, 141
commits signés par un agent IA sur 276, 92 branches d'un second agent, environ 10 000
lignes par semaine. Le repreneur achète un code qu'une seule personne sait *piloter*,
pas qu'une équipe sait *lire*.

## 3. Fonctionnel : ce que le produit fait vraiment

### 3.1 La carte par persona

150 routes : agent 29, admin d'agence 29, super admin 27, propriétaire 20, public 18,
artisan 15, locataire 12. La console de l'éditeur est plus riche que l'espace du
locataire : le produit a été construit pour son éditeur autant que pour ses clients.

| Fonction | État réel | Niveau |
|---|---|---|
| Signature électronique | Adaptateur Yousign écrit mais **désactivé** ; circuit « télécharger, signer à la main, redéposer ». Aucune valeur probante tierce. | fort |
| Comptabilité | Journal de caisse déclaratif, export **CSV** (« pas de FEC » écrit dans le code). Pas de grand livre, pas de TVA sur honoraires, pas de compte mandant, pas de reddition comptable. Les CGU l'assument. | fort |
| Fiscalité | Récapitulatif 2044 (nu) seulement ; meublé/BIC et SCI à l'IS hors produit. | moyen |
| Régularisation des charges | Formulaire existant, mais le solde n'est ni appelé ni remboursé ; mensualités d'étalement enregistrées, jamais appelées. Demi-fonction. | fort |
| Révision IRL | Contrôle de trimestre et non-rétroactivité, mais pas de table d'indices historisée côté gestion ; l'automatisation Insee ne sert que l'outil public. | moyen |
| États des lieux | Grille web pièce par pièce, brouillon local, **aucune photo** (zéro occurrence dans le dossier `edl`). Signature = PDF signé déposé. | fort |
| Relances et contentieux | Deux niveaux d'e-mail, **désactivés par défaut**. Mise en demeure hors outil ; aucun plan d'apurement, aucun suivi de procédure. | fort |
| GLI / Visale | Absents de la gestion (un comparateur public gratuit, une phrase dans un formulaire). | moyen |
| Candidatures | Aucune ; le dossier commence avec le locataire déjà retenu. | fort |
| Colocation, bail meublé | Faits (bail commun + contrats individuels, quote-parts, solidarité). | faible |
| Multi-utilisateurs | Deux rôles (admin, agent) et un cloisonnement par portefeuille. Pas de rôle comptable ni lecture seule. Le propriétaire mandant d'une agence **n'a aucun accès**. | moyen |
| API, intégrations | Aucune API publique ; 25 routes internes (cron, webhooks). Aucun connecteur comptable, bancaire ou portail. | fort |
| Mobile | Pas d'application, pas de PWA (aucun `manifest`). Site responsive seulement. | moyen |
| Notifications | E-mail seul (Resend, sans file ni réessai). Ni push, ni SMS, ni WhatsApp, ni Telegram, alors que l'[[Analyse concurrentielle]] du wiki présente les « bots » comme l'unicité de Gerimmo : zéro occurrence dans le code. | fort |
| Génération de documents | **Point fort réel** : 55 modèles (bail nu/meublé, caution, quittance, mandat, décompte, facture d'honoraires). | — |
| Incident → artisan | **Point fort réel** : deux devis maximum, créneaux proposés, compte rendu et photo de chantier, score artisan. | — |

Les tableaux du wiki qui cochent « bots » et « relances/mise en demeure » sont en avance
sur le code. Le référentiel officiel (audit du cahier maître du 20/09) compte sur 100
sections : 67 partielles, 18 absentes, 7 appliquées.

### 3.2 L'entrée dans le produit

**Propriétaire direct** : inscription à 13 champs, puis identité de l'organisation, bien à
12 champs, lot avec **détention à 100 % exactement**, **DPE obligatoire**, **ERP de
moins de six mois**, aucun diagnostic expiré, fiche locataire, bail dont les mentions
sont exigées à l'activation, puis premier appel de loyer et encaissement saisi à la
main. Environ sept écrans, quarante saisies et deux documents à posséder avant la
première valeur. Pour un particulier qui veut « rentrer son locataire en place », le
DPE bloquant est une porte fermée (**fort**).

**Agence** : pas d'auto-inscription ; ouverture par le super admin ; propriétaire mandant
puis mandat avec date d'effet obligatoire avant toute location ou encaissement ; même
chemin ensuite. Neuf écrans et un humain dans la boucle (**rédhibitoire** pour un
modèle en libre-service).

**La recette le confirme** : premier testeur propriétaire bloqué sur des mentions sans
formulaire (corrigé le 1er octobre), testeur artisan perdant ses métiers cochés et ne
pouvant saisir un département (corrigé le 2), règle « un fichier = un dépôt »
produisant cinq blocages et des fichiers orphelins à données personnelles
([[Audit des refus de doublon du 2 octobre 2026]]). Le document de corrections du 30/09
dit lui-même que « les parcours complets après activation, la réception dans les boîtes
e-mail et le paiement bancaire restent à tester ». **Le produit n'a jamais été traversé
de bout en bout par un vrai client.**

### 3.3 Le réseau d'artisans : atout ou distraction ?

Aucune commission, aucun abonnement artisan, aucun paiement : chiffre d'affaires
généré, 0 €. L'artisan est un coût (validation manuelle, score, analyse d'impact RGPD à
produire) sans revenu. Le réseau est fermé par défaut sur 35 000 communes ; le gérant
ne peut que « signaler son intérêt ». Le carnet personnel d'artisans que chaque gérant
saisit lui-même rend le réseau superflu au quotidien. En parallèle, un tiers de l'effort
est allé dans l'auto-pilotage de l'éditeur (27 routes de console, veille réglementaire
par IA, publications Facebook automatiques, « brief du matin », « expansion
territoriale ») plutôt que dans les standards manquants. Verdict : **distraction, monétisable
seulement avec un modèle qui n'est pas construit** (commission sur devis accepté,
abonnement artisan, lead payant).

### 3.4 Les dix manques qui coûtent le plus de clients

1. Pas d'encaissement en ligne ni de rapprochement bancaire (rédhibitoire agences).
2. Signature électronique désactivée ; circuit papier-scan (fort).
3. Aucune mise en location : annonces, multidiffusion, candidatures (rédhibitoire agences).
4. Pas de comptabilité de gérance, de reddition, de FEC, de TVA sur honoraires (fort).
5. Agence non self-service, artisans et réseau ouverts à la main (rédhibitoire croissance).
6. État des lieux sans photo, sans application, brouillon volatil (fort).
7. Entrée bloquée par DPE, ERP, détention 100 % et mentions avant toute valeur (fort).
8. Régularisation de charges non soldée, étalement non appelé (fort).
9. Pas de contentieux : mise en demeure, apurement, GLI, Visale (moyen à fort).
10. Ni mobile, ni push, ni WhatsApp, ni API : l'argument « terrain » du cycle incident tombe (moyen).

## 4. Esthétique et expérience : ce que montrent les écrans

Captures de recette des 24 au 27 septembre (mobile 390 px et bureau 1 280 px, six
profils), captures de production du 1er et 2 octobre. Les points positifs d'abord,
pour être juste : une charte unique (bleu de marque, encre marine, crème, Manrope pour
les titres, Figtree pour l'interface), aucune page qui déborde horizontalement, zéro
violation d'accessibilité automatisée, des états vides rédigés, une navigation basse
mobile à cinq entrées, des pastilles d'état lisibles, un français propre.

### 4.1 Identité visuelle : propre, interchangeable

- **Un look « banque en ligne » sans signature.** Bleu électrique sur fond crème, cartes
  blanches à grand rayon, ombres douces, rail de couleur à gauche de chaque carte,
  libellés en capitales espacées. C'est exactement la grammaire que produit un générateur
  d'interface en 2026 ; rien n'y dit « immobilier », rien n'y dit « Gerimmo » hormis le
  logo maison-clé. **Fort** pour une marque qui doit exister seule face à Rentila,
  Smartloc ou Hektor.
- **Illustrations générées par IA, photo de stock dans le bandeau du tableau de bord
  agence.** Le bandeau « Bonjour » occupe 180 px de hauteur pour un immeuble
  haussmannien flouté et une phrase générique (« 3 éléments nécessitent votre
  attention »), sans le prénom de la personne. **Moyen**.
- **Image de partage sociale = logo carré.** Aucun visuel de marque pour les liens
  partagés. **Faible**.
- **Pas de mode sombre** (aucun `prefers-color-scheme` dans la charte), alors que tous
  les concurrents mobiles l'offrent. **Faible**.

### 4.2 Le site vitrine : long, dense, pour quatre publics

- **Page d'accueil de 20 900 px de haut sur mobile**, soit une cinquantaine d'écrans à
  faire défiler. Héros, outils gratuits, trois espaces, réseau d'artisans, journal, FAQ,
  tarifs : tout y est, donc rien n'y est mis en avant. **Fort**.
- **Quatre cibles sur la même page** (bailleur, locataire, agence, artisan) dont deux ne
  paient jamais. Le héros « Le sérieux d'une agence, sans les honoraires » parle au
  particulier ; la carte de tarifs d'à côté parle à l'agence. **Fort**.
- **La page Tarifs est une grille de tarifs, pas une offre.** Deux cartes, deux tableaux
  (cinq formules plus une ligne « au-delà de 20 », quatre tranches cumulatives plus un
  exemple de calcul à six termes). Un prospect doit calculer. **Moyen**.
- **Aucune preuve sociale**, par politique assumée (« nous n'en avons pas à montrer »).
  Honnête, mais une page de vente sans client, sans logo, sans chiffre. **Fort**.
- **Inscription en treize champs** sur un seul écran, six marqués « (facultatif) »
  avant même l'e-mail et le mot de passe ; sous la case CGU, un avertissement juridique
  (« il ne remplace pas votre relevé bancaire ») au moment précis de la conversion.
  **Moyen**.

### 4.3 L'espace agence : un produit qui s'explique au lieu de se comprendre

- **Chaque page s'ouvre par un paragraphe d'explication.** « Le journal des
  encaissements et des dépenses de l'agence. Une écriture ne se modifie pas : on
  l'annule par une écriture d'annulation… » ; « Le suivi chiffré des incidents : délais,
  qui paie, lots qui reviennent… » ; « Une alerte critique non traitée sous 7 jours
  remonte au… ». Quand l'interface doit se justifier à chaque écran, c'est que la
  structure ne porte pas le sens. Sur mobile, ce texte repousse le contenu utile sous
  le pli. **Fort**.
- **Pages interminables sur mobile** : Écritures 6 800 px, État des lieux 12 000 px,
  Nouveau bien 3 200 px, Alertes 3 900 px. Le formulaire de saisie d'une écriture (huit
  champs) vit sur la même page que le journal et ses totaux. **Fort**.
- **Titres de page trop grands pour l'écran** : « Écritures & rapports de gestion » en
  44 px sur deux lignes, suivi d'un libellé en capitales, d'un filet, puis du texte. Trois
  niveaux de décor avant la première donnée. **Moyen**.
- **Le tic des capitales espacées** : « SEPTEMBRE 2026 OUVERT », « 4 FICHES », « 2 À
  TRAITER », « RÉSOLUS SOUS 15 JOURS », « 1/42 · 41 SANS ÉTAT ». Utilisé pour tout, il ne
  hiérarchise plus rien. **Faible**.
- **Alertes contradictoires** : la page affiche « 2 à traiter », deux cartes rouge et
  ambre « à débloquer sur les baux », puis juste dessous une grande carte vide en
  pointillés « Aucune alerte ouverte ». Deux taxonomies (blocages de bail, alertes)
  cohabitent sans que l'écran choisisse. **Fort**.
- **Statistiques faites de vide** : trois tuiles « Pas encore mesurable », « 2 · 100 % »,
  « 1 sur 1 lot signalé ». La page existe avant d'avoir quelque chose à dire ; un
  acquéreur y lit l'absence d'usage. **Moyen**.
- **État des lieux : 42 lignes de sélecteur + commentaire, trois boutons
  d'enregistrement** (« Enregistrer les mentions », « Enregistrer la grille »,
  « Enregistrer et signer »), cinq mentions obligatoires avant la grille, aucune photo,
  aucun geste tactile (balayage, appareil photo). C'est un formulaire de bureau rendu
  sur téléphone, pour l'usage le plus « terrain » du produit. **Fort**.
- **Nouveau bien : un seul long formulaire** avec « Année de construction », « Parties
  communes » et « Accès TIC » obligatoires dès le premier bien, aides en placeholder, pas
  d'étapes. Le porteur a lui-même apporté dix maquettes d'un assistant en sept étapes :
  l'écart entre l'ambition et l'existant est visible. **Fort**.
- **Tableau de bord bureau** : correct (tuiles d'indicateurs, liste « à traiter » avec
  rail de gravité, flux « ce qui vient de se passer »). Mais « Lots en préparation »
  liste deux fois « Lot unique · Propriétaire mandant non rattaché » sans dire de quel
  bien il s'agit, et les pastilles de compteur passent du rouge (Alertes) au bleu (Menu)
  pour la même sémantique. **Moyen**.
- **Fiches Personnes** : la liste est bonne (initiales, pastille de rôle, filtre), mais
  le sous-titre par défaut est un reproche : « Sans email ni téléphone ». **Faible**.

### 4.4 Locataire, propriétaire, artisan : trois langages pour un produit

- **Trois patrons de navigation basse** : icône remplie dans une pastille bleue (agence,
  propriétaire), indicateur bleu au-dessus de l'onglet (artisan), compteurs tantôt
  rouges tantôt bleus tantôt orange. Un même utilisateur qui est bailleur et artisan
  change de produit en changeant d'espace. **Moyen**.
- **Marque blanche sans marque** : l'espace locataire affiche « Agence Alpha » en texte
  brut, sans logo, sans couleur d'agence. Le client de l'agence voit une page grise qui
  n'est ni Gerimmo ni son agence. **Moyen**.
- **Locataire : des cartes de réassurance plutôt que des actions.** « Après paiement
  intégral, votre quittance est établie et disponible ici, rien à demander » ; « Vos
  quittances et reçus restent consultables ici tant que votre espace est ouvert… ». Le
  seul geste possible est de copier un IBAN. La date d'expiration de l'assurance s'affiche
  en `mm/dd/yyyy` dans la capture (champ natif, dépendant du navigateur). **Moyen**.
- **Artisan : les actions principales sont des liens soulignés** (« Je démarre
  l'intervention », « Proposer d'autres créneaux », « Ouvrir l'itinéraire »), avec une
  phrase d'avertissement entre les deux ; la hiérarchie bouton/lien du reste du produit
  disparaît. **Moyen**.
- **Propriétaire : abonnement lisible**, mais la page « Mon abonnement » explique le prix
  en trois paragraphes et la capture montre encore « 1er bien offert, à vie » (grille
  antérieure au 28/09) : le discours tarifaire a changé trois fois en deux mois et les
  écrans en gardent des traces. **Faible**.

### 4.5 La console de l'éditeur : un récit de soi

Treize entrées de menu pour un opérateur unique ; un bandeau orange « Le service n'est
pas prêt : 20 points bloquent » sur sa propre page d'accueil ; six tuiles « 0 » sous un
titre « Ce que Gerimmo automatise » et un badge « 0 % des actions suivies » ; des
cartes « Agent exploitation locative », « Agent incidents et artisans », « Agent finance »
avec « Travail réalisé / Prochaine action / Votre décision ». C'est un tableau de bord
qui raconte une organisation autonome qui n'existe pas. Un acquéreur y voit du temps
de développement détourné du produit payant. **Fort**.

### 4.6 Synthèse esthétique

La charte est tenue, l'accessibilité est propre, le mobile ne casse pas : c'est au-dessus
de la moyenne des prototypes. Mais l'interface est **verbeuse, longue, générique et
sans geste**. Elle a été dessinée pour être exacte, pas pour être rapide. Un gérant qui
fait quarante quittances par mois et un locataire qui veut payer en trente secondes
n'y trouvent ni l'un ni l'autre leur geste principal. Le coût de refonte pour atteindre
le niveau d'un Rentila ou d'un Smartloc **[hors dépôt]** se compte en mois de design,
pas en semaines.

## 5. Technique : solide à lire, difficile à reprendre

| Constat | Preuve | Niveau |
|---|---|---|
| **Logique métier à ~70 % en PL/pgSQL** : 21 600 lignes de corps de fonctions, 810 définitions, 752 `security definer`, 274 fonctions appelées depuis le TypeScript. Le front est une couche de présentation. `enregistrer_conge` redéfinie 13 fois, `activer_bail` 8 fois. | migrations | moyen |
| **Verrouillage Supabase total** : 254 policies, 108 tables sous RLS, `auth.uid()` au cœur des droits, Storage, templates d'auth. Un émulateur maison de 976 lignes a dû être écrit pour tester. Quitter Supabase = réécrire l'autorisation. | `e2e/local/serveur-supabase-local.mjs` | fort |
| **Dépôt de migrations non rejouable en production** : horodatages renommés, application par liste de fichiers saisie à la main, procédure hors séquence. Deux canaux d'application coexistent dans la doc. | `.github/workflows/migrations.yml` (en-tête) ; `supabase/procedures/` | fort |
| **Réouverture silencieuse des fonctions à `anon`** : incident survenu deux fois en production ; la protection est un test et une fonction à appeler à la main en fin de migration. Un oubli = fuite. | `tests/aucune-fonction-ouverte-a-anon.test.ts` | fort |
| **PDF par Chromium serverless** dans des crons de 60 s, boucle jusqu'à 200 documents par passe. Ne tiendra pas à l'échelle ; coût de calcul par quittance. | `src/lib/documents/rendu.ts` ; `cron/quittances/route.ts` | fort |
| **Aucune supervision externe** : zéro Sentry, zéro OpenTelemetry, aucun moniteur. L'alerte, c'est l'humain qui lit la page Santé le matin. E-mails sans file ni réessai. | `src/lib/email.ts` ; `/api/sante` | fort |
| **Aucune preuve de performance applicative** : un seul banc (300 lots) en SQL brut, résultats non consignés, aucun seuil asserté, zéro cache côté Next (344 `revalidatePath`, 0 `unstable_cache`), 15 à 20 aller-retours par page. | `scripts/recette/charge-300-lots.mjs` | fort |
| **Déploiement automatique sur `main` sans rollback activé** ; publication contrôlée écrite mais « à terminer une fois ». | `docs/publication-controlee.md` | moyen |
| **Périmètre dispersé** : Meta Ads, OpenAI (six fichiers), Yousign (onze), Codex en CI. À maintenir ou à amputer. | `src/lib/facebook.ts`, `marketing-meta.ts` | moyen |
| **Pas de validation d'entrée typée** (ni zod ni valibot) : 56 fichiers d'actions valident à la main. Pas de limitation de débit applicative hors invitations. | `src/app/actions/` | moyen |
| **Nommage de schéma mixte** anglais/français (`organizations`, `memberships` contre `baux`, `appels_loyer`) ; 24 colonnes `jsonb` fourre-tout. | migrations | faible |
| **i18n absente** jusque dans les messages d'erreur SQL. | — | faible |
| **Commentaires narratifs et datés**, écrits pour un lecteur IA (« POURQUOI CE TEST EXISTE »). Précieux aujourd'hui, faux demain si personne ne les relit. Deux TODO dans 140 000 lignes : pas de pensée différée consignée. | code | moyen |

Au crédit : CI complète (Postgres 18, migrations rejouées, banc, émulateur, lint, build,
types, 2 045 tests, Playwright mobile) verte en 8 à 10 minutes ; en-têtes de sécurité
(CSP, HSTS, X-Frame), MFA imposée au super admin, webhook Stripe signé et dédupliqué,
2 527 `revoke` ; sauvegarde chiffrée quotidienne externalisée, restauration réelle
le 27/09 (petit volume, pas de remise en service complète exercée, RPO 24 h, pas de
PITR).

## 6. Commercial et juridique

- **Tarification instable** : grille juillet « 19 €/mois + 49 € de mise en place », puis
  « 5,99 €/bien », puis grille du 28/09 (Solo 5,99 / Bailleur 9,99 / Investisseur
  19,99 / Patrimoine 29,99 € TTC ; agence 39 € HT jusqu'à 10 lots puis 2, 1,50 et
  1 €/lot). Le parrainage a changé trois fois en onze jours. **Moyen**.
- **Prix agence crédible en absolu, pas en valeur** : 69 €/mois pour 25 lots d'un outil
  qui ne gère ni compte mandant, ni rapprochement, ni signature, ni reversement, alors
  que les logiciels d'agence établis **[hors dépôt]** facturent 1,5 à 4 €/lot avec tout
  cela. L'agence devra garder son logiciel actuel. **Fort**.
- **Prix particulier au-dessus de Rentila pour moins de fonctions** **[hors dépôt]**
  (Rentila : un bien gratuit puis environ 49 €/an avec photos d'EDL, synchronisation
  bancaire et application). Panier moyen 10 €/mois : coût d'acquisition admissible de
  quelques dizaines d'euros, acquisition payante impossible. **Fort**.
- **Franchise de TVA** : signal micro-entreprise ; au passage à un acquéreur assujetti,
  16,7 % de marge à perdre sur les particuliers (prix affichés TTC) ou +20 % de prix.
  **Moyen**.
- **CGU, CGV, politique de confidentialité, bail type, quittances : rédigés par l'agent
  IA, jamais relus par un juriste** ; les validations externes ont été écartées le
  25/07. La responsabilité des documents générés est intégralement transférée au client,
  là où BailFacile ou Hestia **[hors dépôt]** vendent précisément la conformité validée.
  **Fort**.
- **RGPD** : pas de DPO ; dix sous-traitants dont OpenAI (États-Unis) et Meta ; un dump
  complet de la base transite chaque nuit en clair par GitHub Actions le temps du
  chiffrement ; transferts hors UE couverts par « CCT et/ou DPF selon le prestataire »
  sans dire lequel ; aucun accord de sous-traitance versé. **Moyen à fort**.
- **Propriété intellectuelle** : code presque intégralement généré par IA, historique
  git visible de treize jours, un humain. Titularité à sécuriser avant toute cession.
  Dépendances toutes permissives (MIT, Apache, OFL) ; illustrations IA sans protection.
  **Fort pour la valorisation**.
- **Support** : page « Aide et retours » après connexion, pas d'e-mail, pas de
  téléphone, pas de chat, pas de SLA (« dans les meilleurs délais »), pas de page de
  statut publique ; un prospect non connecté n'a que le formulaire de devis. **Fort**.
- **Marketing de contenu artificiel** : seize gabarits d'articles en rotation
  calendaire (le stock se répète après huit semaines), relais de veille en texte
  passe-partout, visuels générés, publication Facebook automatique. Risque SEO et
  d'image « page robotisée ». **Moyen**.
- **Hébergement** : Supabase Paris, Vercel Paris, Resend Irlande, sauvegardes Scaleway
  Paris. Conforme. **Faible**.
- **Loi Hoguet** : éditeur hors champ, carte professionnelle et garantie exigées à la
  création d'une agence, facturation au lot sous mandat actif. Correct. **Faible**.

## 7. Ce qui a de la valeur, malgré tout

1. **La génération documentaire** : 55 modèles, mentions contrôlées, plafonds et zones
   tendues appliqués, IRL contrôlée.
2. **Le cycle incident → artisan** : devis en concurrence, créneaux, compte rendu, score.
   Unique dans le panel, mais non monétisé et réseau vide.
3. **La discipline** : 2 045 tests, RLS réellement testées, CI verte, migrations
   rejouées, sauvegarde chiffrée, audits datés, un wiki métier de 300 entrées qui vaut
   une formation.
4. **Les pages légales**, mieux structurées que la moyenne, une fois l'éditeur nommé et
   un juriste passé.
5. **Les outils publics gratuits** (IRL, quittance, GLI/Visale, LMNP, rentabilité) :
   un début d'acquisition organique, sans mesure pour le prouver.

## 8. Lecture d'acquéreur : ce qui pèse sur le prix

Pour une IA qui veut gagner de l'argent vite, Gerimmo n'est pas un raccourci : c'est un
socle sur lequel les six standards manquants restent à construire, avec en plus une
régularisation légale, une relecture juridique, une refonte d'interface orientée geste,
une supervision et une preuve de charge à produire, et une équipe à constituer autour
d'un porteur unique. Le revenu à douze mois, même avec 120 clients, ne couvre pas un
salaire. La valeur se situe dans le temps économisé par rapport à repartir de zéro
(code, schéma, documents, wiki), pas dans une activité.

Conditions qu'un acquéreur imposerait avant de signer : identité légale et relecture
juridique à la charge du vendeur ; cession des droits sur le code généré formalisée ;
accompagnement du porteur sur plusieurs mois (seul pilote) ; preuve de charge
applicative ; prix indexé sur un complément de résultat, puisqu'il n'y a aucun
historique de revenu.

> [!warning] Points à trancher / contradictions
> - L'[[Analyse concurrentielle]] et le [[Récapitulatif fonctionnel et lacunes de spécification]]
>   présentent des bots Telegram/WhatsApp et des relances « avec mise en demeure » ; le
>   code n'a ni l'un ni l'autre. Mettre le wiki au niveau du code, ou l'inverse.
> - Le lien [[Grille tarifaire]] depuis [[Abonnement]] est mort ; la grille vit dans
>   [[Abonnement]] et dans la source du 28/09.
> - Les comparaisons de prix et de fonctions avec Rentila, Smartloc, Hektor, BailFacile
>   et Hestia sont **[hors dépôt]** et doivent être vérifiées sur leurs sites avant
>   d'être citées à un tiers.
> - Le réseau d'artisans : le monétiser (commission, abonnement, lead), l'ouvrir
>   partout par défaut, ou le retirer de la promesse publique tant qu'il est vide.

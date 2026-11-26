# Audit palier 1 — D. Dépendance à l'IA

Audit en lecture seule du 22/11/2026. Code lu : copie `palier1/app` (commit `e1e442dc`). Base d'essai locale `gerimmo_ci_sql` lue en lecture seule (données fictives). Aucun test ni serveur lancé, rien modifié.

Chemins relatifs à `palier1/app/` sauf mention contraire.

## 0. En bref

- **Un seul fournisseur d'IA : OpenAI.** Neuf usages, huit fichiers qui appellent `api.openai.com`, plus l'atelier de corrections qui fait travailler un modèle chez GitHub. Aucun autre service d'IA, aucun kit de développement d'IA dans `package.json`.
- **Le cœur de métier n'appelle jamais l'IA** : baux, loyers, quittances, relances, charges, signatures, déclaration d'incident, choix d'artisan, créneaux de rendez-vous, envoi de devis.
- **Les exemples cités par le porteur sont déjà manuels** : la déclaration d'incident est un formulaire (il n'existe aucun bot), le créneau se choisit à la main. Seul le devis d'artisan passe par l'IA, avec un repli sur un catalogue de prix.
- **Deux fonctions s'arrêtent vraiment sans IA** : la préparation automatique des posts marketing (image IA obligatoire) et l'écran « Créer un article » de la console.
- **Aucun réglage actuel ne donne « IA coupée, tout le reste en marche »** sans faux signaux de panne. Le garde-fou central existe déjà (`reserverAppelIA`) : il suffit de lui ajouter un état « désactivée ».
- **Aucune décision sur une personne n'est prise par l'IA.** Deux points à surveiller : la parution automatique de posts rédigés par l'IA (réglage par défaut « silence vaut parution ») et les réponses de l'assistant, livrées sans relecture humaine.

## 1. Inventaire des fonctions IA

Modèle par défaut dans le code : `gpt-5.6-luna` pour le texte, `gpt-image-2` pour l'image. Chaque usage a sa variable d'environnement (`.env.example:116-133`). La clé est `OPENAI_API_KEY`, avec l'ancien nom `OPEN_AI_KEY` en repli. Tous les appels de texte passent `store: false` et n'utilisent aucun outil.

| # | Fonction IA | Espace / persona | Point d'appel (fichier:ligne) | Déclencheur | Données envoyées | Comportement IA indisponible aujourd'hui | Équivalent manuel existant ? | À construire (taille) |
|---|---|---|---|---|---|---|---|---|
| 1 | **Assistant « Demander à Gerimmo »** (conversation privée) | Propriétaire en gestion directe et locataire | `src/lib/conversation-privee-ia.ts:13` (modèle `:17`) ; action `src/app/actions/conversation-privee.ts:19` ; composant `src/components/assistant-prive.tsx:30` ; pages `src/app/agence/[orgId]/messages/page.tsx:69` et `src/app/locataire/[orgId]/contact/page.tsx:116` | L'utilisateur envoie une question | Texte libre de la question (2 000 caractères), historique (12 messages, 24 000 caractères), rôle, sujet choisi. **Données personnelles possibles** : tout ce que l'utilisateur tape. Aucun dossier ni identifiant joint. | Le bloc reste affiché. Après saisie : « L'assistant Gerimmo n'est pas connecté pour le moment. Votre message n'a pas été envoyé. » (clé absente), « L'assistance a atteint sa limite du jour. Réessayez demain. » (limite à 0, message trompeur), « L'assistance est momentanément indisponible. » (arrêt d'urgence). | Partiel. Locataire : messagerie avec le bailleur, formulaire « Signaler un problème », page `faq`. Tous : `/assistance` (« Aide et retours »). Pas de réponse immédiate équivalente. | Masquer le bloc IA coupée et le remplacer par les liens d'aide existants. **Petit.** |
| 2 | **Lecture assistée d'une facture** (préremplissage) | Propriétaire | `src/lib/lecture-document-ia.ts:25` (modèle `:28`) ; action `src/app/actions/lecture-document.ts:17-18` ; boutons `src/components/depenses-simplifiees.tsx:56` et `:75`, `src/components/consommations-formulaires.tsx:163` et `:190` | Clic « Préremplir depuis la facture » | **Le fichier entier** (PDF ou photo, 3,5 Mo au plus) en base64. **Données personnelles** : nom, adresse, référence client du titulaire de la facture, éventuellement coordonnées bancaires imprimées. | Message : « La lecture assistée n'est pas activée ici. Vous pouvez renseigner les informations directement. » La facture et la saisie sont conservées. | **Oui** : tous les champs du même formulaire se remplissent à la main. | Masquer le bouton IA coupée. **Petit.** |
| 3 | **Lecture assistée d'une photo de compteur** | Locataire | Même fonction, nature « compteur » ; bouton `src/components/releves-locataire.tsx:45` (« Lire l'index sur ma photo ») | Clic du locataire | La photo du compteur (index, numéro de compteur). Donnée personnelle indirecte. | Même message que la ligne 2. | **Oui** : champ index saisi à la main. | Masquer le bouton. **Petit.** |
| 4 | **Proposition de devis** | Artisan | `src/lib/proposition-devis-ia.ts:43` (modèle `:47`) ; action `src/app/artisan/devis/actions-preparation.ts:27` ; écran `src/app/artisan/devis/[sollicitationId]/formulaire-devis.tsx:83` | Automatique à la première ouverture d'une demande de devis | Catégorie de l'incident, mots techniques d'un lexique fermé repérés dans la description, catalogue de références. **Aucune donnée personnelle** (`:13-19` : ni description brute, ni identité, ni adresse). | Repli automatique sur le catalogue de références (`moteur: "references"`), avec la mention « L'analyse IA n'est pas connectée… » ou « …suspendue pour le moment… ». Le devis reste entièrement modifiable. | **Oui**, mais pas un devis vierge : le repli préremplit la **première** ligne du catalogue du métier, sans lien avec le symptôme (`:34`). Le formulaire vide n'apparaît que si les références échouent (`actions-preparation.ts:26`). | Branche « IA coupée » explicite et option « Partir d'un devis vierge ». **Petit.** |
| 5 | **Brief IA** (« Analyser les signaux avec l'IA ») | Super admin | `src/app/admin/brief/actions.ts:63` (modèle `:67`) ; bouton `src/app/admin/brief/bouton-ia.tsx:27` | Clic du super admin | Huit compteurs et la date (`:45-55`). **Aucune donnée personnelle.** | Clé absente : la section n'est pas affichée (`src/app/admin/brief/page.tsx:204`). Limite ou arrêt : message de la garde. | **Oui** : le point du matin et les indicateurs sont calculés sans IA. | Lire l'interrupteur à la place de la seule clé. **Petit.** |
| 6 | **Rédaction assistée d'un article** (« Créer un article ») | Super admin, marketing | `src/app/admin/publications/nouvelle/actions.ts:50` (modèle `:54`) ; formulaire `nouvelle/formulaire.tsx` | Clic du super admin | Sujet, public visé, faits saisis par le super admin. Pas de donnée personnelle attendue (texte libre non contrôlé). | « La rédaction assistée attend la clé OpenAI configurée dans Vercel. » La saisie reste dans le formulaire. Aucun brouillon créé. | **Non depuis cet écran.** Détour possible : « Chercher des sujets » (moteur SQL sans IA) puis écriture dans l'éditeur (`src/app/actions/publications.ts:79`). | Bouton « Créer un brouillon vierge ». **Petit.** |
| 7 | **Étude d'une actualité réglementaire** | Tâche de fond « veille » ; résultat lu par le super admin, puis diffusé aux utilisateurs après validation | `src/lib/analyse-veille.ts:92` ; mission `src/lib/missions-planifiees/veille.ts:44` | Tâche planifiée quotidienne (`vercel.json`, 9 h UTC) ou « Lancer maintenant » | Texte de pages officielles publiques (12 000 caractères par source, 3 sources au plus). **Aucune donnée personnelle.** | La collecte continue. L'étude échoue : la fiche affiche « L'analyse attend la connexion de l'IA. », la mission répond 503 (`veille.ts:52-59`) et reparaît en échec chaque jour tant qu'une actualité attend. Aucune proposition d'évolution n'est créée. | **Oui pour la décision** : le formulaire « Ce qui change / Ce que l'utilisateur doit prévoir / Personnes concernées / Date » se remplit à la main (`src/app/admin/veille/decision.tsx`) et la base n'exige pas d'étude IA (`decider_veille`). Mais l'écran dit « Aucune analyse ne vous est demandée ». | État neutre « IA désactivée » dans la mission et à l'écran, libellé invitant à rédiger soi-même. **Petit à moyen.** |
| 8 | **Rédaction d'un post à partir d'une actualité** | Tâche de fond « marketing » ; site public (Journal) et Facebook | `src/lib/redaction-veille.ts:122` (modèle `:128`) ; mission `src/lib/missions-planifiees/marketing.ts:164` | Tâche planifiée (cron Vercel et `pg_cron` toutes les 5 minutes), la veille du jour de parution | Titre et texte de la page officielle (40 000 caractères au plus). **Aucune donnée personnelle.** | Repli sur un sujet éditorial du catalogue interne, sans IA (`marketing.ts:166-170` : l'échec de rédaction est noté, puis le sujet éditorial est retenu). | **Oui** (repli automatique). | Rien, hors état neutre commun. **Petit.** |
| 9 | **Visuel d'un post** (image générée) | Même tâche | `src/lib/visuel-marketing.ts:15` ; mission `marketing.ts:215` | Même tâche | Le titre de l'article (300 caractères). **Aucune donnée personnelle.** | **Bloquant** : « Aucun post sans image nouvelle ». Le post n'est pas programmé (`marketing.ts:208`, `:234` ; la base exige `image_empreinte`, fonction `programmer_publication_marketing`). La mission répond 503 à chaque passage. | **Non pour le circuit automatique.** À la main : écrire l'article, saisir l'adresse d'une image (champ texte, pas de dépôt de fichier), publier, puis envoyer sur Facebook. | Visuel sans IA (dépôt d'image, banque d'images ou affiche de marque) ou post programmé sans image. **Moyen.** |
| 10 | **Atelier de corrections** (Codex) | Super admin, équipe « Qualité et corrections » | `src/app/actions/equipes.ts:96-99` (lancement GitHub) ; modèle appelé dans `.github/workflows/atelier-code.yml:44` (racine du dépôt) | Clic du super admin | Texte de la demande (« sans donnée personnelle » : consigne non contrôlée) ; le modèle lit le dépôt de code. | Bouton désactivé tant que `GERIMMO_CODEX_ENABLED` n'est pas à `true` (`equipes.ts:62`, `src/app/admin/equipes/page.tsx:63`). | Sans objet : la correction est faite par un développeur hors de Gerimmo ; le suivi des propositions reste utilisable. | Masquer le formulaire IA coupée. **Petit.** |

### Ce qui porte le nom « équipes IA » sans appeler de modèle (lu dans le code)

- Les « équipes » de `src/lib/missions.ts` sont des groupes de tâches planifiées déterministes : avis d'échéance, quittances, relances, rappels, abonnements, signatures, purge, territoire, suivi des dossiers.
- Le point du matin, les faits de direction, les consignes et le mode vacances n'appellent aucun modèle.
- Le tri des incidents est déterministe : l'urgence est choisie par le locataire (`formulaire-incident-locataire.tsx:368-376`), la prise en charge est décidée par le propriétaire (`src/lib/consigne-incident.ts`), l'artisan est choisi par le propriétaire dans une liste SQL (`artisans_disponibles_bien`).
- Les « Conseils pour choisir son locataire » sont un texte fixe, masqué (`src/lib/conseils-locataire.ts`, `CONSEILS_LOCATAIRE_VALIDES = false`).

## 2. Où Gerimmo ne fonctionne PAS sans IA

Lu dans le code :

1. **Préparation automatique des posts marketing** (Journal et Facebook). Chaque post exige une image générée par l'IA, y compris quand le texte vient du catalogue sans IA. Sans IA, plus aucun post automatique n'est programmé.
2. **Écran « Créer un article »** de la console. Il n'a qu'un chemin, celui de l'IA.
3. **Étude des actualités de veille.** Plus d'étude ni de proposition d'évolution automatique ; la décision reste possible à la main, mais l'écran ne le dit pas.
4. **Assistant « Demander à Gerimmo ».** Le bloc reste affiché et renvoie une erreur après que l'utilisateur a tapé sa question.
5. **Brief IA et atelier de corrections.** Par nature sans équivalent ; aucun n'est nécessaire à l'exploitation.
6. **Santé du service et alertes.** IA coupée, Gerimmo se croit en panne :
   - la clé absente compte comme point bloquant (`src/lib/sante-service.ts:316-323`, `:535-545`) ;
   - le crédit IA passe en « manque » (`:764-777`) ;
   - les missions veille et marketing ressortent en échec ;
   - supposé, non rejoué : l'e-mail quotidien du relais signalerait ces échecs chaque matin.

Fonctionnent sans IA, avec un chemin manuel dans le même écran : factures et compteurs (lignes 2 et 3), devis d'artisan (ligne 4), décision de veille (ligne 7), post de veille (ligne 8).

## 3. Réglages existants qui coupent déjà une partie de l'IA

| Réglage | Où | Ce qu'il coupe | Limite pour le besoin |
|---|---|---|---|
| Clé `OPENAI_API_KEY` absente | Variables Vercel | Tous les appels de l'application | Demande un redéploiement ; déclenche les faux signaux de panne du § 2.6 ; messages « pas connecté » |
| Limite quotidienne à 0 | Table `ia_plafond_reglage`, écran `/admin/relais` section « Limite des appels IA » (`src/app/admin/relais/limite-ia.tsx`), fonction `regler_plafond_ia` | Tous les appels payants, gestes manuels compris | Messages « limite atteinte, réessayez demain » ; missions veille et marketing en échec à chaque passage |
| Arrêt d'urgence, 14 périmètres | Table `supervision_arrets`, écran `/admin/relais#arrets` | « global » coupe toute l'IA ; « veille » et « marketing » coupent les usages 7, 8, 9 et 6 | « global » arrête aussi avis d'échéance, quittances, relances ; « veille » et « marketing » arrêtent aussi la collecte et la diffusion sans IA |
| Pause d'une mission | Table `agent_missions`, écran `/admin/equipes`, fonction `regler_mission` | Les missions veille et marketing entières | Même défaut : coupe aussi la partie sans IA |
| Agent marketing | Table `marketing_reglages` (`actif`, `publication_automatique`, `validation_obligatoire`), écran `/admin/marketing` | Préparation et parution automatiques | Ne concerne que le marketing |
| `GERIMMO_CODEX_ENABLED` | Variable Vercel et variable du dépôt GitHub | L'atelier de corrections | Un lancement fait directement depuis GitHub échappe à Gerimmo |
| Verrou pilote | `src/lib/verrou-pilote.ts:2-10` (`GERIMMO_MODE`, `GERIMMO_PILOTE_LIMITE`, `GERIMMO_PAIEMENTS_DESACTIVES`, `GERIMMO_PREPRODUCTION_VALIDEE`) | Six appels IA sur huit hors production commerciale | Le brief et la rédaction d'article ne le consultent pas (écart, voir § 6) |
| Limites par compte | Fonction `reserver_appel_ia_prive` | 10 questions et 20 lectures par jour et par compte, 3 secondes entre deux demandes | Limite d'usage, pas un interrupteur |

État lu dans la base d'essai : aucun arrêt enregistré, limite à 50, dix missions actives, `marketing_reglages` avec `publication_automatique = true` et `validation_obligatoire = false` (valeurs par défaut des migrations ; la valeur de production n'a pas été lue).

**Conclusion** : rien ne donne aujourd'hui « IA coupée, tout le reste en marche » avec des messages justes.

## 4. Proposition d'interrupteur

### 4.1 Emplacement du réglage

- **Écran** : `/admin/parametres` (« Paramètres généraux »), nouvelle section « Intelligence artificielle », à côté d'« Ouverture des abonnements » qui est déjà un interrupteur général du même type (`src/app/admin/parametres/page.tsx:55-58`).
- **Contenu** : une case « IA activée », l'état de la connexion, la liste des dix fonctions avec leur équivalent manuel.
- **Limite quotidienne** : aujourd'hui dans « Vacances et relais », où un réglage permanent ne se cherche pas. La déplacer dans la même section, ou au minimum poser un lien croisé.
- **Droit** : super admin permanent en double vérification, comme `regler_plafond_ia`.

### 4.2 Stockage

- Une colonne `ia_active boolean not null default true` dans la table à ligne unique `ia_plafond_reglage`. Les deux gardes SQL la lisent déjà dans la même transaction.
- Une fonction `regler_ia_active(p_active boolean)` : réservée au super admin permanent, journalisée dans `supervision_operations`.
- Une fonction de lecture `ia_disponible()` : rend un simple booléen, ouverte aux comptes connectés. Nécessaire parce que la table n'est lisible que par le super admin permanent, alors que les écrans propriétaire, locataire et artisan doivent savoir s'il faut masquer un bouton.
- Conventions du dépôt à suivre : migration additive, fichier de retour arrière dans `supabase/retours-arriere/`, `select public.fermer_fonctions_a_anon()` en fin de migration.
- Défaut `true` pour ne rien changer à la livraison. À faire trancher par le porteur.

### 4.3 Garde-fou central

Il existe déjà : chaque appel payant passe par `reserver_appel_ia` ou `reserver_appel_ia_prive` (`src/lib/plafond-ia.ts:66` et `:95`), et un test d'inventaire le vérifie (`tests/plafond-ia-appels.test.ts:324-363`).

1. **Base** : les deux fonctions rendent une nouvelle valeur `'desactive'`, testée en premier, sans rien compter.
2. **Application** : `reserverAppelIA` et `reserverAppelIAPrive` lèvent une erreur dédiée `IADesactivee`, avec un seul message neutre, par exemple « L'assistance par IA est désactivée. Utilisez la saisie manuelle. »
3. **Écrans** : une fonction serveur unique `etatIA(db)` rend « active », « désactivée par réglage » ou « non connectée ». Elle remplace les lectures directes de la clé dispersées dans `brief/page.tsx:204`, `marketing/page.tsx:84` et `sante-service.ts:319`.
4. **Missions** : `IADesactivee` est traitée comme un état neutre, ni échec ni 503.

Défense en profondeur : même si un écran oublie de masquer son bouton, l'appel est refusé en base.

### 4.4 Points d'appel à brancher

**Refus de l'appel** (déjà derrière la garde, rien à ajouter sauf un point) :
- `src/app/actions/lecture-document.ts:18` appelle la fonction SQL directement au lieu de passer par `reserverAppelIAPrive` : à aligner.

**Écrans à adapter** :
1. `src/components/assistant-prive.tsx` et ses deux pages : ne pas afficher, ou afficher les liens d'aide.
2. `src/components/lecture-document-assistee.tsx`, `src/components/depenses-simplifiees.tsx:75` : masquer le bouton.
3. `src/app/artisan/devis/actions-preparation.ts:27` et `formulaire-devis.tsx:128` : ne pas tenter l'IA, titre « Proposition Gerimmo » ou devis vierge.
4. `src/app/admin/brief/page.tsx:204` : condition sur `etatIA`.
5. `src/app/admin/publications/nouvelle/` : brouillon vierge.
6. `src/app/admin/veille/page.tsx` : libellé « IA désactivée : rédigez la présentation vous-même ».
7. `src/app/admin/marketing/page.tsx:84-88` : état « IA désactivée » distinct de « Connexion IA à terminer ».
8. `src/app/admin/equipes/qualite.tsx` : formulaire de l'atelier masqué.
9. `src/app/admin/relais/limite-ia.tsx` : afficher l'état de l'interrupteur.

**Tâches de fond** :
10. `src/lib/missions-planifiees/veille.ts:44-56` : ne pas tenter l'étude, ne pas compter d'échec.
11. `src/lib/missions-planifiees/marketing.ts:164` et `:215` : sujet éditorial d'office ; pour le visuel, appliquer la décision du porteur (image sans IA, ou préparation suspendue proprement).

**Supervision** :
12. `src/lib/sante-service.ts:316-323` et `:764-794` : clé et crédit « sans objet » quand l'IA est désactivée.

**Hors application** :
13. `.github/workflows/atelier-code.yml` : l'interrupteur de Gerimmo ne peut pas l'arrêter. Mettre la variable de dépôt `GERIMMO_CODEX_ENABLED` à `false` quand l'IA est coupée, et l'écrire dans la procédure.

### 4.5 Tests à écrire pour les deux modes

**Base (SQL)** :
- `ia_active = false` : `reserver_appel_ia` rend `'desactive'` pour chacun des neuf usages, sans toucher `ia_appels_jour`.
- Même contrôle pour `reserver_appel_ia_prive` et `ia_appels_comptes_jour`.
- `regler_ia_active` refusée à un compte ordinaire et à un relais temporaire, journalisée pour le super admin permanent.
- `ia_disponible()` lisible par propriétaire, locataire et artisan, fermée à l'anonyme.
- `ia_active = true` : résultats inchangés (non-régression de `tests/plafond-appels-ia-base.test.ts`).

**Garde applicative** :
- `'desactive'` produit `IADesactivee` et aucun `fetch` vers `api.openai.com`, pour les huit fichiers.
- Étendre le test d'inventaire : tout fichier qui appelle le fournisseur passe par la garde, et aucun écran ne lit la clé sans passer par `etatIA`.

**Par fonction, deux modes** :

| Fonction | IA activée | IA désactivée |
|---|---|---|
| Assistant | Réponse affichée | Bloc absent sur les deux pages, liens d'aide présents |
| Lecture facture et compteur | Champs préremplis | Bouton absent, saisie manuelle enregistrée |
| Devis artisan | `moteur = "ia"` | Aucun appel, devis vierge ou catalogue, envoi complet du devis réussi |
| Brief | Suggestion affichée | Section absente, point du matin intact |
| Article | Brouillon rédigé | Brouillon vierge créé, éditeur ouvert |
| Veille | Étude conservée | Collecte faite, mission réussie, décision manuelle possible |
| Marketing | Post programmé avec visuel | Mission réussie, comportement décidé pour le visuel |
| Santé | Clé et crédit vérifiés | Aucun point bloquant dû à l'IA |

**Bout en bout** : un scénario Playwright par espace (propriétaire, locataire, artisan, super admin) avec l'IA désactivée, sur le modèle de `e2e/assistant-prive.spec.ts`, qui vérifie qu'aucune requête ne part vers le fournisseur.

**Bascule à chaud** : désactiver pendant qu'un écran est ouvert ; le clic suivant reçoit le message neutre, sans erreur technique.

## 5. Décisions sur des personnes préparées ou prises par l'IA

**Aucune décision sur une personne n'est prise par l'IA** (lu dans le code). Tri d'incident, urgence, choix d'artisan, créneau, relance d'impayé, sélection de locataire : aucun n'appelle de modèle. La politique de confidentialité l'affirme aussi (`src/app/confidentialite/page.tsx:343-347`).

Ce que l'IA **prépare**, avec le contrôle humain en place :

| Sujet | Ce que fait l'IA | Contrôle humain | Point d'attention |
|---|---|---|---|
| Devis d'artisan | Propose diagnostic, prestations et quantités ; les prix viennent du catalogue, jamais du modèle | L'artisan relit, coche sa validation, envoie | Le montant engage ensuite propriétaire et locataire. Le diagnostic IA part de mots-clés, pas d'un constat. |
| Assistant (propriétaire, locataire) | Répond sur loyers, bail, charges, problème dans le logement | **Aucune relecture humaine** avant affichage. Garde-fous : consigne du modèle, mention « Réponse assistée à vérifier avant toute décision », aucune action possible. | Réponse à portée juridique livrée seule. Un locataire peut croire avoir signalé un problème à son bailleur : l'assistant ne transmet rien. |
| Lecture de facture ou de compteur | Extrait montants, période, index | L'utilisateur vérifie puis enregistre | Ces valeurs alimentent la répartition des charges du locataire. Dans `depenses-simplifiees.tsx:64`, les valeurs lues sont écrites dans les champs vides sans étape « Utiliser les valeurs lues ». |
| Veille diffusée aux utilisateurs | Rédige résumé, action conseillée, publics concernés | Le super admin valide dans `/admin/veille`. Depuis le point du matin, « Valider » reprend le texte de l'IA tel quel, en un clic (`src/app/admin/brief/actions.ts:187-196`). | Information réglementaire affichée aux bailleurs et locataires. |
| **Post de veille publié** | Rédige l'article et crée l'image | **Fenêtre de veto seulement** : avec `validation_obligatoire = false` et `publication_automatique = true` (défauts des migrations), le post paraît seul sur le site public et Facebook à l'heure dite (`publier_article_automatique`). E-mail d'alerte la veille ; citations vérifiées mécaniquement. | Publication automatique au nom de Gerimmo, sans relecture obligatoire. Aucune mention d'origine IA trouvée dans `src/app/journal`. Ne vise pas une personne. |
| Proposition d'évolution du produit | L'étude de veille crée seule une fiche « Adapter Gerimmo : … » (`conserver_etude_veille`) | Statut « à étudier », accord requis | Décision produit, pas une personne. |
| Brief IA | Suggère une prochaine action au dirigeant à partir de compteurs | Lecture seule | Aucune personne visée. |
| Atelier | Prépare une correction de code | Relecture, contrôles, accord avant publication | Aucune personne visée. |

Supposé, à faire confirmer par un juriste : aucun de ces traitements ne relève d'une décision entièrement automatisée produisant des effets juridiques sur une personne.

## 6. Écarts relevés en passant (lus dans le code)

1. **Sous-traitance déclarée incomplète.** Le rôle public d'OpenAI (`src/lib/editeur.ts:236-239`) cite la veille, les brouillons, les illustrations et les devis. Il ne cite ni l'assistant ni la lecture assistée, alors que cette dernière envoie des factures entières. La page de confidentialité ne les mentionne pas non plus.
2. **Information absente sur un bouton.** `depenses-simplifiees.tsx:75` (« Préremplir depuis la facture ») n'indique pas que le fichier part vers un service d'IA, contrairement à `lecture-document-assistee.tsx:21`.
3. **Verrou pilote inégal.** Le brief (`admin/brief/actions.ts`) et la rédaction d'article (`admin/publications/nouvelle/actions.ts`) n'appellent pas `exigerOperationsPayantesAutorisees()`, contrairement aux six autres appels.
4. **Place comptée pour rien.** Dans les six fichiers de `src/lib`, la réservation précède le verrou pilote (par exemple `conversation-privee-ia.ts:11-12`) : hors production, une place du jour est consommée sans qu'aucun appel parte.
5. **Messages incomplets.** `lecture-document.ts:19` ne distingue pas « arrêt », « limite du compte » et « patientez ».
6. **Vocabulaire technique à l'écran** : « La rédaction assistée attend la clé OpenAI configurée dans Vercel. » (`nouvelle/actions.ts:38`).

## 7. Lu, non vérifié, supposé

**Lu dans le code ou la base d'essai** : tout ce qui porte une référence de fichier ou de fonction ci-dessus, ainsi que le § 3.

**Non vérifié** :
- Les valeurs de production : présence de la clé, modèles réellement utilisés, `GERIMMO_CODEX_ENABLED`, réglages marketing, limite quotidienne.
- Le rendu réel des écrans : aucun serveur lancé, les messages cités sont ceux du code.
- L'existence d'accords de traitement des données signés avec OpenAI.

**Supposé** :
- L'e-mail quotidien du relais reprendrait les échecs des missions veille et marketing une fois l'IA coupée (déduit de `sante-service.ts` et du wiki, non rejoué).
- La qualification juridique du § 5.
- Les tailles : estimation à la lecture. Ensemble de l'interrupteur (migration, garde, une douzaine d'écrans, tests) : **moyen**. Visuel marketing sans IA : **moyen**. Aucun chantier **gros**.

## Sources

- Code : `palier1/app/src`, `palier1/app/supabase/migrations/20261014730000_plafond_appels_ia.sql`, `20261028145948_assistant_prive_et_usages_ia.sql`, `palier1/.github/workflows/atelier-code.yml`, `palier1/app/vercel.json`, `palier1/app/.env.example`.
- Wiki : `wiki/syntheses/Équipes IA et automatismes — inventaire et propositions (14 octobre 2026).md` (inventaire à sept points au 14/10 ; l'assistant et la lecture assistée, ajoutés le 28/10, n'y figurent pas), `wiki/syntheses/Gerimmo en autonomie.md`.

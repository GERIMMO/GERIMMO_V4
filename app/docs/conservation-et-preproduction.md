# Conservation des signatures et préproduction — 22 octobre 2026

## État de livraison

**Décision du dirigeant — 22 octobre 2026 : préproduction abandonnée.**
Les essais et modifications doivent reprendre en local, avec des données fictives.
La branche Supabase `hlkbvmfybxwqathchsdz` et ses trois comptes de recette ont été
supprimés à sa demande. Le raccordement Vercel est retiré. Ne pas recréer cet
environnement sans nouvelle demande explicite. Les paragraphes de préparation
ci-dessous sont un historique, pas une configuration à rétablir. Les corrections
publiées d'archives, de sauvegarde et de dépendances sont conservées.

La reconstruction de la base isolée est terminée. Les trois commits préparés sur
`codex/conservation-exploitation-20261022` sont repris sans conflit sur le main
`cc53dd7`, dans `codex/reprise-conservation-20261022`. Leur publication est en cours
de validation ; aucun succès de déploiement n'est encore déclaré ici.
Aucun compte, dossier fictif, envoi ou paiement n'a été créé pendant ce travail.
La base et les réglages de production n'ont pas été modifiés.

### Correctif de sécurité préalable à la publication

La première CI de la PR [239](https://github.com/GERIMMO/GERIMMO_V4/pull/239)
a bloqué sur l'audit de Next.js 16.3.8. Les avis
[GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw),
[GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r) et
[GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr)
concernent cette version. Next.js et sa configuration ESLint sont donc fixés
à 16.4.2, avec sharp 0.35.5 dans le verrou de dépendances. Le contrôle de sécurité
de la CI reste obligatoire.

Après mise à jour : audit des dépendances de production sans vulnérabilité,
92 tests ciblés réussis et build webpack complet réussi (TypeScript et 65 pages
statiques). Les dépendances de développement gardent des alertes distinctes ;
ce résultat ne constitue pas un audit de sécurité exhaustif de Gerimmo.
La CI et les déploiements de cette révision restent à confirmer.

## Conservation des signatures

Le nouveau contrôle manuel de `/admin/donnees#archives` exige
`is_super_admin()` sur la session courante avant d'ouvrir le client privilégié.
Il examine cinq circuits Zoho terminés au maximum par passage, puis propose la
page suivante. Les modèles qui utilisent `bail_signature_circuits` sont couverts ;
les documents Zoho créés hors Gerimmo ne sont pas inventoriés par ce contrôle.

Le contrôle relit le PDF signé et les certificats, vérifie leur organisation,
leur présence, leur taille, leur en-tête PDF et leur SHA-256 enregistré.
Un certificat commun à plusieurs signataires n'est téléchargé qu'une fois.
Chaque signataire doit référencer un certificat distinct du contrat : le certificat
valide d'un autre signataire ne masque pas un rattachement erroné au contrat.
Le résultat navigateur et le journal ne contiennent aucun fichier, chemin,
nom de signataire ou contenu documentaire.

Complément autonome : un signataire historique mal formé est signalé avant
toute lecture privilégiée ; une erreur sur un dossier n'interrompt plus les
suivants. Les lectures d'un passage partagent une limite de 40 secondes et les
fichiers sont relus sans cache. Si la page suivante ou le journal échoue,
les derniers résultats restent disponibles. Le curseur de reprise doit être
une chaîne UUID, sans conversion implicite d'un autre type.

**Limite :** cette comparaison prouve la cohérence avec l'empreinte enregistrée.
Elle ne valide pas cryptographiquement les signatures, la conformité juridique
du document ou sa lisibilité dans tous les lecteurs PDF.

La fonction de préparation de purge exige une règle validée, son point de départ,
un délai écoulé, l'absence explicite de litige et une sauvegarde récente.
Elle n'est reliée à aucun effacement. Aucun appel de suppression Zoho, aucune
politique globale de rétention et aucune tâche de purge ne sont ajoutés.
La validation des durées par catégorie et le traitement des copies extérieures
à Gerimmo restent à faire avant une suppression distante.

## Surveillance de la sauvegarde

Le workflow de disponibilité est complété par un contrôle en lecture seule de
l'historique GitHub de `sauvegarde.yml` sur `main`, avec le jeton temporaire du
workflow (`actions: read`). Aucun secret de sauvegarde ni archive n'est lu.

Le contrôle refuse une absence de réussite, un dernier passage en échec ou une
copie âgée de plus de 26 heures. Il exige également la réussite effective de
« Vérifier la copie distante » dans la même tentative : un travail ignoré ne
prouve aucune sauvegarde. L'âge est calculé depuis la fin de cette relecture.
Une réponse API indisponible ou incohérente n'est jamais affichée comme un succès.
Le bilan agrégé est conservé sept jours ; un défaut met le workflow en échec.

Ce suivi peut fonctionner lorsque Gerimmo ou sa base sont indisponibles.
Il dépend toujours du planificateur GitHub. Il ne prouve ni la réception d'une
notification par le dirigeant, ni la restauration complète d'Auth et de Storage.
Ce nouveau contrôle n'est pas actif tant que le code n'est pas publié.

## Base isolée reconstruite

- Projet : `hlkbvmfybxwqathchsdz`, branche `preproduction`, sans copie de données.
- État fournisseur : `FUNCTIONS_DEPLOYED` / `ACTIVE_HEALTHY`.
- Les 241 migrations autorisées ont été rejouées. Cinq dépendances historiques
  absentes du registre initial et les droits historiques ont été rétablis
  uniquement dans cette base. Le registre final compte 469 entrées, dont les
  lots de reconstruction ; ce nombre n'est pas celui de nouvelles fonctions métier.
- Structure comparée à la production : 176 relations publiques, 1 873 colonnes,
  340 politiques dans public/storage/support_interne, 679 fonctions publiques.
  Aucun écart de colonnes, politiques ou droits de tables/fonctions.
  Trois fonctions historiques diffèrent seulement par des espaces.
- Zéro compte, organisation, bien, bail, document ou objet Storage.
- Dix tâches planifiées présentes, **zéro active** ; marketing désactivé.
- Référentiel public des communes : 34 969 lignes issues de la migration source,
  empreinte normalisée `e005aaf627aa2cde04c082b6ca70be44`.
- Toutes les tables publiques ont la RLS. Le conseiller relève encore
  14 tables sans politique (fermées aux lectures ordinaires) et 362 fonctions
  privilégiées appelables par les utilisateurs connectés. Ce sont des droits
  historiques reproduits ; leur contrôle interne doit être évalué séparément.
  Ne pas confondre parité avec la production et audit de sécurité exhaustif.

Les nombres, les versions rejouées et les liens de remédiation sont conservés dans
[le relevé agrégé](preproduction-verification-20261022.json).
Les migrations ne doivent pas être rejouées à nouveau sur cette branche ni
fusionnées automatiquement vers la production.

## Raccordement web et limites

L'accès normal Vercel est rétabli dans la discussion de reprise autorisée.
Le dirigeant a validé lui-même le contrôle à deux facteurs GitHub le 22 octobre.
L'environnement Vercel `preproduction` est créé dans l'emplacement inclus du
forfait existant, sans domaine, sans variable importée ni variable partagée liée.
Il contient uniquement `GERIMMO_PREPRODUCTION_VALIDEE=1`, l'URL Supabase isolée et
sa clé publiable. Aucun secret privilégié ou de service externe n'est installé.
La protection existante « Vercel Authentication / Standard Protection » est active.
Son efficacité est vérifiée pour le premier déploiement décrit ci-dessous.

Premier raccordement vérifié le 22 octobre : révision `214c595` en état Ready,
à `https://gerimmo-v4-at2v9iaqt-gerimmo.vercel.app`. Connexion, route de santé
et alias de l'environnement renvoient le visiteur anonyme vers Vercel SSO.
Avec l'accès Vercel autorisé, la page Connexion s'affiche et ses adresses canonical
et Open Graph restent isolées. Le Site URL Supabase et son unique retour
`/auth/confirm` pointent vers ce déploiement ; les destinations héritées ont été
retirées uniquement de la branche. Ces adresses sont à actualiser lors du prochain
déploiement. La santé privilégiée indique la clé de service absente, comme prévu.
Zéro compte, organisation, document, fichier ou tâche active confirmé après
raccordement. La branche reste `persistent: false`.

La CI de cette révision a été relancée après plus de vingt minutes de
téléchargement des bibliothèques système ; leur installation a réussi à la
deuxième tentative. La relecture finale ajoute ensuite deux cas de non-régression
sur le certificat de chaque signataire : les deux cas échouaient avant correction.

Étapes de raccordement :

1. Vérifier la pérennité de la branche Supabase : elle porte actuellement
   `persistent: false`. Examiner aussi ses réglages Auth, SMTP et redirections
   avant toute utilisation. Aucun nouveau compte n'est autorisé par ce document.
2. Préparer l'environnement Vercel dédié `preproduction`, avec uniquement
   la clé publiable de cette base isolée. Ne pas recopier les variables Production.
   Garder les prévisualisations générales suspendues.
3. Le garde-fou fourni exige `GERIMMO_PREPRODUCTION_VALIDEE=1`,
   `VERCEL_ENV=preview`, `VERCEL_TARGET_ENV=preproduction`, l'URL Supabase exacte
   et l'hôte `VERCEL_URL` propre à ce déploiement. `NEXT_PUBLIC_SITE_URL` peut être
   absente : `next.config.ts` incorpore alors cette origine vérifiée, dans le code
   serveur et navigateur. Une valeur explicite différente reste refusée. Cela
   permet le premier déploiement sans connaître son URL à l'avance et empêche le
   repli vers `VERCEL_PROJECT_PRODUCTION_URL`.
   Il refuse la clé service_role et les accès aux paiements, signatures, courriels,
   IA, publications et tâches externes. Il s'exécute au build et au démarrage.
4. Vérifier la protection de l'aperçu, l'isolation des requêtes et les redirections.
   Ce premier environnement sans services externes ne permet pas une recette
   complète des intégrations.
5. Examiner les permissions des applications GitHub installées, sans approuver
   une extension de droits ni désinstaller un outil sans besoin établi.
6. Relire et publier le code par le circuit habituel ; confirmer ensuite
   l'apparition du contrôle d'archives et le premier résultat de surveillance.

Références officielles consultées :
[variables système Vercel](https://vercel.com/docs/environment-variables/system-environment-variables)
et [environnements Vercel](https://vercel.com/docs/deployments/environments).

### Applications GitHub — lecture du 22 octobre, après validation humaine

Les quatre applications sont installées sur **tous les dépôts actuels et futurs**.
Aucun droit n'a été ajouté, retiré ou approuvé pendant cette revue.

| Application | Lecture seule | Lecture et écriture |
|---|---|---|
| Vercel | Actions, métadonnées | Administration, contrôles, code, statuts des commits, déploiements, issues, PR, hooks, workflows |
| ChatGPT Codex Connector | Contrôles, statuts des commits, métadonnées | Actions, code, issues, PR, workflows |
| Claude | Statuts des commits, métadonnées | Actions, contrôles, code, discussions, issues, PR, hooks, workflows |
| Claude Design Import | Code, issues, métadonnées, PR | Aucun |

Claude demande en plus la lecture de l'administration et des files de fusion :
**demande laissée en attente**. La limiter ou réduire les installations aux seuls
dépôts utiles relève d'une décision du dirigeant, après inventaire des usages.

Le paramètre Vercel « Only build production » est toujours présent : les previews
ordinaires ne sont pas réouvertes. Les réglages et données de production sont préservés.

## Contrôles locaux

- 78 tests Vitest ciblés : archives, autorisation superadmin, configuration,
  santé et séparation navigateur/serveur.
- 12 tests Node : garde d'environnement, fraîcheur et preuve de sauvegarde.
- ESLint et TypeScript réussis ; compilation Next.js avec webpack réussie
  et 65 pages statiques produites.
- La tentative Turbopack initiale a été interrompue sans résultat après blocage
  de la compilation. Elle n'est pas comptée comme une validation.
- Pas de recette avec session dans l'aperçu web, pas de CI distante ni
  de publication réalisées pour ce lot.

## Contrôles autonomes complémentaires

Le 22 octobre à 11 h 53 Paris, contrôle HTTP en lecture seule :
13 pages publiques répondent 200 (accueil, connexion, mentions légales, tarifs,
agences, journal, outils, quittance, rentabilité, conditions, confidentialité,
inscription et mot de passe oublié). Le point de santé répond également 200 et
confirme sa connexion à la base. Aucun formulaire soumis.
Ces réponses ne constituent pas une recette des calculs, de la connexion ou
des parcours privés.

L'audit `npm audit --omit=dev --audit-level=high` du même jour retourne zéro
vulnérabilité connue pour les dépendances livrées. Il ne couvre pas les outils
de développement ni les défauts propres au code applicatif.

Les quatre régressions reproduites avant correction (signataire nul, curseur de
type inattendu, exception de lecture d'un dossier, exception d'écriture du journal)
passent après correction. Quatre essais supplémentaires vérifient la propagation
du délai aux lectures avec le vrai SDK et un transport mémoire, l'annulation
avant requête et l'absence d'erreur privée dans le résultat. Aucun compte ou
dossier d'essai n'a été créé dans une base.
## Revue des réglages et des durées — complément du 22 octobre

### Préproduction : contrôles Auth

Lecture de l’interface Supabase sur la branche `hlkbvmfybxwqathchsdz` :

- Site URL hérité : `https://www.gerimmo.app`.
- Redirections héritées : `https://gerimmo-v4.vercel.app/auth/confirm`,
  `http://localhost:3000/auth/confirm`, `https://www.gerimmo.app/**`.
- SMTP Resend personnalisé initialement activé. **Désactivé uniquement sur cette
  branche**, puis confirmé après rechargement (interrupteur à zéro et bouton
  d’enregistrement désactivé). Le fournisseur avertit que cette action réinitialise
  les modèles personnalisés de la branche et remet son service interne limité.
  Cela n’est donc pas une garantie de blocage de tout e-mail : le SMTP interne peut
  encore desservir les adresses autorisées de l’équipe. Aucun envoi n’a été demandé.
- Nouvelle lecture SQL : zéro compte, document, fichier ; zéro tâche active.
  L’estimation « 10 users » de l’interface Auth ne reflète pas le comptage réel.
- Branche toujours `persistent: false`. Aucun changement de formule ni achat.

Les redirections doivent être remplacées par l’adresse exacte de l’aperçu une fois
celui-ci créé et protégé. Aucune URL hypothétique n’a été ajoutée. Cette étape
reste bloquante avant une utilisation connectée ; la préproduction web n’est
toujours pas annoncée comme prête.

La branche reste facturable à l’usage ; le passage en branche persistante n’a pas
été activé. Voir [usage des branches Supabase](https://supabase.com/docs/guides/platform/manage-your-usage/branching).
Preuve locale de l’arrêt SMTP : `outputs/conservation-20261022/preproduction-smtp-desactive.jpg`
dans l’espace de travail parent, hors dépôt.

### Ce qui est établi et ce qui reste une décision

Les 29 règles ci-dessous ont été lues **dans la base isolée reconstruite**.
[Le relevé intégral](retention-inventaire-20261022.json) conserve leurs finalités.
Toutes portent `actif: true`, mais les tâches de cette base sont arrêtées.
Aucune règle, durée, fonction de purge ou donnée de production n’a été modifiée.
Un état actif ne constitue pas une validation juridique.

Le référentiel CNIL distingue l’étude de solvabilité (trois mois en base active),
puis le candidat retenu et la vie du contrat. Après clôture des comptes, il distingue
notamment gestion directe et gestion déléguée pour l’archive intermédiaire.
La gestion semi-déléguée demande de qualifier les tâches. Une conservation
supplémentaire doit être motivée ; ce n’est pas une règle uniforme de cinq ans.
[Référentiel CNIL, § 53–54](https://www.cnil.fr/sites/cnil/files/atoms/files/referentiel_relatif_aux_traitements_de_donnees_personnelles_mis_en_oeuvre_dans_le_cadre_de_la_gestion_locative.pdf).

Pour le particulier, Service Public recommande de conserver bail, état des lieux
et quittances pendant la location puis trois ans ; un contentieux peut nécessiter
davantage. Cette recommandation ne remplace pas les obligations comptables d’un
professionnel. [Papiers liés au logement](https://www.service-public.gouv.fr/particuliers/vosdroits/F19134).

Pour les pièces comptables relevant du régime décrit par Service Public Entreprendre,
le point de départ des dix ans est la clôture de l’exercice, et non simplement
l’émission. Le régime du titulaire doit être qualifié. Les contrats électroniques
avec un consommateur à partir de 120 € ont aussi un régime spécifique à examiner
pour les devis artisans. [Documents d’entreprise](https://www.service-public.gouv.fr/entreprendre/vosdroits/F10029).

La recommandation générale CNIL sur les journaux est de six à douze mois.
Un besoin particulier peut justifier une autre durée ; trois ans ne doit donc pas
être présenté comme une durée CNIL générale.
[Tracer les opérations](https://www.cnil.fr/fr/securite-tracer-les-operations).

### Matrice des 29 règles présentes

Durées en mois, déclencheurs et sorts = **configuration observée**, pas proposition
de mise en production. La dernière colonne décrit la qualification à terminer.

| Type | Mois actuels | Déclencheur actuel | Sort actuel | Point à traiter |
|---|---:|---|---|---|
| `alerte:traitee` | 12 | Fermeture de l'alerte | suppression | Durée métier à justifier ; distinguer alerte ordinaire et pièce d’un contentieux. |
| `document:attestation_assurance` | 60 | Fin du bail | suppression | Qualifier preuve locative, assurance et sinistre ; ne pas raccourcir automatiquement. |
| `document:autre` | 60 | Dépôt | suppression | Catégorie trop large pour conclure sur la durée ; demander une qualification. |
| `document:bail` | 60 | Fin du bail | anonymisation | Distinguer gestion directe et gestion déléguée ; ne pas traiter un PDF signé comme une simple ligne anonymisable. |
| `document:courrier` | 60 | Fin du bail | suppression | Classer le courrier : gestion courante, congé, réclamation ou contentieux. |
| `document:diagnostic` | 60 | Fin de gestion du bien | suppression | Distinguer validité du diagnostic et durée de conservation de la preuve. |
| `document:document_test` | 0 | Dépôt | suppression | Règle historique uniquement : aucun document ni compte de test créé ; ne pas l’utiliser pour des données réelles. |
| `document:etat_des_lieux` | 60 | Fin du bail | anonymisation | Même séparation que le bail ; conserver le dossier de preuve tant que nécessaire. |
| `document:justificatif` | 60 | Fin du dernier bail | suppression | Séparer l’étude de candidature des pièces nécessaires au contrat ; éviter une durée unique par défaut. |
| `document:mandat` | 60 | Fin du mandat | anonymisation | Vérifier fin effective du mandat, reddition des comptes et litiges. |
| `document:photo_incident` | 24 | Clôture de l'incident | suppression | Qualifier le sinistre, les garanties et les litiges avant suppression. |
| `document:piece_identite` | 60 | Fin du dernier bail | suppression | Distinguer candidat non retenu, locataire, garant et réutilisation consentie ; la fin du dernier bail ne couvre pas chaque cas. |
| `document:quittance` | 120 | Émission | anonymisation | Distinguer justificatif locatif et pièce comptable ; vérifier le point de départ applicable. |
| `document:rapport_gestion` | 120 | Émission | anonymisation | Qualifier la fonction comptable ; contrôler la clôture de l’exercice avant de calculer une échéance. |
| `document:reglement_copropriete` | 60 | Fin du bail | suppression | Distinguer annexe du bail et document de gestion du bien. |
| `journal:acces_pieces` | 12 | Consultation | suppression | Durée dans la fourchette générale CNIL ; vérifier minimisation et accès. |
| `journal:agent_passages` | 6 | Début du passage | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:audit_log` | 36 | Action | suppression | 36 mois n’est pas la recommandation générale CNIL ; justification spécifique à documenter ou durée à revoir. |
| `journal:brief_direction_snapshots` | 6 | Génération des faits | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:cron_job_run_details` | 6 | Fin du passage | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:decisions_du_matin` | 6 | Création de la décision | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:ia_appels_jour` | 6 | Jour des appels | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:points_du_matin` | 6 | Génération du point | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:relais_alertes_envois` | 6 | Jour du passage | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:relais_urgences` | 6 | Traitement de l’urgence | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:relais_urgences_envois` | 6 | Début de l’envoi | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:supervision_operations` | 6 | Date de l’opération | suppression | Décision interne existante de six mois ; vérifier le besoin de preuve et le contenu réellement conservé. |
| `journal:tech_log` | 6 | Événement | suppression | Durée dans la fourchette générale CNIL ; vérifier l’absence de contenus secrets. |
| `support:bug` | 6 | Date du signalement | suppression | Durée métier à justifier ; traiter séparément pièces jointes et dossier encore ouvert. |

### Écarts de couverture et exécution

- Le catalogue n’a pas de règle propre pour chaque modèle récent de signature,
  ses certificats et ses copies Zoho. Une durée par type documentaire n’est pas
  une preuve de couverture des pièces liées. Les devis acceptés, cautionnements,
  preuves de signature et factures doivent être rapprochés de leur usage effectif.
- Les candidats sans bail, les listes d’attente et les invitations demandent un
  déclencheur propre ; « fin du dernier bail » n’est pas utilisable partout.
- `appliquer_retention` conserve des suppressions à 24 mois hors catalogue
  pour `demandes_devis`, `intentions_conge` traitées et `demandes_signature`
  signées. Leur durée et leur rôle probatoire doivent être revus séparément.
- **Correction d’un constat périmé :** les purges internes du relais suivent déjà
  `retention_rules` (durée, actif et sort). Vérifié dans les fonctions de la base
  isolée et dans la migration `20261016180000_relais_retention_sentinelle.sql`.
  L’ancienne note « toujours six mois en dur » ne doit plus être présentée comme
  un défaut ouvert de ces fonctions.
- Le sort « anonymisation » de `appliquer_retention` retire le fichier et anonymise
  certaines métadonnées. Ce n’est pas l’anonymisation d’un PDF signé ; la preuve
  doit rester intacte pendant toute sa conservation nécessaire.

### Ordre proposé avant de changer une purge

1. Qualifier chaque usage (gestion directe/déléguée, comptable, contrat électronique,
   candidature, contentieux) et faire valider la durée et son déclencheur.
2. Compléter la politique publiée et le registre des traitements avec ces décisions.
3. Préparer une migration additive et une simulation sans effacement ; couvrir
   échéances, dossiers actifs, impayés, litiges et preuves liées.
4. Vérifier les archives et une restauration, puis seulement demander l’accord
   sur un périmètre concret de suppression.

Le contrôle d’intégrité livré localement reste utilisable sans activer la purge.
Aucune politique de suppression automatique Zoho n’a été créée.

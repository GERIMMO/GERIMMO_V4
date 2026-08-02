# Propositions visuelles — espace agent (2 août 2026)

> Issues du tour complet « œil neuf » : recette agent rejouée de bout en bout dans le
> navigateur (blocs 1 → 9, tous validés) + audit du code de chaque écran par 8 agents
> en parallèle (64 propositions brutes → 16 retenues), fusionné avec les constats du
> parcours réel. Directive : **dynamique, simple à utiliser, agréable à voir**, pensé
> pour un agent immobilier débutant. Périmètre : **espace agent uniquement** (décision
> du 2026-08-02).

## A. Transverses (un chantier = tout le site en profite)

### A1. Supprimer tout le jargon visible : codes RM et sigles (GED, EDL, LRAR, MED)

- **Impact** : 🔴 fort · **Effort** : S
- **Problème** : Une quinzaine de textes visibles citent des codes internes « (RM-x.y.z) » et des sigles non expliqués (« dans la GED », « EDL », « LRAR », « MED »), en contradiction directe avec la directive « aucun code RM visible » et le ciblage agent débutant.
- **Proposition** : Retirer tous les « (RM-…) » des chaînes affichées (les garder en commentaire code) et écrire les sigles en clair : « documents classés et conservés » au lieu de « dans la GED », « état des lieux », « lettre recommandée (LRAR) », « mise en demeure ». Aucune logique ne change, uniquement les libellés.
- **Fichiers** : `src/app/agence/[orgId]/page.tsx ; parc/page.tsx ; parc/nouveau/page.tsx ; parc/[bienId]/page.tsx ; lots/[lotId]/page.tsx, formulaire-detention.tsx, recap-lot.tsx, formulaire-pieces-lot.tsx ; baux/[bailId]/page.tsx, formulaire-depot.tsx, formulaire-restitution.tsx, formulaire-colocation.tsx, formulaire-loyers.tsx`

### A2. Généraliser le bandeau « À faire maintenant » à toutes les pages de travail

- **Impact** : 🔴 fort · **Effort** : L
- **Problème** : Le bandeau numéroté n'existe que sur la page bail. Ailleurs la prochaine étape est enfouie : blocages de mise en location repliés en bas de la fiche bien/lot, mois non clôturé au milieu de 4 cartes compta, fiche personne sans hiérarchie, dashboard vide qui affiche « tout est traité » sur un compte neuf — et même sur le bail, l'impayé (le manquement le plus urgent) n'y figure pas.
- **Proposition** : Extraire le bandeau de la page bail en composant partagé (border-primary/20, bg-primary/5, 3 étapes numérotées max, liens-ancres) et le poser en tête de : fiche bien et fiche lot (blocages déjà chargés via cibleBlocage), comptabilité (mois non clôturé → rapports à valider → versements), fiche personne (email manquant → inviter → 1re pièce → transition mandat), dashboard quand nbBiens === 0 (« Créez votre premier bien »), et bail (entrée « Encaisser ou relancer — impayé de X € » avec href #loyers).
- **Fichiers** : `src/app/agence/[orgId]/page.tsx ; parc/[bienId]/page.tsx ; parc/[bienId]/lots/[lotId]/page.tsx ; comptabilite/page.tsx ; personnes/[personId]/page.tsx ; baux/[bailId]/page.tsx (ajout impayé)`

### A3. Étendre le pattern SectionLot (replié + résumé + pastille ⚠) aux pages longues

- **Impact** : 🔴 fort · **Effort** : L
- **Problème** : Le bail empile jusqu'à 7 cartes toutes ouvertes, la carte Loyers montre 5 formulaires en permanence (révision, relances, régularisation servent 1-2 fois/an), la fiche personne déplie tous ses formulaires, et « Caractéristiques du lot » est la seule section de la fiche lot hors pattern — les vraies alertes passent sous la ligne de flottaison.
- **Proposition** : Réutiliser SectionLot partout : cartes du bail repliées sur un résumé (« Dépôt : 800 € encaissés sur 1 200 € ») avec pastille ⚠, sous-sections Révision/Relances/Régularisation repliées (Relances porte « ⚠ impayé en cours » et s'ouvre en priorité), sections de la fiche personne avec résumé (« 2 pièces », « 1 mandat actif »), Caractéristiques enveloppée avec résumé compact (« 45 m² · 2 pièces · Meublé ») et pastille « Surface à saisir ». En bonus dans SectionLot même : libellé adaptatif « Compléter » (outline, plus visible) quand une pastille ⚠ est présente, « Modifier » sinon. Les ancres du bandeau « À faire » ouvrent la bonne section (hashchange déjà géré).
- **Fichiers** : `src/app/agence/[orgId]/baux/[bailId]/page.tsx, formulaire-loyers.tsx ; personnes/[personId]/page.tsx ; parc/[bienId]/lots/[lotId]/page.tsx (+ recap-lot.tsx, section-lot.tsx)`

### A4. Chaque ligne porte son action : bouton au bout (pattern lignes-diagnostics)

- **Impact** : 🔴 fort · **Effort** : L
- **Problème** : Le pattern « ligne actionnable » existe (lignes-diagnostics) mais n'est pas généralisé : « Traiter » est un micro-lien gris vers la page alertes générique (dashboard et cloche), les alertes de décence sont des paragraphes ⚠ sans bouton, la page alertes affiche deux formulaires complets par ligne (mur d'inputs), et le dossier personne cache quelles pièces sont attendues derrière un formulaire générique.
- **Proposition** : Uniformiser : bouton outline sm en bout de ligne partout. Dashboard/cloche → « Traiter » pointe vers /alertes#alerte-{id} (poser id + scroll-mt sur chaque <li>) et affiche l'échéance ; page alertes → seuls « Fermer » / « Escalader » visibles, le champ correspondant se révèle au clic (règle métier inchangée) ; décence → bouton « Corriger → » vers #caracteristiques ; dossier personne → une ligne par TYPES_PIECE_DOSSIER avec « Déposer » pré-remplissant le type. Ajouter aussi « Voir les N autres alertes → » quand le dashboard tronque à 8.
- **Fichiers** : `src/app/agence/[orgId]/page.tsx ; src/components/cloche-alertes.tsx ; alertes/page.tsx ; parc/[bienId]/lots/[lotId]/page.tsx (décence) ; personnes/[personId]/page.tsx (dossier)`

### A5. Échéances dépassées signalées en rouge partout

- **Impact** : 🔴 fort · **Effort** : S
- **Problème** : Une échéance déjà dépassée s'affiche en gris muted exactement comme une échéance lointaine, sur le dashboard, la page alertes et la cloche : le retard est invisible là où on regarde.
- **Proposition** : Un petit helper d'affichage partagé : échéance dépassée → text-destructive « ⚠ en retard de X j », à moins de 7 jours → warning, sinon muted. Appliqué aux trois surfaces ; au passage remplacer « Assignée à : personne » par une pastille « Non assignée ». Purement visuel, aucune règle métier.
- **Fichiers** : `src/app/agence/[orgId]/page.tsx ; alertes/page.tsx ; src/components/cloche-alertes.tsx`

### A6. Confirmer les actions destructives et nommer les boutons « ✕ »

- **Impact** : 🔴 fort · **Effort** : M
- **Problème** : Partout, un clic supprime immédiatement : « ✕ » fantômes sur encaissements, relances, retenues, colocataires, compteurs ; « Fermer » clôt en réalité une détention et « Corriger » la supprime (libellés ambigus) ; « Résilier » un mandat part en un clic au même niveau visuel qu'« Activer ». Un mis-clic efface un paiement sans garde-fou.
- **Proposition** : Un AlertDialog shadcn partagé rappelant l'objet exact (« Retirer cet encaissement de 850 € du 05/07 ? ») avant chaque suppression/transition destructive ; renommer « Fermer » → « Clore la détention », « Corriger » → « Supprimer (erreur de saisie) », les « ✕ » → « Retirer » avec aria-label. Actions serveur et gardes-fous en base inchangés.
- **Fichiers** : `src/app/agence/[orgId]/parc/[bienId]/lots/[lotId]/formulaire-detention.tsx ; baux/[bailId]/formulaire-loyers.tsx, formulaire-depot.tsx, formulaire-restitution.tsx, formulaire-colocation.tsx ; baux/[bailId]/edl/[edlId]/edl-annexes.tsx ; personnes/[personId]/formulaire-mandat.tsx`

### A7. États vides qui guident vers l'action

- **Impact** : 🟠 moyen · **Effort** : S
- **Problème** : Les états vides sont des culs-de-sac passifs : « Aucun bien dans le parc… » sans bouton (premier écran d'un débutant), « Aucun document ne correspond. » sans distinguer base vide et filtres trop stricts, « Aucun appel — cliquez “Générer l'échéancier” » qui renvoie vers un bouton à chercher ailleurs.
- **Proposition** : Empty states actionnables uniformes : phrase d'accroche courte + bouton primaire dans la carte. Parc → « Créer mon premier bien » ; documents/compta → distinguer « Aucun document pour l'instant — déposez le premier → » de « Aucun résultat avec ces filtres » + « Réinitialiser les filtres » ; échéancier → encadré pointillé avec « Générer l'échéancier » à l'intérieur (le bouton du haut disparaît tant que vide).
- **Fichiers** : `src/app/agence/[orgId]/parc/page.tsx ; documents/page.tsx ; comptabilite/page.tsx ; baux/[bailId]/formulaire-loyers.tsx`

### A8. Dates pré-remplies à aujourd'hui dans tous les formulaires d'événement

- **Impact** : 🟠 moyen · **Effort** : S
- **Problème** : Tous les champs date (encaissement, dépôt, remise des clés, relance, congé) démarrent vides alors que la valeur est presque toujours « aujourd'hui » : friction répétée et risque d'envoi sans date.
- **Proposition** : defaultValue = date du jour sur ces inputs date (corrigeable) et `required` sur les champs indispensables pour un message clair avant envoi.
- **Fichiers** : `src/app/agence/[orgId]/baux/[bailId]/formulaire-depot.tsx (dep-date), formulaire-loyers.tsx (enc-date, rel-date), formulaire-restitution.tsx (rst-date), formulaires-bail.tsx (conge-date)`

### A9. Synthèses financières en tuiles chiffrées

- **Impact** : 🟠 moyen · **Effort** : S
- **Problème** : Les chiffres clés tiennent sur une ligne de texte dense (« Dû X · Encaissé Y · Solde Z » côté loyers, « Recettes X · Dépenses Y · Net Z » côté compta) : aucune hiérarchie visuelle, et « Solde » reste abstrait pour un débutant.
- **Proposition** : 3 mini-tuiles côte à côte (libellé au-dessus, montant en gras) sur les deux pages. Loyers : la tuile Solde porte une phrase claire (« Le locataire doit encore 450 € » / « À jour ») et la pastille « ⚠ impayé en cours » quand le flag impaye est vrai. Compta : Recettes en success-soft, Dépenses en destructive, Net en gros, sous-texte « juillet : non clôturé ».
- **Fichiers** : `src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx (l.152-158) ; comptabilite/page.tsx`

## B. Par écran

### B1. Parc : signaler les biens « à finaliser » dans la liste

- **Impact** : 🔴 fort · **Effort** : S
- **Problème** : Un lot en brouillon s'affiche en badge gris neutre, visuellement identique à un lot archivé : rien n'indique quel bien réclame encore du travail.
- **Proposition** : Réutiliser la pastille « ⚠ À finaliser » (bg-warning-soft, style SectionLot) sur la carte du bien dès qu'au moins un lot est en brouillon — l'état des lots est déjà chargé, aucune requête supplémentaire.
- **Fichiers** : `src/app/agence/[orgId]/parc/page.tsx`

### B2. Parc : libellés et aides qui parlent au débutant

- **Impact** : 🟠 moyen · **Effort** : S
- **Problème** : Le premier champ du formulaire bien s'appelle « Référence interne » (jargon) avec un placeholder d'adresse alors que l'adresse arrive trois champs plus bas ; et les lignes de diagnostics affichent « ERP — ⚠ Manquant » sans jamais montrer l'aide qui existe déjà dans TYPES_DIAGNOSTIC[type].aide.
- **Proposition** : Renommer en « Nom du bien » avec aide muted « Visible uniquement par l'agence — souvent l'adresse ou un surnom » ; afficher l'aide de chaque diagnostic en petit texte muted sous le libellé, au minimum sur les lignes manquantes et à l'ouverture du formulaire de dépôt.
- **Fichiers** : `src/app/agence/[orgId]/parc/formulaire-bien.tsx ; parc/[bienId]/lignes-diagnostics.tsx`

### B3. Loyers : boutons globaux réactifs et lignes impayées actionnables

- **Impact** : 🔴 fort · **Effort** : M
- **Problème** : « Générer l'échéancier » et « Émettre les quittances » (l.160-169) sont des forms fire-and-forget : aucun état de chargement ni message alors que les RPC retournent déjà « N appel(s) généré(s) » ; le bouton quittances est identique qu'il y ait 0 ou 5 quittances à émettre ; et une ligne « Impayé » n'affiche qu'un badge rouge, le remède étant deux sections plus bas sans lien.
- **Proposition** : Brancher les deux boutons sur useActionState (« … » pendant, message succès/erreur sous les boutons, classes existantes) ; calculer côté affichage le nombre d'appels couverts sans quittance et libeller « Émettre les quittances (2) » en variant default, outline discret sinon ; ajouter « Encaisser » au bout des lignes impaye/partiel qui scrolle vers le formulaire d'encaissement pré-rempli (montant = montant_du − montant_couvert, date = aujourd'hui).
- **Fichiers** : `src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx`

### B4. EDL : progression visible et signature guidée (sans piège d'enregistrement)

- **Impact** : 🔴 fort · **Effort** : M
- **Problème** : La règle « aucune ligne sans état pour signer » n'existe qu'en phrase de description ; le bouton « Signer » est toujours cliquable et échoue côté serveur sans dire quoi corriger ; pire, la signature lit la base : remplir la grille puis « Signer » sans « Enregistrer » produit une erreur incompréhensible alors que tout semble rempli à l'écran.
- **Proposition** : Compteur « 12/18 lignes renseignées » en tête, pastille « ⚠ N sans état » par pièce (style SectionLot), bordure warning sur les selects vides ; suivi de l'état « modifié non enregistré » (onChange) : tant qu'il y en a, message « Enregistrez d'abord » à côté de Signer et emphase sur Enregistrer ; quand tout est renseigné et enregistré, CTA primaire « Signer l'état des lieux ». Validation serveur inchangée. (Refonte lourde de la grille — pastilles tap, pièces repliables — reportée : l'EDL doit d'abord être modélisé pièce par pièce.)
- **Fichiers** : `src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/grille-edl.tsx`

### B5. Personnes : brancher l'édition des coordonnées (action serveur orpheline)

- **Impact** : 🔴 fort · **Effort** : S
- **Problème** : L'en-tête affiche « Aucun contact » et la carte invitation dit « Ajoutez un email à cette fiche »… mais aucune UI ne le permet : modifierContactPersonne existe et n'est utilisée nulle part (vérifié). Cul-de-sac total pour un débutant.
- **Proposition** : Petit formulaire repliable « Modifier » sous l'en-tête (email + téléphone) branché sur modifierContactPersonne ; quand l'email manque, l'afficher ouvert avec la pastille « ⚠ email manquant ».
- **Fichiers** : `src/app/agence/[orgId]/personnes/[personId]/page.tsx ; src/app/actions/personnes.ts:66`

### B6. Personnes : rôles et manquements visibles dans la liste

- **Impact** : 🔴 fort · **Effort** : M
- **Problème** : Chaque carte n'affiche que nom + contact : impossible de distinguer un propriétaire d'un locataire, ni de repérer une fiche inutilisable (sans email).
- **Proposition** : Dériver des données existantes de petits badges « Propriétaire » (détention active), « Locataire » (bail), « ✓ Espace actif » (account_id), et la pastille « ⚠ email manquant » au style SectionLot. Affichage pur, aucune règle métier.
- **Fichiers** : `src/app/agence/[orgId]/personnes/page.tsx`

### B7. Comptabilité : saisie d'écriture en questionnaire progressif

- **Impact** : 🔴 fort · **Effort** : M
- **Problème** : Le formulaire aligne 6 champs sur une ligne dont deux dates jargonneuses (« Date pièce », « Imputation ») qui intimident un débutant et provoquent des erreurs de saisie.
- **Proposition** : Reprendre le pattern du formulaire-bien : montrer d'abord Sens + Montant + Catégorie + « Date de la facture », pré-remplir la date d'imputation depuis la date de pièce et la replier sous un lien « Imputer sur un autre mois » avec une phrase d'aide. Les deux dates restent envoyées, aucune règle métier ne change.
- **Fichiers** : `src/app/agence/[orgId]/comptabilite/formulaire-compta.tsx`

## C. Constats du parcours réel (à ajouter au lot)

### C1. Formatage des dates et des montants incohérent
Dates brutes « 2026-08-02 » dans la liste des encaissements du dépôt et l'espace
locataire (« Depuis le 2026-08-01 ») ; « 712.07 € » avec un point. Partout ailleurs
c'est « 02/08/2026 » et la virgule. → passer tous les affichages par `formaterDate`
et `toLocaleString("fr-FR")`. Impact : 🟠 · Effort : S

### C2. « 1 quittance(s) émise(s) » quand c'est un reçu
Le bouton « Émettre les quittances » répond toujours « quittance » même quand il
émet un reçu partiel. → « 1 reçu émis » / « 1 quittance émise » selon le cas, et
accorder le pluriel. Impact : ⚪ · Effort : S

### C3. Comparatif entrée/sortie pollué par les libellés renommés
La grille type a changé entre l'EDL d'entrée (« Électricité », « Fenêtres ») et la
sortie (« Prises électriques », « Fenêtres et volets ») : chaque renommage produit
deux faux écarts (« bon → — » et « — → bon ») qui noient le vrai signal (Sols
dégradés). → n'afficher comme écart que les libellés présents des deux côtés, et
lister à part « éléments non comparables (grille modifiée) ». Impact : 🔴 · Effort : M

### C4. Clôture réservée à l'admin : l'agent l'apprend après le clic
« Seul l'admin d'agence peut clôturer » n'arrive qu'en réponse d'erreur. → si le
rôle est agent, désactiver le bouton avec l'explication en dessous (le rôle est connu
côté serveur). Impact : 🟠 · Effort : S

### C5. Saisie d'écriture sans rattachement à un lot
`ecritures.lot_id` existe (les rapports de gestion agrègent par lot du mandat) mais
le formulaire de saisie ne propose pas de lot : une écriture manuelle n'apparaît
jamais dans un rapport de mandat. → ajouter un sélecteur « Lot concerné (facultatif) ».
Impact : 🔴 · Effort : M

### C6. Tableau de bord : « 5 biens » mais des badges qui comptent des lots
« 5 biens » suivi de « 8 brouillon · 1 disponible · 1 loué » (des lots) : un débutant
ne peut pas comprendre. → « 5 biens · 10 lots » puis les badges. Impact : 🟠 · Effort : S

### C7. Données de démo qui polluent la lecture
Alerte « Essai 2 » (critique !), personne « Testeur » + son mandat inexploitable
(« à signer », sans lot possible), lot « rdc cenntre » (8 m² + faute de frappe).
→ nettoyage de la base de démo. Impact : 🟠 · Effort : S

## D. Déjà corrigé pendant le tour (pour mémoire)

- Pop-up d'alertes qui ne s'ouvrait jamais (drapeau posé à la fermeture désormais)
- Bandeau « À faire maintenant » sur le bail — se met à jour à chaque étape, disparaît quand tout est fait (vérifié en réel sur tout le cycle)
- `activer_bail` ne posait pas la date de début → échéancier impossible à générer
- Reçu partiel qui bloquait à jamais la quittance du mois → promotion à solde
- Boutons « Générer l'échéancier » / « Émettre les quittances » qui avalaient leurs erreurs
- Boutons de blocage vers une ancre de la même page qui n'ouvraient pas la section
- Formulaire imbriqué (hydratation) dans les appels de charges
- Nom du mandant « — » dans les rapports de gestion
- Dépôt d'un diagnostic depuis sa ligne qui enregistrait le mauvais type

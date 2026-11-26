# Relecture adverse du lot D7 — commit e9e46692 (parent fde4cbb4)

Lecture seule. Le commit a été extrait par `git archive` dans `D7R/src` ; sondes sans base, sans serveur, sans réseau.
Aucun fichier de `palier1` modifié par cette relecture (un autre travail modifie en ce moment des fichiers « artisan »
de cet arbre : ils ne touchent aucun fichier cité ici).

## Verdict

**Aucun défaut bloquant trouvé.** La garde tient : un particulier ne peut pas passer une première souscription sans les
huit faits du vendeur, par l'écran comme par l'action serveur, règle levée ou non ; le médiateur ne ferme plus rien dans
la garde ; aucune référence légale ajoutée ou modifiée ; mention de TVA inchangée ; aucune valeur du vendeur en dur
(sauf un commentaire, D7R-10). Trois défauts importants à traiter avant l'ouverture, le reste est mineur.

Contrôles rejoués sur le commit extrait : 15 fichiers de test ciblés, 366 tests réussis (dont le nouveau fichier D7,
garde-souscription, abonnement-proprietaire, reglage-souscription-action, conditions-empreinte, pages-legales).

## Défauts importants

### D7R-01 — L'article 17 des conditions affirme un recours qui n'existe pas (important)
- Preuve : `app/src/app/conditions/page.tsx:1067-1077`, rendu sans médiateur (sonde) : « le Client consommateur ou
  non-professionnel peut recourir gratuitement au médiateur de la consommation, qui sera désigné aux mentions légales
  dès l'adhésion de l'Éditeur. »
- Pourquoi c'est faux en l'état : la phrase est au présent (« peut recourir ») alors qu'aucun médiateur n'existe, et elle
  suppose une « adhésion » que rien n'établit — exactement ce que le commit a retiré des mentions légales et des
  courriels (« sans promettre un recours qui n'existe pas encore »). Les trois textes se contredisent : mentions
  légales et courriels disent « aucun n'est désigné », le contrat dit qu'on peut y recourir.
- Aggravant : le nouveau test fige cette phrase (`tests/vendeur-entrepreneur-individuel-d7.test.ts:172`).
- Correction minimale : réécrire la branche « sans médiateur » de l'article 17 sur le modèle des mentions légales
  (« aucun médiateur n'est désigné à ce jour ; ses coordonnées seront publiées aux mentions légales dès sa
  désignation »), sous une nouvelle version des conditions (empreinte de garde) AVANT l'ouverture des ventes — tant
  qu'aucun contrat payant n'est conclu, c'est le moment le moins coûteux. À défaut : décision explicite du dirigeant
  de vendre avec ce texte, après avis du juriste (l'auteur l'a posé en question, pas tranché).

### D7R-02 — Saisir le médiateur après l'ouverture referme les premières souscriptions jusqu'à une livraison de code (important)
- Preuve : `app/src/lib/garde-souscription-serveur.ts:47-54` compare l'empreinte de l'identité archivée à celle affichée,
  médiateur compris. Sonde (`D7R/sonde2-sortie.txt`) :
  `archive sans mediateur, mediateur saisi ensuite -> Les souscriptions sont en attente de la vérification de la version archivée des conditions générales.`
  Et l'archive refuse la même version avec un autre texte (`app/src/lib/conditions-versions-serveur.ts:213`) : il faut
  une nouvelle version, donc un déploiement.
- Effet : le médiateur « ne bloque plus » à l'ouverture, mais le jour où il est désigné et saisi en console, toute
  nouvelle vente à un particulier se ferme sans que la console le dise. Même effet pour toute retouche du vendeur
  (téléphone, adresse). Le mécanisme existait ; c'est ce commit qui le rend réel, et le texte de la rubrique
  « Médiateur » invite à saisir « après signature de la convention » sans prévenir
  (`app/src/app/admin/parametres/identite.tsx:10`). Les notes de l'auteur n'en parlent que pour la saisie du vendeur.
- Correction minimale : une phrase d'avertissement dans les deux rubriques de la console (« modifier ces champs après
  l'ouverture suspend les nouvelles souscriptions jusqu'à la publication d'une nouvelle version des conditions »), et
  l'inscrire dans le pas-à-pas du jour J. Idéalement, préparer dès maintenant la version « médiateur désigné ».

### D7R-03 — Forme juridique : une virgule suffit à sortir du régime « entrepreneur individuel » (important)
- Preuve : `app/src/lib/editeur.ts:120`, `/^(?:EI|entrepreneur individuel|entreprise individuelle)(?:\s|$)/i`. Sonde
  (`D7R/sonde-sortie.txt`) : non reconnus comme entrepreneur individuel, donc nom sans « EI » ET capital acceptés :
  « Entrepreneur individuel, nom commercial X », « Entrepreneur individuel(X) », « entrepreneur individuel. »,
  « EI, nom commercial X », « E.I. », « Micro-entrepreneur », « Auto-entrepreneur », « Entrepreneuse individuelle ».
- Effet public prouvé : avec « Entrepreneur individuel, nom commercial X », les mentions légales affichent
  `Capital social capital social (à venir)` (ligne `mentions-legales/page.tsx:36`), sans encadré d'alerte : la page
  annonce un capital à venir pour quelqu'un qui n'en a pas.
- Correction minimale : remplacer `(?:\s|$)` par `(?:[^\p{L}\p{N}]|$)` (drapeau `u`), ajouter « micro-entrepreneur »,
  « auto-entrepreneur », « entrepreneuse individuelle » ; un test par variante. Le cas réel prévu
  (« Entrepreneur individuel (nom commercial SAUVEXPERT) ») passe correctement.

## Défauts mineurs

### D7R-04 — La première souscription d'une agence reste ouverte sans vendeur quand la règle est levée
- Preuve : `garde-souscription.ts:77` ne force la garde que pour `nouvelleSouscriptionParticulier` ;
  `actions/abonnement.ts:271` passe `public_tarif === "proprietaire_direct"`. Sonde :
  `agence regle levee identite vide: null`.
- Portée réelle faible : il faut une organisation de type agence (hors V1 publique), la règle levée par le super admin,
  et les ventes ouvertes (ouverture refusée sans vendeur) puis un vendeur vidé ensuite (l'enregistrement d'une identité
  incomplète ne referme pas les ventes). Mais la carte dit seulement « les augmentations payantes peuvent continuer ».
- Correction : appliquer la garde à toute première souscription (`!souscrit`), ou le dire dans la carte.

### D7R-05 — La mention « EI » n'est vérifiée qu'à la saisie, et se contourne
- L'ouverture des ventes et la garde ne regardent que la présence des champs (`faitsManquants`) : une identité
  enregistrée avant ce commit (« NOM Prénom » + « Entrepreneur individuel ») ouvre sans « EI ». Sonde :
  `EI sans mention deja en base:` (liste vide).
- Contournements : « EI-CONSEIL Martin », « SOCIETE EI », « non entrepreneur individuel », « EI » seul → acceptés.
- Trop strict, mais message clair : « E.I. », « ei », « Ei », « Entrepreneur  individuel » (deux espaces),
  « entrepreneuse individuelle » → refusés. « EIRL », « Einstein », « EI2 » correctement refusés.
- Société saisie plus tard : non interdite (forme « SAS » : aucun contrôle EI, capital accepté) — conforme.
- Correction : rejouer le contrôle EI dans `reglerOuvertureVentes` ; accepter « E.I. » et les espaces multiples.

### D7R-06 — Deux phrases de console devenues inexactes (non touchées)
- `app/src/app/admin/sante/page.tsx:359` : « Les faits « à compléter » s'affichent « à venir » sur les mentions
  légales » — elles disent désormais « aucun organisme n'est désigné à ce jour ».
- `app/src/app/actions/identite-editeur.ts:18` : « Tant qu'un élément manque, la page qui le cite l'affiche
  « (à venir) » » — faux pour le médiateur.

### D7R-07 — Les nouveaux libellés longs ressortent ailleurs
- `CHAMPS_EDITEUR` sert aussi au journal (`admin/journaux/preuves.tsx:9`, « Champs modifiés ») et au message de refus
  d'archivage, passé en minuscules (`conditions-versions-serveur.ts:215`) : « notamment nom de l'éditeur (société :
  dénomination sociale ; entrepreneur individuel : nom et prénom suivis de « ei »), forme juridique (sas, sarl… ) ».
- Correction : libellé court dans `CHAMPS_EDITEUR`, aide longue dans un second dictionnaire affiché sous le champ.

### D7R-08 — Société saisie plus tard : les conditions la diraient « entrepreneur individuel »
- `conditions/page.tsx:173-174` : « Éditeur : l'entrepreneur individuel identifié aux mentions légales » est en dur
  (antérieur au commit). Vrai aujourd'hui ; faux le jour où une société est saisie, ce que la console permet.
- Réserves « adresse du siège » encore présentes, visibles seulement si l'adresse manque : `conditions/page.tsx:677`,
  `lib/courriers-contrat.ts:72`.
- Aucun autre mot de société appliqué au vendeur trouvé dans `app/src` (recherche : société, SAS, SARL, capital, RCS,
  siège social, représentant légal, dénomination).

### D7R-09 — E141 : exact pour le locataire et le propriétaire, approximatif pour l'artisan ; un reste voisin
- Vérifié sur `/compte/donnees` : le titulaire d'un espace y prépare et télécharge son archive (`archive.tsx`) ; tout
  compte y trouve « Recevoir une copie de mes données » (`lib/demandes-donnees.ts:4`) ; le locataire y lit le renvoi
  vers son bailleur. Exact pour ces deux profils.
- Artisan : « les autres comptes […] s'adressent à leur bailleur pour les données d'une location » l'englobe, alors
  que la page ne lui affiche justement aucun renvoi (`page.tsx`, `!estArtisan`). Correction : « et, pour un locataire,
  s'adressent à leur bailleur… ».
- Reste non corrigé, même promesse en d'autres mots : `confidentialite/page.tsx:719`, « après avoir exporté ce que
  vous souhaitez garder » (adressé à tous). Et `:171` cite un « renvoi au médiateur de la consommation » comme finalité.

### D7R-10 — Le vrai SIREN/SIRET est écrit dans un commentaire du code
- `app/src/lib/editeur.ts:128` : « 821 974 474 » et « 821 974 474 00032 ». Pas une valeur utilisée, mais la consigne
  était « rien en dur » et le fichier de test proclame « aucune donnée réelle ». Correction : exemple fictif.

### D7R-11 — Tests : pas affaiblis au-delà de la décision, mais trois preuves plus étroites qu'annoncé
- Les tests réécrits le sont pour la règle inversée (médiateur → vendeur) ; rien de désactivé ; la garde « sans
  vendeur » est testée champ par champ, à l'écran, dans l'action et à l'ouverture.
- « Le vendeur n'est nulle part présenté comme une société dans les conditions » (`…-d7.test.ts:186-193`) ne regarde
  que 80 caractères après le mot « Éditeur » dans la même phrase : une tournure placée avant, ou plus loin, passerait.
- Aucun test sur les variantes de forme (D7R-03), ni sur le chemin agence (D7R-04).
- `expect(r.erreur).not.toContain("médiateur")` (`garde-souscription.test.ts`) ne tient que parce qu'une autre erreur
  survient ; la preuve réelle est l'appel `abonnement_client_pose` qui suit.

### D7R-12 — Mise en page (lecture seule du JSX/CSS, non rendue)
- Formulaire de console : `grid gap-4 sm:grid-cols-2`, libellé en ligne puis champ `w-full`. À 390 px, une colonne,
  le libellé long passe sur 3-4 lignes : lisible, pas de débordement attendu (`min-w-0`). À partir de 640 px, deux
  colonnes : un libellé de 3 lignes à côté d'un libellé d'une ligne décale les champs d'une même rangée.
- Mentions légales : `dl` en une colonne sous 640 px, `dd` avec `overflow-wrap:anywhere` ; « 821 974 474 00032 » tient
  sur une ligne. Rien d'anormal attendu.
- Message d'erreur de l'ouverture : `<p role="alert">` sans la classe `err` (`blocage-souscription.tsx`), donc sans
  couleur d'alerte, alors qu'il porte désormais la liste des faits manquants.

## Points vérifiés sans défaut
- Chemins de paiement : `demarrerAbonnement` (seul appelant d'une page de paiement ; `creerSessionPaiement` de
  `lib/stripe.ts` n'a aucun appelant), `confirmerHausse`, changement de périodicité, reprise, portail, webhook.
  Aucun ne crée une première souscription de particulier hors de la garde. Renouvellements et clients existants : non
  touchés. Hausse de capacité règle levée, sans vendeur : toujours possible (choix assumé de l'auteur).
- Lecture de l'identité en échec : fermeture par défaut (garde et ouverture).
- Ouverture : contrôle puis écriture sous révision ; une saisie d'identité concurrente fait échouer l'écriture.
- Références légales : aucune ligne du diff de `app/src` n'ajoute ni ne modifie de référence ; « TVA non applicable,
  article 293 B du CGI » inchangée ; `conditions-versions.json` et la page des conditions non touchés.
- Fiches F37351, F31808, F36354 présentes dans `decisions/d7-fiches/` ; la citation « initiales « EI » » y figure.
- Aucun médiateur inventé ; aucune phrase « adhésion en cours » ou « Adhésion à venir » restante hors article 17.

## Ce que je n'ai pas pu vérifier
- Rendu dans un navigateur (390 px ou autre) : aucun serveur lancé, aucune capture.
- `tsc` : sur l'extraction, seules des erreurs dues aux types générés par Next absents (`PageProps`, `RouteContext`,
  import d'image) ; rien d'autre, mais ce n'est pas une preuve complète. ESLint et suite complète non rejoués.
- Tests adossés à la base (`reglage-souscription-base`, etc.) et parcours Playwright : non rejoués. Le parcours
  `e2e/souscription-sans-alerte-sortie.spec.ts` se saute seul si le bouton de paiement n'apparaît pas : avec la
  nouvelle règle, un banc sans vendeur saisi le sautera sans le dire.
- État de la production : identité déjà saisie ou non, version 2026-11-15 déjà archivée ou non (conditionne D7R-02),
  existence d'organisations de type agence (conditionne D7R-04).
- Facture Stripe réelle et réglages du compte Stripe.
- Le fond du droit : `decisions/REPONSES-JURISTE.md` dit que l'information sur le médiateur est due « dès l'ouverture
  aux particuliers » (niveau « analyse, texte à relire ») ; le dirigeant a décidé d'ouvrir sans. Non tranché ici.
- La trace écrite de la décision : `reponses-2026-11-24.md` (Q7) dit encore « société Sauve Expert » et « dès que le
  vendeur et le médiateur sont saisis » ; seule `LOTS.md` ligne 15 porte la version précisée le soir.

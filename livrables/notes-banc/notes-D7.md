# Lot D7 — identité du vendeur (décision Q7 du dirigeant, 24/11/2026)

Arbre : `palier1`, à partir de `fde4cbb4`. Un commit local, rien n'est poussé. Aucune écriture en production, aucun
réglage ouvert, aucune migration.

## 1. Comment l'identité du vendeur est portée (constat)

- Elle n'est **pas dans le code** : `EDITEUR` (`app/src/lib/editeur.ts`) est entièrement à `null`. Les valeurs vivent en
  base, table `supervision_identite` (colonne `valeurs`, liste fermée de clés), saisies par le super admin dans
  **/admin/parametres** (rubrique « Contact et entreprise »). `lireEditeur()` les superpose au code.
- Les mentions légales, les conditions, la confidentialité, le formulaire de rétractation et les courriels du contrat
  lisent tous cette même identité.
- Le régime de TVA, lui, est une constante du code : `REGIME_TVA = { nature: "franchise" }`.
- **Les factures d'abonnement sont fabriquées par Stripe.** Gerimmo n'y écrit qu'une chose : le pied de facture
  (`piedDeFacturePour`, « TVA non applicable, art. 293 B du CGI. »). Le nom, l'adresse et le SIREN imprimés en tête de
  facture viennent des réglages du **compte Stripe**, pas de Gerimmo.

Conséquence : aucune valeur du vendeur n'est codée en dur. Le lot rend les champs cohérents avec un entrepreneur
individuel et prépare la liste des valeurs à saisir (partie 5).

## 2. Ce qui est fait

**Médiateur : il ne bloque plus rien.**
- `app/src/lib/garde-souscription.ts` : la fermeture « coordonnées du médiateur… avant la première souscription » est
  retirée. À la place, la **première souscription d'un particulier est fermée tant qu'un fait requis du vendeur manque,
  même si le super admin a « levé le blocage »** (la levée ne vaut plus que pour les hausses de capacité). La garde est
  déplacée du médiateur vers le vendeur ; elle n'est pas affaiblie.
- `app/src/app/actions/reglage-souscription.ts` : le bouton « Ouvrir les souscriptions » **refuse** tant que l'identité
  du vendeur est incomplète ou illisible, et nomme ce qui manque. Refermer reste toujours possible. Le médiateur n'est
  pas demandé.
- Textes de la console alignés : carte « Blocage des abonnements », carte d'ouverture, /admin/sante, rubrique
  « Médiateur » (dite facultative pour ouvrir).

**Ce que disent les pages quand le médiateur est vide** (aucun médiateur inventé, aucune conformité affirmée) :
- Mentions légales : « Médiateur de la consommation : aucun organisme n'est désigné à ce jour. Ses coordonnées seront
  publiées sur cette page dès sa désignation. » puis où adresser une réclamation. La phrase « le consommateur peut
  recourir gratuitement à un médiateur compétent » ne s'affiche plus que si un médiateur est saisi.
- Courriel de confirmation d'abonnement, réponse qui clôt une réclamation, écran « Mon abonnement » avant paiement :
  « Médiateur de la consommation : aucun n'est désigné à ce jour ; ses coordonnées figureront dans les mentions légales
  dès sa désignation. » L'ancienne phrase disait « adhésion en cours », ce que rien n'établit.
- **Conditions générales : texte NON modifié.** L'article 17 dit déjà, sans médiateur : « … peut recourir gratuitement
  au médiateur de la consommation, qui sera désigné aux mentions légales dès l'adhésion de l'Éditeur. » Le modifier
  aurait exigé une nouvelle version des conditions (empreinte de garde, accord exprès des clients : Q15). Voir la
  question nouvelle n° 3.

**Entrepreneur individuel.**
- Libellés de saisie neutres (`app/src/lib/identite-editeur.ts`) : « Nom de l'éditeur (société : dénomination sociale ;
  entrepreneur individuel : nom et prénom suivis de « EI ») », « Forme juridique (SAS, SARL… ou « Entrepreneur
  individuel ») », « Capital social (sociétés seulement, facultatif) », « Adresse (siège de la société, ou adresse de
  l'entreprise individuelle) ». Libellés des manques : « le nom ou la dénomination de l'éditeur », « l'adresse de
  l'éditeur ».
- Contrôles de saisie quand la forme est « Entrepreneur individuel » : le nom doit porter « EI » ou « entrepreneur
  individuel » ; un capital social est refusé. Aucun champ propre aux sociétés n'est obligatoire (capital et numéro de
  TVA étaient déjà facultatifs ; la ligne « Capital social » ne s'affichait déjà pas pour un entrepreneur individuel).
- Mentions légales : deux lignes ajoutées, **SIREN** et **SIRET**, tirées du SIRET saisi (il n'était affiché sur
  aucune page publique).

**TVA.** Rien n'est changé : la mention et la référence d'article sont celles déjà dans le code (mentions légales,
conditions, pied de facture Stripe, courriel de confirmation, /tarifs).

**E141 (corrigé, purement factuel).** `app/src/app/confidentialite/page.tsx`, paragraphe « Fermeture de votre compte » :
« après avoir téléchargé vos données » devient « après avoir récupéré vos données si vous le souhaitez : le titulaire
d'un espace y télécharge son archive complète ; les autres comptes y demandent une copie des données de leur compte
(« Recevoir une copie de mes données ») et s'adressent à leur bailleur pour les données d'une location. » Aucune
fonction ajoutée. La page ne dit que « bailleur » : un test existant interdit le mot « gestionnaire » sur cette page
(V1 sans agence cliente).

## 3. Mention « entrepreneur individuel » / « EI » : ce qui a été lu

Lu le 24/11/2026 sur entreprendre.service-public.gouv.fr (copies texte dans
`/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/decisions/d7-fiches/`) :

- **Site internet** — https://entreprendre.service-public.gouv.fr/vosdroits/F37351 (« Vérifié le 13 octobre 2026 »).
  Pour une personne physique : « Nom et prénom, accompagnés de la mention « entrepreneur individuel » ou des initiales
  « EI » » ; « Adresse de domiciliation de l'entreprise, adresse mail et numéro de téléphone » ; identification selon
  l'activité : numéro d'inscription au RCS et/ou au RNE (activité commerciale), ou d'immatriculation au RNE (artisanale,
  libérale, agricole) ; numéro de TVA « lorsqu'il est applicable » ; hébergeur. S'y ajoute le directeur de la publication.
- **Facture** — https://entreprendre.service-public.gouv.fr/vosdroits/F31808 (« Vérifié le 11 août 2026 »). Vendeur
  entrepreneur individuel : « nom et prénom de l'entrepreneur individuel précédé ou suivi de la mention « Entrepreneur
  individuel ou EI » », adresse, numéro Siren. Franchise en base : « TVA non applicable, art. 293 B du code général des
  impôts ». La fiche cite en référence l'article R526-27 du code de commerce (« Dénomination EI »).
- **Patrimoines** — https://entreprendre.service-public.gouv.fr/vosdroits/F36354 (« Vérifié le 20 janvier 2026 ») : la
  dénomination est le nom ou nom d'usage « accompagné des mots « entrepreneur individuel » ou des initiales « EI » ».

Non lu : les articles de loi eux-mêmes (Légifrance inaccessible). Rien n'est présenté comme conforme. Seul ce qui est
écrit dans ces fiches est appliqué : la mention accompagne le nom, partout où le nom est repris.

## 4. Ce qui est vérifié (commandes et résultats réels)

Dans `palier1/app`, avec l'environnement du banc :

- `npx tsc --noEmit` → code de sortie 0.
- `npx eslint <fichiers modifiés>` → aucune sortie.
- `npx vitest run tests/vendeur-entrepreneur-individuel-d7.test.ts` → 30 tests réussis (nouveau fichier).
- Les 62 fichiers de test qui citent les modules modifiés (nouveau fichier compris) : 61 réussis, 1 sauté ; 1109 tests
  réussis, 1 sauté ; code de sortie 0.
- Suite vitest complète : voir partie 8.

Tests existants **modifiés parce qu'ils affirmaient l'ancienne règle** (chacun porte un commentaire « Lot D7 ») :
- `tests/garde-souscription.test.ts` : « ferme le parcours Stripe quand seul <champ du médiateur> manque » et « refuse
  le paiement même si le verrou facultatif est levé, sans médiateur » sont réécrits (sans médiateur, vendeur complet :
  le parcours s'ouvre ; sans vendeur : fermé, verrou levé ou non). « autorise le parcours de souscription malgré
  l'identité incomplète » (verrou levé) attend désormais le **refus** ; les tests voisins lèvent le verrou avec un
  vendeur complet.
- `tests/abonnement-proprietaire.test.ts` : « réglage levé, sans médiateur le paiement reste fermé » devient « sans
  vendeur le paiement reste fermé » ; un test ajouté (vendeur complet, sans médiateur : bouton de paiement présent,
  phrase « aucun n'est désigné »).
- `tests/console-identite-mediateur.test.ts` : la phrase « Pour un particulier, les coordonnées du médiateur restent
  requises avant une première commande » n'est plus attendue ; nouveaux textes attendus.
- `tests/courriers-contrat.test.ts`, `tests/retours-actions.test.ts`, `tests/stripe-evenements-courriers.test.ts` :
  « adhésion en cours » remplacée par « aucun n'est désigné à ce jour ».
- `tests/confidentialite-v1.test.ts` : « Adhésion à venir » remplacée par le nouveau texte des mentions légales.
- `tests/supervision-complete.test.ts` : nouveaux libellés des manques.
- `tests/reglage-souscription-action.test.ts` : l'identité du vendeur est fournie au test ; tests ajoutés (ouverture
  sans médiateur acceptée ; refusée pour chacun des huit faits du vendeur manquant ; refusée si lecture impossible).

Aucun test désactivé, aucune règle de sécurité ou RLS touchée.

## 5. Valeurs à saisir le jour de la publication

### 5.1 Console Gerimmo — /admin/parametres, « Contact et entreprise »

| Champ | Valeur à saisir | Origine |
|---|---|---|
| Nom de l'éditeur | `TAHIR Brahim EI` | avis Sirene du 24/11 + fiches F37351 / F31808 |
| Forme juridique | `Entrepreneur individuel (nom commercial SAUVEXPERT)` | avis Sirene (doit commencer par « Entrepreneur individuel ») |
| Capital social | laisser vide (la console refuse une valeur) | pas de capital |
| Adresse | `3 rue de l'Église, 91360 Épinay-sur-Orge` | décision « Publié mon adresse » |
| SIRET | `821 974 474 00032` | avis Sirene (la page affichera SIREN 821 974 474 et SIRET 821 974 474 00032) |
| Immatriculation (RNE ou RCS) | **À FOURNIR PAR LE DIRIGEANT** | absente de l'avis Sirene transmis ; ne pas inventer |
| Directeur de publication | **à confirmer** (a priori `TAHIR Brahim`) | non décidé par écrit |
| E-mail de contact | **à fournir** | non transmis |
| Téléphone de contact professionnel | **à fournir** | non transmis |
| TVA intracommunautaire | laisser vide | « TVA non applicable » |
| Médiateur (3 champs) | laisser vides | pas encore désigné |

Tant que les quatre valeurs « à fournir / à confirmer » manquent, la console **refuse d'ouvrir les souscriptions** et la
première souscription reste fermée : c'est voulu (vente impossible sans vendeur).

Rubrique « Prestataires » : sans les coordonnées de Vercel et de Supabase, les mentions légales gardent l'encadré
« Document en cours de finalisation ». Cela ne ferme pas les ventes.

### 5.2 Ordre des gestes
1. Saisir l'identité (5.1), enregistrer, relire /mentions-legales, /conditions, /confidentialite.
2. /admin/sante → rubrique « Versions des conditions » → archiver la version en vigueur des conditions. **Obligatoire après la
   saisie** : une nouvelle commande est refusée (« en attente de la vérification de la version archivée ») tant que
   l'identité archivée avec les conditions n'est pas celle affichée. Voir le point non vérifié n° 2.
3. Vérifier que la règle « Blocage des abonnements » est **active**.
4. Seulement après « je valide la publication » : /admin/parametres → « Ouvrir les souscriptions » (case à cocher).

### 5.3 Compte Stripe (hors Gerimmo : à faire par le dirigeant dans Stripe)
L'en-tête des factures d'abonnement vient de Stripe. À régler dans les informations publiques / de facturation du compte :
nom `TAHIR Brahim EI` (nom commercial SAUVEXPERT), adresse `3 rue de l'Église, 91360 Épinay-sur-Orge`, SIREN
`821 974 474`. Le pied « TVA non applicable, art. 293 B du CGI. » est posé par Gerimmo sur chaque client.

## 6. Ce qui n'est PAS vérifié

1. **La facture Stripe réelle.** Aucun appel à Stripe sur le banc. Je n'ai pas vu de facture imprimée : son en-tête
   dépend des réglages du compte Stripe, que je n'ai pas lus. Gerimmo ne contrôle pas que le nom y porte « EI ».
2. **L'état de la production.** Non lue (règle du banc). J'ignore ce qui est saisi aujourd'hui dans
   `supervision_identite`, et si la version en vigueur des conditions (`2026-11-15`) y est déjà archivée. Si elle l'est
   avec une autre identité, l'archivage sera refusé après la saisie du vendeur et les nouvelles commandes resteront en
   attente : il faudra publier une nouvelle version des conditions (changement de code). À contrôler en lecture seule
   avant le jour J.
3. **Les articles de loi.** Seules trois fiches officielles ont été lues.
4. **L'affichage dans un navigateur** et les parcours Playwright : non faits (partie 8).
5. Le parcours complet de paiement de bout en bout (Stripe réel) avec un vendeur sans médiateur.

## 7. Points à porter dans JURISTE.md

1. **Ouverture des ventes sans médiateur de la consommation** (Q7, Q65). Décision du dirigeant appliquée. Les mentions
   légales et les courriels disent qu'aucun médiateur n'est désigné ; les conditions (article 17, non modifiées) disent
   qu'il « sera désigné aux mentions légales dès l'adhésion de l'Éditeur ». Peut-on vendre à des consommateurs dans cet
   état ? Quelle information leur est due avant la commande, et dans les conditions, tant qu'aucun médiateur n'existe ?
   La phrase de l'article 17, qui parle d'un recours « gratuit » à un médiateur pas encore désigné, est-elle à réécrire ?
2. **Tenue de la mention « TVA non applicable »** (complète la partie 6, point 13, et Q66). Le vendeur est un
   entrepreneur individuel dont l'activité déclarée est « formation continue d'adultes » (85.59A), actif depuis le
   03/02/2026 ; il vend un logiciel par abonnement. La franchise en base lui est-elle applicable pour cette activité, et
   jusqu'à quel seuil ? Quelle référence imprimer : la fiche F31808 lue le 24/11/2026 (« vérifiée le 11 août 2026 »)
   écrit toujours « art. 293 B du code général des impôts », alors que l'alerte du point 13 cite une autre fiche qui
   annonce une référence nouvelle depuis le 01/09/2026. Rien n'est changé dans le code.
3. **Publication de l'adresse personnelle.** Le dirigeant a décidé de publier « 3 rue de l'Église, 91360
   Épinay-sur-Orge ». La fiche F37351 demande l'« adresse de domiciliation de l'entreprise ». Est-ce bien cette adresse
   qui est due ? Une adresse de domiciliation distincte du domicile serait-elle admise, et que faudrait-il faire ?
4. **Mention « EI ».** Appliquée d'après les fiches (nom et prénom suivis de « EI »). Le nom commercial SAUVEXPERT
   peut-il ou doit-il figurer à côté, et sous quelle forme ? Les articles (code de commerce, art. R526-27, cité par la
   fiche) n'ont pas été lus.
5. **Immatriculation.** La fiche F37351 demande un numéro d'inscription au RCS et/ou au RNE selon l'activité. Quel
   registre et quel numéro pour ce vendeur ? L'avis Sirene ne le dit pas. Le champ reste obligatoire dans Gerimmo.
6. **Directeur de la publication** : est-ce l'entrepreneur lui-même, et faut-il autre chose que son nom ?
7. **Factures émises par Stripe** : leur en-tête doit-il porter « EI », l'adresse et le SIREN de la même façon que le
   site ? (Mentions lues dans F31808 ; réglage hors de Gerimmo.)

## 8. Résultats finaux des contrôles

Journaux : `/tmp/claude-0/-home-user-GERIMMO-V4/1f8c431f-1a0a-5bfc-8fed-07ef6fe971d8/scratchpad/decisions/d7-vitest-cibles.log`,
`…/decisions/d7-vitest-complet.log`, `…/decisions/d7-vitest-MAUVAIS-ARBRE-integ-fde4cbb4.log`, `…/decisions/d7-build.log`.

- `npx tsc --noEmit` → 0. `npx eslint <22 fichiers modifiés + le nouveau test>` → 0, aucune sortie.
- Tests ciblés (62 fichiers) → 61 réussis, 1 sauté, 1109 tests réussis ; code de sortie 0.
- **Suite vitest complète** dans `palier1/app` (`npx vitest run --maxWorkers=1`, après la fin de la vérification du
  banc, `E2E_EXIT=0` lu) : 1056 fichiers réussis, 7 en échec, 4 sautés ; 15 634 tests réussis, 3 en échec, 37 sautés.
  Les 7 fichiers en échec ne touchent aucun fichier du lot :
  - `lot2-auth-reel`, `lot3-notifications-base` : déjà en échec dans la vérification de référence du banc
    (`apres-d3b-vitest.log` : « Service fictif local exigé », « Base Lot3 fictive obligatoire ») ;
  - `api-isolation` (1 test), `exercice-restauration` (1 test), `ux-accueil-dirigeant-navigateur`,
    `ux-console-direction-navigateur` : en échec **à l'identique sur l'arbre non modifié `fde4cbb4`** (essai témoin
    lancé par erreur sur `integ/app` juste avant, journal « MAUVAIS-ARBRE ») — navigateur sans tête introuvable dans
    mon environnement, état de la base du banc après le passage des parcours ;
  - `lecteur-document-navigateur` (1 test) : fichier `public/pdfjs/…/pdf.worker.min.mjs` absent de cet arbre de
    travail au moment de l'essai (il est fabriqué par l'étape de construction).
  La vérification de référence du banc donnait 2 fichiers en échec : l'écart vient de mon environnement d'essai, pas
  du lot. **À rejouer sur le banc d'intégration** pour le confirmer.
- **Non fait : construction et navigateur.** `npm run build` échoue dans `palier1/app` (le dossier `node_modules` y est
  un lien vers `integ/app`, que le compilateur refuse) : aucun serveur lancé, aucun parcours Playwright, aucune capture
  d'écran. Les rendus sont vérifiés par rendu serveur dans les tests, pas dans un navigateur. Le parcours
  `e2e/blocage-souscription.spec.ts` n'a pas été rejoué ; les textes qu'il lit (« Blocage levé », « Règle active »,
  « Règle levée », libellés des boutons) sont inchangés. À vérifier à l'œil sur le banc d'intégration : la longueur des
  nouveaux libellés du formulaire « Contact et entreprise » sur téléphone, et les deux lignes SIREN / SIRET.
- Aucun serveur laissé en marche (aucun n'a été lancé).

## 9. Questions nouvelles pour le dirigeant

1. **Quatre valeurs manquent pour ouvrir les ventes** : le numéro et le registre d'immatriculation (RNE ou RCS), le
   nom du directeur de la publication, l'adresse e-mail de contact, le téléphone professionnel. Sans elles, la console
   refuse l'ouverture. Option prise : rien n'est inventé ; ces champs restent obligatoires.
2. **La levée du blocage ne permet plus une première vente sans vendeur.** Avant, « Lever le blocage » permettait de
   vendre avec une identité incomplète (si le médiateur était saisi). Maintenant, elle ne vaut plus que pour les hausses
   de capacité. Option prise parce que vous avez dit que les ventes s'ouvrent quand le vendeur est saisi. Réversible en
   une ligne (`app/src/lib/garde-souscription.ts`).
3. **Conditions générales : faut-il réécrire l'article 17 ?** Il parle d'une « adhésion » à venir. Le réécrire demande
   une nouvelle version des conditions, avec l'accord exprès des clients (votre décision Q15). Option prise : texte
   laissé tel quel, question posée au juriste.
4. **Nom commercial SAUVEXPERT : où l'afficher ?** Il n'existe pas de champ dédié. Option prise : il se saisit dans la
   forme juridique, entre parenthèses, et s'affiche donc sur les mentions légales et la confidentialité (pas dans les
   conditions ni sur le formulaire de rétractation, qui reprennent le seul nom). Un champ dédié demanderait une
   modification de la base (lot à part).
5. **Compte Stripe** : c'est vous qui réglez l'en-tête des factures dans Stripe (5.3). Voulez-vous que je prépare un
   pas-à-pas ?

# Gerimmo — Audit indépendant après publication de la PR #347

- **Version auditée** : `8c0449c635f949dbf629d23ec3318cabe82cd11c`, servie en production (`/api/sante`).
- **Date** : 19 novembre 2026, de 18 h 50 à 21 h UTC.
- **Ventes payantes** : fermées (vérifié en base).

**Méthode**
- **Production en lecture seule par défaut.** Les écritures ont été faites avec l'accord du dirigeant :
  - trois comptes fictifs `delivered+…@resend.dev` (propriétaire avec double authentification, son locataire, une SCI), purgés ensuite ;
  - la recette automatisée n° 52.
- **Banc isolé** fidèle à la CI, construit à 8c0449c6. Les sondes destructrices tournent dans des transactions annulées.
- **Aucun** code modifié, aucune publication, aucun paiement, aucun envoi engageant.
- Un test non exécuté est dit **non testé**, jamais réussi.

---

## 1. Verdicts

| Question | Verdict | En une phrase |
|---|---|---|
| Accueillir **10 propriétaires particuliers gratuits** | **GO** | Les deux P1 qui les concernaient (SEC-1 et double authentification) sont corrigés et vérifiés en production. |
| Accueillir **des SCI** | **GO, avec accompagnement** | Le blocage du représentant (SCI-1) est corrigé en production. Reste SCI-2 : la fiche de la société naît sans coordonnées, et la préparation d'un contrat par Gerimmo attend qu'on la complète. À signaler aux SCI pilotes, à corriger rapidement. |
| **Ouvrir les abonnements payants** | **NO GO** | Rien n'a changé : aucun médiateur de la consommation, paiement jamais exercé en réel, aucun antivirus, alerte du dirigeant non constatée. |

**Aucun P0. Aucun P1 restant parmi les trois corrections demandées.**

---

## 2. Les trois corrections de la PR #347

### 2.1 SEC-1 — Sécurité des documents : **corrigé, vérifié sur le banc et en production**

**Ce que fait la PR** (migration `20261119142934_securite_provenance_fichiers`) :
- Un déclencheur et deux politiques restrictives imposent que le chemin d'un fichier commence par l'identifiant de
  l'organisation de sa fiche. Les chemins `..`, `//`, `%`, `\` et les caractères de contrôle sont refusés.
- Un lien de document doit appartenir à la même organisation que le document.
- Les lectures privilégiées sont filtrées par la même règle : pièces du locataire, fichiers de l'artisan, document du
  locataire, journal d'accès.
- **Conservation** : une fiche étrangère n'est ni vidée ni mise en file, et le refus est journalisé. Un fichier encore
  utilisé par une autre fiche vivante n'est pas mis en file.
- **Purge de nuit et purge manuelle du superviseur** : elles passent par `reserver_fichiers_purge`, qui revérifie
  avant suppression que le fichier n'est plus référencé et que l'objet est bien celui mis en file. Un fichier réservé
  ne peut plus être rattaché ni recréé.

**Vérifié sur le banc isolé**, transactions annulées (`preuves/sondes/sec1.sql`, `purges.sql`, `purge-nuit.sql`) :

| Attaque ou cas | Résultat |
|---|---|
| Un propriétaire crée une fiche `document_test` ou `justificatif` visant le fichier d'un autre espace | ✅ Refus « Le fichier n'appartient pas à cette organisation. » |
| Chemin piégé dans son propre préfixe (`<org>/../<autre>`) | ✅ Refusé |
| Fiche légitime, puis modification de son chemin vers l'autre espace | ✅ Refusé (aucun droit de modification) |
| Lien d'un document de l'autre espace vers la fiche de son locataire | ✅ Refusé |
| Mise en file de purge directe, ou modification d'une entrée en file, par un utilisateur | ✅ Refusé (permission) |
| Appel de `reserver_fichiers_purge` par un propriétaire | ✅ Refusé |
| Lecture de l'objet de l'autre espace par le propriétaire | ✅ 0 objet |
| **Fiche malveillante antérieure à la correction** (insérée sans déclencheurs), conservation à 0 mois | ✅ Fiche non vidée, fichier de l'autre espace **non** mis en file, refus journalisé (`purge_provenance_refusee`) |
| Doublon légitime : une fiche de test expire, une autre fiche vivante garde le même fichier | ✅ Fiche vidée, fichier **non** mis en file |
| Purge de nuit : entrée en file visant un fichier encore référencé | ✅ Non réservé |
| Purge de nuit : objet remplacé après la mise en file | ✅ Non réservé |
| Purge de nuit : fichier réellement orphelin | ✅ Réservé, comme prévu |
| Un fichier réservé est rattaché à une nouvelle fiche | ✅ Refus « réservé pour suppression » |
| Modification ou suppression d'un objet par un utilisateur, via SQL | ✅ 0 ligne affectée |
| Tests de la PR (`sec1-documents-base`, `cron-purge-route`, `purge-manuelle-arret`, `diagnostic-piece-partagee-base`…) | ✅ Réussis (voir § 5) |

**Vérifié en production** (lecture seule, et comptes fictifs pour l'isolement) :
- 4 migrations enregistrées (515 au total) ; 6 déclencheurs et 6 politiques présents.
- **0 document existant** avec un chemin hors de son organisation : aucune perte de visibilité pour les données réelles.
- Les 26 entrées en file avaient leur identifiant d'objet figé ; il en va de même pour les 33 entrées actuelles.
- **Isolement réel** :
  - La SCI fictive télécharge son bail signé : stockage 200, PDF.
  - Le propriétaire d'un autre espace, **double authentification validée**, et son locataire en sont empêchés :
    - pages de téléchargement : 403 ou 404 ;
    - API `documents` : aucun résultat ;
    - signature d'URL et lecture directe dans le stockage : « Object not found ».

### 2.2 Double authentification : **corrigée, vérifiée en production sur le vrai service d'authentification**

**Ce que fait la PR** :
- La base refuse toute requête de l'API (`PT428`) d'une session sans second facteur, dès qu'un facteur vérifié existe
  sur le compte. Le niveau est lu dans le jeton signé, et l'existence du facteur dans Auth, jamais dans les métadonnées
  modifiables par l'utilisateur.
- Une politique restrictive applique la même règle au stockage.
- Le serveur du site redirige alors vers `/securite`.

**Vérifié en production**, avec un compte propriétaire fictif (`preuves/production/…`) :

| Étape | Résultat |
|---|---|
| Activation (clé lue, code calculé) | ✅ « Double authentification activée » |
| Reconnexion avec le **mot de passe seul** | ✅ Toutes les pages renvoient vers `/securite?suite=…` : `/espaces`, l'espace, les loyers, `/compte`, les documents |
| Même session, **appel direct à l'API** | ✅ `organizations` et `rpc user_org_ids` : **428 « Vérifiez le second facteur de votre compte. »** |
| **Code faux** | ✅ « Ce code est incorrect ou a expiré. », on reste sur `/securite` |
| **Code juste** | ✅ Retour à la page demandée ; jeton `aal2`, même session ; API 200 |
| **Déconnexion** | ✅ L'ancien jeton est refusé : 401 « La session a pris fin » |
| **Locataire** sans second facteur | ✅ Invitation acceptée, espace ouvert, reconnexion avec le seul mot de passe : aucune régression |
| Propriétaire SCI sans second facteur | ✅ Parcours complet sans gêne |

**Stockage** :
- En production, la liste du stockage revenait vide dans les deux cas, mais l'espace ne contenait aucun fichier : ce
  n'est **pas probant**.
- Sur le banc (`preuves/sondes/mfa-stockage.sql`), avec un facteur vérifié : session `aal1` → **0 fichier lisible**
  sur 4 ; session `aal2` → 4. Un compte sans facteur garde ses 4 fichiers.

**Non testé** : un appel direct au service d'authentification avec une session `aal1`, par exemple pour changer le
mot de passe. Il ne donne pas accès aux données, mais les réglages Auth correspondants ne sont pas visibles depuis le
dépôt.

### 2.3 SCI : **corrigée, vérifiée en production de l'inscription à la quittance**

**Vérifié avec une SCI fictive** :

| Étape | Résultat |
|---|---|
| Formulaire public | ⚠️ Il ne demande toujours pas le prénom (nom, e-mail, qualité, nom de la société). |
| Écran de confirmation (lien du courriel) | ✅ Le prénom est **visible et obligatoire** : envoi bloqué tant qu'il est vide. La base refuse aussi une SCI sans prénom (`initialiser_espace_proprietaire`). |
| Création | ✅ Espace « SCI Audit Platanes 8C04 » ; fiche titulaire = la société (qualité SCI) ; fiche « Personne physique » de la gérante **avec son prénom** |
| Détention | ✅ La SCI détient 100 % du lot dès sa création |
| Représentant | ✅ La gérante est proposée ; **« Représentant enregistré pour ce bail : Sophie Gérante-Audit »** du premier coup |
| Justificatif et persistance | ✅ En base : 1 pouvoir, justificatif « Statuts » lié à la fiche de la société, empreinte identique au document, sans date de fin |
| Diagnostics et DPE exigé | ✅ |
| Bail activé par dépôt du PDF signé | ✅ Fichier rangé sous `<organisation>/baux-papier/…` |
| Loyers | ✅ 300 € → reçu ; +440 € → quittance de 740 € exacte |
| Quittance | ✅ Bailleur = la société, adresse du profil. ⚠️ « Je soussigné(e) SCI … » sans nommer la gérante (SCI-3) |
| Récapitulatif du bail | ⚠️ « Adresse du propriétaire / e-mail des parties à compléter » : la fiche de la société naît sans coordonnées (SCI-2) |

---

## 3. Autres vérifications

| Point | Résultat | Source |
|---|---|---|
| **Recette de production n° 52** sur 8c0449c6 | ✅ Succès, avec purge de ses comptes | Run 44592995140 |
| **Chaîne de publication** | ✅ Toutes vertes | CI 44570841770 ; sauvegarde 44578889354 ; restauration 44580264894 ; migrations 44580705572 et 44587795568 ; publication contrôlée n° 17 à 19 |
| **Erreurs serveur depuis la publication** | ✅ 0 erreur Vercel sur 6 h. Les 4 « notification_echec » du journal viennent de la recette : envois aux artisans suspendus en pilote, comportement attendu. | Vercel, `tech_log` |
| **Particulier et locataire** | ✅ Inscription, confirmation, double authentification, invitation du locataire, acceptation, espace locataire, reconnexion. ⏸ Bail, loyers et quittance d'un particulier non rejoués en production : il aurait fallu déposer des fichiers sur ce compte, ce qui n'était pas convenu. Couverts par la SCI ci-dessus (même code), par la recette n° 52 et par la suite navigateur (§ 5). | production, banc |
| **Isolement entre organisations** | ✅ Production (§ 2.1). Banc : voir § 5, sonde des fonctions. | |
| **Téléchargements et droits** | ✅ Propriétaire légitime 200 ; tiers 403, 404 ou « Object not found » ; ancien jeton 401 | production |
| **Loyers, paiements partiels, quittances** | ✅ En production (SCI) | |
| **Charges et régularisations** | ✅ Suite navigateur sur le banc. ⏸ Non rejouées en production. | banc |
| **Alerte quotidienne du dirigeant** | ⏸ **Non vérifiable ce soir.** Prochain passage le 20/11 à 04 h 00 UTC. Dernier état : 8 échecs, du 12/11 au 19/11 ; destinataire corrigé le 19/11 à 11 h 27 UTC. | `relais_alertes_envois` |
| **Purge des fichiers d'audit** | ⏸ **Non vérifiable ce soir.** Passage le 20/11 à 03 h 40 UTC (04 h 40, heure de Paris). La file contient **33** fichiers : les 26 annoncés plus les 7 du parcours SCI de ce soir. Tous ont leur identifiant d'objet figé et ne sont plus référencés par aucune fiche, ils devraient donc être réservés puis supprimés. | `purge_fichiers` |

Un contrôle automatique est programmé le 20/11 à 04 h 15 UTC pour constater la purge et l'alerte, puis mettre ce
rapport à jour.

---

## 4. Anomalies

### P0 — aucune. P1 — aucune.

### P2

| N° | Constat | Preuve | Impact | Correction |
|---|---|---|---|---|
| **SCI-2** | La fiche de la société naît sans e-mail ni adresse, alors que le profil les contient. | Base (fiche société : `email` et `adresse` vides) ; récapitulatif du bail « Adresse du propriétaire / e-mail des parties à compléter » | Une SCI qui veut **faire préparer son contrat par Gerimmo** doit d'abord deviner qu'il faut compléter la fiche de la société. Le dépôt d'un bail signé sur papier et la quittance fonctionnent. | Recopier les coordonnées du profil sur la fiche de la société à sa création. |
| **OPS-1** | Alerte du dirigeant non constatée : 8 échecs, du 12/11 au 19/11. | `relais_alertes_envois` | Panne silencieuse possible des traitements. | Constater l'envoi du 20/11 ; prévoir un second canal. |
| **COM-1** | Aucun médiateur de la consommation : « Adhésion à venir ». | `/mentions-legales` | Bloquant pour la vente à des consommateurs (**à valider juridiquement**). | Adhérer avant l'ouverture des ventes. |
| **COM-2** | Paiement Stripe jamais exercé en réel (0 abonnement). | Base | Risque sur le premier encaissement. | Souscription réelle de bout en bout, puis remboursement. |
| **SEC-3** | Aucun antivirus sur les dépôts. | `docs/antivirus-depots.md` (version publiée) | Un PDF malveillant d'un locataire ou d'un artisan est visible sans analyse. | Quarantaine avec analyse. |
| **SEC-4** | Pas de CAPTCHA ni de limitation par compte côté application ; les réglages Supabase Auth ne sont pas vérifiables. | Code | Devinette de mots de passe. Le risque est réduit pour qui active la double authentification. | Activer le CAPTCHA et les limites Auth. |

### P3

| N° | Constat | Correction |
|---|---|---|
| **SCI-3** | La quittance d'une SCI dit « Je soussigné(e) SCI … » sans nommer qui signe. | « représentée par … » ; **à valider juridiquement**. |
| **SCI-4** | Le formulaire public SCI ne demande pas le prénom ; l'écran de confirmation le rattrape. | Le demander dès le formulaire public, pour éviter une surprise. |
| **UX-1** | Le locataire invité qui vient de choisir son mot de passe est renvoyé à l'écran de connexion (« mot de passe modifié ») et doit le ressaisir avant d'accepter l'invitation. | L'ouvrir directement sur l'invitation, comme pour l'inscription d'un propriétaire. |
| **MFA-1** | Appel direct au service d'authentification avec une session `aal1` non testé. | Vérifier les réglages Auth (second facteur exigé pour changer le mot de passe). |
| **TEC** | Points P3 de l'audit 341b770f inchangés par la PR (TEC-1 à TEC-6). | Lors d'une prochaine livraison. |

---

## 5. Tests rejoués à 8c0449c6

| Suite | Résultat |
|---|---|
| Tests de la PR (10 fichiers : SEC-1, purges, double authentification, inscription SCI…) | **97 réussis, 3 ignorés** (ils exigent un PostgREST réel, absent du banc), 0 échec |
| Suite navigateur complète (banc fidèle à la CI) | **282 réussis, 0 échec, 3 ignorés**, en 10,3 min. Elle inclut le changement de mot de passe et le cycle du second facteur (activation, reconnexion, code faux, code juste, retrait). |
| Sonde des 420 fonctions SECURITY DEFINER, sous deux profils : un propriétaire étranger visant Alpha, et un locataire visant la gestion d'Alpha | **Aucun contournement.** Les retours non vides sont tous les propres données de l'appelant ou des tarifs publics. Le locataire est refusé sur toutes les actions de gestion. La nouvelle fonction `reserver_fichiers_purge` refuse les deux profils. |

---

## 6. Ferais-je confiance à Gerimmo pour mes biens ?

**En nom propre, oui, dès maintenant, pour un pilote.**
- Hier, deux défauts m'auraient retenu : le fichier d'un autre client pouvait être visé, et la double authentification
  ne protégeait rien. Les deux sont corrigés à la racine, dans la base, et je les ai éprouvés comme un attaquant le
  ferait.
- Les montants, reçus et quittances sont justes.
- Mes fichiers ne sont lisibles ni par un autre propriétaire ni par son locataire.

**En SCI, oui.** Il faudrait toutefois qu'on me dise de compléter la fiche de ma société avant de faire préparer un
bail par Gerimmo.

**Je ne paierais pas encore un abonnement**, pour trois raisons :
- personne n'a encore payé en réel ;
- il n'y a pas de médiateur en cas de litige ;
- tant que l'alerte du fondateur n'est pas constatée, une panne de nuit peut passer inaperçue.

---

## 7. Données de test et confidentialité

**Créé en production, avec accord** :
- 3 comptes fictifs ;
- 2 espaces ;
- 4 fiches de personnes ;
- 1 bien, 1 bail, 2 encaissements, 1 quittance ;
- 7 PDF fictifs (statuts, diagnostics, bail papier) ;
- 1 second facteur de test ;
- 1 invitation de locataire.

Les courriels sont partis uniquement vers des boîtes de test Resend.

**Supprimé le 19/11 au soir** avec la logique de `e2e/recette-production/purger.sql` et ses garde-fous. Vérifié après :
- 0 compte, 0 espace et 0 fiche d'audit ;
- 0 second facteur orphelin ;
- totaux revenus à 10 comptes, 6 espaces, 13 biens, 11 baux, 51 documents, 0 encaissement ;
- ventes fermées.

Les 7 PDF sont dans la file de purge, qui en compte 33 au total, et seront supprimés la nuit du 20/11.

**Secrets** :
- Mot de passe et clé du second facteur générés et gardés localement dans des fichiers protégés, puis détruits.
- Les jetons à usage unique de confirmation, de récupération et d'invitation ont été lus en base, uniquement pour ces
  comptes fictifs, afin de simuler le clic dans le courriel. Ils ont été consommés et figurent dans aucune preuve.

**Données personnelles** : ce rapport n'en contient aucune.

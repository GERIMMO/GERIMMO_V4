# Corrections après l'audit de la PR #347 — 19 novembre 2026

- **Branche :** `claude/corrections-post-pr347`, partie de `main` à `8c0449c6` (la version en production).
- **État (mise à jour du 19/11, 23 h 30 UTC) :** **publiée en production** par la PR #348, à la demande du dirigeant.
  - `main` = `be3bf5b0` ;
  - 4 migrations appliquées à 23 h 09 UTC ;
  - publication contrôlée réussie à 23 h 12 UTC ;
  - recette n° 53 réussie, avec nettoyage vérifié.

  Détail en section 8.
- **Aucune donnée réelle touchée.** Tous les essais ont tourné sur le banc isolé, avec des données fictives.

Ce rapport fait suite à `livrables/audit-pr347-20261119/RAPPORT.md`. Il répond à deux questions : qu'est-ce qui a
été corrigé, et qu'est-ce qui ne peut pas l'être depuis le code ?

---

## 1. En bref

| Corrigé sur la branche | Reste hors de portée du code |
|---|---|
| SCI-2, SCI-3, SCI-4 (SCI) | COM-1 : adhérer à un médiateur de la consommation |
| UX-1 (locataire invité) | COM-2 : premier paiement Stripe réel |
| OPS-1, en partie : alerte de secours dans la console | OPS-1 : constater la réception de l'alerte du 20/11 |
| TEC-1 (Next 16.4.6), TEC-3, TEC-4, TEC-5 | SEC-3 : choisir et brancher un antivirus |
| | SEC-4 et MFA-1 : CAPTCHA et réglages Supabase Auth |
| | TEC-6 : secret du suivi Resend en production |
| | Validation juridique de la quittance SCI |
| | Publication : PR, CI, migrations, fusion, Vercel |

---

## 2. Corrections faites

| N° | Constat de l'audit | Ce qui change | Commit |
|---|---|---|---|
| **SCI-2** (P2) | La fiche de la société naît sans e-mail ni adresse. Le récapitulatif du bail réclame « Adresse du propriétaire » et « Adresse e-mail des parties ». | À la création de l'espace, la fiche de la société reçoit l'e-mail du compte. Quand le propriétaire enregistre son profil, l'adresse, le téléphone et l'e-mail sont recopiés sur la fiche de la société, **dans les seuls champs vides**. | `bcd0bb1d`, `7ed90140` |
| **SCI-3** (P3) | La quittance d'une SCI dit « Je soussigné(e) SCI … » sans nommer qui signe. | « Je soussigné(e) *Prénom Nom*, agissant pour le compte de *Société*… », signée « *Société*, représentée par *Prénom Nom* ». Sans représentant actif, le texte ne change pas. **Formulation à valider par un juriste.** | `2346f024` |
| **SCI-4** (P3) | Le formulaire public SCI ne demande pas le prénom. | Champ « Votre prénom » obligatoire pour une SCI, une SCI familiale ou une personne morale ; refus côté serveur sans lui, saisies conservées. Règle partagée avec l'écran de confirmation. | `75e51f6c` |
| **UX-1** (P3) | Le locataire invité doit ressaisir son mot de passe juste après l'avoir choisi. | Il arrive directement sur son invitation, connecté. La session du lien est fermée, comme pour l'inscription d'un propriétaire. | `41b7da62`, `cbb72c7e` |
| **OPS-1** (P2), en partie | L'alerte quotidienne a échoué 8 jours de suite ; l'e-mail était le seul signal. | Bandeau sur « Aujourd'hui » (`/admin/brief`) et sur la page Santé (`/admin/sante`) : alerte non partie, échec du jour après 5 h 30 (heure de Paris), envoi partiel, registre illisible. Lecture seule, aucune migration. | `eba3b1ee`, `9c8f9a75` |
| **TEC-1** (P3) | Next 16.4.2 a des avis de sécurité modérés. | Next et `eslint-config-next` en 16.4.6. `npm audit` : 0 vulnérabilité. | `33d32f60` |
| **TEC-3** (P3) | `/api/sante` révèle aux anonymes l'absence de la clé de service. Le webhook Stripe nomme les variables manquantes. | Message générique pour les anonymes, détail dans les journaux du serveur. Les champs lus par le contrôle de publication et la surveillance ne changent pas. | `b90cfd2e` |
| **TEC-4** (P3) | Le webhook Zoho Sign peut être rejoué. | Une livraison est reconnue (identifiant, opération, empreinte du corps) et acceptée une fois par heure. Le limiteur existant est réutilisé : aucune migration. | `f2ebe97c` |
| **TEC-5** (P3) | L'export comptable renvoie le texte d'erreur de PostgREST. La colonne « annulé » n'est pas échappée. | Dates validées (400 sinon), message d'erreur fixe, colonne « annulé » échappée comme les autres. | `07e3a4d7` |

---

## 3. Décision prise sur délégation : l'adresse e-mail partagée

Vous avez écrit « Pour la correction, fait au mieux ». Voici ce que j'ai retenu.

- **Le problème :** deux fiches vivantes d'un même espace ne pouvaient pas porter la même adresse. Or la société et
  son gérant ont presque toujours celle du compte.
- **La règle retenue :** unicité **par nature**. Une société peut partager l'adresse de la personne physique qui la
  gère. Deux personnes physiques, ou deux sociétés, ne le peuvent toujours pas. Le compte reste unique sur toute la
  plateforme.
- **La conséquence traitée :** deux recherches prenaient « la première fiche trouvée » pour une adresse. Elles
  départagent désormais :
  - **import du parc** (le locataire d'une ligne) : la personne physique d'abord ;
  - **reprise comptable** (le propriétaire d'une ligne) : la fiche qui détient des lots, puis la société.

  Les autres recherches par e-mail visent le compte, pas les fiches : elles ne sont pas concernées.
- **À confirmer par vous.** Aucune source métier ne fonde cette règle. Elle est consignée comme telle dans le wiki
  (« Compte, personne et adhésion »).

---

## 4. Migrations à appliquer

Quatre migrations, à appliquer **uniquement par le circuit protégé** (« Migrations Supabase » sur GitHub), dans cet
ordre :

| Migration | Effet | Données |
|---|---|---|
| `20261119200000_email_partage_societe_gerant` | Index d'unicité par nature à la place de l'index strict. | Aucune modifiée. L'ancien index étant plus strict, la création ne peut pas échouer sur les données existantes. |
| `20261119200100_coordonnees_fiche_societe` | E-mail du compte sur la fiche de la société à la création ; nouvelle fonction de recopie du profil. | Aucune modifiée à l'application. Les fiches existantes se complètent au prochain enregistrement du profil. |
| `20261119200200_quittance_representant_societe` | La quittance lit le représentant actif d'une société. | Aucune. |
| `20261119200300_recherche_email_par_nature` | Départage des deux recherches par e-mail. | Aucune. |

Chacune se rejoue sans effet et a son script de retour arrière dans `app/supabase/retours-arriere/`. L'ordre des
retours est donné dans le LISEZ-MOI de ce dossier. Le retour de `…200000` refuse dès qu'une société et son gérant
partagent une adresse : il faut alors corriger en avant.

---

## 5. Tests

Banc isolé fidèle à la CI : bases PostgreSQL jetables, émulateur Supabase local, application construite
(`next start`). Données fictives uniquement.

Résultats sur le dernier commit de la branche (`bba781a2`) :

| Contrôle | Résultat |
|---|---|
| Lint, vérification des types | ✅ 0 erreur |
| `npm audit` (dépendances livrées) | ✅ 0 vulnérabilité |
| **Suite navigateur complète** (bases neuves, application reconstruite) | ✅ **281 réussis, 0 échec**, 3 ignorés (comme avant), en 10,1 min. **1 instable** : la quittance publique des outils a échoué au premier essai, puis réussi au second. Rejouée seule : 3 fois sur 3. Elle n'utilise aucun fichier modifié. |
| **Suite unitaire complète** | **12 941 réussis, 1 échec**, 37 ignorés. Détail ci-dessous. |
| Tests en base des corrections, sur base neuve (recherche par e-mail, fiche de la société, quittance, isolation API, restauration, retours arrière) | ✅ 80 réussis, 0 échec |
| Locataire invité sur l'émulateur (UX-1 et premier mot de passe) | ✅ 6 réussis |
| Console dans un vrai navigateur (accueil du dirigeant, suivi) | ✅ 6 réussis |
| Vérification ciblée, captures à 390 et 1440 px | ✅ Voir ci-dessous. |

Détail de la vérification ciblée :
- **SCI-4** : prénom exigé au formulaire public, refus serveur sans lui, saisies conservées.
- **SCI-2** : deux fiches à la création (société et gérante), toutes deux avec l'e-mail du compte. Le profil
  enregistré recopie l'adresse sur la fiche de la société.
- **Bandeau** : visible sur l'accueil et sur la page Santé.

Les captures à 390 px sont dans `captures/`.

**Ce que la suite unitaire n'a pas vérifié ici :**
- **L'échec unique** (« super admin : le mot de passe seul ne donne aucun accès ») vient de l'ordre des essais sur le
  banc. La suite navigateur laisse un second facteur sur ce compte fictif. La PR #347 refuse alors sa session
  « mot de passe seul » (428) au lieu de répondre `false`. Le test **passe sur base neuve**, et aucun fichier de la
  branche ne touche la double authentification.
- **Deux fichiers exigent des services absents du banc**, présents en CI : un vrai service d'authentification et
  une base dédiée. Ils n'ont pas tourné ici.
- **Deux fichiers exigent une version du navigateur absente du banc.** Ils ont été rejoués à part avec le Chromium
  installé : 6 réussis.

**Corrigé pendant ces essais :**
- **Le bandeau portait le rôle `alert`.** Un test de la console attend qu'aucune alerte ne suive la préparation
  des faits : il est devenu une région nommée par son titre. Commit `9c8f9a75`.
- **Le test de rejeu du lot « finance-dates » rejoue désormais la migration `…200300`**, comme il rejouait déjà une
  autre migration postérieure. Commit `bba781a2`.
- **Le test UX-1 crée maintenant son compte par la fabrique de liens.** L'émulateur ne connaît pas
  `createUser`. Commit `cbb72c7e`.
- **Les trois retours arrière SCI sont sortis de la chaîne « Ordre complet ».** Ils ne citent pas le jour de
  Paris, comme ceux de la PR #347. Commit `7ed90140`.

**Test qui mord.** Le nouveau test des recherches par e-mail échoue sans la migration `…200300`. Il passe avec elle.

---

## 6. Ce que je ne peux pas faire

| Point | Pourquoi je ne peux pas | Qui peut |
|---|---|---|
| **COM-1** Médiateur de la consommation | Adhésion contractuelle, hors du code. | Vous, avant l'ouverture des ventes. |
| **COM-2** Premier paiement réel | Vos consignes interdisent tout paiement réel. | Vous : une souscription de bout en bout, puis un remboursement. |
| **OPS-1** Réception de l'alerte | Seule votre boîte aux lettres le prouve. Le contrôle programmé du 20/11 à 04 h 15 UTC lit le registre des envois, pas la réception. | Vous : confirmer la réception le 20/11. |
| **SEC-3** Antivirus sur les dépôts | Il faut choisir un prestataire, souscrire et fournir une clé. | Vous choisissez ; le branchement sera à faire ensuite. |
| **SEC-4 / MFA-1** CAPTCHA, limites et réglages d'authentification | Réglages du tableau de bord Supabase, hors du dépôt. Je n'y ai pas accès en écriture, et vos consignes l'excluent. | Vous, dans Supabase → Authentication. |
| **TEC-6** Secret du suivi Resend | Variable de production chez Vercel, hors de mon périmètre. | Vous : la configurer ou retirer la route. |
| **TEC-2** Noms du registre des migrations | Simple documentation, non faite dans ce lot. | Un prochain lot. |
| Validation de la quittance SCI | Question juridique. | Un juriste. |
| **Publication** | Vous ne l'avez pas autorisée. | Vous : PR, CI, migrations par le circuit protégé, fusion, Vercel, recette. |

---

## 7. Confidentialité

Aucun mot de passe, jeton ou secret dans ce rapport, les journaux ou les captures. Comptes et adresses du banc
fictifs (domaine `example.invalid` ou `exemple.fr`). Aucune donnée personnelle réelle.

---

## 8. Publication (19/11/2026)

| Étape | Résultat |
|---|---|
| PR #348, CI sur la tête `bba781a2` | ✅ run 44622626401 |
| Lecture seule de la production avant fusion | ✅ Ancres des 4 migrations présentes, aucun doublon d'adresse par nature. |
| Fusion squash au SHA exact | ✅ `main` = `be3bf5b0` |
| CI de `main` | ✅ run 44628238250 |
| Simulation des migrations | ❌ **sans effet** (run 44628266944). Elle a buté sur le verrou de la sauvegarde lancée au même moment (« lock timeout »), puis a tout annulé. Erreur d'ordonnancement, pas des migrations. |
| Sauvegarde à la demande | ✅ run 44628477049, 22 h 31 UTC |
| Application réelle des 4 migrations | ✅ run 44633587803, 23 h 09 UTC, vérifiée en lecture seule. |
| Publication contrôlée | ✅ run 44635317531, 23 h 12 UTC. Version `be3bf5b0` servie, 0 erreur d'exécution. |
| Recette de production avec nettoyage n° 53 | ✅ run 44635613659. 0 compte et 0 espace de recette restants. |

Restent à constater :
- la purge des 33 fichiers d'audit (20/11, 03 h 40 UTC) ;
- l'envoi de l'alerte quotidienne (20/11, 04 h 00 UTC).

Le contrôle programmé a été annulé à la demande du dirigeant.

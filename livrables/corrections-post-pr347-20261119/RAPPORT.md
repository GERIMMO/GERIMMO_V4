# Corrections après l'audit de la PR #347 — 19 novembre 2026

- **Branche :** `claude/corrections-post-pr347`, partie de `main` à `8c0449c6` (la version en production).
- **État :** poussée sur GitHub, **sans PR, sans fusion, sans publication**. Aucune migration appliquée en production.
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
| **OPS-1** (P2), en partie | L'alerte quotidienne a échoué 8 jours de suite ; l'e-mail était le seul signal. | Bandeau sur « Aujourd'hui » (`/admin/brief`) et sur la page Santé (`/admin/sante`) : alerte non partie, échec du jour après 5 h 30 (heure de Paris), envoi partiel, registre illisible. Lecture seule, aucune migration. | `eba3b1ee` |
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

| Contrôle | Résultat |
|---|---|
| Lint, vérification des types | ✅ 0 erreur |
| Tests en base des corrections, sur base neuve (6 fichiers : recherche par e-mail, fiche de la société, quittance, isolation API, restauration, retours arrière) | ✅ 80 réussis, 0 échec |
| Test du locataire invité sur l'émulateur (UX-1 et parcours d'inscription) | ✅ 6 réussis |
| Suite navigateur complète | ⏳ en cours au moment de ce commit |
| Suite unitaire complète | ⏳ à rejouer après la suite navigateur |

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

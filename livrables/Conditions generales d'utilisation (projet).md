# Conditions générales d'utilisation — Gerimmo (projet)

> **Projet rédigé par l'agent (2026-09-11).** Il comble le manque le plus grave
> relevé à l'audit du jour : **la case d'inscription fait accepter « les
> conditions d'utilisation », l'action serveur refuse l'inscription sans elle,
> et ces conditions n'existaient nulle part.** On faisait cocher un contrat
> introuvable.
>
> **Ce projet n'est pas publiable en l'état.** Un contrat engage ; celui-ci
> s'adresse pour partie à des consommateurs, ce qui déclenche des obligations
> propres (information précontractuelle, rétractation, clauses abusives,
> médiation). Il attend une **relecture juridique** et les réponses aux
> `[à compléter]`.
>
> Ce qui suit s'appuie sur ce que le produit fait **réellement** — vérifié dans
> le code et la base le 11/09 — et non sur ce qu'on aimerait qu'il fasse.
> L'article 4 reprend le projet [[Article CGU - journal de gestion (projet)]],
> rédigé le 25/07 — **à une phrase près** : celle qui promettait trois exports
> dont deux n'existent pas (voir l'encadré de l'article 9).

---

## Article 1 — Objet

Les présentes conditions régissent l'accès au service Gerimmo et son
utilisation. Gerimmo est un **logiciel de gérance immobilière en ligne** : il
tient le référentiel d'un parc (biens, lots, baux, personnes, mandats), produit
les documents de la location, suit les loyers et les incidents, et ouvre à
chaque partie prenante un espace propre.

Elles forment, avec la [[Politique de confidentialite (projet)|politique de
confidentialité]] et — lorsque le Client traite des données pour le compte
d'autrui — le [[Contrat de sous-traitance RGPD (modele)|contrat de
sous-traitance]], l'intégralité de l'accord entre le Client et l'Éditeur.

## Article 2 — Définitions

**Éditeur** : la société identifiée aux [[Mentions legales (projet)|mentions
légales]].

**Service** : l'application Gerimmo, ses espaces, ses documents générés et ses
exports.

**Client** : la personne physique ou morale qui ouvre un compte et souscrit au
Service — agence de gestion, ou propriétaire bailleur gérant son propre parc.
C'est le Client qui accepte les présentes conditions.

**Organisation** : l'espace de travail du Client. Chaque organisation est
**étanche** : aucune donnée n'y est visible depuis une autre.

**Utilisateur** : toute personne qui accède au Service — le Client, ses agents,
et les tiers qu'il invite.

**Locataire, propriétaire mandant** : les personnes auxquelles le Client ouvre
un espace de consultation. **Elles ne sont pas Clientes** : elles ne souscrivent
rien, ne paient rien, et leur accès dépend du Client. L'article 7 leur est
consacré.

## Article 3 — Acceptation et formation du contrat

Le contrat se forme lorsque le Client coche la case d'acceptation et valide son
inscription. La case n'est pas pré-cochée et l'inscription est refusée sans
elle.

**Information précontractuelle.** Avant de s'engager, le Client dispose des
présentes conditions, du prix (article 8) et des mentions légales, accessibles
depuis toutes les pages publiques du site.

> [!warning] À faire côté produit avant publication
> La case d'inscription doit **renvoyer vers ce document** par un lien. Cocher
> « j'accepte » sans pouvoir lire ce qu'on accepte reste un défaut, même une
> fois le texte écrit.

## Article 4 — Nature du Service : un journal de gestion

*(Repris du projet du 25/07, qui traduit le livrable A6 — RM-A6.1, RM-A6.12.)*

**4.1 — Ce que le Service fait.** Le Service tient un **journal de gestion** :
il suit les loyers appelés et les dépenses déclarées, calcule les honoraires
selon les mandats paramétrés, produit les rapports de gestion destinés aux
propriétaires et prépare les récapitulatifs fiscaux. L'export des écritures est
décrit à l'article 9.

> **Écart relevé le 11/09.** Le projet du 25/07 écrivait ici « l'export complet
> des écritures, des documents et du référentiel ». **Deux de ces trois exports
> n'existent pas** : le produit ne sait exporter que le journal comptable, en
> CSV. La phrase a été corrigée — un contrat ne promet pas une fonction qu'on
> n'a pas écrite.

**4.2 — Ce que le Service ne fait pas.** Le Service **n'est pas un logiciel de
comptabilité** et **ne tient pas la comptabilité de gérance** du Client. Il ne
gère aucun compte mandant, n'assure aucun séquestre de fonds, ne fait transiter
aucun mouvement de fonds, ne se synchronise pas avec les comptes bancaires du
Client et ne constitue pas un tiers de confiance au sens probatoire. Il ne
remplace ni l'expert-comptable du Client ni les obligations propres aux
titulaires d'une carte professionnelle (garantie financière, comptes séparés,
registres obligatoires).

**4.3 — Ce qui fait foi.** Les montants appelés, imputations et honoraires
calculés font foi dans le Service ; les montants effectivement encaissés ou
versés font foi dans les relevés bancaires du Client. **En cas d'écart, le
relevé bancaire prime** ; le Client corrige le journal par contre-écriture. Le
rapprochement bancaire relève du Client ; le Service fournit les exports, tris
et totaux facilitant cette comparaison.

**4.4 — Intégrité du journal.** Toute écriture est **immuable dès sa création** :
une correction s'effectue exclusivement par contre-écriture motivée,
l'historique restant intégralement consultable. La réouverture d'une période
close ne rend aucune écriture modifiable.

**4.5 — Documents générés.** Le Service produit des documents à partir des
données saisies par le Client (baux, quittances, états des lieux, congés,
décomptes de restitution…). **Ces documents engagent le Client**, qui en
vérifie le contenu avant tout usage. Lorsqu'une donnée obligatoire manque, le
document la signale en toutes lettres plutôt que de la deviner : il appartient
au Client de la compléter avant signature ou envoi.

**4.6 — Responsabilité.** Le Client reste seul responsable de sa comptabilité,
de ses obligations fiscales, sociales et professionnelles, et de l'exactitude
des saisies déclaratives effectuées dans le Service.

## Article 5 — Compte, accès et sécurité

Le Client fournit des informations exactes et les tient à jour. Les
identifiants sont personnels et confidentiels ; le Client répond des actes
accomplis depuis son compte et informe l'Éditeur sans délai de tout accès non
autorisé.

L'Éditeur met en œuvre l'état de l'art : chiffrement en transit et au repos,
cloisonnement strict entre organisations **vérifié à chaque livraison par des
tests d'attaque**, journalisation des accès aux pièces sensibles, analyse des
fichiers déposés.

## Article 6 — Rôles et habilitations

Le Client répartit les accès entre ses Utilisateurs selon les rôles prévus par
le Service. **Un agent peut être restreint à son portefeuille** : il ne voit
alors que les lots qui lui sont confiés. Le Client est responsable de cette
répartition et de sa mise à jour, notamment au départ d'un collaborateur.

## Article 7 — Espaces des locataires et des propriétaires mandants

Le Client peut ouvrir un espace de consultation à ses locataires et à ses
propriétaires mandants. Ces personnes :

- **ne contractent pas** avec l'Éditeur et ne lui doivent rien ;
- accèdent en lecture à leur propre dossier, et peuvent y déposer des pièces,
  signaler un incident ou écrire à leur gestionnaire ;
- exercent leurs droits sur leurs données **auprès du Client**, responsable de
  traitement, et non auprès de l'Éditeur.

Le Client s'assure de disposer du fondement juridique nécessaire pour leur
ouvrir cet espace et pour y publier les documents qui les concernent.

> [!warning] À trancher — quelles conditions s'appliquent au locataire ?
> Le locataire utilise un service dont il n'est pas client. Il lui faut donc
> soit une **acceptation propre** au premier accès, soit une clause du bail
> l'informant de l'ouverture de cet espace. Le wiki ne tranche pas ; le code
> n'affiche aujourd'hui **aucune acceptation** côté locataire.

## Article 8 — Prix, essai et facturation

**8.1 — Grille.** Le **premier bien est offert, sans limite de durée et sans
carte bancaire**. Chaque bien supplémentaire est facturé **5,99 € par mois**,
sans engagement de durée.

**8.2 — Essai.** L'ouverture d'un compte donne accès à un **essai gratuit de
14 jours** couvrant la formule complète. À son terme, à défaut de souscription,
le compte retombe sur le premier bien offert. `[à confirmer — comportement exact
attendu en fin d'essai ; le code porte les statuts essai / actif / suspendu /
expiré / résilié, la règle de bascule n'est pas écrite au wiki]`

**8.3 — Facturation.** `[à compléter — périodicité, date de prélèvement, moyen
de paiement, prestataire, émission des factures. Le référentiel prévoit Stripe
et des frais de mise en place ; l'implémentation n'est pas vérifiée à ce jour.]`

**8.4 — TVA.** Les prix sont indiqués `[à compléter — hors taxes ou toutes
taxes comprises]`.

**8.5 — Révision.** Toute évolution tarifaire est notifiée au Client
`[à compléter — préavis]` avant sa prise d'effet. Le Client qui la refuse peut
résilier sans frais avant cette date.

> [!warning] Droit de rétractation — à trancher
> Le Client particulier (propriétaire bailleur non professionnel) qui souscrit
> à distance dispose en principe de **quatorze jours de rétractation**
> (art. L. 221-18 du code de la consommation). L'exécution immédiate du service
> à sa demande expresse n'éteint pas ce droit : elle le rend seulement payable
> au prorata. Un article dédié, avec le formulaire type, est à ajouter après
> avis juridique.

## Article 9 — Réversibilité

**Ce que le Service permet aujourd'hui.** Le Client peut exporter à tout
moment, sans frais ni condition, **le journal de gestion** : toutes les
écritures de la période choisie, au format CSV, avec le bien, le lot et le
mandant en clair. Ses documents restent par ailleurs consultables et
téléchargeables un par un depuis son espace.

**Ce à quoi l'Éditeur s'engage.** `[à arbitrer avant publication — voir
l'encadré ci-dessous]`

À la résiliation, les données sont conservées `[à compléter — durée]` pour
permettre l'export, puis supprimées ou anonymisées selon la politique de
confidentialité.

> [!warning] La réversibilité promise n'est pas celle qui existe
> Le projet du 25/07 (article N.5) engageait l'Éditeur sur **trois** exports —
> le journal, l'archive documentaire indexée, le référentiel complet — et
> ajoutait que « cette faculté survit à la suspension du compte (accès en
> lecture seule) ».
>
> Vérification du 11/09, code en main :
>
> | Promesse du projet | Réalité |
> |---|---|
> | Export du journal | **existe** (CSV, `/comptabilite/export`) |
> | Archive documentaire avec index | **n'existe pas** — les documents se téléchargent un par un |
> | Export du référentiel (biens, lots, baux, personnes, mandats) | **n'existe pas** |
> | Survie à la suspension, en lecture seule | **n'existe pas** — le statut d'organisation est une étiquette d'affichage, aucun code ne restreint quoi que ce soit |
>
> **Deux issues, et une seule décision à prendre.** Soit on écrit les deux
> exports manquants et la bascule en lecture seule, et l'article reprend la
> rédaction du 25/07 — c'est la voie que recommande l'agent, la réversibilité
> étant un argument de vente de la page d'accueil autant qu'une attente du
> RGPD. Soit on n'engage que ce qui existe, et la page d'accueil doit cesser
> d'en dire davantage. **Ce qu'on ne peut pas faire, c'est signer la première
> et livrer la seconde.**

## Article 10 — Disponibilité, maintenance et support

L'Éditeur s'engage à une obligation de **moyens**. Le Service peut être
interrompu pour maintenance ; l'Éditeur en informe le Client dès qu'il le peut.

`[à compléter — engagement de disponibilité chiffré, horaires et canaux du
support, délai de première réponse. Ne rien promettre ici qui ne soit tenu :
une disponibilité annoncée est une obligation contractuelle.]`

## Article 11 — Données personnelles

Le traitement des données est décrit dans la [[Politique de confidentialite
(projet)|politique de confidentialité]].

**Répartition des rôles.** Pour les données de gestion locative (baux, pièces,
loyers, incidents, messages), **le Client est responsable de traitement et
l'Éditeur sous-traitant** : leurs rapports sont régis par le [[Contrat de
sous-traitance RGPD (modele)|contrat de sous-traitance]], qui fait partie
intégrante du présent accord. Pour les traitements de plateforme (comptes,
authentification, facturation), l'Éditeur est responsable.

## Article 12 — Propriété intellectuelle

L'Éditeur concède au Client un droit d'usage personnel, non exclusif et non
cessible du Service, pour la durée de l'abonnement.

**Les données et documents du Client lui appartiennent.** L'Éditeur n'en
acquiert aucun droit, ne les exploite à aucune autre fin que la fourniture du
Service, et ne les cède ni ne les commercialise.

**Marque blanche.** Le Client qui appose son identité sur son espace en
conserve la propriété pleine et entière (voir [[Marque blanche]]).

## Article 13 — Obligations du Client

Le Client s'engage à utiliser le Service conformément au droit, à ne déposer
aucun contenu illicite, à ne pas tenter d'accéder aux données d'une autre
organisation, à ne pas entraver le fonctionnement du Service, et à répondre de
l'exactitude des informations qu'il saisit.

## Article 14 — Responsabilité

L'Éditeur répond des dommages directs causés par un manquement à ses
obligations. Il ne répond pas :

- de l'usage que le Client fait des documents générés, ni de leur contenu, que
  le Client vérifie (article 4.5) ;
- des conséquences de données inexactes saisies par le Client ;
- des manquements du Client à ses propres obligations légales,
  professionnelles, fiscales ou sociales.

`[à compléter — plafond de responsabilité. Une clause limitative est valable
entre professionnels ; elle est réputée non écrite si elle prive le contrat de
sa substance, et le droit de la consommation la restreint fortement face à un
Client particulier. À calibrer avec un conseil, et non copiée d'un modèle.]`

## Article 15 — Suspension et résiliation

**Par le Client** : à tout moment, sans frais ni préavis, depuis son espace ou
par simple demande. La réversibilité de l'article 9 s'applique.

**Par l'Éditeur** : en cas de défaut de paiement ou de manquement grave, après
mise en demeure restée sans effet pendant `[à compléter — délai]`.

L'intention est que la suspension bascule le compte en **lecture seule**, sans
jamais priver le Client de l'accès à ses données ni de leur export. **Cette
bascule n'est pas implémentée** (voir l'encadré de l'article 9) : tant qu'elle
ne l'est pas, l'article ne peut pas l'affirmer.

## Article 16 — Modification des conditions

L'Éditeur peut modifier les présentes conditions. Toute modification est
notifiée au Client `[à compléter — préavis]` avant sa prise d'effet. Le Client
qui la refuse peut résilier sans frais avant cette date ; la poursuite de
l'utilisation après cette date vaut acceptation.

L'Éditeur conserve **chaque version** et la date de son acceptation par le
Client.

> [!warning] À faire côté produit
> Cette conservation n'existe pas aujourd'hui : la base enregistre que la case
> a été cochée, pas **quelle version** a été acceptée ni **quand**. Sans cela,
> l'Éditeur ne peut pas prouver le contenu du contrat le jour de sa formation.

## Article 17 — Droit applicable et litiges

Les présentes conditions sont soumises au **droit français**.

En cas de litige, les parties recherchent une solution amiable. À défaut :

- **Client consommateur ou non-professionnel** : recours gratuit au médiateur
  de la consommation désigné aux [[Mentions legales (projet)|mentions
  légales]], puis juridiction compétente selon les règles de droit commun.
- **Client professionnel** : `[à compléter — attribution de compétence
  éventuelle]`.

---

## Ce qui manque encore, et pourquoi l'agent ne l'a pas écrit

| Manque | Pourquoi il n'est pas comblé ici |
|---|---|
| Identité de l'éditeur, immatriculation, contact | Faits d'entreprise — voir [[Mentions legales (projet)]] |
| Modalités de facturation (art. 8.3) | Le référentiel prévoit Stripe ; l'implémentation n'est pas vérifiée |
| Comportement exact en fin d'essai (art. 8.2) | Les statuts existent en base, la règle de bascule n'est écrite nulle part |
| Droit de rétractation (art. 8) | Décision juridique : le service s'adresse aussi à des particuliers |
| Plafond de responsabilité (art. 14) | Se calibre, ne se copie pas |
| Engagement de disponibilité (art. 10) | Ne rien promettre qui ne soit mesuré |
| Acceptation côté locataire (art. 7) | Le produit n'en demande aucune — c'est une décision de conception |
| Portée de la réversibilité (art. 9) | Deux des trois exports promis en 2025 n'existent pas ; à écrire ou à ne pas promettre |
| Effet réel d'une suspension (art. 9 et 15) | Le statut d'organisation n'est qu'une étiquette : aucun code ne restreint l'accès |

> [!warning] Points à trancher / contradictions
> - **Deux publics, deux régimes.** Le service s'adresse à des agences
>   (professionnels) et à des propriétaires bailleurs particuliers
>   (consommateurs). Le second régime impose rétractation, médiation et
>   contrôle des clauses abusives. Rédiger un texte unique est possible, mais
>   il doit alors être **calibré sur le régime le plus protecteur**.
> - **Le locataire accepte aujourd'hui zéro condition** alors qu'il utilise le
>   service et y dépose des pièces (art. 7).
> - **La version acceptée n'est pas conservée** (art. 16) : la base note que la
>   case a été cochée, pas ce qui avait été accepté.
> - L'article 4 affirme que le Service **ne fait transiter aucun fonds**. C'est
>   vrai aujourd'hui. Le jour où un encaissement en ligne apparaît, cet article
>   **et** la qualification loi Hoguet des mentions légales tombent ensemble.

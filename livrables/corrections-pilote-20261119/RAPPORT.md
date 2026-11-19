# Corrections ciblées avant le pilote — 19 novembre 2026

Production inchangée : `2928d63f61a4cb2bdbb248580035831bf678c088`. Base de la branche `codex/corrections-pilote-20261119`.
Référence : `livrables/audit-production-20261119/RAPPORT.md`, branche `claude/audit-final-pr335` (lecture du 19 novembre).
Aucune fusion, migration de production, publication, ouverture commerciale ni modification de données clients.

## État des cinq demandes

| Sujet | Résultat démontré | Reste à faire |
|---|---|---|
| Alerte quotidienne | Le déclencheur passe à 04 h UTC. L'envoi actuel est refusé **avant le fournisseur** : l'adresse configurée dans `GERIMMO_RELAIS_EMAILS` appartient à un compte confirmé, mais non habilité comme superviseur global actif. Le filtre V1 autorise déjà cette catégorie. Le bon destinataire, le refus du non-habilité, l'idempotence et la révocation réussissent sur PostgreSQL et boîte simulée. | Corriger le destinataire configuré au déploiement autorisé, sans étendre les droits ; vérifier une réception réelle. Alerte non rétablie en production à ce stade. |
| Inscription par vraie boîte | Une demande unique a été faite **par l'écran public**, vers l'alias propriétaire de la boîte autorisée par l'utilisateur. Le fournisseur confirme `livre`, une tentative, finalisation terminée à 09:17:36 UTC. Aucun compte créé directement en base pour ce parcours. | L'accès à la boîte manque : ouverture, confirmation, première connexion, invitation/activation du locataire et récupération réelles restent **non démontrées**. Ne pas utiliser un jeton lu en SQL comme preuve de réception. |
| SCI | Le nom de la société est demandé séparément du nom du gérant. Société titulaire du premier logement à 100 %, personne physique distincte proposée dans « Qui signe pour SCI du Tilleul ? ». Inscription, confirmation simulée, activation, création du logement, récupération/reconnexion, brouillon de bail et sélection du représentant exécutés dans le navigateur local. | Livraison protégée et recette sur la version servie. Aucun pouvoir de signature automatique ; justificatif et confirmation restent requis. Les dossiers historiques ne sont pas réaffectés. |
| Recette n° 50 | 63 réussis + 4 échecs + 1 ignoré = 68. Les quatre tests obsolètes sont adaptés, sans retirer de contrôle métier. L'ancien `/cgu` ignoré vérifie désormais le lien vers `/conditions`. | Le workflow de production n'est pas relancé ici. Le parcours e-mail réel reste une preuve distincte. |
| Purge | Les 19 chemins du rapport sont en file depuis 08:08:14 UTC et les 19 objets sont encore présents dans le bucket `documents` au contrôle du 19 novembre. | Vérifier après la purge du **20 novembre à 04:40, heure de Paris** : 19 objets absents et file acquittée. Ne pas annoncer cette purge achevée avant le constat. |

## Corrections et vérifications

- Accueil : ouvrir « Les étapes de ma première location » avant de vérifier le parcours (compte ayant déjà un bien).
- Abonnement fermé : contrôler l'explication, les tarifs mensuel/annuel informatifs et l'absence de commande/paiement, au lieu d'attendre un faux récapitulatif de commande.
- Inscription/récupération : nouveaux champs et boutons ; mot de passe et consentement toujours à la première activation. Les tests du fournisseur simulé ne prouvent pas la lecture d'une vraie boîte.
- D23 : numéro fictif unique et ciblage de la facture dans le détail déplié. **239,68 €**, une seule dépense, date/moyen vus par l'artisan, référence privée non visible. Aucun paiement effectué.
- SCI : quatre scénarios échouaient avant la migration ; six contrôles SQL réussissent après. Personne physique, SCI, SCI familiale, autre société, nom de société manquant et espace déjà existant couverts.

Résultat local final : **260 tests ciblés distincts réussis** (12 fichiers initiaux : 204 ; 4 fichiers de compatibilité : 53 ; manifeste : 3). Les rejeux des mêmes tests ne sont pas additionnés.
Quatre scénarios Playwright de la recette réussis séparément : accueil, abonnement, D23 et conditions. Aucune assertion supprimée ni scénario désactivé.
TypeScript et ESLint ciblé : réussis. Captures SCI 390/1440 px dans `preuves/` (Chromium simulé, pas téléphone physique).
Le banc a subi une interruption locale puis a été rétabli ; les échecs intermédiaires et leurs reprises sont conservés. Une navigation D23 interrompue en développement a réussi au rejeu isolé, sans changer les règles de l'application.
CI initiale [44505288138](https://github.com/GERIMMO/GERIMMO_V4/actions/runs/44505288138), SHA `3acf78163ef0a8fa2fe972c15c3de2df2be0f500` : migrations, PostgREST, concurrence, ESLint et compilation réussis ; suite logique/PDF : 12 818 réussis, 1 échec, 22 ignorés préexistants. Unique échec : la liste attendue de `relais-migrations-manifeste.test.ts` omettait la nouvelle migration SCI. Ajout explicite, sans retirer d'assertion ; les trois tests de ce fichier passent localement. Résultat de la nouvelle CI attaché à la PR sur le SHA exact ; les navigateurs de la première CI n'ont pas été exécutés.

## Migration et déploiement ultérieur

`20261119085820_inscription_societe_et_representant.sql`, ajoutée une seule fois en fin du manifeste (514 migrations).
Réappliquée sur deux copies fictives du schéma courant : effectifs personnes/organisations/détentions et permissions de la fonction inchangés. Seules les **futures** initialisations SCI créent la société et sa personne représentante distinctes.
Aucun retraitement, déplacement de contrat ni mise à jour des titulaires existants. Vérification des signatures et contrôles d'accès existants : 26 tests SQL réussis.
Après autorisation de livraison seulement : CI exacte, sauvegarde fraîche autorisée/restaurée, simulation protégée, migration manquante, promotion, recette. En cas d'échec, conserver les données et corriger en avant.

Réglage d'alerte à préparer pour cette livraison : remplacer l'adresse devenue non habilitée par l'adresse vérifiée du compte dirigeant **déjà** superviseur global actif. Conserver la liste fermée des courriels et toutes les vérifications serveur. Ne pas accorder un rôle à l'adresse incorrecte pour contourner le refus. Ne pas réexpédier en masse les anciennes alertes. Aucun secret ni variable de production modifié pendant ce travail.

## Reprise et verdict

La demande réelle d'inscription reste en attente sur l'alias autorisé ; aucun rôle temporaire de supervision ne lui a été attribué. Ses détails et les sessions de recette sont conservés uniquement dans le dossier local privé, jamais dans GitHub. Le compte ne doit pas être supprimé avant la fin du parcours ; nettoyer ensuite uniquement les données fictives autorisées.

**Réserves du pilote non clôturées** : alerte réelle, parcours complet de vraie messagerie et purge nocturne encore à confirmer. Le rapport de production demeure favorable aux particuliers sous ces réserves ; ce travail ne constitue ni une publication ni un GO commercial.

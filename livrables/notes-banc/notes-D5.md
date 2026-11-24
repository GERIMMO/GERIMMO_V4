# Lot D5 — décision Q21 : retrait de l'ancien parcours « télécharger, signer, redéposer »

Arbre : `$S/palier1-t` (commit local au-dessus de `3ed997a1`, sans push). Base de test : `gerimmo_ci_sonde_tquatre` (+ `_api`).

## À REJOUER LE JOUR DE LA PUBLICATION, AVANT D'APPLIQUER (lecture seule, production)
    select count(*)                                                        as toutes,
           count(*) filter (where signee_le is null)                        as en_attente,
           count(*) filter (where signee_le is null and prestataire='manuel') as manuelles_en_attente
      from public.demandes_signature;
Attendu : 0, 0, 0 (contrôle du 24/11 : table vide). Si `manuelles_en_attente` > 0 : NE PAS publier ce lot (le locataire
n'aurait plus d'écran pour déposer son document signé) ; la migration 20261125140000 s'arrête d'ailleurs d'elle-même.
Si `toutes` > 0 mais rien en attente : publication possible, l'historique reste lisible côté gestionnaire.

## Retiré du code
- `src/app/locataire/[orgId]/documents/depot-signature.tsx` (carte « Document(s) à signer » : télécharger / déposer le signé) — supprimé.
- `src/app/actions/signature-locataire.ts` (`retournerDocumentSigne`) — supprimé.
- `src/app/locataire/[orgId]/documents/page.tsx` : carte « Documents à signer », lecture `mes_demandes_signature`, bandeau « pièces ou signatures » → « pièces ».
- `src/app/locataire/[orgId]/page.tsx` : ligne « Un document à signer » de « Ce qui vous attend », lecture, mention « ou signatures ».
- `src/app/locataire/[orgId]/layout.tsx` : lecture et part du badge « Mes documents » du menu.
- `src/app/actions/signature.ts` : `envoyerPourSignature` (coquille qui refusait déjà) et `annulerDemandeSignature` — supprimées.
- `src/app/agence/[orgId]/documents/circuit-document.tsx` : bouton « Annuler » d'une demande manuelle en attente.
- `src/lib/notifications.ts` : `messageSignatureDemandee` et `notifierSignatureDemandee` (e-mail « Document à signer : … », plus aucun appelant).
Aucune route n'est supprimée (l'écran était une carte de « Mes documents ») : `e2e/routes-inventaire.json` inchangé. Aucun lien de menu ni texte d'aide (FAQ) n'y renvoyait.

## Conservé volontairement
- Signature électronique (carte `signatures-electroniques.tsx`, `mes_signatures_electroniques`, circuit Zoho) et dépôt du bail signé sur papier par le bailleur : non touchés.
- Côté gestionnaire, l'HISTORIQUE en lecture seule des anciennes demandes sur la fiche d'un document (`demandes_signature_document`, `CircuitDocument`) : il sert aussi aux archives de l'ancien prestataire de signature électronique (hors Q21). Vide en production. À retirer au lot de nettoyage si souhaité.
- Le nom d'événement `signature_demandee` dans les listes (`perimetre-pilote.ts`, `notifications-transactionnelles.ts`, `libelles-journaux.ts`) : adossé à la base et aux journaux existants.
- La route de téléchargement `/locataire/[orgId]/documents/[documentId]/fichier` (commune à tous les documents du locataire).

## Base : rien n'est supprimé
Table `demandes_signature`, colonnes, règles d'accès, déclencheurs, toutes les fonctions : en place.
Migration ADDITIVE `20261125140000_ancien_parcours_signature_manuelle_droits_retires.sql` (+ retour) : retire au rôle `authenticated`
le droit d'exécuter `envoyer_pour_signature`, `retourner_document_signe`, `annuler_demande_signature` (cette dernière SUPPRIME une ligne).
Preuve qu'aucun code restant ne les appelle : `grep -rn` sur `src/` (zéro appel `rpc(...)`, tenu par le test), et en base aucune
fonction ne les appelle (`pg_proc.prosrc`). Garde-fou dans la migration : arrêt si une demande manuelle est en attente.
Restent appelables, à traiter au lot de nettoyage :
- `mes_demandes_signature(uuid)` : plus aucun appelant, mais LAISSÉE ouverte exprès (lecture seule de ses propres demandes ; l'ancien
  code l'appelle à chaque page du locataire → la fermer imposerait d'appliquer la migration après le code).
- `demandes_signature_document(uuid,uuid)` : encore appelée (historique gestionnaire).
- `rattacher_signature_youtrust(...)` : ancien prestataire, aucun appelant dans `src/`, hors périmètre Q21.
- Droits de table INSERT/UPDATE/DELETE de `authenticated` sur `demandes_signature` (sous RLS + déclencheur de refus des nouveaux envois) : inchangés.

## Tests retirés / adaptés (fonction retirée sur décision, pas « désactivés pour faire passer »)
- RETIRÉ `tests/signature-manuelle-retour.test.ts` (1 cas : la coquille `envoyerPourSignature` redirigeait vers Zoho).
- ADAPTÉ `tests/signature-annulation.test.ts` : les 4 cas d'annulation retirés, remplacés par 1 cas (le module n'expose plus envoi ni annulation) ; les 3 cas du partage gardés.
- ADAPTÉ `tests/notifications.test.ts` : 2 lignes `messageSignatureDemandee` retirées.
- ADAPTÉ `tests/interlocuteur-locataire-lot47.test.ts` et `…-lot47-reprise.test.ts` : la ligne `signature-locataire.ts` sort des listes.
- ADAPTÉ `tests/documents-locataire-consultation.test.ts`, `assurance-locataire-ecrans.test.ts`, `ux-locataire-priorites.test.ts` : simulacre du composant supprimé retiré.
- ADAPTÉ `tests/signatures-electroniques-locataire.test.ts` : la liste des lectures surveillées n'a plus `eSignatures`.
- ADAPTÉ `tests/titres-hierarchie-espaces.test.ts` : 46 → 45 titres de carte.
- ADAPTÉ `tests/audit-securite-2026-09-29.test.ts` : `envoyer_pour_signature` est désormais refusée à l'entrée (« permission denied ») pour l'agent ET l'admin, au lieu de la garde de portefeuille interne ; `log_document_access` inchangé.
- AJOUTÉ `tests/ancien-parcours-signature-manuelle-base.test.ts` (7 cas : manifeste, rien de supprimé, plus d'appelant, droits, garde-fou, rejeu/retour).
- e2e : aucun parcours n'exerçait l'ancien écran (recherche sur les textes et fonctions) ; rien à retirer.

## Fichiers du lot D4 touchés (nécessité : toute migration y ajoute sa ligne)
`supabase/retours-arriere/LISEZ-MOI.md` (+1 ligne de tableau), `tests/relais-migrations-manifeste.test.ts` (+1 entrée), `vitest.config.ts` (+1 fichier en série),
`tests/type-vendeur-vente-sans-mediateur-base.test.ts` (la liste « ce qui suit dans le manifeste » accepte 20261125140000). `e2e/local/ordre-migrations.txt` (+1 ligne).
Si la relecture de D4 ajoute une migration entre 20261125110000 et 20261125140000, ces quatre listes seront à réordonner.

## Vérifications
- `npx tsc --noEmit` : propre. `npx eslint` sur les fichiers modifiés : propre.
- vitest, 135 fichiers liés (`$S/decisions/d5-tests-lies.txt`, journal `$S/decisions/d5-vitest-lies.log`) : 2336 réussis, 1 échec DÉJÀ PRÉSENT au commit 3ed997a1
  (vérifié en remisant mes changements) : `tests/jour-de-paris-suite-migrations-rejeu.test.ts` › « la chaîne Ordre complet du LISEZ-MOI… »
  (« Retour refusé : une migration plus récente prolonge la chaîne des e-mails ») — relève du lot D4, pas de D5.
- Migration appliquée à `gerimmo_ci_sonde_tquatre` et `gerimmo_ci_sonde_tquatre_api` uniquement.

## À rejouer sur le banc (non fait ici : pas de serveur ni de banc partagé)
- Appliquer la migration aux bases du banc (`SUPABASE_DB_URL`, `SUPALOCAL_DB`), puis suite vitest complète.
- Construction (`next build`) et e2e de l'espace locataire : accueil, « Mes documents » (carte signature électronique toujours là, plus de carte « à signer »), badge du menu ; fiche d'un document côté agence/propriétaire.
- `e2e/signature-electronique-locataire.spec.ts`, a11y et audit-ecrans du locataire.

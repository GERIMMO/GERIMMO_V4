# Signatures, conservation et expéditeur — 22 octobre 2026

## Périmètre et statut

Travail demandé : points 2 à 5, en autonomie. Essais locaux avec données fictives ; aucune publication, modification de données métier de production, invitation de signature ou dépense dans ce lot. Le bouton de levée du blocage des abonnements préparé auparavant reste distinct et local.

Les observations de production ci-dessous sont des lectures du 22 octobre. Elles ne prouvent pas un envoi réel réussi aujourd’hui.

## 2. Signatures disponibles

Les trois activations Vercel `ZOHO_SIGN_BAIL_ACTIF`, `ZOHO_SIGN_DOCUMENTS_ACTIF` et `ZOHO_SIGN_DEVIS_ACTIF` ont été lues à `true`. Le budget de production vaut 800 demi-crédits, soit **400 crédits par mois**, avec les devis autorisés en base et une alerte à 80 %. Ce plafond est conservé ; ce n’est ni le solde du compte Zoho ni une garantie de facture maximale.

La version locale de **Santé et connexions → Signatures** présente les sept types de documents séparément, leurs conditions de disponibilité et le motif d’une fermeture. Elle combine connexion, activations, fermeture ciblée de la caution, autorisation des devis en base et budget. Les contrôles du dossier et les arrêts d’urgence restent également applicables à chaque envoi.

Périmètre conservé : personnes physiques dans l’espace propriétaire direct ; bail, avenant, état des lieux à distance, accord d’échelonnement, accord de travaux et acceptation de devis selon leur activation. L’état des lieux sur place reste disponible. Le mandat d’agence et la représentation d’une SCI restent à développer : aucun contrôle n’a été supprimé pour les faire passer. La fermeture ciblée de la caution n’a pas été modifiée. Sa valeur Vercel n’a pas pu être relue sans une nouvelle double vérification ; elle ne doit pas être déduite de l’ouverture des autres actes.

Avant chaque envoi : PDF exact et annexes à relire, consentement explicite, estimation des crédits ; suivi des signatures existantes maintenu même après fermeture des nouveaux envois. Le crédit disponible chez le fournisseur et les conditions de l’offre API pour une intégration au bénéfice de tiers restent des prérequis externes. Aucun nouvel achat proposé.

## 3. Conservation : correction et bilan avant nettoyage

Une anomalie a été corrigée : le nettoyage pouvait supprimer le suivi d’une signature après 24 mois indépendamment de son contrat, puis traiter un certificat comme un document ordinaire. La nouvelle migration protège ensemble l’original, le signé, les annexes et les certificats référencés par les circuits, y compris les anciens circuits manuels. Elle ne supprime aucun dossier lors de son application.

**Administration → Données → Invitations et contacts anciens** permet de calculer un bilan agrégé sans supprimer. Réservé au superadmin permanent avec double vérification ; aucune identité ou pièce n’est renvoyée. Le même calcul sert de sélection au nettoyage.

| Catégorie | Déclencheur et délai préparés | Activation |
|---|---|---|
| Devis du site | 24 mois après le dernier traitement ou le dépôt | Conserve le nettoyage existant, désormais réglable et tenant compte d’un traitement récent |
| Liste d’attente propriétaires | 36 mois après inscription | Nouvelle purge désactivée |
| Liste d’attente agences | 36 mois après dernier échange ou inscription | Nouvelle purge désactivée |
| Invitations locataires/artisans non acceptées | 3 mois après expiration ou dernière réponse | Nouvelles purges désactivées |
| Intentions de congé traitées | 24 mois après traitement | Conserve le nettoyage existant, désormais réglable |

Les invitations acceptées, comptes et dossiers associés sont exclus de ces nouvelles purges. Les arrêts d’urgence restent prioritaires. Les règles préexistantes et leurs valeurs choisies sont préservées lors d’un rejeu.

La page de confidentialité locale décrit ces comportements et cesse d’appeler « anonymisation » un simple retrait de fichier lorsque les liens au dossier restent identifiants.

### Limites à traiter avant une politique complète d’effacement

La protection des preuves suspend leur purge automatique : elle ne décide pas d’une conservation illimitée. Le référentiel CNIL de gestion locative privée distingue la gestion directe et déléguée, la clôture des comptes et l’archivage intermédiaire. Le cadre à finaliser par catégorie est : 3 ans après clôture des comptes en gestion directe, 5 ans en gestion déléguée, avec obligations comptables et contentieux traités séparément. Les contrats en cours ne partent pas en purge simplement parce que le fichier est ancien. Les pièces de candidats non retenus ont une autre finalité ; Gerimmo ne doit pas appliquer une règle de candidature à tous les locataires déjà choisis.

L’application ne dispose pas encore de toutes les décisions de dossier nécessaires pour automatiser ce calendrier. Le contrôle d’archives et la préparation d’un effacement qualifié restent disponibles, sans raccordement à une suppression Zoho. Les copies chez Zoho, les sauvegardes et les fichiers déjà mis en file de purge avant la correction doivent être inventoriés séparément ; cette migration ne restaure aucun fichier déjà effacé. La suppression des preuves reste une opération qualifiée, avec contrôle du contrat, comptes clos, litige et sauvegarde. Aucune suppression distante n’a été engagée.

Source : [CNIL, référentiel gestion locative privée adopté le 6 mai 2021](https://www.cnil.fr/sites/default/files/atoms/files/referentiel_relatif_aux_traitements_de_donnees_personnelles_mis_en_oeuvre_dans_le_cadre_de_la_gestion_locative.pdf). Ce cadre ne constitue pas une certification juridique de Gerimmo.

## 4. Expéditeur et rappels

Décision de l’utilisateur pendant ce chantier : **conserver son adresse personnelle pour l’instant**, la remplacer plus tard. Le compte Zoho affiche GERIMMO et l’adresse personnelle de l’administrateur ; l’envoi reste assuré par le service standard Zoho. Aucun SMTP personnalisé, aucune nouvelle adresse et aucune vérification par courriel n’ont été ajoutés.

Le code utilise les rappels Gerimmo à J+7 et J+21, puis une alerte interne à J+28. Les demandes créées par Gerimmo désactivent les rappels périodiques natifs de Zoho pour éviter leur cumul. L’interface distingue désormais l’alerte interne des courriels aux signataires. La variable de production `ZOHO_SIGN_RELANCES_ACTIVES` existe ; sa valeur n’a pas été révélée, Vercel demandant une nouvelle double vérification. Ni l’activation effective en production ni la réception d’un rappel réel ne sont donc déclarées vérifiées dans ce lot.

Le changement futur d’expéditeur demandera une adresse existante et vérifiée ; un SMTP personnalisé peut demander une activation auprès de Zoho selon l’offre. Références : [SMTP Zoho Sign](https://help.zoho.com/portal/en/kb/zoho-sign/admin-guide/branding-and-customization/articles/custom-smtp-in-zoho-sign) et [offre API](https://www.zoho.com/sign/pricing-api.html).

## 5. Ancienne configuration Youtrust

Les trois réglages de production recensés le 22 octobre étaient `YOUTRUST_API_KEY`, `YOUTRUST_ENV`, `YOUTRUST_WEBHOOK_SECRET`. Ils ont été supprimés dans Vercel le 23 octobre après la confirmation explicite du dirigeant « Retire les anciens réglage youtrust ». La recherche YOUTRUST ne retourne plus aucun résultat dans les variables du projet pour Production. Les comptages actuels sont nuls dans `bail_signature_circuits` et `demandes_signature` ; aucun circuit Youtrust n’est présent dans cette base. Le code de compatibilité historique est conservé, notamment pour une restauration de sauvegarde.

Aucune clé n’a été reproduite dans les captures ou le rapport. Un redéploiement de la version déjà publiée `87ef2d2` a été lancé pour appliquer le retrait : `5JxVtGocWGQd3pW5GfUt27y6g7uy`. Vercel confirme **Ready**, avec `www.gerimmo.app` affecté au déploiement. La sonde publique renvoie `ok: true`, `base: true` et la révision complète `87ef2d2a9b970006fc1e9d6a78e22b3250038dff`. Les modifications locales de signatures, conservation et souscription ne font pas partie de ce redéploiement. Retirer une variable ne révoque pas la clé chez Youtrust et ne résilie pas une éventuelle offre fournisseur.

### Révocation chez le fournisseur — 23 octobre 2026

Après la demande « Révoque les clés youtrust » et la confirmation finale « Confirme », la clé Sandbox **gerimmo**, créée le 26 septembre, a été révoquée dans le compte Youtrust. Le fournisseur confirme « Clé API révoquée avec succès » ; les deux clés affichent désormais **Révoqué** et le quota disponible revient à 200. La clé **Gerimmo - Sandbox intégration** du 22 septembre était déjà révoquée. L’onglet Production indique que les clés de production sont indisponibles pour cette offre d’essai.

L’ancien webhook **gerimmo**, configuré en Production vers `https://www.gerimmo.app/api/youtrust/webhook`, a également été supprimé après cette confirmation. Le fournisseur confirme « Webhook supprimé avec succès » et affiche une liste vide (« Ajoutez votre premier webhook »). Aucun secret n’a été révélé. Aucune suppression de document ni modification de l’abonnement fournisseur n’a été effectuée.

Preuves conservées dans l’espace de travail principal : `outputs/youtrust-retrait-20261023/cles-revoquees.png` et `outputs/youtrust-retrait-20261023/webhook-supprime.png`. Ces changements de configuration ne nécessitent aucun nouveau déploiement de Gerimmo, les variables Vercel ayant déjà été retirées.

## Mise en production ultérieure

1. Faire relire et publier ce lot local selon le circuit habituel, sans y inclure implicitement une activation de souscription.
2. Avant la migration `20261022213731_conservation_preuves_et_invitations.sql`, vérifier une sauvegarde de moins de 90 minutes ; lancer la simulation du workflow **Migrations Supabase**, puis uniquement ce fichier nommé. Aucune application SQL directe à la production.
3. Publier l’interface après réussite de la migration. Lire le bilan de conservation avant d’activer les quatre nouvelles catégories de purge ; examiner notamment les anciennes files de suppression. Les protections des preuves ne nécessitent aucune suppression.
4. Retour fonctionnel fourni : désactive les nouvelles purges et ferme la nouvelle simulation, mais conserve volontairement la protection des preuves. Il ne réintroduit pas l’effacement dangereux à 24 mois.

## Vérifications locales

- **41 tests ciblés réussis** : 11 sur PostgreSQL local (preuves, signatures anciennes, invitations locataires/artisans, listes d’attente, dernier échange, rôles, MFA, arrêt d’urgence, rejeu et retour), 11 sur les ouvertures, 7 sur l’action de bilan, 12 sur manifeste et classement des tests.
- **Compilation complète et TypeScript réussis**, 65 pages statiques ; contrôle ESLint ciblé et vérification des espaces réussis.
- **Parcours mobile réussi sur la version compilée** : détail des limites de signature, bilan agrégé avec cinq catégories, aucune suppression, absence de débordement horizontal. Les six sessions de recette ont été renouvelées, dont le passage MFA du superadmin. Le premier essai utilisait une session expirée après le redémarrage de l’émulateur et a donc été refusé à la connexion ; le parcours a été relancé après une vraie reconnexion locale.
- Capture : `outputs/signatures-conservation-20261022/bilan-conservation-mobile.png` dans l’espace de travail principal.

Les essais de ce lot ne contactent ni Zoho ni Stripe et ne prouvent pas la délivrabilité externe. Aucun déploiement en production.

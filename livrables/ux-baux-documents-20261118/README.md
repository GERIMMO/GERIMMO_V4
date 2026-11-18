# UX 9B — Baux et documents — 18 novembre 2026

Branche locale `codex/ux-accueil-proprietaire-20261118`, base `23e06d9e24d7b7056af1a9b7ba62a1655b152011`. Périmètre : recommandations 13 et 18 de Claude. Un agent, travail limité à 30 minutes. Aucune publication ni modification de production.

## Présentation réalisée

- Bail propriétaire : retrait d’un niveau de volets dans Contrat et Documents, en conservant les onglets, formulaires et ancres. Repères contractuels explicites et prochaines actions issues de la liste métier existante.
- Dates : distinction entre location active, préparation, préavis et bail terminé ; conservation de la fin renseignée et de la sortie effective, même différentes. Aucune date juridique extrapolée.
- Dépôt : « Montant contractuel non indiqué » lorsque l’information manque ; les versements restent dans Suivi. Aucune déduction « Non versé » à partir d’une absence d’enregistrement.
- Documents : titres de factures, devis et photos générés rendus lisibles depuis les rattachements existants. Le montant provient exclusivement de la facture explicitement associée ; aucun métier d’artisan ni paiement supposé. Les titres personnalisés et les fichiers ne changent pas.
- Titre d’origine conservé dans « Détails et références du document ». Les états de signature, expiration, remplacement, purge et vérification restent prioritaires. « Disponible » remplace la vérification générique sans motif ; une facture attendant réellement une décision affiche « À valider ».
- Recherche existante conservée : filtre par bien, type Devis désormais identifiable, recherche par titre d’origine/référence et accès à l’annuaire puis aux justificatifs d’une personne. Pas de nouveau moteur de recherche ni de recherche textuelle sur le titre de présentation calculé.

## Preuves exécutées

| Contrôle | Résultat |
|---|---|
| Tests ciblés, quatre fichiers | **36 réussis, 0 échoué, 0 ignoré**, `tests-finaux.log` |
| TypeScript, ESLint des fichiers concernés | Réussis, sorties sans erreur |
| Baux actifs particulier et SCI, 390/1440 px | Quatre onglets, rechargement dans Documents, montant 640 € : **4 scénarios réussis** |
| Documents, 390/1440 px | Recherche par référence, titre lisible, référence d’origine, ouverture/fermeture du classement, PDF affiché et réellement téléchargé : **2 scénarios réussis**, fichier de 59 030 octets |
| Filtre Devis, 390/1440 px | **2 scénarios réussis** ; résultats documentaires visibles |
| Recherche d’une personne puis ses justificatifs | Parcours depuis Documents, annuaire, recherche Jeanne Martin et fiche ; `personne-*-resultat.json` |
| Bail en préparation | Affichage contrôlé aux deux largeurs ; assistant et champs conservés, sans signer ni activer |
| Comparaison avant/après | **8 comparaisons** : mêmes champs et destinations ; aucun débordement horizontal. **6 comparaisons de baux** : mêmes montants affichés (`invariants.json`, `montants.json`) |
| Droits | Locataire et propriétaire d’une autre organisation : accès à la fiche documentaire refusé (404), sans exposition des données |

Captures avant/après : `captures/`, index `captures.json`. Navigateurs Chromium, mobile **simulé** à 390 px, ordinateur à 1440 px. Aucun appareil physique testé. Les scénarios de navigation finaux ne remontent aucune erreur JavaScript.

## Limites et incidents du banc

- Aucun bail terminé n’existe dans la base fictive disponible. Ses libellés et la conservation des deux dates sont testés automatiquement ; **le parcours navigateur complet d’un bail terminé reste à vérifier**. Aucun bail n’a été artificiellement clôturé pour ce chantier.
- Les états documentaires « à valider », invalides, expirés, signés, remplacés et purgés sont couverts par les tests de présentation ; ils ne constituent pas de nouvelles opérations de validation ou signature.
- Le premier essai PDF a révélé une configuration locale incomplète : mauvais dossier Storage et ressources PDF.js absentes. Le banc a été rattaché au stockage fictif existant et le script normal `scripts/copier-pdfjs.mjs` exécuté. Lecture et téléchargement ont ensuite réussi, sans modification du lecteur applicatif ou du PDF.
- Les ouvertures de formulaires sont vérifiées ; aucune mutation de bail, classement documentaire, versement ou signature n’est soumise. Le téléchargement conserve le mécanisme existant de journalisation locale des accès.
- Aucun calcul, action serveur d’écriture, règle juridique, permission, fichier archivé ou migration n’est modifié. Les lectures d’appoint utilisent le client authentifié, les droits existants et le filtre d’organisation. Aucune requête ni secret de production n’a été utilisé.

## Reprise

Les scripts de navigation de ce dossier utilisent uniquement `localhost:3100`, le banc fictif et une session fournie par `GERIMMO_SESSION_FICTIVE` (fichier local, non commité). Les identifiants de dossiers sont ceux du banc existant. Ne pas exécuter ces scénarios sur la production. Le seul contrôle restant dans ce périmètre est la présentation complète d’un bail terminé avec une fixture disponible ; pas de reprise d’audit général.

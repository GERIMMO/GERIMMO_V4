# Gestion nationale, réseau d’artisans local

La gestion des biens, baux, documents, finances et incidents est indépendante du réseau. Un propriétaire ou une agence peut gérer des biens dans plusieurs communes et départements. Le réseau est contrôlé pour l’adresse du bien, et non celle du compte ou du siège.

## Ouvrir la première commune

1. Dans **Utilisateurs → Artisans à valider**, vérifier l’entreprise et ses pièces, puis valider son inscription et son SIRET. L’artisan doit disposer d’un compte et choisir une visibilité publique pour participer au réseau.
2. Dans **Développement → Réseau d’artisans** (`/admin/couverture`), choisir le département puis le métier et cliquer sur **Afficher la couverture**.
3. À l’étape 1, rechercher et cocher les communes concernées. La sélection groupée ne décide d’aucune ouverture.
4. À l’étape 2, choisir l’artisan puis **Rattacher à ces communes** et **Enregistrer le rattachement**. La recherche par nom, plus bas, permet de retrouver une entreprise qui n’apparaît pas parmi les 30 résultats courants.
5. À l’étape 3, choisir **Ouvrir ce métier**, cocher la confirmation explicite, puis **Ouvrir les communes sélectionnées**. Chaque commune doit avoir au moins un artisan éligible pour ce métier ; sinon, aucune commune de la sélection n’est ouverte.
6. Cliquer sur le nom d’une commune pour voir ses artisans et leur statut. Répéter séparément pour un autre métier. Ouvrir la plomberie n’ouvre pas l’électricité.

Pour fermer : sélectionner les communes et le métier, choisir **Fermer ce métier**, puis enregistrer. Les nouvelles mises en relation du réseau s’arrêtent ; les devis et interventions déjà engagés restent consultables et peuvent poursuivre leur parcours.

Si le dernier artisan éligible devient privé, non validé, exclu, sans compte ou sans rattachement, les nouvelles demandes sont refusées même si la décision commerciale est restée ouverte. Une assurance peut aussi limiter la disponibilité selon les travaux. Aucun remplacement fictif ni demande sans destinataire n’est créé.

## Côté propriétaire ou agence

Depuis la fiche d’un bien, choisir **Vérifier les artisans disponibles pour ce bien**, ou ouvrir **Carnet d’artisans → Vérifier le réseau pour mes biens**. Confirmer la commune officielle correspondant à l’adresse, puis choisir le métier et les travaux.

Un code postal peut correspondre à plusieurs communes : la sélection utilise le code commune INSEE. Une ville incohérente, une adresse vide ou une commune non confirmée empêche de vérifier le réseau ; elle ne ferme pas la gestion locative. Modifier l’adresse invalide la confirmation précédente.

Si le réseau est fermé, **Signaler mon intérêt** enregistre le compte, le bien, la commune et le métier. Répéter le geste ne crée pas de doublon. Aucun artisan n’est contacté, aucune consultation, intervention, date d’ouverture, notification ou campagne n’est créée. Les intérêts et les vraies sollicitations sont comptés séparément dans l’administration. La liste « Où le réseau est attendu » rassemble toute la France, tous métiers confondus, même en dehors du département affiché dans les réglages.

La demande de devis reste dans l’incident, après sa qualification. Le choix du métier et des travaux affiche la disponibilité et laisse utiliser les contacts personnels éligibles même dans une commune fermée. Les vérifications sont refaites dans la base au moment de l’envoi ; une page restée ouverte ne permet pas de les contourner.

## Données, déploiement et maintenance

- Aucun compte, bien, artisan ni historique supprimé. Les anciennes sollicitations conservent l’origine « historique ». Les nouvelles enregistrent « carnet » ou « réseau » et la commune de départ.
- Aucun département, aucune commune ni aucun métier ouvert par défaut. Le filtre Essonne de l’administration ne vaut pas une ouverture.
- Référentiel officiel téléchargé le 27/09/2026 : https://geo.api.gouv.fr/communes?fields=code,nom,codeDepartement,codesPostaux&format=json. 34 969 communes ; source et empreinte conservées dans la migration. Aucun appel à un service géographique n’est nécessaire pendant l’utilisation. Les futures évolutions des communes devront faire l’objet d’une mise à jour contrôlée de ce référentiel.
- Appliquer les deux migrations dans l’ordre : `20260928080000_referentiel_communes_reseau.sql`, puis `20260928081000_ouverture_reseau_par_commune_metier.sql`, avant la mise en ligne du code. Utiliser d’abord le mode simulation du chantier Migrations Supabase.
- Aucune dépendance payante, aucun service payant ajouté. Les notifications déjà prévues pour une véritable demande de devis restent dans leur parcours existant.
- Tests dédiés : `tests/reseau-couverture.test.ts` (droits réels, propriétés multiples, demandes et intérêts, fermeture, carnet), `e2e/reseau-couverture.spec.ts` (formulaires, messages, choix et mobile). Les nouveaux écrans font partie de l’inventaire automatique.

Les résultats définitifs de livraison figurent dans la PR #132 et dans le compte rendu de cette tâche. Un test ignoré ou une session de production inaccessible ne constitue pas une validation réussie.

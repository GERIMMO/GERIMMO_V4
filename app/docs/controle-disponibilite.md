# Disponibilité et séparation des essais

Le contrôle GitHub `Disponibilité publique Gerimmo` lit l’accueil, la connexion,
les mentions légales et `/api/sante`, sans session ni secret. Il ne lance aucune
tâche métier et n’envoie aucun message aux clients. Il exige un HTTP 200 et, pour
la santé, une base disponible et une référence de version valide.

Deux passages sont prévus par heure, aux minutes 17 et 47 UTC. GitHub peut
retarder ou ignorer une exécution planifiée : ce dispositif ne garantit donc
pas une détection en temps réel. Après un échec, une seule seconde tentative
est faite cinq secondes plus tard. Un échec persistant rend le workflow rouge.
Le bilan conserve uniquement les chemins, états, horaires et durées, pendant
sept jours. Les notifications dépendent des préférences GitHub du dirigeant ;
la réception effective d’une alerte doit être vérifiée séparément.

Le bouton **Run workflow** permet un contrôle manuel. Le script se lance aussi
avec `node app/scripts/surveillance/disponibilite.mjs`. Les essais hors réseau
se lancent avec `node --test app/scripts/surveillance/disponibilite.test.mjs`.

Les nouvelles prévisualisations Vercel sont suspendues dans les réglages du
projet. Le contrôle `prebuild` refuse aussi une construction d’aperçu, y compris
manuelle via `npm run build`. Il laisse passer la production et le banc local.
Un ancien déploiement conserve son code et sa configuration : il faut traiter
les aperçus existants séparément. Avant de retirer ce garde-fou, préparer une
base et des services de test indépendants, puis vérifier l’isolation.

La CI exécute en complément les parcours essentiels propriétaire, locataire
et artisan sur WebKit au format téléphone, notamment les dépôts et la reprise
des saisies. Cette suite refuse une cible autre que le site et l’API locaux.
Elle complète Chromium ; elle ne certifie pas le comportement d’un iPhone
physique, de son clavier, de sa caméra ou de ses téléchargements natifs.

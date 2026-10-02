# Suite de l’audit — 2 octobre 2026, soirée

## Deux défauts supplémentaires corrigés

### A04 — Reprendre une génération après un rattachement échoué

Le PDF peut être enregistré en GED tandis que l’ajout de ses liens métier échoue. Avant correction, une nouvelle génération identique renvoyait l’identifiant du PDF existant et un message de succès sans réessayer ces liens. La pièce pouvait donc rester absente du dossier attendu.

La reprise exécute maintenant le rattachement pour un document nouveau **ou existant**, avec `ON CONFLICT DO NOTHING` sur les liens déjà présents. Un nouveau refus reste affiché comme un refus ; la page du dossier est actualisée seulement après réussite. Les droits de lecture et de rattachement restent ceux de la session courante.

Vérifications ciblées : quatre tests d’action (reprise, refus persistant, dépôt impossible, accès refusé), plus deux cas PostgreSQL ajoutés à la suite d’isolation documentaire (rejeu sans doublon et refus hors portefeuille). Les 17 tests de cette suite PostgreSQL passent.

### A05 — Fichier téléversé dont la fiche ne peut pas être créée

Après le téléversement, un refus d’insertion de la fiche documentaire laissait l’octet sans fiche. Le dépôt demande désormais sa mise en file de purge via la fonction existante, y compris lors d’une course de dépôt en double. Un fichier disposant déjà d’une fiche n’est pas mis en purge si seul le classement échoue. L’indisponibilité de la file ne masque pas le refus initial et produit un avertissement technique sans contenu de document.

Vérifications ciblées : cinq tests (unicité, version concurrente, droits refusés, service de purge indisponible, document déjà enregistré à conserver). Pas de nettoyage rétroactif massif des anciens fichiers.

## Validation et limites

TypeScript et lint ciblés passent. La validation complète doit être confirmée par la CI de la PR avant publication. Aucune donnée métier de production n’est modifiée par ces essais ; les tests SQL s’annulent en fin d’exécution.

La protection SQL des dates d’attestation, préparée dans la PR #159, n’est pas encore appliquée. La page GitHub des migrations est accessible, mais le bouton de lancement ne déplie pas son formulaire malgré les contrôles visuels. Aucun lancement de migration n’est revendiqué.

Le réglage des liens à 24 heures reste reporté, conformément à la demande. L’identité de l’éditeur et les contrôles externes réels restent ouverts. Ces correctifs ne prouvent pas à eux seuls la résolution des fichiers précis du testeur ; ils traitent des défauts de reprise identifiés dans le code publié.

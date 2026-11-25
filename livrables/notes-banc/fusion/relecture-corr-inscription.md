# Relecture adverse (Y-) des corrections R-01, C-02, C-03, E-01, E-02 — diff 3aeeee94..e71d2644 (25/11/2026)
Lecture seule. Code extrait par git archive dans un dossier à moi, supprimé à la fin. Base de sonde gerimmo_sonde_yrelecture : 575 migrations appliquées avec la boucle de preparer-ci, puis supprimée. Arbre fusion non modifié.
**Verdict : rien de bloquant.** Les cinq corrections tiennent. Je relève deux défauts mineurs (Y-01, Y-02).

## Vérifié (commande et sortie)
- R-01, base neuve (0 version archivée) : sous authenticated, `accepter_cgu('2026-11-24','compte','conditions_clients')` passe et la ligne n'a pas d'empreinte. Les lignes forgées « 2026-12-31 » (compte, espace_proprietaire, inscription) restent sans empreinte après l'archivage. La non-reconduction liste A et B ; A n'y est plus après un accord donné après l'archivage. Une insertion directe est refusée (« permission denied »). Droits : accepter_cgu pour authenticated seulement (anon non) ; non-reconduction pour service_role seulement ; definer, search_path vide.
- R-01, rejeu : md5 d'accepter_cgu = 05c1f882…, le même que le texte de 20261024090000. Première écriture (3aeeee94) puis e71d2644 : le texte du 24/10 est reposé. Retour joué deux fois : la non-reconduction reprend le md5 de 20261024100000 (45616595…) et son commentaire, le déclencheur est retiré, le registre est vidé. Réapplication sans erreur.
- R-01, actes : `accordAvantActe` (abonnement.ts:612-635) n'a pas changé. Avec 2026-11-24 « au prochain acte » : version non archivée, aucun appel ; version archivée, la ligne s'écrit avec empreinte. Hausse, périodicité et reprise sont gardées comme avec la première écriture.
- Ordre : accepter_cgu est la même fonction avant et après 150000. La non-reconduction ne s'appelle que pour une version à accord exprès, et il n'en existe aucune. L'ordre est donc sûr dans les deux sens.
- C-02, C-03, E-01 : 182/182 sur les 6 fichiers ciblés ; 1132 réussis sur 48 fichiers liés. Les 2 fichiers en échec refusent un nom de base hors « gerimmo_ci_ » : c'est mon environnement. La sonde E-01 d'origine échoue sur 3aeeee94 (Stripe appelé) et passe sur e71d2644. L'empreinte 67391a33 ne bouge pas. Seule la page des mentions légales affiche le capital.

## Y-01 (mineur) — E-02 : tout échec d'envoi est traité comme « non parti »
reception-loyer.ts:156 range dans `nonServis` toute réponse en erreur, sans lire `incertain` ni `recuperable`. Les lignes :161, :169 et :175 l'écrivent ensuite. Sonde vitest, avant et après :
- Locataire seul, délai dépassé (`incertain`) : « La relance n'est pas partie et n'est pas enregistrée. … L'envoi n'est pas confirmé et a peut-être eu lieu ». Aucune trace. Après un paiement partiel, la relance repart avec une 2e clé (2 clés distinctes, comme avant la correction).
- Colocation, colocataire en `incertain` : la note durable du bail dit « 1 envoi à terminer (non parti) ».
- Colocation, refus 429 (`recuperable`) : « réessayez dans un instant. Ce palier de relance ne repart plus depuis Gerimmo ». Le second clic est refusé. Avant la correction, le colocataire était servi au second clic.
Correction : traiter `incertain` comme peut-être parti (écrire la trace, avec « non confirmé »). Pour `recuperable`, ne pas fermer le palier pour la personne non servie, ou ne plus dire « réessayez ». Ajouter les deux cas au test.

## Y-02 (mineur) — plan, contrôle 8 du jour de publication
PLAN-PUBLICATION-NOTES.md:59-61 fait appeler `accepter_cgu('2099-01-01')` en production avec un compte de test. Avant, ce contrôle attendait un refus et n'écrivait rien. La table est en ajout seul : sonde, « Une acceptation des conditions ne se modifie ni ne se supprime », même avec service_role. La ligne s'affiche dans `acceptations_sans_version_archivee` et ne part qu'avec le compte. Correction : jouer ce contrôle dans une transaction annulée, ou comparer le md5 du texte (05c1f882…).

## Supposé ou non vérifié
- Non rejoués (ports interdits) : premier-mot-de-passe-session-banc et les parcours navigateur. Je me fie aux journaux de l'auteur : 6/6 et 22 réussis.
- Cas latent, inatteignable aujourd'hui : un accord à accord exprès donné avant l'archivage masque l'écran (nouvelle-version-conditions.ts:129) et n'est pas compté. Il faudrait qu'une telle version existe et soit archivée alors qu'il y a des abonnés, ce que la console refuse (conditions-versions-serveur.ts:164-168).
- Production non lue.

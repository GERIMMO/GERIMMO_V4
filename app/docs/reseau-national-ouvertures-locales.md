# Gestion nationale, réseau d’artisans choisi par l’artisan

La gestion des biens, baux, documents, finances et incidents est indépendante du réseau. Un propriétaire ou une agence peut gérer des biens dans plusieurs communes et départements. Le réseau est contrôlé pour l’adresse du bien, et non celle du compte ou du siège.

> **Mise à jour du 23/10/2026 (décision du dirigeant, migration `20261023180000_reseau_zone_choisie_par_artisan.sql`).**
> Le réseau ne s’ouvre plus commune × métier par le super-administrateur (règle de la PR #132, 28/09/2026). Chaque
> artisan choisit lui-même sa zone d’intervention (codes postaux ou départements entiers) et ses métiers ; il est
> proposé dès que Gerimmo a validé son inscription (SIRET vérifié) et que son profil est public. Les écrans
> « Rattacher un artisan » et « Décider de l’ouverture » sont retirés ; `reseau_regler_ouverture` et
> `reseau_rattacher_artisan` refusent en disant pourquoi. Les tables `reseau_ouvertures` et `reseau_artisan_communes`
> sont conservées (historique, retour arrière), ni lues ni écrites.

## Comment un artisan entre dans le réseau

1. L’artisan s’inscrit (`/artisan/inscription`) : SIRET, mobile, métiers, zone d’intervention (codes postaux comme `91300`, ou départements entiers comme `91`, `2A`, `974`).
2. Dans **Réseau d’artisans → Inscriptions et validations** (`/admin/artisans`), le super-administrateur vérifie l’entreprise, ses pièces et le SIRET, puis valide l’inscription. L’écran montre la zone déclarée : la validation rend l’artisan proposable dans cette zone.
3. L’artisan rend son profil public dans **Mon entreprise → Qui peut me solliciter**. La validation ne le fait pas à sa place. La carte « Suis-je proposé dans le réseau ? » lui dit ce qui manque.
4. Il est alors proposé, pour chacun de ses métiers, aux propriétaires dont le bien a un code postal couvert par sa zone. La décennale (selon la nature des travaux), les listes noires globale et locale et l’adresse confirmée du bien restent contrôlées.

L’artisan modifie lui-même sa zone et ses métiers dans **Mon entreprise → Mes métiers et ma zone**. Chaque ajout ou retrait est inscrit au journal d’audit (`artisan_zone_modifiee`, `artisan_metiers_modifies` : auteur, avant, après, état de la fiche), visible dans **Historique et sauvegardes**. Une agence ne peut plus les modifier pour un artisan qui a son compte ; elle garde la main sur une fiche sans compte de son carnet actif, qui n’est jamais proposée au réseau.

Pour écarter un artisan du réseau : « Suspendre la validation » de son inscription depuis sa fiche (`/admin/clients/artisans/<id>`). La liste noire globale existe en base (`artisan_decider_plateforme`, décision `blacklist_globale`) mais aucun écran ne la pose. Aucun levier par commune n’existe plus.

## Couverture, côté supervision

**Réseau d’artisans → Couverture du réseau** (`/admin/couverture`) : choisir le département et le métier, puis **Afficher la couverture**. Le tableau donne, par commune, les artisans proposés et déclarés, les intérêts et les demandes envoyées. Cliquer sur une commune liste les artisans dont la zone la couvre et ce qui manque à chacun. Rien n’y est à décider.

## Côté propriétaire ou agence

Depuis la fiche d’un bien, choisir **Vérifier les artisans disponibles pour ce bien**, ou ouvrir **Carnet d’artisans → Vérifier le réseau pour mes biens**. Confirmer la commune officielle correspondant à l’adresse, puis choisir le métier et les travaux.

Un code postal peut correspondre à plusieurs communes : la commune est confirmée par son code INSEE. Une ville incohérente, une adresse vide ou une commune non confirmée empêche de vérifier le réseau ; elle ne ferme pas la gestion locative. Modifier l’adresse invalide la confirmation précédente.

Si aucun artisan du réseau n’est disponible, **Signaler mon intérêt** enregistre le compte, le bien, la commune et le métier. Répéter le geste ne crée pas de doublon. Aucun artisan n’est contacté, aucune consultation, intervention, date, notification ou campagne n’est créée. La liste « Où le réseau est attendu » rassemble toute la France.

La demande de devis reste dans l’incident, après sa qualification. Les contacts personnels éligibles (carnet) restent utilisables même sans artisan du réseau. Les vérifications sont refaites dans la base au moment de l’envoi ; une page restée ouverte ne permet pas de les contourner. Le téléphone et l’e-mail d’un artisan du réseau ne sont rendus qu’à une organisation qui l’a dans son carnet ; une fois la demande envoyée, le propriétaire lit ses coordonnées dans l’incident.

## Données, déploiement et maintenance

- Aucun compte, bien, artisan ni historique supprimé. Les sollicitations enregistrent l’origine « carnet » ou « réseau » et la commune de départ.
- Référentiel officiel téléchargé le 27/09/2026 : https://geo.api.gouv.fr/communes?fields=code,nom,codeDepartement,codesPostaux&format=json. 34 969 communes.
- Migrations : `20260928080000_referentiel_communes_reseau.sql`, `20260928081000_ouverture_reseau_par_commune_metier.sql`, puis `20261023180000_reseau_zone_choisie_par_artisan.sql` (retour arrière dans `supabase/retours-arriere/`), avant la mise en ligne du code. Simulation d’abord, par le chantier Migrations Supabase.
- Tests dédiés : `tests/reseau-couverture.test.ts` (droits réels, zone et métiers, filtres, carnet, agences, supervision), `tests/reseau-zone-artisan-rejeu.test.ts` (rejeu et retour arrière), `tests/reseau-presence-artisan.test.ts` (sans base), `e2e/reseau-couverture.spec.ts`.

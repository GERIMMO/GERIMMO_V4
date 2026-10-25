// Client Supabase de la PLATEFORME, pour les tâches planifiées uniquement.
//
// Il porte la clé `service_role`, qui CONTOURNE la RLS : c'est la seule clé du
// produit qui voit toutes les organisations à la fois. Elle n'a donc rien à
// faire dans un écran, ni dans une action serveur déclenchée par un
// utilisateur — deux endroits où une faille d'autorisation la transformerait en
// accès universel. Elle ne sert qu'aux routes `/api/cron/*`, elles-mêmes
// fermées par `CRON_SECRET`.
//
// Exceptions tenues à la main, chacune APRÈS une lecture réservée qui prouve
// le droit de l'appelant : le webhook Stripe (signé), et, dans les actions
// d'abonnement, le remplacement d'un client Stripe supprimé et la sortie de
// la grille historique (audit du 29/09/2026). Et la fabrique des liens de mot
// de passe (src/lib/lien-mot-de-passe.ts, 30/09/2026) : `auth.admin.generateLink`
// pour UNE adresse, appelée après le contrôle de l'action (superviseur, admin
// d'agence — bornée à 30 liens par organisation et par heure) ou, pour « mot
// de passe oublié » et l'INSCRIPTION (`generateLink` type `signup`, qui crée
// le compte sans faire partir l'e-mail PKCE de Supabase), après la limite de
// fréquence `autoriser_lien_mot_de_passe` — l'API d'administration n'a pas
// celle d'Auth. Dans tous ces cas la clé ne lit ni n'écrit aucune donnée
// métier : elle fabrique un jeton pour l'adresse que l'action a validée.
// Et la signature d'une lecture de 60 secondes (`createSignedUrl`) d'une photo jointe par le locataire, pour l'artisan destinataire
// de la demande de devis (src/lib/photos-demande-artisan.ts, D16, 14/10/2026) : APRÈS `lire_photo_incident_artisan`, qui prouve le
// droit, trace l'accès et rend le chemin. La clé ne lit pas le fichier elle-même et n'écrit ni ne supprime rien.
//
// Et l'INSERTION du formulaire de contact du site vitrine (src/app/actions/devis.ts, X02, 14/10/2026) : sans session,
// donc rien à prouver ; l'action écarte d'abord le robot (pot de miel) et valide les champs, puis insère UNE ligne dans
// `demandes_devis`, que la base borne (longueurs, plafond horaire). `anon` et `authenticated` n'ont plus aucun droit
// d'insertion sur cette table : cette action est la seule porte. La clé ne lit rien dans ce geste.
//
// Et, de même, l'inscription d'une agence sur la liste d'attente (src/app/actions/liste-attente-agences.ts, 20/10/2026) :
// pot de miel puis validation, UNE ligne insérée dans `liste_attente_agences`, que la base borne (longueurs, unicité de
// l'adresse, plafond horaire) ; `anon` et `authenticated` n'ont aucun droit d'insertion sur cette table. La clé ne lit
// rien dans ce geste.
//
// Et le contrôle manuel des archives (actions/conservation-signatures.ts) :
// APRÈS is_super_admin() sur la session courante, MFA comprise. Lecture de
// cinq circuits terminés au maximum et de leurs PDF/certificats, puis journal
// agrégé. Aucun fichier, chemin ou signataire n'est exposé au navigateur ;
// aucune écriture métier ni suppression n'est permise par cette action.
//
// Et les gestes du contrat d'abonnement (plan de conformité du 23/10/2026, lots 1B et 1C) : la rétractation
// (actions/retractation.ts) APRÈS `ma_retractation` (responsable de l'espace) ou is_permanent_super_admin() pour une
// rétractation reçue par courriel ; la résiliation et la commande confirmée (actions/abonnement.ts) APRÈS
// `ma_souscription_stripe` ou les lectures réservées de la souscription. La clé n'appelle que des fonctions réservées à
// `service_role` qui enregistrent une déclaration en ajout seul (`retractation_enregistrer`), consignent un geste d'une
// liste fermée sans coordonnées (`abonnement_geste_consigner`) ou marquent un courrier parti ; elle lit le contexte du
// courrier de CETTE organisation (`abonnement_courrier_contexte`). Aucune lecture d'une autre organisation.
//
// Et l'archivage de la version en vigueur des conditions (actions/conditions-versions.ts, 24/10/2026) : APRÈS
// is_permanent_super_admin() sur la session courante, second facteur compris. La clé lit l'identité de l'éditeur
// (déjà publique) et appelle `archiver_version_conditions`, qui n'insère qu'une version manquante et ne réécrit jamais
// une version archivée (table en ajout seul). Le texte archivé vient de la page publiée, jamais du navigateur.
//
// Et l'affichage du suivi dans une traversée de supervision (lecture-presentation-signatures.ts) :
// APRÈS verifierAccesEspace (session, organisation, trace) ET is_super_admin() (MFA).
// SELECT borné à l'organisation et aux baux/documents affichés, six colonnes d'état et
// de références uniquement. Aucun signataire, secret, lien prestataire ni écriture.
// Les membres ordinaires conservent leur client de session et leur RLS.
//
// Ce que le client peut faire est en outre borné côté base : les fonctions que
// les tâches appellent sont révoquées de `anon` et `authenticated` et accordées
// au seul `service_role`, et chacune ne rend que ce dont la tâche a besoin.

import "server-only";
import { createClient as creerClientSupabase } from "@supabase/supabase-js";

export function clientDeService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cle) return null;
  return creerClientSupabase(url, cle, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

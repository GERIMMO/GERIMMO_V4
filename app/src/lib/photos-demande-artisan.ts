// La photo jointe par le locataire, vue par l'artisan (D16, fiche ART-15 ; décision du dirigeant du 14/10/2026, option A).
//
// L'artisan chiffrait à l'aveugle : la demande de devis disait « photo jointe » sans la montrer. Elle lui est maintenant visible dès
// la demande de devis, puis pendant la mission, EN LECTURE SEULE et par une URL signée de courte durée.
//
// Comment le droit est tenu (rien n'est rendu avant) :
//  1. la base décide : `lire_photo_incident_artisan` revérifie que l'artisan est destinataire de la demande (ou de la mission), que
//     la photo est une photo du locataire liée à cet incident, l'enregistre au journal d'accès — sans trace, pas d'accès — et ne rend
//     alors que le chemin de stockage ;
//  2. le serveur signe : la clé de service ne sert qu'ensuite, à demander à Storage une URL de lecture valable 60 secondes. Elle ne
//     lit, n'écrit, ne déplace ni ne supprime rien d'autre ; la POLITIQUE DE STOCKAGE N'A PAS CHANGÉ : l'artisan, avec ses propres
//     droits, ne lit toujours pas ce fichier, et personne ne peut l'écraser ;
//  3. le navigateur est redirigé vers cette URL, qui expire d'elle-même. Le flux ne passe pas par la fonction de l'application
//     (limite de 4,5 Mo des réponses des fonctions Vercel, alors qu'une photo peut peser 10 Mo).
// Le chemin de stockage vient de la base, jamais de l'adresse demandée.
//
// Ce qui n'est pas essayé en recette locale : l'application de ces URL par le vrai service Storage de Supabase (voir le rapport de lot).

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { pageErreurFichier } from "@/lib/page-erreur-fichier";

/** Durée de vie de l'URL signée : le temps que le navigateur charge l'image. */
export const DUREE_LIEN_PHOTO_SECONDES = 60;
const COMPARTIMENT = "documents";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** D'où l'artisan demande la photo : une demande de devis, ou une mission. Jamais les deux. */
export type ContextePhoto = { sollicitation: string; intervention?: undefined } | { intervention: string; sollicitation?: undefined };

type Erreur = { code?: string; message: string } | null;
export type ClientArtisan = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: Erreur }>;
};
export type ClientSignature = {
  storage: { from: (compartiment: string) => { createSignedUrl: (chemin: string, secondes: number) => PromiseLike<{ data: { signedUrl: string } | null; error: { message: string } | null }> } };
};

type Refus = { statut: 403 | 404 | 503; titre: string; message: string };
export type ResultatPhoto = { url: string } | Refus;

const INDISPONIBLE: Refus = {
  statut: 503,
  titre: "Photo momentanément indisponible",
  message: "La photo n'a pas pu être chargée à l'instant. Elle n'est pas perdue : réessayez dans un instant.",
};

/** Contrôle le droit en base, puis signe une lecture de 60 secondes. N'ouvre rien d'autre. */
export async function adresseSigneePhoto(artisan: ClientArtisan, signature: ClientSignature, contexte: ContextePhoto, documentId: string): Promise<ResultatPhoto> {
  const origine = contexte.sollicitation ?? contexte.intervention;
  if (!UUID.test(documentId) || !origine || !UUID.test(origine)) {
    return { statut: 404, titre: "Photo introuvable", message: "Cette photo n'existe pas ou n'est pas accessible avec votre compte." };
  }
  const { data, error } = await artisan.rpc("lire_photo_incident_artisan", {
    p_document: documentId,
    p_sollicitation: contexte.sollicitation ?? null,
    p_intervention: contexte.intervention ?? null,
  });
  if (error) {
    return error.code === "42501"
      ? { statut: 403, titre: "Accès refusé", message: "Cette photo n'est pas accessible avec votre compte, ou la demande n'est plus ouverte." }
      : INDISPONIBLE;
  }
  if (typeof data !== "string" || data.length === 0) {
    return { statut: 404, titre: "Photo introuvable", message: "Cette photo n'existe pas ou n'est pas accessible avec votre compte." };
  }
  const { data: signee, error: erreurSignature } = await signature.storage.from(COMPARTIMENT).createSignedUrl(data, DUREE_LIEN_PHOTO_SECONDES);
  if (erreurSignature || !signee?.signedUrl) return INDISPONIBLE;
  return { url: signee.signedUrl };
}

/**
 * La réponse d'une route de photo : session vérifiée, droit contrôlé en base, puis redirection privée vers l'URL signée.
 * `retour` complète la page d'erreur (« depuis votre demande de devis »).
 */
export async function servirPhoto(contexte: ContextePhoto, documentId: string, retour: string): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return pageErreurFichier(403, "Accès refusé", "Votre session a peut-être expiré. Reconnectez-vous, puis réessayez.", retour);
  }
  const service = clientDeService();
  if (!service) {
    return pageErreurFichier(INDISPONIBLE.statut, INDISPONIBLE.titre, INDISPONIBLE.message, retour);
  }
  const resultat = await adresseSigneePhoto(supabase, service, contexte, documentId);
  if ("url" in resultat) {
    return new Response(null, {
      status: 302,
      headers: { Location: resultat.url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
    });
  }
  return pageErreurFichier(resultat.statut, resultat.titre, resultat.message, retour);
}

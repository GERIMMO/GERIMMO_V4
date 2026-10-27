import { createClient } from "@/lib/supabase/server";
import {
  assemblerQuittanceDelivree,
  chargerQuittanceDocument,
  manquantsQuittance,
} from "@/lib/quittance-conforme";
import { htmlQuittancePourEcran } from "../ecran";

// Le document conforme d'une quittance, pour l'aperçu en fenêtre de « Mes
// documents » (décision du 27/10 : un seul geste de consultation pour toutes
// les pièces du locataire). Une quittance n'a pas de fichier : son document
// se compose à la lecture, sous l'identité de l'appelant — la même fonction
// `quittance_document` et la même barrière que la page /quittance/[id] (un
// champ obligatoire vide, et le document n'est pas délivré).
const ENTETES = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, ctx: RouteContext<"/quittance/[quittanceId]/document">) {
  const { quittanceId } = await ctx.params;
  // Un identifiant qui n'est pas un UUID ne désigne aucun document (même règle que le proxy).
  const q = UUID.test(quittanceId) ? await chargerQuittanceDocument(await createClient(), quittanceId) : null;
  if (!q) {
    return Response.json({ erreur: "Ce document n'existe pas ou n'est pas à votre disposition." }, { status: 404, headers: ENTETES });
  }
  const document = assemblerQuittanceDelivree(q);
  if (manquantsQuittance(document).length) {
    return Response.json(
      { erreur: `Votre ${q.est_quittance ? "quittance" : "reçu"} n'est pas encore disponible : votre gestionnaire doit d'abord compléter les informations obligatoires du document.` },
      { status: 409, headers: ENTETES }
    );
  }
  return Response.json({ html: htmlQuittancePourEcran(document.html) }, { headers: ENTETES });
}

import { traiterTransfertContact } from "@/lib/transfert-contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const resultat = await traiterTransfertContact(request);
  // Codes fixes uniquement : aucun contenu, adresse, identifiant ou secret dans les journaux.
  if (resultat.statut >= 400) console.warn("[transfert-contact]", resultat.etat);
  return Response.json({ etat: resultat.etat }, { status: resultat.statut, headers: { "Cache-Control": "no-store" } });
}

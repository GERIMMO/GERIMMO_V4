// L'ARCHIVE COMPLÈTE DE L'ESPACE (plan de conformité du 23/10/2026, R49 ; RGPD art. 15, 20 et 28.3 g).
//
// POST : demande une archive. Réservé au titulaire de l'espace (propriétaire ou administrateur de l'agence), second
// facteur validé ou mot de passe saisi depuis moins de quinze minutes ; une demande à la fois, trois par jour au plus
// (`demander_export_complet`, qui contrôle tout en base et l'inscrit au journal d'audit). La préparation commence
// après la réponse (`after`) ; la mission « purge » de la nuit reprend celle qu'une coupure aurait interrompue.
// GET ?archive=<id> : redirige vers le lien signé (24 h) de l'archive prête, pour celui qui l'a demandée, mêmes
// conditions d'identité ; chaque téléchargement est inscrit au journal d'audit et, pour chaque pièce sensible
// contenue, au journal des accès aux pièces.
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { sansJargon } from "@/lib/erreurs";
import { identiteRecenteConfirmee, MESSAGE_IDENTITE_EXPORT } from "@/lib/export-complet";
import { construireExportComplet, lienExportComplet } from "@/lib/export-complet-serveur";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function retour(request: Request, etat: string, statut = 303): Response {
  return Response.redirect(new URL(`/compte/donnees?archive=${encodeURIComponent(etat)}#archive`, request.url), statut);
}

async function identite() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims ?? null;
  return { supabase, claims };
}

export async function POST(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  if (!UUID.test(orgId)) return retour(request, "refusee");
  const { supabase, claims } = await identite();
  if (!claims?.sub) return Response.redirect(new URL(`/connexion?suite=${encodeURIComponent("/compte/donnees#archive")}`, request.url), 303);
  if (!identiteRecenteConfirmee(claims)) return retour(request, "identite");
  const { data: id, error } = await supabase.rpc("demander_export_complet", { p_org: orgId });
  if (error || typeof id !== "string") {
    const code = (error as { code?: string } | null)?.code;
    return retour(request, code === "23505" ? "en_cours" : code === "54000" ? "limite" : code === "42501" ? "refusee" : "indisponible");
  }
  const service = clientDeService();
  if (service) {
    after(async () => {
      try {
        await construireExportComplet(service, id);
      } catch (e) {
        console.error("[export complet] préparation interrompue :", sansJargon(e instanceof Error ? e.message : String(e)));
      }
    });
  }
  return retour(request, "demandee");
}

export async function GET(request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const archive = new URL(request.url).searchParams.get("archive") ?? "";
  if (!UUID.test(orgId) || !UUID.test(archive)) return retour(request, "introuvable");
  const { claims } = await identite();
  if (!claims?.sub) return Response.redirect(new URL(`/connexion?suite=${encodeURIComponent("/compte/donnees#archive")}`, request.url), 303);
  if (!identiteRecenteConfirmee(claims)) {
    return new Response(MESSAGE_IDENTITE_EXPORT, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  const service = clientDeService();
  if (!service) return retour(request, "indisponible");
  const lien = await lienExportComplet(service, { exportId: archive, accountId: claims.sub, orgId });
  if ("erreur" in lien) return retour(request, "introuvable");
  return new Response(null, { status: 303, headers: { Location: lien.url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

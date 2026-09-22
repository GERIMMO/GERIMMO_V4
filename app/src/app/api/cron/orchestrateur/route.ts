import { timingSafeEqual } from "node:crypto";
import { clientDeService } from "@/lib/supabase/service";
import { orchestrerDossiers } from "@/lib/orchestrateur";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const fourni = request.headers.get("authorization") ?? "";
  if (!secret || Buffer.byteLength(fourni) !== Buffer.byteLength(`Bearer ${secret}`) ||
      !timingSafeEqual(Buffer.from(fourni), Buffer.from(`Bearer ${secret}`))) {
    return Response.json({ erreur: "Non autorisé." }, { status: 401 });
  }
  const supabase = clientDeService();
  if (!supabase) return Response.json({ erreur: "Service indisponible." }, { status: 503 });
  const resultat = await orchestrerDossiers(supabase);
  return Response.json(resultat, { status: resultat.erreur ? 500 : 200 });
}

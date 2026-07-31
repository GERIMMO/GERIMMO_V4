import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GrilleEdl } from "./grille-edl";

export const metadata = { title: "État des lieux — Gerimmo" };

export default async function PageEdl(
  props: PageProps<"/agence/[orgId]/baux/[bailId]/edl/[edlId]">
) {
  const { orgId, bailId, edlId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: edl } = await supabase
    .from("etats_des_lieux")
    .select("id, type, etat, date_edl")
    .eq("id", edlId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!edl) notFound();

  const { data: lignes } = await supabase
    .from("edl_lignes")
    .select("id, categorie, libelle, etat, commentaire")
    .eq("edl_id", edlId)
    .eq("organization_id", orgId)
    .order("ordre");

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <Link
          href={`/agence/${orgId}/baux/${bailId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Bail
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          État des lieux d&apos;{edl.type === "entree" ? "entrée" : "sortie"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {edl.etat === "signe" ? "Signé (figé)" : "En cours de saisie"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grille</CardTitle>
          <CardDescription>
            Une ligne par élément et équipement du lot. Aucune ligne ne peut rester
            sans état pour signer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GrilleEdl
            orgId={orgId}
            bailId={bailId}
            edlId={edlId}
            signe={edl.etat === "signe"}
            lignes={lignes ?? []}
          />
        </CardContent>
      </Card>
    </main>
  );
}

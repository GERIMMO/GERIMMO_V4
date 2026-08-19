import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate } from "@/lib/ged";
import { COULEURS_ETAT_EDL } from "@/lib/baux";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GrilleEdl } from "./grille-edl";
import { EdlAnnexes, type Compteur, type Cle } from "./edl-annexes";
import { premier, type UnOuPlusieurs } from "@/lib/postgrest";

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

  const [{ data: lignes }, { data: compteurs }, { data: cles }] = await Promise.all([
    supabase
      .from("edl_lignes")
      .select("id, categorie, piece, libelle, etat, commentaire")
      .eq("edl_id", edlId)
      .eq("organization_id", orgId)
      .order("ordre"),
    supabase
      .from("edl_compteurs")
      .select("id, type, numero, releve")
      .eq("edl_id", edlId)
      .order("created_at"),
    supabase
      .from("edl_cles")
      .select("id, libelle, nombre, reference")
      .eq("edl_id", edlId)
      .order("created_at"),
  ]);

  // Repli générique : la grille existe mais sans aucune ligne rattachée à une
  // pièce. Il faut le lot pour proposer d'y remédier.
  const toutesLignes = (lignes ?? []) as { categorie: string; piece: string | null }[];
  const grilleGenerique =
    toutesLignes.length > 0 && !toutesLignes.some((l) => l.categorie === "piece");
  const signe = edl.etat === "signe";

  const { data: bail } = grilleGenerique
    ? await supabase
        .from("baux")
        .select("lot:lots(id, bien_id)")
        .eq("id", bailId)
        .maybeSingle()
    : { data: null };
  const lotDuBail = premier(
    (bail as { lot: UnOuPlusieurs<{ id: string; bien_id: string }> } | null)?.lot
  );
  const lotId = lotDuBail?.id ?? null;
  const bienId = lotDuBail?.bien_id ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <Link
          href={`/agence/${orgId}/baux/${bailId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Bail
        </Link>
        <p className="eyebrow mt-1">
          {edl.type === "entree" ? "Entrée" : "Sortie"}
          {edl.date_edl ? ` · ${formaterDate(edl.date_edl)}` : ""}
        </p>
        <div className="entete-page">
          <h1>
            État des lieux d&apos;{edl.type === "entree" ? "entrée" : "sortie"}
          </h1>
          <span className={COULEURS_ETAT_EDL[edl.etat] ?? "puce puce-grise"}>
            {signe ? "Signé — figé" : "En cours de saisie"}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pièce par pièce</CardTitle>
          <CardDescription>
            Une ligne par élément et équipement du lot. Aucune ligne ne peut rester
            sans état pour signer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* La grille retombe sur « Général » quand le lot n'a pas de pièces
              déclarées. Rien ne le signalait : l'agent signait un document qui
              ne distingue pas la cuisine de la chambre, et découvrait le
              problème à la sortie, au moment de justifier une retenue. */}
          {grilleGenerique && (
            <div className="mb-4 border-l-[3px] border-l-warning bg-warning-soft p-3 text-sm">
              <p className="font-medium">Cet état des lieux ne détaille aucune pièce.</p>
              <p className="mt-1 text-muted-foreground">
                Le lot n&apos;a pas de pièces déclarées : la grille se limite aux
                éléments généraux. À la sortie, il sera difficile de rattacher une
                dégradation à un endroit précis — et donc de justifier une retenue
                sur le dépôt de garantie.
              </p>
              {!signe && lotId && (
                <Link
                  href={`/agence/${orgId}/parc/${bienId}/lots/${lotId}#pieces`}
                  className="mt-2 inline-block underline underline-offset-2"
                >
                  Déclarer les pièces du lot, puis régénérer la grille
                </Link>
              )}
            </div>
          )}
          <GrilleEdl
            orgId={orgId}
            bailId={bailId}
            edlId={edlId}
            signe={signe}
            lignes={lignes ?? []}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compteurs & clés</CardTitle>
          <CardDescription>
            Relevés de compteurs et clés/badges remis — repris à l&apos;état des lieux de
            sortie pour comparaison.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EdlAnnexes
            orgId={orgId}
            bailId={bailId}
            edlId={edlId}
            signe={signe}
            compteurs={(compteurs ?? []) as Compteur[]}
            cles={(cles ?? []) as Cle[]}
          />
        </CardContent>
      </Card>
    </main>
  );
}

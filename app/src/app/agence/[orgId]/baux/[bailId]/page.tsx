import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDate } from "@/lib/ged";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ETATS_ELEMENT } from "./edl/[edlId]/grille-edl";
import {
  FormulaireBailSigne,
  BoutonActiverBail,
  FormulaireConge,
  FormulaireCreerEdl,
} from "./formulaires-bail";

export const metadata = { title: "Bail — Gerimmo" };

const TYPES_BAIL: Record<string, string> = { nu: "Nu", meuble: "Meublé", colocation: "Colocation" };
const ETATS_BAIL: Record<string, string> = {
  brouillon: "Brouillon",
  actif: "Actif",
  preavis: "Préavis",
  termine: "Terminé",
};

export default async function PageBail(props: PageProps<"/agence/[orgId]/baux/[bailId]">) {
  const { orgId, bailId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: bail } = await supabase
    .from("baux")
    .select(
      "id, type, etat, loyer_hc, charges, depot_garantie, jour_echeance, lot_id, locataire_principal, document_signe, date_fin"
    )
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!bail) notFound();

  const [{ data: lot }, { data: locataire }, { data: edls }, { data: conges }] = await Promise.all([
    supabase.from("lots").select("id, nom, bien_id").eq("id", bail.lot_id).maybeSingle(),
    bail.locataire_principal
      ? supabase.from("persons").select("nom, prenom").eq("id", bail.locataire_principal).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("etats_des_lieux")
      .select("id, type, etat")
      .eq("bail_id", bailId)
      .order("type"),
    supabase
      .from("conges")
      .select("par, date_premiere_presentation, preavis_mois, date_effet")
      .eq("bail_id", bailId)
      .order("created_at", { ascending: false }),
  ]);

  const edlSignes = (edls ?? []).filter((e) => e.etat === "signe");
  const { data: comparatif } =
    edlSignes.some((e) => e.type === "entree") && edlSignes.some((e) => e.type === "sortie")
      ? await supabase.rpc("comparatif_edl", { p_bail: bailId })
      : { data: null };
  const ecarts = ((comparatif ?? []) as {
    libelle: string;
    etat_entree: string | null;
    etat_sortie: string | null;
    ecart: boolean;
  }[]).filter((c) => c.ecart);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        {lot && (
          <Link
            href={`/agence/${orgId}/parc/${lot.bien_id}/lots/${lot.id}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {lot.nom}
          </Link>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Bail {TYPES_BAIL[bail.type] ?? bail.type}</h1>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-sm">
            {ETATS_BAIL[bail.etat] ?? bail.etat}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Locataire : {locataire ? `${locataire.nom}${locataire.prenom ? ` ${locataire.prenom}` : ""}` : "—"}
          {" · "}
          {bail.loyer_hc ? `${bail.loyer_hc} € HC` : "loyer non fixé"}
          {bail.charges ? ` + ${bail.charges} € de charges` : ""}
          {bail.date_fin ? ` · fin le ${formaterDate(bail.date_fin)}` : ""}
        </p>
      </div>

      {/* Cycle du bail */}
      {bail.etat === "brouillon" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Activer le bail</CardTitle>
            <CardDescription>
              Déposez le bail signé (signature hors plateforme en V0), puis activez :
              contrôles automatiques (détention 100 %, diagnostics valides) → le lot
              passe loué et une alerte d&apos;EDL d&apos;entrée est créée.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {bail.document_signe ? (
              <p className="text-sm text-success-soft-foreground">✓ Bail signé déposé.</p>
            ) : (
              <FormulaireBailSigne orgId={orgId} bailId={bailId} />
            )}
            <BoutonActiverBail orgId={orgId} bailId={bailId} />
          </CardContent>
        </Card>
      )}

      {bail.etat === "actif" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Congé</CardTitle>
            <CardDescription>
              LRAR hors plateforme : saisissez la date de première présentation. Le
              préavis réduit exige un justificatif.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireConge orgId={orgId} bailId={bailId} />
          </CardContent>
        </Card>
      )}

      {(conges ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Congé enregistré</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {(conges ?? []).map((c, i) => (
              <p key={i}>
                Donné par {c.par}, présentation le {formaterDate(c.date_premiere_presentation)},
                préavis {c.preavis_mois} mois → effet le{" "}
                <span className="font-medium">{formaterDate(c.date_effet)}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {/* États des lieux */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">États des lieux</CardTitle>
          <CardDescription>
            Grille générée depuis le lot, saisie pièce par pièce, figée à la signature.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(edls ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun état des lieux.</p>
          ) : (
            <ul className="space-y-2">
              {(edls ?? []).map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span className="w-20 text-sm font-medium">
                    {e.type === "entree" ? "Entrée" : "Sortie"}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {e.etat === "signe" ? "Signé" : "En cours"}
                  </span>
                  <Link
                    href={`/agence/${orgId}/baux/${bailId}/edl/${e.id}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Ouvrir la grille
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {(edls ?? []).length < 2 && <FormulaireCreerEdl orgId={orgId} bailId={bailId} />}
        </CardContent>
      </Card>

      {/* Comparatif entrée/sortie */}
      {comparatif && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparatif entrée / sortie</CardTitle>
            <CardDescription>
              Les écarts d&apos;état entre l&apos;entrée et la sortie sont mis en évidence.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ecarts.length === 0 ? (
              <p className="text-sm text-success-soft-foreground">
                Aucun écart : le logement est rendu dans le même état.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {ecarts.map((c) => (
                  <li key={c.libelle} className="flex items-center gap-2">
                    <span className="w-36 shrink-0 truncate">{c.libelle}</span>
                    <span className="text-muted-foreground">
                      {c.etat_entree ? ETATS_ELEMENT[c.etat_entree] ?? c.etat_entree : "—"} →{" "}
                    </span>
                    <span className="font-medium text-destructive">
                      {c.etat_sortie ? ETATS_ELEMENT[c.etat_sortie] ?? c.etat_sortie : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

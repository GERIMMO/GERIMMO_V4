import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_DIAGNOSTIC,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  COULEURS_STATUT_DIAGNOSTIC,
  LIBELLES_STATUT_DIAGNOSTIC,
  statutDiagnostic,
  diagnosticsAttendus,
  alertesDecence,
} from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireDiagnostic } from "../../formulaire-diagnostic";
import { FormulaireLot } from "./formulaire-lot";
import { BoutonsEtatLot } from "./boutons-etat-lot";
import {
  FormulaireDetention,
  BoutonCloreDetention,
} from "./formulaire-detention";
import { FormulaireEquipementsLot } from "./formulaire-equipements-lot";

export const metadata = { title: "Fiche lot — Gerimmo" };

export default async function PageLot(
  props: PageProps<"/agence/[orgId]/parc/[bienId]/lots/[lotId]">
) {
  const { orgId, bienId, lotId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const [
    { data: lot },
    { data: bien },
    { data: detentions },
    { data: diagnostics },
    { data: catalogue },
    { data: equipesLot },
    { data: personnes },
    { data: blocages },
  ] = await Promise.all([
    supabase
      .from("lots")
      .select("*")
      .eq("id", lotId)
      .eq("bien_id", bienId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("biens")
      .select("id, nom, type, annee_construction")
      .eq("id", bienId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("detentions")
      .select("id, quote_part, date_debut, date_fin, person:persons(nom, prenom)")
      .eq("lot_id", lotId)
      .order("date_debut", { ascending: false }),
    supabase
      .from("diagnostics")
      .select("id, type, date_realisation, date_expiration, diagnostiqueur")
      .eq("lot_id", lotId)
      .is("archived_at", null)
      .order("type"),
    supabase
      .from("equipements_catalogue")
      .select("id, nom")
      .eq("organization_id", orgId)
      .eq("actif", true)
      .order("nom"),
    supabase.from("lot_equipements").select("equipement_id").eq("lot_id", lotId),
    supabase
      .from("persons")
      .select("id, nom, prenom")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("nom"),
    supabase.rpc("lot_blocages_location", { p_lot: lotId }),
  ]);
  if (!lot || !bien) notFound();

  const detentionsActives = (detentions ?? []).filter((d) => !d.date_fin);
  const totalQuoteParts = detentionsActives.reduce(
    (s, d) => s + Number(d.quote_part),
    0
  );
  const attendusLot = diagnosticsAttendus(bien).filter(
    (t) => TYPES_DIAGNOSTIC[t].niveau === "lot"
  );
  const deposes = new Set((diagnostics ?? []).map((d) => d.type));
  const manquants = attendusLot.filter((t) => !deposes.has(t));
  const decence = alertesDecence(lot);
  const verrouille = ["loue", "preavis"].includes(lot.etat);

  const nomPersonne = (p: { nom: string; prenom: string | null } | null) =>
    p ? `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}` : "—";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href={`/agence/${orgId}/parc/${bienId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {bien.nom}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{lot.nom}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-sm ${COULEURS_ETAT_LOT[lot.etat] ?? ""}`}
          >
            {ETATS_LOT[lot.etat] ?? lot.etat}
          </span>
        </div>
      </div>

      {decence.length > 0 && (
        <div className="rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          {decence.map((a) => (
            <p key={a}>⚠ {a}</p>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">État du lot</CardTitle>
          <CardDescription>
            brouillon → disponible → loué ⇄ préavis → archivé ; la réactivation
            est réservée à l&apos;admin de l&apos;agence (RM-0.9.4).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(blocages ?? []).length > 0 && lot.etat === "brouillon" && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="mb-1 font-medium">
                Ce qui empêche la mise en location :
              </p>
              <ul className="list-inside list-disc text-muted-foreground">
                {(blocages as string[]).map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          <BoutonsEtatLot
            orgId={orgId}
            bienId={bienId}
            lotId={lotId}
            etat={lot.etat}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Détention</CardTitle>
            <CardDescription>
              Quote-parts datées, jamais supprimées : les rapports passés
              restent justes (RM-0.2.3). Location possible à 100 % exactement.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p
              className={`text-sm ${totalQuoteParts === 100 ? "text-success-soft-foreground" : "text-warning-soft-foreground"}`}
            >
              Détention active : {totalQuoteParts} %
            </p>
            {(detentions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun propriétaire enregistré.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {(detentions ?? []).map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
                    <span
                      className={`min-w-0 flex-1 truncate ${d.date_fin ? "text-muted-foreground line-through" : ""}`}
                    >
                      {nomPersonne(d.person as unknown as { nom: string; prenom: string | null })}
                    </span>
                    <span className="shrink-0">{Number(d.quote_part)} %</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formaterDate(d.date_debut)}
                      {d.date_fin ? ` → ${formaterDate(d.date_fin)}` : ""}
                    </span>
                    {!d.date_fin && (
                      <BoutonCloreDetention
                        orgId={orgId}
                        bienId={bienId}
                        lotId={lotId}
                        detentionId={d.id}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <FormulaireDetention
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              personnes={personnes ?? []}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnostics du lot</CardTitle>
            <CardDescription>
              DPE, électricité, gaz, plomb, amiante privatif (RM-0.6.2). Un
              obligatoire expiré bloque la mise en location (RM-0.7.3).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(diagnostics ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun diagnostic déposé.</p>
            ) : (
              <ul className="divide-y divide-border">
                {(diagnostics ?? []).map((d) => {
                  const statut = statutDiagnostic(d.date_expiration);
                  return (
                    <li key={d.id} className="flex items-center gap-2 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {TYPES_DIAGNOSTIC[d.type]?.libelle ?? d.type}
                        {d.diagnostiqueur && (
                          <span className="text-muted-foreground"> — {d.diagnostiqueur}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {d.date_expiration
                          ? `expire le ${formaterDate(d.date_expiration)}`
                          : "illimité"}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${COULEURS_STATUT_DIAGNOSTIC[statut]}`}
                      >
                        {LIBELLES_STATUT_DIAGNOSTIC[statut]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {manquants.length > 0 && (
              <p className="text-sm text-warning-soft-foreground">
                Attendu{manquants.length > 1 ? "s" : ""} :{" "}
                {manquants.map((t) => TYPES_DIAGNOSTIC[t].libelle).join(", ")}
              </p>
            )}
            <FormulaireDiagnostic
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              niveau="lot"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Équipements</CardTitle>
          <CardDescription>
            Cochés depuis la liste fermée de l&apos;agence (RM-0.5.5) — ils
            deviendront les lignes de la grille d&apos;état des lieux.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireEquipementsLot
            orgId={orgId}
            bienId={bienId}
            lotId={lotId}
            catalogue={catalogue ?? []}
            selection={(equipesLot ?? []).map((e) => e.equipement_id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modifier le lot</CardTitle>
          <CardDescription>
            {verrouille
              ? "Lot loué : surface et pièces sont verrouillées, modification par avenant au bail (RM-0.5.1)."
              : "Surface, pièces, meublé, étage, tantième de copropriété."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireLot orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} />
        </CardContent>
      </Card>
    </main>
  );
}

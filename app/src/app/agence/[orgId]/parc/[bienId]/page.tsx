import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_BIEN,
  TYPES_DIAGNOSTIC,
  TYPES_NON_DECOUPABLES,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  COULEURS_STATUT_DIAGNOSTIC,
  LIBELLES_STATUT_DIAGNOSTIC,
  MODES_CLE,
  statutDiagnostic,
  diagnosticsAttendus,
  formaterSurface,
} from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FormulaireBien, type BienFormulaire } from "../formulaire-bien";
import { BoutonsEtatLot } from "./lots/[lotId]/boutons-etat-lot";
import { FormulaireDiagnostic } from "./formulaire-diagnostic";
import { FormulaireDecoupage } from "./formulaire-decoupage";
import { FormulaireCle } from "./formulaire-cle";

export const metadata = { title: "Fiche bien — Gerimmo" };

export default async function PageBien(
  props: PageProps<"/agence/[orgId]/parc/[bienId]">
) {
  const { orgId, bienId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const [{ data: bien }, { data: lots }, { data: diagnostics }, { data: cle }] =
    await Promise.all([
      supabase
        .from("biens")
        .select("*")
        .eq("id", bienId)
        .eq("organization_id", orgId)
        .maybeSingle(),
      supabase
        .from("lots")
        .select("id, nom, etat, surface_m2, tantieme, pieces")
        .eq("bien_id", bienId)
        .order("created_at"),
      supabase
        .from("diagnostics")
        .select("id, type, date_realisation, date_expiration, diagnostiqueur, document_id")
        .eq("bien_id", bienId)
        .is("archived_at", null)
        .order("type"),
      supabase
        .from("cles_repartition")
        .select("id, mode, date_effet, cle_repartition_lignes(lot_id, pourcentage)")
        .eq("bien_id", bienId)
        .is("invalidated_at", null)
        .maybeSingle(),
    ]);
  if (!bien) notFound();

  // Blocages de mise en location, affichés directement sur la fiche bien :
  // en mono-lot personne n'ouvre la fiche lot pour y trouver le bouton
  const blocagesParLot = new Map(
    await Promise.all(
      (lots ?? [])
        .filter((l) => l.etat === "brouillon")
        .map(async (l) => {
          const { data } = await supabase.rpc("lot_blocages_location", {
            p_lot: l.id,
          });
          return [l.id, (data ?? []) as string[]] as const;
        })
    )
  );

  const lotsActifs = (lots ?? []).filter((l) => l.etat !== "archive");
  const multiLots = lotsActifs.length > 1;
  // Diagnostics attendus au niveau bien uniquement — ceux du lot sont sur sa fiche
  const attendusBien = diagnosticsAttendus(bien).filter(
    (t) => TYPES_DIAGNOSTIC[t].niveau === "bien"
  );
  const deposes = new Set((diagnostics ?? []).map((d) => d.type));
  const manquants = attendusBien.filter((t) => !deposes.has(t));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href={`/agence/${orgId}/parc`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Parc
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{bien.nom}</h1>
        <p className="text-sm text-muted-foreground">
          {TYPES_BIEN[bien.type] ?? bien.type} · {bien.address_line1}
          {bien.address_line2 ? `, ${bien.address_line2}` : ""}, {bien.postal_code}{" "}
          {bien.city}
          {bien.copropriete ? " · copropriété" : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {multiLots ? `${lotsActifs.length} lots` : "Lot unique"}
          </CardTitle>
          <CardDescription>
            Le bail porte toujours sur un lot, jamais sur le bien (RM-0.2.5).
            La mise en location se fait ici, lot par lot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {(lots ?? []).map((lot) => {
              const blocages = blocagesParLot.get(lot.id) ?? [];
              return (
                <li key={lot.id} className="space-y-2 py-2.5">
                  <Link
                    href={`/agence/${orgId}/parc/${bienId}/lots/${lot.id}`}
                    className="flex items-center gap-3 text-sm hover:bg-accent"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${COULEURS_ETAT_LOT[lot.etat] ?? ""}`}
                    >
                      {ETATS_LOT[lot.etat] ?? lot.etat}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{lot.nom}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formaterSurface(lot.surface_m2)}
                      {lot.pieces ? ` · ${lot.pieces} p.` : ""}
                    </span>
                  </Link>
                  {lot.etat === "brouillon" && blocages.length > 0 && (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <p className="mb-1 font-medium">
                        Ce qui empêche la mise en location :
                      </p>
                      <ul className="list-inside list-disc text-muted-foreground">
                        {blocages.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <BoutonsEtatLot
                    orgId={orgId}
                    bienId={bienId}
                    lotId={lot.id}
                    etat={lot.etat}
                  />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="diagnostics" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-base">Diagnostics du bien</CardTitle>
            <CardDescription>
              ERP, amiante des parties communes, termites… Les diagnostics du
              logement (DPE…) se déposent sur la fiche du lot (RM-0.6.2).
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
                      {d.document_id && (
                        <a
                          href={`/agence/${orgId}/documents/${d.document_id}/fichier`}
                          target="_blank"
                          className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                        >
                          Rapport
                        </a>
                      )}
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
              lotId={null}
              niveau="bien"
            />
          </CardContent>
        </Card>

        {!(TYPES_NON_DECOUPABLES as readonly string[]).includes(bien.type) ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Découper en lots</CardTitle>
              <CardDescription>
                Les nouveaux lots héritent des propriétaires du lot d&apos;origine
                (RM-0.3.6) ; un lot loué ne se redécoupe pas (RM-0.3.8).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FormulaireDecoupage orgId={orgId} bienId={bienId} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Découpage</CardTitle>
              <CardDescription>
                Un bien de type « {TYPES_BIEN[bien.type]} » est déjà l&apos;unité
                locative : il ne se découpe pas en lots. Pour un immeuble entier,
                créer un bien de type maison, local ou autre.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {multiLots && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clé de répartition</CardTitle>
            <CardDescription>
              100 % exactement, datée, jamais recalculée rétroactivement — une
              clé fausse fausse toutes les régularisations du bien (RM-0.4.1/2).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {cle ? (
              <div className="text-sm">
                <p className="mb-2">
                  Clé en vigueur ({MODES_CLE[cle.mode] ?? cle.mode}, effet au{" "}
                  {formaterDate(cle.date_effet)}) :
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {(cle.cle_repartition_lignes as { lot_id: string; pourcentage: number }[]).map(
                    (ligne) => {
                      const lot = (lots ?? []).find((l) => l.id === ligne.lot_id);
                      return (
                        <li
                          key={ligne.lot_id}
                          className="rounded-full border border-border px-2 py-0.5 text-xs"
                        >
                          {lot?.nom ?? "Lot"} : {ligne.pourcentage} %
                        </li>
                      );
                    }
                  )}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-warning-soft-foreground">
                Aucune clé valide : les lots ne peuvent pas passer en disponible
                tant qu&apos;elle n&apos;est pas validée (RM-0.3.3).
              </p>
            )}
            <FormulaireCle
              // Remonté à neuf quand la structure des lots change (découpage)
              key={lotsActifs.map((l) => l.id).join("-")}
              orgId={orgId}
              bienId={bienId}
              lots={lotsActifs.map((l) => ({
                id: l.id,
                nom: l.nom,
                surface_m2: l.surface_m2,
                tantieme: l.tantieme,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modifier le bien</CardTitle>
          <CardDescription>
            L&apos;adresse se verrouille dès qu&apos;un lot est loué (RM-0.5.1).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireBien orgId={orgId} bien={bien as BienFormulaire} />
        </CardContent>
      </Card>
    </main>
  );
}

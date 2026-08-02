import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_BIEN,
  TYPES_DIAGNOSTIC,
  TYPES_NON_DECOUPABLES,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  MODES_CLE,
  diagnosticsAttendus,
  formaterSurface,
  cibleBlocage,
  alerteDiagnostics,
} from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { BienFormulaire } from "../formulaire-bien";
import { BoutonsEtatLot } from "./lots/[lotId]/boutons-etat-lot";
import { SectionLot } from "./lots/[lotId]/section-lot";
import { RecapBien } from "./recap-bien";
import { LignesDiagnostics, type DiagnosticDepose } from "./lignes-diagnostics";
import { FormulaireDecoupage } from "./formulaire-decoupage";
import { FormulaireCle } from "./formulaire-cle";
import {
  FormulaireInfosPratiques,
  type InfosPratiques,
} from "./formulaire-infos-pratiques";

export const metadata = { title: "Fiche bien — Gerimmo" };

export default async function PageBien(
  props: PageProps<"/agence/[orgId]/parc/[bienId]">
) {
  const { orgId, bienId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const [
    { data: bien },
    { data: lots },
    { data: diagnostics },
    { data: cle },
    { data: infos },
  ] = await Promise.all([
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
    supabase
      .from("bien_infos_pratiques")
      .select("sortie_poubelles, local_poubelles, gardien, travaux, stationnement, autres")
      .eq("bien_id", bienId)
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

  // Sur un bien multi-lots, l'ERP et la clé de répartition se règlent au niveau
  // du bien : les répéter sous chaque lot noie les points réellement propres au
  // lot. On isole donc ce qui est commun à TOUS les lots bloqués.
  const listesBlocages = [...blocagesParLot.values()];
  const blocagesCommuns =
    listesBlocages.length > 1
      ? listesBlocages[0].filter((b) => listesBlocages.every((l) => l.includes(b)))
      : [];
  // Diagnostics attendus au niveau bien uniquement — ceux du lot sont sur sa fiche
  const attendusBien = diagnosticsAttendus(bien).filter(
    (t) => TYPES_DIAGNOSTIC[t].niveau === "bien"
  );
  const deposes = new Set((diagnostics ?? []).map((d) => d.type));
  const manquants = attendusBien.filter((t) => !deposes.has(t));
  const infosRenseignees = !!infos && Object.values(infos).some((v) => v);

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

      {/* Le bien : condensé + sections repliables (consulter d'abord, éditer sur clic) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Le bien</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <RecapBien
            orgId={orgId}
            bien={bien as BienFormulaire}
            nbLots={lotsActifs.length}
          />

          {/* Diagnostics du bien */}
          <SectionLot
            id="diagnostics"
            titre="Diagnostics du bien"
            alerte={alerteDiagnostics(manquants, diagnostics ?? [])}
            resume={
              `${(diagnostics ?? []).length} déposé${(diagnostics ?? []).length > 1 ? "s" : ""}` +
              (manquants.length > 0
                ? ` · manque ${manquants.map((t) => TYPES_DIAGNOSTIC[t].libelle).join(", ")}`
                : "")
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                ERP, amiante des parties communes, termites… Les diagnostics du
                logement (DPE…) se déposent sur la fiche du lot (RM-0.6.2).
              </p>
              <LignesDiagnostics
                orgId={orgId}
                bienId={bienId}
                lotId={null}
                niveau="bien"
                attendus={attendusBien}
                diagnostics={(diagnostics ?? []) as DiagnosticDepose[]}
              />
            </div>
          </SectionLot>

          {/* Découpage en lots */}
          {!(TYPES_NON_DECOUPABLES as readonly string[]).includes(bien.type) ? (
            <SectionLot
              titre="Découpage en lots"
              resume={`${lotsActifs.length} lot${lotsActifs.length > 1 ? "s" : ""}`}
            >
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Les nouveaux lots héritent des propriétaires du lot d&apos;origine
                  (RM-0.3.6) ; un lot loué ne se redécoupe pas (RM-0.3.8).
                </p>
                <FormulaireDecoupage orgId={orgId} bienId={bienId} />
              </div>
            </SectionLot>
          ) : (
            <SectionLot titre="Découpage en lots" resume="Non découpable">
              <p className="text-sm text-muted-foreground">
                Un bien de type « {TYPES_BIEN[bien.type]} » est déjà l&apos;unité
                locative : il ne se découpe pas en lots. Pour un bâtiment entier,
                créer un bien de type <strong>Immeuble</strong>.
              </p>
            </SectionLot>
          )}

          {/* Clé de répartition (multi-lots) */}
          {multiLots && (
            <SectionLot
              id="cle"
              titre="Clé de répartition"
              alerte={cle ? undefined : "À valider"}
              resume={
                cle
                  ? `En vigueur (${MODES_CLE[cle.mode] ?? cle.mode}, effet au ${formaterDate(cle.date_effet)})`
                  : "À valider"
              }
            >
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  100 % exactement, datée, jamais recalculée rétroactivement — une
                  clé fausse fausse toutes les régularisations du bien (RM-0.4.1/2).
                </p>
                {cle ? (
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
              </div>
            </SectionLot>
          )}

          {/* Informations pratiques destinées au locataire */}
          <SectionLot
            titre="Informations pratiques (locataire)"
            resume={infosRenseignees ? "Renseignées" : "À compléter"}
          >
            <FormulaireInfosPratiques
              orgId={orgId}
              bienId={bienId}
              infos={(infos ?? null) as InfosPratiques | null}
            />
          </SectionLot>
        </CardContent>
      </Card>

      {/* Lots — la navigation vers chaque lot */}
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
        <CardContent className="space-y-3">
          {/* Ce qui bloque TOUS les lots : affiché une fois, pas sous chacun */}
          {blocagesCommuns.length > 0 && (
            <div className="rounded-lg border border-warning-soft bg-warning-soft/40 p-3">
              <p className="text-sm font-medium text-warning-soft-foreground">
                À régler pour l&apos;ensemble des lots
              </p>
              <ul className="mt-1.5 space-y-1">
                {blocagesCommuns.map((b) => {
                  const cible = cibleBlocage(b, {
                    orgId,
                    bienId,
                    lotId: lotsActifs[0]?.id ?? "",
                  });
                  return (
                    <li key={b} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1">{b}</span>
                      <Link
                        href={cible.href}
                        className="shrink-0 rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium hover:bg-muted"
                      >
                        {cible.libelle}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <ul className="divide-y divide-border">
            {(lots ?? []).map((lot) => {
              const blocages = blocagesParLot.get(lot.id) ?? [];
              const propres = blocages.filter((b) => !blocagesCommuns.includes(b));
              return (
                <li key={lot.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${COULEURS_ETAT_LOT[lot.etat] ?? ""}`}
                    >
                      {ETATS_LOT[lot.etat] ?? lot.etat}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{lot.nom}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formaterSurface(lot.surface_m2)}
                      {lot.pieces ? ` · ${lot.pieces} p.` : ""}
                    </span>
                    {blocages.length > 0 && (
                      <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning-soft-foreground">
                        {blocages.length} à régler
                      </span>
                    )}
                    <Link
                      href={`/agence/${orgId}/parc/${bienId}/lots/${lot.id}`}
                      className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                    >
                      Voir le lot →
                    </Link>
                  </div>

                  {/* Points propres à ce lot — repliés, la ligne reste lisible */}
                  {propres.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                        <span className="group-open:hidden">
                          ▸ Voir ce qui bloque ce lot ({propres.length})
                        </span>
                        <span className="hidden group-open:inline">▾ Masquer le détail</span>
                      </summary>
                      <ul className="mt-1.5 space-y-1 pl-3">
                        {propres.map((b) => {
                          const cible = cibleBlocage(b, { orgId, bienId, lotId: lot.id });
                          return (
                            <li
                              key={b}
                              className="flex flex-wrap items-center gap-2 text-sm"
                            >
                              <span className="min-w-0 flex-1 text-muted-foreground">{b}</span>
                              <Link
                                href={cible.href}
                                className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted"
                              >
                                {cible.libelle}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}

                  <BoutonsEtatLot
                    orgId={orgId}
                    bienId={bienId}
                    lotId={lot.id}
                    etat={lot.etat}
                    bloque={blocages.length > 0}
                    compact
                  />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Le passage en « Disponible » revérifie tous les blocages en base.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

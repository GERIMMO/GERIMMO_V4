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
import { FormulaireDiagnostic } from "../../formulaire-diagnostic";
import { RecapLot } from "./recap-lot";
import { SectionLot } from "./section-lot";
import { BoutonsEtatLot } from "./boutons-etat-lot";
import {
  FormulaireDetention,
  BoutonCloreDetention,
  BoutonSupprimerDetention,
  BoutonRouvrirDetention,
} from "./formulaire-detention";
import { FormulaireEquipementsLot } from "./formulaire-equipements-lot";
import { FormulairePiecesLot, type PieceLot } from "./formulaire-pieces-lot";
import { FormulaireBailLot } from "./formulaire-bail-lot";
import { AppelsCharges, type AppelCharge } from "./formulaire-appels-charges";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Fiche lot — Gerimmo" };

const ETATS_BAIL: Record<string, string> = {
  brouillon: "Brouillon",
  actif: "Actif",
  preavis: "Préavis",
  termine: "Terminé",
};

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
    { data: baux },
    { data: proprietaires },
    { data: piecesLot },
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
      .select("id, nom, type, annee_construction, copropriete")
      .eq("id", bienId)
      .eq("organization_id", orgId)
      .maybeSingle(),
    supabase
      .from("detentions")
      // !detentions_person_id_fkey : deux relations lient detentions à persons
      // depuis les FK composites (revue 2) — jointure explicite obligatoire
      .select(
        "id, quote_part, date_debut, date_fin, person:persons!detentions_person_id_fkey(nom, prenom)"
      )
      .eq("lot_id", lotId)
      .order("date_debut", { ascending: false }),
    supabase
      .from("diagnostics")
      .select("id, type, date_realisation, date_expiration, diagnostiqueur, document_id")
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
    supabase
      .from("baux")
      .select("id, type, etat")
      .eq("lot_id", lotId)
      .order("created_at", { ascending: false }),
    supabase
      .from("detentions")
      .select("person_id")
      .eq("organization_id", orgId)
      .is("date_fin", null),
    supabase
      .from("lot_pieces")
      .select("id, nom")
      .eq("lot_id", lotId)
      .order("ordre")
      .order("created_at"),
  ]);
  if (!lot || !bien) notFound();

  // Appels de charges de copropriété (module 0c) — uniquement si le bien est en copropriété
  const { data: appelsRaw } = bien.copropriete
    ? await supabase
        .from("appels_charges")
        .select(
          "id, exercice, date_reception, total, statut, document_id, postes:appel_charges_postes(id, libelle, montant, nature, fonds_alur, propose)"
        )
        .eq("lot_id", lotId)
        .order("exercice", { ascending: false })
    : { data: [] };
  const appelsCharges = ((appelsRaw ?? []) as AppelCharge[]).map((a) => ({
    ...a,
    postes: [...(a.postes ?? [])].sort((x, y) => x.libelle.localeCompare(y.libelle)),
  }));

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

  const nbEquip = (equipesLot ?? []).length;
  const nbDiag = (diagnostics ?? []).length;
  const nbBaux = (baux ?? []).length;

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
        <CardContent className="space-y-2">
          {(blocages ?? []).length > 0 && lot.etat === "brouillon" && (
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="mb-1 font-medium">
                Ce qui empêche la mise en location :
              </p>
              <ul className="space-y-1.5">
                {(blocages as string[]).map((b) => {
                  const cible = cibleBlocage(b, { orgId, bienId, lotId });
                  return (
                    <li key={b} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 text-muted-foreground">{b}</span>
                      <Link
                        href={cible.href}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        {cible.libelle} →
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <BoutonsEtatLot orgId={orgId} bienId={bienId} lotId={lotId} etat={lot.etat} />

          {/* Caractéristiques (récap + Modifier) */}
          <div id="caracteristiques" className="scroll-mt-20 border-t border-border pt-4">
            <p className="mb-3 text-sm font-medium">Caractéristiques du lot</p>
            <RecapLot orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} />
          </div>

          {/* Détention */}
          <SectionLot
            id="detention"
            titre="Détention"
            alerte={totalQuoteParts !== 100 ? `${totalQuoteParts} % sur 100 %` : undefined}
            resume={
              detentionsActives.length === 0
                ? "Aucun propriétaire"
                : `${totalQuoteParts} % — ${detentionsActives
                    .map((d) =>
                      nomPersonne(d.person as unknown as { nom: string; prenom: string | null })
                    )
                    .join(", ")}`
            }
          >
            <div className="space-y-4">
              <p
                className={`text-sm ${totalQuoteParts === 100 ? "text-success-soft-foreground" : "text-warning-soft-foreground"}`}
              >
                Détention active : {totalQuoteParts} %
              </p>
              {(detentions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun propriétaire enregistré.</p>
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
                      {!d.date_fin && (baux ?? []).length === 0 && (
                        <BoutonSupprimerDetention
                          orgId={orgId}
                          bienId={bienId}
                          lotId={lotId}
                          detentionId={d.id}
                        />
                      )}
                      {d.date_fin && (
                        <BoutonRouvrirDetention
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
                proprietairesIds={[...new Set((proprietaires ?? []).map((d) => d.person_id))]}
                premierProprietaire={detentionsActives.length === 0}
              />
            </div>
          </SectionLot>

          {/* Diagnostics */}
          <SectionLot
            id="diagnostics"
            titre="Diagnostics du lot"
            alerte={alerteDiagnostics(manquants, diagnostics ?? [])}
            resume={
              nbDiag === 0
                ? "Aucun diagnostic"
                : `${nbDiag} déposé${nbDiag > 1 ? "s" : ""}${manquants.length ? ` · manque : ${manquants.map((t) => TYPES_DIAGNOSTIC[t].libelle).join(", ")}` : ""}`
            }
          >
            <div className="space-y-4">
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
              <FormulaireDiagnostic orgId={orgId} bienId={bienId} lotId={lotId} niveau="lot" />
            </div>
          </SectionLot>

          {/* Équipements */}
          <SectionLot
            id="equipements"
            titre="Équipements"
            resume={
              nbEquip === 0
                ? "Aucun équipement coché"
                : `${nbEquip} équipement${nbEquip > 1 ? "s" : ""} coché${nbEquip > 1 ? "s" : ""}`
            }
          >
            <FormulaireEquipementsLot
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              catalogue={catalogue ?? []}
              selection={(equipesLot ?? []).map((e) => e.equipement_id)}
            />
          </SectionLot>

          {/* Pièces (pour la grille d'état des lieux) */}
          <SectionLot
            id="pieces"
            titre="Pièces (état des lieux)"
            resume={
              (piecesLot ?? []).length === 0
                ? "Aucune pièce définie"
                : (piecesLot as PieceLot[]).map((p) => p.nom).join(", ")
            }
          >
            <FormulairePiecesLot
              orgId={orgId}
              bienId={bienId}
              lotId={lotId}
              pieces={(piecesLot ?? []) as PieceLot[]}
            />
          </SectionLot>

          {/* Baux & état des lieux */}
          <SectionLot
            id="baux"
            titre="Baux & état des lieux"
            resume={
              nbBaux === 0
                ? "Aucun bail"
                : `${nbBaux} bail${nbBaux > 1 ? "s" : ""} · ${(baux ?? [])
                    .map((b) => ETATS_BAIL[b.etat] ?? b.etat)
                    .join(", ")}`
            }
          >
            <div className="space-y-4">
              {(baux ?? []).length > 0 && (
                <ul className="space-y-2">
                  {(baux ?? []).map((b) => (
                    <li key={b.id} className="flex items-center gap-3">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                        {ETATS_BAIL[b.etat] ?? b.etat}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">Bail {b.type}</span>
                      <Link
                        href={`/agence/${orgId}/baux/${b.id}`}
                        className={buttonVariants({ variant: "ghost", size: "sm" })}
                      >
                        Ouvrir
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {detentionsActives.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Ajoutez un propriétaire (détention à 100 %) et une personne locataire avant
                  de créer un bail.
                </p>
              ) : (
                <FormulaireBailLot
                  orgId={orgId}
                  bienId={bienId}
                  lotId={lotId}
                  personnes={personnes ?? []}
                />
              )}
            </div>
          </SectionLot>

          {/* Charges de copropriété (module 0c) — appels du syndic, ventilés */}
          {bien.copropriete && (
            <SectionLot
              id="charges"
              titre="Charges de copropriété"
              resume={
                appelsCharges.length === 0
                  ? "Aucun appel de charges saisi"
                  : `${appelsCharges.length} appel(s) · ${
                      appelsCharges.filter((a) => a.statut === "brouillon").length
                    } en cours`
              }
            >
              <p className="mb-3 text-sm text-muted-foreground">
                Saisie de l&apos;appel du syndic poste par poste, ventilé récupérable
                (locataire) / non récupérable (propriétaire). La part récupérable alimente
                la régularisation, bloquée tant qu&apos;aucun appel n&apos;est ventilé.
              </p>
              <AppelsCharges
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                appels={appelsCharges}
                anneeCourante={new Date().getFullYear()}
              />
            </SectionLot>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

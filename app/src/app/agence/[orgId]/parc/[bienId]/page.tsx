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
import { nomComplet } from "@/lib/roles-personnes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import type { BienFormulaire } from "../formulaire-bien";
import { BoutonsEtatLot } from "./lots/[lotId]/boutons-etat-lot";
import { SectionLot } from "./lots/[lotId]/section-lot";
import { RecapBien } from "./recap-bien";
import { LignesDiagnostics, type DiagnosticDepose } from "./lignes-diagnostics";
import { FormulaireDecoupage } from "./formulaire-decoupage";
import { FormulaireCle } from "./formulaire-cle";
import { CarteAnnonces, type Annonce as AnnonceBien } from "./carte-annonces";
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
    { data: detentionsBien },
    { data: annonces },
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
    // Recette 21/08 : la fiche bien dit qui possède quoi — détentions en
    // cours de tous les lots du bien (jointure explicite : deux FK vers persons)
    supabase
      .from("detentions")
      .select(
        "lot_id, quote_part, person:persons!detentions_person_id_fkey(id, nom, prenom), lot:lots!inner(bien_id)"
      )
      .eq("organization_id", orgId)
      .eq("lot.bien_id", bienId)
      .is("date_fin", null),
    // Annonces aux locataires du bien (espace locataire v10)
    supabase
      .from("annonces")
      .select("id, texte, visible_jusquau")
      .eq("organization_id", orgId)
      .eq("bien_id", bienId)
      .gte("visible_jusquau", new Date().toISOString().slice(0, 10))
      .order("visible_jusquau"),
  ]);
  if (!bien) notFound();

  // Blocages de mise en location, affichés directement sur la fiche bien :
  // en mono-lot personne n'ouvre la fiche lot pour y trouver le bouton
  const { data: blocagesBien } = await supabase.rpc("lots_blocages_location", {
    p_org: orgId,
    p_bien: bienId,
  });
  const blocagesParLot = new Map(
    ((blocagesBien ?? []) as { lot_id: string; blocages: string[] | null }[]).map((b) => [
      b.lot_id,
      b.blocages ?? [],
    ])
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

  // Une ligne par propriétaire mandant : ses lots et quote-parts agrégés
  const nomsLots = new Map((lots ?? []).map((l) => [l.id, l.nom]));
  const parProprietaire = new Map<
    string,
    { id: string; nom: string; parts: string[] }
  >();
  for (const d of (detentionsBien ?? []) as unknown as {
    lot_id: string;
    quote_part: number;
    person: { id: string; nom: string; prenom: string | null } | null;
  }[]) {
    if (!d.person) continue;
    const entree = parProprietaire.get(d.person.id) ?? {
      id: d.person.id,
      nom: nomComplet(d.person),
      parts: [],
    };
    entree.parts.push(
      `${nomsLots.get(d.lot_id) ?? "Lot"} (${Number(d.quote_part)} %)`
    );
    parProprietaire.set(d.person.id, entree);
  }
  const proprietairesBien = [...parProprietaire.values()]
    .map((p) => ({ id: p.id, nom: p.nom, detail: p.parts.join(" · ") }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <Link
          href={`/agence/${orgId}/parc`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Parc
        </Link>
        <p className="eyebrow mt-1">
          {TYPES_BIEN[bien.type] ?? bien.type} · {bien.city}
        </p>
        <div className="entete-page">
          <h1>{bien.nom}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {bien.address_line1}
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
                logement (DPE…) se déposent sur la fiche du lot.
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

          {/* Propriétaires mandants du bien (recette 21/08) : qui possède
              quoi, sans ouvrir chaque fiche lot */}
          <SectionLot
            titre="Propriétaires mandants"
            resume={
              proprietairesBien.length === 0
                ? "Aucun"
                : proprietairesBien.map((p) => p.nom).join(", ")
            }
          >
            {proprietairesBien.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune détention en cours — elles se règlent sur la fiche de
                chaque lot.
              </p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {proprietairesBien.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                  >
                    <Link
                      href={`/agence/${orgId}/personnes/${p.id}`}
                      className="font-medium hover:underline"
                    >
                      {p.nom}
                    </Link>
                    <span className="text-muted-foreground">{p.detail}</span>
                  </li>
                ))}
              </ul>
            )}
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
                  ; un lot loué ne se redécoupe pas.
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
                  clé fausse fausse toutes les régularisations du bien.
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
                    tant qu&apos;elle n&apos;est pas validée.
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
            Le bail porte toujours sur un lot, jamais sur le bien.
            La mise en location se fait ici, lot par lot.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Ce qui bloque TOUS les lots : affiché une fois, pas sous chacun */}
          {blocagesCommuns.length > 0 && (
            <div className="border-l-[3px] border-l-warning bg-warning-soft p-3">
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
                  // Cible sur cette page même : ancre native — un <Link> passe par
                  // pushState, qui ne déclenche pas le hashchange qu'écoute SectionLot,
                  // et la section ne s'ouvrait pas.
                  const memePage = !cible.href.includes("/lots/");
                  const classe = `shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`;
                  return (
                    <li key={b} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1">{b}</span>
                      {memePage ? (
                        <a href={cible.href} className={classe}>{cible.libelle}</a>
                      ) : (
                        <Link href={cible.href} className={classe}>{cible.libelle}</Link>
                      )}
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
                      className={`shrink-0 ${COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"}`}
                    >
                      {ETATS_LOT[lot.etat] ?? lot.etat}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{lot.nom}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formaterSurface(lot.surface_m2)}
                      {lot.pieces ? ` · ${lot.pieces} pièce${lot.pieces > 1 ? "s" : ""}` : ""}
                    </span>
                    {blocages.length > 0 && (
                      <span className="badge-statut shrink-0 text-warning-soft-foreground">
                        {blocages.length} à régler
                      </span>
                    )}
                    <Link
                      href={`/agence/${orgId}/parc/${bienId}/lots/${lot.id}`}
                      className={`shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`}
                    >
                      Voir le lot →
                    </Link>
                  </div>

                  {/* Points propres à ce lot — repliés, la ligne reste lisible */}
                  {propres.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                        <span className="group-open:hidden">
                          Voir ce qui bloque ce lot ({propres.length})
                        </span>
                        <span className="hidden group-open:inline">Masquer le détail</span>
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
                                className={`shrink-0 ${buttonVariants({ variant: "outline", size: "sm" })}`}
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
            La mise en location vérifie une dernière fois qu’il ne manque rien au lot.
          </p>
        </CardContent>
      </Card>

      {/* Annonce aux locataires (espace locataire v10) : un mot sur leur accueil */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Annonce aux locataires du bien</CardTitle>
          <CardDescription>
            Coupure d&apos;eau, travaux, passage du syndic… L&apos;annonce s&apos;affiche
            sur l&apos;accueil des locataires du bien jusqu&apos;à la date choisie, puis
            disparaît seule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CarteAnnonces
            orgId={orgId}
            bienId={bienId}
            annonces={(annonces ?? []) as AnnonceBien[]}
          />
        </CardContent>
      </Card>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_BIEN,
  TYPES_NON_DECOUPABLES,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  MODES_CLE,
  formaterSurface,
} from "@/lib/parc";
import {
  diagnosticsExigibles,
  diagnosticsManquants,
  alerteDiagnosticsNiveau,
  LIBELLES_NIVEAU_DIAGNOSTIC,
} from "@/lib/diagnostics";
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
import { BadgeStatut } from "@/components/badge-statut";
import { AttentionFiche, EnteteFiche } from "@/components/fiche-parc";
import { EchecLecture, PageEchecLecture } from "../echec-lecture";
import { BlocagesLocation, ListeBlocages } from "../blocages-location";
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
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);

  const [
    { data: bien, error: erreurBien },
    { data: lots, error: erreurLots },
    { data: diagnostics, error: erreurDiagnostics },
    { data: cle, error: erreurCle },
    { data: infos, error: erreurInfos },
    { data: detentionsBien, error: erreurDetentions },
    { data: annonces, error: erreurAnnonces },
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
    // cours de tous les lots du bien. Jointures explicites : detentions a
    // DEUX clés étrangères vers persons ET deux vers lots (la clé simple et
    // la clé composite qui garde l'agence cohérente). `!inner` ne choisit que
    // le type de jointure, jamais la clé : sans `!fk` des deux côtés,
    // PostgREST refuse la requête (PGRST201) et le bloc reste vide.
    supabase
      .from("detentions")
      .select(
        "lot_id, quote_part, person:persons!detentions_person_id_fkey(id, nom, prenom), lot:lots!detentions_lot_id_fkey!inner(bien_id)"
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
  // Lecture refusée : ce n'est pas un bien supprimé (relevé du 11/09).
  if (erreurBien)
    return (
      <PageEchecLecture
        titre="Fiche bien"
        quoi={["le bien"]}
        retour={{ href: `/agence/${orgId}/parc`, libelle: "Parc" }}
      />
    );
  if (!bien) notFound();

  // Blocages de mise en location, affichés directement sur la fiche bien :
  // en mono-lot personne n'ouvre la fiche lot pour y trouver le bouton
  const { data: blocagesBien, error: erreurBlocages } = await supabase.rpc("lots_blocages_location", {
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
  // Les lots ARCHIVÉS restent listés (la fiche bien est le seul chemin vers le
  // bouton de réactivation), mais ils étaient comptés nulle part : le titre
  // annonçait « 2 lots » au-dessus d'une liste de trois (relevé du 11/09).
  // Ils passent désormais en fin de liste et le titre les nomme.
  const lotsArchives = (lots ?? []).filter((l) => l.etat === "archive");
  const lotsAffiches = [...lotsActifs, ...lotsArchives];
  const multiLots = lotsActifs.length > 1;

  // Sur un bien multi-lots, l'ERP et la clé de répartition se règlent au niveau
  // du bien : les répéter sous chaque lot noie les points réellement propres au
  // lot. On isole donc ce qui est commun à TOUS les lots bloqués.
  const listesBlocages = [...blocagesParLot.values()];
  const blocagesCommuns =
    listesBlocages.length > 1
      ? listesBlocages[0].filter((b) => listesBlocages.every((l) => l.includes(b)))
      : [];
  // Diagnostics exigibles au niveau bien uniquement — calcul centralisé
  // (lib/diagnostics, audit 09/09) ; ceux du lot sont sur sa fiche.
  const exigiblesBien = diagnosticsExigibles(bien, "bien");
  const manquants = diagnosticsManquants(bien, diagnostics ?? [], "bien");
  const infosRenseignees = !!infos && Object.values(infos).some((v) => v);

  // Ce que la base n'a pas rendu — un manque affiché n'est alors pas un manque.
  const echecs: string[] = [];
  const noter = (libelle: string, erreur: unknown) => {
    if (erreur) echecs.push(libelle);
  };
  noter("les lots du bien", erreurLots);
  noter("les diagnostics", erreurDiagnostics);
  noter("la clé de répartition", erreurCle);
  noter("les informations pratiques", erreurInfos);
  noter("les propriétaires", erreurDetentions);
  noter("les annonces aux locataires", erreurAnnonces);
  noter("ce qui bloque la mise en location", erreurBlocages);

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

  // Ce qui attend un geste, réuni EN HAUT et dit une seule fois. Le relevé du
  // 11/09 : un diagnostic manquant se lisait au même poids que « Découpage en
  // lots : non découpable », en quatrième position, sans que rien n'attire
  // l'œil. Chaque point porte l'ancre de la section qui le règle.
  const attention: { cle: string; texte: string; ancre?: string }[] = [];
  if (manquants.length > 0) {
    attention.push({
      cle: "diagnostics",
      texte: `Diagnostic${manquants.length > 1 ? "s" : ""} de l’immeuble à déposer : ${manquants
        .map((m) => m.libelle)
        .join(", ")}.`,
      ancre: "diagnostics",
    });
  }
  if (multiLots && !cle) {
    attention.push({
      cle: "cle",
      texte:
        "La clé de répartition n’est pas validée : aucun lot ne peut passer en disponible.",
      ancre: "cle",
    });
  }
  // Les lots bloqués sont comptés, pas énumérés : le détail vit dans la liste
  // des lots, juste dessous, avec le bouton qui va avec.
  const lotsBloques = lotsActifs.filter((l) => (blocagesParLot.get(l.id) ?? []).length > 0);
  if (lotsBloques.length > 0) {
    attention.push({
      cle: "lots",
      texte:
        lotsBloques.length === 1
          ? `Le lot « ${lotsBloques[0].nom} » ne peut pas être mis en location.`
          : `${lotsBloques.length} lots ne peuvent pas être mis en location.`,
      ancre: "lots",
    });
  }

  const loues = lotsActifs.filter((l) => ["loue", "preavis"].includes(l.etat)).length;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <EnteteFiche
        retour={{
          href: `/agence/${orgId}/parc`,
          libelle: estProprietaire ? "Mes lots" : "Parc",
        }}
        surtitre={TYPES_BIEN[bien.type] ?? bien.type}
        titre={bien.nom}
        sousTitre={
          <>
            {bien.address_line1}
            {bien.address_line2 ? `, ${bien.address_line2}` : ""}, {bien.postal_code}{" "}
            {bien.city}
            {bien.copropriete ? " · copropriété" : ""}
          </>
        }
        // Sur un bien à lot unique, « Lot 1 » et « Loués 1/1 » disent deux fois
        // ce que la carte juste dessous montre en entier (état, nom, surface).
        // Les chiffres ne servent que là où on ne peut plus tout voir d'un coup.
        faits={
          multiLots
            ? [
                { libelle: "Lots", valeur: String(lotsActifs.length) },
                { libelle: "Loués", valeur: `${loues} / ${lotsActifs.length}` },
              ]
            : undefined
        }
      />

      <EchecLecture quoi={echecs} />
      <AttentionFiche points={attention} />

      {/* LES LOTS D'ABORD, et c'est le correctif de fond du 11/09. Le lot est
          l'objet de travail de l'agence : c'est lui qui porte le bail, le
          loyer, le locataire. Il arrivait en DEUXIÈME carte, après le type de
          construction et l'année du bâtiment. On lit désormais le bien dans
          l'ordre où on s'en sert. */}
      <Card id="lots" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">
            {multiLots ? `Les ${lotsActifs.length} lots` : "Le lot"}
            {lotsArchives.length > 0
              ? ` · ${lotsArchives.length} archivé${lotsArchives.length > 1 ? "s" : ""}`
              : ""}
          </CardTitle>
          {/* La phrase n'apprend quelque chose qu'à qui prépare encore ses
              lots. Sur un bien entièrement loué, elle est lue mille fois pour
              ne rien dire — et une phrase qu'on apprend à sauter apprend aussi
              à sauter celles qui comptent. */}
          {loues < lotsActifs.length && (
            <CardDescription>
              Le bail porte toujours sur un lot, jamais sur le bien. La mise en
              location se fait ici, lot par lot.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Ce qui bloque TOUS les lots : affiché une fois, pas sous chacun */}
          <BlocagesLocation
            motifs={blocagesCommuns}
            ctx={{ orgId, bienId, lotId: lotsActifs[0]?.id ?? "" }}
            pageCourante={`/agence/${orgId}/parc/${bienId}`}
            titre="À régler pour l’ensemble des lots"
          />

          <ul className="divide-y divide-border">
            {lotsAffiches.map((lot) => {
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
                      <BadgeStatut ton="attente">{blocages.length} à régler</BadgeStatut>
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
                      <div className="pl-3">
                        <ListeBlocages
                          motifs={propres}
                          ctx={{ orgId, bienId, lotId: lot.id }}
                          pageCourante={`/agence/${orgId}/parc/${bienId}`}
                        />
                      </div>
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
          {lotsActifs.some((l) => l.etat === "brouillon") && (
            <p className="text-xs text-muted-foreground">
              La mise en location vérifie une dernière fois qu’il ne manque rien
              au lot.
            </p>
          )}
        </CardContent>
      </Card>


      {/* Le bien : condensé + sections repliables (consulter d'abord, éditer sur clic) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Le bien</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <RecapBien orgId={orgId} bien={bien as BienFormulaire} />

          {/* Diagnostics du bien */}
          <SectionLot
            id="diagnostics"
            titre="Diagnostics du bien"
            alerte={alerteDiagnosticsNiveau(bien, diagnostics ?? [], "bien")}
            resume={
              `${(diagnostics ?? []).length} déposé${(diagnostics ?? []).length > 1 ? "s" : ""} ${LIBELLES_NIVEAU_DIAGNOSTIC.bien}` +
              (manquants.length > 0
                ? ` · manque ${manquants.map((m) => m.libelle).join(", ")}`
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
                attendus={exigiblesBien.map((e) => e.type)}
                diagnostics={(diagnostics ?? []) as DiagnosticDepose[]}
              />
            </div>
          </SectionLot>

          {/* Propriétaires mandants du bien (recette 21/08) : qui possède
              quoi, sans ouvrir chaque fiche lot */}
          <SectionLot
            titre={estProprietaire ? "Détention du bien" : "Propriétaires mandants"}
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
                          <li key={ligne.lot_id} className="puce puce-grise">
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

          {/* L'ANNONCE SE REPLIE. C'était une carte entière, formulaire ouvert,
              en bas de page — deux cent quatre-vingts pixels au même poids que
              les lots, pour un geste qu'une agence pose deux fois l'an. Elle
              reste à un clic, et son résumé dit s'il y a quelque chose
              d'affiché chez les locataires en ce moment. */}
          <SectionLot
            titre="Annonce aux locataires du bien"
            resume={
              (annonces ?? []).length === 0
                ? "Aucune annonce en cours"
                : `${(annonces ?? []).length} annonce${(annonces ?? []).length > 1 ? "s" : ""} affichée${(annonces ?? []).length > 1 ? "s" : ""} chez les locataires`
            }
          >
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Coupure d&apos;eau, travaux, passage du syndic… L&apos;annonce
                s&apos;affiche sur l&apos;accueil des locataires du bien jusqu&apos;à la
                date choisie, puis disparaît seule.
              </p>
              <CarteAnnonces
                orgId={orgId}
                bienId={bienId}
                annonces={(annonces ?? []) as AnnonceBien[]}
              />
            </div>
          </SectionLot>
        </CardContent>
      </Card>

    </main>
  );
}

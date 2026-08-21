import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  TYPES_DIAGNOSTIC,
  ETATS_LOT,
  COULEURS_ETAT_LOT,
  diagnosticsAttendus,
  alertesDecence,
  cibleBlocage,
  alerteDiagnostics,
} from "@/lib/parc";
import { formaterDate } from "@/lib/ged";
import { ETATS_BAIL, COULEURS_ETAT_BAIL, TYPES_BAIL } from "@/lib/baux";
import { nomComplet } from "@/lib/roles-personnes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LignesDiagnostics, type DiagnosticDepose } from "../../lignes-diagnostics";
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

export default async function PageLot(
  props: PageProps<"/agence/[orgId]/parc/[bienId]/lots/[lotId]">
) {
  const { orgId, bienId, lotId } = await props.params;
  const { supabase, role } = await verifierAccesEspace(orgId);

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
      .select("id, nom, type, city, annee_construction, copropriete")
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
      .select("id, type, etat, locataire_principal")
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
    p ? nomComplet(p) : "—";

  // Recette 21/08 : la fiche lot se lit d'un coup d'œil — propriétaires
  // mandants (détentions en cours) et locataire du bail en cours dans le récap.
  const nomsParId = new Map(
    ((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map((p) => [
      p.id,
      nomComplet(p),
    ])
  );
  const recapProprietaires = detentionsActives
    .map((d) =>
      nomPersonne(d.person as unknown as { nom: string; prenom: string | null } | null)
    )
    .filter((n) => n !== "—")
    .join(", ");
  const bailEnCours = (baux ?? []).find((b) => ["actif", "preavis"].includes(b.etat));
  const recapLocataire = bailEnCours?.locataire_principal
    ? nomsParId.get(bailEnCours.locataire_principal)
    : undefined;

  const nbEquip = (equipesLot ?? []).length;
  const nbDiag = (diagnostics ?? []).length;
  const nbBaux = (baux ?? []).length;

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
      <div>
        <Link
          href={`/agence/${orgId}/parc/${bienId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← {bien.nom}
        </Link>
        <p className="eyebrow mt-1">
          {bien.nom}
          {bien.city ? ` · ${bien.city}` : ""}
        </p>
        <div className="entete-page">
          <div className="flex flex-wrap items-center gap-3">
            <h1>{lot.nom}</h1>
            <span
              className={`shrink-0 ${COULEURS_ETAT_LOT[lot.etat] ?? "puce puce-grise"}`}
            >
              {ETATS_LOT[lot.etat] ?? lot.etat}
            </span>
          </div>
        </div>
      </div>

      {decence.length > 0 && (
        <div className="border-l-[3px] border-l-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          {decence.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">État du lot</CardTitle>
          {/* La suite d'états parlait le langage du code (« brouillon → disponible
              → loué ⇄ préavis »). Dite en français, elle décrit la vie du lot. */}
          <CardDescription>
            Un lot se prépare, puis se met en location. Il devient loué à
            l&apos;activation du bail, passe en préavis au congé du locataire, et
            redevient libre à son départ. Un lot archivé n&apos;est réactivable
            que par l&apos;administrateur de l&apos;agence.
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
                  // Ancre native pour les cibles de cette page (voir fiche bien) :
                  // Link/pushState ne déclenche pas hashchange, la section restait fermée.
                  const memePage = cible.href.includes(`/lots/${lotId}#`);
                  return (
                    <li key={b} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 text-muted-foreground">{b}</span>
                      {memePage ? (
                        <a href={cible.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {cible.libelle} →
                        </a>
                      ) : (
                        <Link href={cible.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {cible.libelle} →
                        </Link>
                      )}
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
            <RecapLot
              orgId={orgId}
              bienId={bienId}
              lot={lot}
              verrouille={verrouille}
              proprietaires={recapProprietaires}
              locataire={recapLocataire}
            />
          </div>

          {/* Détention — masquée pour le propriétaire bailleur (recette
              08/08) : le propriétaire, c'est lui ; la détention existe bien
              en base (posée à la création du bien), inutile de la montrer. */}
          {role !== "proprietaire_direct" && (
          <SectionLot
            id="detention"
            titre="Propriétaires mandants du lot"
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
                <p className="text-sm text-muted-foreground">Aucun propriétaire mandant enregistré. Le lot ne pourra pas être mis en location tant que la propriété n&apos;est pas répartie à 100 %.</p>
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
          )}

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
            <div className="space-y-3">
              <LignesDiagnostics
                orgId={orgId}
                bienId={bienId}
                lotId={lotId}
                niveau="lot"
                attendus={attendusLot}
                diagnostics={(diagnostics ?? []) as DiagnosticDepose[]}
              />
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
            alerte={(piecesLot ?? []).length === 0 ? "À définir" : undefined}
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
                      <span className={COULEURS_ETAT_BAIL[b.etat] ?? "puce puce-grise"}>
                        {ETATS_BAIL[b.etat] ?? b.etat}
                      </span>
                      {/* Recette 21/08 : la vue macro dit qui habite, avant
                          d'ouvrir — type lisible + locataire */}
                      <span className="min-w-0 flex-1 truncate text-sm">
                        Bail {(TYPES_BAIL[b.type] ?? b.type).toLowerCase()}
                        {b.locataire_principal && nomsParId.get(b.locataire_principal)
                          ? ` — ${nomsParId.get(b.locataire_principal)}`
                          : ""}
                      </span>
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
                  Ajoutez un propriétaire mandant (détention à 100 %) et une personne locataire avant
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
              alerte={appelsCharges.length === 0 ? "Aucun appel saisi" : undefined}
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

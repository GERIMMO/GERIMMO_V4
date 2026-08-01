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
import { FormulaireInventaire, type LigneInventaire } from "./formulaire-inventaire";
import { FormulaireColocation, type LigneColoc } from "./formulaire-colocation";
import {
  FormulaireLoyers,
  type LigneEcheance,
  type Encaissement,
  type Quittance,
  type Revision,
  type RelanceLigne,
  type RegulLigne,
} from "./formulaire-loyers";
import {
  FormulaireRestitution,
  type Restitution,
  type Retenue,
} from "./formulaire-restitution";
import { FormulaireDepot, type EncaissementDepot } from "./formulaire-depot";

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
      "id, type, etat, loyer_hc, charges, depot_garantie, jour_echeance, lot_id, locataire_principal, document_signe, date_fin, revision_irl"
    )
    .eq("id", bailId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!bail) notFound();

  const [
    { data: lot },
    { data: locataire },
    { data: edls },
    { data: conges },
    { data: inventaire },
    { data: personnes },
    { data: bailPersonnes },
  ] = await Promise.all([
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
      supabase
        .from("inventaire_lignes")
        .select("id, piece, designation, quantite, etat, observation")
        .eq("bail_id", bailId)
        .order("ordre")
        .order("created_at"),
      supabase
        .from("persons")
        .select("id, nom, prenom")
        .eq("organization_id", orgId)
        .order("nom"),
      supabase
        .from("bail_personnes")
        .select("id, person_id, role, quote_part, surface_privative, garant_de")
        .eq("bail_id", bailId),
    ]);

  // Résolution des noms pour la colocation (colocataires + garants nominatifs)
  const nomsPersonnes = new Map(
    ((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map((p) => [
      p.id,
      `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}`,
    ])
  );
  const lignesColoc: LigneColoc[] = (
    (bailPersonnes ?? []) as {
      id: string;
      person_id: string;
      role: string;
      quote_part: number | null;
      surface_privative: number | null;
      garant_de: string | null;
    }[]
  ).map((l) => ({
    id: l.id,
    person_id: l.person_id,
    person_nom: nomsPersonnes.get(l.person_id) ?? "Personne",
    role: l.role,
    quote_part: l.quote_part,
    surface_privative: l.surface_privative,
    garant_de: l.garant_de,
    garant_de_nom: l.garant_de ? nomsPersonnes.get(l.garant_de) ?? null : null,
  }));

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

  // Loyers (dès que le bail n'est plus en brouillon)
  const loyersActif = bail.etat !== "brouillon";
  const [
    { data: echeancier },
    { data: encaissements },
    { data: quittances },
    { data: revisions },
    { data: relances },
    { data: regularisations },
  ] = loyersActif
    ? await Promise.all([
        supabase.rpc("etat_loyers_bail", { p_bail: bailId }),
        supabase
          .from("encaissements")
          .select("id, montant, date_paiement, mode, note")
          .eq("bail_id", bailId)
          .order("date_paiement", { ascending: false }),
        supabase
          .from("quittances")
          .select("id, appel_id, montant, date_emission, email_envoye_at")
          .eq("bail_id", bailId),
        supabase
          .from("revisions_loyer")
          .select("id, date_effet, ancien_loyer, nouveau_loyer, irl_reference, irl_nouveau")
          .eq("bail_id", bailId)
          .order("date_effet", { ascending: false }),
        supabase
          .from("relances")
          .select("id, niveau, date_envoi, date_premiere_presentation, numero_recommande")
          .eq("bail_id", bailId)
          .order("date_envoi", { ascending: false }),
        supabase
          .from("regularisations_charges")
          .select("id, annee, provisions, charges_reelles, ecart")
          .eq("bail_id", bailId)
          .order("annee", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  // Encaissement du dépôt : dès que le bail n'est plus en brouillon
  const { data: depotEncaissements } = loyersActif
    ? await supabase
        .from("depot_encaissements")
        .select("id, montant, date_encaissement, moyen, versant_libelle, versant_person_id")
        .eq("bail_id", bailId)
        .order("date_encaissement")
    : { data: [] };

  // Restitution du dépôt : dès que le bail est en préavis ou terminé
  const restitutionActif = bail.etat === "preavis" || bail.etat === "termine";
  const { data: restitution } = restitutionActif
    ? await supabase
        .from("restitutions")
        .select(
          "id, date_remise_cles, delai_mois, depot, impayes, sans_edl_entree, statut, solde, date_emission"
        )
        .eq("bail_id", bailId)
        .maybeSingle()
    : { data: null };
  const { data: retenues } = restitution
    ? await supabase
        .from("retenues")
        .select("id, libelle, cout, duree_vie_ans, age_ans, montant_retenu")
        .eq("restitution_id", (restitution as { id: string }).id)
        .order("created_at")
    : { data: [] };

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
            <FormulaireConge orgId={orgId} bailId={bailId} type={bail.type} />
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

      {/* Loyers & quittances */}
      {loyersActif && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loyers & quittances</CardTitle>
            <CardDescription>
              Échéancier, encaissements (imputés du plus ancien au plus récent) et
              quittances (émises après paiement intégral ; un partiel reste un reçu).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireLoyers
              orgId={orgId}
              bailId={bailId}
              echeancier={(echeancier ?? []) as LigneEcheance[]}
              encaissements={(encaissements ?? []) as Encaissement[]}
              quittances={(quittances ?? []) as Quittance[]}
              revisionIrl={Boolean(bail.revision_irl)}
              revisions={(revisions ?? []) as Revision[]}
              relances={(relances ?? []) as RelanceLigne[]}
              regularisations={(regularisations ?? []) as RegulLigne[]}
            />
          </CardContent>
        </Card>
      )}

      {/* Dépôt de garantie — encaissement */}
      {loyersActif && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dépôt de garantie</CardTitle>
            <CardDescription>
              Encaissement à l&apos;entrée : plafond légal contrôlé, versant tiers tracé,
              encaissement partiel possible. Restitué en fin de bail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireDepot
              orgId={orgId}
              bailId={bailId}
              depotDu={Number(bail.depot_garantie ?? 0)}
              encaissements={(depotEncaissements ?? []) as EncaissementDepot[]}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}` })
              )}
              locataireNom={
                locataire ? `${locataire.nom}${locataire.prenom ? ` ${locataire.prenom}` : ""}` : "Le locataire"
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Colocation (bail unique) : colocataires + garants */}
      {bail.type === "colocation" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colocataires & garants</CardTitle>
            <CardDescription>
              Bail unique solidaire : ajoutez les colocataires (quote-part) et les
              garants (nominatifs).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireColocation
              orgId={orgId}
              bailId={bailId}
              personnes={((personnes ?? []) as { id: string; nom: string; prenom: string | null }[]).map(
                (p) => ({ id: p.id, nom: `${p.nom}${p.prenom ? ` ${p.prenom}` : ""}` })
              )}
              lignes={lignesColoc}
              principal={{
                id: bail.locataire_principal ?? "",
                nom: locataire
                  ? `${locataire.nom}${locataire.prenom ? ` ${locataire.prenom}` : ""}`
                  : "—",
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Inventaire du mobilier (bail meublé) */}
      {bail.type === "meuble" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventaire du mobilier</CardTitle>
            <CardDescription>
              Annexe obligatoire du bail meublé (décret 2015-1437), reprise dans
              l&apos;état des lieux.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireInventaire
              orgId={orgId}
              bailId={bailId}
              lignes={(inventaire ?? []) as LigneInventaire[]}
            />
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

      {/* Restitution du dépôt de garantie */}
      {restitutionActif && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Restitution du dépôt de garantie</CardTitle>
            <CardDescription>
              Après la remise des clés : impayés imputés d&apos;abord, retenues avec
              décote de vétusté justifiées, solde de tout compte dans le délai légal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireRestitution
              orgId={orgId}
              bailId={bailId}
              restitution={(restitution ?? null) as Restitution | null}
              retenues={(retenues ?? []) as Retenue[]}
            />
          </CardContent>
        </Card>
      )}

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

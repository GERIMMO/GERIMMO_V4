import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { TYPES_PIECE_DOSSIER } from "@/lib/dossier";
import { FormulairePiece } from "./formulaire-piece";
import { FormulaireMandat, FormulaireLigneMandat, BoutonsEtatMandat } from "./formulaire-mandat";
import { FormulaireInvitation } from "./formulaire-invitation";

export const metadata = { title: "Fiche personne — Gerimmo" };

const ETATS_MANDAT: Record<string, string> = {
  brouillon: "Brouillon",
  a_signer: "À signer",
  actif: "Actif",
  preavis: "Préavis",
  resilie: "Résilié",
};

export default async function PagePersonne(
  props: PageProps<"/agence/[orgId]/personnes/[personId]">
) {
  const { orgId, personId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const { data: personne } = await supabase
    .from("persons")
    .select("id, nom, prenom, email, telephone, date_naissance, account_id")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!personne) notFound();

  // Pièces courantes du dossier (versioning : seules les non remplacées)
  const { data: pieces } = await supabase.rpc("dossier_personne", { p_person: personId });

  // Lots détenus par la personne (pour composer un mandat)
  const { data: detentions } = await supabase
    .from("detentions")
    .select("lot_id")
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .is("date_fin", null);
  const lotIds = [...new Set((detentions ?? []).map((d) => d.lot_id))];
  const { data: lots } = lotIds.length
    ? await supabase.from("lots").select("id, nom, bien_id").in("id", lotIds)
    : { data: [] };
  const bienIds = [...new Set((lots ?? []).map((l) => l.bien_id))];
  const { data: biens } = bienIds.length
    ? await supabase.from("biens").select("id, nom").in("id", bienIds)
    : { data: [] };
  const nomBien = (id: string) => (biens ?? []).find((b) => b.id === id)?.nom ?? "";
  const lotsOptions = (lots ?? []).map((l) => ({
    id: l.id,
    libelle: `${nomBien(l.bien_id)} · ${l.nom}`,
  }));

  // Mandats de la personne + leurs lignes
  const { data: mandats } = await supabase
    .from("mandats")
    .select("id, etat, date_rapport, seuil_delegation")
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .order("created_at");
  const mandatIds = (mandats ?? []).map((m) => m.id);
  const { data: lignes } = mandatIds.length
    ? await supabase
        .from("mandat_lignes")
        .select("id, mandat_id, lot_id, taux_honoraires, date_fin")
        .in("mandat_id", mandatIds)
    : { data: [] };
  const libelleLot = (id: string) => lotsOptions.find((l) => l.id === id)?.libelle ?? id.slice(0, 8);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <div>
        <Link
          href={`/agence/${orgId}/personnes`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Personnes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">
          {personne.nom}
          {personne.prenom ? ` ${personne.prenom}` : ""}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[personne.email, personne.telephone].filter(Boolean).join(" · ") || "Aucun contact"}
          {personne.date_naissance ? ` · né(e) le ${personne.date_naissance}` : ""}
        </p>
      </div>

      {/* Accès locataire : invitation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accès locataire</CardTitle>
          <CardDescription>
            Donnez à cette personne l&apos;accès à son espace (dépôt d&apos;attestation,
            suivi) via une invitation par email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormulaireInvitation
            orgId={orgId}
            personId={personId}
            email={personne.email}
            dejaInvite={Boolean(personne.account_id)}
          />
        </CardContent>
      </Card>

      {/* Dossier : pièces versionnées */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pièces justificatives</CardTitle>
          <CardDescription>
            Les pièces suivent la personne dans l&apos;agence. Chaque nouveau dépôt
            d&apos;un même type crée une version — l&apos;ancienne est conservée.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(pieces ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune pièce au dossier.</p>
          ) : (
            <ul className="divide-y divide-border">
              {(pieces ?? []).map(
                (p: { document_id: string; type: string; titre: string | null }) => (
                  <li key={p.document_id} className="flex items-center gap-3 py-2">
                    <span className="badge-statut text-muted-foreground">
                      {TYPES_PIECE_DOSSIER[p.type] ?? p.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {p.titre || "Sans titre"}
                    </span>
                    <Link
                      href={`/agence/${orgId}/documents/${p.document_id}/fichier`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      Ouvrir
                    </Link>
                  </li>
                )
              )}
            </ul>
          )}
          <FormulairePiece orgId={orgId} personId={personId} />
        </CardContent>
      </Card>

      {/* Mandats de gestion */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mandats de gestion</CardTitle>
          <CardDescription>
            Un mandat porte sur des lots détenus par cette personne — chaque lot
            avec son propre taux d&apos;honoraires (défaut 7 %).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {(mandats ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun mandat.</p>
          ) : (
            (mandats ?? []).map((m) => {
              const sesLignes = (lignes ?? []).filter((l) => l.mandat_id === m.id);
              return (
                <div key={m.id} className="rounded-lg border border-border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="badge-statut text-muted-foreground">
                        {ETATS_MANDAT[m.etat] ?? m.etat}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Rapport le {m.date_rapport} · seuil{" "}
                        {m.seuil_delegation ? `${m.seuil_delegation} €` : "500 € (défaut agence)"}
                      </span>
                    </div>
                    <BoutonsEtatMandat
                      orgId={orgId}
                      personId={personId}
                      mandatId={m.id}
                      etat={m.etat}
                    />
                  </div>
                  {sesLignes.length > 0 && (
                    <ul className="mb-2 space-y-1 text-sm">
                      {sesLignes.map((l) => (
                        <li key={l.id} className="flex justify-between">
                          <span>{libelleLot(l.lot_id)}</span>
                          <span className="text-muted-foreground">
                            {l.taux_honoraires} %{l.date_fin ? " (clos)" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <FormulaireLigneMandat
                    orgId={orgId}
                    personId={personId}
                    mandatId={m.id}
                    lots={lotsOptions}
                  />
                </div>
              );
            })
          )}
          <FormulaireMandat orgId={orgId} personId={personId} />
        </CardContent>
      </Card>
    </main>
  );
}

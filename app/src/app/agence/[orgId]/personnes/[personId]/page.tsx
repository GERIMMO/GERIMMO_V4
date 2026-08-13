import Link from "next/link";
import { formaterDate } from "@/lib/ged";
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
import { FormulairePiece, FormulaireNouvelleVersion } from "./formulaire-piece";
import { FormulaireIdentite } from "./formulaire-identite";
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

  // Versions antérieures (recette 13/08) : l'historique reste consultable —
  // on remonte la chaîne remplace_id de chaque pièce courante.
  const { data: liensDossier } = await supabase
    .from("document_liens")
    .select("document_id")
    .eq("organization_id", orgId)
    .eq("entite", "personne")
    .eq("entite_id", personId);
  const idsDossier = (liensDossier ?? []).map((l) => l.document_id);
  const { data: tousDocs } = idsDossier.length
    ? await supabase
        .from("documents")
        .select("id, titre, remplace_id, created_at")
        .in("id", idsDossier)
    : { data: [] };
  type DocVersion = { id: string; titre: string | null; remplace_id: string | null; created_at: string };
  const docParId = new Map(((tousDocs ?? []) as DocVersion[]).map((d) => [d.id, d]));
  const versionsAnterieures = (documentId: string) => {
    const chaine: DocVersion[] = [];
    let courant = docParId.get(documentId);
    while (courant?.remplace_id && chaine.length < 50) {
      const precedent = docParId.get(courant.remplace_id);
      if (!precedent) break;
      chaine.push(precedent);
      courant = precedent;
    }
    return chaine;
  };

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
  // Libellés des lots cités par les mandats — y compris ceux dont la détention
  // est close (un mandat résilié reste lisible : taux ET lots, recette 13/08).
  const lotsManquantsIds = [...new Set((lignes ?? []).map((l) => l.lot_id))].filter(
    (id) => !lotsOptions.some((o) => o.id === id)
  );
  const { data: lotsManquants } = lotsManquantsIds.length
    ? await supabase.from("lots").select("id, nom, bien_id").in("id", lotsManquantsIds)
    : { data: [] };
  const biensManquantsIds = [...new Set((lotsManquants ?? []).map((l) => l.bien_id))].filter(
    (id) => !(biens ?? []).some((b) => b.id === id)
  );
  const { data: biensManquants } = biensManquantsIds.length
    ? await supabase.from("biens").select("id, nom").in("id", biensManquantsIds)
    : { data: [] };
  const nomBienComplet = (id: string) =>
    [...(biens ?? []), ...(biensManquants ?? [])].find((b) => b.id === id)?.nom ?? "";
  const libelleLot = (id: string) => {
    const option = lotsOptions.find((l) => l.id === id);
    if (option) return option.libelle;
    const lot = (lotsManquants ?? []).find((l) => l.id === id);
    return lot ? `${nomBienComplet(lot.bien_id)} · ${lot.nom}` : id.slice(0, 8);
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-[1.125rem] p-4 sm:p-7">
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
          {personne.date_naissance ? ` · né(e) le ${formaterDate(personne.date_naissance)}` : ""}
        </p>
        <div className="mt-2">
          <FormulaireIdentite
            orgId={orgId}
            personId={personId}
            nom={personne.nom}
            prenom={personne.prenom}
            email={personne.email}
            telephone={personne.telephone}
            dateNaissance={personne.date_naissance}
          />
        </div>
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
            <p className="text-sm text-muted-foreground">Aucune pièce déposée. Ajoutez ci-dessous les justificatifs (identité, revenus, assurance).</p>
          ) : (
            <ul className="divide-y divide-border">
              {(pieces ?? []).map(
                (p: { document_id: string; type: string; titre: string | null }) => {
                  const anciennes = versionsAnterieures(p.document_id);
                  return (
                    <li key={p.document_id} className="py-2">
                      <div className="flex items-center gap-3">
                        <span className="badge-statut text-muted-foreground">
                          {TYPES_PIECE_DOSSIER[p.type] ?? p.type}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {p.titre || "Sans titre"}
                          {anciennes.length > 0 && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              v{anciennes.length + 1}
                            </span>
                          )}
                        </span>
                        <Link
                          href={`/agence/${orgId}/documents/${p.document_id}/fichier`}
                          className={buttonVariants({ variant: "ghost", size: "sm" })}
                        >
                          Ouvrir
                        </Link>
                      </div>
                      {anciennes.length > 0 && (
                        <details className="mt-1 pl-1 text-xs text-muted-foreground">
                          <summary className="cursor-pointer">
                            Historique — {anciennes.length} version
                            {anciennes.length > 1 ? "s" : ""} antérieure
                            {anciennes.length > 1 ? "s" : ""} (conservée
                            {anciennes.length > 1 ? "s" : ""})
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-3">
                            {anciennes.map((v) => (
                              <li key={v.id}>
                                {v.titre || "Sans titre"} — déposée le{" "}
                                {formaterDate(v.created_at)} ·{" "}
                                <Link
                                  href={`/agence/${orgId}/documents/${v.id}/fichier`}
                                  className="underline underline-offset-2"
                                >
                                  ouvrir
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <details className="mt-1 pl-1 text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Déposer une nouvelle version
                        </summary>
                        <FormulaireNouvelleVersion
                          orgId={orgId}
                          personId={personId}
                          remplaceId={p.document_id}
                          type={p.type}
                          titre={p.titre}
                        />
                      </details>
                    </li>
                  );
                }
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
            <p className="text-sm text-muted-foreground">Aucun mandat de gestion. C&apos;est lui qui autorise l&apos;agence à gérer les lots de ce propriétaire et fixe les honoraires.</p>
          ) : (
            (mandats ?? []).map((m) => {
              const sesLignes = (lignes ?? []).filter((l) => l.mandat_id === m.id);
              // Un mandat résilié est historisé (recette 13/08) : grisé, plus
              // aucune action — le taux et les lots restent lisibles.
              const historise = m.etat === "resilie";
              return (
                <div
                  key={m.id}
                  className={`rounded-lg border border-border p-3 ${historise ? "bg-muted opacity-70" : ""}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="badge-statut text-muted-foreground">
                        {ETATS_MANDAT[m.etat] ?? m.etat}
                      </span>
                      {historise && (
                        <span className="text-xs text-muted-foreground">
                          Historisé — non modifiable
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        Rapport le {m.date_rapport} · seuil{" "}
                        {m.seuil_delegation ? `${m.seuil_delegation} €` : "500 € (défaut agence)"}
                      </span>
                    </div>
                    {!historise && (
                      <BoutonsEtatMandat
                        orgId={orgId}
                        personId={personId}
                        mandatId={m.id}
                        etat={m.etat}
                      />
                    )}
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
                  {!historise && (
                    <FormulaireLigneMandat
                      orgId={orgId}
                      personId={personId}
                      mandatId={m.id}
                      lots={lotsOptions}
                    />
                  )}
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

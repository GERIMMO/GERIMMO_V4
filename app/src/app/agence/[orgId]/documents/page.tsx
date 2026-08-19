import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { TYPES_DOCUMENT, formaterDate, motifLitteral } from "@/lib/ged";
import { formaterTaille } from "@/lib/file-type";
import { nomComplet } from "@/lib/roles-personnes";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { FormulaireDepot } from "./formulaire-depot";
import { ActionsDocument } from "./actions-document";

export const metadata = { title: "Documents — Gerimmo" };

type Recherche = {
  type?: string;
  q?: string;
  du?: string;
  au?: string;
};

export default async function PageDocuments(
  props: PageProps<"/agence/[orgId]/documents">
) {
  const { orgId } = await props.params;
  const recherche = (await props.searchParams) as Recherche;
  const { supabase, organisation } = await verifierAccesEspace(orgId);

  const filtresActifs = Object.values(recherche ?? {}).some((v) => v);
  // Navigation par filtres, jamais par dossiers (RM-12.5.1)
  let requete = supabase
    .from("documents")
    .select(
      "id, type, titre, mime_type, taille_octets, purged_at, created_at, liens:document_liens(entite, entite_id)"
    )
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (recherche.type) requete = requete.eq("type", recherche.type);
  if (recherche.q) requete = requete.ilike("titre", `%${motifLitteral(recherche.q)}%`);
  if (recherche.du) requete = requete.gte("created_at", recherche.du);
  if (recherche.au) requete = requete.lte("created_at", `${recherche.au}T23:59:59`);
  const { data: documents } = await requete;

  const { data: personnes } = await supabase
    .from("persons")
    .select("id, nom, prenom")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("nom");

  const nomsPersonnes = new Map((personnes ?? []).map((p) => [p.id, nomComplet(p)]));
  const docs = documents ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href={`/agence/${orgId}`} className="hover:underline">
            {organisation.name}
          </Link>{" "}
          / Documents
        </p>
        <div className="entete-page">
          <h1>Documents</h1>
          {docs.length > 0 && (
            <span className="mono-discret">
              {docs.length} pièce{docs.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Filtres */}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="type" className="libelle-champ mb-1 block">
                Type
              </label>
              <select
                id="type"
                name="type"
                defaultValue={recherche.type ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Tous</option>
                {Object.entries(TYPES_DOCUMENT).map(([valeur, libelle]) => (
                  <option key={valeur} value={valeur}>
                    {libelle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="du" className="libelle-champ mb-1 block">
                Du
              </label>
              <input
                id="du"
                name="du"
                type="date"
                defaultValue={recherche.du ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="au" className="libelle-champ mb-1 block">
                Au
              </label>
              <input
                id="au"
                name="au"
                type="date"
                defaultValue={recherche.au ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              />
            </div>
            <div className="flex-1 min-w-40">
              <label htmlFor="q" className="libelle-champ mb-1 block">
                Recherche
              </label>
              <input
                id="q"
                name="q"
                type="search"
                placeholder="Titre…"
                defaultValue={recherche.q ?? ""}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Filtrer
            </button>
          </form>

          {/* Liste — un seul cadre, des rangs (maquette .colonne-liste) */}
          <div className="colonne-liste">
            {docs.length === 0 ? (
              // Deux vides très différents : la bibliothèque est neuve, ou le
              // filtre est trop étroit. Ne pas laisser l'agent croire au premier
              // quand c'est le second.
              filtresActifs ? (
                <div className="vide space-y-2">
                  <p className="font-medium">Aucun document ne correspond</p>
                  <p>Élargissez la recherche ou repartez de la liste complète.</p>
                  <Link
                    href={`/agence/${orgId}/documents`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Effacer les filtres
                  </Link>
                </div>
              ) : (
                <div className="vide space-y-1">
                  <p className="font-medium">Aucun document pour l&apos;instant</p>
                  <p>
                    Baux, diagnostics et justificatifs déposés ailleurs dans
                    l&apos;application se retrouvent ici. Vous pouvez aussi en
                    déposer un directement, ci-contre.
                  </p>
                </div>
              )
            ) : (
              docs.map((d) => {
                const rattachements = (d.liens ?? [])
                  .filter((l) => l.entite === "personne")
                  .map((l) => nomsPersonnes.get(l.entite_id) ?? "Personne")
                  .join(", ");
                return (
                  <div key={d.id} className="rang">
                    <span className="min-w-0 flex-1">
                      {d.purged_at ? (
                        <small className="block italic">
                          Document purgé le {formaterDate(d.purged_at)} —{" "}
                          {TYPES_DOCUMENT[d.type] ?? d.type} (règle de
                          conservation)
                        </small>
                      ) : (
                        <>
                          <b className="block truncate">{d.titre}</b>
                          <small className="block truncate">
                            {TYPES_DOCUMENT[d.type] ?? d.type}
                            {" · "}
                            {formaterDate(d.created_at)}
                            {d.taille_octets
                              ? ` · ${formaterTaille(d.taille_octets)}`
                              : ""}
                            {rattachements && ` · ${rattachements}`}
                          </small>
                        </>
                      )}
                    </span>
                    {!d.purged_at && (
                      <ActionsDocument orgId={orgId} documentId={d.id} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Dépôt */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Déposer un document</CardTitle>
            <CardDescription>
              PDF, JPEG ou PNG · 10 Mo max · contenu réel vérifié · doublons
              refusés.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormulaireDepot orgId={orgId} personnes={personnes ?? []} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

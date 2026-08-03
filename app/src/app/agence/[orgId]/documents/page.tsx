import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLES_GERANTS, TYPES_DOCUMENT, formaterDate } from "@/lib/ged";
import { formaterTaille } from "@/lib/file-type";
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
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const { data: adhesion } = await supabase
    .from("memberships")
    .select("role")
    .eq("account_id", user.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (!adhesion || !ROLES_GERANTS.includes(adhesion.role)) {
    redirect("/espaces");
  }

  const { data: organisation } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!organisation) notFound();

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
  if (recherche.q) requete = requete.ilike("titre", `%${recherche.q}%`);
  if (recherche.du) requete = requete.gte("created_at", recherche.du);
  if (recherche.au) requete = requete.lte("created_at", `${recherche.au}T23:59:59`);
  const { data: documents } = await requete;

  const { data: personnes } = await supabase
    .from("persons")
    .select("id, nom, prenom")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("nom");

  const nomsPersonnes = new Map(
    (personnes ?? []).map((p) => [p.id, `${p.nom} ${p.prenom ?? ""}`.trim()])
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-7">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          <Link href={`/agence/${orgId}`} className="hover:underline">
            {organisation.name}
          </Link>{" "}
          / Documents
        </p>
        <h1 className="text-2xl font-semibold">Documents</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Filtres */}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="type" className="mb-1 block text-xs text-muted-foreground">
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
              <label htmlFor="du" className="mb-1 block text-xs text-muted-foreground">
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
              <label htmlFor="au" className="mb-1 block text-xs text-muted-foreground">
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
              <label htmlFor="q" className="mb-1 block text-xs text-muted-foreground">
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
              className="h-9 rounded-md border border-input px-3 text-sm hover:bg-accent"
            >
              Filtrer
            </button>
          </form>

          {/* Liste */}
          <Card>
            <CardContent className="pt-6">
              {(documents ?? []).length === 0 ? (
                // Deux vides très différents : la bibliothèque est neuve, ou le
                // filtre est trop étroit. Ne pas laisser l'agent croire au premier
                // quand c'est le second.
                filtresActifs ? (
                  <div className="space-y-2 py-4">
                    <p className="text-sm font-medium">Aucun document ne correspond</p>
                    <p className="text-sm text-muted-foreground">
                      Élargissez la recherche ou repartez de la liste complète.
                    </p>
                    <Link
                      href={`/agence/${orgId}/documents`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Effacer les filtres
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-1 py-4">
                    <p className="text-sm font-medium">Aucun document pour l&apos;instant</p>
                    <p className="text-sm text-muted-foreground">
                      Baux, diagnostics et justificatifs déposés ailleurs dans
                      l&apos;application se retrouvent ici. Vous pouvez aussi en
                      déposer un directement, ci-contre.
                    </p>
                  </div>
                )
              ) : (
                <ul className="divide-y">
                  {(documents ?? []).map((d) => {
                    const rattachements = (d.liens ?? [])
                      .filter((l) => l.entite === "personne")
                      .map((l) => nomsPersonnes.get(l.entite_id) ?? "Personne")
                      .join(", ");
                    return (
                      <li
                        key={d.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          {d.purged_at ? (
                            <span className="italic text-muted-foreground">
                              Document purgé le {formaterDate(d.purged_at)} —{" "}
                              {TYPES_DOCUMENT[d.type] ?? d.type} (règle de
                              conservation)
                            </span>
                          ) : (
                            <>
                              <span className="font-medium">{d.titre}</span>
                              <span className="ml-2 text-muted-foreground">
                                {TYPES_DOCUMENT[d.type] ?? d.type}
                                {" · "}
                                {formaterDate(d.created_at)}
                                {d.taille_octets
                                  ? ` · ${formaterTaille(d.taille_octets)}`
                                  : ""}
                                {rattachements && ` · ${rattachements}`}
                              </span>
                            </>
                          )}
                        </div>
                        {!d.purged_at && (
                          <ActionsDocument orgId={orgId} documentId={d.id} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
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

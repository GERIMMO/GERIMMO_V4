import { verifierAccesEspace } from "@/lib/espace";
import { Card, CardContent } from "@/components/ui/card";
import { rolesDePersonne } from "@/lib/roles-personnes";
import { FormulairePersonne } from "./formulaire-personne";
import { ListePersonnes, type PersonneListe } from "./liste-personnes";

export const metadata = { title: "Personnes — Gerimmo" };

// Les personnes de l'agence. La fiche n'a pas de rôle en propre (module 0b) :
// il se déduit des détentions, des baux et des mandats — et la liste l'affiche,
// sinon elle n'apprend rien.
export default async function PagePersonnes(props: PageProps<"/agence/[orgId]/personnes">) {
  const { orgId } = await props.params;
  const { supabase } = await verifierAccesEspace(orgId);

  const aujourdhui = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const [
    { data: personnes },
    { data: detentions },
    { data: mandats },
    { data: baux },
    { data: bailPersonnes },
  ] = await Promise.all([
    supabase
      .from("persons")
      .select("id, nom, prenom, email, telephone")
      .eq("organization_id", orgId)
      .is("archived_at", null)
      .order("nom"),
    supabase
      .from("detentions")
      .select("person_id, date_fin")
      .eq("organization_id", orgId),
    supabase
      .from("mandats")
      .select("person_id")
      .eq("organization_id", orgId)
      .eq("etat", "actif"),
    supabase
      .from("baux")
      .select("id, locataire_principal, etat")
      .eq("organization_id", orgId),
    supabase
      .from("bail_personnes")
      .select("person_id, role, bail_id")
      .eq("organization_id", orgId),
  ]);

  // Seuls les liens vivants font un rôle : une détention close ou un bail
  // terminé font une histoire, pas un rôle courant.
  const bauxVivants = new Set(
    ((baux ?? []) as { id: string; etat: string }[])
      .filter((b) => b.etat === "actif" || b.etat === "preavis")
      .map((b) => b.id)
  );
  const liens = {
    proprietaires: new Set(
      ((detentions ?? []) as { person_id: string; date_fin: string | null }[])
        .filter((d) => d.date_fin === null || d.date_fin >= aujourdhui)
        .map((d) => d.person_id)
    ),
    mandants: new Set(((mandats ?? []) as { person_id: string }[]).map((m) => m.person_id)),
    locataires: new Set([
      ...((baux ?? []) as { locataire_principal: string | null; etat: string }[])
        .filter((b) => (b.etat === "actif" || b.etat === "preavis") && b.locataire_principal)
        .map((b) => b.locataire_principal as string),
      ...((bailPersonnes ?? []) as { person_id: string; role: string; bail_id: string }[])
        .filter((l) => l.role === "colocataire" && bauxVivants.has(l.bail_id))
        .map((l) => l.person_id),
    ]),
    garants: new Set(
      ((bailPersonnes ?? []) as { person_id: string; role: string; bail_id: string }[])
        .filter((l) => l.role === "garant" && bauxVivants.has(l.bail_id))
        .map((l) => l.person_id)
    ),
  };

  const fiches: PersonneListe[] = (
    (personnes ?? []) as Omit<PersonneListe, "roles">[]
  ).map((p) => ({ ...p, roles: rolesDePersonne(p.id, liens) }));

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Personnes</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <ListePersonnes orgId={orgId} personnes={fiches} />

        <aside>
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-medium">Nouvelle personne</p>
              <FormulairePersonne orgId={orgId} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

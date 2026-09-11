import { verifierAccesEspace } from "@/lib/espace";
import { aujourdhuiParis } from "@/lib/ged";
import { Card, CardContent } from "@/components/ui/card";
import { rolesDePersonne } from "@/lib/roles-personnes";
import { EchecLecture } from "../documents/echec-lecture";
import { FormulairePersonne } from "./formulaire-personne";
import { ListePersonnes, type PersonneListe } from "./liste-personnes";

export const metadata = { title: "Personnes — Gerimmo" };

// Les personnes de l'agence. La fiche n'a pas de rôle en propre (module 0b) :
// il se déduit des détentions, des baux et des mandats — et la liste l'affiche,
// sinon elle n'apprend rien.
export default async function PagePersonnes(props: PageProps<"/agence/[orgId]/personnes">) {
  const { orgId } = await props.params;
  const { supabase, role } = await verifierAccesEspace(orgId);

  const aujourdhui = aujourdhuiParis();
  const [
    { data: personnes, error: erreurPersonnes },
    { data: detentions, error: erreurDetentions },
    { data: mandats, error: erreurMandats },
    { data: baux, error: erreurBaux },
    { data: bailPersonnes, error: erreurBailPersonnes },
    { data: lots, error: erreurLots },
    { data: biens, error: erreurBiens },
    { data: nonLusRows, error: erreurNonLus },
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
    // Lots rattachables depuis l'assistant (adresse du bien pour la recherche).
    // Pas d'embed lots→biens : la table a deux clés étrangères vers biens
    // (simple + composite), PostgREST refuse la jointure ambiguë et la liste
    // sortait vide (recette 13/08) — deux requêtes plates, jointure en mémoire.
    supabase
      .from("lots")
      .select("id, nom, bien_id")
      .eq("organization_id", orgId)
      .neq("etat", "archive")
      .order("nom"),
    supabase
      .from("biens")
      .select("id, address_line1, city")
      .eq("organization_id", orgId),
    supabase.rpc("messages_non_lus_gerant", { p_org: orgId }),
  ]);

  const nonLusParPersonne = new Map(
    ((nonLusRows ?? []) as { person_id: string; non_lus: number }[]).map((r) => [
      r.person_id,
      r.non_lus,
    ])
  );

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
  ).map((p) => ({
    ...p,
    roles: rolesDePersonne(p.id, liens, role === "proprietaire_direct"),
    messagesNonLus: nonLusParPersonne.get(p.id) ?? 0,
  }));

  const bienParId = new Map(
    ((biens ?? []) as { id: string; address_line1: string; city: string }[]).map((b) => [b.id, b])
  );
  const lotsRattachables = ((lots ?? []) as { id: string; nom: string; bien_id: string }[]).map(
    (l) => {
      const bien = bienParId.get(l.bien_id);
      return {
        id: l.id,
        libelle: bien ? `${l.nom} — ${bien.address_line1}, ${bien.city}` : l.nom,
      };
    }
  );

  // Un rôle est DÉDUIT de quatre lectures (détentions, mandats, baux, liens de
  // bail). Si l'une échoue, la fiche s'affiche sans rôle — un propriétaire
  // mandant devient une fiche anonyme, sans rien pour le signaler.
  // `erreurPersonnes` n'est pas de la partie : la colonne le dit elle-même, à
  // la place exacte de la liste.
  const lecturesManquees = [
    erreurDetentions && "les détentions (rôle propriétaire)",
    erreurMandats && "les mandats (rôle mandant)",
    (erreurBaux || erreurBailPersonnes) &&
      "les baux (rôles locataire et garant)",
    (erreurLots || erreurBiens) && "les lots rattachables",
    erreurNonLus && "les messages non lus",
  ].filter((q): q is string => Boolean(q));

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>{role === "proprietaire_direct" ? "Locataires & garants" : "Personnes"}</h1>
        <div className="flex items-center gap-4">
          <span className="mono-discret">
            {erreurPersonnes
              ? "nombre indisponible"
              : `${fiches.length} fiche${fiches.length > 1 ? "s" : ""}`}
          </span>
          {/* Sous md, la carte de création est empilée après toute la liste
              (des centaines de fiches) : ce raccourci y mène directement.
              md:hidden sur un span : .btn-or est hors layer et gagnerait. */}
          <span className="md:hidden">
            <a href="#creer-fiche" className="btn-or">
              + Créer une fiche
            </a>
          </span>
        </div>
      </div>

      <EchecLecture quoi={lecturesManquees} />

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <ListePersonnes
          orgId={orgId}
          personnes={fiches}
          listeIllisible={Boolean(erreurPersonnes)}
        />

        <aside id="creer-fiche" className="scroll-mt-20">
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm font-medium">Créer une fiche</p>
              <FormulairePersonne
                orgId={orgId}
                lots={lotsRattachables}
                estBailleurDirect={role === "proprietaire_direct"}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

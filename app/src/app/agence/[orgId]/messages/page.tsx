import Link from "next/link";
import { verifierAccesEspace } from "@/lib/espace";
import { formaterDateHeure } from "@/lib/ged";
import { initiales } from "@/lib/roles-personnes";

export const metadata = { title: "Messages — Gerimmo" };

// Messages (maquette v6) : tous les fils en un endroit — une personne, son
// dernier message, ses non-lus. Le fil se lit et se répond sur la fiche de la
// personne (c'est là que la lecture marque « lu » et ferme l'alerte).
// Le périmètre portefeuille (RM-18.1.3) est appliqué EN SQL par la RPC :
// l'agent ne voit que les fils des locataires de ses mandats.
export default async function PageMessages(props: PageProps<"/agence/[orgId]/messages">) {
  const { orgId } = await props.params;
  const { supabase, role } = await verifierAccesEspace(orgId);

  const { data, error } = await supabase.rpc("fils_messages_gerant", { p_org: orgId });
  if (error) {
    return (
      <main className="mx-auto w-full max-w-4xl p-4 sm:p-7">
        <h1>Messages</h1>
        <div className="vide mt-4">
          Impossible de charger les fils pour l&apos;instant — rechargez dans un
          instant.
        </div>
      </main>
    );
  }
  const fils = (data ?? []) as {
    person_id: string;
    nom: string;
    prenom: string | null;
    dernier: string | null;
    dernier_le: string | null;
    dernier_auteur: "locataire" | "gerant" | null;
    non_lus: number;
  }[];
  const nonLus = fils.reduce((s, f) => s + f.non_lus, 0);

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Messages</h1>
        <span className="mono-discret">
          {role === "agent" ? "Mon portefeuille · " : ""}
          {nonLus > 0 ? `${nonLus} non lu${nonLus > 1 ? "s" : ""}` : "tout est lu"}
        </span>
      </div>

      {fils.length === 0 ? (
        <div className="vide">
          Aucun fil pour l&apos;instant — un locataire vous écrit depuis « Mon
          gestionnaire », et vous pouvez ouvrir la conversation depuis sa fiche.
        </div>
      ) : (
        <div className="colonne-liste">
          {fils.map((f) => (
            <Link
              key={f.person_id}
              href={`/agence/${orgId}/personnes/${f.person_id}#messages`}
              className="rang"
            >
              <span aria-hidden className="avatar">
                {initiales(f.nom, f.prenom)}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate">
                  {[f.prenom, f.nom].filter(Boolean).join(" ")}
                </b>
                <span className="block truncate text-xs text-muted-foreground">
                  {f.dernier_auteur === "gerant" ? "Vous : " : ""}
                  {f.dernier ?? ""}
                </span>
              </span>
              {f.non_lus > 0 && (
                <span className="puce puce-encre shrink-0">
                  {f.non_lus} nouveau{f.non_lus > 1 ? "x" : ""}
                </span>
              )}
              <span className="shrink-0 text-xs text-muted-foreground">
                {f.dernier_le ? formaterDateHeure(f.dernier_le) : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Le fil s&apos;ouvre sur la fiche de la personne — la lecture y marque les
        messages comme lus, et votre réponse ferme l&apos;alerte du fil.
      </p>
    </main>
  );
}

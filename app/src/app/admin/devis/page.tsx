import { formaterDateHeure } from "@/lib/ged";
import { createClient } from "@/lib/supabase/server";
import { BoutonDevisTraite } from "./bouton-traite";

export const metadata = { title: "Demandes de devis — Gerimmo" };

// Les demandes de devis déposées sur le site vitrine (agences). La vitrine
// promet une réponse sous 48 h ouvrées : cette page est l'endroit où la
// promesse se tient — le contact se fait par email, hors plateforme.
export default async function PageDevisAdmin() {
  const supabase = await createClient();
  // Le layout /admin a déjà vérifié is_super_admin ; la RLS reste la garde de fond
  const { data } = await supabase
    .from("demandes_devis")
    .select("id, nom, email, agence, telephone, nb_lots, message, created_at, traitee_le")
    .order("created_at", { ascending: false });
  const demandes = (data ?? []) as {
    id: string;
    nom: string;
    email: string;
    agence: string | null;
    telephone: string | null;
    nb_lots: string | null;
    message: string | null;
    created_at: string;
    traitee_le: string | null;
  }[];
  const enAttente = demandes.filter((d) => !d.traitee_le);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-7">
      <div className="entete-page mb-6">
        <h1>Demandes de devis</h1>
        <span className="mono-discret">
          {enAttente.length} en attente / {demandes.length}
        </span>
      </div>

      {demandes.length === 0 ? (
        <div className="vide">
          Aucune demande pour l&apos;instant — elles arrivent depuis le formulaire
          « agences » du site vitrine.
        </div>
      ) : (
        <div className="colonne-liste">
          {demandes.map((d) => (
            <div key={d.id} className={`px-4 py-3.5 ${d.traitee_le ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm">{d.nom}</b>
                {d.agence && <span className="text-sm text-muted-foreground">— {d.agence}</span>}
                {d.nb_lots && <span className="puce puce-encre">{d.nb_lots} lots</span>}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formaterDateHeure(d.created_at)}
                </span>
              </div>
              <p className="mt-1 text-sm">
                <a href={`mailto:${d.email}`} className="lien-discret">
                  {d.email}
                </a>
                {d.telephone && <span className="text-muted-foreground"> · {d.telephone}</span>}
              </p>
              {d.message && (
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                  {d.message}
                </p>
              )}
              <div className="mt-2">
                {d.traitee_le ? (
                  <span className="text-xs text-muted-foreground">
                    Traitée le {formaterDateHeure(d.traitee_le)}
                  </span>
                ) : (
                  <BoutonDevisTraite id={d.id} />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

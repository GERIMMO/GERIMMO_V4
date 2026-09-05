import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, formaterDate } from "@/lib/ged";

export const metadata = { title: "Mon abonnement — Gerimmo" };

// « Mon abonnement » (maquette PC v1) — grille tarifaire ACTÉE le 25/07 :
// 1ᵉʳ bien offert, 2,50 €/bien/mois ensuite, sans frais de mise en place.
// Le paiement en ligne (Stripe) arrive au S11 : d'ici là, la page dit ce qui
// est vrai — la formule, le décompte de biens, le statut d'essai.
export default async function PageAbonnement(props: PageProps<"/agence/[orgId]/abonnement">) {
  const { orgId } = await props.params;
  const { supabase, organisation, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const { data: biens } = await supabase
    .from("biens")
    .select("id, nom")
    .eq("organization_id", orgId)
    .order("created_at");
  const liste = (biens ?? []) as { id: string; nom: string }[];
  const payants = Math.max(0, liste.length - 1);
  const total = payants * 2.5;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <h1>Mon abonnement</h1>

      <div className="loc-carte">
        <div className="entete-carte !mb-1">
          <h3 className="text-base font-medium">Formule Gerimmo</h3>
          <span className={`loc-tag ${organisation.status === "essai" ? "ambre" : "vert"}`}>
            {organisation.status === "essai" ? "essai gratuit" : "actif"} · sans engagement
          </span>
        </div>
        {liste.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun bien pour l&apos;instant — votre premier bien est offert, à vie.
          </p>
        ) : (
          <div>
            {liste.map((b, ix) => (
              <div key={b.id} className="ligne-info">
                <span>
                  {b.nom}
                  {ix === 0 && (
                    <small className="block text-muted-foreground">
                      1ᵉʳ bien — offert, à vie
                    </small>
                  )}
                </span>
                <span>{ix === 0 ? "0 €" : "2,50 €/mois"}</span>
              </div>
            ))}
            <div className="ligne-info font-medium">
              <span className="!text-foreground">Total mensuel</span>
              <span className="font-heading text-lg">{eur(total)}</span>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Un prix par bien, tout compris : baux, quittances, incidents, livre et
          fiscalité. Un bien retiré n&apos;est plus compté le mois suivant.
        </p>
      </div>

      {organisation.status === "essai" && organisation.essai_fin && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="text-sm">
            <b className="font-semibold">
              Votre essai gratuit court jusqu&apos;au {formaterDate(organisation.essai_fin)}.
            </b>{" "}
            <span className="text-muted-foreground">
              Le paiement en ligne arrive prochainement — vous n&apos;avez rien à
              faire d&apos;ici là, et rien ne se ferme sans vous prévenir.
            </span>
          </p>
        </div>
      )}
    </main>
  );
}

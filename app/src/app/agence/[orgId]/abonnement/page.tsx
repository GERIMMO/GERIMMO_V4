import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { eur, formaterDate } from "@/lib/ged";
import {
  EncadreLectureImpossible,
  EnteteReglages,
  statutOrganisation,
} from "../profil/famille-reglages";

export const metadata = { title: "Mon abonnement — Gerimmo" };

// « Mon abonnement » (maquette PC v1) — grille tarifaire ACTÉE le 05/09
// (remplace celle du 25/07) : 1ᵉʳ bien offert, 5,99 €/bien/mois ensuite,
// sans frais de mise en place.
// Le paiement en ligne (Stripe) arrive au S11 : d'ici là, la page dit ce qui
// est vrai — la formule, le décompte de biens, le statut d'essai.
//
// Relevé 11/09, deux mensonges corrigés : (1) le champ `error` de la lecture
// des biens n'était pas consulté — une lecture en échec affichait « Aucun bien
// pour l'instant » et un total de 0 €, c'est-à-dire une FACTURE FAUSSE ;
// (2) le statut ne connaissait que « essai », tout le reste passait en vert
// « actif » — une organisation suspendue ou archivée s'y voyait active.
export default async function PageAbonnement(props: PageProps<"/agence/[orgId]/abonnement">) {
  const { orgId } = await props.params;
  const { supabase, organisation, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const { data: biens, error: erreurBiens } = await supabase
    .from("biens")
    .select("id, nom")
    .eq("organization_id", orgId)
    .order("created_at");
  const liste = (biens ?? []) as { id: string; nom: string }[];
  const payants = Math.max(0, liste.length - 1);
  const total = payants * 5.99;
  const statut = statutOrganisation(organisation.status);

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre="Mon abonnement" mention={organisation.name}>
        Ce que vous payez, bien par bien, et l&apos;état de votre compte. Aucun
        prélèvement n&apos;est en place : le paiement en ligne arrive
        prochainement.
      </EnteteReglages>

      <div className="loc-carte">
        <div className="entete-carte">
          <h3>Formule Gerimmo</h3>
          <span className={`puce ${statut.puce}`}>{statut.libelle}</span>
        </div>
        {erreurBiens ? (
          <EncadreLectureImpossible>
            Vos biens n&apos;ont pas pu être lus — ce n&apos;est pas un parc
            vide, et un total affiché ici serait faux. Rechargez la page dans
            un instant : rien n&apos;est prélevé entre-temps.
          </EncadreLectureImpossible>
        ) : liste.length === 0 ? (
          <div className="vide-guide">
            <p className="titre">Aucun bien pour l&apos;instant</p>
            <p className="explication">
              Votre premier bien est offert, à vie : tant que vous n&apos;en
              gérez qu&apos;un, votre abonnement reste à 0 €.
            </p>
            <div className="geste">
              <Link href={`/agence/${orgId}/parc/nouveau`} className="btn-or">
                Ajouter un bien
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {liste.map((b, ix) => (
              <div key={b.id} className="ligne-info">
                <span>
                  {b.nom}
                  {ix === 0 && (
                    <small className="block">1ᵉʳ bien — offert, à vie</small>
                  )}
                </span>
                <span className="montant">
                  {ix === 0 ? "0 €" : "5,99 €/mois"}
                </span>
              </div>
            ))}
            <div className="ligne-info font-medium">
              <span className="!text-foreground">Total mensuel</span>
              <span className="montant font-heading text-lg">{eur(total)}</span>
            </div>
          </div>
        )}
        <p className="mesure-lecture mt-3 text-xs text-muted-foreground">
          Un prix par bien, tout compris, sans engagement : baux, quittances,
          incidents, livre et fiscalité. Un bien retiré n&apos;est plus compté
          le mois suivant.
        </p>
      </div>

      {organisation.status === "essai" && organisation.essai_fin && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="mesure-lecture text-sm">
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

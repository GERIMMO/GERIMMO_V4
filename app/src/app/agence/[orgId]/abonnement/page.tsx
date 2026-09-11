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

type EtatAbonnement = {
  statut: string;
  ecriture_ouverte: boolean;
  essai_fin: string | null;
  jours_essai_restants: number | null;
  biens: number;
  biens_factures: number;
  mensuel: number;
};

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
//
// Relevé du soir, troisième mensonge : la page promettait « rien ne se ferme
// sans vous prévenir ». Depuis que l'abonnement a un effet (déclencheur du
// 11/09), un essai expiré FERME l'écriture le jour même, sans traitement de
// nuit — la date suffit. La page dit désormais ce qui arrive, avant que ça
// n'arrive, et ce qui reste possible après : tout lire, tout exporter.
//
// Le décompte vient de `etat_abonnement`, pas d'un calcul refait ici : c'est
// la même fonction qui sert de source au reste du produit, et deux additions
// du même montant finissent toujours par diverger.
export default async function PageAbonnement(props: PageProps<"/agence/[orgId]/abonnement">) {
  const { orgId } = await props.params;
  const { supabase, organisation, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();

  const [{ data: biens, error: erreurBiens }, { data: etatBrut, error: erreurEtat }] =
    await Promise.all([
      supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("created_at"),
      supabase.rpc("etat_abonnement", { p_org: orgId }),
    ]);
  const liste = (biens ?? []) as { id: string; nom: string }[];
  const etat = ((etatBrut ?? []) as EtatAbonnement[])[0] ?? null;
  const total = etat?.mensuel ?? 0;
  const statut = statutOrganisation(organisation.status);
  const ferme = etat ? !etat.ecriture_ouverte : false;
  const jours = etat?.jours_essai_restants ?? null;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre="Mon abonnement" mention={organisation.name}>
        Ce que vous payez, bien par bien, et l&apos;état de votre compte. Aucun
        prélèvement n&apos;est en place : le paiement en ligne arrive
        prochainement.
      </EnteteReglages>

      {ferme && (
        <div className="loc-carte border-l-4 border-l-[var(--destructive)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre compte est en lecture seule.
            </b>{" "}
            <span className="text-muted-foreground">
              {etat?.statut === "essai"
                ? "Votre essai est arrivé à son terme."
                : "L'abonnement n'est plus actif."}{" "}
              Vos données restent entières : vous pouvez tout consulter et tout
              exporter, y compris le journal de gestion. Seules les nouvelles
              saisies sont suspendues — baux, quittances, incidents. Elles
              reprendront exactement où elles se sont arrêtées.
            </span>
          </p>
        </div>
      )}

      {erreurEtat && !ferme && (
        <EncadreLectureImpossible>
          L&apos;état de votre abonnement n&apos;a pas pu être lu. Ce n&apos;est
          pas un compte fermé : rechargez la page dans un instant.
        </EncadreLectureImpossible>
      )}

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

      {!ferme && etat?.statut === "essai" && etat.essai_fin && (
        <div className="loc-carte border-l-4 border-l-[var(--or)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre essai gratuit court jusqu&apos;au {formaterDate(etat.essai_fin)}
              {jours !== null && jours <= 7
                ? jours === 0
                  ? " — dernier jour."
                  : ` — ${jours} jour${jours > 1 ? "s" : ""} restant${jours > 1 ? "s" : ""}.`
                : "."}
            </b>{" "}
            <span className="text-muted-foreground">
              Passé cette date, le compte passe en lecture seule : vous gardez
              l&apos;accès à tout ce qui s&apos;y trouve et à vos exports, mais
              vous ne pouvez plus rien saisir de nouveau. Le paiement en ligne
              arrive prochainement ; d&apos;ici là, écrivez-nous pour prolonger.
            </span>
          </p>
        </div>
      )}
    </main>
  );
}

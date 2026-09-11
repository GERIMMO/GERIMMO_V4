import Link from "next/link";
import { notFound } from "next/navigation";
import { BoutonPortail, BoutonSouscrire } from "./boutons-abonnement";
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

// Ce que Stripe sait, ramené au strict nécessaire : ni identifiant client, ni
// identifiant de souscription — ils n'ont rien à faire dans un navigateur.
type EtatPaiement = {
  stripe_statut: string | null;
  paye: boolean;
  periode_fin: string | null;
  annulation_demandee: boolean;
  quantite_cible: number;
  montant_mensuel: number;
  paiement_en_retard: boolean;
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

  const [
    { data: biens, error: erreurBiens },
    { data: etatBrut, error: erreurEtat },
    { data: paiementBrut, error: erreurPaiement },
  ] = await Promise.all([
    supabase.from("biens").select("id, nom").eq("organization_id", orgId).order("created_at"),
    supabase.rpc("etat_abonnement", { p_org: orgId }),
    supabase.rpc("mon_abonnement", { p_org: orgId }),
  ]);
  const liste = (biens ?? []) as { id: string; nom: string }[];
  const etat = ((etatBrut ?? []) as EtatAbonnement[])[0] ?? null;
  const paiement = ((paiementBrut ?? []) as EtatPaiement[])[0] ?? null;
  const total = etat?.mensuel ?? 0;
  const statut = statutOrganisation(organisation.status);
  const ferme = etat ? !etat.ecriture_ouverte : false;
  const jours = etat?.jours_essai_restants ?? null;

  // Retour de Stripe. `annule` n'est pas une erreur : le client a fermé la page
  // de paiement, ce qui est son droit — on le lui dit sans le gronder.
  const { paiement: retourStripe } = await props.searchParams;

  // Rien à payer tant qu'on ne gère qu'un bien : le premier est offert à vie.
  // La page ne propose donc pas de souscrire — proposer de payer 0 € est la
  // meilleure façon de faire douter quelqu'un de ce qu'il va lui être compté.
  const rienAPayer = (paiement?.quantite_cible ?? 0) < 1;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages titre="Mon abonnement" mention={organisation.name}>
        Ce que vous payez, bien par bien, et l&apos;état de votre compte.
      </EnteteReglages>

      {retourStripe === "ok" && (
        <div
          role="status"
          className="loc-carte border-l-4 border-l-[var(--success)]"
        >
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">Merci, votre paiement est enregistré.</b>{" "}
            <span className="text-muted-foreground">
              Votre compte s&apos;ouvre dès que Stripe nous le confirme — quelques
              secondes en général. Si cette page dit encore le contraire dans une
              minute, rechargez-la.
            </span>
          </p>
        </div>
      )}
      {retourStripe === "annule" && (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm text-muted-foreground">
            Paiement interrompu : rien n&apos;a été prélevé, et rien n&apos;a
            changé. Vous pouvez reprendre quand vous voulez.
          </p>
        </div>
      )}

      {erreurPaiement && (
        <EncadreLectureImpossible>
          L&apos;état de votre paiement n&apos;a pas pu être lu. Ce n&apos;est pas
          un abonnement absent : rechargez la page dans un instant.
        </EncadreLectureImpossible>
      )}

      {/* LE PRÉLÈVEMENT A ÉCHOUÉ, ET RIEN N'EST FERMÉ. Stripe relance pendant
          des semaines avant d'abandonner : une carte expirée n'est pas un
          impayé, et couper l'agence au premier échec lui ferait perdre sa
          journée pour une raison qu'elle ignore encore. On prévient, c'est
          tout — et on dit où corriger. */}
      {paiement?.paiement_en_retard && (
        <div
          role="alert"
          className="loc-carte border-l-4 border-l-[var(--warning)]"
        >
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Le dernier prélèvement n&apos;est pas passé.
            </b>{" "}
            <span className="text-muted-foreground">
              Votre compte reste entièrement ouvert : votre banque a peut-être
              refusé, ou la carte a expiré. Une nouvelle tentative est
              automatique dans les jours qui viennent. Pour aller plus vite,
              mettez votre moyen de paiement à jour ci-dessous.
            </span>
          </p>
        </div>
      )}

      {paiement?.annulation_demandee && paiement.periode_fin && (
        <div role="status" className="loc-carte border-l-4 border-l-[var(--warning)]">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">
              Votre abonnement prend fin le {formaterDate(paiement.periode_fin)}.
            </b>{" "}
            <span className="text-muted-foreground">
              Le mois en cours vous est acquis : rien ne change d&apos;ici là.
              Passé cette date, le compte passe en lecture seule — vos données
              restent entières et exportables. Vous pouvez revenir sur cette
              décision depuis « Gérer mon abonnement ».
            </span>
          </p>
        </div>
      )}

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

        {/* LES DEUX GESTES, ET UN SEUL À LA FOIS. Proposer « S'abonner » à qui
            paie déjà, c'est lui faire craindre un double prélèvement ; proposer
            « Gérer » à qui n'a pas de dossier chez Stripe, c'est un bouton qui
            mène à une erreur. L'écran ne montre donc que celui qui a un sens à
            cet instant. */}
        {!erreurBiens && (
          <div className="mt-4 space-y-3 border-t border-border pt-4">
            {rienAPayer ? (
              <p className="mesure-lecture text-sm text-muted-foreground">
                Rien à régler pour l&apos;instant : votre premier bien est offert,
                à vie. Le paiement s&apos;ouvrira le jour où vous en ajouterez un
                second.
              </p>
            ) : paiement?.paye ? (
              <>
                <p className="mesure-lecture text-sm text-muted-foreground">
                  Votre abonnement est actif
                  {paiement.periode_fin && !paiement.annulation_demandee
                    ? ` — prochaine échéance le ${formaterDate(paiement.periode_fin)}`
                    : ""}
                  . Carte, factures et résiliation se règlent chez notre
                  prestataire de paiement.
                </p>
                <BoutonPortail orgId={orgId} />
              </>
            ) : (
              <>
                <p className="mesure-lecture text-sm text-muted-foreground">
                  {ferme
                    ? "Votre compte rouvre dès le premier paiement, avec toutes vos données là où vous les avez laissées."
                    : "Vous pouvez souscrire dès maintenant : le prélèvement ne démarre qu'à la validation, et votre essai n'en est pas raccourci."}
                </p>
                <BoutonSouscrire
                  orgId={orgId}
                  libelle={
                    ferme
                      ? `Rouvrir mon compte — ${eur(total)} par mois`
                      : `S'abonner — ${eur(total)} par mois`
                  }
                />
                {/* Un client peut avoir un dossier chez Stripe sans abonnement
                    actif (résiliation, paiement abandonné) : ses anciennes
                    factures lui restent dues, il doit pouvoir les retrouver. */}
                {paiement?.stripe_statut && <BoutonPortail orgId={orgId} />}
              </>
            )}
          </div>
        )}
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
              vous ne pouvez plus rien saisir de nouveau.
              {rienAPayer
                ? " Tant que vous ne gérez qu'un bien, rien n'est à régler : votre compte reste ouvert."
                : " Souscrire maintenant ne raccourcit pas votre essai."}
            </span>
          </p>
        </div>
      )}
    </main>
  );
}

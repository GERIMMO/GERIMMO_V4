import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { baseEspace } from "@/lib/racine-espace";
import { jourEnLettres } from "@/lib/delai-retractation";
import { dateParis } from "@/lib/heure-paris-calcul";
import { etatRetractation } from "@/lib/retractation-etat";
import { ligneRetractationDuResponsable } from "@/lib/retractation-serveur";
import { formuleParCode } from "@/lib/tarifs";
import { EncadreLectureImpossible, EnteteReglages } from "../../profil/famille-reglages";
import { FormulaireResiliation } from "../formulaires-contrat";

export const metadata = { title: "Résilier votre contrat — Gerimmo" };
// Comme « Mon abonnement » : l'action de cette page écrit chez Stripe sous le verrou des gestes de facturation.
export const maxDuration = 300;

type Paiement = { souscrit: boolean; periode_fin: string | null; annulation_demandee: boolean; formule: string | null; periodicite: "mensuel" | "annuel" };

// « RÉSILIER VOTRE CONTRAT » (plan de conformité du 23/10/2026, R04) : le seul chemin de résiliation (le portail de
// paiement n'en propose plus). La page récapitule le contrat et sa date de fin, préremplit le nom et l'adresse de
// l'accusé (modifiables), puis « Notifier la résiliation » enregistre la résiliation pour la prochaine échéance et
// envoie l'accusé de réception.
export default async function PageResiliation(props: PageProps<"/agence/[orgId]/abonnement/resiliation">) {
  const { orgId } = await props.params;
  const { supabase, user, organisation, role, estProprietaire } = await verifierAccesEspace(orgId);
  if (!["admin_agence", "proprietaire_direct"].includes(role)) notFound();
  const base = baseEspace(orgId, estProprietaire);
  const [{ data: paiementBrut, error }, ligne] = await Promise.all([
    supabase.rpc("mon_abonnement", { p_org: orgId }),
    ligneRetractationDuResponsable(supabase, orgId),
  ]);
  const paiement = ((paiementBrut ?? []) as Paiement[])[0] ?? null;
  if (error || !paiement || ligne === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
        <EnteteReglages rubrique="abonnement" titre="Résilier votre contrat" />
        <EncadreLectureImpossible>Votre abonnement n&apos;a pas pu être lu. Rechargez la page dans un instant.</EncadreLectureImpossible>
      </main>
    );
  }
  const prenom = typeof user.user_metadata?.prenom === "string" ? user.user_metadata.prenom : "";
  const nomCompte = typeof user.user_metadata?.nom === "string" ? user.user_metadata.nom : "";
  const nom = `${prenom} ${nomCompte}`.trim();
  const adresse = ligne?.destinataire ?? user.email ?? "";
  const formule = formuleParCode(paiement.formule)?.nom ?? null;
  const fin = paiement.periode_fin ? jourEnLettres(dateParis(new Date(paiement.periode_fin))) : null;
  const retractation = etatRetractation(ligne ?? null).abonnement;

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages rubrique="abonnement" titre="Résilier votre contrat" mention={organisation.name}>
        La résiliation prend effet à la prochaine échéance. Vérifiez le récapitulatif, puis notifiez-la.
      </EnteteReglages>

      {!paiement.souscrit ? (
        <div className="loc-carte space-y-2">
          <p className="text-sm">Aucun abonnement n&apos;est en cours : il n&apos;y a rien à résilier.</p>
          <Link href={`${base}/abonnement`} className="underline underline-offset-4 text-sm">Retour à « Mon abonnement »</Link>
        </div>
      ) : paiement.annulation_demandee ? (
        <div className="loc-carte space-y-2">
          <p className="mesure-lecture text-sm">
            La résiliation de votre abonnement est déjà enregistrée{fin ? ` : votre contrat prend fin le ${fin}` : ""}. Vous pouvez
            l&apos;annuler depuis « Mon abonnement » jusqu&apos;à cette date.
          </p>
          <Link href={`${base}/abonnement`} className="underline underline-offset-4 text-sm">Retour à « Mon abonnement »</Link>
        </div>
      ) : (
        <section className="loc-carte space-y-4" aria-labelledby="recapitulatif-resiliation">
          <h2 id="recapitulatif-resiliation">Récapitulatif</h2>
          <dl className="space-y-1 text-sm">
            <div className="ligne-info">
              <dt>Contrat</dt>
              <dd className="montant">
                Abonnement Gerimmo{formule && organisation.type !== "agence" ? `, formule ${formule}` : ""}
                {paiement.periodicite === "annuel" ? " (annuel)" : " (mensuel)"}
              </dd>
            </div>
            <div className="ligne-info">
              <dt>Espace</dt>
              <dd className="montant">{organisation.name}</dd>
            </div>
            {ligne?.souscrit_le && (
              <div className="ligne-info">
                <dt>Date de souscription</dt>
                <dd className="montant">{jourEnLettres(dateParis(new Date(ligne.souscrit_le)))}</dd>
              </div>
            )}
            <div className="ligne-info font-medium">
              <dt className="!text-foreground">Date de fin du contrat</dt>
              <dd className="montant">{fin ? `${fin} (prochaine échéance)` : "la prochaine échéance"}</dd>
            </div>
          </dl>
          <p className="mesure-lecture text-sm text-muted-foreground">
            Votre abonnement prendra fin le {fin ?? "jour de la prochaine échéance"}. Jusque-là, votre accès payé reste entier. Ensuite,
            votre compte passe en lecture seule : vos données restent consultables et exportables ; rien n&apos;est supprimé du seul
            fait de la résiliation. La période en cours n&apos;est pas remboursée.
          </p>
          {retractation.ouverte && retractation.dernierJour && (
            <p className="mesure-lecture border-l-4 border-l-[var(--or)] pl-3 text-sm">
              Vous êtes encore dans votre délai de rétractation, jusqu&apos;au {jourEnLettres(retractation.dernierJour)} inclus : vous pouvez
              aussi{" "}
              <Link href={`${base}/abonnement/retractation`} className="underline underline-offset-4">
                renoncer au contrat
              </Link>
              , ce qui met fin à l&apos;abonnement tout de suite et vous rembourse intégralement.
            </p>
          )}
          <FormulaireResiliation orgId={orgId} nom={nom} adresse={adresse} />
        </section>
      )}
    </main>
  );
}

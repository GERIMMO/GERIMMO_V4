import Link from "next/link";
import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { baseEspace } from "@/lib/racine-espace";
import { clientStripe, configurationStripe } from "@/lib/stripe";
import { clientDeService } from "@/lib/supabase/service";
import { declarationRetractation } from "@/lib/courriers-contrat";
import { jourEnLettres } from "@/lib/delai-retractation";
import { dateParis } from "@/lib/heure-paris-calcul";
import { etatRetractation, type LigneRetractation } from "@/lib/retractation-etat";
import { ligneRetractationDuResponsable, ligneRetractationParLeService } from "@/lib/retractation-serveur";
import { formuleParCode } from "@/lib/tarifs";
import { EncadreLectureImpossible, EnteteReglages } from "../../profil/famille-reglages";
import { FormulaireRetractation } from "../formulaires-contrat";

export const metadata = { title: "Renoncer au contrat — Gerimmo" };
// Comme « Mon abonnement » : l'action de cette page écrit chez Stripe sous le verrou des gestes de facturation.
export const maxDuration = 300;

// LA DÉCLARATION DE RÉTRACTATION (plan de conformité du 23/10/2026, R01 et R37). Ouverte pendant tout le délai, y
// compris en lecture seule (compte gelé). Nom et adresse de l'accusé préremplis et modifiables ; le contrat visé et la
// date limite sont rappelés ; la déclaration signée est montrée telle que l'accusé la reprendra.
export default async function PageRetractation(props: PageProps<"/agence/[orgId]/abonnement/retractation">) {
  const { orgId } = await props.params;
  const recherche = await props.searchParams;
  const nature = recherche.nature === "passage_annuel" ? "passage_annuel" : "abonnement";
  const { supabase, user, organisation, role, estProprietaire, traverseeLectureSeule } = await verifierAccesEspace(orgId);
  if (!["admin_agence", "proprietaire_direct"].includes(role)) notFound();
  const base = baseEspace(orgId, estProprietaire);

  // Le super-administrateur permanent (second facteur) saisit ici une rétractation reçue par courriel.
  let saisieSuperviseur = false;
  let ligne: LigneRetractation | null | undefined;
  if (traverseeLectureSeule) {
    const { data: permanent } = await supabase.rpc("is_permanent_super_admin");
    const service = permanent === true ? clientDeService() : null;
    if (!service) notFound();
    saisieSuperviseur = true;
    ligne = await ligneRetractationParLeService(service, orgId);
  } else {
    ligne = await ligneRetractationDuResponsable(supabase, orgId);
  }
  if (ligne === undefined) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
        <EnteteReglages rubrique="abonnement" titre="Renoncer au contrat" />
        <EncadreLectureImpossible>Votre abonnement n&apos;a pas pu être lu. Rechargez la page dans un instant.</EncadreLectureImpossible>
      </main>
    );
  }

  // Une souscription antérieure au 24/10 que le webhook n'a pas encore datée : sa date est relue chez Stripe.
  let conclusionStripe: Date | null = null;
  const reglages = configurationStripe();
  if (ligne?.abonnement_suivi && !ligne.souscrit_le && reglages.pret) {
    const { data: sub } = await supabase.rpc("ma_souscription_stripe", { p_org: orgId });
    if (sub) {
      const s = await clientStripe(reglages.config).subscriptions.retrieve(sub as string).catch(() => null);
      conclusionStripe = s && typeof s.start_date === "number" ? new Date(s.start_date * 1000) : null;
    }
  }
  const etat = etatRetractation(ligne ?? null, new Date(), conclusionStripe);
  const droit = nature === "abonnement" ? etat.abonnement : etat.passage;
  const prenom = typeof user.user_metadata?.prenom === "string" ? user.user_metadata.prenom : "";
  const nomCompte = typeof user.user_metadata?.nom === "string" ? user.user_metadata.nom : "";
  const nom = saisieSuperviseur ? "" : `${prenom} ${nomCompte}`.trim();
  const adresse = saisieSuperviseur ? "" : (ligne?.destinataire ?? user.email ?? "");
  const formule = formuleParCode(ligne?.formule)?.nom ?? null;
  const estAgence = organisation.type === "agence";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-7">
      <EnteteReglages rubrique="abonnement" titre="Renoncer au contrat" mention={organisation.name}>
        {nature === "abonnement"
          ? "Vous pouvez renoncer à votre abonnement, sans motif, pendant le délai de rétractation. Vous êtes alors remboursé intégralement."
          : "Vous pouvez renoncer au passage de votre abonnement à la formule annuelle, sans motif, pendant le délai de rétractation."}
      </EnteteReglages>

      {droit.declareeLe ? (
        <div role="status" className="loc-carte">
          <p className="mesure-lecture text-sm">
            <b className="font-semibold">Votre rétractation est enregistrée</b> depuis le {jourEnLettres(dateParis(new Date(droit.declareeLe)))}.{" "}
            <span className="text-muted-foreground">Si l&apos;accusé de réception ne vous est pas parvenu, confirmez de nouveau ci-dessous : rien n&apos;est fait deux fois.</span>
          </p>
        </div>
      ) : null}

      {!droit.conclusion || (!droit.ouverte && !droit.declareeLe) ? (
        <div className="loc-carte space-y-2">
          <p className="mesure-lecture text-sm">
            {droit.dernierJour
              ? `Le délai de rétractation a pris fin le ${jourEnLettres(droit.dernierJour)} à 23 h 59 (heure de Paris).`
              : "Aucun délai de rétractation n'est en cours pour cet abonnement."}{" "}
            Vous pouvez résilier votre abonnement depuis « Mon abonnement ».
          </p>
          <Link href={`${base}/abonnement`} className="underline underline-offset-4 text-sm">
            Retour à « Mon abonnement »
          </Link>
        </div>
      ) : (
        <section className="loc-carte space-y-4" aria-labelledby="declaration">
          <h2 id="declaration">Votre déclaration</h2>
          <dl className="space-y-1 text-sm">
            <div className="ligne-info">
              <dt>Contrat</dt>
              <dd className="montant">
                Abonnement Gerimmo{formule && !estAgence ? `, formule ${formule}` : ""}, espace {organisation.name}
              </dd>
            </div>
            <div className="ligne-info">
              <dt>{nature === "abonnement" ? "Souscrit le" : "Passage à l'annuel demandé le"}</dt>
              <dd className="montant">{jourEnLettres(dateParis(droit.conclusion))}</dd>
            </div>
            <div className="ligne-info">
              <dt>Droit de rétractation</dt>
              <dd className="montant">jusqu&apos;au {jourEnLettres(droit.dernierJour ?? dateParis(droit.conclusion))} inclus</dd>
            </div>
          </dl>
          <p className="mesure-lecture text-sm text-muted-foreground">
            Votre déclaration sera : « {declarationRetractation({ nature, formule: ligne?.formule ?? null, estAgence, organisation: organisation.name, reference: droit.conclusion, nom: nom || "votre nom" })} »
          </p>
          <p className="mesure-lecture text-sm text-muted-foreground">
            {nature === "abonnement"
              ? "Votre abonnement prend fin aussitôt. Ce que vous avez payé vous est remboursé intégralement, sous 14 jours, sur la carte utilisée, sans frais. Si votre essai gratuit court encore, il continue jusqu'à son terme ; sinon, votre compte passe en lecture seule : vos données restent consultables et exportables, rien n'est supprimé."
              : etat.passage.effectue
                ? // Relecture adverse du 24/10 (M7) : le nouveau cycle mensuel commence ce jour-là, sa première mensualité est prélevée aussitôt.
                  "Votre abonnement redevient mensuel à compter de ce jour : une première mensualité, au prix mensuel de votre formule, est prélevée ce jour, puis chaque mois à la même date. L'échéance annuelle vous est remboursée intégralement, sous 14 jours, sur la carte utilisée, sans frais."
                : "Votre abonnement reste mensuel : le passage à la formule annuelle n'aura pas lieu, et rien ne vous sera prélevé à ce titre."}
          </p>
          <FormulaireRetractation orgId={orgId} nature={nature} nom={nom} adresse={adresse} saisieSuperviseur={saisieSuperviseur} />
          <p className="text-xs text-muted-foreground">
            Vous pouvez aussi utiliser le formulaire de rétractation des{" "}
            <Link href="/conditions" target="_blank" rel="noopener" className="underline underline-offset-4">
              conditions générales
            </Link>{" "}
            ou nous écrire.
          </p>
        </section>
      )}
    </main>
  );
}

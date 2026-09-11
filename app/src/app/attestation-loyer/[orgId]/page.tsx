import type { ReactNode } from "react";
import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { aEchoue, PanneLecture } from "@/app/locataire/[orgId]/panne-lecture";
import type { BailLocataire } from "@/app/locataire/[orgId]/types";

export const metadata = { title: "Attestation de bon paiement — Gerimmo" };

// Attestation de bon paiement (maquette v10) : établie à la demande du
// locataire, uniquement s'il est réellement à jour — sinon la page explique
// pourquoi elle ne peut pas être délivrée. Imprimable telle quelle.
//
// Les quatre visages de cette page (panne, pas encore, refus, attestation)
// partagent une seule coquille : jusqu'au 2026-09-11 chacun portait son
// propre <main>, avec son propre rythme vertical.
export default async function PageAttestationLoyer(
  props: PageProps<"/attestation-loyer/[orgId]">
) {
  const { orgId } = await props.params;
  const { supabase, personne, organisation } = await verifierAccesEspaceLocataire(orgId);

  const [
    { data: baux, error: eBail },
    { data: echeancier, error: eEcheancier },
    { data: gestionnaires, error: eGestionnaire },
  ] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
  ]);
  // Une lecture tombée donnait ici le pire des écrans : un échéancier vide se
  // lit « après votre premier loyer réglé » — on annonçait à un locataire de
  // trois ans qu'il n'avait jamais payé. Un échec n'est pas un vide (11/09).
  const lectureKO = aEchoue(eBail, eEcheancier, eGestionnaire);

  const bail = ((baux ?? []) as BailLocataire[])[0];
  const lignes = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    statut: string;
  }[];
  // L'attestation est un document SIGNÉ : le nom qui l'émet ne peut pas être
  // un à-peu-près. Sans gestionnaire déclaré, c'est l'organisation de
  // l'espace — « Votre agence » n'atteste rien et ne vaut aucun dossier.
  const agence = ((gestionnaires ?? []) as { agence: string }[])[0]?.agence ?? organisation.name;

  const aujourdhui = aujourdhuiParis();
  // « de juillet 2026 à septembre 2026 » — avec l'élision devant voyelle
  // (« d'août », « d'avril », « d'octobre »), audit 09/09
  const moisLong = (periode: string) =>
    new Date(periode).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const deMois = (mois: string) => (/^[aeiouyàâéèêëîï]/i.test(mois) ? `d'${mois}` : `de ${mois}`);
  // À jour = aucun mois échu impayé ou partiel (le mois « à échoir » ne compte pas)
  const moisEchus = lignes.filter((l) => l.statut !== "attendu");
  const enSouffrance = moisEchus.filter((l) => l.statut === "impaye" || l.statut === "partiel");
  const moisPayes = moisEchus.filter((l) => l.statut === "paye");
  // Loyer charges comprises : inconnu tant que rien n'est renseigné. `eur`
  // imprime « — » ; additionner deux absences donnerait un loyer de 0,00 €.
  const loyerCc =
    bail && (bail.loyer_hc !== null || bail.charges !== null)
      ? Number(bail.loyer_hc ?? 0) + Number(bail.charges ?? 0)
      : null;

  let contenu: ReactNode;
  let delivrable = false;

  if (lectureKO) {
    // Ni attestation ni explication de refus : les deux seraient un mensonge
    // tant qu'on n'a pas pu lire l'échéancier.
    contenu = <PanneLecture quoi="votre attestation de bon paiement" />;
  } else if (!bail || moisEchus.length === 0) {
    contenu = (
      <div className="vide-guide">
        <p className="titre">Pas encore d&apos;attestation à délivrer</p>
        <p className="explication">
          L&apos;attestation de bon paiement atteste des loyers déjà réglés :
          elle pourra être établie après votre premier loyer échu.
        </p>
      </div>
    );
  } else if (enSouffrance.length > 0) {
    contenu = (
      <div className="vide-guide">
        <p className="titre">Attestation indisponible pour l&apos;instant</p>
        <p className="explication">
          {enSouffrance.length} loyer{enSouffrance.length > 1 ? "s" : ""} reste
          {enSouffrance.length > 1 ? "nt" : ""} dû{enSouffrance.length > 1 ? "s" : ""} sur
          votre échéancier. L&apos;attestation redeviendra disponible dès que
          votre compte sera soldé.
        </p>
        <div className="geste">
          <Link href={`/locataire/${orgId}/contact`} className="btn-or">
            Une difficulté ? Écrire à mon gestionnaire
          </Link>
        </div>
      </div>
    );
  } else {
    delivrable = true;
    contenu = (
      <>
        <p className="text-sm leading-relaxed">
          {agence}, gestionnaire du logement désigné ci-dessous, atteste que{" "}
          <b className="font-semibold">{personne ? nomComplet(personne) : "le locataire"}</b>,
          locataire de <b className="font-semibold">{bail.lot_nom}</b>
          {bail.adresse ? ` — ${bail.adresse}` : ""}, est à jour du paiement de
          ses loyers et charges à la date d&apos;établissement de la présente
          attestation.
        </p>
        <div>
          <div className="ligne-info">
            <span>Loyer mensuel charges comprises</span>
            <span className="montant">{eur(loyerCc)}</span>
          </div>
          <div className="ligne-info">
            <span>Mois réglés à ce jour</span>
            <span>
              {moisPayes.length} mois
              {moisPayes.length > 0 &&
                ` (${deMois(moisLong(moisPayes[0].periode))} à ${moisLong(
                  moisPayes[moisPayes.length - 1].periode
                )})`}
            </span>
          </div>
          {bail.date_debut && (
            <div className="ligne-info">
              <span>Locataire depuis le</span>
              <span>{formaterDate(bail.date_debut)}</span>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Fait pour servir et valoir ce que de droit.
          <br />
          {agence}
        </p>
        <p className="text-xs text-muted-foreground print:hidden">
          Ce document est établi automatiquement d&apos;après votre échéancier —
          utile pour un futur dossier de location.
        </p>
      </>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <Link href={`/locataire/${orgId}/loyers`} className="lien-discret">
          ‹ Mes paiements
        </Link>
        {delivrable && <BoutonImprimer libelle="Imprimer ou enregistrer" />}
      </div>
      <div>
        <h1>Attestation de bon paiement</h1>
        {delivrable && (
          <p className="text-sm text-muted-foreground">Établie le {formaterDate(aujourdhui)}</p>
        )}
      </div>
      {contenu}
    </main>
  );
}

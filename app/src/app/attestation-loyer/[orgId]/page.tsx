import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import type { BailLocataire } from "@/app/locataire/[orgId]/types";

export const metadata = { title: "Attestation de bon paiement — Gerimmo" };

// Attestation de bon paiement (maquette v10) : établie à la demande du
// locataire, uniquement s'il est réellement à jour — sinon la page explique
// pourquoi elle ne peut pas être délivrée. Imprimable telle quelle.
export default async function PageAttestationLoyer(
  props: PageProps<"/attestation-loyer/[orgId]">
) {
  const { orgId } = await props.params;
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  const [{ data: baux }, { data: echeancier }, { data: gestionnaires }] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    supabase.rpc("mon_gestionnaire_locataire", { p_org: orgId }),
  ]);
  const bail = ((baux ?? []) as BailLocataire[])[0];
  const lignes = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    statut: string;
  }[];
  const agence = ((gestionnaires ?? []) as { agence: string }[])[0]?.agence ?? "Votre agence";

  const aujourdhui = aujourdhuiParis();
  // À jour = aucun mois échu impayé ou partiel (le mois « à échoir » ne compte pas)
  const moisEchus = lignes.filter((l) => l.statut !== "attendu");
  const enSouffrance = moisEchus.filter((l) => l.statut === "impaye" || l.statut === "partiel");
  const moisPayes = moisEchus.filter((l) => l.statut === "paye");
  const retour = (
    <Link href={`/locataire/${orgId}/loyers`} className="lien-discret text-sm print:hidden">
      ‹ Mes paiements
    </Link>
  );

  if (!bail || moisEchus.length === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 p-5 sm:p-8">
        {retour}
        <h1>Attestation de bon paiement</h1>
        <p className="text-sm text-muted-foreground">
          L&apos;attestation pourra être établie après votre premier loyer réglé.
        </p>
      </main>
    );
  }

  if (enSouffrance.length > 0) {
    return (
      <main className="mx-auto w-full max-w-2xl space-y-4 p-5 sm:p-8">
        {retour}
        <h1>Attestation de bon paiement</h1>
        <p className="text-sm">
          L&apos;attestation ne peut pas être délivrée pour l&apos;instant :{" "}
          {enSouffrance.length} loyer{enSouffrance.length > 1 ? "s" : ""} reste
          {enSouffrance.length > 1 ? "nt" : ""} dû
          {enSouffrance.length > 1 ? "s" : ""}. Elle redeviendra disponible dès
          que votre compte sera soldé — une difficulté ? Écrivez à votre
          gestionnaire.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-5 sm:p-8">
      <div className="flex items-start justify-between gap-3 print:hidden">
        {retour}
        <BoutonImprimer />
      </div>
      <div>
        <h1>Attestation de bon paiement</h1>
        <p className="text-sm text-muted-foreground">
          Établie le {formaterDate(aujourdhui)}
        </p>
      </div>
      <p className="text-sm leading-relaxed">
        {agence}, gestionnaire du logement désigné ci-dessous, atteste que{" "}
        <b className="font-semibold">{personne ? nomComplet(personne) : "le locataire"}</b>,
        locataire de <b className="font-semibold">{bail.lot_nom}</b>
        {bail.adresse ? ` — ${bail.adresse}` : ""}, est à jour du paiement de
        ses loyers et charges à la date d&apos;établissement de la présente
        attestation.
      </p>
      <div className="text-sm">
        <div className="ligne-info">
          <span>Loyer mensuel charges comprises</span>
          <span>{eur(Number(bail.loyer_hc ?? 0) + Number(bail.charges ?? 0))}</span>
        </div>
        <div className="ligne-info">
          <span>Mois réglés à ce jour</span>
          <span>
            {moisPayes.length} mois
            {moisPayes.length > 0
              ? ` (du ${new Date(moisPayes[0].periode).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })} au ${new Date(moisPayes[moisPayes.length - 1].periode).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" })})`
              : ""}
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
    </main>
  );
}

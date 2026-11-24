import { deElide } from "@/lib/elision";
import { MarqueOrganisation } from "@/components/marque-organisation";
import { nomMarque, styleMarque } from "@/lib/marque-organisation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { emetteurAttestation, type EmetteurAttestationBrut } from "@/lib/attestation-emetteur";
import { chargerMarque } from "@/lib/marque-organisation-serveur";
import type { ReactNode } from "react";
import Link from "next/link";
import { verifierAccesEspaceLocataire } from "@/lib/espace";
import { eur, formaterDate, aujourdhuiParis } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { aEchoue, PanneLecture } from "@/app/locataire/[orgId]/panne-lecture";
import { interlocuteurDeLIdentite } from "@/lib/identite-contact-locataire";
import { completerIdentiteContact } from "@/lib/interlocuteur-locataire-serveur";
import type { BailLocataire } from "@/app/locataire/[orgId]/types";
import { loyerDuTermeEnCours, type RevisionDuLoyer } from "@/lib/baux";

// Le titre de l'onglet porte la marque de l'émetteur, jamais « Gerimmo »
// (25/09, D04 ; relevé à nouveau le 27/09).
export async function generateMetadata(
  props: PageProps<"/attestation-loyer/[orgId]">
): Promise<Metadata> {
  const { orgId } = await props.params;
  const marque = await chargerMarque(await createClient(), orgId).catch(() => null);
  return {
    title: marque ? `Attestation de bon paiement — ${nomMarque(marque)}` : "Attestation de bon paiement",
  };
}

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
  const { supabase, personne } = await verifierAccesEspaceLocataire(orgId);

  const marque = await chargerMarque(supabase, orgId);

  const [
    { data: baux, error: eBail },
    { data: echeancier, error: eEcheancier },
    { data: emetteurBrut, error: eEmetteur },
    { data: revisions },
  ] = await Promise.all([
    supabase.rpc("mon_bail_locataire", { p_org: orgId }),
    supabase.rpc("mon_echeancier_locataire", { p_org: orgId }),
    // L'identité de l'émetteur (27/09) : nom, adresse, qualité.
    supabase.rpc("attestation_emetteur_locataire", { p_org: orgId }),
    // Reprise du lot D2 (24/11) : les révisions du bail, pour attester le loyer du terme en cours et non un loyer révisé
    // qui ne s'applique pas encore. Lecture ratée : le loyer du bail s'affiche comme avant, sans annonce.
    supabase.rpc("revisions_de_mon_loyer_locataire", { p_org: orgId }),
  ]);
  // Une lecture tombée donnait ici le pire des écrans : un échéancier vide se
  // lit « après votre premier loyer réglé » — on annonçait à un locataire de
  // trois ans qu'il n'avait jamais payé. Un échec n'est pas un vide (11/09).
  const lectureKO = aEchoue(eBail, eEcheancier, eEmetteur);

  const bail = ((baux ?? []) as BailLocataire[])[0];
  const lignes = (echeancier ?? []) as {
    periode: string;
    montant_du: number;
    statut: string;
  }[];
  // Chez un propriétaire direct, le bailleur atteste ; chez une agence,
  // l'agence pour le compte du bailleur — avec l'adresse de l'un ou l'autre
  // (27/09). Sans identité complète, pas d'attestation.
  const emetteur = emetteurBrut ? emetteurAttestation(emetteurBrut as EmetteurAttestationBrut) : null;
  // Lot 47 : « gestionnaire » seulement dans un espace d'agence, lu dans la même identité que l'émetteur (et que le
  // titre « Mon gestionnaire » / « Mon bailleur » de l'espace). La panne le suivait déjà ; les deux refus disaient
  // « mon gestionnaire » dans tous les espaces. Reprise : sans émetteur lisible, le type de l'espace complète
  // l'identité, comme pour ce titre (`completerIdentiteContact`).
  const interlocuteur = interlocuteurDeLIdentite(await completerIdentiteContact(supabase, orgId, eEmetteur ? null : emetteurBrut));

  const aujourdhui = aujourdhuiParis();
  // « de juillet 2026 à septembre 2026 » — avec l'élision devant voyelle
  // (« d’août », « d’avril », « d’octobre », audit 09/09) : `deElide`.
  const moisLong = (periode: string) =>
    new Date(periode).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  // À jour = aucun mois échu impayé ou partiel (le mois « à échoir » ne compte pas)
  const moisEchus = lignes.filter((l) => l.statut !== "attendu");
  const enSouffrance = moisEchus.filter((l) => l.statut === "impaye" || l.statut === "partiel");
  const moisPayes = moisEchus.filter((l) => l.statut === "paye");
  // Loyer charges comprises : inconnu tant que rien n'est renseigné. `eur`
  // imprime « — » ; additionner deux absences donnerait un loyer de 0,00 €.
  // Reprise du lot D2 : tant que le premier terme révisé n'est pas commencé, le loyer attesté est celui du terme en cours.
  const duTerme = loyerDuTermeEnCours(
    bail?.loyer_hc ?? null,
    ((revisions ?? []) as (RevisionDuLoyer & { bail_id: string })[]).filter((r) => r.bail_id === bail?.bail_id),
    aujourdhui,
  );
  const loyerCc =
    bail && (duTerme.loyer !== null || bail.charges !== null)
      ? Number(duTerme.loyer ?? 0) + Number(bail.charges ?? 0)
      : null;

  let contenu: ReactNode;
  let delivrable = false;

  if (lectureKO) {
    // Ni attestation ni explication de refus : les deux seraient un mensonge
    // tant qu'on n'a pas pu lire l'échéancier.
    contenu = <PanneLecture quoi="votre attestation de bon paiement" interlocuteur={interlocuteur} />;
  } else if (!bail || moisEchus.length === 0) {
    contenu = (
      <div className="vide-guide">
        <p className="titre max-sm:pr-14">Pas encore d&apos;attestation à délivrer</p>
        <p className="explication">
          L&apos;attestation de bon paiement atteste des loyers déjà réglés :
          elle pourra être établie après votre premier loyer échu.
        </p>
      </div>
    );
  } else if (enSouffrance.length > 0) {
    contenu = (
      <div className="vide-guide">
        <p className="titre max-sm:pr-14">Attestation indisponible pour l&apos;instant</p>
        <p className="explication">
          {enSouffrance.length} loyer{enSouffrance.length > 1 ? "s" : ""} reste
          {enSouffrance.length > 1 ? "nt" : ""} dû{enSouffrance.length > 1 ? "s" : ""} sur
          votre échéancier. L&apos;attestation redeviendra disponible dès que
          votre compte sera soldé.
        </p>
        <div className="geste">
          <Link href={`/locataire/${orgId}/contact`} className="btn-or">
            Une difficulté ? Écrire à mon {interlocuteur}
          </Link>
        </div>
      </div>
    );
  } else if (!emetteur || emetteur.manquants.length > 0) {
    // Un document « fait pour valoir » sans auteur identifiable n'a pas de
    // valeur ([[Quittance conforme]]) : on ne le délivre pas à moitié.
    contenu = (
      <div className="vide-guide">
        <p className="titre max-sm:pr-14">Attestation indisponible pour l&apos;instant</p>
        <p className="explication">
          Vos loyers sont à jour, mais l&apos;attestation doit porter l&apos;identité
          complète de celui qui la signe
          {emetteur ? ` (il manque ${emetteur.manquants.join(", ")})` : ""}. Demandez à
          votre {interlocuteur} de la compléter.
        </p>
        <div className="geste">
          <Link href={`/locataire/${orgId}/contact`} className="btn-or">
            Écrire à mon {interlocuteur}
          </Link>
        </div>
      </div>
    );
  } else {
    delivrable = true;
    contenu = (
      <>
        {/* L'émetteur, en tête comme sur les documents générés (27/09). */}
        <div className="text-sm">
          <p className="font-semibold">{emetteur.nom}</p>
          <p className="text-muted-foreground">{emetteur.adresse}</p>
          {(emetteur.email || emetteur.siret) && (
            <p className="text-muted-foreground">
              {[emetteur.email, emetteur.siret && `SIRET ${emetteur.siret}`].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <p className="text-sm leading-relaxed">
          {emetteur.nom}, {emetteur.qualite}, atteste que{" "}
          <b className="font-semibold">{personne ? nomComplet(personne) : "le locataire"}</b>,
          locataire de <b className="font-semibold">{bail.lot_nom}</b>
          {bail.adresse ? ` — ${bail.adresse}` : ""}, est à jour du paiement de
          ses loyers et charges à la date d&apos;établissement de la présente
          attestation.
        </p>
        <div>
          <div className="ligne-info">
            <span>Loyer mensuel charges comprises</span>
            <span className="montant text-right" data-loyer-atteste>
              {eur(loyerCc)}
              {duTerme.aVenir && (
                <span className="block text-xs font-normal">
                  jusqu&apos;au terme {deElide(moisLong(duTerme.aVenir.dernierTermeAvant))} ;{" "}
                  {eur(duTerme.aVenir.loyer + Number(bail.charges ?? 0))} à compter du terme{" "}
                  {deElide(moisLong(duTerme.aVenir.premierTerme))} (révision annuelle du loyer)
                </span>
              )}
            </span>
          </div>
          <div className="ligne-info">
            <span>Mois réglés à ce jour</span>
            <span>
              {moisPayes.length} mois
              {moisPayes.length > 0 &&
                ` (${deElide(moisLong(moisPayes[0].periode))} à ${moisLong(
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
          Fait à {emetteur.ville}, le {formaterDate(aujourdhui)}.
        </p>
        {/* La signature de l'émetteur : zone à signer, sous son nom — comme
            les documents générés quand aucune signature n'est déposée. */}
        <div className="ml-auto w-56 text-center text-sm">
          <p className="text-xs text-muted-foreground">Signature</p>
          <div className="h-16 border-b border-border" />
          <p className="mt-1">{emetteur.nom}</p>
        </div>
        <p className="text-xs text-muted-foreground print:hidden">
          Ce document est établi automatiquement d&apos;après votre échéancier —
          utile pour un futur dossier de location.
        </p>
      </>
    );
  }

  // La marque du bandeau d'écran. Le locataire ne lit pas toujours la fiche de
  // l'organisation : à défaut, le bandeau porte le nom de celui qui atteste
  // (l'agence, ou le bailleur — jamais le nom interne du parc), comme la
  // coquille de son espace ; jamais « Gerimmo » (25/09, D04).
  const marqueEcran = marque ?? { name: emetteur?.nom ?? "Mon espace locataire" };

  // HABILLAGE D'ÉCRAN (Design System « Maison », 20/11), le même que celui de
  // la quittance : bandeau à la marque de l'émetteur, retour nommé au-dessus du
  // titre, titre à la taille commune, action principale, puis le document posé
  // sur sa feuille. CE QUI S'IMPRIME NE CHANGE PAS : la marque en tête, le
  // titre, la date et le texte de l'attestation, sans cadre ni fond — tout
  // l'habillage est réservé à l'écran (`print:hidden`, `[@media_screen]:`).
  return (
    <>
      <header className="bandeau-appli print:hidden">
        <div className="mx-auto flex w-full max-w-2xl items-center px-5 py-3 sm:px-8">
          <div className="max-w-[180px] min-w-0 overflow-hidden">
            <MarqueOrganisation marque={marqueEcran} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl space-y-6 p-5 sm:p-8" style={styleMarque(marque)}>
        {/* À l'impression, la marque reste l'en-tête du document. */}
        {marque && <div className="hidden max-w-[180px] print:block"><MarqueOrganisation marque={marque} /></div>}
        <div>
          {/* Retour nommé vers la page d'où s'ouvre l'attestation. Quand on
              vient de l'espace, le bandeau commun « Revenir à mon espace… »
              (ContinuiteEspace) y ramène déjà : ce lien s'efface pour ne pas
              le doubler. */}
          <Link href={`/locataire/${orgId}/loyers`} className="lien-discret inline-flex min-h-11 items-center text-sm print:hidden [html[data-depuis-espace]_&]:hidden">
            ← Mes paiements
          </Link>
          {/* Taille commune des titres d'écran, à l'écran seulement : le `!`
              est requis, la taille des h1 étant posée hors couche. */}
          <h1 className="[@media_screen]:!text-[length:var(--titre-1)]">Attestation de bon paiement</h1>
          {delivrable && (
            <p className="text-sm text-muted-foreground">Établie le {formaterDate(aujourdhui)}</p>
          )}
        </div>
        {delivrable ? (
          <>
            <div className="print:hidden">
              <BoutonImprimer libelle="Imprimer ou enregistrer en PDF" />
            </div>
            <div className="space-y-6 [@media_screen]:rounded-[var(--rayon-carte)] [@media_screen]:border [@media_screen]:border-[var(--filet)] [@media_screen]:bg-[var(--carte)] [@media_screen]:p-5 [@media_screen]:shadow-[var(--ombre-1)] sm:[@media_screen]:p-8">
              {contenu}
            </div>
          </>
        ) : (
          contenu
        )}
      </main>
    </>
  );
}

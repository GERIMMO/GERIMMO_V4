import { AideInvitation } from "@/components/aide-invitation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Metadata } from "next";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Card, CardContent } from "@/components/ui/card";
import { clientDeService } from "@/lib/supabase/service";
import { MESSAGES_LIEN_CAUTION_CLOS, echeanceLisible, lireLienCaution, type EtatLienCaution } from "@/lib/confirmation-mobile-caution";
import { FormulaireMobileCaution } from "./formulaire-mobile-caution";

// LA PAGE DU LIEN REÇU PAR LA CAUTION (décision du dirigeant du 23/10/2026) : elle lit qui lui demande quoi, puis saisit
// et confirme elle-même le numéro de mobile qui recevra le code de signature. L'ouverture de la page ne consomme rien
// (les messageries pré-ouvrent les liens) ; seul l'envoi du formulaire le fait.
//
// L'adresse porte le jeton : ni indexation, ni référent transmis, ni cache (next.config.ts pose `Cache-Control:
// no-store` sur /signature/caution/*). Un lien inconnu, annulé, expiré ou déjà utilisé ne dit rien du dossier ; un
// cautionnement électronique suspendu par réglage serveur le dit dès l'ouverture, sans formulaire.
//
// Décision du 24/10 : le garant qui signe aussi le BAIL reçoit un lien vers cette même page ; elle lui dit alors qu'il
// signe le bail en qualité de garant (sans s'y engager comme caution), sans montant d'engagement.
export const metadata: Metadata = {
  title: "Signature électronique — confirmer votre mobile",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

export default async function PageMobileCaution(props: PageProps<"/signature/caution/[jeton]">) {
  const { jeton } = await props.params;
  const service = clientDeService();
  let lien: EtatLienCaution | null = null;
  let indisponible = !service;
  if (service) {
    try { lien = await lireLienCaution(service, jeton); }
    catch { indisponible = true; }
  }

  // Ce choix de lien d’aide ne conditionne jamais la lecture ou la signature de l’acte.
  let connecte = false;
  if (lien?.etat !== "valide") {
    try { connecte = !!(await (await createClient()).auth.getUser()).data.user; }
    catch { /* L’aide publique reste disponible si la session ne peut pas être lue. */ }
  }
  const bail = lien?.etat === "valide" && lien.acte === "bail";
  return (
    <CoquilleAuth
      promesse={bail ? "Un bail à signer en ligne, en qualité de garant." : "Un acte de cautionnement à signer en ligne."}
      sousPromesse="Vous confirmez vous-même le numéro de mobile qui recevra votre code de signature : aucun autre numéro n’est utilisé."
      mention="Lien personnel, à usage unique"
      titre={lien?.etat === "valide" ? "Confirmer votre numéro de mobile" : lien?.etat === "utilise" ? "Votre numéro est déjà confirmé" : "Vérifier votre lien de signature"}
      largeur="420px"
    >
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          {indisponible || !lien ? (
            <><p role="alert" className="err !mb-0">Nous ne pouvons pas vérifier ce lien pour le moment.</p><Link href={`/signature/caution/${encodeURIComponent(jeton)}`} className="btn-secondaire">Réessayer</Link><AideInvitation suivi connecte={connecte} marque={null}/></>
          ) : lien.etat !== "valide" ? (
            <><p role="status">{MESSAGES_LIEN_CAUTION_CLOS[lien.etat]}</p><AideInvitation connecte={connecte} suivi={lien.etat === "utilise" || lien.etat === "suspendu"} marque={null}/></>
          ) : (
            <>
              {lien.essai && <p role="status" className="rounded-[var(--rayon-champ)] bg-warning-soft p-3 font-medium text-warning-soft-foreground">Essai technique sans engagement : {bail ? "le bail" : "l’acte"} et les invitations sont fictifs.</p>}
              <p>Bonjour {lien.garant.prenom} {lien.garant.nom},</p>
              <dl className="space-y-2 rounded-[var(--rayon-champ)] border border-[var(--filet)] bg-[var(--carte)] p-3">
                <div><dt className="text-xs text-muted-foreground">Qui vous le demande</dt><dd className="font-medium">{lien.bailleur}, bailleur</dd></div>
                {bail
                  ? <div><dt className="text-xs text-muted-foreground">Quoi</dt><dd>Signer le bail de {lien.locataires}, en qualité de garant : vous y reconnaissez avoir reçu un exemplaire du bail</dd></div>
                  : <div><dt className="text-xs text-muted-foreground">Quoi</dt><dd>Signer un acte de cautionnement{lien.solidaire ? " solidaire" : " simple"} pour {lien.locataires}</dd></div>}
                <div><dt className="text-xs text-muted-foreground">Logement</dt><dd>{lien.logement}</dd></div>
                {!bail && <div><dt className="text-xs text-muted-foreground">Montant maximal de votre engagement</dt><dd className="font-medium">{lien.montant ?? "indiqué dans l’acte"}</dd></div>}
              </dl>
              {bail ? (
                <p>
                  Vous lirez le bail en entier dans l’invitation de notre prestataire de signature, Zoho Sign, quand viendra votre tour de signer.
                  Signer le bail ne vous engage pas comme caution : seul l’acte de cautionnement, signé séparément, vous engage.
                </p>
              ) : (
                <p>
                  Vous lirez l’acte en entier, avec une copie du bail, dans l’invitation de notre prestataire de signature, Zoho Sign.
                  Vous y saisirez vous-même la mention de caution avant de signer. Rien ne vous engage tant que vous n’avez pas signé.
                </p>
              )}
              <p className="text-muted-foreground">Ce lien est valable jusqu’au {echeanceLisible(lien.expireLe)}.</p>
              <FormulaireMobileCaution jeton={jeton} />
            </>
          )}
        </CardContent>
      </Card>
    </CoquilleAuth>
  );
}

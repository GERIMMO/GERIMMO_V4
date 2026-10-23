import type { Metadata } from "next";
import { CoquilleAuth } from "@/components/coquille-auth";
import { Card, CardContent } from "@/components/ui/card";
import { clientDeService } from "@/lib/supabase/service";
import { echeanceLisible, lireLienCaution, type EtatLienCaution } from "@/lib/confirmation-mobile-caution";
import { FormulaireMobileCaution } from "./formulaire-mobile-caution";

// LA PAGE DU LIEN REÇU PAR LA CAUTION (décision du dirigeant du 23/10/2026) : elle lit qui lui demande quoi, puis saisit
// et confirme elle-même le numéro de mobile qui recevra le code de signature. L'ouverture de la page ne consomme rien
// (les messageries pré-ouvrent les liens) ; seul l'envoi du formulaire le fait.
//
// L'adresse porte le jeton : ni indexation, ni référent transmis, ni cache (next.config.ts pose `Cache-Control:
// no-store` sur /signature/caution/*). Un lien inconnu, annulé, expiré ou déjà utilisé ne dit rien du dossier.
export const metadata: Metadata = {
  title: "Acte de cautionnement — confirmer votre mobile",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

const MESSAGES_LIEN_CLOS: Record<Exclude<EtatLienCaution["etat"], "valide">, string> = {
  invalide: "Ce lien n’est pas valable. Vérifiez que vous avez ouvert le lien complet reçu par e-mail.",
  annule: "Ce lien n’est plus valable : une demande plus récente a pu le remplacer. Demandez au bailleur de vous en envoyer un nouveau.",
  utilise: "Ce lien a déjà servi. Votre numéro est confirmé : l’invitation à signer vous parvient par e-mail de la part de Zoho Sign.",
  expire: "Ce lien a expiré. Demandez au bailleur de vous en envoyer un nouveau.",
};

export default async function PageMobileCaution(props: PageProps<"/signature/caution/[jeton]">) {
  const { jeton } = await props.params;
  const service = clientDeService();
  let lien: EtatLienCaution | null = null;
  let indisponible = !service;
  if (service) {
    try { lien = await lireLienCaution(service, jeton); }
    catch { indisponible = true; }
  }

  return (
    <CoquilleAuth
      promesse="Un acte de cautionnement à signer en ligne."
      sousPromesse="Vous confirmez vous-même le numéro de mobile qui recevra votre code de signature : aucun autre numéro n’est utilisé."
      mention="Lien personnel, à usage unique"
      titre="Confirmer votre numéro de mobile"
      largeur="420px"
    >
      <Card>
        <CardContent className="space-y-4 pt-6 text-sm">
          {indisponible || !lien ? (
            <p role="alert">Le lien n’a pas pu être vérifié. Rechargez la page dans un instant.</p>
          ) : lien.etat !== "valide" ? (
            <p role="status">{MESSAGES_LIEN_CLOS[lien.etat]}</p>
          ) : (
            <>
              {lien.essai && <p role="status" className="rounded-xl bg-warning-soft p-3 font-medium">Essai technique sans engagement : l’acte et les invitations sont fictifs.</p>}
              <p>Bonjour {lien.garant.prenom} {lien.garant.nom},</p>
              <dl className="space-y-2 rounded-xl border border-border p-3">
                <div><dt className="text-xs text-muted-foreground">Qui vous le demande</dt><dd className="font-medium">{lien.bailleur}, bailleur</dd></div>
                <div><dt className="text-xs text-muted-foreground">Quoi</dt><dd>Signer un acte de cautionnement{lien.solidaire ? " solidaire" : " simple"} pour {lien.locataires}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Logement</dt><dd>{lien.logement}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Montant maximal de votre engagement</dt><dd className="font-medium">{lien.montant ?? "indiqué dans l’acte"}</dd></div>
              </dl>
              <p>
                Vous lirez l’acte en entier, avec une copie du bail, dans l’invitation de notre prestataire de signature, Zoho Sign.
                Vous y saisirez vous-même la mention de caution avant de signer. Rien ne vous engage tant que vous n’avez pas signé.
              </p>
              <p className="text-muted-foreground">Ce lien est valable jusqu’au {echeanceLisible(lien.expireLe)}.</p>
              <FormulaireMobileCaution jeton={jeton} />
            </>
          )}
        </CardContent>
      </Card>
    </CoquilleAuth>
  );
}

"use client";
import { SignatureElectroniqueBail } from "./signature-electronique-bail";
import { BoutonRetenirDevis } from "@/app/agence/[orgId]/incidents/formulaires-artisan";

export function SignatureDevisClient({orgId,devisId,raisonSociale}:{orgId:string;devisId:string;raisonSociale:string}) {
  return <SignatureElectroniqueBail orgId={orgId} bailId={devisId} selection={{code:"devis_artisan",cibleId:devisId}}
    apresSignature={<BoutonRetenirDevis orgId={orgId} devisId={devisId} raisonSociale={raisonSociale}/>}/>;
}

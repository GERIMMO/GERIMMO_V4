"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import { DOCUMENTS_ZOHO, type SelectionSignature } from "@/lib/politique-signature";
import { LIBELLE_SIGNATURE_ELECTRONIQUE } from "@/lib/textes-signature-actes";

// Décision du 24/11/2026 (Q11) : la signature électronique est proposée en premier. Ce bouton porte son nom en clair
// (il s'appelait « Signature Zoho · SMS ») et il est plein, pour se distinguer du bouton qui prépare le PDF à imprimer.

export function OuvrirSignatureDocument({orgId,selection}:{orgId:string;selection:SelectionSignature}) {
  const [ouvert,setOuvert]=useState(false);
  return <>
    <Button type="button" size="sm" data-signature-electronique onClick={()=>setOuvert(true)}>{LIBELLE_SIGNATURE_ELECTRONIQUE}</Button>
    {ouvert&&<Modale titre={DOCUMENTS_ZOHO[selection.code]} surtitre="Signature et preuves" large fermer={()=>setOuvert(false)}>
      <SignatureElectroniqueBail orgId={orgId} bailId={selection.cibleId} selection={selection}/>
    </Modale>}
  </>;
}

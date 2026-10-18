"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import { DOCUMENTS_ZOHO, type SelectionSignature } from "@/lib/politique-signature";

export function OuvrirSignatureDocument({orgId,selection}:{orgId:string;selection:SelectionSignature}) {
  const [ouvert,setOuvert]=useState(false);
  return <>
    <Button type="button" variant="outline" size="sm" onClick={()=>setOuvert(true)}>Signature Zoho · SMS</Button>
    {ouvert&&<Modale titre={DOCUMENTS_ZOHO[selection.code]} surtitre="Signature et preuves" large fermer={()=>setOuvert(false)}>
      <SignatureElectroniqueBail orgId={orgId} bailId={selection.cibleId} selection={selection}/>
    </Modale>}
  </>;
}

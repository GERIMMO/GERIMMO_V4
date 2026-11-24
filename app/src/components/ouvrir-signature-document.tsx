"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import { DOCUMENTS_ZOHO, type SelectionSignature } from "@/lib/politique-signature";
import { libelleBoutonSignature } from "@/lib/voie-signature";
import { useVoieSignature } from "@/components/voies-signature";

// Décision du 24/11/2026 (Q11) : la signature électronique est proposée en premier. Relecture du même jour (B1, B2) :
// seulement à qui peut s'en servir. Voie ouverte : bouton plein « Signature électronique ». Service fermé : bouton en
// contour, qui dit « en préparation » ou « suspendue ». Agence : le bouton d'avant, inchangé (lib/voie-signature.ts).
// L'ordre à l'écran : chaque écran écrit ce bouton DEUX fois, `place="avant"` puis `place="apres"` le geste papier (PDF à
// imprimer, grille…). Un seul des deux s'affiche : « avant » quand la voie est ouverte, « après » sinon.

// `enveloppe` : classe d'un bloc posé autour du bouton (il n'existe que si le bouton s'affiche : pas de bloc vide à l'écran).
export function OuvrirSignatureDocument({orgId,selection,place,enveloppe}:{orgId:string;selection:SelectionSignature;place?:"avant"|"apres";enveloppe?:string}) {
  const [ouvert,setOuvert]=useState(false);
  const voie=useVoieSignature(selection.code);
  if (place && (place==="avant")!==(voie==="ouverte")) return null;
  const bouton=<Button type="button" variant={voie==="ouverte"?"default":"outline"} size="sm" data-signature-electronique={voie} onClick={()=>setOuvert(true)}>{libelleBoutonSignature(voie)}</Button>;
  return <>
    {enveloppe===undefined?bouton:<div className={enveloppe}>{bouton}</div>}
    {ouvert&&<Modale titre={DOCUMENTS_ZOHO[selection.code]} surtitre="Signature et preuves" large fermer={()=>setOuvert(false)}>
      <SignatureElectroniqueBail orgId={orgId} bailId={selection.cibleId} selection={selection}/>
    </Modale>}
  </>;
}

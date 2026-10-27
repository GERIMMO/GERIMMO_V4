"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { LecteurDocument } from "@/components/lecteur-document";
export function ApercuDocumentPersonne({ fichier, titre }: { fichier: string; titre: string }) {
  const [ouvert, setOuvert] = useState(false);
  return <><Button type="button" variant="ghost" size="sm" aria-haspopup="dialog" onClick={() => setOuvert(true)}><Eye size={15} aria-hidden="true"/>Aperçu</Button>
    {ouvert && <Modale titre={titre} tresLarge fermer={() => setOuvert(false)}><LecteurDocument fichier={fichier} titre={titre} mime={null} presentation="fiche"/></Modale>}
  </>;
}

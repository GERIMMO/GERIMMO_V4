"use client";
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modale } from "@/components/ui/modale";
import { LecteurDocument } from "@/components/lecteur-document";

/** Le lecteur appelle la route de l'espace : ses contrôles d’accès restent obligatoires. */
export function ApercuDocumentEspace({ fichier, titre, mime = null }: { fichier: string; titre: string; mime?: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  return <><Button type="button" size="sm" variant="outline" aria-label={`Aperçu : ${titre}`} aria-haspopup="dialog" onClick={() => setOuvert(true)}><Eye size={16} aria-hidden="true"/>Aperçu</Button>
    {ouvert && <Modale titre={titre} tresLarge fermer={() => setOuvert(false)}><LecteurDocument fichier={fichier} titre={titre} mime={mime} presentation="fiche"/></Modale>}
  </>;
}

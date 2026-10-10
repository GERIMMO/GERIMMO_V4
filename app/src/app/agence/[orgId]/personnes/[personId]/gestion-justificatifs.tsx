"use client";
import { useState, type ReactNode } from "react";
import { Upload, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GestionJustificatifsPersonne({ depot, demandes, enAttente }: { depot: ReactNode; demandes?: ReactNode; enAttente: number }) {
  const [onglet, setOnglet] = useState<"depot" | "demandes">(enAttente ? "demandes" : "depot");
  return <div className="space-y-4 border-t border-border pt-4">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Gérer les justificatifs">
      <Button type="button" variant={onglet==="depot" ? "default" : "outline"} aria-pressed={onglet==="depot"} onClick={()=>setOnglet("depot")}><Upload size={16} aria-hidden="true" />Déposer un document</Button>
      {demandes && <Button type="button" variant={onglet==="demandes" ? "default" : "outline"} aria-pressed={onglet==="demandes"} onClick={()=>setOnglet("demandes")}><Send size={16} aria-hidden="true" />Demandes de documents{enAttente>0 ? ` · ${enAttente} en attente` : ""}</Button>}
    </div>
    <div hidden={onglet!=="depot"}>{depot}</div>
    {demandes && <div id="demandes-justificatifs" hidden={onglet!=="demandes"}>{demandes}</div>}
  </div>;
}

"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
const Contexte = createContext<{facture:string|null;selectionner:(id:string|null)=>void}>({facture:null,selectionner:()=>{}});
export function ParcoursDepense({children}:{children:ReactNode}) {
  const [facture,selectionner]=useState<string|null>(null);
  return <Contexte.Provider value={{facture,selectionner}}>{children}</Contexte.Provider>;
}
export const useParcoursDepense=()=>useContext(Contexte);
export function DetailFacture({id,children}:{id:string;children:ReactNode}) {
  const {facture,selectionner}=useParcoursDepense();
  const [ouvert,ouvrir]=useState(false);
  return <details open={ouvert||facture===id} onToggle={e=>{ouvrir(e.currentTarget.open);if(!e.currentTarget.open&&facture===id)selectionner(null);}}><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">Gérer cette facture et les décomptes</summary>{children}</details>;
}

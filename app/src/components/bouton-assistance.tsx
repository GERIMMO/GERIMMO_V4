"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { ecranSansDonnees } from "@/lib/retours";

export function BoutonAssistance(){
 const chemin=usePathname();const [action,setAction]=useState('navigation');
 const visible=/^\/(agence|locataire|artisan|admin|espaces)(\/|$)/.test(chemin);
 useEffect(()=>{
  if(!visible)return;
  const clic=(event:MouseEvent)=>{
   const cible=event.target instanceof Element?event.target:null;
   if(!cible||cible.closest('[data-assistance]'))return;
   if(cible.closest('button'))setAction('bouton');else if(cible.closest('a'))setAction('lien');
  };
  const saisie=()=>setAction('saisie');const envoi=()=>setAction('formulaire');
  document.addEventListener('click',clic);document.addEventListener('input',saisie);document.addEventListener('submit',envoi);
  return()=>{document.removeEventListener('click',clic);document.removeEventListener('input',saisie);document.removeEventListener('submit',envoi);};
 },[visible,chemin]);
 if(!visible)return null;
 return <Link data-assistance href={`/assistance?ecran=${encodeURIComponent(ecranSansDonnees(chemin))}&action=${action}`}
  aria-label="Aide et retours"
  className="fixed right-3 bottom-20 z-30 flex size-11 items-center justify-center gap-2 rounded-full border border-[var(--filet)] bg-[var(--ivoire)] text-sm font-medium text-[var(--encre)] shadow-sm hover:border-[var(--or)] sm:size-auto sm:min-h-11 sm:px-4 sm:right-5 sm:bottom-5">
  {/* Sur téléphone, l'icône seule : le libellé recouvrait des gestes
      (« Régler », « Devis retenu », un champ du signalement — audit du 20/09). */}
  <MessageSquarePlus className="size-4" aria-hidden/><span className="hidden sm:inline">Aide et retours</span>
 </Link>;
}

"use client";
import { useState,useTransition } from "react";
import { verifierPageArchives } from "@/app/actions/conservation-signatures";
const MOTIFS:Record<string,string>={archives_verifiees:"PDF et certificat : tailles et empreintes vérifiées",circuit_non_archive:"Archivage incomplet",certificat_manquant:"Certificat d’un signataire manquant",certificat_distinct_manquant:"Le certificat doit être distinct du contrat",archive_introuvable:"Archive introuvable",rattachement_incoherent:"Rattachement au dossier à vérifier",archive_deja_purgee:"Archive déjà retirée selon sa conservation",metadonnees_incompletes:"Informations de l’archive à vérifier",fichier_absent_ou_taille_incorrecte:"Fichier absent ou taille différente",empreinte_incorrecte:"Contenu différent de l’empreinte enregistrée",lecture_indisponible:"Lecture indisponible — reprendre le contrôle"};
export function ControleArchivesSignatures(){
  const [etat,setEtat]=useState<Awaited<ReturnType<typeof verifierPageArchives>>|null>(null);
  const [erreur,setErreur]=useState<string|null>(null);
  const [enCours,lancer]=useTransition();
  const controler=(suite?:string)=>lancer(async()=>{
    setErreur(null);
    try {
      const resultat=await verifierPageArchives(suite);
      if(resultat.erreur)setErreur(resultat.erreur);
      else setEtat(resultat);
    } catch {
      setErreur("Contrôle interrompu. Réessayez ; aucune suppression n’a été lancée.");
    }
  });
  return <section id="archives" aria-busy={enCours} className="loc-carte space-y-4">
    <div><p className="eyebrow">Conservation des signatures</p><h2>Vérifier les archives avant de retirer une copie</h2></div>
    <p className="text-sm text-muted-foreground">Gerimmo relit le PDF signé et le certificat de chaque signataire, puis compare leurs tailles et leurs empreintes. Cinq dossiers au maximum par passage ; les certificats partagés sont vérifiés une seule fois.</p>
    <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] p-4 text-sm"><strong>Suppression chez Zoho en attente de validation</strong><p className="mt-1">Il reste à valider la durée, son point de départ et les éventuelles obligations de conservation. Ce contrôle ne supprime rien chez Zoho ni dans Gerimmo. Une corbeille ne prouve pas un effacement définitif.</p></div>
    <div className="flex flex-wrap gap-3"><button className="btn-secondaire" disabled={enCours} onClick={()=>controler()}>{enCours?"Vérification des archives…":"Vérifier les archives"}</button>{etat?.suite&&<button className="btn-secondaire" disabled={enCours} onClick={()=>controler(etat.suite!)}>Vérifier les dossiers suivants</button>}</div>
    {erreur&&<p role="alert" className="err">{erreur}{etat?.resultats&&" Les résultats précédents restent affichés."}</p>}
    {etat?.resultats&&<div role="status" className="space-y-2 text-sm"><p>{etat.resultats.length===0?"Aucun circuit Zoho terminé à contrôler sur ce passage.":`${etat.resultats.length} dossier(s) contrôlé(s) sur ce passage. Aucun fichier supprimé.`}</p><ul className="divide-y">{etat.resultats.map(r=><li key={r.reference} className="py-2"><strong>Dossier {r.reference}</strong> · {r.ok?"Vérifié":"À examiner"}<p className="text-muted-foreground">{MOTIFS[r.motif]??"Résultat à examiner"}</p></li>)}</ul>{!etat.journalise&&<p className="err">Résultat affiché, mais enregistrement du contrôle indisponible.</p>}</div>}
  </section>;
}

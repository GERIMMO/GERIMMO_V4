"use client";
import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import styles from "../pilotage.module.css";
export type MissionCard = { id:string; name:string; team:string; state:"ok"|"attention"|"pause"|"unknown"; content:ReactNode };
export function FiltreMissions({ items }: { items:MissionCard[] }) {
 const [filter,setFilter]=useState("all");const [query,setQuery]=useState("");
 const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr");
 const visible=items.filter(i=>(filter==="all"||i.state===filter)&&normalize(i.name+" "+i.team).includes(normalize(query.trim())));
 return <><div className={styles.filters}>{[{id:"all",label:"Toutes"},{id:"attention",label:"À vérifier"},{id:"ok",label:"À l’heure"},{id:"pause",label:"En pause"},{id:"unknown",label:"Indisponibles"}].map(f=><button type="button" key={f.id} aria-pressed={filter===f.id} onClick={()=>setFilter(f.id)}>{f.label}<span>{f.id==="all"?items.length:items.filter(i=>i.state===f.id).length}</span></button>)}<label className={styles.search}><Search size={16} aria-hidden="true"/><span className="sr-only">Rechercher une tâche</span><input type="search" placeholder="Tâche ou équipe…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><p className={styles.note} role="status">{visible.length} tâche{visible.length>1?"s":""} affichée{visible.length>1?"s":""}</p><div className={`${styles.missions} mt-4`}>{visible.map(i=><div key={i.id}>{i.content}</div>)}</div>{!visible.length&&<div className={styles.empty}><div><h3>Aucune tâche dans cette sélection</h3><p>Essayez un autre nom ou revenez à toutes les tâches.</p><button type="button" className="btn-secondaire mt-3" onClick={()=>{setFilter("all");setQuery("");}}>Effacer les filtres</button></div></div>}</>;
}

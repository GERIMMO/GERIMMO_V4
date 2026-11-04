import Link from "next/link";
import { Building2, Layers3 } from "lucide-react";

export function NavigationBiens({biens, selection, chemin, parametres={}}:{biens:{id:string;nom:string;archived_at?:string|null}[];selection?:string;chemin:string;parametres?:Record<string,string>}) {
  const href=(id:string)=>{const p=new URLSearchParams(parametres);if(id)p.set("bien",id);else p.delete("bien");return `${chemin}${p.size?`?${p}`:""}`};
  return <nav aria-label="Classer par bien" className="flex gap-2 overflow-x-auto pb-2">
    {[{id:"",nom:"Tous les biens"},...biens].map(b=><Link key={b.id} href={href(b.id)} aria-current={(selection||"")===b.id?"page":undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm ${(selection||"")===b.id?"border-primary bg-primary text-primary-foreground":"border-border bg-card hover:bg-muted"}`}>
      {b.id?<Building2 size={17} aria-hidden="true"/>:<Layers3 size={17} aria-hidden="true"/>}{b.nom}{"archived_at" in b&&b.archived_at?" (retiré)":""}
    </Link>)}
  </nav>;
}

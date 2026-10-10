import Link from "next/link";
import { Wrench, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formaterDate } from "@/lib/ged";
import { COULEURS_INTERVENTION, STATUTS_INTERVENTION } from "./referentiel";

type Mission = { id: string; artisan_id: string; incident_id: string; statut: string; confiee_le: string; terminee_le: string | null };

export async function CarnetProprietaire({ orgId }: { orgId: string }) {
  const supabase = await createClient();
  const missions: Mission[] = [];
  let erreur = false;
  // Lire tout l'historique, y compris au-delà de la limite PostgREST.
  for (let debut = 0; ; debut += 500) {
    const { data, error } = await supabase.from("incident_interventions")
      .select("id,artisan_id,incident_id,statut,confiee_le,terminee_le")
      .eq("organization_id", orgId).order("confiee_le", { ascending: false }).order("id")
      .range(debut, debut + 499);
    if (error) { erreur = true; break; }
    missions.push(...(data ?? []) as Mission[]);
    if ((data?.length ?? 0) < 500) break;
  }
  const groupes = new Map<string, Mission[]>();
  for (const mission of missions) groupes.set(mission.artisan_id, [...(groupes.get(mission.artisan_id) ?? []), mission]);
  const ids = [...groupes.keys()];
  const profils = new Map<string, { raison_sociale: string; telephone: string | null; email: string | null }>();
  let erreurProfils = false;
  for (let debut = 0; debut < ids.length; debut += 100) {
    const { data, error } = await supabase.from("artisans").select("id,raison_sociale,telephone,email").in("id", ids.slice(debut, debut + 100));
    if (error) erreurProfils = true;
    for (const profil of data ?? []) profils.set(profil.id, profil);
  }
  return <main className="mx-auto w-full max-w-5xl flex-1 space-y-5 p-4 sm:p-7">
    <div className="entete-page"><div><h1>Mon carnet d’artisans</h1><p className="mt-2 text-sm text-muted-foreground">Les artisans auxquels vous avez fait appel et le suivi de leurs interventions.</p></div><Link href={`/agence/${orgId}/reseau`} className="btn-secondaire">Consulter le réseau</Link></div>
    {erreur ? <p role="alert" className="err">Votre historique n’a pas pu être chargé. Rechargez la page.</p> : !missions.length ? <section className="loc-carte py-10 text-center"><History aria-hidden="true" className="mx-auto mb-3 text-[var(--or-texte)]" size={30} /><h2 className="font-heading text-xl">Aucune intervention pour le moment</h2><p className="mt-2 text-sm text-muted-foreground">Votre carnet se complète automatiquement lorsqu’une intervention est confiée à un artisan.</p><Link className="btn-secondaire mt-5 inline-flex" href={`/agence/${orgId}/incidents`}>Voir mes incidents</Link></section> : <>
      {erreurProfils && <p role="alert" className="err">Certaines coordonnées sont indisponibles. L’historique reste consultable.</p>}
      {[...groupes].map(([id, historique]) => {
        const profil = profils.get(id);
        return <section key={id} className="loc-carte space-y-4"><div className="flex items-start gap-3"><span className="rounded-xl bg-[var(--marque-clair)] p-3 text-[var(--marque-sombre)]"><Wrench size={20} aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words font-heading text-lg">{profil?.raison_sociale ?? "Artisan — fiche indisponible"}</h2><p className="mt-1 break-words text-sm text-muted-foreground">{[profil?.telephone, profil?.email].filter(Boolean).join(" · ") || "Coordonnées indisponibles"}</p></div></div>
          <details><summary className="cursor-pointer py-2 text-sm font-medium">Historique · {historique.length} intervention{historique.length > 1 ? "s" : ""}</summary><ul className="divide-y divide-[var(--filet)]">{historique.map((mission) => <li key={mission.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><Link className="font-medium underline underline-offset-4" href={`/agence/${orgId}/incidents?sel=${mission.incident_id}`}>Consulter l’intervention</Link><p className="mt-1 text-xs text-muted-foreground">Confiée le {formaterDate(mission.confiee_le)}{mission.terminee_le && ` · Terminée le ${formaterDate(mission.terminee_le)}`}</p></div><span className={COULEURS_INTERVENTION[mission.statut] ?? "puce puce-grise"}>{STATUTS_INTERVENTION[mission.statut] ?? mission.statut}</span></li>)}</ul></details>
        </section>;
      })}
    </>}
  </main>;
}

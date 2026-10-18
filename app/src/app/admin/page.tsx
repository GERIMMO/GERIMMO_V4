import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { Plus, RefreshCw, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { dateParis } from "@/lib/tarifs";
import { formaterDateHeureParis } from "@/lib/heure-paris";
import type { FinancialSnapshot } from "@/lib/finances-supervision";
import { Tresorerie } from "./tresorerie";
import { FinanceDashboard } from "./finances";
import base from "./repertoires.module.css";
import styles from "./finances.module.css";

export const metadata = { title: "Abonnements et finances — Gerimmo" };

export default async function PageAdmin({searchParams}: {searchParams:Promise<Record<string,string|undefined>>}) {
  const p=await searchParams;
  const supabase = await createClient();
  const [finance, budget] = await Promise.all([
    supabase.rpc("supervision_finances"),
    supabase.from("marketing_reglages").select("budget_mensuel_cents").eq("singleton", true).maybeSingle(),
  ]);
  const snapshot = finance.data as FinancialSnapshot | null;
  const unavailable = Boolean(finance.error) || !snapshot || !Array.isArray(snapshot.organisations);
  const accounts = unavailable ? [] : snapshot!.organisations;
  const partial = !unavailable && snapshot!.total > accounts.length;
  const now = new Date();
  return <main className={base.page}>
    <header className={base.header}><div><p className={base.eyebrow}>PILOTAGE FINANCIER DE GERIMMO</p><TitreEcran rubrique="supervision">Abonnements et finances</TitreEcran><p className={base.subtitle}>Vos revenus récurrents, vos clients et les échéances à surveiller, au même endroit.</p></div><div className={styles.headerActions}><a href="/admin" className="btn-secondaire"><RefreshCw size={15} aria-hidden="true" />Actualiser</a><Link href="/admin/organisations/nouvelle" className="btn-or"><Plus size={16} aria-hidden="true" />Ouvrir une organisation</Link></div></header>
    <p className={styles.snapshot}>{unavailable ? "Lecture des abonnements indisponible" : `${snapshot!.total} organisation${snapshot!.total > 1 ? "s" : ""} · Vue chargée le ${formaterDateHeureParis(now)} (Paris)`}</p>
    {(unavailable || partial) && <div className={base.notice} role="alert"><TriangleAlert size={20} aria-hidden="true" /><p><strong>{unavailable ? "Les données d’abonnement n’ont pas pu être chargées." : `Vue partielle : ${accounts.length} organisations chargées sur ${snapshot!.total}.`}</strong><span>{unavailable ? "Les indicateurs restent indisponibles. Rechargez la page pour réessayer." : "Les indicateurs et les listes portent uniquement sur ces organisations."}</span></p></div>}
    <Tresorerie p={p}/>
    <FinanceDashboard accounts={accounts} today={dateParis(now)} unavailable={unavailable} partial={partial} budget={budget.error ? null : budget.data?.budget_mensuel_cents ?? null} />
  </main>;
}

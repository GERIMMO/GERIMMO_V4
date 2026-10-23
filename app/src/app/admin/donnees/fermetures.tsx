import { createClient } from "@/lib/supabase/server";
import { formaterDateHeureParis, formaterDateParis } from "@/lib/heure-paris";
import { euros } from "@/lib/tarifs";
import { GestesFermeture } from "./gestes-fermeture";

type Fermeture = {
  id: string;
  account_id: string;
  origine: "titulaire" | "super_admin" | "inactivite";
  choix: "fin_periode" | "j14_prorata" | null;
  statut: "programmee" | "executee" | "annulee";
  programmee_le: string;
  effacement_prevu_le: string;
  gel_motif: string | null;
  tentatives: number;
  derniere_erreur: string | null;
  executee_le: string | null;
  mode_effacement: "suppression" | "neutralisation" | null;
  bilan_execution: { demandes_zoho?: string[]; organisations_effacees?: string[]; archives?: number } | null;
  remboursement_prevu_cents: number | null;
  remboursement_cents: number | null;
  courriel_envoye_le: string | null;
  annulation_motif: string | null;
};

const ORIGINES = { titulaire: "Demande du titulaire", super_admin: "Demande traitée par la supervision", inactivite: "Compte inactif prévenu deux fois" } as const;
const CHOIX = { fin_periode: "fin de la période payée", j14_prorata: "quatorze jours, remboursement au prorata" } as const;

/** L'instant d'il y a trente jours (fenêtre des fermetures récentes). */
function ilYaTrenteJours(): string {
  return new Date(Date.now() - 30 * 86_400_000).toISOString();
}

/** Les fermetures programmées, et celles exécutées ou annulées depuis trente jours. */
export async function FermeturesComptes() {
  const db = await createClient();
  const depuis = ilYaTrenteJours();
  const r = await db.from("fermetures_comptes")
    .select("id,account_id,origine,choix,statut,programmee_le,effacement_prevu_le,gel_motif,tentatives,derniere_erreur,executee_le,mode_effacement,bilan_execution,remboursement_prevu_cents,remboursement_cents,courriel_envoye_le,annulation_motif")
    .or(`statut.eq.programmee,programmee_le.gte.${depuis}`)
    .order("effacement_prevu_le", { ascending: true }).limit(100);
  const liste = (r.data ?? []) as Fermeture[];
  return <section id="fermetures" aria-labelledby="titre-fermetures" className="loc-carte space-y-4">
    <div><p className="eyebrow">Fermeture des comptes</p><h2 id="titre-fermetures">Fermetures programmées et exécutées</h2></div>
    <p className="text-sm text-muted-foreground">L’effacement s’exécute la nuit de la date d’effet, après la sauvegarde du jour : preuve d’un contrat payé archivée, espace et fichiers effacés (ou la seule adhésion s’il reste d’autres gérants), dossiers d’autres propriétaires détachés et propriétaires prévenus, compte supprimé ou neutralisé. Le courriel de fin part la nuit même.</p>
    {r.error ? <p role="alert" className="err">Lecture indisponible : aucune fermeture ne peut être confirmée.</p>
      : liste.length === 0 ? <p className="text-sm">Aucune fermeture programmée ni récente.</p>
      : <ul className="divide-y">{liste.map((f) => <li key={f.id} className="space-y-2 py-3 text-sm">
        <p><strong>Compte {f.account_id.slice(0, 8).toUpperCase()}</strong> · {ORIGINES[f.origine]}{f.choix ? ` · ${CHOIX[f.choix]}` : ""}</p>
        {f.statut === "programmee" && <>
          <p>Effacement prévu dans la nuit du {formaterDateParis(f.effacement_prevu_le)}{f.remboursement_prevu_cents ? ` · remboursement prévu ${euros(Number(f.remboursement_prevu_cents))}` : ""}.</p>
          {f.gel_motif && <p className="text-destructive">Gelée : {f.gel_motif}</p>}
          {f.derniere_erreur && <p className="text-destructive">Dernière tentative en échec ({f.tentatives}) : {f.derniere_erreur}</p>}
          <GestesFermeture id={f.id} gelee={f.gel_motif !== null} />
        </>}
        {f.statut === "executee" && <>
          <p>Exécutée le {formaterDateHeureParis(f.executee_le)} · {f.mode_effacement === "neutralisation" ? "compte neutralisé (une référence subsiste ; suppression définitive dès qu’elle disparaît)" : "compte supprimé"} · courriel {f.courriel_envoye_le ? `envoyé le ${formaterDateHeureParis(f.courriel_envoye_le)}` : "à envoyer cette nuit"}{f.remboursement_cents ? ` · remboursé ${euros(Number(f.remboursement_cents))}` : ""}.</p>
          {(f.bilan_execution?.demandes_zoho ?? []).length > 0 && <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-2">À traiter chez Zoho (copies des documents signés) : {f.bilan_execution!.demandes_zoho!.join(", ")}</p>}
        </>}
        {f.statut === "annulee" && <p className="text-muted-foreground">Annulée{f.annulation_motif ? ` : ${f.annulation_motif}` : ""}.</p>}
      </li>)}</ul>}
  </section>;
}

/** Les comptes qui ont déjà une fermeture programmée (pour ne pas en proposer une seconde). */
export async function comptesAvecFermetureProgrammee(): Promise<Set<string>> {
  const db = await createClient();
  const { data } = await db.from("fermetures_comptes").select("account_id").eq("statut", "programmee");
  return new Set(((data ?? []) as { account_id: string }[]).map((l) => l.account_id));
}

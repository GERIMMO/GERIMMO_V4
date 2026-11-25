import Link from "next/link";
import { notFound } from "next/navigation";
import { TitreEcran } from "@/components/titre-ecran";
import { verifierAccesEspace } from "@/lib/espace";
import { aujourdhuiParis } from "@/lib/ged";
import { baseEspace } from "@/lib/racine-espace";
import { lireToutesLesPages } from "@/lib/lecture-complete";
import type { AppelOuvert, EncaissementConnu } from "@/lib/pointage-loyers";
import { PointageReleve } from "./pointage-releve";

export const metadata = { title: "Pointer mes loyers — Gerimmo" };

/** Les règlements des treize derniers mois suffisent à reconnaître ce qui est déjà enregistré d'un relevé récent. */
const JOURS_RELUS = 400;

/**
 * POINTER MES LOYERS AVEC UN RELEVÉ DE BANQUE (audit palier 1, P2-05).
 *
 * Le propriétaire donne le relevé exporté par sa banque ; l'écran le lit SUR SON APPAREIL, rapproche chaque somme
 * reçue des loyers qui restent à recevoir, et n'enregistre que ce qu'il confirme. La page ne fait que préparer ce
 * dont l'écran a besoin pour comparer : les loyers ouverts et les règlements déjà connus.
 *
 * Écran du propriétaire bailleur seulement (palier 1) : la fonction qui enregistre lui est réservée.
 */
export default async function PagePointage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const { supabase, estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();
  const base = baseEspace(orgId, estProprietaire);
  const aujourdHui = aujourdhuiParis();
  const depuis = new Date(Date.parse(`${aujourdHui}T00:00:00Z`) - JOURS_RELUS * 86_400_000).toISOString().slice(0, 10);

  const [loyers, reglements] = await Promise.all([
    supabase.rpc("rappels_loyers_proprietaire", { p_org: orgId }).limit(1000),
    lireToutesLesPages<{ id: string; bail_id: string; montant: number | string; date_paiement: string; cle_envoi: string | null }>(
      (debut, fin) =>
        supabase
          .from("encaissements")
          .select("id,bail_id,montant,date_paiement,cle_envoi", { count: "exact" })
          .eq("organization_id", orgId)
          .gte("date_paiement", depuis)
          .order("date_paiement")
          .order("id")
          .range(debut, fin),
      (e) => e.id,
    ),
  ]);
  const lignes = (loyers.data ?? []) as {
    appel_id: string; bail_id: string; lot_nom: string; locataire: string | null;
    periode: string; date_echeance: string; montant_du: number | string; montant_couvert: number | string;
  }[];
  // Une lecture coupée ou en échec ne doit pas se présenter comme « rien à pointer ».
  const illisible = Boolean(loyers.error) || lignes.length >= 1000 || reglements.echec !== null;
  const appels: AppelOuvert[] = lignes.map((l) => ({
    appelId: l.appel_id,
    bailId: l.bail_id,
    lotNom: l.lot_nom,
    locataire: l.locataire,
    periode: String(l.periode).slice(0, 10),
    echeance: String(l.date_echeance).slice(0, 10),
    resteCentimes: Math.round(Number(l.montant_du) * 100) - Math.round(Number(l.montant_couvert) * 100),
  }));
  const encaissements: EncaissementConnu[] = (reglements.lignes ?? []).map((e) => ({
    bailId: e.bail_id,
    centimes: Math.round(Number(e.montant) * 100),
    date: String(e.date_paiement).slice(0, 10),
    cle: e.cle_envoi,
  }));

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-7">
      <div>
        <Link
          href={`${base}/loyers#loyers`}
          className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline"
        >
          ← Finances
        </Link>
        <div className="entete-page">
          <TitreEcran rubrique="finances">Pointer mes loyers</TitreEcran>
          <span className="mono-discret">Avec un relevé de banque</span>
        </div>
        <p className="mesure-lecture text-sm text-muted-foreground">
          Donnez le relevé de compte exporté depuis le site de votre banque : Gerimmo rapproche les sommes reçues des
          loyers qui restent à recevoir, et n&rsquo;enregistre que ce que vous confirmez.
        </p>
      </div>
      {illisible ? (
        <p className="err" role="alert">
          Impossible de lire vos loyers à recevoir pour le moment. Rien n&rsquo;a été modifié : rechargez la page, ou
          confirmez vos loyers depuis le tableau de bord.
        </p>
      ) : (
        <PointageReleve orgId={orgId} base={base} appels={appels} encaissements={encaissements} aujourdHui={aujourdHui} />
      )}
    </main>
  );
}

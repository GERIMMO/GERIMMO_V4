import { notFound } from "next/navigation";
import { RecapitulatifFiscal } from "@/components/recapitulatif-fiscal";
import { verifierAccesEspace } from "@/lib/espace";
// Le titre n'est posé que si la page s'ouvre (audit final, UX-14) : en agence, l'onglet disait « Récapitulatif fiscal »
// sur « Cette page est introuvable ». Même garde que RecapitulatifFiscal ; verifierAccesEspace est sous cache().
export async function generateMetadata(props: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await props.params;
  const { estProprietaire } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();
  return { title: "Récapitulatif fiscal — Gerimmo" };
}
export default function PageFiscal(props: { params: Promise<{ orgId: string }>; searchParams: Promise<{ annee?: string; bien?: string }> }) {
  return <RecapitulatifFiscal {...props} />;
}

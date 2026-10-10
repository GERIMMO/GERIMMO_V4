import { RecapitulatifFiscal } from "@/components/recapitulatif-fiscal";
export const metadata = { title: "Récapitulatif fiscal — Gerimmo" };
export default function PageFiscal(props: { params: Promise<{ orgId: string }>; searchParams: Promise<{ annee?: string; bien?: string }> }) {
  return <RecapitulatifFiscal {...props} />;
}

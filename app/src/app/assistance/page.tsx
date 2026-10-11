import { ContenuAssistance, type ParametresAssistance } from "./contenu-assistance";
export const metadata = { title: "Aide et retours — Gerimmo" };
export default function PageAssistance({ searchParams }: { searchParams: Promise<ParametresAssistance> }) {
  return <ContenuAssistance searchParams={searchParams} />;
}

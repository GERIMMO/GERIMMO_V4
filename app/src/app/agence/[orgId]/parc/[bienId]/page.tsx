import { FicheBien } from "./fiche-bien";

export const metadata = { title: "Fiche bien — Gerimmo" };

export default async function PageBien(props: PageProps<"/agence/[orgId]/parc/[bienId]">) {
  const { orgId, bienId } = await props.params;
  const { decompte, lot } = await props.searchParams;
  return <FicheBien lotFacture={typeof lot === "string" ? lot : undefined} decompte={typeof decompte === "string" ? decompte : undefined} orgId={orgId} bienId={bienId} />;
}

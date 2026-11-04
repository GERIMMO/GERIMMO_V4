import { FicheBien } from "./fiche-bien";

export const metadata = { title: "Fiche bien — Gerimmo" };

export default async function PageBien(props: PageProps<"/agence/[orgId]/parc/[bienId]">) {
  const { orgId, bienId } = await props.params;
  return <FicheBien orgId={orgId} bienId={bienId} />;
}

import { notFound } from "next/navigation";
import { verifierAccesEspace } from "@/lib/espace";
import { ContenuAssistance, type ParametresAssistance } from "@/app/assistance/contenu-assistance";
import { AideProprietaire } from "./aide-proprietaire";
import styles from "./aide.module.css";

export const metadata = { title: "Aide — Gerimmo" };

export default async function PageFaqProprietaire(props: PageProps<"/agence/[orgId]/faq">) {
  const { orgId } = await props.params;
  const { estProprietaire, organisation } = await verifierAccesEspace(orgId);
  if (!estProprietaire) notFound();
  const recherche = await props.searchParams;
  const params: ParametresAssistance = {};
  for (const cle of ["ecran", "action", "type", "sel", "vue", "page", "pageIdees", "retour"] as const) {
    if (typeof recherche[cle] === "string") params[cle] = recherche[cle];
  }
  params.ecran ??= "/espace/[dossier]/faq";
  return <main className={`mx-auto w-full space-y-7 p-4 sm:p-7 ${styles.page}`}>
    <AideProprietaire orgId={orgId} nom={organisation.name} assistance="#nouvelle" />
    <ContenuAssistance orgIdIntegre={orgId} searchParams={Promise.resolve(params)} />
  </main>;
}

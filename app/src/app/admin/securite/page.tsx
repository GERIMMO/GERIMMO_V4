import { ConsoleSection } from "@/components/console-section";
import { ControlesSecurite } from "./controles";
import Link from "next/link";
import { TitreEcran } from "@/components/titre-ecran";
import { ShieldCheck, UsersRound, BookOpenCheck, History, ArrowRight, DatabaseBackup } from "lucide-react";

export const metadata = { title: "Sécurité et conformité" };

const acces = [
  { titre: "Demandes sur les données", detail: "Accès, rectification, effacement et fermeture de compte : suivre les demandes privées et leur échéance.", href: "/admin/donnees", action: "Traiter les demandes", icone: ShieldCheck },
  { titre: "Sécurité de votre compte", detail: "Mot de passe et double authentification de votre compte de supervision.", href: "/compte", action: "Ouvrir la sécurité du compte", icone: ShieldCheck },
  { titre: "Accès de remplacement", detail: "Désigner un relais, vérifier la durée de son accès et le révoquer.", href: "/admin/relais#continuite", action: "Gérer les accès de relais", icone: UsersRound },
  { titre: "Veille réglementaire", detail: "Examiner les informations collectées et les conséquences proposées avant diffusion.", href: "/admin/veille", action: "Consulter la veille", icone: BookOpenCheck },
  { titre: "Traçabilité des accès", detail: "Retrouver les actions sensibles et les consultations de documents journalisées.", href: "/admin/journaux", action: "Consulter les journaux", icone: History },
  { titre: "Conservation des données", detail: "Consulter les durées de conservation et les règles de nettoyage existantes.", href: "/admin/conservation", action: "Voir les règles de conservation", icone: DatabaseBackup },
  { titre: "Informations légales", detail: "Vérifier les informations de l’éditeur reprises dans les pages légales de Gerimmo.", href: "/admin/parametres", action: "Vérifier l’identité de Gerimmo", icone: BookOpenCheck },
];

export default async function SecuriteSupervision({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}) {
  const p=await searchParams;
  return <main className="mx-auto w-full max-w-6xl p-4 sm:p-7">
    <div className="entete-page"><div><TitreEcran rubrique="supervision">Sécurité et conformité</TitreEcran><p className="mt-2 text-sm text-[var(--texte-secondaire)]">Vos accès, les données confiées à Gerimmo et les obligations à suivre.</p></div></div>
    <ControlesSecurite p={p}/>
    <ConsoleSection titre="Données et obligations" description="Demandes des utilisateurs, conservation et informations légales." icone="documents" ton="vert"><div className="grid gap-4 md:grid-cols-2">
      {acces.map(({ titre, detail, href, action, icone: Icone }) => <Link key={titre} href={href} className="admin-acces-carte">
        <span className="admin-acces-icone"><Icone size={21} aria-hidden="true" /></span>
        <div><h2>{titre}</h2><p>{detail}</p><span className="admin-acces-action">{action}<ArrowRight size={15} aria-hidden="true" /></span></div>
      </Link>)}
    </div></ConsoleSection>
  </main>;
}

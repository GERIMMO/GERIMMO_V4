import { NavigationUtilisateurs } from "./navigation";
import { AnnuairePersonnes } from "./personnes";
import { lirePage, numeroPage, rechercheIlike } from "@/lib/pagination-supervision";
import { Annuaire, type ClientResume } from "./annuaire";
import { Plus } from "lucide-react";
import ui from "./utilisateurs.module.css";
import styles from "../repertoires.module.css";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LIBELLES_STATUT_ORGANISATION } from "@/lib/libelles";
import { formaterDate } from "@/lib/ged";
import {
  familleOrganisation,
  LIBELLES_STATUT_ARTISAN,
  LIBELLES_SIRET,
  trierArtisans,
} from "@/lib/clients-supervision";

// Le nom de l'entrée de menu (audit 25/09, C8).
export const metadata = { title: "Utilisateurs" };

/**
 * LES CLIENTS, EN UN SEUL ÉCRAN (demande du porteur du projet, 19/09).
 *
 * « Lorsque je clique sur clients, je veux avoir une partie avec les artisans
 * (ceux en attente de validation en évidence), une partie agences et une
 * partie propriétaires bailleurs. »
 *
 * Avant : les agences et les propriétaires étaient mêlés en bas de la page de
 * supervision, sans distinction de famille, et les artisans vivaient dans un
 * écran nommé d'après une file d'attente (« Inscriptions artisan »). Rien ne
 * répondait à « qui sont nos clients ». L'entrée de barre s'appelle désormais
 * « Clients » et mène ici ; `/admin/artisans` reste l'écran de DÉCISION, où
 * l'on valide et refuse, et cette page y conduit.
 */

type Organisation = {
  id: string;
  name: string;
  status: string;
  type: string | null;
  city: string | null;
  email_contact: string | null;
  essai_fin: string | null;
  created_at: string;
};

type Artisan = {
  id: string;
  raison_sociale: string;
  siret: string | null;
  siret_etat: string;
  statut_plateforme: string;
  email: string | null;
  telephone: string | null;
  created_at: string;
};

export default async function PageClients({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  if(p.vue!=="espaces" && !p.famille && !p.pageProprietaires && !p.pageArtisans && !p.pageAgences) return <AnnuairePersonnes p={p}/>;
  const famille = ["proprietaire", "artisan", "agence", "attente"].includes(String(p.famille)) ? String(p.famille) : "tous";
  const recherche = typeof p.recherche === "string" ? p.recherche.trim().slice(0, 160) : "";
  const statuts = [...Object.keys(LIBELLES_STATUT_ORGANISATION).map(s => `org:${s}`), ...Object.keys(LIBELLES_STATUT_ARTISAN).map(s => `artisan:${s}`)];
  const statut = typeof p.statut === "string" && statuts.includes(p.statut) ? p.statut : "";
  const motif = rechercheIlike(recherche);
  const supabase = await createClient();

  const lireOrganisations = (f: "agence" | "proprietaire", debut: number, fin: number) => {
    let q = supabase.from("organizations").select("id,name,status,type,city,email_contact,essai_fin,created_at", { count: "exact" });
    q = f === "proprietaire" ? q.eq("type", "proprietaire_direct") : q.or("type.neq.proprietaire_direct,type.is.null");
    if (recherche) q = q.or(`name.ilike.${motif},city.ilike.${motif},email_contact.ilike.${motif}`);
    if (statut.startsWith("org:")) q = q.eq("status", statut.slice(4));
    return q.order("name").order("id").range(debut, fin);
  };
  const vide = { data: [], count: 0, error: null, page: 1, taille: 25 };
  const [proprietaires, agences, artisansBruts, nbProprietaires, nbAgences, nbArtisans, nbAttente] = await Promise.all([
    (famille === "tous" || famille === "proprietaire") && !statut.startsWith("artisan:") ? lirePage((a,b) => lireOrganisations("proprietaire", a,b), numeroPage(p.pageProprietaires)) : vide,
    (famille === "tous" || famille === "agence") && !statut.startsWith("artisan:") ? lirePage((a,b) => lireOrganisations("agence", a,b), numeroPage(p.pageAgences)) : vide,
    (famille === "tous" || famille === "artisan" || famille === "attente") && !statut.startsWith("org:") ? lirePage((a,b) => {
      let q = supabase.from("artisans").select("id,raison_sociale,siret,siret_etat,statut_plateforme,email,telephone,created_at", { count: "exact" });
      if (recherche) q = q.or(`raison_sociale.ilike.${motif},siret.ilike.${motif},email.ilike.${motif}`);
      if (famille === "attente") q = q.eq("statut_plateforme", "en_attente");
      if (statut.startsWith("artisan:")) q = q.eq("statut_plateforme", statut.slice(8));
      return q.order("raison_sociale").order("id").range(a,b);
    }, numeroPage(p.pageArtisans)) : vide,
    supabase.from("organizations").select("id", { count: "exact", head: true }).eq("type", "proprietaire_direct"),
    supabase.from("organizations").select("id", { count: "exact", head: true }).or("type.neq.proprietaire_direct,type.is.null"),
    supabase.from("artisans").select("id", { count: "exact", head: true }),
    supabase.from("artisans").select("id", { count: "exact", head: true }).eq("statut_plateforme", "en_attente"),
  ]);
  const organisations = [...(proprietaires.data ?? []), ...(agences.data ?? [])] as Organisation[];
  const artisans = trierArtisans((artisansBruts.data ?? []) as Artisan[]);
  const clients: ClientResume[] = [
    ...organisations.map(o => ({ id: o.id, famille: familleOrganisation(o.type), nom: o.name,
      detail: [o.city, o.email_contact, o.status === "essai" && o.essai_fin ? `Essai jusqu’au ${formaterDate(o.essai_fin)}` : null].filter(Boolean).join(" · ") || `Inscrit le ${formaterDate(o.created_at)}`,
      recherche: [o.city,o.email_contact].filter(Boolean).join(" "), statut: LIBELLES_STATUT_ORGANISATION[o.status] ?? o.status,
      ton: (o.status === "active" ? "vert" : o.status === "essai" ? "ambre" : o.status === "suspendue" ? "rouge" : "gris") as ClientResume["ton"], enAttente: false, href: `/admin/organisations/${o.id}` })),
    ...artisans.map(a => ({ id: a.id, famille: "artisan" as const, nom: a.raison_sociale,
      detail: `${LIBELLES_SIRET[a.siret_etat] ?? a.siret_etat} · Inscrit le ${formaterDate(a.created_at)}`,
      recherche: [a.siret,a.email].filter(Boolean).join(" "), statut: LIBELLES_STATUT_ARTISAN[a.statut_plateforme] ?? a.statut_plateforme,
      ton: (a.statut_plateforme === "valide" ? "vert" : a.statut_plateforme === "en_attente" ? "ambre" : "rouge") as ClientResume["ton"], enAttente: a.statut_plateforme === "en_attente", href: `/admin/clients/artisans/${a.id}` })),
  ];
  return <main className={`${styles.page} ${ui.page}`}>
    <header className={`${styles.header} ${ui.entete}`}><TitreEcran rubrique="personnes">Utilisateurs</TitreEcran><Link href="/admin/organisations/nouvelle" className="btn-or"><Plus size={16} aria-hidden="true" />Ouvrir une organisation</Link></header>
    <NavigationUtilisateurs vue="espaces"/>
    <Annuaire clients={clients} famille={famille} recherche={recherche} statut={statut}
      totaux={{ proprietaire: nbProprietaires.error ? null : nbProprietaires.count, agence: nbAgences.error ? null : nbAgences.count, artisan: nbArtisans.error ? null : nbArtisans.count, attente: nbAttente.error ? null : nbAttente.count }}
      lectures={{ proprietaire: { page: proprietaires.page, total: proprietaires.count, erreur: Boolean(proprietaires.error) }, agence: { page: agences.page, total: agences.count, erreur: Boolean(agences.error) }, artisan: { page: artisansBruts.page, total: artisansBruts.count, erreur: Boolean(artisansBruts.error) } }} />
  </main>;
}

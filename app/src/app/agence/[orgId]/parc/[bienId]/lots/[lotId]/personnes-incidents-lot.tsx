import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Mail, Phone, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { aujourdhuiParis, formaterDate } from "@/lib/ged";
import { nomComplet } from "@/lib/roles-personnes";
import { personnesDuResume, type IdentiteResume, type LienPersonneResume, type PersonneResume } from "@/lib/resume-location";
import { COULEURS_ETAT_INCIDENT, ETATS_INCIDENT, titreIncident } from "@/lib/incidents";
import { buttonVariants } from "@/components/ui/button";
import styles from "./personnes-incidents-lot.module.css";

export type BailPersonnesLot = {
  id: string;
  etat: string;
  locataire_principal: string | null;
  chambre_id?: string | null;
};

type PropsLot = { orgId: string; lotId: string; base: string; lectureSeule: boolean };
type IdentiteLot = Omit<IdentiteResume, "date_naissance"> & { email: string | null };
type IncidentLot = {
  id: string;
  numero: string;
  categorie: string;
  piece: string | null;
  description: string;
  urgence: string;
  etat: string;
  created_at: string;
};

function LectureIndisponible({ children }: { children: string }) {
  return <p role="alert" className={styles.erreur}>{children} Rechargez la page pour réessayer.</p>;
}

/** Le lot a déjà été autorisé par la page ; chaque lecture reste bornée à son organisation et à ses baux. */
export async function PersonnesLot({ orgId, lotId, base, lectureSeule, baux, erreurBaux = false }: PropsLot & {
  baux: BailPersonnesLot[];
  erreurBaux?: boolean;
}) {
  if (erreurBaux) return <LectureIndisponible>Les locataires et garants n’ont pas pu être chargés.</LectureIndisponible>;
  const attendus = baux.filter(bail => bail.etat !== "termine");
  if (!attendus.length) return <p className={styles.vide}>Aucun locataire ni garant rattaché à une location en cours.</p>;

  const supabase = await createClient();
  // La relecture protège aussi d'un bail clôturé depuis le chargement de la page.
  const lectureBaux = await supabase.from("baux")
    .select("id, etat, locataire_principal, chambre_id")
    .eq("organization_id", orgId).eq("lot_id", lotId).in("id", attendus.map(bail => bail.id));
  if (lectureBaux.error || lectureBaux.data?.length !== attendus.length) {
    return <LectureIndisponible>Les locataires et garants n’ont pas pu être chargés.</LectureIndisponible>;
  }
  const bauxLus = (lectureBaux.data as BailPersonnesLot[]).filter(bail => bail.etat !== "termine");
  if (!bauxLus.length) return <p className={styles.vide}>Aucun locataire ni garant rattaché à une location en cours.</p>;
  const idsChambres = [...new Set(bauxLus.flatMap(bail => bail.chambre_id ? [bail.chambre_id] : []))];
  const [lectureLiens, lectureChambres] = await Promise.all([
    supabase.from("bail_personnes").select("bail_id, person_id, role, garant_de, date_depart")
      .eq("organization_id", orgId).in("bail_id", bauxLus.map(bail => bail.id)),
    idsChambres.length ? supabase.from("lot_chambres").select("id, nom")
      .eq("organization_id", orgId).eq("lot_id", lotId).in("id", idsChambres) : Promise.resolve({ data: [], error: null }),
  ]);
  if (lectureLiens.error) return <LectureIndisponible>Les locataires et garants n’ont pas pu être chargés.</LectureIndisponible>;
  const liens = (lectureLiens.data ?? []) as LienPersonneResume[];
  const idsPersonnes = [...new Set([
    ...bauxLus.map(bail => bail.locataire_principal),
    ...liens.flatMap(lien => [lien.person_id, lien.garant_de]),
  ].filter((id): id is string => Boolean(id)))];
  const lecturePersonnes = idsPersonnes.length ? await supabase.from("persons")
    .select("id, nom, prenom, telephone, email").eq("organization_id", orgId).in("id", idsPersonnes) : { data: [], error: null };
  if (lecturePersonnes.error) return <LectureIndisponible>Les coordonnées des locataires et garants n’ont pas pu être chargées.</LectureIndisponible>;

  const identites = (lecturePersonnes.data ?? []) as IdentiteLot[];
  const identitesParId = new Map(identites.map(personne => [personne.id, personne]));
  const chambres = new Map((lectureChambres.data ?? []).map(chambre => [chambre.id, chambre.nom]));
  const resume = personnesDuResume(
    bauxLus.map(bail => ({ ...bail, date_debut: null, date_fin: null, loyer_hc: null, charges: null })),
    liens,
    identites.map(personne => ({ ...personne, date_naissance: null })),
  );
  const aujourdHui = aujourdhuiParis();
  const personne = (lien: PersonneResume, role: string) => {
    const identite = identitesParId.get(lien.person_id);
    return <li key={`${lien.bail_id}:${lien.person_id}`} className={styles.personne}>
      <div className={styles.identite}>
        {identite ? <Link href={`${base}/personnes/${identite.id}`} className={styles.nom}>{nomComplet(identite)}<ArrowUpRight size={14} aria-hidden="true" /></Link> : <strong>Identité indisponible</strong>}
        <span className={styles.precision}>{role}</span>
        {lien.depart && <span className={styles.precision}>{lien.depart <= aujourdHui ? "Départ le" : "Départ prévu le"} {formaterDate(lien.depart)}</span>}
      </div>
      {identite && <div className={styles.contacts}>
        {identite.telephone && <a href={`tel:${identite.telephone.replace(/[^\d+]/g, "")}`}><Phone size={13} aria-hidden="true" />{identite.telephone}</a>}
        {identite.email && <a href={`mailto:${identite.email}`}><Mail size={13} aria-hidden="true" />{identite.email}</a>}
        {!identite.telephone && !identite.email && <span className={styles.precision}>Coordonnées à compléter</span>}
      </div>}
    </li>;
  };

  return <div className={styles.contenu}>
    {lectureChambres.error && <LectureIndisponible>Le nom des chambres n’a pas pu être chargé.</LectureIndisponible>}
    {bauxLus.map((bail, index) => {
      const locataires = resume.locataires.filter(lien => lien.bail_id === bail.id);
      const actuels = locataires.filter(lien => !lien.depart || lien.depart > aujourdHui);
      const anciens = locataires.filter(lien => lien.depart && lien.depart <= aujourdHui);
      const garants = resume.garants.filter(lien => lien.bail_id === bail.id);
      return <div key={bail.id} className={styles.contrat}>
        {(bauxLus.length > 1 || bail.etat !== "actif" || bail.chambre_id) && <div className={styles.contratEntete}>
          <span>{bail.chambre_id ? chambres.get(bail.chambre_id) ?? "Chambre" : bauxLus.length > 1 ? `Location ${index + 1}` : "Location"}</span>
          {bail.etat === "brouillon" && <span className="puce puce-prep">En préparation</span>}
          {bail.etat === "preavis" && <span className="puce puce-prep">Préavis</span>}
        </div>}
        {actuels.length ? <ul className={styles.liste}>{actuels.map(lien => personne(lien, bail.etat === "brouillon" ? "Locataire prévu" : "Locataire"))}</ul> : <p className={styles.vide}>{bail.etat === "brouillon" ? "Locataire à désigner." : "Aucun locataire actuel renseigné."}</p>}
        <div className={styles.garants}>
          <h3>Garants</h3>
          {garants.length ? <ul className={styles.liste}>{garants.map(lien => {
            const garanti = lien.garant_de ? identitesParId.get(lien.garant_de) : null;
            const locataireGaranti = locataires.find(locataire => locataire.person_id === lien.garant_de);
            const depart = locataireGaranti?.depart && locataireGaranti.depart <= aujourdHui ? ` · locataire parti le ${formaterDate(locataireGaranti.depart)}` : "";
            return personne(lien, `${garanti ? `Garant de ${nomComplet(garanti)}` : lien.garant_de ? "Locataire garanti indisponible" : "Locataire garanti à préciser"}${depart}`);
          })}</ul> : <p className={styles.vide}>Aucun garant rattaché.</p>}
        </div>
        {anciens.length > 0 && <details className={styles.historique}><summary>Anciens colocataires · {anciens.length}</summary><ul className={styles.liste}>{anciens.map(lien => personne(lien, "Ancien colocataire"))}</ul></details>}
        {!lectureSeule && <Link href={`${base}/baux/${bail.id}${bail.etat === "brouillon" ? "#etape-bail-2" : "#contrat"}`} className={styles.lienAction}>{actuels.length ? "Gérer les personnes du bail" : "Renseigner les locataires"}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
      </div>;
    })}
  </div>;
}

const COLONNES_INCIDENT = "id, numero, categorie, piece, description, urgence, etat, created_at";

export async function IncidentsLot({ orgId, lotId, base, lectureSeule }: PropsLot) {
  const supabase = await createClient();
  const lireOuverts = async () => {
    const incidents: IncidentLot[] = [];
    // Pagination explicite : les incidents anciens ne disparaissent pas derrière le plafond de l'API.
    for (let debut = 0; ; debut += 500) {
      const lecture = await supabase.from("incidents").select(COLONNES_INCIDENT)
        .eq("organization_id", orgId).eq("lot_id", lotId).neq("etat", "clos")
        .order("created_at").order("id").range(debut, debut + 499);
      if (lecture.error) return { data: null, error: lecture.error };
      const page = (lecture.data ?? []) as IncidentLot[];
      incidents.push(...page);
      if (page.length < 500) return { data: incidents, error: null };
    }
  };
  const [ouverts, clos] = await Promise.all([
    lireOuverts(),
    supabase.from("incidents").select(COLONNES_INCIDENT, { count: "exact" })
      .eq("organization_id", orgId).eq("lot_id", lotId).eq("etat", "clos")
      .order("created_at", { ascending: false }).order("id").limit(8),
  ]);
  const enCours = [...(ouverts.data ?? [])].sort((a, b) => Number(b.urgence === "urgente") - Number(a.urgence === "urgente"));
  const clotures = (clos.data ?? []) as IncidentLot[];
  const ligne = (incident: IncidentLot) => <li key={incident.id}>
    <Link href={`${base}/incidents?${incident.etat === "clos" ? "vue=clos&" : ""}sel=${incident.id}`} className={styles.incident}>
      <div className={styles.incidentEntete}><strong>{titreIncident(incident.categorie)}</strong><ArrowUpRight size={16} aria-hidden="true" /></div>
      <p className={styles.description}>{incident.description}</p>
      <div className={styles.precisionsIncident}><span>{incident.numero}</span>{incident.piece && <span>{incident.piece}</span>}<span>{formaterDate(incident.created_at.slice(0, 10))}</span></div>
      <div className={styles.etats}>
        <span className={COULEURS_ETAT_INCIDENT[incident.etat] ?? "puce puce-grise"}>{ETATS_INCIDENT[incident.etat] ?? incident.etat}</span>
        {incident.etat !== "clos" && <span className={incident.urgence === "urgente" ? "puce puce-rouge" : styles.precision}>{incident.urgence === "urgente" ? "Urgent" : "Priorité normale"}</span>}
      </div>
    </Link>
  </li>;
  return <div className={styles.contenu}>
    {ouverts.error ? <LectureIndisponible>Les incidents en cours n’ont pas pu être chargés.</LectureIndisponible> : enCours.length ? <ul className={styles.incidents}>{enCours.map(ligne)}</ul> : <p className={styles.serein}><CheckCircle2 size={18} aria-hidden="true" />Aucun incident en cours.</p>}
    {!lectureSeule && <Link href={`${base}/incidents/nouveau?lot=${lotId}`} className={buttonVariants({ variant: "outline", size: "sm" })}><Plus size={14} aria-hidden="true" />Signaler un incident</Link>}
    {clos.error ? <LectureIndisponible>L’historique des incidents n’a pas pu être chargé.</LectureIndisponible> : clotures.length > 0 && <details className={styles.historique}>
      <summary>Historique · {clos.count ?? clotures.length} clôturé{(clos.count ?? clotures.length) > 1 ? "s" : ""}</summary>
      {(clos.count ?? 0) > clotures.length && <p className={styles.precision}>Les {clotures.length} derniers dossiers. <Link href={`${base}/incidents?vue=clos`} className={styles.lienAction}>Consulter les incidents</Link></p>}
      <ul className={styles.incidents}>{clotures.map(ligne)}</ul>
    </details>}
  </div>;
}

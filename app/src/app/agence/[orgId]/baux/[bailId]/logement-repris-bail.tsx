"use client";

import Link from "next/link";
import { House, Ruler, DoorOpen, Layers3, Armchair, Info, Pencil, Check } from "lucide-react";
import { PastilleBail } from "@/components/pastille-bail";
import { complementsLogementBail } from "@/lib/logement-bail-complements";
import { lienLotDepuisBail, type EtapeLot } from "@/lib/parcours-lot";
import { TYPES_BIEN } from "@/lib/parc";
import type { BienFormulaire } from "../../parc/formulaire-bien";
import type { LotFormulaire } from "../../parc/[bienId]/lots/[lotId]/formulaire-lot";
import styles from "./logement-bail.module.css";

type Props = {
  orgId: string;
  lot: LotFormulaire;
  bien: BienFormulaire;
  bailId: string;
  catalogue: { id: string; nom: string }[];
  selection: string[];
  erreurEquipements: boolean;
  chambres?: {id: string; nom: string; surface_m2: number; description: string; espaces_partages: string}[];
};

const valeur = (v: string | number | null | undefined) => v == null || String(v).trim() === "" ? "Non renseigné" : v;
const surface = (v: number | null) => v == null ? "À renseigner" : `${Number(v).toLocaleString("fr-FR")} m²`;

export function LogementReprisBail({ orgId, bailId, lot, bien, catalogue, selection, erreurEquipements, chambres }: Props) {
  const manquants = complementsLogementBail(lot, bien);
  const equipements = catalogue.filter(e => selection.includes(e.id));
  const lien = (etape: EtapeLot) => lienLotDepuisBail(orgId, bien.id, lot.id, bailId, etape);
  return <div id="completer-logement" className={styles.logement}>
      <div className={styles.ficheReprise}>
        <div className={styles.resume}>
          <div className={styles.adresse}>
            <span className={styles.iconeResume}><House size={22} aria-hidden="true" /></span>
            <div><small><Check size={12} aria-hidden="true" /> Repris de Mes lots</small><strong>{lot.nom}</strong><p>{[bien.address_line1, bien.address_line2, [bien.postal_code, bien.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "Adresse à renseigner"}</p></div>
          </div>
          <Link href={lien("lot")} className="btn-secondaire"><Pencil size={14} aria-hidden="true" />Ouvrir la fiche du lot</Link>
        </div>
        <div className={styles.donneesReprises}>
          <dl className={styles.chiffres}>
            <div><dt><House size={13} aria-hidden="true" />Type</dt><dd>{TYPES_BIEN[bien.type] ?? bien.type}</dd></div>
            <div><dt><Ruler size={13} aria-hidden="true" />Surface</dt><dd>{surface(lot.surface_m2)}</dd></div>
            <div><dt><DoorOpen size={13} aria-hidden="true" />Pièces</dt><dd>{lot.pieces ?? "À renseigner"}</dd></div>
            <div><dt><Layers3 size={13} aria-hidden="true" />Étage</dt><dd>{valeur(lot.etage)}</dd></div>
            <div><dt><Armchair size={13} aria-hidden="true" />Mobilier</dt><dd>{lot.meuble ? "Meublé" : "Non meublé"}</dd></div>
          </dl>
          <dl className={styles.detailsRepris}>
            {([
              ["Chauffage", lot.chauffage], ["Eau chaude", lot.eau_chaude],
              ["Bâtiment", [bien.annee_construction ? `Construit en ${bien.annee_construction}` : null, bien.copropriete ? "Copropriété" : "Hors copropriété"].filter(Boolean).join(" · ")],
              ["Locaux privatifs", lot.locaux_privatifs], ["Autres parties", lot.description],
              ["Équipements", equipements.map(e => e.nom).join(", ")],
            ] as [string, string | null][]).filter(([, v]) => v != null && v.trim() !== "").map(([label, v]) => <div key={label}><dt>{label}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      </div>
      <p className={styles.note}><Info size={14} aria-hidden="true" />Le logement est déjà créé. Ses informations sont reprises automatiquement dans ce bail.</p>
      <div className={styles.champsRepris}>
        <div id="completer-lot" className={styles.section}>
          <h3>Caractéristiques du lot <PastilleBail champ={["lot.identifiant_fiscal", "lot.surface_m2", "lot.pieces", "lot.chauffage", "lot.eau_chaude", "lot.locaux_privatifs", "lot.description"]} /></h3>
          <p>{manquants.logement.length ? "Des caractéristiques du lot restent à renseigner." : "Les caractéristiques sont enregistrées dans Mes lots."}</p>
          <Link className="lien-discret" href={lien("lot")}>{manquants.logement.length ? "Compléter" : "Modifier"} les caractéristiques dans le lot →</Link>
        </div>
        <div id="completer-bien" className={styles.section}>
          <h3>Adresse et bâtiment <PastilleBail champ={["bien.address_line1", "bien.postal_code", "bien.city", "bien.annee_construction", "bien.parties_communes", "bien.acces_tic"]} /></h3>
          <p>{manquants.batiment.length ? "Des informations du bâtiment restent à renseigner." : "Les informations du bâtiment sont enregistrées."}</p>
          <Link className="lien-discret" href={lien("bien")}>{manquants.batiment.length ? "Compléter" : "Modifier"} le bâtiment dans Mes lots →</Link>
        </div>
        <div id="completer-equipements" className={styles.section}>
          <h3>Équipements <PastilleBail champ="lot.equipements" /></h3>
          <p>{erreurEquipements ? "Les équipements n’ont pas pu être chargés." : equipements.length ? equipements.map(e => e.nom).join(", ") : "Les équipements du logement restent à renseigner."}</p>
          <Link className="lien-discret" href={lien("equipements")}>Gérer les équipements dans le lot →</Link>
        </div>
        {chambres && <div id="completer-chambres" className={styles.section}><h3>Chambres et espaces partagés</h3>
          {chambres.map(c => <p key={c.id}><strong>{c.nom} · {c.surface_m2} m²</strong> — {c.description} · Espaces partagés : {c.espaces_partages}</p>)}
          <Link className="lien-discret" href={lien("equipements")}>Gérer les chambres dans le lot →</Link>
        </div>}
      </div>
    </div>;
}

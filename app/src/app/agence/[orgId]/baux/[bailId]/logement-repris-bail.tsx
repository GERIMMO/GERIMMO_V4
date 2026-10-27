"use client";

import Link from "next/link";
import { House, Building2, Armchair, BedDouble, Pencil, Check, CircleAlert } from "lucide-react";
import { informationsLogementBail, type InformationLogementBail } from "@/lib/logement-bail-complements";
import { lienLotDepuisBail, type EtapeLot } from "@/lib/parcours-lot";
import type { BienFormulaire } from "../../parc/formulaire-bien";
import type { LotFormulaire } from "../../parc/[bienId]/lots/[lotId]/formulaire-lot";
import styles from "./logement-bail.module.css";
import { useRacineEspace } from "@/components/racine-espace-contexte";

type Chambre = {
  id: string; nom: string; surface_m2: number; description: string; espaces_partages: string;
  volume_m3?: number | null; equipements?: string | null;
};
type Props = {
  orgId: string;
  lot: LotFormulaire;
  bien: BienFormulaire;
  bailId: string;
  catalogue: { id: string; nom: string }[];
  selection: string[];
  erreurEquipements: boolean;
  chambres?: Chambre[];
};

const aCompleter = (info: InformationLogementBail) => !["renseigne", "facultatif"].includes(info.etat);

function Informations({ lignes }: { lignes: InformationLogementBail[] }) {
  return <dl className={styles.details}>
    {lignes.map(info => <div key={info.champ} className={styles.detail} data-etat={info.etat} data-large={info.large || undefined}>
      <dt>{info.libelle}</dt>
      <dd>
        {info.valeur !== null && <span>{info.valeur}</span>}
        {aCompleter(info) && <span className={styles.manquant}><CircleAlert size={13} aria-hidden="true" />{info.etat === "a_corriger" ? "À corriger" : info.etat === "a_confirmer" ? "À confirmer" : "À renseigner"}</span>}
        {info.etat === "facultatif" && <span className={styles.facultatif}>Non renseigné <small>Facultatif</small></span>}
      </dd>
    </div>)}
  </dl>;
}

function lignesChambre(chambre: Chambre): InformationLogementBail[] {
  return [
    ["surface_m2", "Surface privative", chambre.surface_m2, " m²"],
    ["volume_m3", "Volume privatif", chambre.volume_m3, " m³"],
    ["description", "Description", chambre.description, ""],
    ["equipements", "Équipements privatifs", chambre.equipements, ""],
    ["espaces_partages", "Espaces partagés", chambre.espaces_partages, ""],
  ].map(([champ, libelle, valeur, unite]) => {
    const vide = valeur == null || String(valeur).trim() === "";
    const numerique = Boolean(unite);
    return {
      champ: String(champ), libelle: String(libelle),
      valeur: vide ? null : `${numerique ? Number(valeur).toLocaleString("fr-FR") : String(valeur)}${unite}`,
      etat: vide ? "manquant" : numerique && !(Number(valeur) > 0) ? "a_corriger" : "renseigne",
      large: !numerique,
    };
  });
}

export function LogementReprisBail({ orgId, bailId, lot, bien, catalogue, selection, erreurEquipements, chambres }: Props) {
  const informations = informationsLogementBail(lot, bien);
  const equipements = catalogue.filter(e => selection.includes(e.id));
  const equipementsInconnus = selection.some(id => !catalogue.some(e => e.id === id));
  const racine = useRacineEspace();
  const lien = (etape: EtapeLot) => lienLotDepuisBail(orgId, bien.id, lot.id, bailId, etape, 3, racine);
  return <div id="completer-logement" className={styles.logement}>
    <p className={styles.source}><Check size={14} aria-hidden="true" />Informations reprises du lot. Les modifications seront aussi conservées dans sa fiche.</p>
    <div className={styles.fiches}>
      {([
        { id: "completer-lot", titre: "Le logement", action: "le logement", etape: "lot", Icone: House, lignes: informations.logement },
        { id: "completer-bien", titre: "Adresse et bâtiment", action: "le bâtiment", etape: "bien", Icone: Building2, lignes: informations.batiment },
      ] as const).map(({ id, titre, action, etape, Icone, lignes }) => {
        const restants = lignes.filter(aCompleter).length;
        return <section key={id} id={id} className={styles.fiche} aria-labelledby={`${id}-titre`}>
          <header className={styles.entete}>
            <div className={styles.titre}><Icone size={18} aria-hidden="true" /><h3 id={`${id}-titre`}>{titre}</h3>{restants > 0 && <span className={styles.compteur}>{restants} à compléter</span>}</div>
            <Link href={lien(etape)} className={styles.modifier}><Pencil size={13} aria-hidden="true" />{restants ? "Compléter" : "Modifier"}<span className="sr-only"> {action}</span></Link>
          </header>
          <Informations lignes={lignes} />
        </section>;
      })}
    </div>
    <section id="completer-equipements" className={styles.fiche} aria-labelledby="completer-equipements-titre">
      <header className={styles.entete}>
        <div className={styles.titre}><Armchair size={18} aria-hidden="true" /><h3 id="completer-equipements-titre">Équipements du logement</h3></div>
        <Link href={`${lien("equipements")}#equipements`} className={styles.modifier}><Pencil size={13} aria-hidden="true" />{erreurEquipements || equipementsInconnus ? "Vérifier" : equipements.length ? "Modifier" : "Compléter"}<span className="sr-only"> les équipements du logement</span></Link>
      </header>
      <div className={styles.contenu}>
        {erreurEquipements ? <p role="alert" className={styles.erreur}><CircleAlert size={15} aria-hidden="true" />Les équipements n’ont pas pu être chargés. Réessayez ou ouvrez leur fiche.</p>
          : <>
            {equipements.length > 0 && <ul className={styles.equipements}>{equipements.map(e => <li key={e.id}><Check size={13} aria-hidden="true" />{e.nom}</li>)}</ul>}
            {equipementsInconnus ? <p role="alert" className={styles.erreur}>Certains équipements n’ont pas pu être identifiés. Vérifiez la fiche du lot.</p>
              : equipements.length === 0 && <p className={styles.manquant}><CircleAlert size={14} aria-hidden="true" />Aucun équipement renseigné.</p>}
          </>}
      </div>
    </section>
    {chambres && <section id="completer-chambres" className={styles.fiche} aria-labelledby="completer-chambres-titre">
      <header className={styles.entete}>
        <div className={styles.titre}><BedDouble size={18} aria-hidden="true" /><h3 id="completer-chambres-titre">Chambres et espaces partagés</h3></div>
        <Link href={`${lien("equipements")}#chambres`} className={styles.modifier}><Pencil size={13} aria-hidden="true" />{chambres.length ? "Modifier" : "Vérifier"}<span className="sr-only"> les chambres du lot</span></Link>
      </header>
      {chambres.map(chambre => <div key={chambre.id} className={styles.chambre}>
        <h4>{chambre.nom?.trim() || <span className={styles.manquant}>Nom de la chambre à renseigner</span>}</h4>
        <Informations lignes={lignesChambre(chambre)} />
      </div>)}
    </section>}
  </div>;
}

"use client";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { FilePenLine, ImagePlus, Save } from "lucide-react";
import { enregistrerProfilDocuments } from "../devis/actions-preparation";
import type { ProfilDocumentArtisan } from "@/lib/parcours-devis-artisan";
import { Carte, CLASSE_BOUTON_SOBRE, CLASSE_ZONE_TEXTE, CLASSE_LIBELLE, Erreur, Succes } from "../ui";
import styles from "./entreprise.module.css";

function Enregistrer() {
  const { pending } = useFormStatus();
  return <button type="submit" className={CLASSE_BOUTON_SOBRE} disabled={pending}><Save size={16} aria-hidden/>{pending ? "Enregistrement…" : "Enregistrer mes informations de devis"}</button>;
}

export function DocumentsEntreprise({ profil }: { profil: ProfilDocumentArtisan }) {
  const [etat, action] = useActionState(enregistrerProfilDocuments, {});
  return <div id="documents" className={styles.documents}><Carte className={styles.bloc}>
    <div className={styles.titreBloc}><span className={styles.icone}><FilePenLine size={19} aria-hidden/></span><div><h2>Mon identité sur les devis</h2><p>Ces informations apparaîtront sur les PDF générés par Gerimmo.</p></div></div>
    <form data-saisie-confirmee action={action} onReset={event => event.preventDefault()}>
      <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Adresse complète de l’entreprise</span><textarea name="adresse" required maxLength={500} rows={2} defaultValue={profil.adresse} placeholder="Numéro, voie, code postal et ville" className={CLASSE_ZONE_TEXTE}/></label>
      <div className={styles.logoDevis}>
        <span className={styles.apercuLogo}>{profil.logo_data ? <Image src={profil.logo_data} alt="Logo actuel de votre entreprise" width={100} height={70} unoptimized/> : <ImagePlus size={27} aria-hidden/>}</span>
        <label className={styles.choixLogo}><span>Logo de l’entreprise <span className={styles.facultatif}>Facultatif</span></span><input name="logo" type="file" accept="image/png,image/jpeg"/><small>PNG ou JPEG · 500 Ko maximum. Votre logo actuel reste conservé si aucun fichier n’est choisi.</small></label>
      </div>
      <label className="block space-y-1.5"><span className={CLASSE_LIBELLE}>Mentions de l’entreprise et assurances</span><textarea name="mentions" maxLength={3000} rows={3} defaultValue={profil.mentions} placeholder="Forme juridique, numéro de TVA, assureur et couverture lorsque nécessaires…" className={CLASSE_ZONE_TEXTE}/></label>
      <p className={styles.aide}>La raison sociale, le SIRET et vos coordonnées sont repris automatiquement depuis votre fiche entreprise.</p>
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}{etat.succes && <Succes>{etat.succes}</Succes>}
      <div className={styles.actions}><Enregistrer/></div>
    </form>
  </Carte></div>;
}

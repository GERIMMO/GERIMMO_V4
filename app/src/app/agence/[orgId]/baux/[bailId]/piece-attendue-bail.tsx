"use client";

import { useId, useState } from "react";
import { Eye, Plus } from "lucide-react";
import { Modale } from "@/components/ui/modale";
import { LecteurDocument } from "@/components/lecteur-document";
import { ChampFichier } from "@/components/champ-fichier";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { enregistrerPieceAttendueBail } from "@/app/actions/pieces-attendues-bail";
import { LIBELLES_PIECES_ATTENDUES, type NaturePieceAttendue } from "@/lib/pieces-attendues-bail";
import styles from "./documents-bail.module.css";

export type FichierPieceBail = { id: string; titre: string | null; mime_type: string | null; expire_le: string | null };

export function ApercuPieceBail({ fichier, titre, mime = null }: { fichier: string; titre: string; mime?: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  return <><button type="button" className={styles.boutonDiscret} onClick={() => setOuvert(true)} aria-label={`Aperçu : ${titre}`}><Eye size={15} aria-hidden="true"/>Aperçu</button>
    {ouvert && <Modale titre={titre} tresLarge fermer={() => setOuvert(false)}><LecteurDocument fichier={fichier} titre={titre} mime={mime} presentation="fiche"/></Modale>}
  </>;
}

export function ChoisirPieceAttendueBail({ orgId, bailId, nature, documents, dejaPresent, documentPrecedentId, indisponible = false }: {
  orgId: string; bailId: string; nature: NaturePieceAttendue; documents: FichierPieceBail[]; dejaPresent: boolean; documentPrecedentId: string | null; indisponible?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [source, setSource] = useState<"existant" | "depot">(documents.length ? "existant" : "depot");
  const [documentAuDebut, setDocumentAuDebut] = useState(documentPrecedentId);
  const sourceDisponible = documents.length ? source : "depot";
  const id = useId();
  const { etat, soumettre, enCours, version } = useActionFormulaire(async (etat, form) => {
    const resultat = await enregistrerPieceAttendueBail(orgId, bailId, nature, etat, form);
    if (resultat.succes && !resultat.erreur) setOuvert(false);
    return resultat;
  }, true);
  return <div className={styles.choixPiece}>
    <button type="button" className={styles.boutonDiscret} disabled={indisponible || enCours} onClick={() => { setDocumentAuDebut(documentPrecedentId); setOuvert(true); }}><Plus size={15} aria-hidden="true"/>{dejaPresent ? "Changer le document" : "Ajouter l’attestation"}</button>
    {etat.succes && !ouvert && <p role="status">{etat.succes}</p>}
    <Modale titre={LIBELLES_PIECES_ATTENDUES[nature]} ouverte={ouvert} large fermer={() => { if (!enCours) setOuvert(false); }}>
      {documents.length > 0 && <div className={styles.choixSource} aria-label="Origine du document">
        <button type="button" aria-pressed={sourceDisponible === "existant"} disabled={enCours} onClick={() => setSource("existant")}>Déjà déposé</button>
        <button type="button" aria-pressed={sourceDisponible === "depot"} disabled={enCours} onClick={() => setSource("depot")}>Nouveau fichier</button>
      </div>}
      <form key={version} data-saisie-confirmee onSubmit={soumettre} className="space-y-4">
        <input type="hidden" name="document_precedent_id" value={documentAuDebut ?? ""}/>
        <p>{nature === "assurance_proprietaire" ? "Choisissez l’attestation qui couvre votre responsabilité de propriétaire pour ce logement." : "Choisissez l’attestation qui couvre ce logement et les locataires de ce bail."}</p>
        <fieldset hidden={sourceDisponible !== "existant"} disabled={!ouvert || sourceDisponible !== "existant" || enCours}>
          <div className="space-y-2"><Label htmlFor={`${id}-document`}>Document enregistré</Label><select id={`${id}-document`} name="document_id" required defaultValue="" className={styles.select}><option value="" disabled>Choisir un document…</option>{documents.map(d => <option value={d.id} key={d.id}>{d.titre || "Document sans titre"}{d.expire_le ? ` · échéance ${d.expire_le.split("-").reverse().join("/")}` : ""}</option>)}</select></div>
        </fieldset>
        <fieldset hidden={sourceDisponible !== "depot"} disabled={!ouvert || sourceDisponible !== "depot" || enCours} className="space-y-4">
          <div className="space-y-2"><Label htmlFor={`${id}-fichier`}>Attestation (PDF, JPEG ou PNG)</Label><ChampFichier depotDirect id={`${id}-fichier`} name="fichier" accept=".pdf,.jpg,.jpeg,.png" required/></div>
          <div className="space-y-2"><Label htmlFor={`${id}-expiration`}>Fin de validité <span className="font-normal text-muted-foreground">si elle figure sur l’attestation</span></Label><Input id={`${id}-expiration`} name="expire_le" type="date"/></div>
        </fieldset>
        {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
        <BoutonEnvoi enCours={enCours}>{sourceDisponible === "existant" ? "Utiliser ce document" : "Enregistrer l’attestation"}</BoutonEnvoi>
      </form>
    </Modale>
  </div>;
}

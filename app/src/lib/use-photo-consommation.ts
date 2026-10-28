"use client";
import { useCallback, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { compresserImage } from "./compresser-image";
import { erreurVolumeDepot } from "./limite-depot";
import { MAX_DEPOT_DIRECT } from "./depot-direct-commun";

/** La photo affichée à l'IA et celle jointe au formulaire sont le même fichier comprimé. */
export function usePhotoConsommation(depotDirect = false) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [preparation, setPreparation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [empreinte, setEmpreinte] = useState<string | null>(null);
  const [reinitialisation, setReinitialisation] = useState(0);
  const version = useRef(0);
  const champ = useRef<HTMLInputElement>(null);
  const bloquee = useRef(false);
  const lierChamp = useCallback((element: HTMLInputElement | null) => { champ.current = element; }, []);
  function verifierSoumission(e: FormEvent<HTMLFormElement>) { if (bloquee.current) e.preventDefault(); }
  async function choisir(e: ChangeEvent<HTMLInputElement>) {
    const element = e.currentTarget;
    const tour = ++version.current;
    const original = element.files?.[0];
    setFichier(null); setErreur(null); setEmpreinte(null);
    if (!original) { bloquee.current = false; setPreparation(false); return; }
    bloquee.current = true; setPreparation(true);
    const compresse = await compresserImage(original);
    if (tour !== version.current) return;
    try {
      if (compresse !== original) {
        const transfert = new DataTransfer(); transfert.items.add(compresse); element.files = transfert.files;
      }
      const joint = element.files?.[0] ?? original;
      const message = depotDirect ? (joint.size > MAX_DEPOT_DIRECT ? "Ce fichier dépasse 10 Mo. Choisissez une version moins volumineuse." : null) : erreurVolumeDepot([joint]);
      const hash = !message && depotDirect ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await joint.arrayBuffer()))).map(b => b.toString(16).padStart(2, "0")).join("") : null;
      if (tour !== version.current) return;
      setEmpreinte(hash);
      setErreur(message); setFichier(message ? null : joint); bloquee.current = !!message;
    } catch {
      setErreur("La photo n’a pas pu être préparée. Choisissez une autre photo ou transmettez seulement l’index.");
      bloquee.current = true;
    }
    setPreparation(false);
  }
  function retirer() {
    version.current++; if (champ.current) champ.current.value = "";
    setReinitialisation(v => v + 1);
    setFichier(null); setErreur(null); setEmpreinte(null); setPreparation(false); bloquee.current = false;
  }
  return { fichier, preparation, erreur, empreinte, choisir, retirer, lierChamp, verifierSoumission, reinitialisation };
}

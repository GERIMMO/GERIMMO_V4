"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, Minus, Plus, RotateCw, Scan } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist/types/src/display/api";
import type { TextLayer } from "pdfjs-dist/types/src/display/text_layer";
import styles from "./lecteur-document.module.css";

type PdfJs = typeof import("pdfjs-dist");
type Props = { fichier: string; titre: string; mime: string | null; presentation?: "standard" | "fiche" };
type DocumentLu = { type: "chargement" } | { type: "erreur"; message: string }
  | { type: "pdf"; pdf: PDFDocumentProxy; moteur: PdfJs } | { type: "image"; url: string };
const ASSETS = "/pdfjs/6.4.299/";
const MAX_OCTETS = 50 * 1024 * 1024;
const FORMATS = new Set(["application/pdf", "image/png", "image/jpeg"]);

class ErreurLecture extends Error {}
function routeFichier(fichier: string, mode: "apercu" | "telechargement") {
  const url = new URL(fichier, window.location.origin);
  if (url.origin !== window.location.origin) throw new ErreurLecture("L’accès à ce document est indisponible.");
  url.searchParams.delete("apercu"); url.searchParams.delete("mode");
  url.searchParams.set(mode === "apercu" ? "apercu" : "mode", mode === "apercu" ? "integre" : "telechargement");
  return url.href;
}

/** Le plafond porte aussi sur les réponses sans Content-Length et les flux interrompus. */
async function lireOctets(reponse: Response, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (!reponse.ok) throw new ErreurLecture("Le document n’a pas pu être chargé. Réessayez.");
  const annonce = Number(reponse.headers.get("content-length"));
  if (annonce > MAX_OCTETS) { await reponse.body?.cancel(); throw new ErreurLecture("Ce document dépasse 50 Mo. Son aperçu n’est pas disponible."); }
  if (!reponse.body) throw new ErreurLecture("Le document est vide ou indisponible.");
  const lecteur = reponse.body.getReader(), morceaux: Uint8Array[] = [];
  const annuler = () => { void lecteur.cancel().catch(() => {}); };
  signal.addEventListener("abort", annuler, { once: true });
  let taille = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > MAX_OCTETS) throw new ErreurLecture("Ce document dépasse 50 Mo. Son aperçu n’est pas disponible.");
      morceaux.push(value);
    }
    signal.throwIfAborted();
    if (!taille) throw new ErreurLecture("Le document est vide ou indisponible.");
    const resultat = new Uint8Array(taille);
    let position = 0;
    for (const morceau of morceaux) { resultat.set(morceau, position); position += morceau.byteLength; }
    return resultat;
  } finally { signal.removeEventListener("abort", annuler); await lecteur.cancel().catch(() => {}); lecteur.releaseLock(); }
}

function messageErreur(erreur: unknown) {
  if (erreur instanceof ErreurLecture) return erreur.message;
  if (erreur instanceof Error && erreur.name === "PasswordException") return "Ce PDF est protégé par un mot de passe. Téléchargez-le pour l’ouvrir.";
  return "L’aperçu n’a pas pu être affiché. Réessayez ou téléchargez le document.";
}

function PagePdf({ pdf, moteur, numero, zoom, largeur }: { pdf: PDFDocumentProxy; moteur: PdfJs; numero: number; zoom: number; largeur: number }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const [essai, setEssai] = useState(0);
  const [etat, setEtat] = useState<{ cle: string; erreur?: string; termine?: boolean }>({ cle: "" });
  const cle = `${numero}-${zoom}-${largeur}-${essai}`;
  useEffect(() => {
    if (!largeur) return;
    let annule = false, page: PDFPageProxy | undefined, rendu: RenderTask | undefined, texte: TextLayer | undefined;
    const canvas = document.createElement("canvas"), couche = document.createElement("div"), feuille = document.createElement("div");
    canvas.setAttribute("aria-hidden", "true"); couche.className = styles.texte; feuille.className = styles.feuille;
    feuille.append(canvas, couche); conteneur.current?.replaceChildren(feuille);
    async function afficher() {
      try {
        page = await pdf.getPage(numero);
        if (annule) { page.cleanup(); return; }
        const initial = page.getViewport({ scale: 1 });
        const scale = largeur / initial.width * zoom, viewport = page.getViewport({ scale });
        const densite = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_777_216 / (viewport.width * viewport.height)));
        canvas.width = Math.max(1, Math.floor(viewport.width * densite)); canvas.height = Math.max(1, Math.floor(viewport.height * densite));
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        feuille.style.width = `${viewport.width}px`; feuille.style.height = `${viewport.height}px`;
        couche.style.setProperty("--total-scale-factor", String(scale * (viewport.userUnit || 1)));
        couche.style.setProperty("--scale-round-x", "1px"); couche.style.setProperty("--scale-round-y", "1px");
        const contexte = canvas.getContext("2d");
        if (!contexte) throw new Error("Canvas indisponible");
        rendu = page.render({ canvas, canvasContext: contexte, viewport, transform: [densite, 0, 0, densite, 0, 0], background: "white" });
        // Les scripts, formulaires actifs et liens du PDF ne sont pas exécutés.
        const contenuTexte = page.getTextContent().then(async contenu => {
          if (annule) return;
          texte = new moteur.TextLayer({ textContentSource: contenu, container: couche, viewport });
          await texte.render();
        });
        await Promise.all([rendu.promise, contenuTexte]);
        if (!annule) setEtat({ cle, termine: true });
      } catch (erreur) { if (!annule) setEtat({ cle, erreur: messageErreur(erreur) }); }
    }
    void afficher();
    return () => {
      annule = true; rendu?.cancel(); texte?.cancel();
      void Promise.resolve(rendu?.promise).catch(() => {}).then(() => { canvas.width = canvas.height = 0; page?.cleanup(); });
      feuille.remove();
    };
  }, [pdf, moteur, numero, zoom, largeur, cle]);
  const erreur = etat.cle === cle ? etat.erreur : undefined;
  return <>
    {erreur ? <div className={styles.vide}><p role="alert">{erreur}</p><button type="button" onClick={() => setEssai(e => e + 1)}><RotateCw size={16} />Réessayer</button></div> : (etat.cle !== cle || !etat.termine) && <p className={styles.etat} role="status">Préparation de la page…</p>}
    <div ref={conteneur} className={styles.pagePdf} role="document" aria-label={`Page ${numero} sur ${pdf.numPages}`} hidden={Boolean(erreur)} />
  </>;
}

/** Une session par fichier : aucune réponse d'un ancien document ne remplace le document courant. */
export function LecteurDocument(props: Props) {
  return <SessionLecteur key={props.fichier} {...props} />;
}

function SessionLecteur({ fichier, titre, mime, presentation = "standard" }: Props) {
  const [documentLu, setDocumentLu] = useState<DocumentLu>({ type: "chargement" });
  const [essai, setEssai] = useState(0), [page, setPage] = useState(1), [zoom, setZoom] = useState(1);
  const [agrandi, setAgrandi] = useState(false), [largeur, setLargeur] = useState(0);
  const [telechargement, setTelechargement] = useState(false), [erreurTelechargement, setErreurTelechargement] = useState("");
  const dialogue = useRef<HTMLDialogElement>(null), zone = useRef<HTMLDivElement>(null);
  const boutonAgrandir = useRef<HTMLButtonElement>(null), etaitAgrandi = useRef(false);
  const abortTelechargement = useRef<AbortController | null>(null), urlTelechargement = useRef<string | null>(null);
  const nom = useRef(titre);

  useEffect(() => {
    const controle = new AbortController();
    let tache: PDFDocumentLoadingTask | undefined, urlImage: string | undefined;
    async function charger() {
      try {
        const reponse = await fetch(routeFichier(fichier, "apercu"), { signal: controle.signal, credentials: "same-origin", cache: "no-store", redirect: "error" });
        if (reponse.status === 401 || reponse.status === 403) throw new ErreurLecture("L’accès à ce document a expiré ou n’est plus autorisé. Rechargez le dossier.");
        if (reponse.status === 415) throw new ErreurLecture("Ce format ne peut pas être affiché ici. Vous pouvez le télécharger.");
        if (!reponse.ok) throw new ErreurLecture("Le document est indisponible. Réessayez.");
        const meta = await reponse.json() as { url?: unknown; mime?: unknown; nom?: unknown };
        const format = typeof meta.mime === "string" ? meta.mime.split(";")[0].toLowerCase() : mime;
        if (!format || !FORMATS.has(format) || typeof meta.url !== "string") throw new ErreurLecture("Ce format ne peut pas être affiché ici. Vous pouvez le télécharger.");
        const cible = new URL(meta.url);
        if (cible.username || cible.password || (cible.protocol !== "https:" && !(cible.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(cible.hostname)))) throw new ErreurLecture("L’accès à ce document est indisponible.");
        const donnees = await lireOctets(await fetch(cible.href, { signal: controle.signal, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" }), controle.signal);
        controle.signal.throwIfAborted();
        if (typeof meta.nom === "string" && meta.nom.trim()) nom.current = meta.nom;
        if (format === "application/pdf") {
          const moteur = await import("pdfjs-dist");
          controle.signal.throwIfAborted();
          moteur.GlobalWorkerOptions.workerSrc = `${ASSETS}pdf.worker.min.mjs`;
          const options = { data: donnees, cMapUrl: `${ASSETS}cmaps/`, cMapPacked: true, standardFontDataUrl: `${ASSETS}standard_fonts/`, wasmUrl: `${ASSETS}wasm/`, iccUrl: `${ASSETS}iccs/`, enableXfa: false, isEvalSupported: false, canvasMaxAreaInBytes: 32 * 1024 * 1024 };
          tache = moteur.getDocument(options);
          const pdf = await tache.promise;
          if (!controle.signal.aborted) { setPage(1); setDocumentLu({ type: "pdf", pdf, moteur }); }
        } else {
          urlImage = URL.createObjectURL(new Blob([donnees], { type: format }));
          setDocumentLu({ type: "image", url: urlImage });
        }
      } catch (erreur) { if (!controle.signal.aborted) setDocumentLu({ type: "erreur", message: messageErreur(erreur) }); }
    }
    void charger();
    return () => { controle.abort(); void tache?.destroy().catch(() => {}); if (urlImage) URL.revokeObjectURL(urlImage); };
  }, [fichier, mime, essai]);

  useEffect(() => {
    const element = zone.current;
    if (!element) return;
    const observer = new ResizeObserver(([entree]) => setLargeur(Math.max(1, Math.floor(entree.contentRect.width - 24))));
    observer.observe(element); return () => observer.disconnect();
  }, []);

  // Le dialogue natif garde le même canvas dans la top layer : agrandir ne recharge ni ne déplace le document React.
  useEffect(() => {
    const element = dialogue.current;
    if (!element) return;
    if (agrandi) {
      if (element.open) element.close();
      element.showModal();
      etaitAgrandi.current = true; boutonAgrandir.current?.focus({ preventScroll: true });
      const avant = document.body.style.overflow; document.body.style.overflow = "hidden";
      return () => { if (element.open) element.close(); document.body.style.overflow = avant; };
    }
    if (!element.open) element.show();
    if (etaitAgrandi.current) { etaitAgrandi.current = false; boutonAgrandir.current?.focus({ preventScroll: true }); }
  }, [agrandi]);

  useEffect(() => () => { abortTelechargement.current?.abort(); if (urlTelechargement.current) URL.revokeObjectURL(urlTelechargement.current); }, []);

  async function telecharger() {
    if (telechargement) return;
    const controle = new AbortController(); abortTelechargement.current = controle;
    setTelechargement(true); setErreurTelechargement("");
    try {
      // Ce passage par la route authentifiée conserve la trace de téléchargement côté serveur.
      const reponse = await fetch(routeFichier(fichier, "telechargement"), { signal: controle.signal, credentials: "same-origin", cache: "no-store", redirect: "follow" });
      const format = reponse.headers.get("content-type")?.split(";")[0].toLowerCase();
      if (!reponse.ok || format === "text/html" || format === "application/json") throw new ErreurLecture("Le téléchargement n’a pas pu être confirmé. Réessayez.");
      const donnees = await lireOctets(reponse, controle.signal);
      if (urlTelechargement.current) URL.revokeObjectURL(urlTelechargement.current);
      const url = URL.createObjectURL(new Blob([donnees], { type: format || mime || "application/octet-stream" })); urlTelechargement.current = url;
      const disposition = reponse.headers.get("content-disposition");
      let nomFichier = nom.current;
      const nomUtf8 = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1], nomSimple = disposition?.match(/filename="([^"]+)"/i)?.[1];
      if (nomUtf8) { try { nomFichier = decodeURIComponent(nomUtf8); } catch {} } else if (nomSimple) nomFichier = nomSimple;
      if (!/\.[a-z0-9]{2,6}$/i.test(nomFichier)) nomFichier += format === "application/pdf" ? ".pdf" : format === "image/png" ? ".png" : format === "image/jpeg" ? ".jpg" : "";
      const lien = document.createElement("a"); lien.href = url; lien.download = nomFichier.replace(/[\\/\u0000-\u001f]/g, "_"); lien.style.display = "none";
      document.body.append(lien); lien.click(); lien.remove();
    } catch (erreur) { if (!controle.signal.aborted) setErreurTelechargement(messageErreur(erreur)); }
    finally { if (!controle.signal.aborted) setTelechargement(false); }
  }

  const pret = documentLu.type === "pdf" || documentLu.type === "image";
  return <dialog ref={dialogue} open={!agrandi} className={`${styles.lecteur} ${presentation === "fiche" ? styles.fiche : ""} ${agrandi ? styles.agrandi : ""}`} role={agrandi ? "dialog" : "region"} aria-modal={agrandi || undefined} aria-label={`Aperçu : ${titre}`} onCancel={e => { e.preventDefault(); setAgrandi(false); }}>
    <div className={styles.barre}>
      {documentLu.type === "pdf" && <div className={styles.groupe} aria-label="Pages du document">
        {(presentation !== "fiche" || documentLu.pdf.numPages > 1) && <button type="button" aria-label="Page précédente" title="Page précédente" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={18} /></button>}
        <span className={styles.pagination} role="status">{presentation === "fiche" && documentLu.pdf.numPages === 1 ? "1 page" : `${page} / ${documentLu.pdf.numPages}`}</span>
        {(presentation !== "fiche" || documentLu.pdf.numPages > 1) && <button type="button" aria-label="Page suivante" title="Page suivante" disabled={page >= documentLu.pdf.numPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={18} /></button>}
      </div>}
      {pret && <div className={styles.groupe} aria-label="Zoom du document">
        <button type="button" aria-label="Zoom arrière" title="Zoom arrière" disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><Minus size={17} /></button>
        <span className={styles.pourcentage}>{Math.round(zoom * 100)} %</span>
        <button type="button" aria-label="Zoom avant" title="Zoom avant" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.25))}><Plus size={17} /></button>
        <button type="button" aria-label="Ajuster à la largeur" title="Ajuster à la largeur" onClick={() => setZoom(1)}><Scan size={17} /></button>
      </div>}
      <div className={`${styles.groupe} ${styles.actions}`}>
        <button ref={boutonAgrandir} type="button" onClick={() => setAgrandi(a => !a)} aria-label={agrandi ? "Réduire" : "Agrandir"} title={agrandi ? "Réduire" : "Agrandir"}>{agrandi ? <Minimize2 size={17} /> : <Maximize2 size={17} />}<span>{agrandi ? "Réduire" : "Agrandir"}</span></button>
        <button type="button" onClick={() => void telecharger()} disabled={telechargement}><Download size={17} /><span>{telechargement ? "Téléchargement…" : "Télécharger"}</span></button>
      </div>
    </div>
    {erreurTelechargement && <p role="alert" className={styles.erreur}>{erreurTelechargement}</p>}
    <div ref={zone} className={styles.zone} tabIndex={0} aria-label="Contenu du document">
      {documentLu.type === "chargement" && <p className={styles.etat} role="status">Chargement du document…</p>}
      {documentLu.type === "erreur" && <div className={styles.vide}><p role="alert">{documentLu.message}</p><button type="button" onClick={() => { setDocumentLu({ type: "chargement" }); setEssai(e => e + 1); }}><RotateCw size={16} />Réessayer</button></div>}
      {documentLu.type === "pdf" && <PagePdf pdf={documentLu.pdf} moteur={documentLu.moteur} numero={page} zoom={zoom} largeur={largeur} />}
      {documentLu.type === "image" && <div className={styles.imageCadre} style={{ width: `${Math.max(1, largeur) * zoom}px` }}>
        {/* Blob local déjà contrôlé ; next/image ne doit ni transférer ni mettre en cache le document privé. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={documentLu.url} alt={titre} className={styles.image} onError={() => setDocumentLu({ type: "erreur", message: "Cette image n’a pas pu être affichée. Vous pouvez la télécharger." })} />
      </div>}
    </div>
  </dialog>;
}

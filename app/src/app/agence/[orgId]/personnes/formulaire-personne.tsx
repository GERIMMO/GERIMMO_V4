"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { UserRoundPlus, ContactRound, MapPin, ClipboardCheck, Files, CheckCircle2, ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { creerPersonne } from "@/app/actions/personnes";
import { deposerPieceDossier } from "@/app/actions/dossier";
import { demanderPieceLocataire } from "@/app/actions/pieces-demandees";
import { enregistrerFicheAvecJustificatifs, erreurJustificatif, type BilanCreationFiche, type JustificatifPrepare } from "@/lib/creation-fiche-personne";
import { JustificatifsPersonne } from "./justificatifs-personne";
import { Button } from "@/components/ui/button";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ComboboxLot } from "@/components/combobox-lot";
import { IconeTrait } from "@/components/icone-trait";
import { NavigationParcours } from "@/components/navigation-parcours";
import { formaterDate } from "@/lib/ged";
import parcours from "@/components/presentation-parcours.module.css";
import styles from "./creation-personne.module.css";

export type LotRattachable = { id: string; libelle: string };
const ROLES = [
  { cle: "locataire", libelle: "Locataire", sous: "Occupe un logement", icone: "maison" },
  { cle: "proprietaire_mandant", libelle: "Propriétaire mandant", sous: "Confie la gestion à l’agence", icone: "cles" },
  { cle: "garant", libelle: "Garant", sous: "Se porte caution d’un locataire", icone: "gens" },
];
const ETAPES = [
  { titre: "Rôle", detail: "Choisir le rôle de la personne", icone: UserRoundPlus },
  { titre: "Identité", detail: "Renseigner les informations personnelles", icone: ContactRound },
  { titre: "Coordonnées", detail: "Indiquer les contacts et l’adresse", icone: MapPin },
  { titre: "Justificatifs", detail: "Déposer les pièces ou préparer une demande — Facultatif", icone: Files },
  { titre: "Récapitulatif", detail: "Relire les informations avant de créer la fiche", icone: ClipboardCheck },
];
const VIDE = { nom:"", prenom:"", date_naissance:"", commune_naissance:"", email:"", telephone:"", address_line1:"", postal_code:"", city:"" };
type Champ = keyof typeof VIDE;

export function FormulairePersonne({ orgId, lots, estBailleurDirect = false, dansParcours = false }: {
  orgId: string; lots: LotRattachable[]; estBailleurDirect?: boolean; dansParcours?: boolean;
}) {
  const [pieces, setPieces] = useState<JustificatifPrepare[]>([]);
  const [etat, formAction, enCours] = useActionState<BilanCreationFiche, FormData>(
    (precedent, data) => enregistrerFicheAvecJustificatifs(orgId, data, pieces, precedent, {
      creer: creerPersonne, deposer: deposerPieceDossier, demander: demanderPieceLocataire,
    }), {}
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const titre = useRef<HTMLHeadingElement>(null);
  const [role, setRole] = useState<string | null>(null);
  const [etape, setEtape] = useState(0);
  const [morale, setMorale] = useState(false);
  const [valeurs, setValeurs] = useState(VIDE);
  const [emailCorrect, setEmailCorrect] = useState(false);
  const [lotResume, setLotResume] = useState("");
  const estProprio = role === "proprietaire_mandant";
  const personneMorale = estProprio && morale;
  const roles = estBailleurDirect ? ROLES.filter(r => r.cle !== "proprietaire_mandant") : ROLES;

  function afficher(numero: number) {
    flushSync(() => setEtape(numero));
    titre.current?.focus({preventScroll:true});
    navigation.current?.scrollIntoView({block:"start"});
  }
  function valider(numero: number) {
    if (numero === 3 && pieces.some(p => !etat.pieces?.[p.id]?.succes && erreurJustificatif(p))) {
      afficher(3); return false;
    }
    const invalide = formulaire.current?.querySelector<HTMLInputElement>(`[data-etape-personne="${numero}"] :is(input,select,textarea):enabled:invalid`);
    if (!invalide) return true;
    afficher(numero); invalide.focus(); invalide.reportValidity(); return false;
  }
  function changer(numero: number) {
    if (enCours || (etat.personneCreee && numero < 3)) return;
    if (numero > 0 && !role) { afficher(0); return; }
    for (let i=1; i<numero; i++) if (!valider(i)) return;
    if (numero === 4) {
      const lotId = new FormData(formulaire.current!).get("lot_id");
      setLotResume(lots.find(l => l.id === lotId)?.libelle ?? "Aucun lot sélectionné");
    }
    afficher(numero);
  }
  function soumettre(event: FormEvent<HTMLFormElement>) {
    if (etape < 4) { event.preventDefault(); changer(etape+1); return; }
    if (!role || !valider(1) || !valider(2) || !valider(3)) { event.preventDefault(); return; }
  }
  const nomsIdentite: Champ[] = personneMorale ? ["nom"] : ["nom","prenom","date_naissance","commune_naissance"];
  const emailValide = valeurs.email.trim() !== "" && emailCorrect;
  const restants = [role ? 0 : 1, nomsIdentite.filter(n => !valeurs[n].trim()).length, ["address_line1","postal_code","city"].filter(n => !valeurs[n as Champ].trim()).length + (emailValide ? 0 : 1)];
  const Icone = ETAPES[etape].icone;
  function champ(nom: Champ, libelle: string, options: {type?: string; facultatif?: boolean; max?: number; autoComplete?: string; large?: boolean; aide?: string} = {}) {
    return <div className={`${styles.champ} ${options.large ? styles.large : ""}`}>
      <Label htmlFor={`p-${nom}`}>{libelle}{options.facultatif ? " — Facultatif" : " *"}</Label>
      <Input id={`p-${nom}`} name={nom} type={options.type ?? "text"} required={!options.facultatif} maxLength={options.max ?? 120} autoComplete={options.autoComplete}
        value={valeurs[nom]} onChange={e => {
          const valeur = e.currentTarget.value;
          const valide = e.currentTarget.validity.valid;
          setValeurs(v => ({...v,[nom]:valeur}));
          if (nom === "email") setEmailCorrect(valide);
        }} />
      {options.aide && <p>{options.aide}</p>}
    </div>;
  }
  if (etat.terminee && etat.personneCreee) {
    const href = `/agence/${orgId}/personnes/${etat.personneCreee.id}`;
    return <section className={`${parcours.cadre} ${styles.creationReussie}`} aria-label="Fiche créée">
      <CheckCircle2 size={38} aria-hidden="true" /><h2>La fiche est créée</h2><p>{[valeurs.prenom,valeurs.nom].filter(Boolean).join(" ")}</p>
      {etat.avertissement && <p role="status" className="text-warning-soft-foreground">{etat.avertissement}</p>}
      {etat.succes && etat.succes!=="Fiche créée." && <p role="status">{etat.succes}</p>}
      {pieces.length>0 && <ul>{pieces.map(p=><li key={p.id}><strong>{p.titre}</strong><span>{etat.pieces?.[p.id]?.succes}</span>{etat.pieces?.[p.id]?.avertissement && <span className="text-warning-soft-foreground">{etat.pieces[p.id].avertissement}</span>}</li>)}</ul>}
      <div className="flex flex-wrap gap-3"><Link className="btn-or" href={`${href}#pieces`}>Ouvrir la fiche</Link>{pieces.some(p=>p.mode==="demande") && <Link className="btn-secondaire" href={`${href}#acces-locataire`}>Inviter la personne</Link>}</div>
    </section>;
  }
  return <div ref={navigation} className={`assistant-location ${parcours.presentation} ${parcours.parcoursLot}`}>
    <NavigationParcours titre="Création d’une fiche" label="Étapes de la création d’une fiche" etape={etape} changer={changer} accessibles={role ? 5 : 1}
      etapes={ETAPES.map((e,i) => ({...e,...(i<3 ? {statut:restants[i] ? "incomplet" as const : "complet" as const, restant:restants[i]} : i===3 ? {statutLibelle: pieces.length ? `${pieces.length} préparé${pieces.length>1 ? "s" : ""}` : "Facultatif"} : {})}))} />
    {etat.succes && <p role="status" className="mb-4 text-sm text-success-soft-foreground">{etat.succes}</p>}
    {etat.avertissement && <p role="status" className="mb-4 text-sm text-warning-soft-foreground">{etat.avertissement}</p>}
    <form ref={formulaire} action={formAction} noValidate onSubmit={soumettre} onReset={e=>e.preventDefault()} className={`assistant-carte ${parcours.cadre} ${styles.formulaire}`}>
      <input type="hidden" name="role" value={role ?? ""} />
      {personneMorale && <input type="hidden" name="morale" value="on" />}
      {dansParcours && <input type="hidden" name="rester_dans_parcours" value="1" />}
      <header className={parcours.entete}><span className={parcours.icone}><Icone size={23} aria-hidden="true" /></span><div><span className={parcours.surtitre}>Étape {String(etape+1).padStart(2,"0")} / 5</span><h2 ref={titre} tabIndex={-1}>{ETAPES[etape].titre}</h2><p>{ETAPES[etape].detail}.</p></div>{role && <div className={parcours.resumeLot}><strong>{ROLES.find(r=>r.cle===role)?.libelle}</strong><p>{personneMorale ? valeurs.nom : [valeurs.prenom,valeurs.nom].filter(Boolean).join(" ")}</p></div>}</header>
      <div className={parcours.corps}>
        {(etape===1 || etape===2) && <p className={parcours.aide}><span className={parcours.legendePastille} aria-hidden="true" />Pastille rouge : information obligatoire à compléter.</p>}
        <div hidden={etape!==0}>
          <div className={styles.roles}>{roles.map(r=><button key={r.cle} type="button" disabled={enCours || Boolean(etat.personneCreee)} aria-pressed={role===r.cle} className={styles.role} onClick={()=>{setRole(r.cle); afficher(1);}}><span aria-hidden="true"><IconeTrait nom={r.icone} className="size-5" /></span><span><b>{r.libelle}</b><small>{r.sous}</small></span></button>)}</div>
          <p className={styles.note}>Une seule fiche par personne : les informations seront reprises lorsque vous la sélectionnerez dans un bail.</p>
        </div>
        {/* Ces panneaux restent montés pour conserver la saisie en revenant en arrière. */}
        <fieldset data-etape-personne="1" hidden={etape!==1} disabled={enCours || Boolean(etat.personneCreee)} className="min-w-0 space-y-5">
          <legend className="sr-only">Identité</legend>
          {estProprio && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={morale} onChange={e=>setMorale(e.target.checked)} />Personne morale (SCI, société…)</label>}
          <div className={styles.grille}>
            {champ("nom",personneMorale ? "Raison sociale" : "Nom",{autoComplete:personneMorale ? "organization" : "family-name",large:personneMorale})}
            <fieldset hidden={personneMorale} disabled={personneMorale} className="contents">{champ("prenom","Prénom",{autoComplete:"given-name"})}{champ("date_naissance","Date de naissance",{type:"date",autoComplete:"bday"})}{champ("commune_naissance","Commune de naissance")}</fieldset>
          </div>
        </fieldset>
        <fieldset data-etape-personne="2" hidden={etape!==2} disabled={enCours || Boolean(etat.personneCreee)} className="min-w-0 space-y-5">
          <legend className="sr-only">Coordonnées</legend>
          <div className={styles.grille}>
            {champ("email","Adresse email",{type:"email",max:200,autoComplete:"email",aide:"Une adresse email correspond à une seule fiche dans votre espace."})}
            {champ("telephone","Téléphone",{type:"tel",max:40,autoComplete:"tel",facultatif:true})}
            {champ("address_line1","Adresse",{max:200,autoComplete:"street-address",large:true})}
            {champ("postal_code","Code postal",{max:12,autoComplete:"postal-code"})}
            {champ("city","Ville",{autoComplete:"address-level2"})}
          </div>
          <fieldset hidden={!estProprio} disabled={!estProprio} className={styles.champ}>
            <Label htmlFor="p-lot">Rattacher à un lot de l’agence — Facultatif</Label><ComboboxLot lots={lots} id="p-lot" name="lot_id" />
            <p>Le propriétaire devient détenteur du lot à 100 %. Les quotes-parts se règlent dans la fiche du lot.</p>
          </fieldset>
        </fieldset>
        <div hidden={etape!==3} data-etape-personne="3">
          <JustificatifsPersonne pieces={pieces} changer={setPieces} resultats={etat.pieces} enCours={enCours} peutDemander={!estProprio} />
        </div>
        <div hidden={etape!==4} className="space-y-5">
          <div className={styles.recap}>
            <section><header><h3>Identité</h3><button type="button" onClick={()=>changer(1)}><Pencil size={13} aria-hidden="true" />Modifier</button></header><dl>
              <div><dt>Rôle</dt><dd>{ROLES.find(r=>r.cle===role)?.libelle}</dd></div><div><dt>{personneMorale ? "Raison sociale" : "Nom et prénom"}</dt><dd>{personneMorale ? valeurs.nom : [valeurs.prenom,valeurs.nom].filter(Boolean).join(" ")}</dd></div>
              {!personneMorale && <div><dt>Naissance</dt><dd>{valeurs.date_naissance ? formaterDate(valeurs.date_naissance) : "À compléter"} · {valeurs.commune_naissance}</dd></div>}
            </dl></section>
            <section><header><h3>Coordonnées</h3><button type="button" onClick={()=>changer(2)}><Pencil size={13} aria-hidden="true" />Modifier</button></header><dl>
              <div><dt>Email</dt><dd>{valeurs.email}</dd></div><div><dt>Téléphone</dt><dd>{valeurs.telephone || "Non renseigné · Facultatif"}</dd></div><div><dt>Adresse</dt><dd>{valeurs.address_line1}<br />{valeurs.postal_code} {valeurs.city}</dd></div>
              {estProprio && <div><dt>Lot à rattacher</dt><dd>{lotResume}</dd></div>}
            </dl></section>
          </div>
          <section className={styles.resumeDocuments}>
            <header><h3>Justificatifs</h3><button type="button" disabled={enCours} onClick={()=>changer(3)}><Pencil size={13} aria-hidden="true" />Modifier</button></header>
            {pieces.length ? <ul>{pieces.map(p => <li key={p.id}><span><strong>{p.titre}</strong>{p.mode==="depot" && <small>{p.fichier?.name}</small>}</span><span className={styles.documentBadge} data-etat={etat.pieces?.[p.id]?.succes ? "recu" : p.mode}>{etat.pieces?.[p.id]?.succes ? "Enregistré" : p.mode==="depot" ? "À déposer" : "Demande à préparer"}</span></li>)}</ul> : <p>Aucun document pour le moment. Le dossier pourra être complété depuis la fiche.</p>}
            {pieces.some(p=>p.mode==="demande") && <p>Après création, invitez la personne à Gerimmo pour qu’elle retrouve les demandes dans son espace.</p>}
          </section>
          {!estProprio && <p className={parcours.creationNote}>{role==="locataire" ? "Vous pourrez choisir cette personne comme locataire lors de la création du bail." : "Vous pourrez choisir ce garant dans le bail du locataire qu’il cautionne."}</p>}
        </div>
        {etat.personneCreee && <p className="mt-4 text-sm"><Link className="underline underline-offset-4" href={`/agence/${orgId}/personnes/${etat.personneCreee.id}#pieces`}>Ouvrir la fiche déjà créée</Link></p>}
        {etat.erreur && <p role="alert" className="mt-4 text-sm text-destructive">{etat.erreur}</p>}
      </div>
      <div className={`assistant-pied ${parcours.pied}`}>
        {etape>0 && (!etat.personneCreee || etape>3) ? <Button type="button" variant="outline" disabled={enCours} onClick={()=>changer(etape-1)}><ArrowLeft size={16} aria-hidden="true" />Précédent</Button> : <span />}
        {etape>0 && (etape<4 ? <Button type="button" disabled={enCours} onClick={()=>changer(etape+1)}>Suivant<ArrowRight size={16} aria-hidden="true" /></Button> : <BoutonEnvoi enCoursTexte="Enregistrement du dossier…">{etat.personneCreee ? "Reprendre les justificatifs" : "Créer la fiche"}</BoutonEnvoi>)}
      </div>
    </form>
  </div>;
}

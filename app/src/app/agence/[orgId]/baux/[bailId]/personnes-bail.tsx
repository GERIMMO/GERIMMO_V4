"use client";

import { useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { House, Users, ShieldCheck, Plus, Pencil, X, Check } from "lucide-react";
import { choisirPersonneBail, creerPersonneBail, modifierPersonneBail, retirerPersonneBail, type EtatPersonnesBail } from "@/app/actions/personnes-bail";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { SuiviEnregistrement } from "@/lib/suivi-enregistrement";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LabelBail as Label, PastilleBail, ProfilBailACompleter } from "@/components/pastille-bail";
import { QUALITES_BAILLEUR, estPersonnePhysique } from "@/lib/qualite-bailleur";
import { formaterDate } from "@/lib/ged";

export type PersonneBail = {
  id: string; nom: string; prenom: string | null; email: string | null; telephone: string | null;
  date_naissance: string | null; commune_naissance: string | null;
  address_line1: string | null; postal_code: string | null; city: string | null;
  qualite: string | null; archived_at: string | null;
};
export type DetentionBail = { id: string; person_id: string; quote_part: number; date_debut: string };
export type ParticipantBail = { id: string; person_id: string; role: string; garant_de: string | null };
type Role = "principal" | "colocataire" | "garant";
const nom = (p: PersonneBail) => [p.prenom, p.nom].filter(Boolean).join(" ");
const selectClasse = "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-sm";
function Retour({ etat }: { etat: EtatPersonnesBail }) {
  return <>{etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}{etat.avertissement && <p role="status" className="text-sm text-warning-soft-foreground">{etat.avertissement}</p>}</>;
}
function ResumePersonne({ personne: p, badge, actions }: { personne: PersonneBail; badge?: string; actions?: ReactNode }) {
  const adresse = [p.address_line1, [p.postal_code, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return <div className="bail-personne-resume">
    <span className="bail-personne-avatar" aria-hidden="true">{[p.prenom?.[0], p.nom[0]].filter(Boolean).join("")}</span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><strong>{nom(p)}</strong>{badge && <span className="puce puce-grise">{badge}</span>}</div>
      <p className="mt-1 break-words text-sm text-muted-foreground">{[p.email, p.telephone].filter(Boolean).join(" · ") || "Coordonnées à compléter"}</p>
      <p className="mt-1 break-words text-xs text-muted-foreground">{adresse || "Adresse à compléter"}</p>
      {p.prenom && <p className="mt-1 text-xs text-muted-foreground">Naissance : {p.date_naissance ? formaterDate(p.date_naissance) : "date à compléter"}{p.commune_naissance ? ` · ${p.commune_naissance}` : " · commune à compléter"}</p>}
      {p.archived_at && <p className="mt-1 text-xs text-destructive">Fiche archivée : choisissez une personne active.</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap gap-1">{actions}</div>}
  </div>;
}

function EditerPersonne({ orgId, bailId, personne, proprietaire, garant = false, enregistrer, annuler }: {
  orgId: string; bailId: string; personne?: PersonneBail; proprietaire: boolean; garant?: boolean;
  enregistrer: (p: PersonneBail, avertissement?: string) => void; annuler: () => void;
}) {
  const id = `personne-bail-${personne?.id ?? "nouvelle"}`;
  const [morale, setMorale] = useState(personne ? !estPersonnePhysique(personne.qualite, personne.prenom) : false);
  const { etat, enCours, soumettre } = useActionFormulaire<EtatPersonnesBail>(async (precedent, donnees) => {
    const retour = personne ? await modifierPersonneBail(orgId, bailId, personne.id, precedent, donnees) : await creerPersonneBail(orgId, bailId, precedent, donnees);
    const personId = personne?.id ?? retour.personneCreee?.id;
    if (retour.succes && personId) {
      const valeur = (champ: string) => String(donnees.get(champ) ?? "").trim() || null;
      enregistrer({ id: personId, nom: valeur("nom")!, prenom: morale ? null : valeur("prenom"), email: valeur("email"), telephone: valeur("telephone"),
        date_naissance: morale ? null : valeur("date_naissance"), commune_naissance: morale ? null : valeur("commune_naissance"), address_line1: valeur("address_line1"),
        postal_code: valeur("postal_code"), city: valeur("city"), qualite: valeur("qualite") ?? (morale ? "Personne morale" : "Personne physique"), archived_at: null }, retour.avertissement);
    }
    return retour;
  });
  const champs = [
    { name: "nom", label: morale ? "Raison sociale" : "Nom", required: true, max: 120 },
    ...(!morale ? [{ name: "prenom", label: "Prénom", required: true, max: 120 }] : []),
    { name: "email", label: "Adresse e-mail", required: true, type: "email", max: 200 },
    { name: "telephone", label: "Téléphone — Facultatif", type: "tel", max: 40 },
    ...(!morale ? [{ name: "date_naissance", label: "Date de naissance", required: true, type: "date" }, { name: "commune_naissance", label: "Commune de naissance", required: true, max: 120 }] : []),
    { name: "address_line1", label: "Adresse", required: true, max: 200 },
    { name: "postal_code", label: "Code postal", required: true, max: 12 },
    { name: "city", label: "Ville", required: true, max: 120 },
  ];
  return <form onSubmit={soumettre} className="bail-personne-formulaire space-y-4">
    <p className="font-semibold">{personne ? `Compléter la fiche de ${nom(personne)}` : "Créer une personne"}</p>
    {!personne && proprietaire && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={morale} onChange={e => setMorale(e.target.checked)} />Il s’agit d’une société</label>}
    {morale && <input type="hidden" name="morale" value="on" />}
    <div className="grid gap-3 sm:grid-cols-2">{champs.map(c => <div key={c.name} className={c.name === "address_line1" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={`${id}-${c.name}`} champ={`${proprietaire ? "proprietaire" : garant ? "garant" : "locataire"}.${c.name}`} renseigne={Boolean(personne?.[c.name as keyof PersonneBail])}>{c.label}{c.required ? " *" : ""}</Label>
      <Input id={`${id}-${c.name}`} name={c.name} required={c.required} type={c.type ?? "text"} maxLength={c.max}
        defaultValue={personne?.[c.name as keyof PersonneBail] ?? ""} />
    </div>)}
      {personne && proprietaire ? <div className="space-y-1.5"><Label htmlFor={`${id}-qualite`} champ="proprietaire.qualite" renseigne={Boolean(personne.qualite)}>Qualité du propriétaire *</Label><select id={`${id}-qualite`} name="qualite" className={selectClasse} required defaultValue={personne.qualite ?? (morale ? "Personne morale" : "Personne physique")}>{QUALITES_BAILLEUR.map(q => <option key={q}>{q}</option>)}</select></div> : <input type="hidden" name="qualite" value={personne?.qualite ?? (morale ? "Personne morale" : "Personne physique")} />}
    </div>
    <p className="text-xs text-muted-foreground">* Informations nécessaires au dossier. La fiche est aussi disponible dans « Locataires & garants ».</p>
    <Retour etat={etat} />
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={enCours}>{enCours ? "Enregistrement…" : personne ? "Enregistrer la fiche" : "Créer cette personne"}</Button><Button type="button" variant="ghost" disabled={enCours} onClick={annuler}>Annuler</Button></div>
  </form>;
}

function ChoisirPersonne({ orgId, bailId, role, personnes, principalId, couvrables, enregistrerLocal, choisir, fermer }: {
  orgId: string; bailId: string; role: Role; personnes: PersonneBail[]; principalId: string | null; couvrables: PersonneBail[];
  enregistrerLocal: (p: PersonneBail) => void; choisir: (p: PersonneBail) => void; fermer: () => void;
}) {
  const [selection, setSelection] = useState("");
  const [nouvelle, setNouvelle] = useState(false);
  const [creee, setCreee] = useState<PersonneBail | null>(null);
  const [avertissement, setAvertissement] = useState<string>();
  const personne = personnes.find(p => p.id === selection) ?? (creee?.id === selection ? creee : null);
  const libelle = role === "garant" ? "garant" : "locataire";
  const { etat, enCours, soumettre } = useActionFormulaire<EtatPersonnesBail>(async (precedent, donnees) => {
    if (!personne) return { erreur: "Choisissez une personne." };
    const retour = await choisirPersonneBail(orgId, bailId, precedent, donnees);
    if (retour.succes) choisir(personne);
    return retour;
  });
  if (nouvelle) return <EditerPersonne orgId={orgId} bailId={bailId} proprietaire={false} garant={role === "garant"} enregistrer={(p, message) => {
    setAvertissement(message); enregistrerLocal(p); setCreee(p); setSelection(p.id); setNouvelle(false);
  }} annuler={() => setNouvelle(false)} />;
  const choix = creee && !personnes.some(p => p.id === creee.id) ? [...personnes, creee] : personnes;
  return <form onSubmit={soumettre} className="bail-personne-formulaire space-y-3">
    <input type="hidden" name="role" value={role} /><input type="hidden" name="principal_attendu" value={principalId ?? ""} />
    <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1 basis-60 space-y-1.5">
      <Label htmlFor={`choix-bail-${role}`}>Choisir un {libelle} enregistré</Label>
      <select className={selectClasse} id={`choix-bail-${role}`} name="person_id" value={selection} onChange={e => setSelection(e.target.value)} required>
        <option value="">Sélectionner dans mes personnes…</option>{choix.map(p => <option key={p.id} value={p.id}>{nom(p)}{p.email ? ` — ${p.email}` : ""}</option>)}
      </select></div><Button type="button" variant="outline" onClick={() => setNouvelle(true)}><Plus size={15} />Créer une personne</Button>
    </div>
    {choix.length === 0 && <p className="text-sm text-muted-foreground">Aucune personne disponible. Créez sa fiche ici pour l’utiliser dans ce bail.</p>}
    {avertissement && <p role="status" className="text-sm text-warning-soft-foreground">{avertissement}</p>}
    {personne && <ResumePersonne personne={personne} badge="Sélectionné" />}
    {role === "garant" && <div className="space-y-1.5"><Label htmlFor="garant-couvre">Ce garant couvre</Label><select id="garant-couvre" name="garant_de" required className={selectClasse} defaultValue={principalId ?? ""}><option value="">Choisir le locataire…</option>{couvrables.map(p => <option key={p.id} value={p.id}>{nom(p)}</option>)}</select></div>}
    <Retour etat={etat} /><div className="flex flex-wrap gap-2"><Button type="submit" disabled={enCours || !personne}>{enCours ? "Enregistrement…" : role === "principal" ? "Utiliser ce locataire" : `Ajouter ce ${libelle}`}</Button><Button type="button" variant="ghost" disabled={enCours} onClick={fermer}>Annuler</Button></div>
  </form>;
}

export function PersonnesBail({ orgId, bailId, personnes, detentions, participants, principalId, personneConnecteeId, colocation, proprietairesHref }: {
  orgId: string; bailId: string; personnes: PersonneBail[]; detentions: DetentionBail[]; participants: ParticipantBail[];
  principalId: string | null; personneConnecteeId: string | null; colocation: boolean; proprietairesHref: string;
}) {
  const router = useRouter();
  const notifier = useContext(SuiviEnregistrement);
  const [locales, setLocales] = useState<PersonneBail[]>([]);
  const annuaire = personnes.map(p => locales.find(l => l.id === p.id) ?? p).concat(locales.filter(l => !personnes.some(p => p.id === l.id)));
  const parId = (id: string | null) => annuaire.find(p => p.id === id);
  const [ouvert, setOuvert] = useState<Role | null>(null);
  const [edition, setEdition] = useState<string | null>(null);
  const [retour, setRetour] = useState<EtatPersonnesBail>({});
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const proprietaires = detentions.map(d => d.person_id);
  const locataires = [principalId, ...participants.filter(p => p.role === "colocataire").map(p => p.person_id)].filter((id): id is string => Boolean(id));
  const garants = participants.filter(p => p.role === "garant");
  const enregistrerLocal = (p: PersonneBail) => setLocales(l => [...l.filter(x => x.id !== p.id), p]);
  const actualiser = () => { router.refresh(); notifier?.(); };
  function selectionner() {
    setRetour({ succes: ouvert === "garant" ? "Garant ajouté au bail." : "Locataire enregistré." }); actualiser();
    setOuvert(null);
  }
  async function retirer(ligne: ParticipantBail) {
    if (retraitEnCours) return;
    setRetraitEnCours(true);
    try { const resultat = await retirerPersonneBail(orgId, bailId, ligne.id); setRetour(resultat); if (resultat.succes) actualiser(); }
    catch { setRetour({ erreur: "Le retrait n’a pas pu être confirmé. Rechargez le dossier." }); }
    finally { setRetraitEnCours(false); }
  }
  function carte(id: string, badge: string, proprietaire = false, ligne?: ParticipantBail) {
    const p = parId(id);
    if (!p) return <p role="alert" key={id}>La fiche de cette personne est indisponible.</p>;
    const incomplet = !p.address_line1 || !p.postal_code || !p.city || !p.email || (p.prenom && (!p.date_naissance || !p.commune_naissance));
    return <div key={id} id={`completer-personne-${id}`} className="space-y-3">
      <ResumePersonne personne={p} badge={id === personneConnecteeId ? `${badge} · Vous` : badge} actions={<>
        <Button type="button" variant="ghost" size="sm" onClick={() => setEdition(edition === id ? null : id)} aria-label={`${incomplet ? "Compléter" : "Modifier"} la fiche de ${nom(p)}`}><Pencil size={14} />{incomplet ? "Compléter" : "Modifier"}<PastilleBail champ={Object.entries(p).filter(([,v])=>v==null||v==="").map(([k])=>`${proprietaire ? "proprietaire" : ligne?.role === "garant" ? "garant" : "locataire"}.${k}`)}/></Button>
        {ligne && <Button type="button" variant="ghost" size="sm" disabled={retraitEnCours} onClick={() => retirer(ligne)} aria-label={`Retirer ${nom(p)} du bail`}><X size={14} /></Button>}
      </>} />
      {edition === id && <EditerPersonne orgId={orgId} bailId={bailId} personne={p} proprietaire={proprietaire} garant={ligne?.role === "garant"} enregistrer={maj => { enregistrerLocal(maj); setEdition(null); actualiser(); }} annuler={() => setEdition(null)} />}
    </div>;
  }
  const exclus = new Set([...proprietaires, ...locataires, ...garants.map(p => p.person_id)]);
  const choix = annuaire.filter(p => !p.archived_at && !exclus.has(p.id));
  function selecteur(role: Role) {
    return ouvert === role && <ChoisirPersonne key={role} orgId={orgId} bailId={bailId} role={role} personnes={choix} principalId={principalId}
      couvrables={locataires.map(id => parId(id)).filter((p): p is PersonneBail => Boolean(p))} enregistrerLocal={enregistrerLocal} choisir={selectionner} fermer={() => setOuvert(null)} />;
  }
  return <div id="completer-personnes" className="bail-personnes space-y-5">
    <p className="text-sm text-muted-foreground">Retrouvez vos personnes enregistrées ou créez une fiche ici. Leurs informations sont reprises dans le bail.</p>
    <Retour etat={retour} />
    <ProfilBailACompleter orgId={orgId}/>
    <section className="bail-personnes-section bail-personnes-proprietaires" aria-labelledby="titre-proprietaires-bail">
      <div className="bail-personnes-entete"><span className="bail-personnes-icone"><House size={19} /></span><div><h3 id="titre-proprietaires-bail">{detentions.length > 1 ? "Propriétaires · Indivision" : "Propriétaire"}</h3><p>{personneConnecteeId && proprietaires.includes(personneConnecteeId) ? "Votre fiche est reprise automatiquement depuis votre compte." : "La répartition est reprise du lot. Aucune nouvelle saisie n’est nécessaire."}</p></div></div>
      {detentions.map(d => carte(d.person_id, `${d.quote_part} %`, true))}
      {!detentions.length && <p className="text-sm text-muted-foreground"><PastilleBail manquant />Ajoutez les propriétaires dans la fiche du lot.</p>}
      <Link className="btn-secondaire" href={proprietairesHref}>Gérer les propriétaires et l’indivision dans le lot</Link>
    </section>
    <section className="bail-personnes-section bail-personnes-locataires" aria-labelledby="titre-locataires-bail">
      <div className="bail-personnes-entete"><span className="bail-personnes-icone"><Users size={19} /></span><div><h3 id="titre-locataires-bail">Locataire{colocation ? "s" : ""}</h3><p>Choisissez dans « Locataires & garants » ou créez une nouvelle fiche.</p></div></div>
      {principalId ? carte(principalId, "Locataire principal") : <p className="text-sm text-muted-foreground"><PastilleBail manquant/> Choisissez le locataire de ce bail.</p>}
      {participants.filter(p => p.role === "colocataire").map(p => carte(p.person_id, "Colocataire", false, p))}
      {ouvert !== "principal" && <Button type="button" variant="outline" onClick={() => setOuvert("principal")}>{principalId ? "Changer de locataire" : "Choisir un locataire"}</Button>}
      {selecteur("principal")}
      {colocation && principalId && ouvert !== "colocataire" && <Button type="button" variant="outline" onClick={() => setOuvert("colocataire")}><Plus size={15} />Ajouter un colocataire</Button>}
      {selecteur("colocataire")}
      {!colocation && <p className="text-xs text-muted-foreground">Plusieurs locataires sur ce bail ? <a className="underline underline-offset-2" href="#etape-bail-1">Choisir un contrat de colocation à l’étape Le bail.</a></p>}
    </section>
    <section className="bail-personnes-section bail-personnes-garants" aria-labelledby="titre-garants-bail">
      <div className="bail-personnes-entete"><span className="bail-personnes-icone"><ShieldCheck size={19} /></span><div><h3 id="titre-garants-bail">Garants <span className="text-xs font-normal text-muted-foreground">· Facultatif</span></h3><p>Ajoutez un ou plusieurs garants et précisez le locataire couvert.</p></div></div>
      {garants.length ? garants.map(p => carte(p.person_id, `Garant de ${parId(p.garant_de) ? nom(parId(p.garant_de)!) : "locataire à préciser"}`, false, p)) : <p className="text-sm text-muted-foreground">Aucun garant ajouté.</p>}
      {ouvert !== "garant" && <Button type="button" variant="outline" disabled={!principalId} onClick={() => setOuvert("garant")}><Plus size={15} />Ajouter un garant</Button>}
      {!principalId && <p className="text-xs text-muted-foreground">Choisissez d’abord le locataire.</p>}{selecteur("garant")}
    </section>
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Check size={14} />Les personnes déjà enregistrées restent disponibles pour vos autres baux.</p>
  </div>;
}

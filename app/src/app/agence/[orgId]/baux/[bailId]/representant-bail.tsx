"use client";
import {useActionState} from "react";
import {designerRepresentantBail} from "@/app/actions/personnes-bail";
type Choix={id:string;libelle:string};
export function RepresentantBail({org,bail,societe,personnes,pieces,actuel,fiche}:{org:string;bail:string;societe:Choix;personnes:Choix[];pieces:Choix[];actuel?:{personne_id:string;justificatif_id:string;fin_validite:string|null};fiche:string}){
 const [etat,action,pending]=useActionState(designerRepresentantBail.bind(null,org,bail,societe.id),{});
 return <form data-saisie-confirmee action={action} className="space-y-3 py-4"><h3>Qui signe pour {societe.libelle} ?</h3>
 <p>Le pouvoir vaut uniquement pour ce bail. Son justificatif reste sur la fiche de la société.</p>
 <label>Représentant <select name="personne" defaultValue={actuel?.personne_id??""} required><option value="">Choisir une personne</option>{personnes.map(p=><option key={p.id} value={p.id}>{p.libelle}</option>)}</select></label>
 <label> Justificatif du pouvoir <select name="justificatif" defaultValue={actuel?.justificatif_id??""} required><option value="">Choisir un PDF</option>{pieces.map(p=><option key={p.id} value={p.id}>{p.libelle}</option>)}</select></label>
 <p><a className="underline" href={fiche}>Ajouter un justificatif sur la fiche de la société</a></p>
 <label>Fin du pouvoir, si prévue <input type="date" name="fin" defaultValue={actuel?.fin_validite??""}/></label>
 <label className="block"><input type="checkbox" required name="verifie"/> J’ai vérifié que cette personne peut signer ce bail pour la société.</label>
 <button disabled={pending||!pieces.length}>Confirmer le représentant</button>{actuel && <button name="operation" value="retirer" formNoValidate disabled={pending}>Retirer le pouvoir</button>}
 {etat.erreur && <p role="alert">{etat.erreur}</p>}{etat.succes && <p role="status">{etat.succes}</p>}</form>;
}

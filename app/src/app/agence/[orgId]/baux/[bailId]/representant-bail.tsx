"use client";

import { useActionState } from "react";
import { completerPrenomRepresentantBail, designerRepresentantBail } from "@/app/actions/personnes-bail";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { LONGUEUR_MAX } from "@/lib/limites-saisie";

type Choix = { id: string; libelle: string };

function PrenomManquant({ org, bail, personne }: { org: string; bail: string; personne: Choix }) {
  const [etat, action, pending] = useActionState(completerPrenomRepresentantBail.bind(null, org, bail, personne.id), {});
  return <form data-saisie-confirmee action={action} className="space-y-2 rounded-md border p-3">
    <label className="block space-y-1">
      <span>Prénom de {personne.libelle}</span>
      <Input name="prenom" required maxLength={LONGUEUR_MAX.prenom} />
    </label>
    <BoutonEnvoi disabled={pending} variant="outline">Enregistrer le prénom</BoutonEnvoi>
    {etat.erreur && <p role="alert">{etat.erreur}</p>}
  </form>;
}

export function RepresentantBail({ org, bail, societe, personnes, personnesSansPrenom, pieces, actuel, fiche }: {
  org: string;
  bail: string;
  societe: Choix;
  personnes: Choix[];
  personnesSansPrenom: Choix[];
  pieces: Choix[];
  actuel?: { personne_id: string; justificatif_id: string; fin_validite: string | null };
  fiche: string;
}) {
  const [etat, action, pending] = useActionState(designerRepresentantBail.bind(null, org, bail, societe.id), {});
  const representantEnregistre = personnes.find(p => p.id === actuel?.personne_id);
  return <section className="space-y-3 py-4">
    <form data-saisie-confirmee action={action} className="space-y-3">
      <h3>Qui signe pour {societe.libelle} ?</h3>
      <p>Le pouvoir vaut uniquement pour ce bail. Son justificatif reste sur la fiche de la société.</p>
      {representantEnregistre && <p>Représentant enregistré pour ce bail : {representantEnregistre.libelle}</p>}
      <label>Représentant <select name="personne" defaultValue={actuel?.personne_id ?? ""} required>
        <option value="">Choisir une personne</option>
        {personnes.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}
      </select></label>
      <label> Justificatif du pouvoir <select name="justificatif" defaultValue={actuel?.justificatif_id ?? ""} required>
        <option value="">Choisir un PDF</option>
        {pieces.map(p => <option key={p.id} value={p.id}>{p.libelle}</option>)}
      </select></label>
      <p><a className="underline" href={fiche}>Ajouter un justificatif sur la fiche de la société</a></p>
      <label>Fin du pouvoir, si prévue <input type="date" name="fin" defaultValue={actuel?.fin_validite ?? ""} /></label>
      <label className="block"><input type="checkbox" required name="verifie" /> J’ai vérifié que cette personne peut signer ce bail pour la société.</label>
      <BoutonEnvoi disabled={pending || !pieces.length || !personnes.length}>Confirmer le représentant</BoutonEnvoi>
      {actuel && <BoutonEnvoi name="operation" value="retirer" formNoValidate disabled={pending}>Retirer le pouvoir</BoutonEnvoi>}
      {etat.erreur && <p role="alert">{etat.erreur}</p>}
      {etat.succes && <p role="status">{etat.succes}</p>}
    </form>
    {personnesSansPrenom.length > 0 && <div className="space-y-2">
      <p>Pour choisir une personne ci-dessous comme représentante, ajoutez d’abord son prénom. Vous pourrez ensuite confirmer son pouvoir avec le justificatif.</p>
      {personnesSansPrenom.map(personne => <PrenomManquant key={personne.id} org={org} bail={bail} personne={personne} />)}
    </div>}
    {!personnes.length && !personnesSansPrenom.length && <p>Ajoutez une personne dans l’annuaire pour pouvoir la choisir comme représentante.</p>}
  </section>;
}

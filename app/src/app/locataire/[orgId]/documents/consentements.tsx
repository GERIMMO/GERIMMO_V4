"use client";
import { useId, useState } from "react";
import { modifierConsentementDocument, type EtatConsentement } from "@/app/actions/consentements-documents";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function ConsentementsDocuments({ orgId, quittances, recommandes, email, retraitSeulement = false }: { retraitSeulement?: boolean; orgId: string; quittances: boolean; recommandes: boolean; email: string }) {
  return <details className="loc-carte"><summary className="cursor-pointer font-medium">Réception de mes documents</summary><div className="mt-4 space-y-5">
    <Choix retraitSeulement={retraitSeulement} orgId={orgId} email={email} nature="quittances" accepte={quittances} titre="Quittances et reçus de paiement" texte="J’accepte de recevoir mes quittances et reçus par voie électronique, à l’adresse e-mail indiquée ci-dessous. Sans cet accord, je peux demander un exemplaire papier à mon gestionnaire." />
    <Choix retraitSeulement={retraitSeulement} orgId={orgId} email={email} nature="recommandes" accepte={recommandes} titre="Recommandés électroniques" texte="J’accepte que mon bailleur m’adresse ses lettres recommandées par voie électronique à l’adresse e-mail indiquée ci-dessous. Cet accord est distinct de celui des quittances. Je peux le retirer pour les futurs envois." />
  </div></details>;
}
function Choix({ orgId, nature, accepte, titre, texte, email, retraitSeulement }: { retraitSeulement: boolean; orgId: string; nature: "quittances" | "recommandes"; accepte: boolean; titre: string; texte: string; email: string }) {
  const id = useId();
  const [courant, setCourant] = useState(accepte);
  const { etat, enCours, soumettre } = useActionFormulaire<EtatConsentement>(async (precedent, form) => {
    const resultat = await modifierConsentementDocument(orgId, nature, precedent, form);
    if (typeof resultat.accepte === "boolean") setCourant(resultat.accepte);
    return resultat;
  });
  return <form data-saisie-confirmee onSubmit={soumettre} aria-labelledby={`${id}-titre`} className="space-y-2"><h2 id={`${id}-titre`} className="font-medium">{titre}</h2><p className="text-sm text-muted-foreground">{texte}</p>
    <p className="text-sm">{courant ? "Accord électronique enregistré" : "Aucun accord électronique enregistré"}</p>
    <p className="text-sm break-all">Adresse : {email || "À renseigner auprès de votre gestionnaire"}</p><input type="hidden" name="email" value={email} /><input type="hidden" name="accepte" value={courant ? "non" : "oui"} />
    {(!retraitSeulement || courant) && <BoutonEnvoi type="submit" disabled={enCours || (!courant && !email)} variant="outline">{courant ? "Retirer mon accord" : "J’accepte la réception électronique"}</BoutonEnvoi>}
    {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}{etat.succes && <p role="status" className="text-sm">{etat.succes}</p>}
  </form>;
}

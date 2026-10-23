"use client";
import { useState, useTransition } from "react";
import { programmerFermetureCompte, simulerFermetureCompte, type BilanSimulationAffiche } from "@/app/actions/fermeture-compte";
import { useActionRetour } from "@/lib/use-action-retour";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { formaterDateParis } from "@/lib/heure-paris";

/** Sur une demande « Fermer mon compte » ou « effacement » : bilan sans effacement, puis programmation. */
export function ProgrammerFermeture({ accountId, demandeId }: { accountId: string; demandeId: string }) {
  const [simulation, setSimulation] = useState<BilanSimulationAffiche | null>(null);
  const [enLecture, lire] = useTransition();
  const { etat, soumettre, enCours } = useActionRetour(programmerFermetureCompte);
  const b = simulation?.bilan;
  if (etat.succes) return <p role="status" className="rounded-xl bg-success-soft p-3 text-sm">{etat.succes}</p>;
  return <section aria-label="Fermeture du compte" className="mt-4 space-y-3 border-t border-[var(--filet)] pt-4 text-sm">
    <h3>Fermeture du compte</h3>
    <button type="button" className="btn-secondaire" disabled={enLecture} onClick={() => lire(async () => {
      try { setSimulation(await simulerFermetureCompte(accountId)); }
      catch { setSimulation({ erreur: "Le bilan est indisponible. Rien n’a été programmé." }); }
    })}>{enLecture ? "Lecture…" : "Afficher le bilan sans rien effacer"}</button>
    {simulation?.erreur && <p role="alert" className="err">{simulation.erreur}</p>}
    {b && <div role="status" className="space-y-2">
      {b.super_admin ? <p className="err">Compte de supervision : il ne se ferme pas par cette procédure.</p> : null}
      <ul className="list-disc space-y-1 pl-5">
        {b.organisations_effacees.length === 0 ? <li>Aucun espace effacé (le compte n’est seul gérant d’aucun espace).</li>
          : b.organisations_effacees.map(o => <li key={o.organisation}>Espace « {o.nom ?? "sans nom"} » effacé : {o.biens} bien(s), {o.lots} lot(s), {o.baux} bail(s), {o.personnes} personne(s), {o.documents} document(s), {o.fichiers} fichier(s){o.membres_invites ? `, ${o.membres_invites} accès d’invités retirés` : ""}{o.demandes_zoho ? `, ${o.demandes_zoho} demande(s) Zoho à supprimer chez le prestataire` : ""}.</li>)}
        {b.adhesions_retirees > 0 && <li>{b.adhesions_retirees} accès à d’autres espaces retiré(s).</li>}
        {b.dossiers_tiers > 0 && <li>{b.dossiers_tiers} fiche(s) chez {b.proprietaires_prevenus} autre(s) propriétaire(s) : lien au compte retiré, propriétaire prévenu.</li>}
        {b.artisan && <li>Fiche d’artisan : registres privés, zones et métiers effacés ; fiche supprimée, ou détachée si un dossier la cite.</li>}
        <li>{b.archive_requise.length > 0 ? "Preuve du contrat payé archivée avant l’effacement (dix ans ; factures six ans)." : "Aucun contrat payé : la preuve part avec le compte."}</li>
        <li>{b.mode_prevu === "suppression" ? "Compte de connexion supprimé." : `Compte neutralisé (adresse et mot de passe effacés) : des références subsistent (${Object.keys(b.references_restantes).join(", ")}).`}</li>
      </ul>
      {b.abonnement?.vivante && <p>Souscription Stripe en cours ({b.abonnement.stripe_statut ?? "statut inconnu"}{b.abonnement.periode_fin ? `, période jusqu’au ${formaterDateParis(b.abonnement.periode_fin)}` : ""}) : elle sera arrêtée à la date d’effet.</p>}
      {!b.super_admin && <form data-saisie-confirmee onSubmit={soumettre} className="space-y-2" aria-busy={enCours}>
        <input type="hidden" name="account_id" value={accountId} />
        <input type="hidden" name="demande_id" value={demandeId} />
        {b.abonnement?.payee_en_cours && <fieldset className="space-y-1"><legend className="font-medium">Abonnement payé en cours : choix du titulaire</legend>
          <label className="flex items-start gap-2"><input type="radio" name="choix" value="fin_periode" required /> <span>Fermeture à la fin de la période payée</span></label>
          <label className="flex items-start gap-2"><input type="radio" name="choix" value="j14_prorata" required /> <span>Fermeture quatorze jours après aujourd’hui, avec remboursement de la part non utilisée de la période</span></label>
        </fieldset>}
        <p className="text-muted-foreground">Sans abonnement payé en cours, l’effacement a lieu quatorze jours après aujourd’hui. Il reste annulable jusque-là.</p>
        {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
        <BoutonEnvoi size="sm" enCours={enCours} enCoursTexte="Programmation…">Programmer la fermeture</BoutonEnvoi>
      </form>}
    </div>}
  </section>;
}

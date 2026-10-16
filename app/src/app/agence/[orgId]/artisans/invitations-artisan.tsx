"use client";

import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { agirSurInvitationArtisan, inviterArtisan, type EtatInvitationArtisan } from "@/app/actions/invitations-artisan";
import { LONGUEUR_MAX_EMAIL, LONGUEUR_MAX_NOM_MEMO } from "@/lib/invitations-artisan";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { METIERS_ARTISAN } from "./referentiel";

// Les gestes du propriétaire sur ses invitations d'artisans (décision du 15/10/2026). Chaque champ a un libellé
// visible ; les messages de la base sont affichés tels quels (ils sont rédigés pour le propriétaire).

function Retour({ etat }: { etat: EtatInvitationArtisan }) {
  return (
    <>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </>
  );
}

export function FormulaireInvitationArtisan({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState<EtatInvitationArtisan, FormData>(inviterArtisan.bind(null, orgId), {});
  const idEmail = useId();
  const idNom = useId();
  const idMetier = useId();
  return (
    <form data-saisie-confirmee action={action} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={idEmail}>Adresse e-mail de l’artisan *</Label>
        <Input
          id={idEmail}
          name="email"
          type="email"
          required
          maxLength={LONGUEUR_MAX_EMAIL}
          autoComplete="off"
          defaultValue={etat.valeurs?.email}
          placeholder="contact@plomberie-martin.fr"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={idNom}>Nom, pour mémoire</Label>
          <Input id={idNom} name="nom" maxLength={LONGUEUR_MAX_NOM_MEMO} defaultValue={etat.valeurs?.nom} placeholder="M. Martin" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={idMetier}>Métier, pour mémoire</Label>
          <select
            id={idMetier}
            name="metier"
            defaultValue={etat.valeurs?.metier ?? ""}
            className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Non précisé</option>
            {Object.entries(METIERS_ARTISAN).map(([cle, nom]) => (
              <option key={cle} value={cle}>
                {nom}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Retour etat={etat} />
      <BoutonEnvoi enCoursTexte="Envoi…">Envoyer l’invitation</BoutonEnvoi>
      <p className="text-sm text-muted-foreground">
        Le nom et le métier ne servent qu’à vous y retrouver : l’artisan ne les voit pas. Il reçoit un e-mail au nom de
        Gerimmo, valable 30 jours, qui ne dit rien de vos biens ni de vos locataires.
      </p>
    </form>
  );
}

/**
 * Les gestes des lignes du carnet (relecture du 15/10, accessibilité). Un geste change la ligne sous le bouton : après
 * une annulation, ses gestes disparaissent ; une nouvelle invitation remplace l'ancienne. Un message tenu par la ligne
 * disparaissait donc avec elle, sans être lu, et le focus se perdait. L'état des gestes et leur message vivent ici, au
 * niveau de la liste « Mes artisans », hors de toute partie conditionnelle ; après chaque geste, le focus va au message.
 */
const ActionDesGestes = createContext<((formData: FormData) => void) | null>(null);

function useActionDesGestes() {
  const agir = useContext(ActionDesGestes);
  if (!agir) throw new Error("Les gestes d’une invitation se placent dans GestesDuCarnet.");
  return agir;
}

export function GestesDuCarnet({ orgId, children }: { orgId: string; children: ReactNode }) {
  const [etat, agir] = useActionState<EtatInvitationArtisan, FormData>(agirSurInvitationArtisan.bind(null, orgId), {});
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (etat.erreur || etat.succes) message.current?.focus();
  }, [etat]);
  return (
    <ActionDesGestes.Provider value={agir}>
      <div className="empty:hidden">
        {etat.erreur ? (
          <p ref={message} tabIndex={-1} role="alert" className="text-sm text-destructive outline-none">
            {etat.erreur}
          </p>
        ) : etat.succes ? (
          <p ref={message} tabIndex={-1} role="status" className="text-sm text-success-soft-foreground outline-none">
            {etat.succes}
          </p>
        ) : null}
      </div>
      {children}
    </ActionDesGestes.Provider>
  );
}

export function GestesInvitationEnAttente({ invitationId, email }: { invitationId: string; email: string | null }) {
  const agir = useActionDesGestes();
  return (
    <div className="flex flex-wrap gap-2">
      <form data-saisie-confirmee action={agir}>
        <input type="hidden" name="geste" value="renvoyer" />
        <input type="hidden" name="invitation" value={invitationId} />
        <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Envoi…">
          Renvoyer
        </BoutonEnvoi>
      </form>
      <form data-saisie-confirmee action={agir}>
        <input type="hidden" name="geste" value="annuler" />
        <input type="hidden" name="invitation" value={invitationId} />
        <input type="hidden" name="email" value={email ?? ""} />
        <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Annulation…">
          Annuler l’invitation
        </BoutonEnvoi>
      </form>
    </div>
  );
}

/** Une invitation expirée ou annulée se refait en un clic, avec la même adresse et les mêmes notes. */
export function ReinviterArtisan({ email, nom, metier }: { email: string; nom: string | null; metier: string | null }) {
  const agir = useActionDesGestes();
  return (
    <form data-saisie-confirmee action={agir}>
      <input type="hidden" name="geste" value="reinviter" />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="nom" value={nom ?? ""} />
      <input type="hidden" name="metier" value={metier ?? ""} />
      <BoutonEnvoi variant="outline" size="sm" enCoursTexte="Envoi…">
        Inviter de nouveau
      </BoutonEnvoi>
    </form>
  );
}

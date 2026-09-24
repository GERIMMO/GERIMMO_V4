import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export type Gestionnaire = {
  agence: string;
  telephone: string | null;
  email_contact: string | null;
  agent_email: string | null;
  // Prénom et nom de l'agent du mandat actif (24/09) : la RPC
  // mon_gestionnaire_locataire ne rendait que son adresse. Tant que sa
  // nouvelle version n'est pas en base — ou quand l'agent n'a pas de fiche
  // personne dans l'agence —, ils manquent et l'adresse suffit.
  agent_prenom?: string | null;
  agent_nom?: string | null;
};

/**
 * « Votre interlocuteur », la même ligne à l'accueil et sur « Mon
 * gestionnaire » (24/09) : les deux pages l'écrivaient différemment, et
 * l'adresse, tronquée sur bureau, ne se cliquait pas. Elle passe en lien
 * mailto et se coupe n'importe où plutôt que de perdre sa fin.
 */
export function Interlocuteur({ gestionnaire }: { gestionnaire: Gestionnaire }) {
  const nom = [gestionnaire.agent_prenom, gestionnaire.agent_nom]
    .map((m) => m?.trim())
    .filter(Boolean)
    .join(" ");
  const email = gestionnaire.agent_email;
  if (!nom && !email) return null;
  return (
    <>
      <span className="block text-xs text-muted-foreground">
        Votre interlocuteur{nom ? ` : ${nom}` : ""}
      </span>
      {email && (
        <a href={`mailto:${email}`} className="lien-discret block [overflow-wrap:anywhere]">
          {email}
        </a>
      )}
    </>
  );
}

// Colonne de droite de l'espace locataire (maquette v10) : qui s'occupe de
// moi. La carte d'urgence qui la suivait a cédé la place à ReflexesUrgence,
// la seule de l'espace (24/09).
export function CarteGestionnaire({
  orgId,
  gestionnaire,
}: {
  orgId: string;
  gestionnaire: Gestionnaire | undefined;
}) {
  if (!gestionnaire) return null;
  const initiales = gestionnaire.agence
    .split(/\s+/)
    .slice(0, 2)
    .map((m) => m[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="loc-carte">
      <h3 className="text-base font-medium">Mon gestionnaire</h3>
      <div className="mt-3 flex items-center gap-3">
        <span
          className="loc-avat"
          style={{ width: 44, height: 44, background: "linear-gradient(135deg, var(--bleu), var(--encre))", color: "var(--sur-encre)" }}
          aria-hidden
        >
          {initiales || "◇"}
        </span>
        <span className="min-w-0">
          <b className="block text-sm font-semibold">{gestionnaire.agence}</b>
          <Interlocuteur gestionnaire={gestionnaire} />
        </span>
      </div>
      <div className={`mt-3.5 grid gap-2 ${gestionnaire.telephone ? "grid-cols-2" : "grid-cols-1"}`}>
        <Link
          href={`/locataire/${orgId}/contact`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Contacter
        </Link>
        {gestionnaire.telephone && (
          <a
            href={`tel:${gestionnaire.telephone.replace(/\s/g, "")}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Appeler
          </a>
        )}
      </div>
    </div>
  );
}

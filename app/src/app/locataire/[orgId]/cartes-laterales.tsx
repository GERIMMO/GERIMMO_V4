import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export type Gestionnaire = {
  agence: string;
  telephone: string | null;
  email_contact: string | null;
  agent_email: string | null;
};

// Colonne de droite de l'espace locataire (maquette v10) : qui s'occupe de
// moi, et quoi faire en cas d'urgence — les deux cartes qui rassurent.
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
          {gestionnaire.agent_email && (
            <span className="block truncate text-xs text-muted-foreground">
              Votre interlocuteur : {gestionnaire.agent_email}
            </span>
          )}
        </span>
      </div>
      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <Link
          href={`/locataire/${orgId}/contact`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Contacter
        </Link>
        {gestionnaire.telephone ? (
          <a
            href={`tel:${gestionnaire.telephone.replace(/\s/g, "")}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Appeler
          </a>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

export function CarteUrgence() {
  return (
    <div className="loc-carte" style={{ padding: "16px 18px" }}>
      <p className="text-xs text-muted-foreground">
        Une urgence vitale ? En cas de danger, contactez d&apos;abord les secours :
      </p>
      <div className="mt-2 flex items-center gap-2.5">
        <span
          className="loc-rond"
          style={{ width: 34, height: 34, background: "var(--destructive)", color: "#fff", fontSize: 14 }}
          aria-hidden
        >
          ☎
        </span>
        <a href="tel:112" className="text-lg font-bold text-destructive">
          112
        </a>
        <span className="text-xs text-muted-foreground">numéro d&apos;urgence européen</span>
      </div>
      <p className="mt-2.5 text-xs text-muted-foreground">
        Odeur de gaz : aérez, ne touchez aucun interrupteur, appelez Urgence
        Sécurité Gaz au 0 800 47 33 33 — puis prévenez votre gestionnaire.
      </p>
    </div>
  );
}

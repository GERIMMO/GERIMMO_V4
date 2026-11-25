import { DOCUMENTS_ZOHO } from "@/lib/politique-signature";
import { formaterDate } from "@/lib/ged";

// Audit palier 1 (P1-06). Le locataire lit où en est la signature électronique qui le concerne : la base ne lui rend
// que SES circuits, son propre état et un décompte (mes_signatures_electroniques, 20261122160000) — jamais le nom,
// l'adresse ou le téléphone des autres signataires. Cette carte n'offre aucun geste : la signature se fait chez le
// prestataire (invitation par e-mail, code par SMS — lib/zoho-sign.ts), et les signatures se recueillent l'une après
// l'autre (`is_sequential`).

export type SignatureLocataire = {
  circuit_id: string; modele: string; etat: string;
  envoye_le: string | null; expire_le: string | null; acheve_le: string | null;
  mon_statut: string | null; signatures_recues: number; signatures_attendues: number;
};

const pluriel = (n: number) => (n > 1 ? "s" : "");

/** Le locataire doit-il encore signer ce document ? */
export function resteASigner(s: SignatureLocataire): boolean {
  return s.etat === "en_cours" && s.mon_statut !== "signed";
}

/** Ce que la carte dit d'un circuit : une phrase, sans jargon, sans rien promettre que le circuit ne porte. */
export function phraseSignature(s: SignatureLocataire): string {
  const decompte = `${s.signatures_recues} signature${pluriel(s.signatures_recues)} reçue${pluriel(s.signatures_recues)} sur ${s.signatures_attendues}`;
  const fin = s.acheve_le ? ` le ${formaterDate(s.acheve_le)}` : "";
  if (s.etat === "termine") return `Signé par tous les signataires${fin}.`;
  if (s.etat === "refuse") return `Un signataire a refusé de signer${fin} : ce document n’est pas signé.`;
  if (s.etat === "expire") return `La demande de signature a expiré${fin} sans réunir toutes les signatures : ce document n’est pas signé.`;
  const validite = s.expire_le ? ` La demande est valable jusqu’au ${formaterDate(s.expire_le)}.` : "";
  if (s.mon_statut === "signed") return `Vous avez signé. ${decompte} : le document sera complet quand tous auront signé.${validite}`;
  if (s.mon_statut === "notified") return `À signer : l’invitation vous a été envoyée par e-mail. ${decompte}.${validite}`;
  return `Signatures en cours : ${decompte}. Elles se recueillent l’une après l’autre ; votre invitation arrive par e-mail quand vient votre tour.${validite}`;
}

const TONS: Record<string, { libelle: string; ton: string }> = {
  termine: { libelle: "signé", ton: "vert" },
  refuse: { libelle: "refusé", ton: "rouge" },
  expire: { libelle: "expiré", ton: "rouge" },
};

export function SignaturesElectroniques({ signatures }: { signatures: SignatureLocataire[] }) {
  if (!signatures.length) return null;
  return (
    <section className="loc-carte" aria-labelledby="signatures-electroniques-titre" data-signatures-electroniques>
      <div className="entete-carte !mb-1">
        <h2 id="signatures-electroniques-titre" className="titre-carte text-base font-medium">Signature électronique</h2>
      </div>
      <ul className="divide-y divide-border">
        {signatures.map((s) => {
          const etiquette = TONS[s.etat] ?? (resteASigner(s) && s.mon_statut === "notified"
            ? { libelle: "à signer", ton: "ambre" }
            : s.mon_statut === "signed" ? { libelle: "vous avez signé", ton: "vert" } : { libelle: "en cours", ton: "ambre" });
          return (
            <li key={s.circuit_id} className="py-2.5 text-sm" data-etat-signature={s.etat}>
              <div className="flex flex-wrap items-center gap-2">
                <b className="min-w-0 flex-1 font-medium">{DOCUMENTS_ZOHO[s.modele as keyof typeof DOCUMENTS_ZOHO] ?? "Document"}</b>
                <span className={`loc-tag ${etiquette.ton}`}>{etiquette.libelle}</span>
              </div>
              {s.envoye_le && <small className="block text-muted-foreground">Envoyé en signature le {formaterDate(s.envoye_le)}</small>}
              <p className="mt-1">{phraseSignature(s)}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        La signature se fait chez Zoho Sign, le prestataire de signature : l’invitation arrive par e-mail, et un code vous
        est envoyé par SMS au moment de signer. Rien n’est à déposer ici.
      </p>
    </section>
  );
}

import { createHmac, timingSafeEqual } from "node:crypto";

export type EnvironnementYoutrust = "sandbox" | "production";

export type ConfigurationYoutrust = {
  cleApi: string;
  environnement: EnvironnementYoutrust;
  baseUrl: string;
};

export type SignataireYoutrust = {
  prenom: string;
  nom: string;
  email: string;
  /** Format international, par exemple +33743560463. */
  telephone?: string | null;
};

export type DemandeYoutrustCreee = {
  demandeId: string;
  documentId: string;
  signataireId: string;
  statut: string;
};

export type SignataireYoutrustLu = {
  id: string;
  status: string;
  signature_link?: string | null;
};

type Env = Record<string, string | undefined>;

const BASES: Record<EnvironnementYoutrust, string> = {
  sandbox: "https://api-sandbox.yousign.app/v3",
  production: "https://api.yousign.app/v3",
};

export function configurationYoutrust(env: Env = process.env): ConfigurationYoutrust | null {
  const cleApi = env.YOUTRUST_API_KEY?.trim();
  if (!cleApi) return null;
  const environnement = env.YOUTRUST_ENV?.trim() === "production" ? "production" : "sandbox";
  return { cleApi, environnement, baseUrl: BASES[environnement] };
}

export class ErreurYoutrust extends Error {
  constructor(
    message: string,
    public readonly statut: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "ErreurYoutrust";
  }
}

async function appel<T>(
  config: ConfigurationYoutrust,
  chemin: string,
  init: RequestInit = {}
): Promise<T> {
  const entetes = new Headers(init.headers);
  entetes.set("Authorization", `Bearer ${config.cleApi}`);
  entetes.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) entetes.set("Content-Type", "application/json");

  const reponse = await fetch(`${config.baseUrl}${chemin}`, { ...init, headers: entetes });
  if (!reponse.ok) {
    let details: unknown;
    try {
      details = await reponse.json();
    } catch {
      details = await reponse.text().catch(() => null);
    }
    throw new ErreurYoutrust("Le service de signature a refusé la demande.", reponse.status, details);
  }
  if (reponse.status === 204) return undefined as T;
  return (await reponse.json()) as T;
}

/**
 * Prépare et active une signature simple eIDAS. L'OTP passe par SMS lorsque
 * le téléphone est disponible, sinon par email. Le PDF ne quitte le serveur
 * qu'après création explicite de la demande par un gestionnaire.
 */
export async function creerDemandeYoutrust(params: {
  config: ConfigurationYoutrust;
  pdf: Uint8Array;
  nomFichier: string;
  titre: string;
  referenceExterne: string;
  signataire: SignataireYoutrust;
  pageSignature?: number;
  /** Coordonnées en points sur la page PDF, origine en haut à gauche. */
  position?: { x: number; y: number; largeur?: number };
}): Promise<DemandeYoutrustCreee> {
  const { config, signataire } = params;
  const demande = await appel<{ id: string }>(config, "/signature_requests", {
    method: "POST",
    body: JSON.stringify({
      name: params.titre.slice(0, 128),
      delivery_mode: "email",
      audit_trail_locale: "fr",
      external_id: params.referenceExterne,
      signers_allowed_to_decline: true,
    }),
  });

  const formulaire = new FormData();
  const tamponPdf = Uint8Array.from(params.pdf).buffer;
  formulaire.append("file", new Blob([tamponPdf], { type: "application/pdf" }), params.nomFichier);
  formulaire.append("nature", "signable_document");
  const document = await appel<{ id: string; total_pages?: number }>(
    config,
    `/signature_requests/${demande.id}/documents`,
    { method: "POST", body: formulaire }
  );

  const position = params.position ?? { x: 360, y: 680, largeur: 170 };
  const info: Record<string, string> = {
    first_name: signataire.prenom || "Signataire",
    last_name: signataire.nom,
    email: signataire.email,
    locale: "fr",
  };
  if (signataire.telephone) info.phone_number = signataire.telephone;
  const signataireCree = await appel<{ id: string }>(
    config,
    `/signature_requests/${demande.id}/signers`,
    {
      method: "POST",
      body: JSON.stringify({
        info,
        signature_level: "electronic_signature",
        signature_authentication_mode: signataire.telephone ? "otp_sms" : "otp_email",
        fields: [
          {
            type: "signature",
            document_id: document.id,
            page: params.pageSignature ?? document.total_pages ?? 1,
            x: position.x,
            y: position.y,
            width: position.largeur ?? 170,
          },
        ],
      }),
    }
  );

  const activee = await appel<{ status: string }>(
    config,
    `/signature_requests/${demande.id}/activate`,
    { method: "POST" }
  );
  return {
    demandeId: demande.id,
    documentId: document.id,
    signataireId: signataireCree.id,
    statut: activee.status,
  };
}

export async function annulerDemandeYoutrust(
  config: ConfigurationYoutrust,
  demandeId: string
): Promise<void> {
  await appel(config, `/signature_requests/${demandeId}/cancel`, { method: "POST" });
}

export async function lireSignataireYoutrust(
  config: ConfigurationYoutrust,
  demandeId: string,
  signataireId: string
): Promise<SignataireYoutrustLu> {
  return appel(config, `/signature_requests/${demandeId}/signers/${signataireId}`);
}

async function telecharger(
  config: ConfigurationYoutrust,
  chemin: string,
  accept: string
): Promise<Uint8Array> {
  const reponse = await fetch(`${config.baseUrl}${chemin}`, {
    headers: { Authorization: `Bearer ${config.cleApi}`, Accept: accept },
  });
  if (!reponse.ok) {
    throw new ErreurYoutrust("Le document signé n'est pas disponible.", reponse.status);
  }
  return new Uint8Array(await reponse.arrayBuffer());
}

export function telechargerDocumentSigneYoutrust(
  config: ConfigurationYoutrust,
  demandeId: string,
  documentId: string
): Promise<Uint8Array> {
  return telecharger(
    config,
    `/signature_requests/${demandeId}/documents/${documentId}/download`,
    "application/pdf"
  );
}

export function telechargerPreuveYoutrust(
  config: ConfigurationYoutrust,
  demandeId: string,
  signataireId: string
): Promise<Uint8Array> {
  return telecharger(
    config,
    `/signature_requests/${demandeId}/signers/${signataireId}/audit_trails/download`,
    "application/pdf"
  );
}

/** Vérifie l'empreinte HMAC du corps brut envoyée par les webhooks Youtrust. */
export function webhookYoutrustValide(corpsBrut: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  const attendue = `sha256=${createHmac("sha256", secret).update(corpsBrut).digest("hex")}`;
  const recue = Buffer.from(signature, "utf8");
  const calculee = Buffer.from(attendue, "utf8");
  return recue.length === calculee.length && timingSafeEqual(recue, calculee);
}

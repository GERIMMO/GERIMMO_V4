// Envoi d'emails transactionnels via l'API Resend (quittances, décomptes…).
// Les emails d'AUTHENTIFICATION (invitation, mot de passe) passent, eux, par le
// SMTP Resend configuré dans Supabase — pas par ce helper.
// Nécessite RESEND_API_KEY dans l'environnement (.env.local) et un domaine vérifié.

const EXPEDITEUR = "Gerimmo <no-reply@gerimmo.app>";

export async function envoyerEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ erreur?: string }> {
  const cle = process.env.RESEND_API_KEY;
  if (!cle) return { erreur: "Envoi email non configuré (RESEND_API_KEY absente de .env.local)." };
  try {
    const reponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cle}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EXPEDITEUR,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!reponse.ok) {
      const txt = await reponse.text();
      return { erreur: `Resend a refusé l'envoi (${reponse.status}) : ${txt.slice(0, 200)}` };
    }
    return {};
  } catch (e) {
    return { erreur: `Échec réseau de l'envoi : ${e instanceof Error ? e.message : "inconnu"}` };
  }
}

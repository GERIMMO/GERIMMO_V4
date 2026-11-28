// Le récepteur ne reçoit ni bilan métier, ni identifiant de dossier, ni texte d'erreur.
const missions = new Set(["appels", "quittances", "relances", "abonnements", "marketing", "factures", "sauvegarde", "disponibilite"]);

export async function signalerPassage(mission, reussi, env = process.env, requete = fetch) {
  if (!missions.has(mission) || env.VERCEL_ENV !== "production") return;
  const jeton = env[`GERIMMO_SIGNAL_${mission.toUpperCase()}`];
  if (!jeton) return;
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(jeton)) {
    console.warn("[surveillance] Signal mal configuré pour", mission);
    return;
  }
  try {
    const suffixe = reussi ? "" : "/fail";
    const reponse = await requete(`https://incidents.betterstack.com/api/v1/heartbeat/${jeton}${suffixe}`, {
      redirect: "error", signal: AbortSignal.timeout(2000), cache: "no-store",
    });
    await reponse.body?.cancel();
    if (!reponse.ok) throw new Error();
  } catch {
    // L'absence de signal est détectée par le récepteur, indépendamment de Gerimmo.
    console.warn("[surveillance] Signal non confirmé pour", mission);
  }
}

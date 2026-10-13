import { quitterSessionArtisan } from "@/app/actions/session-artisan";
import { createClient } from "@/lib/supabase/server";

type Session = {
  session_id: string;
  artisan_id: string;
  raison_sociale: string;
  expire_le: string;
  motif: string;
  portee: "diagnostic";
};

/** Cible, raison, expiration et fermeture du diagnostic en lecture seule. */
export async function BandeauSessionSupervision() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ma_session_artisan_diagnostic");
  if (error) return <div role="alert" className="bg-[var(--destructive)] px-4 py-2 text-center text-sm text-[var(--sur-encre)]">Le contexte de diagnostic ne peut pas être vérifié. Réessayez avant toute action.</div>;
  const session = ((data ?? []) as Session[])[0];
  if (!session) return null;

  const fin = new Date(session.expire_le).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[var(--destructive)] px-4 py-2 text-center text-[13px] text-[var(--sur-encre)]"
    >
      <span>
        <b>Diagnostic en lecture seule</b> — espace de{" "}
        <b>{session.raison_sociale}</b>, jusqu&apos;à {fin} (Paris).<br />
        Motif : {session.motif}. Aucune modification ni aucun envoi autorisé.
      </span>
      <form action={quitterSessionArtisan}>
        <input type="hidden" name="artisan_id" value={session.artisan_id} />
        <button
          type="submit"
          className="min-h-9 rounded-sm border border-[var(--sur-encre)]/60 px-3 font-medium underline-offset-2 hover:bg-[var(--sur-encre)]/15"
        >
          Fermer le diagnostic
        </button>
      </form>
    </div>
  );
}

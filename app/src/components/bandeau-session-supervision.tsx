import { quitterSessionArtisan } from "@/app/actions/session-artisan";
import { createClient } from "@/lib/supabase/server";

type Session = {
  session_id: string;
  artisan_id: string;
  raison_sociale: string;
  expire_le: string;
};

/**
 * LE BANDEAU QUI DIT « VOUS N'ÊTES PAS CHEZ VOUS ».
 *
 * Quand la supervision entre dans la session d'un artisan (19/09), tout le
 * portail se comporte comme s'il était lui — écritures comprises. Rien à
 * l'écran ne le dirait, et c'est précisément le genre d'oubli qui fait
 * déposer un devis au nom de quelqu'un d'autre sans s'en rendre compte.
 *
 * Rouge, en haut, à toutes les largeurs, avec la sortie à portée de pouce et
 * l'heure d'expiration en clair. Il ne s'affiche que pendant une traversée.
 */
export async function BandeauSessionSupervision() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ma_session_artisan");
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
        <b>Session de supervision</b> — vous agissez dans l&apos;espace de{" "}
        <b>{session.raison_sociale}</b>, jusqu&apos;à {fin}.
      </span>
      <form action={quitterSessionArtisan}>
        <input type="hidden" name="artisan_id" value={session.artisan_id} />
        <button
          type="submit"
          className="min-h-9 rounded-sm border border-[var(--sur-encre)]/60 px-3 font-medium underline-offset-2 hover:bg-[var(--sur-encre)]/15"
        >
          Quitter sa session
        </button>
      </form>
    </div>
  );
}

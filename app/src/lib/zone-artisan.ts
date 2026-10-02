// LA ZONE D'INTERVENTION D'UN ARTISAN (retour recette du 02/10/2026).
//
// Un code postal à cinq chiffres désigne une commune (ou un arrondissement) ;
// un département — « 91 », « 94 », « 2A », « 974 » — couvre tous les codes
// postaux qui commencent ainsi. Saisir « tous les codes postaux du 91 » à la
// main n'était pas tenable. La base applique la même règle
// (`public.zone_artisan_couvre`, migration 20261002100000) : ce module et
// elle doivent dire la même chose.

/** Un code postal, ou un département (métropole, Corse, outre-mer). */
export const FORME_ZONE = /^(\d{5}|\d{2}|2A|2B|97[1-6])$/;

/** « 91300, 91 ; 2a » → ["91300", "91", "2A"], ou l'erreur à montrer. */
export function lireZones(brut: string): { zones?: string[]; erreur?: string } {
  const saisies = brut
    .split(/[\s,;]+/)
    .map((z) => z.trim().toUpperCase())
    .filter(Boolean);
  const fautif = saisies.find((z) => !FORME_ZONE.test(z));
  if (fautif) {
    return {
      erreur: `« ${fautif} » n'est ni un code postal à cinq chiffres ni un département (91, 2A, 974…).`,
    };
  }
  return { zones: [...new Set(saisies)] };
}

/** La zone couvre-t-elle ce code postal ? Même règle que la base. */
export function zoneCouvre(zone: string, codePostal: string): boolean {
  if (zone === codePostal) return true;
  if (zone === "2A") return /^20[01]/.test(codePostal);
  if (zone === "2B") return /^20[2-6]/.test(codePostal);
  if (/^\d{2}$/.test(zone)) return codePostal.startsWith(zone) && !codePostal.startsWith("97");
  if (/^97[1-6]$/.test(zone)) return codePostal.startsWith(zone);
  return false;
}

/** Ce qu'on lit à l'écran : « 91300 » tel quel, « 91 » → « tout le 91 ». */
export function libelleZone(zone: string): string {
  return /^\d{5}$/.test(zone) ? zone : `tout le ${zone}`;
}

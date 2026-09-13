"use server";

import { verifierAccesEspace } from "@/lib/espace";
import { lotsDuPortefeuille, PortefeuilleIndisponible } from "@/lib/portefeuille";
import { filtreRecherche, filtrePersonnes, normaliserRecherche, type ReponseRecherche, type ResultatRecherche } from "@/lib/recherche-espace";
import { nomComplet } from "@/lib/roles-personnes";
import { ETATS_BAIL } from "@/lib/baux";

export async function rechercherDansEspace(orgId: string, saisie: string): Promise<ReponseRecherche> {
  const { supabase, user, role } = await verifierAccesEspace(orgId);
  const texte = normaliserRecherche(saisie);
  if (texte.length < 2) return { resultats: [] };
  const portefeuille = await lotsDuPortefeuille(supabase, orgId, role, user.id);
  if (portefeuille instanceof PortefeuilleIndisponible)
    return { resultats: [], erreur: "Votre portefeuille est momentanément indisponible. Réessayez." };
  const base = `/agence/${orgId}`;
  // Le filtre précède la limite : un résultat hors portefeuille ne doit ni
  // sortir à l'écran ni prendre la place d'un résultat accessible.
  const lotsRequete = () => {
    let q = supabase.from("lots").select("id, nom, bien_id, etat, bien:biens!lots_bien_id_fkey(nom, address_line1, city)")
      .eq("organization_id", orgId).neq("etat", "archive");
    if (portefeuille) q = q.in("id", [...portefeuille]);
    return q;
  };
  const [lotsNoms, biens, personnes] = await Promise.all([
    portefeuille?.size === 0 ? { data: [], error: null } : lotsRequete().or(filtreRecherche(["nom"], texte)).order("nom").limit(6),
    supabase.from("biens").select("id").eq("organization_id", orgId)
      .or(filtreRecherche(["nom", "address_line1", "city"], texte)).order("nom").limit(20),
    supabase.from("persons").select("id, nom, prenom, email").eq("organization_id", orgId).is("archived_at", null)
      .or(filtrePersonnes(texte)).order("nom").limit(6),
  ]);
  const lotsAdresse = biens.data?.length && portefeuille?.size !== 0
    ? await lotsRequete().in("bien_id", biens.data.map((b) => b.id)).order("nom").limit(6)
    : { data: [], error: null };
  const lots = [...new Map([...(lotsNoms.data ?? []), ...(lotsAdresse.data ?? [])].map((l) => [l.id, l])).values()].slice(0, 6);
  const resultats: ResultatRecherche[] = lots.map((l) => {
    const bien = Array.isArray(l.bien) ? l.bien[0] : l.bien;
    return { id: l.id, type: "Logement", titre: l.nom,
      detail: [bien?.nom, bien?.address_line1, bien?.city].filter(Boolean).join(" · "),
      href: `${base}/parc?sel=lot:${l.id}` };
  });
  for (const p of personnes.data ?? []) resultats.push({ id: p.id, type: "Personne", titre: nomComplet(p), detail: p.email ?? "Fiche personne", href: `${base}/personnes/${p.id}` });
  // Un nom ou une adresse mène également aux contrats correspondants.
  const idsLots = lots.map((l) => l.id);
  const idsPersonnes = (personnes.data ?? []).map((p) => p.id);
  let erreurBaux = false;
  if ((idsLots.length || idsPersonnes.length) && portefeuille?.size !== 0) {
    let q = supabase.from("baux").select("id, lot_id, locataire_principal, etat")
      .eq("organization_id", orgId).neq("etat", "termine");
    if (portefeuille) q = q.in("lot_id", [...portefeuille]);
    const filtres = [idsLots.length ? `lot_id.in.(${idsLots.join(",")})` : "", idsPersonnes.length ? `locataire_principal.in.(${idsPersonnes.join(",")})` : ""].filter(Boolean);
    const baux = await q.or(filtres.join(",")).order("date_debut", { ascending: false }).limit(6);
    erreurBaux = Boolean(baux.error);
    for (const b of baux.data ?? []) {
      const personne = personnes.data?.find((p) => p.id === b.locataire_principal);
      resultats.push({ id: b.id, type: "Bail", titre: personne ? nomComplet(personne) : lots.find((l) => l.id === b.lot_id)?.nom ?? "Contrat de location", detail: ETATS_BAIL[b.etat] ?? b.etat, href: `${base}/baux/${b.id}` });
    }
  }
  return { resultats, ...(lotsNoms.error || biens.error || personnes.error || lotsAdresse.error || erreurBaux
    ? { erreur: "Certains résultats sont indisponibles. Réessayez ou ouvrez la rubrique concernée." } : {}) };
}

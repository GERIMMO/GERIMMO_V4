/**
 * SCI-2 (audit après publication de la PR #347, 19/11/2026) : la fiche titulaire de la société naissait sans e-mail ni
 * adresse. Le récapitulatif du bail réclamait « Adresse du propriétaire » et « Adresse e-mail des parties », et la
 * personne devait deviner qu'il fallait compléter la fiche de la société — sans pouvoir y mettre sa propre adresse,
 * que l'annuaire disait « déjà portée par une autre fiche » (celle de la personne qui gère la société).
 *
 * Corrections (base : migrations 20261119200000 et 20261119200100, testées par fiche-societe-coordonnees-base.test.ts) :
 *  — la fiche de la société naît avec l'e-mail du compte (et l'adresse des métadonnées, s'il y en a) ;
 *  — l'enregistrement du profil d'un espace propriétaire recopie ses coordonnées dans les champs VIDES de cette fiche ;
 *  — une société peut porter l'adresse e-mail de la personne physique qui la gère (index et annuaire, même règle).
 *
 * Sans base : l'action du profil, l'annuaire et le récapitulatif du bail, avec des clients simulés.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contexte, personne } from "./fixtures/contexte-document";

const banc = vi.hoisted(() => ({
  role: "proprietaire_direct" as string,
  personnes: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  majs: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  majOrganisation: vi.fn(),
  charger: vi.fn(),
  revalider: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/documents/modeles/communs", async (original) => ({
  ...(await original<typeof import("@/lib/documents/modeles/communs")>()),
  chargerContexteBail: banc.charger,
}));

// Un client minimal : `persons` filtre vraiment (égalité, ilike sans joker, neq, is) ; `organizations` s'enregistre.
function table(nom: string) {
  if (nom === "organizations") {
    return { update: (valeurs: Record<string, unknown>) => { banc.majOrganisation(valeurs); return { eq: () => ({ select: async () => ({ data: [{ id: "org" }], error: null }) }) }; } };
  }
  const filtres: ((l: Record<string, unknown>) => boolean)[] = [];
  const resultat = () => banc.personnes.filter((l) => filtres.every((f) => f(l)));
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.eq = (c: string, v: unknown) => { filtres.push((l) => l[c] === v); return q; };
  q.neq = (c: string, v: unknown) => { filtres.push((l) => l[c] !== v); return q; };
  q.is = (c: string, v: unknown) => { filtres.push((l) => (l[c] ?? null) === v); return q; };
  q.ilike = (c: string, motif: string) => { filtres.push((l) => String(l[c] ?? "").toLowerCase() === motif.replace(/\\(.)/g, "$1").toLowerCase()); return q; };
  q.maybeSingle = async () => ({ data: resultat()[0] ?? null, error: null });
  q.then = (suite: (r: unknown) => unknown) => Promise.resolve({ data: resultat(), error: null }).then(suite);
  q.insert = (valeurs: Record<string, unknown>) => ({
    select: () => ({ single: async () => { banc.inserts.push(valeurs); return { data: { id: `fiche-${banc.inserts.length}` }, error: null }; } }),
  });
  q.update = (valeurs: Record<string, unknown>) => { banc.majs.push(valeurs); const fin = { eq: () => fin, then: (s: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(s) }; return fin; };
  return q;
}

vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "compte" }, role: banc.role, supabase: { from: table, rpc: banc.rpc } }),
}));

import { modifierProfilOrganisation } from "@/app/actions/organisation";
import { creerPersonne, modifierPersonne } from "@/app/actions/personnes";
import { verifierCompletudeBrouillonBail } from "@/lib/documents/completude-brouillon-bail";
import { correctionsRecapBail } from "@/lib/presentation-recapitulatif-bail";

const RACINE = resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(resolve(RACINE, chemin), "utf8");

function formulaireProfil(surcharge: Record<string, string> = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ name: "SCI du Tilleul", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", email_contact: "camille@exemple.fr", telephone: "0400000000", ...surcharge })) f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  banc.role = "proprietaire_direct";
  banc.personnes = [];
  banc.inserts = [];
  banc.majs = [];
  banc.rpc.mockResolvedValue({ data: 1, error: null });
});

describe("le profil d'un espace propriétaire complète la fiche de la société", () => {
  it("après l'enregistrement du profil, la base complète la fiche ; la personne en est informée", async () => {
    const r = await modifierProfilOrganisation("org", {}, formulaireProfil());
    expect(banc.majOrganisation).toHaveBeenCalledOnce();
    expect(banc.rpc).toHaveBeenCalledWith("completer_fiche_societe_depuis_profil", { p_org: "org" });
    // Le profil d'abord : la fiche reçoit les coordonnées que le profil vient d'enregistrer.
    expect(banc.majOrganisation.mock.invocationCallOrder[0]).toBeLessThan(banc.rpc.mock.invocationCallOrder[0]);
    expect(r.succes).toMatch(/^Profil enregistré\./);
    expect(r.succes).toContain("Les coordonnées manquantes de la fiche de votre société ont été complétées.");
    expect(banc.revalider).toHaveBeenCalledWith("/agence/org/personnes");
  });

  it("rien à compléter (particulier, ou fiche déjà remplie) : le message reste celui d'avant", async () => {
    banc.rpc.mockResolvedValue({ data: 0, error: null });
    const r = await modifierProfilOrganisation("org", {}, formulaireProfil());
    expect(r.succes).toBe("Profil enregistré. Les prochains documents utiliseront votre identité. Toute adresse personnalisée modifiée doit être vérifiée avant activation.");
  });

  it("un échec de la recopie n'annule pas le profil enregistré : il est dit", async () => {
    banc.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const r = await modifierProfilOrganisation("org", {}, formulaireProfil());
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toContain("La fiche de votre société n'a pas pu être complétée");
  });

  it("une agence n'a pas de fiche de société titulaire : aucun appel", async () => {
    banc.role = "admin_agence";
    await modifierProfilOrganisation("org", {}, formulaireProfil({ siret: "12345678900000", carte_pro: "CPI", garantie_financiere: "Garant", tva_franchise: "on" }));
    expect(banc.majOrganisation).toHaveBeenCalledOnce();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("un profil refusé ne touche pas la fiche", async () => {
    await modifierProfilOrganisation("org", {}, formulaireProfil({ email_contact: "" }));
    expect(banc.majOrganisation).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });
});

describe("l'annuaire : une société peut porter l'adresse de la personne qui la gère", () => {
  const gerante = { id: "gerante", organization_id: "org", nom: "Martin", prenom: "Camille", email: "camille@exemple.fr", qualite: "Personne physique", archived_at: null };
  const societe = { id: "societe", organization_id: "org", nom: "SCI du Tilleul", prenom: null, email: "camille@exemple.fr", qualite: "SCI", archived_at: null, siren: null };

  function ficheSociete(surcharge: Record<string, string> = {}) {
    const f = new FormData();
    for (const [k, v] of Object.entries({ morale: "on", nom: "SCI du Tilleul", qualite: "SCI", email: "Camille@exemple.fr", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", rester_dans_parcours: "1", ...surcharge })) f.set(k, v);
    return f;
  }
  function fichePersonne(surcharge: Record<string, string> = {}) {
    const f = new FormData();
    for (const [k, v] of Object.entries({ nom: "Martin", prenom: "Camille", email: "camille@exemple.fr", date_naissance: "1985-03-02", commune_naissance: "Lyon", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon", rester_dans_parcours: "1", ...surcharge })) f.set(k, v);
    return f;
  }

  it("créer la fiche d'une société avec l'adresse de sa gérante : accepté", async () => {
    banc.personnes = [gerante];
    const r = await creerPersonne("org", {}, ficheSociete());
    expect(r.erreur).toBeUndefined();
    expect(banc.inserts).toHaveLength(1);
    expect(banc.inserts[0]).toMatchObject({ nom: "SCI du Tilleul", qualite: "SCI", email: "Camille@exemple.fr" });
  });

  it("deux sociétés ne partagent pas une adresse", async () => {
    banc.personnes = [societe];
    const r = await creerPersonne("org", {}, ficheSociete({ nom: "SCI Voisine" }));
    expect(r.erreur).toMatch(/déjà portée par une autre fiche/);
    expect(banc.inserts).toHaveLength(0);
  });

  it("deux personnes physiques non plus", async () => {
    banc.personnes = [gerante];
    const r = await creerPersonne("org", {}, fichePersonne({ nom: "Durand", prenom: "Paul" }));
    expect(r.erreur).toMatch(/déjà portée par une autre fiche/);
    expect(banc.inserts).toHaveLength(0);
  });

  it("la personne physique peut porter l'adresse de la société qu'elle gère", async () => {
    banc.personnes = [societe];
    const r = await creerPersonne("org", {}, fichePersonne());
    expect(r.erreur).toBeUndefined();
    expect(banc.inserts).toHaveLength(1);
  });

  it("modifier la fiche de la société, qui partage l'adresse de sa gérante : accepté", async () => {
    banc.personnes = [gerante, societe];
    const f = ficheSociete({ telephone: "0400000000" });
    f.delete("morale");
    const r = await modifierPersonne("org", "societe", {}, f);
    expect(r).toEqual({ succes: "Fiche mise à jour." });
    expect(banc.majs[0]).toMatchObject({ email: "Camille@exemple.fr", qualite: "SCI" });
  });

  it("modifier la fiche de la gérante, qui partage l'adresse de sa société : accepté", async () => {
    banc.personnes = [gerante, societe];
    const r = await modifierPersonne("org", "gerante", {}, fichePersonne({ qualite: "Personne physique" }));
    expect(r).toEqual({ succes: "Fiche mise à jour." });
  });

  it("la base applique la même règle : un index par nature remplace l'index strict", () => {
    const sql = lire("supabase/migrations/20261119200000_email_partage_societe_gerant.sql");
    expect(sql).toContain("on public.persons (organization_id, lower(email), (coalesce(qualite in ('SCI', 'SCI familiale', 'Personne morale'), false)))");
    expect(sql).toContain("drop index if exists public.persons_email_unique_par_agence;");
  });
});

describe("le récapitulatif du bail d'une société", () => {
  async function corrections(bailleur: Record<string, unknown>) {
    const ctx = contexte();
    ctx.bailleurs = [{ ...personne({ id: "societe", nom: "SCI du Tilleul", prenom: null, qualite: "SCI", ...bailleur }), quote_part: 100 }];
    banc.charger.mockResolvedValue(ctx);
    const from = () => {
      const r = Promise.resolve({ data: { classe_dpe: "D" }, error: null });
      const q = { select: () => q, eq: () => q, is: () => q, order: () => q, limit: () => q, maybeSingle: () => r, then: r.then.bind(r) };
      return q;
    };
    const { manquants } = await verifierCompletudeBrouillonBail({ from } as unknown as SupabaseClient, "org", "b1");
    return correctionsRecapBail(manquants, [], "org", "/espace/org").map((c) => c.libelle);
  }

  it("fiche de société sans e-mail ni adresse : seule l’adresse postale est demandée parmi les coordonnées", async () => {
    const libelles = await corrections({ email: null, address_line1: null, postal_code: null, city: null });
    expect(libelles).toContain("Adresse du propriétaire");
    expect(libelles).not.toContain("Adresse e-mail des parties");
  });

  it("fiche complétée à la création (e-mail du compte) et par le profil (adresse) : plus rien à compléter côté propriétaire", async () => {
    const libelles = await corrections({ email: "camille@exemple.fr", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon" });
    expect(libelles).not.toContain("Adresse du propriétaire");
    expect(libelles).not.toContain("Adresse e-mail des parties");
  });

  // 26/11/2026 : les documents d'un particulier lisent son domicile sur SA fiche, pas sur l'espace. Ces deux cas figent
  // la règle : le correctif recopie l'adresse sur la fiche (actions/organisation.ts), il ne replie pas les documents sur
  // l'adresse de l'espace (une SCI gérée par le même espace recevrait sinon une adresse personnelle pour siège).
  it("particulier, fiche sans adresse (l'espace, lui, en a une) : « Adresse du propriétaire » reste demandée", async () => {
    const libelles = await corrections({ nom: "Martin", prenom: "Camille", qualite: "Personne physique", email: "camille@exemple.fr", address_line1: null, postal_code: null, city: null });
    expect(libelles).toContain("Adresse du propriétaire");
  });

  it("particulier, fiche portant l'adresse recopiée : plus d'adresse à compléter côté propriétaire", async () => {
    const libelles = await corrections({ nom: "Martin", prenom: "Camille", qualite: "Personne physique", email: "camille@exemple.fr", address_line1: "5 rue des Lilas", postal_code: "69003", city: "Lyon" });
    expect(libelles).not.toContain("Adresse du propriétaire");
  });
});

describe("la création de l'espace, en base (texte des migrations)", () => {
  it("la fiche titulaire de la société reçoit l'e-mail du compte ; l'ancre est celle posée par la PR #347", () => {
    const precedente = lire("supabase/migrations/20261119085820_inscription_societe_et_representant.sql");
    const correction = lire("supabase/migrations/20261119200100_coordonnees_fiche_societe.sql");
    const avant = "coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, case when v_societe is null then v_email end, v_telephone,";
    expect(precedente).toContain(avant);
    expect(correction).toContain(`avant text := $sql$${avant}$sql$;`);
    expect(correction).toContain("apres text := $sql$coalesce(v_societe,v_nom), case when v_societe is null then v_prenom end, v_email, v_telephone,$sql$;");
  });

  it("la recopie du profil ne remplit que des champs vides, sous les droits de l'appelant", () => {
    const correction = lire("supabase/migrations/20261119200100_coordonnees_fiche_societe.sql");
    expect(correction).toMatch(/completer_fiche_societe_depuis_profil\(p_org uuid\)[\s\S]*security invoker[\s\S]*set search_path = ''/);
    for (const colonne of ["address_line1", "postal_code", "city"]) {
      expect(correction).toContain(`case when nullif(btrim(p.${colonne}), '') is null then`);
    }
    expect(correction).toContain("and nullif(btrim(p.telephone), '') is null;");
    expect(correction).toContain("and nullif(btrim(p.email), '') is null;");
    expect(correction).toContain("revoke all on function public.completer_fiche_societe_depuis_profil(uuid) from public, anon;");
  });
});

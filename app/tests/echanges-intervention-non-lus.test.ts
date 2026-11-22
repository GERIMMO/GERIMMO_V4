/**
 * DISCUSSION D'UNE INTERVENTION : LE SIGNALEMENT À L'ÉCRAN — audit palier 1 du 22/11/2026, P1-05.
 *
 * Sans base (les règles de la base ont leur test : echanges-intervention-non-lus-base.test.ts). Tient :
 *  1. la lecture des non-lus : avec un espace pour le gestionnaire et le locataire, sans pour l'artisan ; une lecture
 *     en échec se distingue de « rien à lire » ;
 *  2. « marquer lu » : geste silencieux, qui renvoie à la base l'instant du dernier message TEL QUEL (à la
 *     microseconde), ne rafraîchit les écrans que si le marqueur a avancé, et n'appelle rien sur une entrée invalide ;
 *  3. la discussion pose son repère de lecture après le dernier message, dans la liste qui défile — et rien quand il
 *     n'y a aucun message ; le repère ne marque qu'une fois entré à l'écran ;
 *  4. l'étiquette « Nouveau message » sur la carte d'une mission, et son câblage dans les trois espaces.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({ supabase: null as unknown, revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: banc.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => banc.supabase }));
vi.mock("@/components/formulaire-echange-intervention", () => ({ FormulaireEchangeIntervention: () => null }));

import { etiquetteNouveauxMessages, INSTANT_MESSAGE, lireEchangesNonLus, nonLusPar, type EchangeNonLu } from "@/lib/echanges-intervention";
import { marquerEchangeLu } from "@/app/actions/echanges-intervention";
import { EchangesIntervention } from "@/components/echanges-intervention";
import { MarqueurLectureEchange } from "@/components/marqueur-lecture-echange";
import { CarteMission } from "@/app/artisan/carte-mission";
import type { LigneAgenda } from "@/app/artisan/acces";

const INTERVENTION = "3c1d2f4a-0000-4000-8000-0000000000a1";
const INSTANT = "2026-11-22T10:15:30.123456+00:00";
const ligne = (intervention: string, incident: string, non_lus: number): EchangeNonLu =>
  ({ intervention_id: intervention, incident_id: incident, organization_id: "org", non_lus, dernier_le: INSTANT });

beforeEach(() => { vi.clearAllMocks(); });

describe("lire ce qui attend d'être lu", () => {
  it("avec un espace : la base est interrogée pour cet espace ; sans : pour les missions de l'artisan", async () => {
    const rpc = vi.fn(async () => ({ data: [ligne("m1", "i1", 2)], error: null }));
    expect(await lireEchangesNonLus({ rpc } as never, "org-1")).toEqual({ lignes: [ligne("m1", "i1", 2)], erreur: false });
    expect(rpc).toHaveBeenLastCalledWith("echanges_intervention_non_lus", { p_org: "org-1" });
    await lireEchangesNonLus({ rpc } as never, null);
    expect(rpc).toHaveBeenLastCalledWith("echanges_intervention_non_lus", {});
  });

  it("une lecture en échec se dit : elle ne passe pas pour « rien à lire »", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "panne" } }));
    expect(await lireEchangesNonLus({ rpc } as never, "org-1")).toEqual({ lignes: [], erreur: true });
  });

  it("l'étiquette compte, et le total se fait par incident ou par mission", () => {
    expect(etiquetteNouveauxMessages(1)).toBe("Nouveau message");
    expect(etiquetteNouveauxMessages(3)).toBe("3 nouveaux messages");
    const lignes = [ligne("m1", "i1", 2), ligne("m2", "i1", 1), ligne("m3", "i2", 4)];
    expect([...nonLusPar(lignes, "incident_id")]).toEqual([["i1", 3], ["i2", 4]]);
    expect([...nonLusPar(lignes, "intervention_id")]).toEqual([["m1", 2], ["m2", 1], ["m3", 4]]);
  });

  it("l'instant d'un message : la forme que rend la base, et rien d'autre", () => {
    for (const bon of [INSTANT, "2026-11-22T10:15:30+00:00", "2026-11-22T10:15:30.5Z", "2026-11-22T10:15:30.123456+02"]) expect(INSTANT_MESSAGE.test(bon), bon).toBe(true);
    for (const faux of ["", "hier", "2026-11-22", "2026-11-22 10:15:30", "2026-11-22T10:15:30", "2026-11-22T10:15:30.1234567Z", `${INSTANT}; drop table`]) expect(INSTANT_MESSAGE.test(faux), faux).toBe(false);
  });
});

describe("marquer la discussion comme lue", () => {
  const rpc = vi.fn();
  beforeEach(() => { rpc.mockReset(); banc.supabase = { rpc }; });

  it("le marqueur a avancé : l'instant est renvoyé tel quel, et les écrans des trois espaces se rafraîchissent", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await marquerEchangeLu(INTERVENTION, INSTANT);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("marquer_echange_intervention_lu", { p_intervention: INTERVENTION, p_jusqua: INSTANT });
    expect(banc.revalidatePath.mock.calls).toEqual([["/espace", "layout"], ["/agence", "layout"], ["/locataire", "layout"], ["/artisan", "layout"]]);
  });

  it.each([
    ["rien n'a changé", { data: false, error: null }],
    ["la base refuse", { data: null, error: { message: "panne" } }],
  ])("%s : aucun rafraîchissement, aucune erreur montrée", async (_libelle, reponse) => {
    rpc.mockResolvedValue(reponse);
    await expect(marquerEchangeLu(INTERVENTION, INSTANT)).resolves.toBeUndefined();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["un identifiant qui n'en est pas un", "pas-un-uuid", INSTANT],
    ["un instant qui n'en est pas un", INTERVENTION, "tout de suite"],
    ["un instant arrondi à la main", INTERVENTION, "2026-11-22 10:15"],
  ])("%s : la base n'est pas appelée", async (_libelle, intervention, jusqua) => {
    await marquerEchangeLu(intervention, jusqua);
    expect(rpc).not.toHaveBeenCalled();
    expect(banc.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("la discussion pose son repère de lecture", () => {
  /** Le client de la discussion : son contexte, ses messages (la base les rend du plus récent au plus ancien), son état. */
  function client(messages: { id: string; auteur_role: string; texte: string; cree_le: string }[], role = "gerant") {
    const requete = (reponse: unknown) => {
      const r: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) r[m] = () => r;
      r.maybeSingle = () => Promise.resolve(reponse);
      r.then = (ok: (v: unknown) => unknown) => Promise.resolve(reponse).then(ok);
      return r;
    };
    banc.supabase = {
      rpc: async () => ({ data: [{ role_participant: role, statut_intervention: "planifiee" }], error: null }),
      from: (table: string) => table === "intervention_messages"
        ? requete({ data: messages, error: null, count: messages.length })
        : requete({ data: null, error: null }),
    };
  }
  const rendre = async () => renderToStaticMarkup((await EchangesIntervention({ intervention: INTERVENTION })) as never);

  it("des messages : le repère suit le DERNIER message, dans la liste qui défile, avec son instant exact", async () => {
    client([
      { id: "b", auteur_role: "artisan", texte: "Second message", cree_le: INSTANT },
      { id: "a", auteur_role: "locataire", texte: "Premier message", cree_le: "2026-11-22T09:00:00.000001+00:00" },
    ]);
    const html = await rendre();
    expect(html).toContain(`id="discussion-${INTERVENTION}"`);
    const liste = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
    expect(liste).toContain("data-messages-intervention");
    // L'ordre de lecture : le plus ancien d'abord, le repère tout à la fin.
    expect(liste.indexOf("Premier message")).toBeLessThan(liste.indexOf("Second message"));
    expect(liste.indexOf("Second message")).toBeLessThan(liste.indexOf("data-marqueur-lecture"));
    expect(liste.match(/data-marqueur-lecture/g)).toHaveLength(1);
    const page = readFileSync("src/components/echanges-intervention.tsx", "utf8");
    expect(page).toContain("<MarqueurLectureEchange intervention={intervention} jusqua={messages.data[0].cree_le}/>");
    expect(page).toContain('.order("cree_le",{ascending:false})');
  });

  it("aucun message : pas de liste, pas de repère — rien n'est marqué lu", async () => {
    client([]);
    const html = await rendre();
    expect(html).toContain("Discussion de l’intervention");
    expect(html).not.toContain("data-marqueur-lecture");
    expect(html).not.toContain("<ol");
  });

  it("le repère est invisible pour les lecteurs d'écran, et ne marque qu'une fois entré à l'écran", () => {
    const html = renderToStaticMarkup(createElement(MarqueurLectureEchange, { intervention: INTERVENTION, jusqua: INSTANT }));
    expect(html).toMatch(/<span[^>]*data-marqueur-lecture[^>]*aria-hidden="true"/);
    const source = readFileSync("src/components/marqueur-lecture-echange.tsx", "utf8");
    expect(source).toContain("new IntersectionObserver(");
    expect(source).toContain("if (entrees.some((e) => e.isIntersecting)) { marquer(); observateur.disconnect(); }");
    // La liste des messages défile jusqu'au plus récent : elle seule, pas la page.
    expect(source).toContain('element.closest<HTMLElement>("[data-messages-intervention]")');
    expect(source).toContain("liste.scrollTop = liste.scrollHeight");
    expect(source).not.toMatch(/scrollIntoView|window\.scroll/);
  });
});

describe("l'étiquette et son câblage dans les trois espaces", () => {
  const mission = (surcharge: Partial<LigneAgenda> = {}): LigneAgenda => ({
    intervention_id: INTERVENTION, organization_id: "org", agence_nom: "Agence du Port", incident_numero: "INC-1", statut: "planifiee",
    debut_prevu: "2026-11-24T08:00:00Z", fin_prevue: "2026-11-24T10:00:00Z", categorie: "plomberie_canalisation", description: null, urgence: "normale",
    piece: null, nature_travaux: "entretien_courant", adresse: "1 rue du Test", code_postal: "44000", ville: "Nantes", lot_nom: null, etage: null,
    occupant_nom: null, occupant_prenom: null, occupant_telephone: null, montant_ttc_cents: null, montant_plafond_cents: null,
    compte_rendu_depose: false, photo_apres_deposee: false, facture_deposee: false, creneaux_en_attente: 0, dates_locataire_en_attente: 0,
    ...surcharge,
  } as LigneAgenda);
  const carte = (nouveauxMessages?: number) => renderToStaticMarkup(createElement(CarteMission, { ligne: mission(), nouveauxMessages }));

  it("artisan : la carte d'une mission dit qu'un message l'attend, et combien", () => {
    expect(carte()).not.toContain("data-nouveaux-messages");
    expect(carte(0)).not.toContain("data-nouveaux-messages");
    expect(carte(1)).toMatch(/data-nouveaux-messages[^>]*>.*Nouveau message/);
    expect(carte(3)).toContain("3 nouveaux messages");
  });

  it("artisan : l'accueil met ces missions en tête, l'agenda les étiquette, la pastille les compte une fois", () => {
    const accueil = readFileSync("src/app/artisan/page.tsx", "utf8");
    expect(accueil).toContain("const messagesALire = agenda.lignes.filter((l) => aLire.has(l.intervention_id));");
    expect(accueil).toContain("<TitreSection>Messages à lire ({messagesALire.length})</TitreSection>");
    expect(accueil).toContain("messagesALire.length === 0 &&");
    expect(accueil).toContain("demandesRdv.erreur || echanges.erreur");
    // La section des messages précède toutes les autres files.
    expect(accueil.indexOf('id="messages-a-lire"')).toBeLessThan(accueil.indexOf('id="reports-a-traiter"'));
    const agenda = readFileSync("src/app/artisan/agenda/page.tsx", "utf8");
    expect(agenda.match(/nouveauxMessages=\{aLire\.get\(l\.intervention_id\)\}/g)).toHaveLength(3);
    const gabarit = readFileSync("src/app/artisan/layout.tsx", "utf8");
    expect(gabarit).toContain('l.statut === "proposee" || (l.statut === "en_cours" && !l.compte_rendu_depose) || discussionsALire.has(l.intervention_id)');
  });

  it("locataire : la pastille « Mes demandes » compte les discussions à lire, et la page y mène", () => {
    const gabarit = readFileSync("src/app/locataire/[orgId]/layout.tsx", "utf8");
    expect(gabarit).toContain("lireEchangesNonLus(supabase, orgId),");
    expect(gabarit).toContain("badgeDemandes={demandesEnCours + echangesNonLus.lignes.length}");
    // Une lecture en échec rend les pastilles « incertaines », pas silencieusement fausses.
    expect(gabarit).toContain("echangesNonLus.erreur ? true : null");
    const page = readFileSync("src/app/locataire/[orgId]/demandes/page.tsx", "utf8");
    expect(page).toContain("const messagesALire = echangesNonLus.lignes.filter((e) => discussionsAffichees.has(e.intervention_id));");
    expect(page).toContain("href={`#discussion-${messagesALire[0].intervention_id}`}");
    expect(page).toContain("{etiquetteNouveauxMessages(nombreALire)} sur votre intervention");
  });

  it("gestionnaire : l'incident dont la discussion porte un message à lire le dit dans la liste", () => {
    const page = readFileSync("src/app/agence/[orgId]/incidents/page.tsx", "utf8");
    expect(page).toContain("lireEchangesNonLus(supabase, orgId),");
    expect(page).toContain('const messagesALire = nonLusPar(echangesNonLus.lignes, "incident_id");');
    expect(page).toContain("{messagesALire.has(i.id) && (");
    expect(page).toContain("data-nouveaux-messages>{etiquetteNouveauxMessages(messagesALire.get(i.id) ?? 1)}");
  });
});

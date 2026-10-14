/**
 * Audit du 13/10/2026 (ARC-09, même famille que PR178-A-05 et B-01) : quand la session expire pendant la saisie d'un
 * formulaire privé de l'artisan (clients externes, chantiers, factures, règlements), le proxy redirige l'envoi vers la
 * connexion ; l'écran affichait « La connexion a été interrompue » sans dire que la session était en cause.
 *
 * Les crochets de React sont simulés pour appeler le vrai gestionnaire d'envoi de `FormulairePrive` sans navigateur :
 * on observe ce qu'il range dans l'état (le résultat affiché) quand l'action serveur échoue.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sim = vi.hoisted(() => ({
  enregistrer: vi.fn(),
  appels: [] as unknown[],
  indice: 0,
  resultat: {} as { erreur?: string; succes?: string },
}));

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  return {
    ...reel,
    // Premier état = le résultat affiché, second = « envoi en cours ». Chaque setter note ce qu'on lui donne.
    useState: (initial: unknown) => {
      const i = sim.indice++;
      return [i === 0 ? sim.resultat : initial, (valeur: unknown) => { sim.appels.push(valeur); }];
    },
    useRef: () => ({ current: null }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock("@/app/artisan/clients/actions", () => ({ enregistrerActivitePrivee: sim.enregistrer }));

import { FormulairePrive } from "@/app/artisan/clients/formulaire";
import { MESSAGE_SESSION_EXPIREE } from "@/lib/session-expiree";

/** Un FormData sans formulaire derrière : le gestionnaire n'en lit que `get` et `set`. */
class FormDataSimule {
  private champs = new Map<string, unknown>();
  get(nom: string) { return this.champs.get(nom) ?? null; }
  set(nom: string, valeur: unknown) { this.champs.set(nom, valeur); }
}

function rendre() {
  sim.indice = 0;
  return FormulairePrive({ action: "client", libelle: "Créer le client", children: null });
}

async function envoyer() {
  const formulaire = rendre() as unknown as { props: { onSubmit: (e: unknown) => Promise<void> } };
  // `elements` : le gestionnaire confie le formulaire à la protection de saisie (preparerSoumission), qui lit ses champs.
  await formulaire.props.onSubmit({ preventDefault() {}, currentTarget: { elements: [] } });
}

beforeEach(() => {
  sim.enregistrer.mockReset();
  sim.appels = [];
  sim.resultat = {};
  vi.stubGlobal("FormData", FormDataSimule);
  vi.stubGlobal("location", { href: "https://exemple.test/artisan/clients" });
});
afterEach(() => vi.unstubAllGlobals());

describe("formulaire privé de l'artisan : l'envoi échoue (ARC-09)", () => {
  it("session expirée (le proxy a redirigé l'envoi) : le message dit que la session a expiré", async () => {
    sim.enregistrer.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", async () => ({ type: "opaqueredirect" }));
    await envoyer();
    expect(sim.appels).toContainEqual({ erreur: MESSAGE_SESSION_EXPIREE });
    expect(JSON.stringify(sim.appels)).not.toMatch(/connexion a été interrompue/);
  });

  it("session ouverte, réponse perdue : le message d'origine reste, avec la même saisie", async () => {
    sim.enregistrer.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", async () => ({ type: "basic", status: 200 }));
    await envoyer();
    expect(sim.appels).toContainEqual({ erreur: "La connexion a été interrompue. Réessayez avec la même saisie." });
  });

  it("le message de session expirée s'accompagne d'un lien vers la connexion, dans un autre onglet", () => {
    sim.resultat = { erreur: MESSAGE_SESSION_EXPIREE };
    const page = renderToStaticMarkup(rendre() as never);
    expect(page).toMatch(/<a [^>]*href="\/connexion"[^>]*target="_blank"[^>]*>/);
    expect(page).toContain("session a expiré");
  });

  it("une autre erreur n'ajoute pas ce lien", () => {
    sim.resultat = { erreur: "Indiquez le nom du client." };
    expect(renderToStaticMarkup(rendre() as never)).not.toContain("/connexion");
  });
});

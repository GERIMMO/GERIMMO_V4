import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AmbianceSite } from "@/components/ambiance-site";

const cycle = vi.hoisted(() => ({ effet: undefined as undefined | (() => void | (() => void)), rafraichir: vi.fn() }));
vi.mock("react", () => ({ useEffect: (effet: () => void | (() => void)) => { cycle.effet = effet; } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: cycle.rafraichir }) }));

let nettoyer: void | (() => void);
let fenetre: EventTarget;
let page: EventTarget & { visibilityState: string };
let attributs: Map<string, string>;
let styles: Map<string, { valeur: string; priorite: string }>;

function monter() {
  expect(AmbianceSite()).toBeNull();
  nettoyer = cycle.effet?.();
}

beforeEach(() => {
  vi.useFakeTimers();
  attributs = new Map();
  styles = new Map();
  fenetre = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
  page = Object.assign(new EventTarget(), {
    visibilityState: "visible",
    documentElement: {
      getAttribute: (nom: string) => attributs.get(nom) ?? null,
      setAttribute: (nom: string, valeur: string) => attributs.set(nom, valeur),
      removeAttribute: (nom: string) => attributs.delete(nom),
      style: {
        getPropertyValue: (nom: string) => styles.get(nom)?.valeur ?? "",
        getPropertyPriority: (nom: string) => styles.get(nom)?.priorite ?? "",
        setProperty: (nom: string, valeur: string, priorite = "") => styles.set(nom, { valeur, priorite }),
        removeProperty: (nom: string) => styles.delete(nom),
      },
    },
  });
  vi.stubGlobal("window", fenetre);
  vi.stubGlobal("document", page);
});

afterEach(() => {
  nettoyer?.();
  nettoyer = undefined;
  cycle.effet = undefined;
  cycle.rafraichir.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ambiance commune aux pages et aux portails", () => {
  it("attend l’effet client et choisit le jour de Paris, même avant minuit UTC", () => {
    vi.setSystemTime(new Date("2026-12-28T23:30:00Z"));
    expect(AmbianceSite()).toBeNull();
    expect(attributs.size).toBe(0);
    nettoyer = cycle.effet?.();
    expect(attributs.get("data-ambiance-site")).toBe("nouvel-an");
    expect(styles.get("--ambiance-image")?.valeur).toBe('url("/illustrations/accueil-evenements/nouvel-an.webp")');
  });

  it("quitte Halloween à minuit Paris sans rechargement", () => {
    vi.setSystemTime(new Date("2026-10-31T22:59:59Z"));
    monter();
    expect(attributs.get("data-ambiance-site")).toBe("halloween");
    vi.advanceTimersByTime(1_000);
    expect(attributs.get("data-ambiance-site")).toBe("automne");
    expect(vi.getTimerCount()).toBe(1);
  });

  // Audit #264, TRV-13 : la photo passait au 1er novembre, la date rendue par le serveur restait au 31 octobre.
  it("rafraîchit la page quand le jour de Paris change, jamais au montage ni le même jour", () => {
    vi.setSystemTime(new Date("2026-10-31T22:58:30Z"));
    monter();
    expect(cycle.rafraichir).not.toHaveBeenCalled();
    fenetre.dispatchEvent(new Event("focus"));
    expect(cycle.rafraichir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120_000);
    expect(attributs.get("data-ambiance-site")).toBe("automne");
    expect(cycle.rafraichir).toHaveBeenCalledTimes(1);
    fenetre.dispatchEvent(new Event("focus"));
    expect(cycle.rafraichir).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["2026-03-28T23:00:00Z", 23],
    ["2026-10-24T22:00:00Z", 25],
  ])("programme le prochain minuit à partir de %s malgré le changement d’heure", (debut, heures) => {
    vi.setSystemTime(new Date(debut));
    const minuterie = vi.spyOn(window, "setTimeout");
    monter();
    expect(minuterie).toHaveBeenLastCalledWith(expect.any(Function), heures * 3_600_000);
    minuterie.mockRestore();
  });

  it("rattrape plusieurs jours de veille au retour du focus et conserve une seule minuterie", () => {
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    monter();
    vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
    fenetre.dispatchEvent(new Event("focus"));
    expect(attributs.get("data-ambiance-site")).toBe("noel");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("resynchronise un onglet redevenu visible", () => {
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    monter();
    vi.setSystemTime(new Date("2026-12-15T12:00:00Z"));
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(attributs.get("data-ambiance-site")).toBe("halloween");
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
    expect(attributs.get("data-ambiance-site")).toBe("noel");
    expect(vi.getTimerCount()).toBe(1);
  });

  it("supprime ses décorations, sa minuterie et ses écouteurs au démontage", () => {
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    monter();
    nettoyer?.();
    nettoyer = undefined;
    expect(attributs.size).toBe(0);
    expect(styles.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    fenetre.dispatchEvent(new Event("focus"));
    page.dispatchEvent(new Event("visibilitychange"));
    expect(attributs.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("restaure les valeurs présentes avant son montage", () => {
    vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    attributs.set("data-ambiance-site", "hiver");
    styles.set("--ambiance-image", { valeur: "none", priorite: "important" });
    monter();
    nettoyer?.();
    nettoyer = undefined;
    expect(attributs.get("data-ambiance-site")).toBe("hiver");
    expect(styles.get("--ambiance-image")).toEqual({ valeur: "none", priorite: "important" });
  });
});

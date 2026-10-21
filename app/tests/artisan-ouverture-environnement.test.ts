import { describe, expect, it } from "vitest";
import { activationModuleArtisan } from "@/lib/artisan-activation";

describe("activité artisan — ouverture métier hors du banc local", () => {
  it("rend les deux modules utilisables sur une API hébergée en HTTPS, sous leurs droits SQL", () => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: "https://projet-fictif.supabase.co" };
    expect(activationModuleArtisan("clients", env)).toBe(true);
    expect(activationModuleArtisan("reglements", env)).toBe(true);
  });
  it.each(["", "invalide", "http://projet-fictif.supabase.co", "file:///tmp/fictif"]) ("refuse une API absente, invalide ou non sécurisée : %s", (url) => {
    expect(activationModuleArtisan("clients", { NEXT_PUBLIC_SUPABASE_URL: url, GERIMMO_ARTISAN_CLIENTS_LOCAUX: "1" })).toBe(false);
  });
  it.each(["http://localhost:54321", "http://127.0.0.1:54321", "http://[::1]:54321"])("conserve l’activation explicite du banc : %s", (url) => {
    const env = { NEXT_PUBLIC_SUPABASE_URL: url, GERIMMO_ARTISAN_CLIENTS_LOCAUX: "1", GERIMMO_ARTISAN_REGLEMENTS_LOCAUX: "0" };
    expect(activationModuleArtisan("clients", env)).toBe(true);
    expect(activationModuleArtisan("reglements", env)).toBe(false);
    expect(activationModuleArtisan("clients", { ...env, GERIMMO_ARTISAN_CLIENTS_LOCAUX: undefined })).toBe(false);
  });
});

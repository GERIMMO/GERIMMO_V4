/**
 * Tests unitaires — vérification du type RÉEL d'un fichier (RM-A4.9).
 * Un exécutable renommé en .pdf doit être refusé.
 */
import { describe, expect, it } from "vitest";
import { detecterMimeReel, formaterTaille } from "../src/lib/file-type";

function octets(...valeurs: number[]): Uint8Array {
  return new Uint8Array(valeurs);
}

describe("detecterMimeReel", () => {
  it("reconnaît un PDF (%PDF-)", () => {
    expect(detecterMimeReel(octets(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe(
      "application/pdf"
    );
  });

  it("reconnaît un JPEG (FF D8 FF)", () => {
    expect(detecterMimeReel(octets(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });

  it("reconnaît un PNG (signature complète)", () => {
    expect(
      detecterMimeReel(octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    ).toBe("image/png");
  });

  it("refuse un exécutable Windows renommé (MZ)", () => {
    expect(detecterMimeReel(octets(0x4d, 0x5a, 0x90, 0x00, 0x03))).toBeNull();
  });

  it("refuse un PNG à la signature tronquée", () => {
    expect(detecterMimeReel(octets(0x89, 0x50, 0x4e, 0x47))).toBeNull();
  });

  it("refuse un fichier vide", () => {
    expect(detecterMimeReel(octets())).toBeNull();
  });

  it("refuse du texte quelconque", () => {
    expect(detecterMimeReel(new TextEncoder().encode("bonjour"))).toBeNull();
  });
});

describe("formaterTaille", () => {
  it("formate en octets, Ko et Mo", () => {
    expect(formaterTaille(512)).toBe("512 o");
    expect(formaterTaille(2048)).toBe("2 Ko");
    expect(formaterTaille(3 * 1024 * 1024)).toBe("3.0 Mo");
  });
});

/**
 * L'image d'un article du journal (06/10/2026) : l'illustration Facebook si
 * elle existe et qu'elle est servie en https, sinon le repli de la charte.
 * Jamais une zone vide, jamais une adresse non sécurisée.
 */
import { describe, expect, it } from "vitest";
import { IMAGE_REPLI_JOURNAL, imageArticle } from "@/components/image-journal";

describe("imageArticle", () => {
  it("retient l'illustration publique de l'article", () => {
    expect(imageArticle("https://rddlxunppddzpsaatdaz.supabase.co/storage/v1/object/public/marketing-visuels/a/b.jpg")).toEqual({
      src: "https://rddlxunppddzpsaatdaz.supabase.co/storage/v1/object/public/marketing-visuels/a/b.jpg",
      repli: false,
    });
  });
  it("replie sur l'illustration de la charte quand l'article n'en a pas, ou qu'elle n'est pas en https", () => {
    expect(imageArticle(null)).toEqual({ src: IMAGE_REPLI_JOURNAL, repli: true });
    expect(imageArticle("   ")).toEqual({ src: IMAGE_REPLI_JOURNAL, repli: true });
    expect(imageArticle("http://exemple.fr/image.jpg")).toEqual({ src: IMAGE_REPLI_JOURNAL, repli: true });
  });
});

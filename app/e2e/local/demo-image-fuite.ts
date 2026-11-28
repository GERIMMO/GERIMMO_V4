import type { Page } from "@playwright/test";

export async function imageFuite(page: Page, reference: string, apres = false) {
  const image = await page.evaluate(({ repare, reference }) => {
    const toile = document.createElement("canvas");
    toile.width = 640;
    toile.height = 360;
    const dessin = toile.getContext("2d")!;
    const fond = dessin.createLinearGradient(0, 0, 640, 360);
    fond.addColorStop(0, "#9b9180");
    fond.addColorStop(1, "#3d3730");
    dessin.fillStyle = fond;
    dessin.fillRect(0, 0, 640, 360);
    const metal = dessin.createLinearGradient(250, 0, 376, 0);
    metal.addColorStop(0, "#777b77");
    metal.addColorStop(0.4, "#e5e4d5");
    metal.addColorStop(1, "#898b82");
    dessin.lineCap = "round";
    dessin.lineWidth = 78;
    dessin.strokeStyle = metal;
    dessin.beginPath();
    dessin.moveTo(309, 0);
    dessin.lineTo(309, 147);
    dessin.bezierCurveTo(309, 245, 439, 245, 439, 150);
    dessin.lineTo(531, 150);
    dessin.stroke();
    dessin.fillStyle = repare ? "#393b3a" : "#514c3a";
    dessin.fillRect(262, 99, 95, 20);
    if (!repare) {
      dessin.fillStyle = "#b8dde0";
      for (const [x, y, taille] of [[267, 151, 5], [276, 185, 7], [253, 225, 9]]) {
        dessin.beginPath();
        dessin.ellipse(x, y, taille, taille * 1.5, 0, 0, Math.PI * 2);
        dessin.fill();
      }
    }
    dessin.fillStyle = "#171c22";
    dessin.fillRect(0, 310, 640, 50);
    dessin.fillStyle = "#fff";
    dessin.font = "20px sans-serif";
    dessin.fillText(repare ? "Image fictive · joint remplacé" : "Image fictive · raccord sous l’évier", 24, 342);
    dessin.font = "14px sans-serif";
    dessin.fillText(reference, 489, 342);
    return toile.toDataURL("image/png").split(",")[1];
  }, { repare: apres, reference });
  return Buffer.from(image, "base64");
}

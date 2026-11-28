#!/bin/sh
set -eu

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "Usage : sh $0 captures-1440 sortie.webm [ffmpeg]" >&2
  exit 2
fi
captures=$1
sortie=$2
encodeur=${3:-ffmpeg}

images='01-signalement 02-alerte 02b-dossier 03-devis 04-creneaux 05-rendez-vous 06-compte-rendu 07-facture-validee 08-aide-2044'
for image in $images; do
  test -f "$captures/$image.png" || { echo "Capture manquante : $image" >&2; exit 1; }
done
# Le FFmpeg fourni avec Playwright lit le MJPEG. Next fournit déjà sharp.
flux=$(mktemp)
trap 'rm -f "$flux"' EXIT
node --input-type=module -e '
  import sharp from "sharp";
  import { join } from "node:path";
  const [dossier, ...images] = process.argv.slice(1);
  for (const image of images) {
    const jpeg = await sharp(join(dossier, image + ".png")).jpeg({ quality: 94 }).toBuffer();
    for (let seconde = 0; seconde < 3; seconde++) process.stdout.write(jpeg);
  }
' "$captures" $images > "$flux"
"$encodeur" -hide_banner -loglevel error -n -f image2pipe -framerate 1 -vcodec mjpeg -i "$flux" \
  -c:v libvpx-vp9 -pix_fmt yuv420p -threads 2 "$sortie"

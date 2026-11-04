import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VueParcProprietaire, type BienDuParc } from "@/app/agence/[orgId]/parc/vue-parc-proprietaire";
import { occupationLot } from "@/lib/occupation-lot";

const chambres = [{ id: "ambre" }, { id: "jade" }, { id: "azur" }];
const illisible = new URLSearchParams(location.search).has("illisible");
const lot = (id: string, nom: string, etat: string, baux: { etat: string; chambre_id: string | null }[], pieces = chambres) => ({
  id, nom, etat, surface: 70, meuble: true, href: `/espace/fictif/parc/residence/lots/${id}`, locataires: baux.length ? ["Camille Martin"] : [], loyer: baux.length ? 900 : null,
  occupation: illisible ? null : occupationLot(pieces, baux), aCompleter: null,
});
const biens: BienDuParc[] = [
  { id: "residence", nom: "Résidence des Lilas", adresse: "12 rue des Lilas · 69003 Lyon", href: "/espace/fictif/parc/residence", lots: [
    lot("coloc", "Appartement partagé", "loue", [{ etat: "actif", chambre_id: "ambre" }, { etat: "preavis", chambre_id: "jade" }]),
    lot("entier", "Duplex familial", "loue", [{ etat: "actif", chambre_id: null }]),
  ] },
  { id: "atelier", nom: "Maison des Tilleuls", adresse: "23 avenue des Tilleuls · 75012 Paris", href: "/espace/fictif/parc/atelier", lots: [lot("studio", "Studio cour", "brouillon", [], [])] },
  { id: "vide", nom: "Immeuble à organiser", adresse: "19 rue de la Gare", href: "/espace/fictif/parc/vide", lots: [] },
];
const selection = new URLSearchParams(location.search).get("sel")?.split(":")[1] ?? null;
const choisi = biens.find(bien => bien.id === selection);
createRoot(document.getElementById("racine")!).render(<StrictMode><main><h1>Biens & locations</h1><VueParcProprietaire biens={biens} retires={[]} base="/espace/fictif" bienSelectionne={choisi?.id} mois="2026-11" loyersMois={illisible ? null : { attendu: 1800, encaisse: 0 }}><article><h2>Fiche : {choisi?.nom}</h2><p>Informations du bien</p></article></VueParcProprietaire></main></StrictMode>);

import { describe,expect,it } from "vitest";
import { erreurVolumeDepot } from "@/lib/limite-depot";
import { TAILLE_MAX_DEPOT_OCTETS,TAILLE_MAX_OCTETS } from "@/lib/file-type";
describe("Volumes des dépôts",()=>{
 it("conserve la lecture des anciennes archives de 10 Mo",()=>{expect(TAILLE_MAX_OCTETS).toBe(10*1024*1024);expect(TAILLE_MAX_DEPOT_OCTETS).toBe(4*1024*1024);});
 it("refuse avant envoi un fichier trop gros ou plusieurs pièces trop lourdes",()=>{expect(erreurVolumeDepot([{size:4*1024*1024+1}])).toContain('Ce fichier');expect(erreurVolumeDepot([{size:3*1024*1024},{size:2*1024*1024}])).toContain('au total');expect(erreurVolumeDepot([{size:2*1024*1024},{size:2*1024*1024}])).toBeNull();});
 it("mesure une marge de transport pour un formulaire de 4 Mo",async()=>{const f=new FormData();f.append('fichier',new Blob([new Uint8Array(TAILLE_MAX_DEPOT_OCTETS)]),'document.pdf');f.append('titre','Document fictif');const taille=(await new Response(f).arrayBuffer()).byteLength;expect(taille).toBeGreaterThan(TAILLE_MAX_DEPOT_OCTETS);expect(taille).toBeLessThan(4_500_000);});
});

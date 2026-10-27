import {describe,it,expect} from "vitest";
import {lireFileVeille} from "@/lib/file-veille";
describe("lecture complète de la file avant un plafond",()=>{
 it("lit au-delà de 200 anciennes propositions et ne perd pas la dernière",async()=>{
  const lignes=Array.from({length:401},(_,id)=>({id:String(id),titre:id===400?"DPE":"AAH"}));
  const pages:number[]=[];
  const db={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async(de:number,a:number)=>{pages.push(de);return {data:lignes.slice(de,a+1),error:null};}};return q;}};
  expect(await lireFileVeille(db as never)).toEqual(lignes);expect(pages).toEqual([0,200,400]);
 });
 it("refuse de compter une lecture partielle comme une petite file",async()=>{
  const db={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async(de:number)=>de===0?{data:Array.from({length:200},()=>({id:"ancien"})),error:null}:{data:null,error:{message:"panne"}}};return q;}};
  await expect(lireFileVeille(db as never)).rejects.toThrow("indisponible");
 });
});

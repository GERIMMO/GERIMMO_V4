"use client";
import {useEffect,useRef,type ReactNode} from 'react';
/** Un lien « Corriger » révèle aussi le groupe qui contient sa rubrique. */
export function DepliantBien({children,className,id}:{children:ReactNode;className:string;id:string}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const ouvrir=(hash:string)=>{if(!hash)return;let cible:HTMLElement|null;try{cible=document.getElementById(decodeURIComponent(hash.slice(1)))}catch{return}if(cible&&ref.current?.contains(cible))ref.current.open=true};
 const hash=()=>ouvrir(window.location.hash);const clic=(e:MouseEvent)=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;const lien=e.target instanceof Element?e.target.closest('a[href]'):null;if(!(lien instanceof HTMLAnchorElement))return;const u=new URL(lien.href);if(u.origin===location.origin&&u.pathname===location.pathname&&u.search===location.search)ouvrir(u.hash)};
 hash();window.addEventListener('hashchange',hash);document.addEventListener('click',clic,true);return()=>{window.removeEventListener('hashchange',hash);document.removeEventListener('click',clic,true)};
 },[]);
 return <details ref={ref} className={className} id={id} onInvalidCapture={()=>{if(ref.current)ref.current.open=true}}>{children}</details>;
}

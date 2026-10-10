"use client";
import { NavigationParcours, type EtapeParcours } from "@/components/navigation-parcours";

export function NavigationBail(props: { etapes: readonly EtapeParcours[]; etape: number; changer: (index: number) => void }) {
  return <NavigationParcours {...props} />;
}

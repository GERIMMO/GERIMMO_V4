"use client";
import { createContext } from "react";
export const EtapeComplementsBail = createContext<{ etape: string; revision?: number; ouvrir: (id: string) => void } | null>(null);

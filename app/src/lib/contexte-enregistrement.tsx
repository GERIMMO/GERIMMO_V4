"use client";
import { createContext } from "react";
/** Les formulaires hors assistant gardent leur comportement habituel. */
export const CompletudeBail = createContext<{ manquants: string[]; erreur?: string } | null>(null);
export const SuiviEnregistrement = createContext<((succes?: boolean) => void) | null>(null);


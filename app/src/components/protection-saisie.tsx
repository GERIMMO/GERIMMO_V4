"use client";
import { useEffect } from "react";
import { installerProtectionSaisie } from "@/lib/protection-saisie";

export function ProtectionSaisie() {
  useEffect(() => installerProtectionSaisie(), []);
  return null;
}

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // LE TIRET BAS EST UNE CONVENTION, PAS UN OUBLI. `useActionState` impose la
    // signature `(etatPrecedent, formData)` : une action qui n'a besoin que du
    // second doit quand même déclarer le premier. Le préfixer d'un « _ » est la
    // façon habituelle de dire « je sais qu'il est là et je ne m'en sers pas ».
    // Vingt avertissements de cette nature noyaient ceux qui signalent une
    // vraie variable morte — et un avertissement qu'on apprend à ignorer ne
    // sert plus à rien.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

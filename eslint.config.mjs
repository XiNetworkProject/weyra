import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Existing UI flows reset local state when their owning entity changes. Keep this visible
      // as a warning until those views move into reducer-owned feature modules.
      "react-hooks/set-state-in-effect": "warn",
      // French copy contains frequent apostrophes and React safely escapes text nodes.
      "react/no-unescaped-entities": "off",
    },
  },
  {
    files: ["components/atlas/AtlasApp.tsx"],
    rules: {
      // Legacy Atlas patterns are tracked as warnings until AtlasApp is split into feature modules.
      "react-hooks/immutability": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  {
    files: ["components/atlas/NearbyObservations.tsx"],
    rules: {
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    ".radar-cache/**",
    ".vercel/**",
    "artifacts/**",
    "dist/**",
    "node_modules/**",
    "public/map-styles/**",
    "supabase/.temp/**",
  ]),
]);

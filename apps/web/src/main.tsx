import { AuthKitProvider } from "@workos-inc/authkit-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App.tsx";
import { ThemeProvider } from "@/components/theme-provider.tsx";

// WorkOS project "proofbox": Production for the deployed Worker, Staging for localhost:5173
const workosClientId = import.meta.env.PROD
  ? "client_01M54QEZ0YJH7FC1VV0MYF1C28"
  : "client_01M54QEYQAJXPKTQ3BR5SQ5HJQ";

// devMode keeps the refresh token in localStorage. Without it AuthKit uses a cookie on
// api.workos.com, which browsers block as third-party unless apiHostname is a custom auth
// domain on our own site, and workers.dev cannot have one.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthKitProvider clientId={workosClientId} devMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AuthKitProvider>
  </StrictMode>,
);

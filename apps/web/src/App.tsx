import { useAuth } from "@workos-inc/authkit-react";
import { lazy, Suspense, useEffect } from "react";

import { PackingStation } from "@/components/packing-station";
import { SignInScreen } from "@/components/sign-in-screen";

// dev only: /?states renders every UI state; production builds drop this import entirely
const StateGallery = import.meta.env.DEV ? lazy(() => import("@/debug/state-gallery")) : null;

export function AuthSplash() {
  return (
    <main className="grid min-h-svh appear-late place-items-center bg-muted/40" aria-busy="true">
      <img
        src="/proofbox-mark.svg"
        alt=""
        className="size-10 animate-pulse motion-reduce:animate-none dark:invert"
      />
      <span className="sr-only">Signing in</span>
    </main>
  );
}

export function App() {
  const { isLoading, user, signIn } = useAuth();

  // WorkOS sends dashboard impersonation and other externally started logins to /login
  useEffect(() => {
    if (window.location.pathname === "/login") void signIn();
  }, [signIn]);

  if (StateGallery && new URLSearchParams(window.location.search).has("states")) {
    return (
      <Suspense fallback={null}>
        <StateGallery />
      </Suspense>
    );
  }

  if (isLoading) return <AuthSplash />;

  if (!user) return <SignInScreen onSignIn={() => signIn()} />;

  return <PackingStation />;
}

export default App;

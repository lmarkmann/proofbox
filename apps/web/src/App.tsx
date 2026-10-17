import { useAuth } from "@workos-inc/authkit-react";
import { useEffect, useState } from "react";

import { CameraPanel } from "@/components/camera-panel";
import { LabelPanel } from "@/components/label-panel";
import { SignInScreen } from "@/components/sign-in-screen";
import { SiteHeader } from "@/components/site-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/hooks/use-health";

type PrintedLabel = { orderId: string; at: Date };

export function App() {
  const { isLoading, user, signIn } = useAuth();

  // WorkOS sends dashboard impersonation and other externally started logins to /login
  useEffect(() => {
    if (window.location.pathname === "/login") void signIn();
  }, [signIn]);

  if (isLoading) return null;

  if (!user) return <SignInScreen onSignIn={() => signIn()} />;

  return <PackingStation />;
}

function PackingStation() {
  const api = useHealth("/api/health");
  const printer = useHealth("/printer/health");
  const [printed, setPrinted] = useState<PrintedLabel[]>([]);

  return (
    <div className="min-h-svh bg-muted/40">
      <SiteHeader api={api} printer={printer} />
      <main className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <CameraPanel />
          <Card>
            <CardHeader>
              <CardTitle>Printed this session</CardTitle>
              <CardDescription>Labels sent to the printer since this page opened.</CardDescription>
            </CardHeader>
            <CardContent>
              {printed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No labels printed yet.</p>
              ) : (
                <ul className="divide-y">
                  {printed.map(({ orderId, at }) => (
                    <li
                      key={at.getTime()}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span className="font-medium">{orderId}</span>
                      <time
                        dateTime={at.toISOString()}
                        className="text-muted-foreground tabular-nums"
                      >
                        {at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <LabelPanel
          printerReady={printer?.printer === "connected"}
          onPrinted={(orderId) => setPrinted((labels) => [{ orderId, at: new Date() }, ...labels])}
        />
      </main>
    </div>
  );
}

export default App;

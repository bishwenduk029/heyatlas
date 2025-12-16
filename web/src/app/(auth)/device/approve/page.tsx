"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient, useSession } from "@/lib/auth/client";
import { Terminal, Check, X, Loader2 } from "lucide-react";

export default function DeviceApprovePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCode = searchParams.get("code") || "";
  const { data: session, isPending } = useSession();
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<"pending" | "approved" | "denied">("pending");

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!isPending && !session?.user) {
      router.push(`/login?redirect=/device/approve?code=${userCode}`);
    }
  }, [session, isPending, router, userCode]);

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (authClient as any).device.approve({ userCode });
      setStatus("approved");
    } catch {
      setStatus("denied");
    }
    setProcessing(false);
  };

  const handleDeny = async () => {
    setProcessing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (authClient as any).device.deny({ userCode });
    } catch {
      // Ignore errors
    }
    setStatus("denied");
    setProcessing(false);
  };

  if (isPending) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (status === "approved") {
    return (
      <Card className="w-full">
        <CardContent className="text-center py-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Device Authorized!</h2>
          <p className="text-muted-foreground">
            You can close this tab and return to your terminal.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === "denied") {
    return (
      <Card className="w-full">
        <CardContent className="text-center py-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <X className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            The device authorization was denied.
          </p>
          <Button onClick={() => router.push("/")} variant="outline">
            Go Home
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Terminal className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Authorize Device</CardTitle>
        <CardDescription>
          A CLI application is requesting access to your account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg bg-muted p-4 text-center">
          <p className="text-sm text-muted-foreground mb-1">Device Code</p>
          <p className="text-2xl font-mono font-bold tracking-widest">{userCode}</p>
        </div>

        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground mb-2">Signed in as:</p>
          <p className="font-medium">{session?.user?.email}</p>
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleDeny}
            variant="outline"
            className="flex-1"
            disabled={processing}
          >
            Deny
          </Button>
          <Button
            onClick={handleApprove}
            className="flex-1"
            disabled={processing}
          >
            {processing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Authorize
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

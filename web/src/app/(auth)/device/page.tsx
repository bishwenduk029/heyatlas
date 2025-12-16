"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth/client";
import { Terminal } from "lucide-react";

export default function DevicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userCode, setUserCode] = useState(searchParams.get("code") || "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Format code: remove dashes, uppercase
      const formattedCode = userCode.trim().replace(/-/g, "").toUpperCase();

      // Verify the code is valid
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (authClient as any).device({
        query: { user_code: formattedCode },
      });

      if (response.data) {
        router.push(`/device/approve?code=${formattedCode}`);
      } else {
        setError("Invalid or expired code");
      }
    } catch {
      setError("Invalid or expired code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Terminal className="h-6 w-6 text-primary" />
        </div>
        <CardTitle>Device Authorization</CardTitle>
        <CardDescription>
          Enter the code shown in your terminal to connect your CLI
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="text"
            value={userCode}
            onChange={(e) => setUserCode(e.target.value.toUpperCase())}
            placeholder="ABCD-1234"
            className="text-center text-2xl tracking-widest font-mono"
            maxLength={12}
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={loading || !userCode}>
            {loading ? "Verifying..." : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

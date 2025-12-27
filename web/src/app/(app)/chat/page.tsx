import { VoiceApp } from "@/components/voice/voice-app";
import { Metadata } from "next";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Hey Atlas",
  description: "Voice control your local AI coding agent",
};

export default async function VoicePage() {
  // Check if user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    // Redirect to login with return URL
    redirect("/login?redirect=/chat");
  }

  return <VoiceApp userId={session.user.id} mode="local" />;
}

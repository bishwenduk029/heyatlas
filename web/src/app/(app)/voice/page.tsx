import { VoiceApp } from "@/components/voice/voice-app";
import { Metadata } from "next";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Hey Computer",
  description: "Talk to your AI-powered digital assistant",
};

export default async function VoicePage() {
  // Check if user is authenticated
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    // Redirect to login with return URL
    redirect("/login?redirect=/voice");
  }

  return <VoiceApp />;
}

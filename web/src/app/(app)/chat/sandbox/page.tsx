import { VoiceApp } from "@/components/voice/voice-app";
import { Metadata } from "next";
import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Hey Atlas - Sandbox",
  description: "Talk to your AI-powered digital assistant with cloud desktop",
};

export default async function VoiceSandboxPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login?redirect=/voice/sandbox");
  }

  return <VoiceApp userId={session.user.id} mode="sandbox" />;
}

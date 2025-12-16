import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SettingsClient from "./settings-client";

export const metadata = {
  title: "Settings",
  description: "Configure your AI agents",
};

export default async function SettingsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login?redirect=/settings");
  }

  return <SettingsClient />;
}

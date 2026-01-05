"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, Bot, Cpu } from "lucide-react";
import { AnimatedHeroTitle } from "@/components/homepage/animated-hero-title";
import { APP_DESCRIPTION } from "@/lib/config/constants";
import { ChatInput } from "@/components/voice/chat-input";
import { useSession } from "@/lib/auth/client";
import { VoiceIcon } from "@/components/ui/voice-icon";

export function Hero() {
  const router = useRouter();
  const { data: session } = useSession();
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSend = (message: string) => {
    // Store message before redirect
    localStorage.setItem("heyatlas_pending_message", message);

    // Route based on auth status (like chat page does)
    if (session?.user && session?.session) {
      router.push("/chat");
    } else {
      router.push("/login?redirect=/chat");
    }
  };

  const handleToggleVoice = () => {
    // Route based on auth status
    if (session?.user && session?.session) {
      router.push("/chat?mode=voice");
    } else {
      router.push("/login?redirect=/chat");
    }
  };

  const handleToggleTasks = () => {
    // Route based on auth status
    if (session?.user && session?.session) {
      router.push("/chat?view=tasks");
    } else {
      router.push("/login?redirect=/chat");
    }
  };

  return (
    <section className="bg-background flex items-center justify-center">
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-8 lg:px-8 lg:py-16">
        <div className="flex flex-col items-center justify-center gap-12 text-center">
          {/* Center Content */}
          <div className="max-w-3xl space-y-8">
            {/* Status Badge */}
            <div className="border-border bg-background/50 inline-flex items-center rounded-full border px-3 py-1 text-sm backdrop-blur-sm">
              <Sparkles className="text-primary mr-2 h-3 w-3" />
              <span className="text-muted-foreground">Open Source</span>
            </div>

            {/* Main Heading */}
            <div className="space-y-4">
              <AnimatedHeroTitle />

              <p className="text-muted-foreground mx-auto max-w-2xl text-xl leading-relaxed">
                Your personal{" "}
                <span className="text-primary font-bold">AI </span>
                companion who <span className="text-primary font-bold">T</span>
                hinks, <span className="text-primary font-bold">L</span>istens
                and <span className="text-primary font-bold">A</span>ct
                <span className="text-primary font-bold">s</span>
              </p>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <div className="text-muted-foreground flex items-center gap-2">
                <Bot className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Personal Intelligence</span>
              </div>
              <div className="text-muted-foreground hidden items-center gap-2 sm:flex">
                <Cpu className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">
                  Connects to Your Agents
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2">
                <VoiceIcon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">Voice + Text Chat</span>
              </div>
            </div>

            {/* Chat Input */}
            <div className="mx-auto w-full max-w-3xl">
              <ChatInput
                onSend={handleSend}
                onStop={() => {}}
                onToggleVoice={handleToggleVoice}
                onToggleTasks={handleToggleTasks}
                isLoading={isSubmitting}
                disabled={isSubmitting}
                showVoiceToggle={true}
                isTasksView={false}
                isVoiceMode={false}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Shield, Zap, Sparkles } from "lucide-react";
import { AnimatedHeroTitle } from "@/components/homepage/animated-hero-title";
import { APP_DESCRIPTION } from "@/lib/config/constants";
import { ChatInput } from "@/components/voice/chat-input";
import { useSession } from "@/lib/auth/client";

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
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
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
                Your personal <span className="text-primary font-bold">A</span>I
                companion that <span className="text-primary font-bold">T</span>
                hinks, <span className="text-primary font-bold">L</span>istens
                and can <span className="text-primary font-bold">A</span>ct on{" "}
                <span className="text-primary font-bold">S</span>ystems
              </p>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span>Personal Intelligence</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Connects to Your Agents</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span>Voice(WebRTC) + Text Chat</span>
              </div>
            </div>

            {/* Chat Input */}
            <div className="mx-auto w-full max-w-2xl">
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

            {/* Social Proof */}
            <div className="text-muted-foreground flex items-center justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Free Plan Available</span>
              </div>
              <div className="bg-border h-4 w-px" />
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>No Credit Card Required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

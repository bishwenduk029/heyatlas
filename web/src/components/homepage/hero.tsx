"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Bot,
  Brain,
  Zap,
  Lightbulb,
  MessageCircleHeart,
  FileText,
  Notebook,
  History,
  Mic,
  Calendar,
  Layers,
  Code,
} from "lucide-react";
import { AnimatedHeroTitle } from "@/components/homepage/animated-hero-title";
import { APP_DESCRIPTION } from "@/lib/config/constants";
import { ChatInput } from "@/components/voice/chat-input";
import { useSession } from "@/lib/auth/client";
import { VoiceIcon } from "@/components/ui/voice-icon";
import { cn } from "@/lib/utils";

const suggestions = [
  {
    icon: Lightbulb,
    labels: ["Brainstorm ideas", "Find inspiration", "Solve a problem"],
    color:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  {
    icon: FileText,
    labels: ["Draft my resume", "Write an email", "Summarize this PDF"],
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    icon: Brain,
    labels: ["Remember for me", "Recall my notes", "Store this thought"],
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  {
    icon: Layers,
    labels: ["Deep discussions", "Analyze this", "Explore topics"],
    color:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  },
  {
    icon: Notebook,
    labels: ["Take a note", "Create a task", "Make a list"],
    color:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  },
  {
    icon: History,
    labels: ["Catch me up", "What did I miss?", "Review last week"],
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  {
    icon: Calendar,
    labels: ["Plan my week", "Schedule a meeting", "Set a reminder"],
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  },
  {
    icon: Code,
    labels: ["Build a website", "Create a game", "Fix this bug"],
    color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  },
  {
    icon: Mic,
    labels: ["Just talk", "Vent a little", "Practice Speech"],
    color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  },
];

export function Hero() {
  const router = useRouter();
  const { data: session } = useSession();
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentLabelIndex, setCurrentLabelIndex] = useState(0);

  // Rotate suggestion labels every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentLabelIndex((prev) => (prev + 1) % 3); // 3 labels per item
    }, 5000);
    return () => clearInterval(interval);
  }, []);

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
    <section className="bg-background relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden">
      {/* Abstract Background Decoration */}
      <div className="bg-primary/5 absolute top-1/2 left-1/2 -z-10 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" />

      <div className="relative z-10 w-full py-8 lg:py-16">
        {/* Floating Suggestions - Hidden on small mobile to save space */}
        <div className="pointer-events-none absolute inset-0 z-0 hidden lg:block">
          {suggestions.map((item, i) => {
            // Arrange in an ellipse
            // Total circle is 360, but we want to avoid 90deg (bottom center) where it might hit chat input
            // 8 items = 45 degrees apart.
            // If we start at -90 (top), indices are:
            // 0: -90 (Top)
            // 1: -45 (Top Right)
            // 2: 0 (Right)
            // 3: 45 (Bottom Rightish)
            // 4: 90 (Bottom) -> DANGER
            // 5: 135 (Bottom Leftish)
            // 6: 180 (Left)
            // 7: 225 (Top Left)

            // To avoid the items at 90 (bottom) and -90 (top) from being boring or overlapping:
            // Let's rotate by half a step (22.5 deg) so no item is exactly at 90.
            const angleDeg = i * (360 / suggestions.length) - 90 + 22.5;
            const angle = angleDeg * (Math.PI / 180);

            // Ellipse dimensions
            const radiusX = 550; // Wide spread
            const radiusY = 400; // Shorter height

            const x = Math.cos(angle) * radiusX;
            const y = Math.sin(angle) * radiusY;

            return (
              <div
                key={item.labels[0]}
                className="absolute"
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                }}
              >
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-full border border-white/20 bg-white/60 p-3 px-5 shadow-sm backdrop-blur-sm dark:bg-black/40",
                    item.color,
                  )}
                  style={{
                    animation: `float-slow ${4 + i}s ease-in-out infinite`,
                    animationDelay: `${i * 0.5}s`,
                  }}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/50 backdrop-blur-sm dark:bg-black/20">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span
                    key={currentLabelIndex}
                    className="animate-in fade-in slide-in-from-bottom-2 text-foreground/80 dark:text-foreground font-[family-name:var(--font-caveat)] text-xl font-medium duration-500 will-change-transform"
                  >
                    {item.labels[currentLabelIndex]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative z-10 flex flex-col items-center justify-center gap-12 text-center">
          {/* Status Badge */}
          <div className="border-border bg-background/50 inline-flex items-center rounded-full border px-3 py-1 text-sm backdrop-blur-sm">
            <Sparkles className="text-primary mr-2 h-3 w-3" />
            <span className="text-muted-foreground">Open Source</span>
          </div>

          {/* Center Content */}
          <div className="w-full max-w-2xl space-y-8 px-4">
            {/* Main Heading */}
            <div className="space-y-6">
              <AnimatedHeroTitle />

              <p className="text-muted-foreground mx-auto text-xl leading-relaxed">
                Your personal AI companion who{" "}
                <span className="text-primary font-semibold">Thinks</span>,{" "}
                <span className="text-primary font-semibold">Listens</span>, and{" "}
                <span className="text-primary font-semibold">Acts</span>.
              </p>
            </div>

            {/* Chat Input */}
            <div className="mx-auto w-full">
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

            {/* Mobile-only Suggestions Grid */}
            <div className="grid grid-cols-2 gap-3 pt-8 lg:hidden">
              {suggestions.slice(0, 4).map((item) => (
                <div
                  key={item.labels[0]}
                  className="bg-muted/50 flex items-center gap-2 rounded-xl p-3"
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      item.color,
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span
                    key={currentLabelIndex}
                    className="animate-in fade-in slide-in-from-bottom-1 text-muted-foreground text-left text-xs font-medium"
                  >
                    {item.labels[currentLabelIndex]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes float-slow {
          0%,
          100% {
            transform: translateY(0px) rotate(var(--tw-rotate));
          }
          50% {
            transform: translateY(-10px) rotate(var(--tw-rotate));
          }
        }
      `}</style>
    </section>
  );
}

"use client";

import React from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Mic,
  Monitor,
  Brain,
  Lock,
  Zap,
  ArrowRight,
  Sparkles,
  MessagesSquare,
} from "lucide-react";

interface Feature {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
}

const features: Feature[] = [
  {
    title: "Voice-First Interface",
    description:
      "Natural conversations with your AI assistant. Just speak your mind and let HeyComputer understand your needs. No typing, no clicks—just talk.",
    icon: Mic,
    category: "Interface",
  },
  {
    title: "Virtual Computer Access",
    description:
      "HeyComputer can control virtual computers to execute complex tasks. From research to coding, it handles everything with precision.",
    icon: Monitor,
    category: "Automation",
  },
  {
    title: "Intelligent Task Delegation",
    description:
      "Advanced AI understands context and delegates tasks to specialized agents. Your personal AI team working in harmony.",
    icon: Brain,
    category: "Intelligence",
  },
  {
    title: "Memory & Context",
    description:
      "Remembers your preferences, past conversations, and ongoing projects. Every interaction builds on what HeyComputer knows about you.",
    icon: MessagesSquare,
    category: "Personalization",
  },
  {
    title: "Private & Secure",
    description:
      "Your data stays yours. End-to-end encryption, isolated environments, and complete privacy for all your interactions.",
    icon: Lock,
    category: "Security",
  },
  {
    title: "Instant Execution",
    description:
      "Tasks happen in real-time. Watch as HeyComputer navigates, researches, creates, and delivers results while you stay in control.",
    icon: Zap,
    category: "Performance",
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const IconComponent = feature.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <Card className="group relative overflow-hidden p-6 transition-all duration-300 hover:shadow-md">
      <div className="space-y-4">
        {/* Icon and Category */}
        <div className="flex items-center justify-between">
          <div className="bg-primary/10 text-primary group-hover:bg-primary/20 flex h-12 w-12 items-center justify-center rounded-lg transition-all duration-300">
            <IconComponent className="h-6 w-6" />
          </div>
          <Badge variant="secondary" className="text-xs">
            {feature.category}
          </Badge>
        </div>

        {/* Content */}
        <div className="space-y-2">
          <h3 className="text-foreground text-lg font-semibold">
            {feature.title}
          </h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {feature.description}
          </p>
        </div>
      </div>

        {/* Hover Arrow */}
        <div className="absolute right-4 bottom-4 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100">
          <ArrowRight className="text-muted-foreground h-4 w-4" />
        </div>
      </Card>
    </motion.div>
  );
}

export function Features() {
  return (
    <section className="bg-background py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section Header */}
        <motion.div 
          className="mx-auto mb-16 max-w-2xl text-center"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
        >
          <Badge variant="secondary" className="mb-4">
            <Sparkles className="mr-2 h-3 w-3" />
            Everything Included
          </Badge>

          <h2 className="text-foreground text-3xl font-bold tracking-tight sm:text-4xl">
            Powerful AI capabilities
            <span className="text-primary block">at your command</span>
          </h2>

          <p className="text-muted-foreground mt-6 text-lg">
            HeyComputer combines voice AI, virtual computer access, and
            intelligent automation to become your ultimate digital assistant.
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} feature={feature} index={index} />
          ))}
        </div>

        {/* Bottom Stats */}
        <motion.div 
          className="mt-16 grid grid-cols-3 gap-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div>
            <div className="text-foreground text-2xl font-bold">24/7</div>
            <div className="text-muted-foreground text-sm">
              Always Available
            </div>
          </div>
          <div>
            <div className="text-foreground text-2xl font-bold">∞</div>
            <div className="text-muted-foreground text-sm">Tasks Handled</div>
          </div>
          <div>
            <div className="text-foreground text-2xl font-bold">100%</div>
            <div className="text-muted-foreground text-sm">Privacy Focused</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Zap,
  CheckCircle,
  Shield,
  Sparkles,
} from "lucide-react";
import { AnimatedHeroTitle } from "@/components/homepage/animated-hero-title";
import { APP_DESCRIPTION } from "@/lib/config/constants";
import Link from "next/link";

export function Hero() {
  return (
    <section className="bg-background relative flex items-center justify-center overflow-hidden">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(120,119,198,0.03),transparent_50%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-20" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-8 lg:py-24">
        <div className="flex flex-col items-center justify-center gap-12 text-center">
          {/* Center Content */}
          <motion.div
            className="max-w-3xl space-y-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            {/* Status Badge */}
            <motion.div
              className="border-border bg-background/50 inline-flex items-center rounded-full border px-3 py-1 text-sm backdrop-blur-sm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <Sparkles className="text-primary mr-2 h-3 w-3" />
              <span className="text-muted-foreground">AI Agent</span>
            </motion.div>

            {/* Main Heading */}
            <div className="space-y-4">
              <AnimatedHeroTitle />

              <p className="text-muted-foreground mx-auto max-w-2xl text-xl leading-relaxed">
                {APP_DESCRIPTION}
              </p>
            </div>

            {/* Trust Indicators */}
            <div className="flex flex-wrap justify-center gap-6 text-sm">
              <div className="text-muted-foreground flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span>Voice-First Interface</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Private & Secure</span>
              </div>
              <div className="text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span>24/7 AI Assistant</span>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button
                size="lg"
                className="group h-12 px-8 text-base font-medium"
                asChild
              >
                <Link href="/voice">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="group border-border hover:bg-accent h-12 px-8 text-base font-medium"
                asChild
              >
                <Link href="/pricing">See Pricing</Link>
              </Button>
            </div>

            {/* Social Proof */}
            <motion.div
              className="text-muted-foreground flex items-center justify-center gap-4 text-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span className="font-medium">Free Plan Available</span>
              </div>
              <div className="bg-border h-4 w-px" />
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>No Credit Card Required</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

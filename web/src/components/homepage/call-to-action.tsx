"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";

export function CallToAction() {
  return (
    <section className="bg-background relative overflow-hidden py-24">
      {/* Background Elements */}
      <div className="from-primary/5 to-primary/10 absolute inset-0 bg-gradient-to-br via-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]" />

      <div className="relative mx-auto max-w-4xl px-6 lg:px-8">
        <motion.div 
          className="space-y-8 text-center"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
        >
          {/* Icon */}
          <div className="bg-primary/10 mx-auto flex h-16 w-16 items-center justify-center rounded-2xl backdrop-blur-sm">
            <Logo className="text-primary h-10 w-10" variant="icon-only" />
          </div>

          {/* Heading */}
          <div className="space-y-4">
            <h2 className="text-foreground text-4xl font-bold tracking-tight sm:text-5xl">
              Ready for your AI assistant?
            </h2>
            <p className="text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed">
              Get started with our free plan and experience the power of AI assistance
            </p>
          </div>

          {/* Trust Indicators */}
          <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span>Free Plan Available</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-blue-500" />
              <span>No Credit Card Required</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-500" />
              <span>Upgrade Anytime</span>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Button
              size="lg"
              className="group bg-primary hover:bg-primary/90 h-14 px-8 text-lg font-medium shadow-lg transition-all duration-300 hover:shadow-xl"
              asChild
            >
              <Link href="/signup">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="hover:bg-accent/50 h-14 border-2 px-8 text-lg font-medium transition-all duration-300"
              asChild
            >
              <Link href="/pricing">See Pricing</Link>
            </Button>
          </div>

          {/* Bottom Text */}
          {/* <p className="text-sm text-muted-foreground pt-4">
            No setup fees • Cancel anytime • Trusted by 2,500+ developers
          </p> */}
        </motion.div>
      </div>
    </section>
  );
}

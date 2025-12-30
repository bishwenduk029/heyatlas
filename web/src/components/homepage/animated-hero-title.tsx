"use client";

import React from "react";
import { motion } from "framer-motion";

export function AnimatedHeroTitle() {
  return (
    <h1 className="text-foreground text-5xl font-bold tracking-tight sm:text-6xl lg:text-8xl" style={{ fontFamily: 'var(--font-satoshi)' }}>
      <div className="relative inline-flex items-center">
        <img
          src="/logo.svg"
          alt="Logo"
          className="h-14 w-14 mr-4"
        />

        <span style={{ fontFamily: 'var(--font-instrument-serif), serif' }}>
          <motion.span
            className="inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            Hey
          </motion.span>{" "}
          <motion.span
            className="inline-block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span>
              <span className="text-primary font-bold">A</span>tlas
            </span>
          </motion.span>
        </span>
      </div>
    </h1>
  );
}

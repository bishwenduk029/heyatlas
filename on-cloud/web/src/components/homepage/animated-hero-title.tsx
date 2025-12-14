"use client";

import React from "react";
import { motion } from "framer-motion";

export function AnimatedHeroTitle() {
  return (
    <h1 className="text-foreground text-5xl font-bold tracking-tight sm:text-6xl lg:text-8xl" style={{ fontFamily: 'var(--font-satoshi)' }}>
      <div className="relative inline-flex items-center">
        <div className="relative inline-flex items-center justify-center">
          {/* Logo at center of ripples - animates from right */}
          <motion.img
            src="/logo.svg"
            alt="Logo"
            className="z-10 h-14 w-14 mr-4"
            initial={{ x: 500, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{
              duration: 1.5,
              ease: "easeOut",
            }}
          />

          {/* Ripples - Concentric expanding circles */}
          <span className="pointer-events-none absolute left-5 top-1/2 z-0 flex h-20 w-20 -translate-y-1/2 items-center justify-center">
            {[...Array(3)].map((_, waveIndex) => (
              <motion.div
                key={`wave-${waveIndex}`}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: [0, 0.7, 0],
                  scale: [0.5, 10],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: waveIndex * 1, // Stagger by 1 second each
                  ease: "easeOut",
                }}
              >
                {/* White Particles forming perfect circle */}
                {[...Array(16)].map((_, pIndex) => {
                  const angleDeg = (pIndex * 360) / 16; // Full 360 degrees for perfect circle

                  return (
                    <div
                      key={`p-${waveIndex}-${pIndex}`}
                      className="absolute rounded-full bg-black dark:bg-white"
                      style={{
                        width: "2px",
                        height: "2px",
                        transform: `rotate(${angleDeg}deg) translate(20px)`,
                      }}
                    />
                  );
                })}
              </motion.div>
            ))}
          </span>

          {/* Particles - Emitting from H towards right */}
          <span className="pointer-events-none absolute top-1/2 left-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            {[...Array(25)].map((_, i) => {
              return (
                <motion.div
                  key={`particle-${i}`}
                  className="bg-primary/80 absolute h-1 w-1 rounded-full"
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0, 1, 0],
                    scale: [0, 1.5, 0],
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2, // Longer duration for travel
                    repeat: Infinity,
                    delay: Math.random() * 3,
                    ease: "circIn",
                  }}
                />
              );
            })}
          </span>
        </div>

        <span style={{ fontFamily: 'var(--font-instrument-serif), serif' }}>Hey Computer</span>
      </div>
    </h1>
  );
}

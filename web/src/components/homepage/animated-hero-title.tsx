"use client";

import React from "react";
import { motion } from "framer-motion";

export function AnimatedHeroTitle() {
  return (
    <h1 className="text-foreground text-5xl font-bold tracking-tight sm:text-6xl lg:text-8xl" style={{ fontFamily: 'var(--font-satoshi)' }}>
      <div className="relative inline-flex items-center">
        <div className="relative inline-flex items-center justify-center">
          {/* Ripples - Growing Arc Ripples with Larger White Particles */}
          <span className="pointer-events-none absolute top-1/2 left-1/2 z-0 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
            {[...Array(5)].map((_, waveIndex) => (
              <motion.div
                key={`wave-${waveIndex}`}
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 1, scale: 1 }}
                animate={{
                  opacity: [0, 0.9, 0],
                  scale: [1, 4], // Growing ripple as it expands
                  x: [0, 400], // Travel across the text
                }}
                transition={{
                  duration: 4, // Slower to cover distance
                  repeat: Infinity,
                  delay: waveIndex * 0.8,
                  ease: "linear",
                }}
              >
                {/* White Particles forming the arc - spaced more apart */}
                {[...Array(8)].map((_, pIndex) => {
                  const angleDeg = -50 + (pIndex * 100) / 7; // -50 to +50 degrees arc
                  const randomAngle = angleDeg + (Math.random() * 5 - 2.5); // Less randomness

                  return (
                    <div
                      key={`p-${waveIndex}-${pIndex}`}
                      className="absolute rounded-full bg-black dark:bg-white"
                      style={{
                        width: "3px", // Smaller particles
                        height: "3px", // Smaller particles
                        transform: `rotate(${randomAngle}deg) translate(50px)`, // Larger radius arc
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

        <span>Hey Computer</span>
      </div>
    </h1>
  );
}

"use client";

import { motion } from "framer-motion";

export function DiscoLights() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center">
      <div className="relative w-full max-w-3xl h-[600px]">
        {/* Top - Red */}
        <motion.div
          className="absolute top-[10%] left-[20%] w-[300px] h-[300px] rounded-full bg-[#ff6b6b] blur-[90px] opacity-30"
          animate={{
            x: [0, 40, -20, 30, 0],
            y: [0, 30, 40, -20, 0],
            scale: [1, 1.2, 0.9, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Right - Blue */}
        <motion.div
          className="absolute top-[20%] right-[15%] w-[300px] h-[300px] rounded-full bg-[#48dbfb] blur-[90px] opacity-30"
          animate={{
            x: [0, -30, 20, -40, 0],
            y: [0, 40, 20, -30, 0],
            scale: [1, 1.1, 0.95, 1.05, 1],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />

        {/* Bottom - Yellow */}
        <motion.div
          className="absolute bottom-[10%] left-[30%] w-[300px] h-[300px] rounded-full bg-[#feca57] blur-[90px] opacity-30"
          animate={{
            x: [0, -30, 40, -20, 0],
            y: [0, -40, -20, 30, 0],
            scale: [1, 1.1, 0.95, 1.05, 1],
          }}
          transition={{
            duration: 11,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2,
          }}
        />
        
        {/* Center - Blue Accent */}
        <motion.div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#54a0ff] blur-[100px] opacity-20"
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>
    </div>
  );
}

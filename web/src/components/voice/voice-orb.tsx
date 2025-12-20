"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface VoiceOrbProps {
  state: "listening" | "thinking" | "speaking" | "idle";
}

export function VoiceOrb({ state }: VoiceOrbProps) {
  const isActive = state !== "idle";
  
  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Outer Glow */}
      <motion.div
        animate={{
          scale: state === "speaking" ? [1, 1.1, 1] : 1,
          opacity: isActive ? [0.3, 0.5, 0.3] : 0.1,
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className={cn(
          "absolute inset-0 rounded-full blur-3xl",
          state === "listening" ? "bg-green-500" :
          state === "speaking" ? "bg-blue-500" :
          state === "thinking" ? "bg-purple-500" : "bg-primary/20"
        )}
      />

      {/* Main Orb */}
      <motion.div
        animate={{
          scale: state === "speaking" ? [1, 1.05, 1] : 
                 state === "listening" ? [1, 1.02, 1] : 1,
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="relative w-48 h-48 rounded-full overflow-hidden shadow-2xl border border-white/10"
      >
        {/* Gradient Background */}
        <div className={cn(
          "absolute inset-0 bg-gradient-to-br transition-colors duration-500",
          state === "listening" ? "from-green-600 to-emerald-900" :
          state === "speaking" ? "from-blue-600 to-indigo-900" :
          state === "thinking" ? "from-purple-600 to-fuchsia-900" :
          "from-zinc-800 to-black"
        )} />

        {/* Animated Swirls/Particles (Simplified) */}
        <motion.div
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute inset-0 opacity-50"
        >
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-from)_0%,_transparent_70%)] from-white/20" />
        </motion.div>

        {/* Inner Core */}
        <div className="absolute inset-4 rounded-full bg-black/20 backdrop-blur-sm border border-white/5 flex items-center justify-center">
           <motion.div 
             animate={{
               scale: state === "speaking" ? [1, 1.2, 1] : 1,
               opacity: state === "speaking" ? [0.8, 1, 0.8] : 0.5,
             }}
             transition={{
               duration: 0.2,
               repeat: Infinity,
             }}
             className={cn(
               "w-12 h-12 rounded-full blur-md",
               state === "listening" ? "bg-green-400" :
               state === "speaking" ? "bg-blue-400" :
               state === "thinking" ? "bg-purple-400" : "bg-white/20"
             )}
           />
        </div>
      </motion.div>

      {/* Wave Rings */}
      {state === "speaking" && (
        <>
          <WaveRing delay={0} color="border-blue-500/30" />
          <WaveRing delay={0.5} color="border-blue-400/20" />
        </>
      )}
      {state === "listening" && (
        <>
          <WaveRing delay={0} color="border-green-500/30" />
          <WaveRing delay={0.5} color="border-green-400/20" />
        </>
      )}
    </div>
  );
}

function WaveRing({ delay, color }: { delay: number; color: string }) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0.5 }}
      animate={{ scale: 1.5, opacity: 0 }}
      transition={{
        duration: 2,
        repeat: Infinity,
        delay,
        ease: "easeOut",
      }}
      className={cn("absolute w-48 h-48 rounded-full border-2", color)}
    />
  );
}

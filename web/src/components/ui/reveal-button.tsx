"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const BUTTON_MOTION_CONFIG = {
  initial: "rest",
  whileHover: "hover",
  whileTap: "tap",
  variants: {
    rest: { maxWidth: "40px" },
    hover: {
      maxWidth: "140px",
      transition: { type: "spring", stiffness: 200, damping: 35, delay: 0.15 },
    },
    tap: { scale: 0.95 },
  },
  transition: { type: "spring", stiffness: 250, damping: 25 },
} as const;

const MOBILE_MOTION_CONFIG = {
  initial: "rest",
  whileTap: "tap",
  variants: {
    rest: { maxWidth: "40px" },
    tap: { scale: 0.95 },
  },
  transition: { type: "spring", stiffness: 250, damping: 25 },
} as const;

const LABEL_VARIANTS = {
  rest: { opacity: 0, x: 4 },
  hover: { opacity: 1, x: 0 },
  tap: { opacity: 1, x: 0 },
};

const LABEL_TRANSITION = {
  type: "spring" as const,
  stiffness: 200,
  damping: 25,
};

interface RevealButtonProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
}

export function RevealButton({
  icon,
  label,
  onClick,
  className,
  "aria-label": ariaLabel,
  disabled,
}: RevealButtonProps) {
  const isMobile = useIsMobile();

  return (
    <motion.button
      {...(isMobile ? MOBILE_MOTION_CONFIG : BUTTON_MOTION_CONFIG)}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-10 cursor-pointer items-center space-x-2 overflow-hidden rounded-full px-2.5 py-2 whitespace-nowrap transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
      aria-label={ariaLabel || label}
    >
      <div className="shrink-0">{icon}</div>
      {!isMobile && (
        <motion.span
          variants={LABEL_VARIANTS}
          transition={LABEL_TRANSITION}
          className="pr-1 text-sm font-medium"
        >
          {label}
        </motion.span>
      )}
    </motion.button>
  );
}

import { cn } from "@/lib/utils";
import Image from "next/image";
import React from "react";

type LogoVariant = "default" | "minimal" | "icon-only";

interface LogoProps {
  className?: string;
  variant?: LogoVariant;
  iconClassName?: string;
}

export function Logo({
  className,
  variant = "default",
  iconClassName,
}: LogoProps) {
  const baseClasses = "flex items-center justify-center";

  const variantClasses = {
    default: "h-full w-full rounded-lg bg-primary p-2.5",
    minimal: "h-full w-full rounded-md bg-primary/10 p-2",
    "icon-only": "h-full w-full",
  };

  const iconClasses = {
    default: "h-full w-full text-white",
    minimal: "h-full w-full text-primary",
    "icon-only": "h-full w-full text-current",
  };

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)}>
      <div className={cn(iconClasses[variant], iconClassName, "relative")}>
        <Image
          src="/logo.svg"
          alt="HeyAtlas"
          fill
          className="object-contain"
          priority
        />
      </div>
    </div>
  );
}

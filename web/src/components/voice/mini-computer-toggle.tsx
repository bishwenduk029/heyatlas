"use client";

import { useState } from "react";
import { Monitor, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MiniComputerToggleProps {
  isActive?: boolean;
  isConnecting?: boolean;
  onToggle?: (enabled: boolean) => Promise<void>;
  disabled?: boolean;
}

export function MiniComputerToggle({
  isActive = false,
  isConnecting = false,
  onToggle,
  disabled = false,
}: MiniComputerToggleProps) {
  const [loading, setLoading] = useState(false);

  const handleToggle = async (checked: boolean) => {
    if (!onToggle || loading) return;
    setLoading(true);
    try {
      await onToggle(checked);
    } finally {
      setLoading(false);
    }
  };

  const showLoading = loading || isConnecting;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors",
            isActive
              ? "bg-emerald-500/10 border border-emerald-500/30"
              : "bg-secondary/50 border border-transparent",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          {/* Computer Icon */}
          <div className="relative">
            {showLoading ? (
              <Loader2
                className={cn(
                  "h-4 w-4 animate-spin",
                  isActive ? "text-emerald-500" : "text-muted-foreground",
                )}
              />
            ) : (
              <Monitor
                className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-emerald-500" : "text-muted-foreground",
                )}
              />
            )}
            {/* Active indicator dot */}
            {isActive && !showLoading && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>

          {/* Toggle Switch */}
          <Switch
            checked={isActive}
            onCheckedChange={handleToggle}
            disabled={disabled || showLoading}
            className={cn(
              "data-[state=checked]:bg-emerald-500",
              "h-5 w-9",
            )}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">
          {isActive ? "Mini Computer Active" : "Enable Mini Computer"}
        </p>
        {isActive && (
          <p className="text-muted-foreground text-[10px]">
            Cloud sandbox with browser & tools
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

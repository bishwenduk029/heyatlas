"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Mic } from "lucide-react";

interface WelcomeProps {
  disabled: boolean;
  onStartCall: () => void;
}

export const Welcome = ({
  disabled,
  onStartCall,
  ref,
}: React.ComponentProps<"div"> & WelcomeProps) => {
  return (
    <section
      ref={ref}
      // @ts-expect-error - inert is a valid HTML attribute but TypeScript doesn't recognize it yet
      inert={disabled ? "" : undefined}
      className={cn(
        "bg-background fixed inset-0 mx-auto flex h-svh flex-col items-center justify-center gap-6 text-center px-4",
        disabled ? "z-10" : "z-20"
      )}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary shadow-lg">
          <Mic className="h-12 w-12 text-primary-foreground" />
        </div>

        <h1 className="text-foreground text-4xl font-bold">
          Talk to Nirmanus
        </h1>
        <p className="text-muted-foreground max-w-md text-lg">
          Your AI-powered voice assistant is ready. Just speak naturally and
          let Nirmanus handle the rest.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={onStartCall}
          className="hover:bg-accent/50 font-semibold px-8 py-6 text-lg"
        >
          <Mic className="mr-2 h-5 w-5" />
          Start Voice Session
        </Button>

        {/* Preview button hidden for now */}
        {/* <Button
          variant="secondary"
          size="sm"
          onClick={onStartCall}
          className="text-xs"
          disabled
        >
          Preview UI (Testing Mode)
        </Button> */}
      </div>

      <footer className="text-muted-foreground fixed bottom-8 left-0 right-0 flex w-full items-center justify-center">
        <p className="max-w-prose text-sm">
          Your conversations are private and secure. Nirmanus remembers context
          across sessions.
        </p>
      </footer>
    </section>
  );
};

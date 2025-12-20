"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatWelcomeProps {
  onAction: (text: string) => void;
}

export function ChatWelcome({ onAction }: ChatWelcomeProps) {
  const suggestions = [
    "What are the advantages of using Next.js?",
    "Write code to demonstrate Dijkstra's algorithm",
    "Help me write an essay about Silicon Valley",
    "What is the weather in San Francisco?",
  ];

  return (
    <div className="flex flex-col gap-8 max-w-3xl mx-auto w-full py-12 px-4 items-center text-center mt-20">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">
          Hello there!
        </h1>
        <h2 className="text-2xl font-medium text-muted-foreground">
          How can I help you today?
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mt-8">
        {suggestions.map((suggestion, i) => (
          <Button
            key={i}
            variant="outline"
            className="h-auto py-4 px-6 justify-start text-left whitespace-normal rounded-2xl border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-colors"
            onClick={() => onAction(suggestion)}
          >
            <span className="text-sm font-medium line-clamp-2">{suggestion}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

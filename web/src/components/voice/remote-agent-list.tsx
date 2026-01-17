import * as React from "react";
import { Check, Cloud, Key, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { REMOTE_AGENTS, type RemoteAgent } from "@/lib/cloudflare-sandbox";

interface RemoteAgentListProps {
  onSelect: (agent: RemoteAgent) => void;
  selectedAgentId?: string;
  activeAgentId?: string | null;
  connectingAgentId?: string | null;
  isConnecting?: boolean;
}

export function RemoteAgentList({
  onSelect,
  selectedAgentId,
  activeAgentId,
  connectingAgentId,
  isConnecting,
}: RemoteAgentListProps) {
  return (
    <Command>
      <CommandList>
        <CommandGroup heading="Coding Agents">
          {REMOTE_AGENTS.map((agent) => {
            const isThisAgentActive = activeAgentId === agent.id;
            const isThisAgentConnecting = connectingAgentId === agent.id;
            const requiresApiKey = agent.apiKey?.required ?? false;
            const isComingSoon = agent.comingSoon ?? false;

            return (
              <CommandItem
                key={agent.id}
                value={agent.id}
                onSelect={() => {
                  if (isComingSoon || isConnecting || isThisAgentConnecting)
                    return;
                  onSelect(agent);
                }}
                disabled={isComingSoon || isConnecting || isThisAgentConnecting}
                className={cn(
                  "relative",
                  isThisAgentActive && "bg-accent",
                  (isComingSoon || isThisAgentConnecting) &&
                    "cursor-not-allowed opacity-50",
                )}
              >
                {isThisAgentConnecting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <agent.icon className="mr-2 h-4 w-4" />
                )}
                <div className="flex flex-1 flex-col">
                  <span>{agent.name}</span>
                  {agent.description && (
                    <span className="text-muted-foreground text-[10px] leading-tight">
                      {agent.description}
                    </span>
                  )}
                </div>
                {isThisAgentActive && !isThisAgentConnecting && (
                  <Check className="ml-2 h-4 w-4 shrink-0 text-green-500" />
                )}
                {isThisAgentConnecting && (
                  <span className="ml-2 text-xs text-amber-500">
                    Connecting...
                  </span>
                )}
                {isComingSoon && (
                  <span className="text-muted-foreground ml-2 text-xs">
                    Coming soon
                  </span>
                )}
                {!isComingSoon &&
                  !isThisAgentConnecting &&
                  !isThisAgentActive &&
                  requiresApiKey && (
                    <span title="Requires API key">
                      <Key className="text-muted-foreground ml-2 h-3 w-3" />
                    </span>
                  )}
                {!isComingSoon &&
                  !isThisAgentConnecting &&
                  !isThisAgentActive &&
                  !requiresApiKey && (
                    <Cloud className="text-muted-foreground ml-2 h-3 w-3" />
                  )}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

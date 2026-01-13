"use client";

import * as React from "react";
import {
  Check,
  ChevronDown,
  Cloud,
  Computer,
  Key,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { REMOTE_AGENTS, type RemoteAgent } from "@/lib/cloudflare-sandbox";
import { AgentApiKeyModal } from "./agent-api-key-modal";

interface AgentSelectorProps {
  selectedAgent: { type: "cloud"; agentId: string } | null;
  activeAgent?: string | null; // The actually connected agent (sandbox running)
  onConnectCloudAgent?: (
    agentId: string,
    apiKey?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onDisconnectAgent?: () => Promise<{ success: boolean; error?: string }>;
  disabled?: boolean;
}

export function AgentSelector({
  selectedAgent,
  activeAgent,
  onConnectCloudAgent,
  onDisconnectAgent,
  disabled = false,
}: AgentSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const [apiKeyModalOpen, setApiKeyModalOpen] = React.useState(false);
  const [pendingAgent, setPendingAgent] = React.useState<RemoteAgent | null>(
    null,
  );
  const [apiKeyError, setApiKeyError] = React.useState<string | null>(null);
  const [isSubmittingApiKey, setIsSubmittingApiKey] = React.useState(false);
  const [connectingAgentId, setConnectingAgentId] = React.useState<
    string | null
  >(null);
  const [isDisconnecting, setIsDisconnecting] = React.useState(false);

  const selectedValue = selectedAgent?.agentId ?? "";

  const selectedAgentInfo = selectedAgent
    ? REMOTE_AGENTS.find((a) => a.id === selectedAgent.agentId)
    : null;

  // Agent is "connecting" if we have a selectedAgent but no activeAgent yet (sandbox starting)
  // OR if we're in the process of calling connectCloudAgent
  const isConnecting =
    connectingAgentId !== null ||
    (selectedAgent !== null && activeAgent !== selectedAgent.agentId);

  // Agent is fully connected when activeAgent matches selectedAgent
  const isConnected =
    activeAgent !== null && selectedAgent?.agentId === activeAgent;

  // Reset connecting state when agent becomes active
  React.useEffect(() => {
    if (activeAgent && connectingAgentId === activeAgent) {
      setConnectingAgentId(null);
    }
  }, [activeAgent, connectingAgentId]);

  const handleAgentSelect = async (agent: RemoteAgent) => {
    // Check if agent requires API key
    if (agent.apiKey?.required) {
      setPendingAgent(agent);
      setApiKeyModalOpen(true);
      setOpen(false);
      return;
    }

    // No API key required - connect to cloud agent
    if (onConnectCloudAgent) {
      setOpen(false);
      setConnectingAgentId(agent.id);
      try {
        const result = await onConnectCloudAgent(agent.id);
        if (!result.success) {
          console.error("Failed to connect cloud agent:", result.error);
        }
      } finally {
        setConnectingAgentId(null);
      }
    }
  };

  const handleDisconnect = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Don't open dropdown
    if (!onDisconnectAgent || isDisconnecting) return;

    setIsDisconnecting(true);
    try {
      const result = await onDisconnectAgent();
      if (!result.success) {
        console.error("Failed to disconnect agent:", result.error);
      }
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleApiKeySubmit = async (apiKey: string) => {
    if (!pendingAgent || !onConnectCloudAgent) return;

    setApiKeyError(null);
    setIsSubmittingApiKey(true);
    setConnectingAgentId(pendingAgent.id);

    try {
      const result = await onConnectCloudAgent(pendingAgent.id, apiKey);
      if (result.success) {
        setApiKeyModalOpen(false);
        setPendingAgent(null);
      } else {
        setApiKeyError(result.error ?? "Failed to connect agent");
      }
    } catch (error) {
      setApiKeyError(
        error instanceof Error ? error.message : "Failed to connect agent",
      );
    } finally {
      setConnectingAgentId(null);
      setIsSubmittingApiKey(false);
    }
  };

  const handleApiKeyModalClose = (open: boolean) => {
    if (!open) {
      setPendingAgent(null);
      setApiKeyError(null);
    }
    setApiKeyModalOpen(open);
  };

  // Get the agent being connected (for display)
  const connectingAgent = connectingAgentId
    ? REMOTE_AGENTS.find((a) => a.id === connectingAgentId)
    : selectedAgent && !isConnected
      ? REMOTE_AGENTS.find((a) => a.id === selectedAgent.agentId)
      : null;

  const triggerButton = (
    <Button
      variant={isMobile ? "ghost" : "outline"}
      role="combobox"
      aria-expanded={open}
      disabled={disabled || isConnecting || isDisconnecting}
      className={cn(
        isMobile
          ? "bg-secondary/50 text-secondary-foreground hover:bg-primary/10 hover:text-primary h-10 w-10 rounded-full p-0"
          : "h-9 max-w-[180px] min-w-[120px] justify-between gap-1.5 px-2 sm:max-w-none sm:min-w-[160px] sm:gap-2 sm:px-3",
        isConnected &&
          !isDisconnecting &&
          (isMobile
            ? "bg-green-500/20 text-green-600 hover:bg-green-500/30"
            : "border-green-500/50 bg-green-500/10"),
        (isConnecting || isDisconnecting) &&
          (isMobile
            ? "bg-amber-500/20 text-amber-600"
            : "border-amber-500/50 bg-amber-500/10"),
      )}
    >
      {isConnecting ? (
        <>
          <Loader2 className={cn("shrink-0 animate-spin", isMobile ? "h-5 w-5" : "h-4 w-4")} />
          {!isMobile && (
            <span className="truncate text-sm">
              {connectingAgent?.name || "Connecting..."}...
            </span>
          )}
        </>
      ) : isDisconnecting ? (
        <>
          <Loader2 className={cn("shrink-0 animate-spin", isMobile ? "h-5 w-5" : "h-4 w-4")} />
          {!isMobile && (
            <span className="truncate text-sm">Disconnecting...</span>
          )}
        </>
      ) : isConnected && selectedAgentInfo ? (
        <>
          <selectedAgentInfo.icon className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")} />
          {!isMobile && (
            <>
              <span className="truncate text-sm">{selectedAgentInfo.name}</span>
              <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            </>
          )}
        </>
      ) : (
        <>
          <Computer className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")} />
          {!isMobile && (
            <span className="text-muted-foreground truncate text-sm">
              Select agent
            </span>
          )}
        </>
      )}
      {!isMobile && (
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 opacity-50",
            (isConnecting || isDisconnecting) && "animate-pulse",
          )}
        />
      )}
    </Button>
  );

  const agentList = (
    <Command>
      <CommandList>
        <CommandGroup heading="Cloud Agents">
          {REMOTE_AGENTS.map((agent) => {
            const isThisAgentActive = agent.id === activeAgent;
            const isComingSoon = agent.comingSoon;
            const isThisAgentConnecting =
              connectingAgentId === agent.id ||
              (selectedAgent?.agentId === agent.id && !isConnected);
            const requiresApiKey = agent.apiKey?.required;

            return (
              <CommandItem
                key={agent.id}
                value={agent.id}
                onSelect={() => {
                  if (isComingSoon || isConnecting || isThisAgentConnecting)
                    return;
                  handleAgentSelect(agent);
                }}
                disabled={
                  isComingSoon || isConnecting || isThisAgentConnecting
                }
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

  return (
    <>
      <div className="flex items-center gap-1">
        {isConnected && !isDisconnecting && onDisconnectAgent && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 shrink-0 sm:h-9 sm:w-9"
            onClick={handleDisconnect}
            title="Disconnect agent"
          >
            <X className="h-4 w-4" />
          </Button>
        )}

        {isMobile ? (
          <Drawer open={open} onOpenChange={setOpen}>
            <DrawerTrigger asChild>{triggerButton}</DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Select Agent</DrawerTitle>
              </DrawerHeader>
              <div className="px-4 pb-4">{agentList}</div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            <PopoverContent className="w-[260px] p-0 sm:w-[280px]" align="start">
              {agentList}
            </PopoverContent>
          </Popover>
        )}
      </div>

      {pendingAgent?.apiKey && (
        <AgentApiKeyModal
          open={apiKeyModalOpen}
          onOpenChange={handleApiKeyModalClose}
          agentName={pendingAgent.name}
          apiKeyConfig={pendingAgent.apiKey}
          onSubmit={handleApiKeySubmit}
          isLoading={isSubmittingApiKey}
          error={apiKeyError}
        />
      )}
    </>
  );
}

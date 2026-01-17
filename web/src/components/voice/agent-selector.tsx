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
import { useRemoteAgent } from "./hooks/use-remote-agent";
import { RemoteAgentList } from "./remote-agent-list";

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

  const {
    apiKeyModalOpen,
    pendingAgent,
    apiKeyError,
    isSubmittingApiKey,
    connectingAgentId,
    isDisconnecting,
    isConnecting,
    isConnected,
    handleAgentSelect,
    handleApiKeySubmit,
    handleDisconnect,
    handleApiKeyModalClose,
  } = useRemoteAgent({
    selectedAgent,
    activeAgent,
    onConnectCloudAgent,
    onDisconnectAgent,
  });

  const selectedAgentInfo = selectedAgent
    ? REMOTE_AGENTS.find((a) => a.id === selectedAgent.agentId)
    : null;

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
          <Loader2
            className={cn(
              "shrink-0 animate-spin",
              isMobile ? "h-5 w-5" : "h-4 w-4",
            )}
          />
          {!isMobile && (
            <span className="truncate text-sm">
              {connectingAgent?.name || "Connecting..."}...
            </span>
          )}
        </>
      ) : isDisconnecting ? (
        <>
          <Loader2
            className={cn(
              "shrink-0 animate-spin",
              isMobile ? "h-5 w-5" : "h-4 w-4",
            )}
          />
          {!isMobile && (
            <span className="truncate text-sm">Disconnecting...</span>
          )}
        </>
      ) : isConnected && selectedAgentInfo ? (
        <>
          <selectedAgentInfo.icon
            className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")}
          />
          {!isMobile && (
            <>
              <span className="truncate text-sm">{selectedAgentInfo.name}</span>
              <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
            </>
          )}
        </>
      ) : (
        <>
          <Computer
            className={cn("shrink-0", isMobile ? "h-5 w-5" : "h-4 w-4")}
          />
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
              <div className="px-4 pb-4">
                <RemoteAgentList
                  onSelect={(agent) => {
                    handleAgentSelect(agent);
                    setOpen(false);
                  }}
                  selectedAgentId={selectedAgent?.agentId}
                  activeAgentId={activeAgent}
                  connectingAgentId={connectingAgentId}
                  isConnecting={isConnecting}
                />
              </div>
            </DrawerContent>
          </Drawer>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            <PopoverContent
              className="w-[260px] p-0 sm:w-[280px]"
              align="start"
            >
              <RemoteAgentList
                onSelect={(agent) => {
                  handleAgentSelect(agent);
                  setOpen(false);
                }}
                selectedAgentId={selectedAgent?.agentId}
                activeAgentId={activeAgent}
                connectingAgentId={connectingAgentId}
                isConnecting={isConnecting}
              />
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
          onSubmit={async (key) => {
            await handleApiKeySubmit(pendingAgent.id, key);
          }}
          isLoading={isSubmittingApiKey}
          error={apiKeyError}
        />
      )}
    </>
  );
}

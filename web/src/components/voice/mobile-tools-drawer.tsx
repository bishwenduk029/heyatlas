"use client";

import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { MiniComputerToggle } from "./mini-computer-toggle";
import { RemoteAgentList } from "./remote-agent-list";
import { useRemoteAgent } from "./hooks/use-remote-agent";
import { AgentApiKeyModal } from "./agent-api-key-modal";

interface MobileToolsDrawerProps {
  // Agent props
  selectedAgent: { type: "cloud"; agentId: string } | null;
  activeAgent?: string | null;
  onConnectCloudAgent?: (
    agentId: string,
    apiKey?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onDisconnectAgent?: () => Promise<{ success: boolean; error?: string }>;

  // Mini Computer props
  isMiniComputerActive?: boolean;
  isMiniComputerConnecting?: boolean;
  onToggleMiniComputer?: (enabled: boolean) => Promise<void>;

  disabled?: boolean;
}

export function MobileToolsDrawer({
  selectedAgent,
  activeAgent,
  onConnectCloudAgent,
  onDisconnectAgent,
  isMiniComputerActive,
  isMiniComputerConnecting,
  onToggleMiniComputer,
  disabled,
}: MobileToolsDrawerProps) {
  const [open, setOpen] = useState(false);

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
    activeAgent,
    selectedAgent,
    onConnectCloudAgent,
    onDisconnectAgent,
  });

  return (
    <>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="bg-background h-12 w-12 rounded-full border-2 shadow-sm"
            disabled={disabled}
          >
            <Settings2 className="h-6 w-6" />
          </Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Tools</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-6 px-4 pb-8">
            {onToggleMiniComputer && (
              <div className="flex flex-col gap-2">
                <span className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
                  Mini Computer
                </span>
                <div className="bg-secondary/20 border-border/50 flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">Cloud Sandbox</span>
                  <MiniComputerToggle
                    isActive={isMiniComputerActive}
                    isConnecting={isMiniComputerConnecting}
                    onToggle={onToggleMiniComputer}
                    disabled={disabled}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm font-medium tracking-wider uppercase">
                  Coding Agents
                </span>
                {isConnected && !isDisconnecting && onDisconnectAgent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive h-auto p-0 hover:bg-transparent hover:underline"
                    onClick={handleDisconnect}
                  >
                    Disconnect Current
                  </Button>
                )}
              </div>

              <div className="border-border/50 overflow-hidden rounded-lg border">
                <RemoteAgentList
                  onSelect={(agent) => {
                    handleAgentSelect(agent);
                    // Don't close drawer immediately to show connecting state
                  }}
                  selectedAgentId={selectedAgent?.agentId}
                  activeAgentId={activeAgent}
                  connectingAgentId={connectingAgentId}
                  isConnecting={isConnecting}
                />
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {pendingAgent?.apiKey && (
        <AgentApiKeyModal
          open={apiKeyModalOpen}
          onOpenChange={handleApiKeyModalClose}
          agentName={pendingAgent.name}
          apiKeyConfig={pendingAgent.apiKey}
          onSubmit={async (key) => {
            await handleApiKeySubmit(pendingAgent.id, key);
            // After successful submit (modal closes), we might want to close the drawer too?
            // Or keep it open to show "Connecting..." status in list.
          }}
          isLoading={isSubmittingApiKey}
          error={apiKeyError}
        />
      )}
    </>
  );
}

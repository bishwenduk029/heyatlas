import { useState, useEffect } from "react";
import { RemoteAgent } from "@/lib/cloudflare-sandbox";

interface UseRemoteAgentProps {
  activeAgent?: string | null;
  selectedAgent: { type: "cloud"; agentId: string } | null;
  onConnectCloudAgent?: (
    agentId: string,
    apiKey?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onDisconnectAgent?: () => Promise<{ success: boolean; error?: string }>;
}

export function useRemoteAgent({
  activeAgent,
  selectedAgent,
  onConnectCloudAgent,
  onDisconnectAgent,
}: UseRemoteAgentProps) {
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [pendingAgent, setPendingAgent] = useState<RemoteAgent | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isSubmittingApiKey, setIsSubmittingApiKey] = useState(false);
  const [connectingAgentId, setConnectingAgentId] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // Agent is "connecting" if we have a selectedAgent but no activeAgent yet (sandbox starting)
  // OR if we're in the process of calling connectCloudAgent
  const isConnecting =
    connectingAgentId !== null ||
    (selectedAgent !== null && activeAgent !== selectedAgent.agentId);

  // Agent is fully connected when activeAgent matches selectedAgent
  const isConnected =
    activeAgent !== null && selectedAgent?.agentId === activeAgent;

  // Reset connecting state when agent becomes active
  useEffect(() => {
    if (activeAgent && connectingAgentId === activeAgent) {
      setConnectingAgentId(null);
    }
  }, [activeAgent, connectingAgentId]);

  const handleAgentSelect = async (agent: RemoteAgent) => {
    // Check if agent requires API key
    if (agent.apiKey?.required) {
      setPendingAgent(agent);
      setApiKeyModalOpen(true);
      return;
    }

    // No API key required - connect to cloud agent
    await connectToAgent(agent.id);
  };

  const connectToAgent = async (agentId: string, apiKey?: string) => {
    if (!onConnectCloudAgent) return;

    setConnectingAgentId(agentId);
    
    // Optimistic: Close any open UI (handled by caller usually, but we manage state here)
    // In this hook we just manage the logic, UI open/close is caller's responsibility

    const result = await onConnectCloudAgent(agentId, apiKey);

    if (!result.success) {
      setConnectingAgentId(null);
      if (apiKey) {
        setApiKeyError(result.error || "Failed to connect with provided API key");
      }
    }
  };

  const handleApiKeySubmit = async (apiKey: string) => {
    if (!pendingAgent) return;

    setIsSubmittingApiKey(true);
    setApiKeyError(null);

    try {
      await connectToAgent(pendingAgent.id, apiKey);
      // If successful (or at least started), close modal
      // Note: We might want to keep modal open on error, but connectToAgent logic above 
      // sets error state. 
      // If we are here, we initiated connection.
      
      // We rely on the result checking in connectToAgent? No, wait.
      // connectToAgent is async.
      
      // Let's look at original code logic.
      // It sets "isSubmittingApiKey(true)" then calls onConnectCloudAgent.
      // If success -> close modal. If fail -> set error.
    } catch (err) {
      console.error(err);
      setApiKeyError("An unexpected error occurred");
    } finally {
      setIsSubmittingApiKey(false);
    }
  };
  
  // Re-implementing connectToAgent to better match original flow regarding modal
  const connectWithKey = async (agentId: string, apiKey: string) => {
      if (!onConnectCloudAgent) return;
      
      setConnectingAgentId(agentId);
      setIsSubmittingApiKey(true);
      setApiKeyError(null);
      
      const result = await onConnectCloudAgent(agentId, apiKey);
      
      setIsSubmittingApiKey(false);
      
      if (result.success) {
          setApiKeyModalOpen(false);
          setPendingAgent(null);
      } else {
          setConnectingAgentId(null);
          setApiKeyError(result.error || "Failed to connect");
      }
  };

  const handleDisconnect = async () => {
    if (!onDisconnectAgent) return;
    setIsDisconnecting(true);
    try {
      await onDisconnectAgent();
    } finally {
      setIsDisconnecting(false);
    }
  };
  
  const handleApiKeyModalClose = (open: boolean) => {
      setApiKeyModalOpen(open);
      if (!open) {
          setPendingAgent(null);
          setApiKeyError(null);
      }
  };

  return {
    apiKeyModalOpen,
    pendingAgent,
    apiKeyError,
    isSubmittingApiKey,
    connectingAgentId,
    isDisconnecting,
    isConnecting,
    isConnected,
    handleAgentSelect,
    handleApiKeySubmit: connectWithKey,
    handleDisconnect,
    handleApiKeyModalClose,
    setApiKeyModalOpen,
  };
}

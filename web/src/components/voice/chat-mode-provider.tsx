"use client";

import { useCallback } from "react";
import { useAtlasAgent } from "./hooks/use-atlas-agent";
import { SessionLayout } from "./session-layout";
import type { FileUIPart } from "ai";

interface ChatModeProviderProps {
  userId: string;
  token: string;
  mode: "local" | "sandbox";
  onToggleMode: () => void;
}

export function ChatModeProvider({ userId, token, mode, onToggleMode }: ChatModeProviderProps) {
  const atlasAgent = useAtlasAgent({
    userId,
    token,
  });

  const handleSendMessage = useCallback(
    async (text: string, files?: FileUIPart[]) => {
      if (!atlasAgent.isConnected) return;
      await atlasAgent.sendMessage(text, files);
    },
    [atlasAgent]
  );

  return (
    <SessionLayout
      mode={mode}
      isChatMode={true}
      voiceSessionStarted={false}
      onStartVoiceSession={() => {}}
      onToggleMode={onToggleMode}
      onDisconnectVoice={() => {}}
      vncUrl={atlasAgent.vncUrl}
      logUrl={atlasAgent.logsUrl}
      userId={userId}
      messages={atlasAgent.messages}
      onSendMessage={handleSendMessage}
      onStopChat={atlasAgent.stop}
      isChatLoading={atlasAgent.isLoading}
      isChatConnected={atlasAgent.isConnected}
      tasks={atlasAgent.tasks}
      getTaskUIMessage={atlasAgent.getTaskUIMessage}
      activeAgent={atlasAgent.activeAgent}
      compressing={atlasAgent.compressing}
      selectedAgent={atlasAgent.selectedAgent}
      onDisconnectAgent={atlasAgent.disconnectAgent}
      onConnectCloudAgent={atlasAgent.connectCloudAgent}
      isMiniComputerActive={atlasAgent.isMiniComputerActive}
      isMiniComputerConnecting={atlasAgent.isMiniComputerConnecting}
      onToggleMiniComputer={atlasAgent.toggleMiniComputer}
    />
  );
}

"use client";

import * as React from "react";
import { Key, ExternalLink, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentApiKeyConfig } from "@/lib/cloudflare-sandbox";

interface AgentApiKeyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentName: string;
  apiKeyConfig: AgentApiKeyConfig;
  onSubmit: (apiKey: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export function AgentApiKeyModal({
  open,
  onOpenChange,
  agentName,
  apiKeyConfig,
  onSubmit,
  isLoading = false,
  error = null,
}: AgentApiKeyModalProps) {
  const [apiKey, setApiKey] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey.trim()) {
      onSubmit(apiKey.trim());
    }
  };

  const handleClose = () => {
    setApiKey("");
    setShowKey(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="text-primary h-5 w-5" />
            Connect {agentName}
          </DialogTitle>
          <DialogDescription className="text-left">
            {agentName} requires your API key to run in a cloud sandbox.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">{apiKeyConfig.displayName}</Label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                placeholder={`Enter your ${apiKeyConfig.displayName}`}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pr-20"
                autoComplete="off"
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute top-1/2 right-1 h-7 -translate-y-1/2 px-2 text-xs"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? "Hide" : "Show"}
              </Button>
            </div>
            {apiKeyConfig.helpUrl && (
              <a
                href={apiKeyConfig.helpUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-xs"
              >
                Get your API key
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          {/* Security notice */}
          <div className="bg-muted/50 flex items-start gap-3 rounded-lg p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
            <div className="space-y-1">
              <p className="text-foreground font-medium">Your key is secure</p>
              <p className="text-muted-foreground text-xs">
                We only use your API key to start ephemeral cloud sandboxes.
                Your key is never stored on our servers and is only kept in
                memory for the duration of your session.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!apiKey.trim() || isLoading}>
              {isLoading ? "Connecting..." : "Connect Agent"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

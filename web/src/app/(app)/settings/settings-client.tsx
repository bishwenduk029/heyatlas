"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { saveAgentConfig, getAgentConfig } from "@/actions/agent-config";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/homepage/header";

const DEFAULT_CONFIG = {
  "mcp": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user"]
    },
    "coding-toolkit": {
        "command": "uvx",
        "args": ["--from", "cased-kit", "kit-dev-mcp"]
    },
    "web-browser-automation": {
        "command": "npx",
        "args": ["@playwright/mcp@latest"]
    },
    "task-manager": {
        "command": "node",
        "args": ["/home/user/mcp-shrimp-task-manager/dist/index.js"],
        "env": {
            "DATA_DIR": "/home/user/mcp-shrimp-task-manager/shrimp_data",
            "ENABLE_GUI": "false",
            "TEMPLATES_USE": "en"
        }
    }
  }
};

export default function SettingsClient() {
  const [config, setConfig] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const savedConfig = await getAgentConfig("universal");
        if (savedConfig) {
          setConfig(savedConfig);
        } else {
            // Set default if empty
          setConfig(JSON.stringify(DEFAULT_CONFIG, null, 4));
        }
      } catch (e) {
        console.error("Failed to load configs", e);
        toast.error("Failed to load configurations");
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleSave = async () => {
    try {
        setSaving(true);
        // Validate JSON
        JSON.parse(config);

        await saveAgentConfig("universal", config);
        toast.success("Unified MCP configuration saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save: Invalid JSON format");
    } finally {
        setSaving(false);
    }
  };

  if (loading) return <div className="p-8">Loading settings...</div>;

  return (
    <>
      <Header />
      <div className="p-8 max-w-4xl mx-auto space-y-8">
        {/* Removed Dashboard literal as requested */}

        <section>
          <h2 className="text-2xl font-semibold mb-4">Computer Agent MCP</h2>
          <Card>
              <CardHeader>
              <CardTitle>Unified MCP Configuration</CardTitle>
              <CardDescription>
                  Configure your Model Context Protocol (MCP) servers.
                  This configuration will be automatically adapted for both Goose and OpenCode agents.
              </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
              <Textarea
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                  className="font-mono h-[500px]"
                  placeholder="Enter JSON configuration..."
              />
              <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {saving ? "Saving..." : "Save Configuration"}
                  </Button>
              </div>
              </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}

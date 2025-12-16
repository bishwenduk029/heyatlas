export interface MCPToolRequest {
  toolName: string;
  input: Record<string, any>;
}

export interface MCPToolResponse {
  success: boolean;
  data?: Record<string, any>;
  error?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required: string[];
  };
}

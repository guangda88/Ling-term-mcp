/**
 * Type definitions
 */

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPToolResponse {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

export interface MCPToolHandler {
  (args: unknown): Promise<MCPToolResponse>;
}

export interface Session {
  id: string;
  name: string;
  working_directory: string;
  created_at: string;
  status: 'active' | 'inactive' | 'destroyed';
  environment?: Record<string, string>;
}

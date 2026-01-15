import asyncio
import os
from dotenv import load_dotenv
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp.types import Tool, TextContent, ImageContent, EmbeddedResource
from mcp.server.stdio import StdioServerTransport
from camel.agents import ChatAgent
from camel.toolkits import FunctionTool
from camel.tasks import Task
from src.workforce import create_workforce
from src.config import create_agent_model

# Load env vars
load_dotenv()

class AgentSmithMCPServer:
    def __init__(self):
        self.workforce = create_workforce()
        self.model = create_agent_model()
        
        # Create a wrapper agent that interfaces with the workforce
        # This agent is what actually "talks" to the MCP client (Atlas)
        self.interface_agent = ChatAgent(
            system_message="""You are Agent Smith, an advanced multi-agent workforce manager.
            You receive tasks from the user and delegate them to your workforce.
            Always use the 'delegate_task' tool to execute the user's request.
            After the workforce finishes, summarize the result for the user.""",
            model=self.model,
            tools=[FunctionTool(self.delegate_task)]
        )

    def delegate_task(self, task_description: str) -> str:
        """
        Delegates a task to the multi-agent workforce.
        
        Args:
            task_description: The full description of the task to perform.
        """
        print(f"[Agent Smith] Delegating task: {task_description}")
        
        task = Task(
            content=task_description,
            id="task_0" # Simple ID generation
        )
        
        # Run the workforce synchronously
        task_result = self.workforce.process_task(task)
        
        return str(task_result.result)

    async def run(self, transport_mode: str = "stdio"):
        """
        Run the MCP server.
        """
        # Note: CAMEL's agent.to_mcp() is great, but wrapping the workforce 
        # specifically might require this custom setup or using the interface agent.
        
        # Let's use CAMEL's built-in MCP server capability if possible
        # but since we want to expose the *workforce* which isn't exactly a single agent
        # wrapping it in a function tool for a "Front Desk" agent is a solid pattern.
        
        # Actually, let's try to use the native camel method if applicable.
        # ChatAgent.to_mcp() returns an MCP server instance.
        
        mcp_server = self.interface_agent.to_mcp(
            name="agent-smith",
            description="Multi-agent workforce for document processing and automation"
        )
        
        print(f"[Agent Smith] Starting MCP server with transport: {transport_mode}")
        
        if transport_mode == "stdio":
            await mcp_server.run(transport="stdio")
        elif transport_mode == "streamable-http":
            # For HTTP, we might need a different entry point or uvicorn wrapper
            # But let's assume standard run handles it or we use the specific args
            await mcp_server.run(transport="sse") # mapping streamable-http to SSE for now as it's common
        else:
            raise ValueError(f"Unknown transport: {transport_mode}")

if __name__ == "__main__":
    server = AgentSmithMCPServer()
    # Default to stdio for simple testing, but can be configured
    asyncio.run(server.run("stdio"))

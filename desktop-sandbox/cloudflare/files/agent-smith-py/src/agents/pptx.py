from camel.agents import ChatAgent
from camel.toolkits import PPTXToolkit
from src.config import create_agent_model
from src.prompts import PPTX_PROMPT

def create_pptx_agent() -> ChatAgent:
    """
    Creates the PPTX Processing Agent.
    """
    model = create_agent_model()
    
    # Initialize PPTX tools
    toolkit = PPTXToolkit()
    tools = toolkit.get_tools()
    
    agent = ChatAgent(
        system_message=PPTX_PROMPT,
        model=model,
        tools=tools
    )
    
    return agent

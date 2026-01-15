from camel.agents import ChatAgent
from camel.toolkits import FileWriteToolkit
from src.config import create_agent_model
from src.prompts import DOCX_PROMPT


def create_docx_agent() -> ChatAgent:
    """
    Creates the DOCX Processing Agent.
    """
    model = create_agent_model()
    
    file_toolkit = FileWriteToolkit()
    tools = file_toolkit.get_tools()
    
    agent = ChatAgent(
        system_message=DOCX_PROMPT,
        model=model,
        tools=tools,
    )
    
    return agent

from camel.agents import ChatAgent
from camel.toolkits import ExcelToolkit
from src.config import create_agent_model
from src.prompts import XLSX_PROMPT

def create_xlsx_agent() -> ChatAgent:
    """
    Creates the Excel Processing Agent.
    """
    model = create_agent_model()
    
    # Initialize Excel tools
    toolkit = ExcelToolkit()
    tools = toolkit.get_tools()
    
    agent = ChatAgent(
        system_message=XLSX_PROMPT,
        model=model,
        tools=tools
    )
    
    return agent

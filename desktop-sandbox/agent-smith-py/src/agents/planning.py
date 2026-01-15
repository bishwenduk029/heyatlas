from camel.agents import ChatAgent
from src.config import create_agent_model
from src.prompts import PLANNING_PROMPT

def create_planning_agent() -> ChatAgent:
    """
    Creates the Planning Agent responsible for task decomposition.
    """
    model = create_agent_model()
    
    agent = ChatAgent(
        system_message=PLANNING_PROMPT,
        model=model,
    )
    
    return agent

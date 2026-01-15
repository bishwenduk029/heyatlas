#!/usr/bin/env python3
"""
Quick test script for agent-smith-py.

Usage:
    export OPENROUTER_API_KEY=your-key
    python test_task.py
"""

import os
import sys

# Ensure API key is set
if not os.getenv("OPENROUTER_API_KEY"):
    print("Error: Set OPENROUTER_API_KEY first")
    sys.exit(1)

from camel.tasks import Task
from src.workforce import create_workforce

def main():
    print("Creating workforce...")
    workforce = create_workforce()
    
    # Simple test task
    task = Task(
        content="""
        1. Create a simple text file at /tmp/ai_trends.txt with 3 paragraphs about AI trends
        2. Then create a PowerPoint presentation at /tmp/ai_trends.pptx with 3 slides summarizing those trends
        """,
        id="test_task_1"
    )
    
    print(f"Processing task: {task.content[:100]}...")
    
    try:
        result = workforce.process_task(task)
        print(f"\n✅ Result:\n{result.result}")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise

if __name__ == "__main__":
    main()

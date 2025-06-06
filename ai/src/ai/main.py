#!/usr/bin/env python
import warnings
from ai.crew import Ai

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")

def run():
    """
    Run the crew.
    """
    inputs = {
        "query": "What is the patients name and email address",
        "id": 296020
    }
    
    try:
        result = Ai().crew().kickoff(inputs=inputs)
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")
    
    # Extract output from llm agent
    result = result.model_dump()
    tasks_output = result.get("tasks_output", [])
    for task in tasks_output:
        if task.get("agent", "").strip() == "LLM Expert":
            return task.get("raw", "No final answer found.")

    return "No relevant output found from LLM Expert."
    
def run(query: str, id: int):

    inputs = {
        "query": query,
        "id": id
    }

    try:
        result = Ai().crew().kickoff(inputs=inputs)
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")

    # Extract output from llm agent
    result = result.model_dump()
    tasks_output = result.get("tasks_output", [])
    for task in tasks_output:
        if task.get("agent", "").strip() == "LLM Expert":
            return task.get("raw", "No final answer found.")

    return "No relevant output found from LLM Expert."

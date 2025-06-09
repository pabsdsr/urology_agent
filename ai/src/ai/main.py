#!/usr/bin/env python
import warnings
from ai.crew import Ai

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")


# def run():
#     """
#     Run the crew.
#     """
#     inputs = {
#         "query": "Summarize the patients allergies",
#         "id": 296015,
#         "prev_id": None
#     }
    
#     try:
#         result = Ai().crew().kickoff(inputs=inputs)
#     except Exception as e:
#         raise Exception(f"An error occurred while running the crew: {e}")
    
#     # Extract output from llm agent
#     result = result.model_dump()
#     tasks_output = result.get("tasks_output", [])
#     for task in tasks_output:
#         if task.get("agent", "").strip() == "LLM Expert":
#             return task.get("raw", "No final answer found.")

#     return "No relevant output found from LLM Expert."

prev_id = None
    
def run(query: str, id: str):
    global prev_id

    inputs = {
        "query": query,
        "id": id,
        "prev_id": prev_id
    }

    try:
        result = Ai().crew().kickoff(inputs=inputs)
        prev_id = id
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")

    # Extract output from llm agent
    result = result.model_dump()
    tasks_output = result.get("tasks_output", [])
    for task in tasks_output:
        if task.get("agent", "").strip() == "LLM Expert":
            return task.get("raw", "No final answer found.")

    return "No relevant output found from LLM Expert."

from crewai.tools import tool
import os
import shutil
from crewai_tools.tools import RagTool

# Get the directory where this file (tools.py) is located
current_dir = os.path.dirname(os.path.abspath(__file__))

# Build paths relative to the tools.py file location
db_path = os.path.normpath(os.path.join(current_dir, "../../../db"))
knowledge_path = os.path.normpath(os.path.join(current_dir, "../../../knowledge"))

@tool
def clear_database_tool():
    """Reset the vector database by deleting all the data in the database folder."""

    if not os.path.exists(db_path):
        return "No db folder found."

    for filename in os.listdir(db_path):
        path = os.path.join(db_path, filename)
        if os.path.isdir(path):
            shutil.rmtree(path)
        # else:
        #     os.remove(path)
            
    return "All folders in db have been deleted, chroma.sqlite3 preserved."


@tool  
def load_file_tool(id: str):
    """Load JSON file from knowledge folder and upload to vector database."""

    json_file_path = os.path.join(knowledge_path, f"{id}.json")
    if not os.path.exists(json_file_path):
        return "No relevant information"
    
    rag_tool.add(source=json_file_path)
    
    return f"Successfully loaded {id}.json to database"


rag_tool = RagTool(
    config={
        "llm": {
            "provider": "google",
            "config": {
                "model": "gemini-2.0-flash-exp"
            }
        },
        "embedding_model": {
            "provider": "google",
            "config": {
                "model": "text-embedding-004"
            }
        },
        "vectordb": {
            "provider": "chroma",
            "config": {
                "dir": db_path 
            }
        }
    }
)
from crewai.tools import tool
import os
import shutil
from crewai_tools.tools import RagTool

# Get the directory where this file (tools.py) is located
current_dir = os.path.dirname(os.path.abspath(__file__))

# Build paths relative to the tools.py file location
db_path = os.path.normpath(os.path.join(current_dir, "../../db"))
knowledge_path = os.path.normpath(os.path.join(current_dir, "../knowledge"))

@tool
def clear_database_tool(id: str, prev_id: str):
    """Reset the vector database by deleting all the data in the database folder."""
    if id == prev_id:
        return "Id matched previous id"

    if not os.path.exists(db_path):
        return "No db folder found."

    for filename in os.listdir(db_path):
        path = os.path.join(db_path, filename)
        if os.path.isdir(path):
            shutil.rmtree(path)
            
    return "All folders in db have been deleted, chroma.sqlite3 preserved."


@tool  
def load_file_tool(id: str, prev_id: str):
    """Load JSON file from knowledge folder and upload to vector database."""
    if id == prev_id:
        return "Id matched previous id"

    path = os.path.join(knowledge_path, f"{id}.json")
    if not os.path.exists(path):
        return "No data for this patient found"

    rag_tool.add(source=path)
    
    return f"Successfully loaded {id} to database"

llm = os.getenv("MODEL", "")
provider, llm_model = llm.split("/", 1)
if provider == "bedrock":
    provider = "aws_bedrock"
embedding_model = os.getenv("EMBEDDING_MODEL", "")

rag_tool = RagTool(
    config={
        "llm": {
            "provider": provider,
            "config": {
                "model": llm_model,
                "temperature": 0.0
            }
        },
        "embedding_model": {
            "provider": provider,
            "config": {
                "model": embedding_model
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
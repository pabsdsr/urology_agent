import os
import uuid
from typing import Dict, List, Any
from google import genai
from google.genai import types
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document
from qdrant_client import QdrantClient
from qdrant_client.models import  PointStruct

class PatientDataEmbedder:
    def __init__(self, qdrant_url: str, qdrant_api_key: str = None, gemini_api_key: str = None):
        """
        Initialize the patient data embedder
        
        Args:
            qdrant_url: Qdrant cluster URL
            qdrant_api_key: Qdrant API key (optional for local)
            gemini_api_key: Gemini API key
        """
        # Initialize Gemini
        self.gemini_api_key = gemini_api_key or os.getenv("GEMINI_API_KEY")
        if not self.gemini_api_key:
            raise ValueError("GEMINI_API_KEY not found")
        
        # Initialize Qdrant client
        self.qdrant_client = QdrantClient(
            url=qdrant_url or os.getenv("QDRANT_URL"),
            api_key=qdrant_api_key or os.getenv("QDRANT_API_KEY")
        )
        
        # Initialize text splitter for JSON content
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,  # Smaller chunks for medical data
            chunk_overlap=100,
            length_function=len,
            separators=["\n\n", "\n", ". ", ", ", " "]
        )

        self.embedding_model = "text-embedding-004"
        self.vector_size = 768
        self._create_patient_id_index()
        self._create_hashed_patient_indices()
    
    def _create_patient_id_index(self):
        from qdrant_client.models import PayloadSchemaType
        
        try:
            self.qdrant_client.create_payload_index(
                collection_name="patient_collection",
                field_name="patient_id",
                field_schema= PayloadSchemaType.KEYWORD
            )
            print("index on patient_id created")
        except Exception as e:
            print(f"there was an error creating the patient_id index: {e}")
    
    def _create_hashed_patient_indices(self):
        from qdrant_client.models import PayloadSchemaType

        try:
            self.qdrant_client.create_payload_index(
                collection_name="hashed_patient_data",
                field_name="patient_hash",
                field_schema= PayloadSchemaType.KEYWORD
            )

            self.qdrant_client.create_payload_index(
                collection_name="hashed_patient_data",
                field_name="patient_id",
                field_schema= PayloadSchemaType.KEYWORD
            )
            print("index on patient_id and patient_hash created")
        except Exception as e:
            print(f"there was an error creating the patient_id index: {e}")



    def _json_to_text(self, patient_data):
        # see if this is good enough for chunking but we might have to go more in depth
        def format_section(key, value, indent: int = 0):
            prefix = "  " * indent
            
            if isinstance(value, dict):
                result = f"{prefix}{key.replace('_', ' ').title()}:\n"
                for k, v in value.items():
                    result += format_section(k, v, indent + 1)
                return result
            elif isinstance(value, list):
                result = f"{prefix}{key.replace('_', ' ').title()}:\n"
                for i, item in enumerate(value):
                    if isinstance(item, dict):
                        result += f"{prefix}  Item {i + 1}:\n"
                        for k, v in item.items():
                            result += format_section(k, v, indent + 2)
                    else:
                        result += f"{prefix}  - {item}\n"
                return result
            else:
                return f"{prefix}{key.replace('_', ' ').title()}: {value}\n"
        
        formatted_text = ""
        for patient_section in patient_data:
            for key, value in patient_section.items():
                formatted_text += format_section(key, value)

        return formatted_text.strip()
    
    def _chunk_patient_data(self, patient_data):
        
        patient_content = self._json_to_text(patient_data)

        doc = Document(
            page_content=patient_content,
        )

        chunks = self.text_splitter.split_documents([doc])

        return chunks

    def test_chunking(self, patient_data, patient_id):
        chunks = self._chunk_patient_data(patient_data, patient_id)
        points = []

        for chunk in chunks:
            embedding = self._embed_text(chunk.page_content)

            if embedding:
                point = PointStruct(
                    id =str(uuid.uuid4()),
                    vector=embedding,
                    payload={
                        "patient_text": chunk.page_content,
                        "patient_id": patient_id
                    }
                )

            points.append(point)
        if points:
            try:

                self.qdrant_client.upsert(
                    collection_name="patient_collection",
                    points=points
                )

                print("we stored our points")
            except Exception as e:
                print(f"Error storing points : {e}")

    def _embed_text(self, text):
        try:
            client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

            embedding = client.models.embed_content(
                model=self.embedding_model,
                contents=text,
                config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY")
            )

            return embedding.embeddings[0].values
        except Exception as e:
            print(f"error creating embedding {e}")
            return []


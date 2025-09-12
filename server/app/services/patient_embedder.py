import os
import uuid
import json
from typing import Dict, List, Any
import boto3
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from concurrent.futures import ThreadPoolExecutor, as_completed

class PatientDataEmbedder:
    def __init__(self, qdrant_url: str, qdrant_api_key: str = None, aws_region: str = "us-west-2"):
        """
        Initialize the patient data embedder
        
        Args:
            qdrant_url: Qdrant cluster URL
            qdrant_api_key: Qdrant API key (optional for local)
            aws_region: AWS region for Bedrock (default: us-west-2)
        """
        # Initialize AWS Bedrock client
        self.bedrock_client = boto3.client(
            service_name='bedrock-runtime',
            region_name=aws_region
        )
        
        # Initialize Qdrant client
        self.qdrant_client = QdrantClient(
            url=qdrant_url or os.getenv("QDRANT_URL"),
            api_key=qdrant_api_key or os.getenv("QDRANT_API_KEY")
        )
        
        # Initialize text splitter for JSON content
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", ". ", ", ", " "]
        )

        self.embedding_model = "amazon.titan-embed-text-v2:0"
        self.vector_size = 1024
        self._create_patient_indices()
    
    def _create_patient_indices(self):
        from qdrant_client.models import PayloadSchemaType

        try:
            self.qdrant_client.create_payload_index(
                collection_name="uropmsandbox460",
                field_name="patient_hash",
                field_schema=PayloadSchemaType.KEYWORD
            )

            self.qdrant_client.create_payload_index(
                collection_name="uropmsandbox460",
                field_name="patient_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print("DEBUG: Indices on patient_id and patient_hash created successfully")
        except Exception as e:
            print(f"DEBUG: Error creating hashed patient indices (may already exist): {e}")

    def _json_to_text(self, patient_data):
        """
        Convert JSON patient data into a plain text string optimized for embedding.
        """
        lines = []

        def flatten_content(title, content, indent=0):
            prefix = "  " * indent
            heading = f"{prefix}{title.upper()}"
            lines.append(heading)

            if isinstance(content, dict):
                for k, v in content.items():
                    if v not in (None, "", [], {}):
                        k_fmt = k.replace("_", " ").title()
                        if isinstance(v, (dict, list)):
                            flatten_content(k_fmt, v, indent + 1)
                        else:
                            lines.append(f"{prefix}  {k_fmt}: {v}")
            elif isinstance(content, list):
                for i, item in enumerate(content, 1):
                    if isinstance(item, dict):
                        flatten_content(f"{title} Item {i}", item, indent + 1)
                    else:
                        lines.append(f"{prefix}  - {item}")
            else:
                lines.append(f"{prefix}  {content}")

        # flatten each section
        for section in patient_data:
            for key, value in section.items():
                if value not in (None, "", [], {}):
                    flatten_content(key.title(), value)

        return "\n".join(lines).strip()

    def _chunk(self, patient_data):
        """Split patient data into chunks for embedding"""
        patient_content = self._json_to_text(patient_data)

        doc = Document(
            page_content=patient_content,
        )

        chunks = self.text_splitter.split_documents([doc])
        print(f"DEBUG: Created {len(chunks)} chunks from patient data")
        # print(chunks)
        
        return chunks

    def _embed(self, text):
        """
        Create embeddings using Amazon Titan Text Embeddings v2 through AWS Bedrock
        """
        try:
            request_body = {
                "inputText": text,
                "dimensions": 1024,  
                "normalize": True  
            }
            
            response = self.bedrock_client.invoke_model(
                modelId=self.embedding_model,
                body=json.dumps(request_body),
                contentType='application/json',
                accept='application/json'
            )
            
            response_body = json.loads(response['body'].read())
            embedding = response_body.get('embedding', [])
            
            return embedding
            
        except Exception as e:
            print(f"ERROR: Error creating embedding: {e}")
            return []

    def chunk_and_embed(self, patient_data, patient_section, patient_id, patient_hash):
            """Chunking and embedding process with debug output"""
            chunks = self._chunk(patient_data)
            points = []

            for i, chunk in enumerate(chunks):
                embedding = self._embed(chunk.page_content)

                if embedding:
                    point = PointStruct(
                        id=str(uuid.uuid4()),
                        vector=embedding,
                        payload={
                            "patient_text": chunk.page_content,
                            "section_name": patient_section,
                            "patient_id": patient_id,
                            "patient_hash": patient_hash,
                            "chunk_index": i,
                            "chunk_length": len(chunk.page_content)
                        }
                    )
                    points.append(point)
                else:
                    print(f"ERROR: Failed to create embedding for chunk {i+1}")

            print(f"DEBUG: Successfully created {len(points)} embeddings out of {len(chunks)} chunks")

            if points:
                try:
                    self.qdrant_client.upsert(
                        collection_name="uropmsandbox460",
                        points=points
                    )
                    print(f"DEBUG: Successfully stored {len(points)} points in Qdrant")
                except Exception as e:
                    print(f"ERROR: Error storing points in Qdrant: {e}")
            else:
                print("ERROR: No points to store - all embeddings failed")

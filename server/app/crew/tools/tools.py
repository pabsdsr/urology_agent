from crewai.tools import BaseTool
from pydantic import BaseModel, Field
import os
import boto3
import json
from typing import Any, Callable, Optional, Type, List


try:
    from qdrant_client import QdrantClient
    from qdrant_client.http.models import Filter, FieldCondition, MatchValue, FilterSelector

    QDRANT_AVAILABLE = True
except ImportError:
    QDRANT_AVAILABLE = False
    QdrantClient = Any  # type placeholder
    Filter = Any
    FieldCondition = Any
    MatchValue = Any

from crewai.tools import BaseTool
from pydantic import BaseModel, Field


class QdrantToolSchema(BaseModel):
    """Input for QdrantTool."""
    query: str = Field(
        ...,
        description="The query to search retrieve relevant information from the Qdrant database. Pass only the query, not the question.",
    )
    filter_by: Optional[str] = Field(
        default=None,
        description="Filter by properties. Pass only the properties, not the question.",
    )
    filter_value: Optional[str] = Field(
        default=None,
        description="Filter by value. Pass only the value, not the question.",
    )


class QdrantVectorSearchTool(BaseTool):
    """Tool to query and filter results from a Qdrant database.

    This tool enables vector similarity search on internal documents stored in Qdrant,
    with optional filtering capabilities.

    Attributes:
        client: Configured QdrantClient instance
        collection_name: Name of the Qdrant collection to search
        limit: Maximum number of results to return
        score_threshold: Minimum similarity score threshold
        qdrant_url: Qdrant server URL
        qdrant_api_key: Authentication key for Qdrant
    """
    model_config = {"arbitrary_types_allowed": True}
    client: QdrantClient = None
    name: str = "QdrantVectorSearchTool"
    description: str = "A tool to search the Qdrant database for relevant information on internal documents."
    args_schema: Type[BaseModel] = QdrantToolSchema
    query: Optional[str] = None
    filter_by: Optional[str] = None
    filter_value: Optional[str] = None
    collection_name: Optional[str] = "uropmsandbox460"
    hashed_collection_name: Optional[str] = "uropmsandbox460"
    limit: Optional[int] = Field(default=5)
    score_threshold: float = Field(default=0.2)
    qdrant_url: str = Field(
        ...,
        description="The URL of the Qdrant server",
    )
    qdrant_api_key: Optional[str] = Field(
        default=None,
        description="The API key for the Qdrant server",
    )
    custom_embedding_fn: Optional[Callable] = Field(
        default=None,
        description="A custom embedding function to use for vectorization. If not provided, the default model will be used.",
    )
    package_dependencies: List[str] = ["qdrant-client"]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if QDRANT_AVAILABLE:
            self.client = QdrantClient(
                url=self.qdrant_url,
                api_key=self.qdrant_api_key if self.qdrant_api_key else None,
            )
        else:
            raise ImportError(
                "The 'qdrant-client' package is required to use the QdrantVectorSearchTool. "
                "Please install it with: uv add qdrant-client"
            )
    
    def _run(
        self,
        query: str,
        filter_by: Optional[str] = None,
        filter_value: Optional[str] = None,
    ) -> str:
        """Execute vector similarity search on Qdrant.

        Args:
            query: Search query to vectorize and match
            filter_by: Optional metadata field to filter on
            filter_value: Optional value to filter by

        Returns:
            JSON string containing search results with metadata and scores

        Raises:
            ImportError: If qdrant-client is not installed
            ValueError: If Qdrant credentials are missing
        """

        if not self.qdrant_url:
            raise ValueError("QDRANT_URL is not set")

        try:
            # Create search filter if needed
            search_filter = None
            if filter_by and filter_value:
                search_filter = Filter(
                    must=[
                        FieldCondition(key=filter_by, match=MatchValue(value=filter_value))
                    ]
                )

            # Get query vector
            query_vector = (
                self._vectorize_query(query, embedding_model=os.getenv("EMBEDDING_MODEL", "amazon.titan-embed-text-v2:0"))
                if not self.custom_embedding_fn
                else self.custom_embedding_fn(query)
            )
            
            # Check if embedding was successful
            if not query_vector:
                print("Failed to create embedding for query")
                return json.dumps([])

            print(f"🔍 DEBUG: Using filter: {filter_by}={filter_value}" if filter_by else "🔍 DEBUG: No filter applied")

            # Use search method instead of query_points
            search_results = self.client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                query_filter=search_filter,
                limit=100,
                # so far providing it with more points doesnt seem to slow it down all that much
                score_threshold=self.score_threshold,
                with_payload=True
            )

            print(f"🔍 DEBUG: Found {len(search_results)} results")

            # Process results correctly
            results = []
            for point in search_results:
                # Access the point attributes directly
                result = {
                    "metadata": point.payload.get("metadata", {}),
                    "context": point.payload.get("patient_text", ""),
                    "distance": point.score,
                    "patient_id": point.payload.get("patient_id", "")
                }
                print(f"result: {result}")
                results.append(result)

            return json.dumps(results, indent=2)
            
        except Exception as e:
            print(f"ERROR: Error in _run method: {e}")
            import traceback
            print(f"TRACEBACK: {traceback.format_exc()}")
            return json.dumps([])
    
    def delete_points_by_patient_hash(self, patient_hash : str):
        hash_filter = "patient_hash"
        delete_filter = Filter(
            must=[
                FieldCondition(key=hash_filter, match=MatchValue(value=patient_hash))
                ]
        )

        delete_selector = FilterSelector(filter=delete_filter)

        delete_response = self.client.delete(
            collection_name = self.collection_name,
            points_selector = delete_selector
        )

        print(f"DEBUG: Patient data deleted with response: {delete_response}")
    
    def delete_all_points(self):
        from qdrant_client.http.models import Filter, FilterSelector

        delete_selector = FilterSelector(
            filter=Filter(must=[])
        )

        response = self.client.delete(
            collection_name=self.collection_name,
            points_selector=delete_selector
        )

        print(f"DEBUG: Deleted all points from '{self.collection_name}': {response}")
    
    def find_hash_embedding(self, patient_hash: str):
        """
        Find the hash embedding in Qdrant using patient_id and patient_hash.
        """
        search_filter = Filter(
            must=[
                FieldCondition(key="patient_hash", match=MatchValue(value=patient_hash))
            ]
        )

        search_result = self.client.scroll(
            collection_name="uropmsandbox460",
            scroll_filter=search_filter,
            limit=1
        )

        if search_result and search_result[0]:
            return search_result[0][0].payload.get("patient_hash")

        return None

    def _vectorize_query(self, query: str, embedding_model: str) -> list[float]:
        """Default vectorization function with Amazon Titan.

        Args:
            query (str): The query to vectorize
            embedding_model (str): The embedding model to use (e.g., "amazon.titan-embed-text-v2:0")

        Returns:
            list[float]: The vectorized query
        """
        try:
            print(f"🔍 DEBUG: Creating embedding for query: '{query[:50]}...'")
            
            bedrock_client = boto3.client(
                service_name='bedrock-runtime',
                region_name=os.getenv('AWS_REGION', 'us-west-2')
            )
            
            request_body = {
                "inputText": query,
                "dimensions": 1024,
                "normalize": True   
            }
            
            response = bedrock_client.invoke_model(
                modelId=embedding_model,
                body=json.dumps(request_body),
                contentType='application/json',
                accept='application/json'
            )
            
            response_body = json.loads(response['body'].read())
            embedding = response_body.get('embedding', [])
            
            return embedding
            
        except Exception as e:
            print(f"ERROR: Error creating embedding: {e}")
            import traceback
            print(f"ERROR: Traceback: {traceback.format_exc()}")
            return []

qdrant_tool = QdrantVectorSearchTool(
    collection_name="uropmsandbox460",
    limit=5,
    qdrant_url= os.getenv("QDRANT_URL"),
    qdrant_api_key= os.getenv("QDRANT_API_KEY")
)

#!/usr/bin/env python3
"""
Standalone script to create Qdrant collections for urology agent practices.

Usage:
    python create_qdrant_collection.py <practice_url>
    
Example:
    python create_qdrant_collection.py uropmsandbox460
    python create_qdrant_collection.py anotherpractice
"""

import sys
import os
import logging
from pathlib import Path
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PayloadSchemaType

# Load environment variables from .env file
def load_env():
    """Load environment variables from .env file"""
    env_file = Path(__file__).parent / ".env"
    if env_file.exists():
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key] = value
        print(f"Loaded environment variables from {env_file}")
    else:
        print(f"No .env file found at {env_file}")

# Load environment variables at startup
load_env()

def create_collection(practice_url: str):
    """
    Create a Qdrant collection for a specific practice with proper configuration
    
    Args:
        practice_url: The practice URL that will be used as the collection name
    """
    
    # Get Qdrant connection details from environment
    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_api_key = os.getenv("QDRANT_API_KEY")
    
    if not qdrant_url:
        print("❌ ERROR: QDRANT_URL environment variable not set")
        print("   Please set QDRANT_URL in your .env file")
        return False
    
    print(f"🔗 Connecting to Qdrant at: {qdrant_url}")
    
    try:
        # Initialize Qdrant client
        client = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key
        )
        
        collection_name = practice_url
        
        # Check if collection already exists
        try:
            existing_collection = client.get_collection(collection_name)
            print(f"⚠️  Collection '{collection_name}' already exists!")
            print(f"   Points count: {existing_collection.points_count}")
            print(f"   Vector size: {existing_collection.config.params.vectors.size}")
            
            response = input("Do you want to recreate it? This will delete all existing data! (y/N): ")
            if response.lower() != 'y':
                print("❌ Collection creation cancelled")
                return False
                
            # Delete existing collection
            client.delete_collection(collection_name)
            print(f"🗑️  Deleted existing collection: {collection_name}")
            
        except Exception:
            print(f"✅ Collection '{collection_name}' doesn't exist - will create new one")
        
        # Create collection with proper vector configuration
        print(f"🏗️  Creating collection: {collection_name}")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=1024,  # Amazon Titan embedding size
                distance=Distance.COSINE
            )
        )
        print(f"✅ Collection '{collection_name}' created successfully")
        
        # Create required indices for filtering
        print("🔧 Creating indices...")
        
        try:
            # Index for patient_id filtering
            client.create_payload_index(
                collection_name=collection_name,
                field_name="patient_id",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print("   ✅ Created patient_id index")
            
            # Index for patient_hash filtering  
            client.create_payload_index(
                collection_name=collection_name,
                field_name="patient_hash",
                field_schema=PayloadSchemaType.KEYWORD
            )
            print("   ✅ Created patient_hash index")
            
        except Exception as e:
            print(f"   ⚠️  Error creating indices (may already exist): {e}")
        
        # Verify collection was created properly
        collection_info = client.get_collection(collection_name)
        print(f"\n🎉 Collection Setup Complete!")
        print(f"   Collection Name: {collection_name}")
        print(f"   Vector Size: {collection_info.config.params.vectors.size}")
        print(f"   Distance Metric: {collection_info.config.params.vectors.distance}")
        print(f"   Points Count: {collection_info.points_count}")
        
        return True
        
    except Exception as e:
        print(f"❌ ERROR: Failed to create collection: {e}")
        return False

def main():
    print("🏥 Qdrant Collection Creator for Urology Agent")
    print("=" * 50)
    
    if len(sys.argv) != 2:
        print("❌ Usage: python create_qdrant_collection.py <practice_url>")
        print("\nExamples:")
        print("   python create_qdrant_collection.py uropmsandbox460")
        print("   python create_qdrant_collection.py anotherpractice")
        sys.exit(1)
    
    practice_url = sys.argv[1]
    
    # Validate practice URL format
    if not practice_url.replace('_', '').replace('-', '').isalnum():
        print(f"❌ Invalid practice URL format: {practice_url}")
        print("   Practice URL should contain only letters, numbers, hyphens, and underscores")
        sys.exit(1)
    
    print(f"📋 Creating collection for practice: {practice_url}")
    
    success = create_collection(practice_url)
    
    if success:
        print(f"\n🎯 Next Steps:")
        print(f"   1. Your urology agent is now ready for practice: {practice_url}")
        print(f"   2. Users can login with practice URL: {practice_url}")
        print(f"   3. Patient data will be stored in collection: {practice_url}")
    else:
        print(f"\n❌ Collection creation failed for practice: {practice_url}")
        sys.exit(1)

if __name__ == "__main__":
    main()

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from qdrant_client import QdrantClient
from transformers import CLIPProcessor, CLIPModel
import torch
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Add backend to path so we can import local modules
sys.path.append(os.path.dirname(__file__))
try:
    from change_detection import detect_structural_changes, classify_changes
    CD_AVAILABLE = True
except ImportError:
    CD_AVAILABLE = False
    
try:
    from ingestion_script import process_and_ingest
    from add_city import get_bounding_box, download_stac_pair, sanitize_city_name
    INGESTION_AVAILABLE = True
except ImportError:
    INGESTION_AVAILABLE = False


app = FastAPI(title="Satellite Imagery Analysis System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", None)
COLLECTION_NAME = "satellite_patches"
MODEL_ID = "flax-community/clip-rsicd-v2"

try:
    print(f"Loading Specialized Satellite CLIP model: {MODEL_ID} for Search API...")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = CLIPModel.from_pretrained(MODEL_ID).to(device)
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    
    # Use API key if it exists (for Cloud), otherwise standard connection
    if QDRANT_API_KEY:
        qdrant = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=60.0)
    else:
        qdrant = QdrantClient(url=QDRANT_URL, timeout=60.0)
        
    AI_READY = True
except Exception as e:
    print(f"Warning: Could not initialize AI models or Qdrant. Search will be disabled. Error: {e}")
    AI_READY = False

class SearchResponse(BaseModel):
    query: str
    results: list


@app.get("/")
def read_root():
    return {"message": "Welcome to the Satellite Imagery Analysis System API"}

@app.get("/health")
def health_check():
    return {"status": "ok", "ai_search_ready": AI_READY}

@app.get("/search", response_model=SearchResponse)
def semantic_search(q: str, limit: int = 5):
    """
    Search satellite imagery using natural language.
    E.g., /search?q=water
    """
    if not AI_READY:
        return {"query": q, "results": [{"error": "AI models not initialized."}]}
        
    device = "cuda" if torch.cuda.is_available() else "cpu"
    inputs = processor(text=[q], return_tensors="pt", padding=True).to(device)
    
    with torch.no_grad():
        text_features = model.get_text_features(**inputs)
        
    embedding = text_features[0].cpu().numpy().tolist()
    search_result = qdrant.search(
        collection_name=COLLECTION_NAME,
        query_vector=embedding,
        limit=limit
    )
    results = []
    for hit in search_result:
        results.append({
            "score": round(hit.score, 4),
            "filename": hit.payload.get("filename"),
            "bbox": hit.payload.get("bbox")
        })
        
    return {"query": q, "results": results}

class ChangeDetectionRequest(BaseModel):
    city: str

@app.post("/detect-change")
def api_detect_change(request: ChangeDetectionRequest):
    """
    Detects and classifies structural changes between two satellite images for a given city.
    """
    if not CD_AVAILABLE:
        return {"error": "Change detection module not loaded."}
        
    if not INGESTION_AVAILABLE:
        return {"error": "Ingestion module not loaded (needed for alias resolution)."}
        
    clean_city = sanitize_city_name(request.city)
    
    # Robust path resolution
    import os
    base_dir = os.path.dirname(os.path.dirname(__file__))
    before_path = os.path.join(base_dir, "playground_data", f"{clean_city}_before.tif")
    after_path = os.path.join(base_dir, "playground_data", f"{clean_city}_after.tif")
    
    if not os.path.exists(before_path) or not os.path.exists(after_path):
        # Fallback to current dir
        before_path = os.path.join(os.path.dirname(__file__), "playground_data", f"{clean_city}_before.tif")
        after_path = os.path.join(os.path.dirname(__file__), "playground_data", f"{clean_city}_after.tif")
        
    if not os.path.exists(before_path) or not os.path.exists(after_path):
        return {"error": f"Image files for {clean_city} do not exist. Please Ingest City first!"}
        
    try:
        changes = detect_structural_changes(before_path, after_path)
        if not changes:
            return {"message": "No significant structural changes detected.", "changes": []}
            
        classified_changes = classify_changes(changes, before_path, after_path)
        return {"message": f"Found {len(classified_changes)} changes.", "changes": classified_changes}
    except Exception as e:
        return {"error": f"Failed to process change detection: {str(e)}"}

class AddCityRequest(BaseModel):
    city: str

def run_ingestion_pipeline(city: str, bbox: list):
    """ Background worker to run the heavy AI ingestion pipeline """
    try:
        print(f"[{city}] Starting background download...")
        success = download_stac_pair(bbox, city)
        if not success:
            print(f"[{city}] Download failed. Aborting ingestion.")
            return

        import os
        clean_city = sanitize_city_name(city)
        base_dir = os.path.dirname(os.path.dirname(__file__))
        before_path = os.path.join(base_dir, "playground_data", f"{clean_city}_before.tif")
        if not os.path.exists(before_path):
            before_path = os.path.join(os.path.dirname(__file__), "playground_data", f"{clean_city}_before.tif")
            
        print(f"[{city}] Download complete. Starting AI processing...")
        process_success = process_and_ingest(before_path, model, processor, qdrant, max_patches=400, target_bbox=bbox)
        if process_success:
            print(f"[{city}] Successfully completed background ingestion.")
        else:
            print(f"[{city}] Background ingestion failed.")
    except Exception as e:
        print(f"[{city}] Background ingestion crashed: {e}")

@app.post("/add-city")
def api_add_city(request: AddCityRequest, background_tasks: BackgroundTasks):
    """
    Geocodes a city, downloads STAC imagery, and ingests it into Qdrant in the background.
    """
    if not INGESTION_AVAILABLE or not AI_READY:
        return {"error": "Ingestion modules or AI not ready."}
        
    city = request.city
    
    # 1. Geocode
    bbox = get_bounding_box(city)
    if not bbox:
        return {"error": f"Could not find coordinates for {city}"}
        
    # 2. Clear Qdrant
    try:
        qdrant.delete_collection(collection_name=COLLECTION_NAME)
    except Exception:
        pass # It's fine if it doesn't exist
        
    # 3. Dispatch Heavy AI Job to Background Worker
    print(f"Dispatching AI ingestion for {city} to background worker...")
    background_tasks.add_task(run_ingestion_pipeline, city, bbox)
    
    return {
        "message": f"Successfully queued {city} for AI ingestion. The pipeline is running in the background and data will appear soon.",
        "bbox": bbox
    }

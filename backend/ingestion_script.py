import os
from dotenv import load_dotenv
import rasterio
from rasterio.windows import Window
from rasterio.warp import transform_bounds
from PIL import Image
import torch
from transformers import CLIPProcessor, CLIPModel
from qdrant_client import QdrantClient
from qdrant_client.http import models

load_dotenv()

MODEL_ID = "flax-community/clip-rsicd-v2"
QDRANT_URL = os.environ.get("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", None)
COLLECTION_NAME = "satellite_patches"
PATCH_SIZE = 224

def normalize_image(img_array):
    """ Robustly normalize satellite imagery using 2nd and 98th percentiles to 8-bit RGB """
    import numpy as np
    img = img_array.astype(float)
    valid_pixels = img[img > 0]
    
    if len(valid_pixels) == 0:
        return np.zeros_like(img, dtype=np.uint8)
        
    p2, p98 = np.percentile(valid_pixels, (2, 98))
    
    if p98 == p2:
        return np.zeros_like(img, dtype=np.uint8)
        
    img_normalized = np.clip((img - p2) / (p98 - p2), 0, 1)
    return (img_normalized * 255).astype(np.uint8)

def process_and_ingest(image_path, model, processor, qdrant, max_patches=1000, target_bbox=None):
    device = "cpu"
    
    collections = qdrant.get_collections().collections
    if not any(c.name == COLLECTION_NAME for c in collections):
        print(f"Creating Qdrant collection: {COLLECTION_NAME}")
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(size=512, distance=models.Distance.COSINE),
        )

    if not os.path.exists(image_path):
        print(f"Error: Could not find image at {image_path}")
        return False

    print(f"Opening image: {image_path}")
    points_to_insert = []
    point_id = 1
    
    with rasterio.open(image_path) as src:
        width = src.width
        height = src.height
        print(f"Image size: {width}x{height}")
        
        start_x, end_x = 0, width
        start_y, end_y = 0, height
        
        if target_bbox:
            from rasterio.warp import transform_bounds
            import math
            
            min_x, min_y, max_x, max_y = transform_bounds('EPSG:4326', src.crs, *target_bbox)
            row_min, col_min = src.index(min_x, max_y)
            row_max, col_max = src.index(max_x, min_y)
            
            center_x = (col_min + col_max) // 2
            center_y = (row_min + row_max) // 2
            
            grid_size = int(math.sqrt(max_patches))
            STRIDE = PATCH_SIZE // 2
            
            half_width_pixels = (grid_size * STRIDE) // 2
            
            start_x = max(0, center_x - half_width_pixels)
            end_x = min(width, center_x + half_width_pixels)
            start_y = max(0, center_y - half_width_pixels)
            end_y = min(height, center_y + half_width_pixels)
            
            print(f"Targeting city center at pixel ({center_x}, {center_y})")
            print(f"Expanding ingestion grid to: X({start_x}-{end_x}), Y({start_y}-{end_y})")
        
        processed = 0
        
        for y in range(start_y, end_y, STRIDE):
            for x in range(start_x, end_x, STRIDE):
                if processed >= max_patches:
                    break
                    
                w = min(PATCH_SIZE, end_x - x, width - x)
                h = min(PATCH_SIZE, end_y - y, height - y)
                if w < PATCH_SIZE or h < PATCH_SIZE:
                    continue
                
                window = Window(x, y, w, h)
                r = src.read(1, window=window)
                g = src.read(2, window=window)
                b = src.read(3, window=window)
                
                import numpy as np
                rgb = np.dstack((r, g, b))
                rgb_normalized = normalize_image(rgb)
                img = Image.fromarray(rgb_normalized)
                
                left, bottom, right, top = rasterio.windows.bounds(window, src.transform)
                min_lon, min_lat, max_lon, max_lat = transform_bounds(src.crs, 'EPSG:4326', left, bottom, right, top)
                
                inputs = processor(images=img, return_tensors="pt").to(device)
                with torch.no_grad():
                    image_features = model.get_image_features(**inputs)
                
                embedding = image_features[0].cpu().numpy().tolist()
                
                points_to_insert.append(
                    models.PointStruct(
                        id=point_id,
                        vector=embedding,
                        payload={
                            "filename": os.path.basename(image_path),
                            "x": x,
                            "y": y,
                            "bbox": [min_lon, min_lat, max_lon, max_lat]
                        }
                    )
                )
                
                point_id += 1
                processed += 1
            if processed >= max_patches:
                break
                
    if points_to_insert:
        print(f"Inserting {len(points_to_insert)} patches into Qdrant...")
        qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=points_to_insert
        )
        print("Success! The data is now searchable.")
    else:
        print("No patches processed.")
        
    return True



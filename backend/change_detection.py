import cv2
import numpy as np
import rasterio
from rasterio.warp import transform_bounds
from skimage.metrics import structural_similarity as ssim
import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
import base64
import io

def get_base64_image(img_array):
    img = Image.fromarray(img_array)
    if img.mode != 'RGB':
        img = img.convert('RGB')
    buffered = io.BytesIO()
    img.save(buffered, format="JPEG", quality=85)
    return base64.b64encode(buffered.getvalue()).decode("utf-8")

def normalize_image(img_array):
    """ Robustly normalize satellite imagery using 2nd and 98th percentiles """
    img = img_array.astype(float)
    valid_pixels = img[img > 0]
    
    if len(valid_pixels) == 0:
        return np.zeros_like(img, dtype=np.uint8)
        
    p2, p98 = np.percentile(valid_pixels, (2, 98))
    
    if p98 == p2:
        return np.zeros_like(img, dtype=np.uint8)
        
    img_normalized = np.clip((img - p2) / (p98 - p2), 0, 1)
    return (img_normalized * 255).astype(np.uint8)

def align_images(im1, im2):
    print("Performing fast sub-pixel image alignment...")
    try:
        # Heavily downsample to make ECC mathematically feasible on 10k x 10k satellite images
        scale = 0.1
        im1_small = cv2.resize(im1, (0,0), fx=scale, fy=scale)
        im2_small = cv2.resize(im2, (0,0), fx=scale, fy=scale)
        
        warp_mode = cv2.MOTION_TRANSLATION
        warp_matrix = np.eye(2, 3, dtype=np.float32)
        criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 1e-3)
        
        _, warp_matrix = cv2.findTransformECC(im1_small, im2_small, warp_matrix, warp_mode, criteria, None, 1)
        
        # Scale the translation parameters back up to full resolution
        warp_matrix[0, 2] /= scale
        warp_matrix[1, 2] /= scale
        
        sz = im1.shape
        im2_aligned = cv2.warpAffine(im2, warp_matrix, (sz[1], sz[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        return im2_aligned
    except Exception as e:
        print(f"Alignment warning: {e}. Falling back to unaligned.")
        return im2

def detect_structural_changes(image_path_before, image_path_after):
    print("Loading temporal image pair...")
    
    with rasterio.open(image_path_before) as src_before:
        r = src_before.read(1)
        g = src_before.read(2)
        b = src_before.read(3)
        img_b_rgb = np.dstack((r, g, b))
        img_b_rgb = normalize_image(img_b_rgb)
        img_b = cv2.cvtColor(img_b_rgb, cv2.COLOR_RGB2GRAY)
        
    with rasterio.open(image_path_after) as src_after:
        r = src_after.read(1)
        g = src_after.read(2)
        b = src_after.read(3)
        img_a_rgb = np.dstack((r, g, b))
        img_a_rgb = normalize_image(img_a_rgb)
        img_a = cv2.cvtColor(img_a_rgb, cv2.COLOR_RGB2GRAY)
        transform = src_after.transform
        
    min_h = min(img_b.shape[0], img_a.shape[0])
    min_w = min(img_b.shape[1], img_a.shape[1])
    img_b = img_b[:min_h, :min_w]
    img_a = img_a[:min_h, :min_w]
    
    # Align the after image to the before image
    img_a = align_images(img_b, img_a)
    
    score, diff = ssim(img_b, img_a, full=True, win_size=7)
    diff = (diff * 255).astype("uint8")
    
    diff_blur = cv2.GaussianBlur(diff, (9, 9), 0)
    _, thresh = cv2.threshold(diff_blur, 120, 255, cv2.THRESH_BINARY_INV)
    
    kernel = np.ones((15, 15), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)
    
    print(f"Overall Image Similarity Score: {score:.4f}")
    
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    changes = []
    
    total_area = img_b.shape[0] * img_b.shape[1]
    max_area = total_area * 0.20
    
    for c in contours:
        area = cv2.contourArea(c)
        if 1500 < area < max_area:
            x, y, w, h = cv2.boundingRect(c)
            window = rasterio.windows.Window(x, y, w, h)
            left, bottom, right, top = rasterio.windows.bounds(window, transform)
            min_lon, min_lat, max_lon, max_lat = transform_bounds(src_after.crs, 'EPSG:4326', left, bottom, right, top)
            
            changes.append({
                "pixel_bbox": [x, y, w, h],
                "gps_bbox": [min_lon, min_lat, max_lon, max_lat],
                "area": cv2.contourArea(c)
            })
            
    print(f"Found {len(changes)} significant structural changes.")
    return changes

def classify_changes(changes, image_path_before, image_path_after):
    """ Use CLIP to classify what the new object is and extract Base64 images for the frontend """
    # UPGRADED: Using a specialized Remote Sensing Vision-Language model for significantly higher accuracy on satellite data
    MODEL_ID = "flax-community/clip-rsicd-v2"
    device = "cpu"
    print(f"Loading CLIP on {device} for classification...")
    
    model = CLIPModel.from_pretrained(MODEL_ID).to(device)
    processor = CLIPProcessor.from_pretrained(MODEL_ID)
    
    classes = ["new construction", "water", "dense forest", "deforestation", "urban area", "empty land"]
    
    results = []
    
    # Batch collection
    valid_changes = []
    pil_images = []
    
    with rasterio.open(image_path_before) as src_before, rasterio.open(image_path_after) as src_after:
        for change in changes:
            x, y, w, h = change["pixel_bbox"]
            window = rasterio.windows.Window(x, y, w, h)

            # Extract AFTER image for classification and UI
            r_a = src_after.read(1, window=window)
            g_a = src_after.read(2, window=window)
            b_a = src_after.read(3, window=window)
            rgb_a = np.dstack((r_a, g_a, b_a))
            rgb_a = normalize_image(rgb_a)
            
            # Extract BEFORE image for UI
            r_b = src_before.read(1, window=window)
            g_b = src_before.read(2, window=window)
            b_b = src_before.read(3, window=window)
            rgb_b = np.dstack((r_b, g_b, b_b))
            rgb_b = normalize_image(rgb_b)
            
            if rgb_a.size == 0 or 0 in rgb_a.shape:
                continue
                
            # Attach base64 images to response
            change["image_before"] = f"data:image/jpeg;base64,{get_base64_image(rgb_b)}"
            change["image_after"] = f"data:image/jpeg;base64,{get_base64_image(rgb_a)}"
                
            img = Image.fromarray(rgb_a)
            pil_images.append(img)
            valid_changes.append(change)
            
    if not pil_images:
        return []
        
    # Run fully batched inference on the GPU
    print(f"Running batched GPU inference for {len(pil_images)} patches...")
    inputs = processor(text=classes, images=pil_images, return_tensors="pt", padding=True).to(device)
    with torch.no_grad():
        outputs = model(**inputs)
    
    logits_per_image = outputs.logits_per_image
    probs = logits_per_image.softmax(dim=1).cpu().numpy()
    
    for i, change in enumerate(valid_changes):
        best_idx = probs[i].argmax()
        change["classification"] = classes[best_idx]
        change["confidence"] = round(float(probs[i][best_idx]), 4)
        results.append(change)
            
    return results


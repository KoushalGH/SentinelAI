
import urllib.request
import urllib.parse
import json
import os
import sys
from pystac_client import Client

import difflib

def sanitize_city_name(city_name):
    clean = city_name.lower().strip()
    
    aliases = {
        "bangalore": "bengaluru",
        "bombay": "mumbai",
        "madras": "chennai",
        "calcutta": "kolkata",
        "gurgaon": "gurugram"
    }
    clean = aliases.get(clean, clean)
    
    base_dir = os.path.dirname(os.path.dirname(__file__))
    data_dir = os.path.join(base_dir, "playground_data")
    
    known_cities = []
    if os.path.exists(data_dir):
        for f in os.listdir(data_dir):
            if f.endswith("_before.tif"):
                known_cities.append(f.replace("_before.tif", ""))
                
    if known_cities:
        matches = difflib.get_close_matches(clean, known_cities, n=1, cutoff=0.7)
        if matches:
            clean = matches[0]
            
    return clean.replace(" ", "_")

def get_bounding_box(city_name):
    print(f"\n🌍 Searching for coordinates of '{city_name}'...")
    url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(city_name)}&format=json&limit=1"
    
    # Nominatim requires a User-Agent
    req = urllib.request.Request(url, headers={'User-Agent': 'SentinelAI-Portfolio-Project/1.0'})
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            if not data:
                print(f"❌ Could not find city: {city_name}")
                return None
            
            lat = float(data[0]['lat'])
            lon = float(data[0]['lon'])
            print(f"📍 Found {data[0]['display_name']} at {lat}, {lon}")
            
            offset = 0.05 
            bbox = [lon - offset, lat - offset, lon + offset, lat + offset]
            return bbox
    except Exception as e:
        print(f"❌ Geocoding error: {e}")
        return None

def download_stac_pair(bbox, city_name):
    print("\n📡 Connecting to AWS Earth Search STAC API...")
    client = Client.open("https://earth-search.aws.element84.com/v1")
    
    print("⏳ Searching for a 2022 (Before) image...")
    search_before = client.search(
        collections=["sentinel-2-c1-l2a"],
        bbox=bbox,
        datetime="2022-01-01/2022-12-31",
        query={"eo:cloud_cover": {"lt": 10}},
        max_items=1
    )
    items_before = list(search_before.items())
    
    print("⏳ Searching for a 2026 (After) image...")
    search_after = client.search(
        collections=["sentinel-2-c1-l2a"],
        bbox=bbox,
        datetime="2026-01-01/2026-12-31",
        query={"eo:cloud_cover": {"lt": 10}},
        max_items=1
    )
    items_after = list(search_after.items())
    
    if not items_before or not items_after:
        print("❌ Could not find a cloud-free image pair for this location. Try another city.")
        return False
        
    url_before = items_before[0].assets["visual"].href
    url_after = items_after[0].assets["visual"].href
    
    clean_city = sanitize_city_name(city_name)
    os.makedirs("playground_data", exist_ok=True)
    file_before = f"playground_data/{clean_city}_before.tif"
    file_after = f"playground_data/{clean_city}_after.tif"
    
    import httpx
    import sys

    def fast_download(url, filepath):
        if os.path.exists(filepath):
            print(f"\n⚡ {filepath} already exists! Skipping download to save time.")
            return

        with httpx.Client() as client:
            with client.stream("GET", url) as r:
                r.raise_for_status()
                total_size = int(r.headers.get("Content-Length", 0))
                last_percent = -1
                downloaded = 0
                
                with open(filepath, 'wb') as f:
                    # Stream in 1 Megabyte chunks instead of urllib's default 8 Kilobyte chunks
                    for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            percent = int(downloaded * 100 / total_size)
                            if percent != last_percent:
                                downloaded_mb = downloaded / (1024 * 1024)
                                total_mb = total_size / (1024 * 1024)
                                sys.stdout.write(f"\rDownloading: {downloaded_mb:.1f} MB / {total_mb:.1f} MB ({percent}%)")
                                sys.stdout.flush()
                                last_percent = percent
                                
    print(f"\n📥 Downloading BEFORE image ({items_before[0].datetime}) - This may take a minute...")
    fast_download(url_before, file_before)
    print("\n✅ Before image complete!")
    
    print(f"\n📥 Downloading AFTER image ({items_after[0].datetime}) - Almost done...")
    fast_download(url_after, file_after)
    print("\n✅ After image complete!")
    
    print("\n✅ Download Complete!")
    return True



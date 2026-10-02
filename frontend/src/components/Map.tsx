"use client";

import React, { useMemo, useEffect, useRef, useState } from 'react';
import Map, { NavigationControl, Source, Layer, MapRef, Marker } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapProps {
  searchResults?: any[];
  changeResults?: any[];
  activeResultIndex?: number | null;
}

export default function MapComponent({ searchResults = [], changeResults = [], activeResultIndex = null }: MapProps) {
  const mapRef = useRef<MapRef>(null);
  
  // State for clicked location reverse geocoding
  const [clickedLocation, setClickedLocation] = useState<{ lat: number, lng: number, name: string, isLoading: boolean } | null>(null);

  // Automatically fly to the results when they arrive
  useEffect(() => {
    if (searchResults.length > 0 && mapRef.current) {
      const firstResult = searchResults[0];
      if (firstResult && firstResult.bbox) {
        const [min_lon, min_lat, max_lon, max_lat] = firstResult.bbox;
        const center_lon = (min_lon + max_lon) / 2;
        const center_lat = (min_lat + max_lat) / 2;
        
        // Prevent crashing if backend returns unprojected UTM coordinates
        if (center_lat >= -90 && center_lat <= 90 && center_lon >= -180 && center_lon <= 180) {
          mapRef.current.flyTo({
            center: [center_lon, center_lat],
            zoom: 13,
            duration: 2000
          });
        } else {
          console.error("Invalid coordinates received from backend:", center_lon, center_lat);
        }
      }
    }
  }, [searchResults]);

  // Fly to the active result when it changes
  useEffect(() => {
    if (activeResultIndex !== null && activeResultIndex !== undefined && searchResults.length > activeResultIndex && mapRef.current) {
      const activeResult = searchResults[activeResultIndex];
      if (activeResult && activeResult.bbox) {
        const [min_lon, min_lat, max_lon, max_lat] = activeResult.bbox;
        const marker_lon = min_lon + (max_lon - min_lon) * 0.25;
        const marker_lat = min_lat + (max_lat - min_lat) * 0.75;
        
        mapRef.current.flyTo({
          center: [marker_lon, marker_lat],
          zoom: Math.max(mapRef.current.getZoom(), 14), // zoom in slightly to focus on it
          duration: 1000
        });
      }
    }
  }, [activeResultIndex, searchResults]);

  // Convert backend bounding boxes to a GeoJSON FeatureCollection
  const geojsonData = useMemo(() => {
    const features = searchResults
      .filter(res => res && res.bbox && res.bbox.length === 4)
      .map((res, index) => {
      // bbox is [min_lon, min_lat, max_lon, max_lat]
      const [min_lon, min_lat, max_lon, max_lat] = res.bbox;
      return {
        type: 'Feature',
        id: index,
        properties: { 
          score: res.score,
          regionNumber: (index + 1).toString()
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [min_lon, min_lat],
            [max_lon, min_lat],
            [max_lon, max_lat],
            [min_lon, max_lat],
            [min_lon, min_lat] // close the polygon
          ]]
        }
      };
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }, [searchResults]);

  // Convert change detection boxes to a GeoJSON FeatureCollection
  const changeGeojsonData = useMemo(() => {
    const features = changeResults
      .filter(res => res && res.gps_bbox && res.gps_bbox.length === 4)
      .map((res, index) => {
      const [min_lon, min_lat, max_lon, max_lat] = res.gps_bbox;
      return {
        type: 'Feature',
        id: `change-${index}`,
        properties: { classification: res.classification, confidence: res.confidence },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [min_lon, min_lat],
            [max_lon, min_lat],
            [max_lon, max_lat],
            [min_lon, max_lat],
            [min_lon, min_lat]
          ]]
        }
      };
    });

    return {
      type: 'FeatureCollection',
      features
    };
  }, [changeResults]);

  // Automatically fly to change results if they exist
  useEffect(() => {
    if (changeResults.length > 0 && mapRef.current) {
      const firstResult = changeResults[0];
      if (firstResult && firstResult.gps_bbox) {
        const [min_lon, min_lat, max_lon, max_lat] = firstResult.gps_bbox;
        const center_lon = (min_lon + max_lon) / 2;
        const center_lat = (min_lat + max_lat) / 2;
        
        if (center_lat >= -90 && center_lat <= 90 && center_lon >= -180 && center_lon <= 180) {
          mapRef.current.flyTo({
            center: [center_lon, center_lat],
            zoom: 13,
            duration: 2000
          });
        }
      }
    }
  }, [changeResults]);

  const lastRequestTime = useRef<number>(0);

  // Handle map clicks for reverse geocoding
  const handleMapClick = async (e: any) => {
    const now = Date.now();
    if (now - lastRequestTime.current < 1100) {
      console.warn("Rate limiting active: Please wait 1 second between clicks.");
      return;
    }
    lastRequestTime.current = now;
    
    const { lng, lat } = e.lngLat;
    
    // Set immediate loading state
    setClickedLocation({ lat, lng, name: "Identifying location...", isLoading: true });
    
    try {
      const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
      const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
      
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}${emailParam}`);
      const data = await res.json();
      
      setClickedLocation({
        lat,
        lng,
        name: data.display_name || "Unknown Location (No data available)",
        isLoading: false
      });
    } catch (error) {
      console.error("Reverse geocoding failed", error);
      setClickedLocation({
        lat,
        lng,
        name: "Error identifying location. Please try again.",
        isLoading: false
      });
    }
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-gray-900">
      
      <Map
        ref={mapRef}
        mapLib={maplibregl}
        onClick={handleMapClick}
        interactiveLayerIds={['search-results-fill', 'change-results-fill']}
        style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, width: '100%', height: '100%' }}
        initialViewState={{
          longitude: -74.0,
          latitude: 40.75,
          zoom: 10
        }}
        maxZoom={19}
        mapStyle={{
          version: 8,
          sources: {
            satellite: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              attribution: '&copy; Esri',
              maxzoom: 17
            },
            labels: {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256,
              maxzoom: 16
            }
          },
          layers: [
            {
              id: 'satellite-layer',
              type: 'raster',
              source: 'satellite',
              minzoom: 0,
              maxzoom: 22
            },
            {
              id: 'labels-layer',
              type: 'raster',
              source: 'labels',
              minzoom: 0,
              maxzoom: 22
            }
          ]
        }}
      >
        <NavigationControl position="top-right" />
        
        {/* Reverse Geocoding Popup */}
        {clickedLocation && (
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-zinc-900 border border-zinc-800 text-zinc-50 px-5 py-4 rounded-xl shadow-2xl max-w-[450px] min-w-[300px] text-center flex flex-col gap-1 items-center transition-all animate-in fade-in slide-in-from-bottom-4 duration-300">
            {clickedLocation.isLoading ? (
              <div className="flex items-center gap-2 mb-1">
                <div className="spinner" style={{ width: 14, height: 14, borderWidth: 1.5 }}></div>
                <span className="text-sm font-medium text-zinc-300">{clickedLocation.name}</span>
              </div>
            ) : (
              <span className="text-sm font-medium text-zinc-100">{clickedLocation.name}</span>
            )}
            <span className="text-[11px] text-zinc-500 font-mono mt-1 tracking-wider bg-zinc-800 px-2 py-0.5 rounded-sm">
              LAT: {clickedLocation.lat.toFixed(5)}, LNG: {clickedLocation.lng.toFixed(5)}
            </span>
            <button 
              onClick={(e) => { e.stopPropagation(); setClickedLocation(null); }}
              className="absolute top-2 right-2 p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Visual Map Pin */}
        {clickedLocation && !clickedLocation.isLoading && (
          <Marker longitude={clickedLocation.lng} latitude={clickedLocation.lat} anchor="bottom">
            <svg className="w-8 h-8 text-emerald-500 drop-shadow-xl animate-in zoom-in-50 duration-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </Marker>
        )}

        {/* Render Search Results as red bounding boxes */}
        {searchResults.length > 0 && (
          <Source type="geojson" data={geojsonData as any}>
            <Layer 
              id="search-results-fill" 
              type="fill" 
              paint={{
                'fill-color': [
                  'case',
                  ['==', ['get', 'id'], activeResultIndex ?? -1],
                  '#fbbf24', // amber-400
                  '#ef4444' // red-500
                ],
                'fill-opacity': [
                  'case',
                  ['==', ['get', 'id'], activeResultIndex ?? -1],
                  0.6,
                  0.3
                ]
              }} 
            />
            <Layer 
              id="search-results-line" 
              type="line" 
              paint={{
                'line-color': [
                  'case',
                  ['==', ['get', 'id'], activeResultIndex ?? -1],
                  '#f59e0b', // amber-500
                  '#ef4444' // red-500
                ],
                'line-width': [
                  'case',
                  ['==', ['get', 'id'], activeResultIndex ?? -1],
                  4,
                  2
                ]
              }} 
            />
          </Source>
        )}

        {/* Render Region Numbers as HTML Markers to avoid glyph dependencies */}
        {searchResults.map((res, index) => {
          if (!res || !res.bbox || res.bbox.length !== 4) return null;
          
          const [min_lon, min_lat, max_lon, max_lat] = res.bbox;
          const marker_lon = min_lon + (max_lon - min_lon) * 0.25;
          const marker_lat = min_lat + (max_lat - min_lat) * 0.75;
          const isActive = index === activeResultIndex;
          
          return (
            <Marker key={`search-marker-${index}`} longitude={marker_lon} latitude={marker_lat} anchor="center" style={{ zIndex: isActive ? 10 : 1 }}>
              <div className={`flex items-center justify-center w-6 h-6 text-white text-xs font-bold rounded-full shadow-lg border border-white transition-all duration-300 ${isActive ? 'bg-amber-500 scale-125' : 'bg-red-500'}`}>
                {index + 1}
              </div>
            </Marker>
          );
        })}

        {/* Render Change Detection Results as orange bounding boxes */}
        {changeResults.length > 0 && (
          <Source type="geojson" data={changeGeojsonData as any}>
            <Layer 
              id="change-results-fill" 
              type="fill" 
              paint={{
                'fill-color': '#f97316', // Tailwind orange-500
                'fill-opacity': 0.4
              }} 
            />
            <Layer 
              id="change-results-line" 
              type="line" 
              paint={{
                'line-color': '#ea580c', // Tailwind orange-600
                'line-width': 2
              }} 
            />
          </Source>
        )}
      </Map>
    </div>
  );
}

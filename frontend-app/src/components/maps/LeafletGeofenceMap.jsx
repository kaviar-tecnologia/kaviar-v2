import React, { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clearActiveLayer } from './leafletLayerUtils';

const DEFAULT_CENTER = { lat: -22.9068, lng: -43.1729 };

function toLatLng(center) {
  const lat = Number(center?.lat);
  const lng = Number(center?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng];
  }
  return [lat, lng];
}

function isPolygonGeometry(geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates?.[0];
    return Array.isArray(ring) && ring.length >= 3;
  }
  if (geometry.type === 'MultiPolygon') {
    const ring = geometry.coordinates?.[0]?.[0];
    return Array.isArray(ring) && ring.length >= 3;
  }
  return false;
}

const LeafletGeofenceMap = ({
  geometry = null,
  referenceCenter = DEFAULT_CENTER,
  zoom = 11,
  noGeofence = false,
  selectedAreaId = null,
  isVisible = true,
  height = 420,
  communities = [],
  selectedCommunity = null
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const activeLayerRef = useRef(null);

  const fallbackCenter = selectedCommunity?.centerLat && selectedCommunity?.centerLng
    ? { lat: Number(selectedCommunity.centerLat), lng: Number(selectedCommunity.centerLng) }
    : referenceCenter;

  const fallbackGeometry = selectedCommunity?.geometry || null;
  const effectiveGeometry = geometry || fallbackGeometry;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const [lat, lng] = toLatLng(fallbackCenter);
    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom,
      zoomControl: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;

    return () => {
      clearActiveLayer(map, activeLayerRef);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !mapRef.current) return;
    const timer = setTimeout(() => {
      mapRef.current?.invalidateSize();
    }, 80);
    return () => clearTimeout(timer);
  }, [isVisible, selectedAreaId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clearActiveLayer(map, activeLayerRef);

    const [lat, lng] = toLatLng(fallbackCenter);

    if (!noGeofence && isPolygonGeometry(effectiveGeometry)) {
      const layer = L.geoJSON(effectiveGeometry, {
        style: { color: '#2196f3', weight: 2, fillOpacity: 0.2 }
      }).addTo(map);
      activeLayerRef.current = layer;

      const bounds = layer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
      return;
    }

    map.setView([lat, lng], zoom);
    activeLayerRef.current = L.circleMarker([lat, lng], {
      radius: 6,
      color: '#2563EB',
      fillColor: '#2563EB',
      fillOpacity: 0.75
    }).addTo(map);
  }, [effectiveGeometry, fallbackCenter?.lat, fallbackCenter?.lng, noGeofence, selectedAreaId, zoom]);

  return (
    <Box sx={{ height, width: '100%', position: 'relative' }}>
      <div
        ref={containerRef}
        style={{
          height: '100%',
          width: '100%',
          borderRadius: '4px',
          minHeight: `${height}px`
        }}
      />
    </Box>
  );
};

export default LeafletGeofenceMap;

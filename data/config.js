// config.js - Configuracion del Geoportal Megalopolis
// Zonas Prioritarias de Reforestacion y Restauracion Ecologica

window.__CONFIG = {
    "BASE_LAYERS": {
        "osm": {
            "attribution": "&copy; OpenStreetMap | Edgar: <a href=\"mailto:jhonson2490@gmail.com\" style=\"color:#1b4d3e;font-weight:600;\">jhonson2490@gmail.com</a>",
            "label": "OpenStreetMap",
            "type": "osm"
        },
        "satellite": {
            "attribution": "Esri World Imagery | Edgar: <a href=\"mailto:jhonson2490@gmail.com\" style=\"color:#1b4d3e;font-weight:600;\">jhonson2490@gmail.com</a>",
            "label": "Satélite (Esri)",
            "type": "xyz",
            "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            "minZoom": 6,
            "maxZoom": 18
        },
        "topo": {
            "attribution": "Esri World Topographic | Edgar: <a href=\"mailto:jhonson2490@gmail.com\" style=\"color:#1b4d3e;font-weight:600;\">jhonson2490@gmail.com</a>",
            "label": "Topográfico (Esri)",
            "type": "xyz",
            "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
            "minZoom": 6,
            "maxZoom": 18
        }
    },
    "CENTER": [-98.6121, 19.7495],
    "DEFAULT_BASE_LAYERS": [
        "satellite"
    ],
    "EXTENTS": {
        "megalopolis": [
            -100.6253,
            17.8126,
            -96.5990,
            21.6864
        ]
    },
    "MAX_ZOOM": 18,
    "MIN_ZOOM": 6,
    "OVERLAY_LAYERS": {
        "estados": {
            "color": "#ffffff",
            "label": "Límites Estatales (Megalópolis)",
            "url": "./data/estados_megalopolis.geojson",
            "visible": true
        },
        "municipios": {
            "color": "#94a3b8",
            "label": "Límites Municipales (Megalópolis)",
            "url": "./data/municipios_megalopolis.geojson",
            "visible": true
        },
        "zonas_prioritarias": {
            "color": "#e63946",
            "label": "Zonas Prioritarias de Reforestación",
            "url": "./data/zonas_prioritarias.geojson",
            "visible": true
        }
    },
    "ZOOM": 8.2
};

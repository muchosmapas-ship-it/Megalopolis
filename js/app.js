    const customAttribution = `Esri World Imagery | Edgar: <a href="mailto:jhonson2490@gmail.com" target="_blank" style="color:#1b4d3e;font-weight:600;">jhonson2490@gmail.com</a>`;
// app.js - Visor estatico del Geoportal Chapultepec
// OpenLayers 3 + Bootstrap 5, sin build step, sin backend.

(function () {
    'use strict';

    const priorityStyles = {
        1: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(217, 4, 41, 0.68)' }),
            stroke: new ol.style.Stroke({ color: '#7a0010', width: 1.3 })
        }),
        2: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(247, 127, 0, 0.68)' }),
            stroke: new ol.style.Stroke({ color: '#994400', width: 1.3 })
        }),
        3: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(252, 191, 73, 0.68)' }),
            stroke: new ol.style.Stroke({ color: '#b38600', width: 1.3 })
        }),
        4: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(42, 157, 143, 0.68)' }),
            stroke: new ol.style.Stroke({ color: '#13544d', width: 1.3 })
        })
    };
    const defaultPolyStyle = new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(52, 152, 219, 0.50)' }),
        stroke: new ol.style.Stroke({ color: '#2980b9', width: 1.2 })
    });
    const estadosStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 2.2 })
    });
    const municipiosStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({ color: 'rgba(148, 163, 184, 0.70)', width: 0.9, lineDash: [3, 3] })
    });


    const CFG = window.__CONFIG;
    const map = window.__map = new ol.Map({
        target: 'map',
        layers: [],
        view: new ol.View({
            projection: 'EPSG:3857',
            center: ol.proj.fromLonLat(CFG.CENTER),
            zoom: CFG.ZOOM,
            minZoom: CFG.MIN_ZOOM,
            maxZoom: CFG.MAX_ZOOM
        }),
        controls: ol.control.defaults({ attribution: false }).extend([
            new ol.control.Attribution({
                collapsible: true,
                collapsed: true
            })
        ])
            .extend([new ol.control.ScaleLine()])
            .extend([new ol.control.MousePosition({
                coordinateFormat: ol.coordinate.createStringXY(5),
                projection: 'EPSG:4326'
            })])
    });
    console.log('[visor] iniciando');

    // Centrado inteligente para visualizar todo el ortomosaico de Chapultepec (Secciones 1 a 4)
    function fitWholeChapultepec(duration = 0) {
        const ext = ol.proj.transformExtent(
            CFG.EXTENTS?.megalopolis || [-100.6253, 17.8126, -96.5990, 21.6864],
            'EPSG:4326',
            'EPSG:3857'
        );
        const sidebarEl = document.querySelector('.visor-sidebar');
        const padLeft = (sidebarEl && sidebarEl.offsetWidth > 0) ? sidebarEl.offsetWidth + 30 : 40;
        map.getView().fit(ext, {
            padding: [30, 40, 30, padLeft],
            duration: duration
        });
    }

    setTimeout(() => fitWholeChapultepec(0), 100);
    setTimeout(() => fitWholeChapultepec(0), 600);
    document.getElementById('btn-center-ortho')?.addEventListener('click', () => fitWholeChapultepec(600));

    // =====================================================================
    // CAPAS BASE: orden de render y conmutacion inteligente 50cm <-> 5cm
    //   - OSM primero (queda al fondo, zIndex=1)
    //   - Overview (50cm/px, zIndex=10, activo en zoom < 17.5)
    //   - Detalle (5cm/px, zIndex=20, activo en zoom >= 17.5)
    // =====================================================================
    const baseLayers = {};
    const userEnabledBases = {};
    const defaultList = CFG.DEFAULT_BASE_LAYERS || ['osm'];

    for (const [name, info] of Object.entries(CFG.BASE_LAYERS)) {
        let source;
        let zIndex = 1;
        if (info.type === 'osm') {
            source = new ol.source.OSM({ attributions: [customAttribution] });
            zIndex = 1;
        } else if (info.type === 'xyz') {
            source = new ol.source.XYZ({
                url: info.url,
                minZoom: info.minZoom || 1,
                maxZoom: info.maxZoom || 19,
                attributions: info.attribution ? [info.attribution] : [customAttribution]
            });
            zIndex = (name === 'satellite') ? 2 : 3;
        }
        const layer = new ol.layer.Tile({ source, zIndex });
        layer.set('name', name);
        const isDef = defaultList.includes(name);
        userEnabledBases[name] = isDef;
        layer.setVisible(isDef);
        baseLayers[name] = layer;
        map.addLayer(layer);
    }

    function toggleBase(name, on) {
        userEnabledBases[name] = on;
        if (baseLayers[name]) {
            baseLayers[name].setVisible(on);
        }
    }

    function setAllBases(on) {
        for (const k of Object.keys(userEnabledBases)) {
            userEnabledBases[k] = on;
            if (baseLayers[k]) baseLayers[k].setVisible(on);
        }
        document.querySelectorAll('input[id^=base-]').forEach(c => c.checked = on);
    }

    // =====================================================================
    // OVERLAYS: Zonas Prioritarias, Municipios y Estados
    // =====================================================================
    const overlays = {};
    for (const [name, info] of Object.entries(CFG.OVERLAY_LAYERS)) {
        if (name === 'arboles') {
            loadArbolesCluster(info);
        } else {
            fetch(info.url)
                .then(r => {
                    if (!r.ok) return Promise.reject('HTTP ' + r.status);
                    return r.json();
                })
                .then(data => {
                    if (!data || !data.features) {
                        console.warn(`[visor] ${name}: sin data/features`);
                        return;
                    }
                    // Strip CRS84 URN: OL 3.20.1 no reconoce urn:ogc:def:crs:OGC:1.3:CRS84
                    if (data.crs && data.crs.properties && /CRS84/i.test(data.crs.properties.name || '')) {
                        delete data.crs;
                    }
                    const features = new ol.format.GeoJSON().readFeatures(data, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:3857'
                    });
                    if (features.length === 0) {
                        console.warn(`[visor] ${name}: 0 features leidas`);
                        return;
                    }

                    let layerStyle;
                    let zIndex = 50;
                    if (name === 'estados') {
                        layerStyle = estadosStyle;
                        zIndex = 30;
                    } else if (name === 'municipios') {
                        layerStyle = municipiosStyle;
                        zIndex = 20;
                    } else {
                        layerStyle = (feature, resolution) => {
                            const nivel = feature.get('NIVEL_INTEG');
                            return priorityStyles[nivel] || defaultPolyStyle;
                        };
                        zIndex = 50;
                    }

                    const layer = new ol.layer.Vector({
                        source: new ol.source.Vector({ features }),
                        style: layerStyle,
                        renderMode: 'image', // Renderizado de alto rendimiento offscreen canvas
                        zIndex: zIndex
                    });
                    layer.set('name', name);
                    layer.setVisible(info.visible !== false);
                    map.addLayer(layer);
                    overlays[name] = { layer, info, features };
                    renderLayersPanel();
                })
                .catch(e => {
                    console.error(`[visor] overlay ${name} no cargado:`, e);
                    const err = document.getElementById('arboles-status');
                    if (err) err.textContent = `Error cargando ${name}: ${e && e.message ? e.message : e}`;
                });
        }
    }

    // ----- Capa de arboles con cluster -----
    function loadArbolesCluster(info) {
        const stats = document.getElementById('arboles-status');
        if (stats) stats.textContent = 'Cargando 67,475 arboles...';
        fetch(info.url)
            .then(r => r.ok ? r.json() : Promise.reject('HTTP ' + r.status))
            .then(data => {
                if (!data || !data.features) return;
                if (data.crs && data.crs.properties && /CRS84/i.test(data.crs.properties.name || '')) {
                    delete data.crs;
                }
                const features = new ol.format.GeoJSON().readFeatures(data, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
                const vectorSource = new ol.source.Vector({ features });
                const clusterSource = new ol.source.Cluster({
                    distance: info.clusterDistance || 50,
                    source: vectorSource,
                });
                const layer = new ol.layer.Vector({
                    source: clusterSource,
                    style: clusterStyle,
                    zIndex: 101  // Encima de subzonas (zIndex=100)
                });
                layer.set('name', 'arboles');
                layer.setVisible(info.visible !== false);
                map.addLayer(layer);
                overlays['arboles'] = {
                    layer, info, features,
                    rawCount: features.length
                };
                renderLayersPanel();
                if (stats) stats.textContent = `Cargados: ${features.length.toLocaleString()} arboles`;
            })
            .catch(e => {
                console.error('[visor] arboles no cargado:', e);
                if (stats) stats.textContent = `ERROR: ${e && e.message ? e.message : e}`;
            });
    }

    function clusterStyle(feature) {
        const features = feature.get('features') || [];
        const size = features.length;

        // Si la concentracion es de 1 a 20 arboles, mostrar TODOS los puntos individuales
        if (size <= 20) {
            const styles = [];
            for (let i = 0; i < size; i++) {
                const geom = features[i].getGeometry();
                if (geom) {
                    styles.push(new ol.style.Style({
                        geometry: geom,
                        image: new ol.style.Circle({
                            radius: 5,
                            fill: new ol.style.Fill({ color: '#2e7d32' }), // Verde bosque intenso
                            stroke: new ol.style.Stroke({ color: '#ffffff', width: 1.5 })
                        })
                    }));
                }
            }
            return styles;
        }

        // Para concentraciones mayores a 20 (>20), mostrar agrupacion graduada por color
        let color, radius, textColor;
        if (size <= 100) {
            color = 'rgba(255, 193, 7, 0.90)';   // Amarillo / ?mbar (21-100)
            radius = 13;
            textColor = '#212529';
        } else if (size <= 500) {
            color = 'rgba(255, 152, 0, 0.92)';   // Naranja C?lido (101-500)
            radius = 16;
            textColor = '#ffffff';
        } else if (size <= 1500) {
            color = 'rgba(244, 67, 54, 0.95)';   // Rojo Coral (501-1500)
            radius = 20;
            textColor = '#ffffff';
        } else {
            color = 'rgba(183, 28, 28, 0.96)';  // Rojo Carm?n Oscuro (>1500)
            radius = 24;
            textColor = '#ffffff';
        }

        const labelText = size > 999 ? (size / 1000).toFixed(1) + 'k' : size.toString();

        return new ol.style.Style({
            image: new ol.style.Circle({
                radius: radius,
                fill: new ol.style.Fill({ color: color }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
            }),
            text: new ol.style.Text({
                text: labelText,
                fill: new ol.style.Fill({ color: textColor }),
                font: size > 999 ? 'bold 11px sans-serif' : (radius > 15 ? 'bold 12px sans-serif' : '11px sans-serif')
            })
        });
    }

    // =====================================================================
    // CAPA DE HIGHLIGHT (resaltado amarillo) - sincronizada con la tabla
    // =====================================================================
    const highlightSource = new ol.source.Vector();
    const highlightLayer = new ol.layer.Vector({
        source: highlightSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(0, 150, 255, 0.45)' }),  // Azul brillante translúcido
            stroke: new ol.style.Stroke({ color: '#0066ff', width: 3.5 }),   // Borde azul eléctrico
            image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: 'rgba(0, 150, 255, 0.70)' }),
                stroke: new ol.style.Stroke({ color: '#0044cc', width: 3 })
            })
        }),
        zIndex: 250  // Por encima de todas las demás capas
    });
    map.addLayer(highlightLayer);

    // Feature actualmente seleccionada: { feature, layerName, sourceId }
    let currentSelection = null;

    function clearHighlight() {
        highlightSource.clear();
        // Quitar clase selected de TODAS las filas de tabla
        document.querySelectorAll('.attr-table tr.attr-selected').forEach(r => r.classList.remove('attr-selected'));
        currentSelection = null;
    }

    function highlightFeature(feature, layerName, sourceId) {
        clearHighlight();
        if (!feature) return;
        // Clonar la feature para que tenga su propia referencia
        let geom;
        if (feature.getGeometry) {
            geom = feature.getGeometry();
        } else if (feature.geometry) {
            geom = new ol.format.GeoJSON().readGeometry(feature.geometry);
        }
        if (!geom) return;
        const highlightFeat = new ol.Feature({ geometry: geom });
        // Copiar propiedades (util para popup/info-panel)
        const props = feature.getProperties ? feature.getProperties() : (feature.properties || {});
        Object.keys(props).forEach(k => {
            if (k !== 'geometry') highlightFeat.set(k, props[k]);
        });
        highlightSource.addFeature(highlightFeat);
        currentSelection = { feature, layerName, sourceId, highlightedFeature: highlightFeat };
        // Si la tabla del bottom panel esta abierta y el feature esta en la lista, marcar su fila
        syncTableSelection(sourceId);
    }

    function syncTableSelection(sourceId) {
        if (!bottomPanelState.open) return;
        if (bottomPanelState.layerName !== sourceId && currentSelection?.layerName !== sourceId) return;
        const wrap = document.getElementById('attr-panel-wrap');
        if (!wrap) return;
        const rows = wrap.querySelectorAll('tbody tr');
        rows.forEach(tr => {
            const fidx = parseInt(tr.dataset.fidx);
            const f = filteredFor(bottomPanelState)[fidx];
            const isCurrent = f && currentSelection &&
                JSON.stringify(f.getGeometry ? f.getGeometry().getCoordinates() : null) ===
                JSON.stringify(currentSelection.feature.getGeometry ? currentSelection.feature.getGeometry().getCoordinates() : null);
            if (isCurrent) {
                tr.classList.add('attr-selected');
                tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    // (clusterStyle eliminado: ya no se usa con heatmap)

    // =====================================================================
    // SIDEBAR: capas base (checkbox), overlays (checkbox), bulk ON/OFF
    // =====================================================================
        function renderLayersPanel() {
        const basePanel = document.getElementById('base-panel');
        if (basePanel) {
            basePanel.innerHTML = `
                <div class="mb-1">
                    <small class="text-muted fw-semibold">Mapas base:</small>
                </div>
                ${Object.entries(CFG.BASE_LAYERS).map(([name, info]) => `
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="base-${name}" ${userEnabledBases[name] ? 'checked' : ''}>
                        <label class="form-check-label" for="base-${name}" style="font-size:0.85rem;cursor:pointer">${escapeHtml(info.label)}</label>
                    </div>
                `).join('')}
            `;
            basePanel.querySelectorAll('input[id^=base-]').forEach(c => {
                c.addEventListener('change', e => toggleBase(e.target.id.replace('base-',''), e.target.checked));
            });
        }
const ovPanel = document.getElementById('overlay-panel');
        if (ovPanel) {
            ovPanel.innerHTML = `
                <div class="mb-1">
                    <small class="text-muted fw-semibold">Capas superpuestas:</small>
                </div>
                
                ${Object.entries(CFG.OVERLAY_LAYERS).map(([name, info]) => `
                    <div class="d-flex align-items-center justify-content-between my-1 p-1 rounded border-bottom" style="background:rgba(255,255,255,0.7)">
                        <div class="form-check mb-0 me-2">
                            <input class="form-check-input" type="checkbox" id="ov-${name}" ${overlays[name]?.layer.getVisible() ? 'checked' : ''}>
                            <label class="form-check-label fw-semibold" for="ov-${name}" style="font-size:0.85rem;cursor:pointer" data-layer-type="overlay" data-layer-name="${name}" title="Click derecho para opciones">${escapeHtml(info.label)}</label>
                        </div>
                        <button class="btn btn-sm btn-outline-primary py-0 px-2 btn-open-table" data-layer="${name}" title="Ver tabla de atributos de ${escapeHtml(info.label)}">
                            📊 Tabla
                        </button>
                    </div>
                    ` + (name === 'arboles' ? `<div class="mt-1 mb-2 p-2 rounded border p-2" style="font-size:10px; line-height: 1.2;">
                        <div style="font-weight: bold; margin-bottom: 4px; color: #333;">Concentración de árboles:</div>
                        <div class="d-flex align-items-center justify-content-between text-center">
                            <div><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#2e7d32;border:1px solid #fff;"></span><br><span style="font-size:9px;color:#555;">1-20</span></div>
                            <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:rgba(255, 193, 7, 0.9);border:1px solid #fff;"></span><br><span style="font-size:9px;color:#555;">21-100</span></div>
                            <div><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:rgba(255, 152, 0, 0.9);border:1px solid #fff;"></span><br><span style="font-size:9px;color:#555;">101-500</span></div>
                            <div><span style="display:inline-block;width:15px;height:15px;border-radius:50%;background:rgba(244, 67, 54, 0.9);border:1px solid #fff;"></span><br><span style="font-size:9px;color:#555;">501-1.5k</span></div>
                            <div><span style="display:inline-block;width:16px;height:16px;border-radius:50%;background:rgba(183, 28, 28, 0.96);border:1px solid #fff;"></span><br><span style="font-size:9px;color:#555;">&gt;1.5k</span></div>
                        </div>
                    </div>` : '')).join('')}
            `;
            ovPanel.querySelectorAll('input[id^=ov-]').forEach(c => {
                c.addEventListener('change', e => {
                    const name = c.id.replace('ov-', '');
                    const o = overlays[name];
                    if (o) o.layer.setVisible(e.target.checked);
                });
            });
            ovPanel.querySelectorAll('.btn-open-table').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const layerName = btn.dataset.layer;
                    openBottomPanel(layerName);
                });
            });
            document.getElementById('ovs-all-on')?.addEventListener('click', () => {
                for (const [n, o] of Object.entries(overlays)) {
                    o.layer.setVisible(true);
                }
                ovPanel.querySelectorAll('input[id^=ov-]').forEach(c => c.checked = true);
            });
            document.getElementById('ovs-all-off')?.addEventListener('click', () => {
                for (const [n, o] of Object.entries(overlays)) {
                    o.layer.setVisible(false);
                }
                ovPanel.querySelectorAll('input[id^=ov-]').forEach(c => c.checked = false);
            });
        }

        document.querySelectorAll('[data-layer-name]').forEach(el => {
            el.addEventListener('contextmenu', e => {
                e.preventDefault();
                const type = el.dataset.layerType || 'overlay';
                const name = el.dataset.layerName;
                showLayerContextMenu(e, type, name);
            });
        });
    }
    // Renderizar paneles de capas inmediatamente al inicio
    renderLayersPanel();

    let activeContextMenu = null;
    function hideContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }
    document.addEventListener('click', hideContextMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideContextMenu(); });

    function showLayerContextMenu(evt, type, name) {
        hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'layer-context-menu';
        const isOverlay = type === 'overlay';
        const labelName = isOverlay
            ? (CFG.OVERLAY_LAYERS[name]?.label || name)
            : (CFG.BASE_LAYERS[name]?.label || name);
        menu.innerHTML = `
            <div class="layer-ctx-header">${escapeHtml(labelName)}</div>
            ${isOverlay
                ? `<button data-action="table">Ver tabla de atributos</button>`
                : `<button data-action="info" disabled style="opacity:.5;cursor:not-allowed">Sin atributos (raster)</button>`
            }
            <button data-action="zoom">Zoom al extent</button>
            <button data-action="toggle">${isOverlay ? 'Alternar visibilidad' : 'Alternar'}</button>
        `;
        // Posicion cerca del click pero dentro del viewport
        let x = evt.clientX;
        let y = evt.clientY;
        menu.style.position = 'fixed';
        menu.style.left = '0px';
        menu.style.top = '0px';
        document.body.appendChild(menu);
        const r = menu.getBoundingClientRect();
        if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 4;
        if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 4;
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        activeContextMenu = menu;

        menu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const action = btn.dataset.action;
                hideContextMenu();
                if (action === 'table') openBottomPanel(name);
                else if (action === 'zoom') zoomToLayerExtent(name, type);
                else if (action === 'toggle') {
                    if (type === 'base') {
                        const newState = !userEnabledBases[name];
                        toggleBase(name, newState);
                        const cb = document.getElementById(`base-${name}`);
                        if (cb) cb.checked = newState;
                    } else {
                        const o = overlays[name];
                        if (o) o.layer.setVisible(!o.layer.getVisible());
                        const cb = document.getElementById(`ov-${name}`);
                        if (cb) cb.checked = o.layer.getVisible();
                    }
                }
            });
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    }

    function zoomToLayerExtent(name, type) {
        let src;
        if (type === 'overlay') {
            const o = overlays[name];
            if (!o) return;
            src = o.layer.getSource();
        } else {
            const l = baseLayers[name];
            if (!l) return;
            src = l.getSource();
        }
        // Tile sources (XYZ/OSM) no dan extent preciso, usamos el extent global
        if (src instanceof ol.source.XYZ || src instanceof ol.source.OSM) {
            fitWholeChapultepec(600);
            return;
        }
        const ext = src.getExtent && src.getExtent();
        if (ext && isFinite(ext[0])) {
            map.getView().fit(ext, { padding: [40, 40, 40, 40], maxZoom: 19, duration: 800 });
        }
    }

    // =====================================================================
    // PANEL INFERIOR: Tabla persistente de atributos
    // =====================================================================
    let bottomPanel = null;
    let bottomPanelState = { open: false, height: 280, layerName: null, allFeatures: [], cols: [], filter: '', page: 0, sortCol: null, sortDir: 1, layerColor: '#1b4d3e', layerLabel: '' };

    function openBottomPanel(layerName) {
        const o = overlays[layerName];
        if (!o) return;
        const features = o.features || [];
        if (features.length === 0) {
            alert('Esta capa no tiene features con atributos.');
            return;
        }
        const info = o.info;
        bottomPanelState.layerName = layerName;
        bottomPanelState.allFeatures = features;
        bottomPanelState.layerLabel = info.label || layerName;
        bottomPanelState.layerColor = info.color || '#1b4d3e';
        bottomPanelState.filter = '';
        bottomPanelState.page = 0;
        bottomPanelState.sortCol = null;
        bottomPanelState.sortDir = 1;

        // Detectar columnas
        const colSet = new Set();
        for (const f of features) {
            const props = f.getProperties ? f.getProperties() : (f.properties || {});
            for (const k of Object.keys(props)) {
                if (k === 'geometry') continue;
                colSet.add(k);
            }
        }
        const cols = Array.from(colSet).sort((a, b) => {
            const aKey = (a === 'id' || a === 'gid' || a === 'subzona');
            const bKey = (b === 'id' || b === 'gid' || b === 'subzona');
            if (aKey && !bKey) return -1;
            if (bKey && !aKey) return 1;
            return a.localeCompare(b);
        });
        bottomPanelState.cols = cols;

        // Crear panel si no existe
        if (!bottomPanel) {
            bottomPanel = document.createElement('div');
            bottomPanel.id = 'attr-panel';
            bottomPanel.className = 'attr-panel';
            document.body.appendChild(bottomPanel);

            // Handle de resize (drag top edge)
            const handle = document.createElement('div');
            handle.className = 'attr-panel-resize';
            handle.title = 'Arrastrar para redimensionar';
            bottomPanel.appendChild(handle);
            let dragging = false, startY = 0, startH = 0;
            handle.addEventListener('mousedown', e => {
                dragging = true;
                startY = e.clientY;
                startH = bottomPanel.offsetHeight;
                document.body.style.cursor = 'ns-resize';
                e.preventDefault();
            });
            document.addEventListener('mousemove', e => {
                if (!dragging) return;
                const dy = startY - e.clientY;
                let newH = Math.max(120, Math.min(window.innerHeight * 0.85, startH + dy));
                bottomPanel.style.height = newH + 'px';
                bottomPanelState.height = newH;
                // Re-fit map
                setTimeout(() => map.updateSize(), 0);
            });
            document.addEventListener('mouseup', () => {
                if (dragging) {
                    dragging = false;
                    document.body.style.cursor = '';
                }
            });
        }

        bottomPanel.innerHTML = `
            <div class="attr-panel-header" style="border-top:3px solid ${escapeHtml(bottomPanelState.layerColor)}">
                <div class="d-flex align-items-center">
                    <span class="attr-layer-badge" style="background:${escapeHtml(bottomPanelState.layerColor)}">${escapeHtml(bottomPanelState.layerLabel)}</span>
                    <small class="ms-3 text-white-50" id="attr-panel-count">${features.length.toLocaleString()} features</small>
                </div>
                <div class="d-flex align-items-center">
                    <div class="input-group input-group-sm me-2" style="max-width:280px">
                        <span class="input-group-text bg-white" style="padding:0 6px">🔍</span>
                        <input type="text" id="attr-panel-filter" class="form-control form-control-sm" placeholder="Filtrar en cualquier columna...">
                        <button class="btn btn-outline-secondary btn-sm" id="attr-panel-filter-clear" title="Limpiar filtro" type="button">×</button>
                    </div>
                    <div class="me-2">
                        <button class="btn btn-sm btn-outline-light" id="attr-panel-first" title="Primera página">«</button>
                        <button class="btn btn-sm btn-outline-light" id="attr-panel-prev">‹</button>
                        <span class="text-white mx-1 small" id="attr-panel-page">1/1</span>
                        <button class="btn btn-sm btn-outline-light" id="attr-panel-next">›</button>
                        <button class="btn btn-sm btn-outline-light" id="attr-panel-last" title="Última página">»</button>
                    </div>
                    <button class="btn btn-sm btn-outline-light me-2" id="attr-panel-csv" title="Descargar CSV"><span style="font-size:1.05em">⬇</span> CSV</button>
                    <button class="btn btn-sm btn-light me-2" id="attr-panel-minimize" title="Minimizar/Maximizar">▼</button>
                    <button class="btn-close btn-close-white" id="attr-panel-close" title="Cerrar panel" aria-label="Close"></button>
                </div>
            </div>
            <div id="attr-panel-wrap" class="attr-panel-wrap"></div>
        `;

        bottomPanel.style.height = bottomPanelState.height + 'px';
        bottomPanel.classList.add('open');
        bottomPanelState.open = true;
        document.body.classList.add('attr-panel-active');
        // Forzar al mapa a recalcular su tamano
        setTimeout(() => map.updateSize(), 220);

        renderPanelTable();

        // Event handlers
        document.getElementById('attr-panel-filter').addEventListener('input', e => {
            bottomPanelState.filter = e.target.value;
            bottomPanelState.page = 0;
            renderPanelTable();
        });
        document.getElementById('attr-panel-filter-clear').addEventListener('click', () => {
            document.getElementById('attr-panel-filter').value = '';
            bottomPanelState.filter = '';
            bottomPanelState.page = 0;
            renderPanelTable();
        });
        document.getElementById('attr-panel-first').addEventListener('click', () => { bottomPanelState.page = 0; renderPanelTable(); });
        document.getElementById('attr-panel-prev').addEventListener('click', () => { bottomPanelState.page--; renderPanelTable(); });
        document.getElementById('attr-panel-next').addEventListener('click', () => { bottomPanelState.page++; renderPanelTable(); });
        document.getElementById('attr-panel-last').addEventListener('click', () => {
            const st = bottomPanelState;
            const totalPages = Math.max(1, Math.ceil(filteredFor(st).length / 100));
            st.page = totalPages - 1;
            renderPanelTable();
        });
        document.getElementById('attr-panel-csv').addEventListener('click', () => {
            const st = bottomPanelState;
            exportPanelCSV(st);
        });
        document.getElementById('attr-panel-close').addEventListener('click', closeBottomPanel);
        document.getElementById('attr-panel-minimize').addEventListener('click', () => {
            const isOpen = bottomPanel.classList.contains('open');
            if (isOpen) {
                bottomPanel.classList.remove('open');
                bottomPanel.style.height = '40px';
                setTimeout(() => map.updateSize(), 220);
            } else {
                bottomPanel.classList.add('open');
                bottomPanel.style.height = bottomPanelState.height + 'px';
                setTimeout(() => map.updateSize(), 220);
            }
        });
    }

    function closeBottomPanel() {
        if (!bottomPanel) return;
        bottomPanel.classList.remove('open');
        bottomPanelState.open = false;
        document.body.classList.remove('attr-panel-active');
        setTimeout(() => map.updateSize(), 220);
    }

    function getPropsForPanel(f) {
        const props = f.getProperties ? f.getProperties() : (f.properties || {});
        const clean = {};
        for (const k of Object.keys(props)) {
            if (k === 'geometry' || k.startsWith('_')) continue;
            clean[k] = props[k];
        }
        return clean;
    }

    function filteredFor(st) {
        if (!st.filter) return st.allFeatures;
        const term = st.filter.toLowerCase();
        return st.allFeatures.filter(f => {
            const props = getPropsForPanel(f);
            return Object.values(props).some(val => {
                if (val == null) return false;
                return String(val).toLowerCase().includes(term);
            });
        });
    }

    function sortForPanel(arr) {
        const st = bottomPanelState;
        if (!st.sortCol) return arr;
        const dir = st.sortDir;
        return arr.slice().sort((a, b) => {
            let va = getPropsForPanel(a)[st.sortCol];
            let vb = getPropsForPanel(b)[st.sortCol];
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            const na = Number(va), nb = Number(vb);
            if (!isNaN(na) && !isNaN(nb)) return dir * (na - nb);
            return dir * String(va).localeCompare(String(vb));
        });
    }

    function renderPanelTable() {
        const st = bottomPanelState;
        if (!st.allFeatures) return;
        const PAGE = 100;
        let filtered = filteredFor(st);
        filtered = sortForPanel(filtered);
        const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
        if (st.page >= totalPages) st.page = totalPages - 1;
        if (st.page < 0) st.page = 0;
        const start = st.page * PAGE;
        const pageItems = filtered.slice(start, start + PAGE);

        document.getElementById('attr-panel-count').textContent =
            `${st.allFeatures.length.toLocaleString()} features${st.filter ? ' (filtrado)' : ''}`;
        document.getElementById('attr-panel-page').textContent = `${st.page + 1}/${totalPages}`;
        document.getElementById('attr-panel-first').disabled = st.page === 0;
        document.getElementById('attr-panel-prev').disabled = st.page === 0;
        document.getElementById('attr-panel-next').disabled = st.page >= totalPages - 1;
        document.getElementById('attr-panel-last').disabled = st.page >= totalPages - 1;

        let html = '<table class="attr-table"><thead><tr>';
        html += '<th class="attr-rownum">#</th>';
        for (const c of st.cols) {
            const arrow = st.sortCol === c ? (st.sortDir === 1 ? ' ▲' : ' ▼') : '';
            html += `<th class="sortable" data-col="${escapeHtml(c)}">${escapeHtml(c)}${arrow}</th>`;
        }
        html += '</tr></thead><tbody>';
        for (let i = 0; i < pageItems.length; i++) {
            const f = pageItems[i];
            const props = getPropsForPanel(f);
            const fid = f.getId ? f.getId() : ('idx-' + (start + i));
            html += `<tr data-fidx="${start + i}" data-fid="${escapeHtml(String(fid))}" title="Click para hacer zoom al feature">`;
            html += `<td class="attr-rownum">${start + i + 1}</td>`;
            for (const c of st.cols) {
                const v = props[c];
                let display, cls = '';
                if (v === null || v === undefined) {
                    display = '—';
                    cls = 'attr-null';
                } else if (typeof v === 'object') {
                    display = escapeHtml(JSON.stringify(v));
                    cls = 'attr-obj';
                } else {
                    display = escapeHtml(String(v));
                }
                html += `<td class="${cls}" title="${escapeHtml(String(v))}">${display}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        document.getElementById('attr-panel-wrap').innerHTML = html;

        // Click handlers
        document.getElementById('attr-panel-wrap').querySelectorAll('tbody tr').forEach(tr => {
            tr.addEventListener('click', () => {
                const fidx = parseInt(tr.dataset.fidx);
                const f = filtered[fidx];
                const geom = f.getGeometry ? f.getGeometry() : (f.geometry ? new ol.format.GeoJSON().readGeometry(f.geometry) : null);
                if (geom) {
                    // Marcar fila como seleccionada
                    document.querySelectorAll('.attr-table tr.attr-selected').forEach(r => r.classList.remove('attr-selected'));
                    tr.classList.add('attr-selected');
                    // Zoom al feature
                    const ext = geom.getExtent ? geom.getExtent() : ol.extent.boundingExtent([geom.getCoordinates()]);
                    if (ext && isFinite(ext[0])) {
                        map.getView().fit(ext, { padding: [80, 80, 80, 80], maxZoom: 19, duration: 500 });
                    }
                    // Resaltar en el mapa (capa highlight amarilla)
                    highlightFeature(f, st.layerName, st.layerName);
                    if (st.layerName === 'arboles') {
                        renderInfo([{ tipo: 'arbol', feature: f, source: 'arboles' }]);
                    } else if (st.layerName === 'subzonas') {
                        renderInfo([{ tipo: 'subzona', feature: f, source: 'subzonas' }]);
                    }
                }
            });
        });
        document.getElementById('attr-panel-wrap').querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (st.sortCol === col) st.sortDir = -st.sortDir;
                else { st.sortCol = col; st.sortDir = 1; }
                renderPanelTable();
            });
        });
    }

    function exportPanelCSV(st) {
        const filtered = filteredFor(st);
        const esc = v => {
            if (v === null || v === undefined) return '';
            const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
            if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
            return s;
        };
        const lines = [st.cols.map(esc).join(',')];
        for (const f of filtered) {
            const props = getPropsForPanel(f);
            lines.push(st.cols.map(c => esc(props[c])).join(','));
        }
        const csv = '\uFEFF' + lines.join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = st.layerLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // =====================================================================
    // AUTOCOMPLETADO DE BUSQUEDA
    // =====================================================================
    let searchIndex = [];
    let idxText = [];
    function rebuildIndex() {
        idxText = searchIndex.map((item, i) => ({ item, i, lc: (item.text || '').toLowerCase() }));
        console.log('[visor] search_index:', searchIndex.length);
    }
    fetch('./data/search_index.json?v=3')
        .then(r => r.ok ? r.json() : [])
        .then(d => { searchIndex = d; rebuildIndex(); })
        .catch(e => console.error('[visor] search_index error:', e));

        function setupAutocomplete() {
        const input = document.getElementById('search-input');
        const list = document.getElementById('autocomplete');
        if (!input || !list) return;

        let activeIndex = -1;

        function renderMatches(q) {
            if (!q || q.length < 1 || idxText.length === 0) {
                list.innerHTML = '';
                list.style.display = 'none';
                activeIndex = -1;
                return;
            }
            const matches = idxText
                .filter(x => x.lc.includes(q))
                .slice(0, 20)
                .map(x => x.item);

            if (matches.length === 0) {
                list.innerHTML = '<div class="p-2 text-muted small">Sin resultados coincidentes</div>';
                list.style.display = 'block';
                activeIndex = -1;
                return;
            }

            list.innerHTML = matches.map((m, i) => {
                const extra = m.filter ? ` data-filter='${escapeHtml(JSON.stringify(m.filter))}'` : '';
                const icon = m.capa === 'subzonas' ? '📍' : '🌳';
                return `<div class="autocomplete-item ${i === activeIndex ? 'active' : ''}" data-idx="${i}" data-capa="${m.capa}" data-gid="${escapeHtml(m.gid)}"${extra}>
                    <span>${icon} <strong>${escapeHtml(m.text)}</strong></span>
                    <small class="text-muted d-block" style="font-size:0.75rem;">${escapeHtml(m.label || m.capa)}</small>
                </div>`;
            }).join('');

            list.style.display = 'block';

            list.querySelectorAll('.autocomplete-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const filter = el.dataset.filter ? JSON.parse(el.dataset.filter) : null;
                    selectItem(el.dataset.capa, el.dataset.gid, filter);
                });
            });
        }

        input.addEventListener('input', () => {
            const q = input.value.toLowerCase().trim();
            renderMatches(q);
        });

        input.addEventListener('focus', () => {
            const q = input.value.toLowerCase().trim();
            if (q.length >= 1) renderMatches(q);
        });

        input.addEventListener('keydown', (e) => {
            const items = list.querySelectorAll('.autocomplete-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length > 0) {
                    activeIndex = (activeIndex + 1) % items.length;
                    items.forEach((it, idx) => it.classList.toggle('active', idx === activeIndex));
                    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length > 0) {
                    activeIndex = (activeIndex - 1 + items.length) % items.length;
                    items.forEach((it, idx) => it.classList.toggle('active', idx === activeIndex));
                    items[activeIndex]?.scrollIntoView({ block: 'nearest' });
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const target = activeIndex >= 0 && items[activeIndex] ? items[activeIndex] : items[0];
                if (target) {
                    const filter = target.dataset.filter ? JSON.parse(target.dataset.filter) : null;
                    selectItem(target.dataset.capa, target.dataset.gid, filter);
                }
            } else if (e.key === 'Escape') {
                list.innerHTML = '';
                list.style.display = 'none';
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !list.contains(e.target)) {
                list.style.display = 'none';
            }
        });
    }
    setupAutocomplete();

    function selectItem(capa, gid, filter) {
        const o = overlays[capa];
        if (!o) { console.warn('overlay', capa, 'no cargada'); return; }
        if (!o.layer.getVisible()) o.layer.setVisible(true);

        const list = document.getElementById('autocomplete');
        if (list) list.style.display = 'none';

        // Caso 1: filtro (arboles por especie / seccion / inventario)
        if (filter && typeof o.features[0]?.get === 'function') {
            const matches = o.features.filter(f => {
                for (const [k, v] of Object.entries(filter)) {
                    if (String(f.get(k) || '') !== String(v)) return false;
                }
                return true;
            });
            if (matches.length === 0) return;
            const input = document.getElementById('search-input');
            const sample = matches[0].getProperties();
            if (matches.length === 1) {
                const ext = matches[0].getGeometry().getExtent();
                map.getView().fit(ext, { padding: [80, 80, 80, 80], maxZoom: 19, duration: 800 });
                input.value = sample.inventario ? `Inv ${sample.inventario} (${sample.especie || '?'})` : (sample.especie || '');
                showTreeInfo(matches[0]);
                highlightFeature(matches[0], capa, sample.inventario);
            } else {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const f of matches) {
                    const e = f.getGeometry().getExtent();
                    if (e[0] < minX) minX = e[0];
                    if (e[1] < minY) minY = e[1];
                    if (e[2] > maxX) maxX = e[2];
                    if (e[3] > maxY) maxY = e[3];
                }
                map.getView().fit([minX, minY, maxX, maxY], { padding: [60, 60, 60, 60], maxZoom: 18, duration: 800 });
                const tipo = Object.keys(filter)[0];
                input.value = `${matches.length.toLocaleString()} ${tipo === 'especie' ? sample.especie : tipo === 'seccion_bosque' ? 'árboles en ' + sample.seccion_bosque : 'árboles'}`;
                openBottomPanel('arboles');
                const val = sample[tipo] || '';
                if (val) {
                    bottomPanelState.filter = val;
                    const filterInput = document.getElementById('attr-panel-filter');
                    if (filterInput) filterInput.value = val;
                    bottomPanelState.page = 0;
                    renderPanelTable();
                }
            }
            return;
        }

        // Caso 2: subzona (gid = subzona)
        const key = String(gid).trim().toLowerCase();
        const feat = o.features.find(f => {
            const sz = String(f.get('subzona') || '').trim().toLowerCase();
            const id = String(f.get('gid') || f.get('id') || '').trim().toLowerCase();
            const nm = String(f.get('nombre') || '').trim().toLowerCase();
            return sz === key || id === key || nm === key || (key.length > 2 && nm.includes(key));
        });
        if (feat) {
            const ext = feat.getGeometry().getExtent();
            map.getView().fit(ext, { padding: [60, 60, 60, 60], maxZoom: 17, duration: 800 });
            const input = document.getElementById('search-input');
            input.value = (feat.get('subzona') || '') + ' ' + (feat.get('nombre') || '');
            showSubzonaInfo(feat);
            highlightFeature(feat, capa, key);
        } else {
            console.warn(`[visor] feature ${capa}/${gid} no encontrado`);
        }
    }

    // =====================================================================
    // SELECCIÓN AL HACER CLIC EN EL MAPA (DESTACADO EN AZUL Y FICHA TÉCNICA)
    // =====================================================================
    map.on('click', evt => {
        let selectedFeature = null;
        let selectedLayerName = null;

        // 1. Prioridad: Buscar primero en zonas_prioritarias si la capa está visible
        const ovZonas = overlays['zonas_prioritarias'];
        if (ovZonas && ovZonas.layer && ovZonas.layer.getVisible()) {
            map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                if (layer === ovZonas.layer) {
                    selectedFeature = f;
                    selectedLayerName = 'zonas_prioritarias';
                    return true;
                }
            }, { hitTolerance: 6 });
        }

        // 2. Si no se tocó una zona prioritaria, buscar en municipios
        if (!selectedFeature) {
            const ovMuni = overlays['municipios'];
            if (ovMuni && ovMuni.layer && ovMuni.layer.getVisible()) {
                map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                    if (layer === ovMuni.layer) {
                        selectedFeature = f;
                        selectedLayerName = 'municipios';
                        return true;
                    }
                }, { hitTolerance: 4 });
            }
        }

        // 3. Si no se tocó municipio, buscar en estados
        if (!selectedFeature) {
            const ovEdo = overlays['estados'];
            if (ovEdo && ovEdo.layer && ovEdo.layer.getVisible()) {
                map.forEachFeatureAtPixel(evt.pixel, (f, layer) => {
                    if (layer === ovEdo.layer) {
                        selectedFeature = f;
                        selectedLayerName = 'estados';
                        return true;
                    }
                }, { hitTolerance: 4 });
            }
        }

        // 4. Si el clic fue en un área vacía (sin polígonos)
        if (!selectedFeature) {
            clearHighlight();
            const sideFicha = document.getElementById('sideFichaContent');
            if (sideFicha) {
                sideFicha.innerHTML = `
                    <div class="p-3 text-center text-muted" style="background:rgba(255,255,255,0.02); border-radius:8px;">
                        <span style="font-size:2rem;">🗺️</span>
                        <p class="small mt-2 mb-0">Haz clic sobre cualquier polígono en el mapa para consultar su ficha técnica y prescripción silvícola.</p>
                    </div>`;
            }
            return;
        }

        // 5. Destacar en color AZUL en el mapa
        highlightFeature(selectedFeature, selectedLayerName, 'click');

        // 6. EN FICHA TÉCNICA SOLO APARECE LO QUE ESTÁ SELECCIONADO (un único elemento)
        let htmlCard = '';
        if (selectedLayerName === 'zonas_prioritarias' || selectedFeature.get('NIVEL_INTEG')) {
            htmlCard = subzonaCard(selectedFeature);
        } else if (selectedLayerName === 'municipios' || selectedFeature.get('CVEGEO')) {
            const p = selectedFeature.getProperties();
            htmlCard = `
            <div class="p-3 rounded mb-2" style="background:#14242d; border-left:4px solid #0066ff; border: 1px solid rgba(255,255,255,0.08);">
                <div style="font-size:0.92rem; font-weight:700; color:#38bdf8;">🏛️ Municipio Seleccionado</div>
                <div style="font-size:1.05rem; font-weight:700; color:#ffffff; margin: 4px 0;">${escape(p.NOMGEO || '')}</div>
                <div class="text-white-50 small mb-2"><strong>Entidad:</strong> ${escape(p.NOM_ENT || '')}</div>
                <div class="text-muted" style="font-size:0.75rem;"><strong>Clave GEO:</strong> ${escape(p.CVEGEO || '')}</div>
            </div>`;
        } else if (selectedLayerName === 'estados' || selectedFeature.get('NOM_ENT')) {
            const p = selectedFeature.getProperties();
            htmlCard = `
            <div class="p-3 rounded mb-2" style="background:#14242d; border-left:4px solid #0066ff; border: 1px solid rgba(255,255,255,0.08);">
                <div style="font-size:0.92rem; font-weight:700; color:#38bdf8;">🗺️ Estado Seleccionado</div>
                <div style="font-size:1.1rem; font-weight:700; color:#ffffff; margin: 4px 0;">${escape(p.NOM_ENT || '')}</div>
                <div class="text-muted" style="font-size:0.75rem;"><strong>Superficie Estatal:</strong> ${p.AREA_HA ? Number(p.AREA_HA).toLocaleString() + ' ha' : '--'}</div>
            </div>`;
        }

        const sideFicha = document.getElementById('sideFichaContent');
        if (sideFicha) {
            sideFicha.innerHTML = htmlCard;
        }

        // Activar la pestaña de Ficha Técnica
        document.getElementById('tab-btn-ficha')?.click();
        const badgeFicha = document.getElementById('ficha-badge');
        if (badgeFicha) badgeFicha.classList.remove('d-none');

        // Desplegar el dashboard lateral si estaba colapsado para ver la ficha
        const dashSidebar = document.getElementById('dashboard-sidebar');
        if (dashSidebar && dashSidebar.classList.contains('collapsed')) {
            dashSidebar.classList.remove('collapsed');
            setTimeout(() => map.updateSize(), 260);
        }

        // Sincronizar con la tabla del panel inferior únicamente si ya está abierta
        if (bottomPanelState.open) {
            syncSelectionWithPanel([{ feature: selectedFeature, source: selectedLayerName }]);
        }
    });

    // Encuentra el feature del click en la lista filtrada del bottom panel,
    // lo selecciona (fila amarilla) y hace highlight en el mapa ÚNICAMENTE si la tabla ya está abierta.
    // No abre la tabla automáticamente al hacer clic en el mapa.
    function syncSelectionWithPanel(hits) {
        if (!hits || hits.length === 0) return;
        // Si el panel de atributos está cerrado, no hacer nada (no abrirlo automáticamente)
        if (!bottomPanelState.open) return;

        for (const h of hits) {
            const layerName = h.source || 'zonas_prioritarias';
            if (!layerName || bottomPanelState.layerName !== layerName) continue;

            const f = h.feature;
            if (!f) continue;

            const filtered = filteredFor(bottomPanelState);
            let targetIdx = -1;

            // 1. Coincidencia por referencia de objeto exacto
            for (let i = 0; i < filtered.length; i++) {
                if (filtered[i] === f) {
                    targetIdx = i;
                    break;
                }
            }

            // 2. Coincidencia por ID (getId())
            if (targetIdx === -1) {
                const targetFid = f.getId ? f.getId() : null;
                if (targetFid !== null && targetFid !== undefined && targetFid !== '') {
                    for (let i = 0; i < filtered.length; i++) {
                        if (filtered[i].getId && String(filtered[i].getId()) === String(targetFid)) {
                            targetIdx = i;
                            break;
                        }
                    }
                }
            }

            // 3. Coincidencia por clave de propiedad (inventario, gid, id, subzona)
            if (targetIdx === -1) {
                const propsF = f.getProperties ? f.getProperties() : (f.properties || {});
                const keyF = propsF.inventario || propsF.gid || propsF.id || propsF.subzona;
                if (keyF != null && keyF !== '') {
                    for (let i = 0; i < filtered.length; i++) {
                        const p = filtered[i].getProperties ? filtered[i].getProperties() : (filtered[i].properties || {});
                        const keyI = p.inventario || p.gid || p.id || p.subzona;
                        if (keyI != null && String(keyI) === String(keyF)) {
                            targetIdx = i;
                            break;
                        }
                    }
                }
            }

            // 4. Coincidencia por geometria
            if (targetIdx === -1) {
                for (let i = 0; i < filtered.length; i++) {
                    if (featuresMatch(filtered[i], f)) {
                        targetIdx = i;
                        break;
                    }
                }
            }

            if (targetIdx === -1) continue;

            // Navegar a la pagina que contiene el elemento
            const PAGE = 100;
            const targetPage = Math.floor(targetIdx / PAGE);
            if (bottomPanelState.page !== targetPage) {
                bottomPanelState.page = targetPage;
                renderPanelTable();
            }

            // Seleccionar fila en tabla y hacer scroll centrado
            const wrap = document.getElementById('attr-panel-wrap');
            if (wrap) {
                document.querySelectorAll('.attr-table tr.attr-selected').forEach(r => r.classList.remove('attr-selected'));
                const tr = wrap.querySelector(`tr[data-fidx="${targetIdx}"]`);
                if (tr) {
                    tr.classList.add('attr-selected');
                    tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            // Highlight amarillo en mapa
            highlightFeature(f, layerName, layerName);

            return; // sincronizado con la primera feature valida
        }
    }

    function featuresMatch(a, b) {
        // Comparar geometrias (mas confiable)
        try {
            const ga = a.getGeometry();
            const gb = b.getGeometry ? b.getGeometry() : (b.geometry ? new ol.format.GeoJSON().readGeometry(b.geometry) : null);
            if (ga && gb) {
                const ca = ga.getCoordinates();
                const cb = gb.getCoordinates();
                return JSON.stringify(ca) === JSON.stringify(cb);
            }
        } catch (e) { /* fallthrough */ }
        // Fallback: comparar por id
        const pa = a.getProperties ? a.getProperties() : (a.properties || {});
        const pb = b.getProperties ? b.getProperties() : (b.properties || {});
        for (const k of ['gid', 'id', 'subzona', 'inventario']) {
            if (pa[k] !== undefined && pa[k] === pb[k]) return true;
        }
        return false;
    }

    // Distancia minima entre un punto y una geometria (en coordenadas del mapa)
    function pointToFeatureDistance(coord, geom) {
        if (geom.getType && geom.getType() === 'Point') {
            const c = geom.getCoordinates();
            const dx = c[0] - coord[0], dy = c[1] - coord[1];
            return Math.sqrt(dx * dx + dy * dy);
        }
        // Para poligonos y lineas: extent al punto
        const ext = geom.getExtent();
        const x = Math.max(ext[0], Math.min(coord[0], ext[2]));
        const y = Math.max(ext[1], Math.min(coord[1], ext[3]));
        const dx = x - coord[0], dy = y - coord[1];
        return Math.sqrt(dx * dx + dy * dy);
    }

    function renderInfo(hits) {
        const panel = document.getElementById('info-panel');
        const content = document.getElementById('info-content');
        panel.removeAttribute('hidden');
        panel.style.display = 'block';

        let html = '';
        hits.forEach((h, idx) => {
            let cardHtml = '';
            if (h.tipo === 'arbol') cardHtml = treeCard(h.feature);
            else cardHtml = subzonaCard(h.feature);
            html += `<div class="feature-info-card mb-2" data-hit-idx="${idx}" style="cursor:pointer;" title="Click para seleccionar en tabla de atributos">${cardHtml}</div>`;
        });
        if (!html) html = '<p class="text-muted small">No hay información para mostrar.</p>';
        content.innerHTML = html;

        // Actualizar panel lateral derecho (Ficha Técnica)
        const sideFicha = document.getElementById('sideFichaContent');
        if (sideFicha) {
            sideFicha.innerHTML = html;
        }
        // Conmutar a la pestaña de Ficha Técnica
        document.getElementById('tab-btn-ficha')?.click();
        const badgeFicha = document.getElementById('ficha-badge');
        if (badgeFicha) badgeFicha.classList.remove('d-none');

        // Asegurar que el dashboard lateral esté visible
        const dashSidebar = document.getElementById('dashboard-sidebar');
        if (dashSidebar && dashSidebar.classList.contains('collapsed')) {
            dashSidebar.classList.remove('collapsed');
            setTimeout(() => map.updateSize(), 260);
        }

        content.querySelectorAll('.feature-info-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.dataset.hitIdx);
                if (hits[idx]) {
                    syncSelectionWithPanel([hits[idx]]);
                }
            });
        });
    }

    function closeInfo() {
        const p = document.getElementById('info-panel');
        p.setAttribute('hidden', '');
        p.style.display = 'none';
    }

    function treeCard(f) {
        const p = f.getProperties();
        const title = `🌳 Árbol ${p.inventario || ''}`;
        const rows = [
            ['Especie', p.especie],
            ['Nombre común', p.nombre_comun],
            ['Diámetro tronco', p.diametro_tronco_cm],
            ['Altura', p.altura_m],
            ['Diámetro copa', p.diametro_copa_m],
            ['Sección', p.seccion_bosque],
            ['Subzona', p.subzona],
            ['Inventario', p.inventario],
        ];
        const rowsHtml = rows
            .filter(([k, v]) => v != null && v !== '')
            .map(([k, v]) => `<tr><td class="text-muted" style="width:40%"><small>${escape(k)}</small></td><td><small>${escape(v)}</small></td></tr>`)
            .join('');
        return `<div class="mb-2"><strong>${title}</strong>
            <table class="table table-sm table-bordered mb-0">${rowsHtml}</table></div>`;
    }

    function subzonaCard(f, label) {
        const p = f.getProperties();
        const nivel = p.NIVEL_INTEG || '1';
        const prior = p.PRIOR_INTEG || 'Prioridad';
        const accion = p.ACCION_INTEG || 'Reforestación Integral';
        const spCientif = p.SP_CIENTIF || 'N/A';
        const spComun = p.SP_COMUN || 'Árboles Nativos';
        const eco = p.ECOSISTEMA || 'Ecosistema templado / matorral';
        const metodo = p.METODO_REF || 'Plantación directa';
        const densidad = p.DENSIDAD_HA || '800-1100';
        const supHa = p.SUP_HA != null ? Number(p.SUP_HA).toFixed(2) : '--';
        const pend = p.PEND_MED_PCT != null ? Number(p.PEND_MED_PCT).toFixed(1) + '%' : '--';
        const precip = p.PRECIP_EST_MM != null ? p.PRECIP_EST_MM + ' mm' : '--';
        const temp = p.TEMP_EST_C != null ? p.TEMP_EST_C + ' °C' : '--';

        let badgeClass = 'bg-danger';
        if (nivel == 2) badgeClass = 'bg-warning text-dark';
        else if (nivel == 3) badgeClass = 'bg-warning text-dark';
        else if (nivel == 4) badgeClass = 'bg-success';

        return `<div class="mb-2">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="badge ${badgeClass} p-1" style="font-size:0.85rem;">Nivel ${nivel} Prioridad</span>
                <span class="badge bg-secondary p-1" style="font-size:0.85rem;">${supHa} ha</span>
            </div>
            <div class="p-2 rounded mb-2" style="background:#f1f5f9; border-left:4px solid #1b4d3e;">
                <div style="font-size:0.82rem; font-weight:700; color:#0f172a;">${escape(accion)}</div>
                <div style="font-size:0.75rem; color:#475569;">${escape(prior)}</div>
            </div>
            <table class="table table-sm table-bordered mb-0" style="font-size:0.8rem;">
                <tr><td class="text-muted fw-semibold" style="width:38%;">Especies recomendadas</td><td class="fw-bold text-success">${escape(spComun)}<br><em class="text-muted small">${escape(spCientif)}</em></td></tr>
                <tr><td class="text-muted fw-semibold">Ecosistema</td><td>${escape(eco)}</td></tr>
                <tr><td class="text-muted fw-semibold">Método sugerido</td><td>${escape(metodo)}</td></tr>
                <tr><td class="text-muted fw-semibold">Densidad estimada</td><td>${escape(densidad)} pl/ha</td></tr>
                <tr><td class="text-muted fw-semibold">Pendiente media</td><td>${escape(pend)}</td></tr>
                <tr><td class="text-muted fw-semibold">Clima / Temp / Precip</td><td>${escape(temp)} | ${escape(precip)}</td></tr>
            </table>
        </div>`;
    }

    function showTreeInfo(f) {
        renderInfo([{ tipo: 'arbol', feature: f, source: 'arboles' }]);
        syncSelectionWithPanel([{ tipo: 'arbol', feature: f, source: 'arboles' }]);
    }
    function showSubzonaInfo(f) {
        renderInfo([{ tipo: 'subzona', feature: f, source: 'subzonas' }]);
        syncSelectionWithPanel([{ tipo: 'subzona', feature: f, source: 'subzonas' }]);
    }

    document.getElementById('close-info')?.addEventListener('click', closeInfo);

    // =====================================================================
    // UTIL
    // =====================================================================
    function hexToRgba(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    function escape(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // Ajustar extent inicial al de las subzonas una vez que carguen
    // (Desactivado: el centro/zoom del config es la vista correcta para Chapultepec)
    // setTimeout(() => {
    //     if (overlays.subzonas && overlays.subzonas.features.length) {
    //         const view = map.getView();
    //         const curCenter = view.getCenter();
    //         const all_ext = overlays.subzonas.layer.getSource().getExtent();
    //         if (!ol.extent.containsCoordinate(all_ext, curCenter)) {
    //             view.fit(all_ext, { padding: [30, 30, 30, 30], duration: 0, maxZoom: 14 });
    //         }
    //     }
    // }, 2000);

    // Exponer para debug
    
    // =====================================================================
    // HERRAMIENTAS GIS: Dibujar en Mapa y Cargar KML / Shapefile / GeoJSON
    // =====================================================================
    const userDrawSource = new ol.source.Vector();
    const userDrawLayer = new ol.layer.Vector({
        source: userDrawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(82, 183, 136, 0.35)' }),
            stroke: new ol.style.Stroke({ color: '#1b4d3e', width: 3 }),
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: '#2d6a4f' }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
            })
        }),
        zIndex: 250
    });
    map.addLayer(userDrawLayer);
    overlays['capa_usuario'] = { layer: userDrawLayer, info: { label: 'Mis Dibujos / Capas Cargadas', color: '#2d6a4f' }, features: [] };

    let drawInteraction = null;

    function saveUserDrawings() {
        try {
            const features = userDrawSource.getFeatures();
            if (features.length === 0) {
                localStorage.removeItem('visor_chapultepec_drawings');
                return;
            }
            const geojsonStr = new ol.format.GeoJSON().writeFeatures(features, {
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:3857'
            });
            localStorage.setItem('visor_chapultepec_drawings', geojsonStr);
            overlays['capa_usuario'].features = features;
        } catch (e) {
            console.error('[GIS] Error guardando dibujos:', e);
        }
    }

    function loadUserDrawings() {
        try {
            const saved = localStorage.getItem('visor_chapultepec_drawings');
            if (saved) {
                const features = new ol.format.GeoJSON().readFeatures(saved, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
                userDrawSource.addFeatures(features);
                overlays['capa_usuario'].features = features;
                console.log('[GIS] Cargados ' + features.length + ' elementos del localStorage.');
            }
        } catch (e) {
            console.error('[GIS] Error cargando localStorage:', e);
        }
    }
    loadUserDrawings();

    function setDrawMode(type) {
        if (drawInteraction) map.removeInteraction(drawInteraction);
        document.querySelectorAll('.btn-draw').forEach(b => b.classList.remove('active', 'bg-success', 'text-white'));
        if (!type) return;

        const btn = document.querySelector(`.btn-draw[data-type="${type}"]`);
        if (btn) btn.classList.add('active', 'bg-success', 'text-white');

        drawInteraction = new ol.interaction.Draw({
            source: userDrawSource,
            type: type
        });

        drawInteraction.on('drawend', e => {
            const feat = e.feature;
            feat.set('nombre', `Elemento ${type} #${userDrawSource.getFeatures().length + 1}`);
            feat.set('fecha', new Date().toLocaleString());
            setTimeout(() => {
                saveUserDrawings();
                setDrawMode(null);
                const ext = feat.getGeometry().getExtent();
                map.getView().fit(ext, { padding: [80, 80, 80, 80], maxZoom: 18, duration: 600 });
            }, 50);
        });

        map.addInteraction(drawInteraction);
    }

    document.querySelectorAll('.btn-draw').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            if (btn.classList.contains('active')) setDrawMode(null);
            else setDrawMode(type);
        });
    });

    document.getElementById('btn-clear-draw')?.addEventListener('click', () => {
        if (userDrawSource.getFeatures().length === 0) return;
        if (confirm('¿Deseas borrar todos los elementos dibujados y cargados?')) {
            setDrawMode(null);
            userDrawSource.clear();
            saveUserDrawings();
            const status = document.getElementById('upload-status');
            if (status) status.textContent = 'Dibujos limpiados';
        }
    });

    document.getElementById('btn-export-draw')?.addEventListener('click', () => {
        const features = userDrawSource.getFeatures();
        if (features.length === 0) {
            alert('No hay elementos dibujados o cargados para exportar.');
            return;
        }
        const geojsonStr = new ol.format.GeoJSON().writeFeatures(features, {
            dataProjection: 'EPSG:4326',
            featureProjection: 'EPSG:3857'
        });
        const blob = new Blob([geojsonStr], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `capa_usuario_chapultepec_${new Date().toISOString().slice(0,10)}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    // File Upload Handler (.kml, .geojson, .zip Shapefile)
    const fileInput = document.getElementById('gis-file-input');
    const uploadBtn = document.getElementById('btn-upload-file');
    const uploadStatus = document.getElementById('upload-status');

    uploadBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;

        const fname = file.name.toLowerCase();
        if (uploadStatus) uploadStatus.textContent = `Procesando ${file.name}...`;

        try {
            let features = [];
            if (fname.endsWith('.kml')) {
                const text = await file.text();
                features = new ol.format.KML({ extractStyles: true }).readFeatures(text, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
            } else if (fname.endsWith('.geojson') || fname.endsWith('.json')) {
                const text = await file.text();
                features = new ol.format.GeoJSON().readFeatures(text, {
                    dataProjection: 'EPSG:4326',
                    featureProjection: 'EPSG:3857'
                });
            } else if (fname.endsWith('.zip')) {
                if (typeof shp !== 'undefined') {
                    const buffer = await file.arrayBuffer();
                    const geojson = await shp(buffer);
                    features = new ol.format.GeoJSON().readFeatures(geojson, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:3857'
                    });
                } else {
                    throw new Error('Librería Shapefile (shp.js) no cargada.');
                }
            } else {
                throw new Error('Formato no soportado. Usa KML, GeoJSON o ZIP (Shapefile).');
            }

            if (features.length === 0) {
                throw new Error('No se encontraron elementos válidos en el archivo.');
            }

            userDrawSource.addFeatures(features);
            saveUserDrawings();

            const ext = userDrawSource.getExtent();
            if (ext && isFinite(ext[0])) {
                map.getView().fit(ext, { padding: [60, 60, 60, 60], maxZoom: 18, duration: 800 });
            }

            if (uploadStatus) uploadStatus.textContent = `✅ Cargar éxito: ${features.length} elementos`;
            fileInput.value = '';

        } catch (err) {
            console.error('[GIS] Error cargando archivo:', err);
            if (uploadStatus) uploadStatus.textContent = `❌ Error: ${err.message || err}`;
            alert(`Error al cargar ${file.name}: ${err.message || err}`);
            fileInput.value = '';
        }
    });


    
    // =====================================================================
    // LOCALIZACION EN TIEMPO REAL (GPS / Geolocalizacion)
    // =====================================================================
    const locationSource = new ol.source.Vector();
    const accuracyFeature = new ol.Feature();
    const positionFeature = new ol.Feature();

    positionFeature.setStyle(new ol.style.Style({
        image: new ol.style.Circle({
            radius: 9,
            fill: new ol.style.Fill({ color: '#1b4d3e' }),
            stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 })
        })
    }));

    accuracyFeature.setStyle(new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(82, 183, 136, 0.25)' }),
        stroke: new ol.style.Stroke({ color: 'rgba(45, 106, 79, 0.6)', width: 2 })
    }));

    locationSource.addFeatures([accuracyFeature, positionFeature]);

    const locationLayer = new ol.layer.Vector({
        source: locationSource,
        zIndex: 300
    });
    map.addLayer(locationLayer);

    const geolocation = new ol.Geolocation({
        trackingOptions: {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        },
        projection: map.getView().getProjection()
    });

    let gpsActive = false;
    let followUser = true;
    let lastPosition = null;
    const SMOOTHING_FACTOR = 0.35; // Filtro suave de media móvil exponencial para eliminar rebotes GPS

    function smoothCoordinates(raw) {
        if (!lastPosition) {
            lastPosition = raw;
            return raw;
        }
        const smoothed = [
            lastPosition[0] + SMOOTHING_FACTOR * (raw[0] - lastPosition[0]),
            lastPosition[1] + SMOOTHING_FACTOR * (raw[1] - lastPosition[1])
        ];
        lastPosition = smoothed;
        return smoothed;
    }

    function toggleGPS() {
        gpsActive = !gpsActive;
        geolocation.setTracking(gpsActive);

        const gpsBtn = document.getElementById('gps-btn');
        const status = document.getElementById('upload-status');

        if (gpsActive) {
            if (gpsBtn) gpsBtn.classList.add('active');
            if (status) status.innerHTML = '🎯 <strong>Conectando GPS de Alta Precisión...</strong>';
        } else {
            if (gpsBtn) gpsBtn.classList.remove('active');
            positionFeature.setGeometry(null);
            accuracyFeature.setGeometry(null);
            lastPosition = null;
            if (status) status.textContent = 'GPS desactivado';
        }
    }

    geolocation.on('change:position', () => {
        const rawCoords = geolocation.getPosition();
        if (rawCoords) {
            const coords = smoothCoordinates(rawCoords);
            positionFeature.setGeometry(new ol.geom.Point(coords));

            const lonLat = ol.proj.toLonLat(coords);
            const latStr = lonLat[1].toFixed(6);
            const lonStr = lonLat[0].toFixed(6);
            const accuracy = (geolocation.getAccuracy() || 0).toFixed(1);

            if (followUser) {
                const targetZoom = accuracy < 15 ? 18.5 : 17;
                map.getView().animate({
                    center: coords,
                    zoom: Math.max(map.getView().getZoom(), targetZoom),
                    duration: 600
                });
            }

            const status = document.getElementById('upload-status');
            if (status) {
                status.innerHTML = `🎯 <strong>GPS Máxima Precisión (±${accuracy}m)</strong><br><small style="font-family:monospace; color:#1b4d3e;">Lat: ${latStr}° | Lon: ${lonStr}°</small>`;
            }
        }
    });

    geolocation.on('change:accuracyGeometry', () => {
        accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());
    });

    geolocation.on('error', (error) => {
        console.error('[GPS] Error de geolocalización:', error);
        alert(`Error al obtener ubicación GPS: ${error.message || 'Sin permiso o señal GPS.'}`);
        gpsActive = true;
        toggleGPS();
    });

    // Agregar botón flotante de GPS sobre el mapa
    const gpsControlDiv = document.createElement('div');
    gpsControlDiv.className = 'ol-control-gps ol-unselectable ol-control';
    gpsControlDiv.innerHTML = `<button id="gps-btn" title="Mi ubicación GPS en tiempo real">🎯</button>`;
    document.getElementById('map').appendChild(gpsControlDiv);

    document.getElementById('gps-btn')?.addEventListener('click', toggleGPS);


    document.getElementById('btn-gps-panel')?.addEventListener('click', toggleGPS);



    // =====================================================================
    // LOGICA DEL DASHBOARD LATERAL DERECHO (INTERACTIVO Y DINÁMICO)
    // =====================================================================
    let dashboardStats = null;
    let sideDonutChart = null;
    let currentFilteredState = 'TODOS';
    let currentFilteredNivel = null;
    let currentFilteredMuni = null;

    function formatHa(val) {
        return Number(val || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 }) + ' ha';
    }

    function applyMapFiltersAndZoom() {
        const extents = dashboardStats?.state_extents || {};
        const ext = extents[currentFilteredState] || extents['TODOS'] || [-100.6253, 17.8126, -96.5990, 21.6864];
        const transformedExt = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857');
        
        map.getView().fit(transformedExt, {
            padding: [40, 460, 40, 340],
            duration: 800
        });

        applyMapFilters();
    }

    function applyMapFilters() {
        // Actualizar barra indicadora de filtro activo
        const filterBox = document.getElementById('filter-active-box');
        const filterText = document.getElementById('filter-active-text');

        const activeFilters = [];
        if (currentFilteredState !== 'TODOS') activeFilters.push(`Estado: ${currentFilteredState}`);
        if (currentFilteredNivel) activeFilters.push(`Nivel ${currentFilteredNivel}`);
        if (currentFilteredMuni) activeFilters.push(`Muni: ${currentFilteredMuni}`);

        if (activeFilters.length > 0) {
            filterBox?.classList.remove('d-none');
            if (filterText) filterText.textContent = activeFilters.join(' • ');
        } else {
            filterBox?.classList.add('d-none');
        }

        // Aplicar filtro reactivo sobre la capa de zonas prioritarias
        const o = overlays['zonas_prioritarias'];
        if (o && o.layer) {
            o.layer.setStyle((feature, resolution) => {
                const nivel = feature.get('NIVEL_INTEG');
                const estado = feature.get('NOM_ENT');
                const muni = feature.get('NOMGEO');

                // 1. Filtro de Estado
                if (currentFilteredState !== 'TODOS' && estado !== currentFilteredState) {
                    return null;
                }
                // 2. Filtro de Nivel
                if (currentFilteredNivel && nivel != currentFilteredNivel) {
                    return null;
                }
                // 3. Filtro de Municipio
                if (currentFilteredMuni && muni !== currentFilteredMuni) {
                    return null;
                }

                return priorityStyles[nivel] || defaultPolyStyle;
            });
        }
    }

    function zoomToMuni(muniName, ext) {
        currentFilteredMuni = muniName;
        if (ext && ext.length === 4) {
            const transExt = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857');
            map.getView().fit(transExt, {
                padding: [60, 460, 60, 340],
                duration: 800
            });
        }
        applyMapFilters();
    }

    function updateSideDashboardUI(selectedState) {
        if (!dashboardStats) return;

        const isAll = (selectedState === 'TODOS');
        const summary = dashboardStats.resumen_megalopolis;
        const estados = dashboardStats.estados;

        let totalHa = 0;
        let n1 = 0, n2 = 0, n3 = 0, n4 = 0;
        let topMunis = [];
        let topEspecies = [];

        if (isAll) {
            totalHa = summary.total_ha;
            n1 = summary.niveles_ha['1'];
            n2 = summary.niveles_ha['2'];
            n3 = summary.niveles_ha['3'];
            n4 = summary.niveles_ha['4'];

            const allMunis = [];
            Object.entries(estados).forEach(([edoName, st]) => {
                (st.top_municipios || []).forEach(m => {
                    allMunis.push({ ...m, municipio: `${m.municipio} (${edoName})` });
                });
            });
            allMunis.sort((a, b) => b.superficie_ha - a.superficie_ha);
            topMunis = allMunis.slice(0, 8);

            topEspecies = [
                { especies: "Pino Moctezuma, Encino roble, Aile, Madroño", superficie_ha: 1560000 },
                { especies: "Maguey pulquero en bordos, Frutales criollos, Aile", superficie_ha: 1250000 },
                { especies: "Mezquite dulce, Huizache, Pino piñonero, Táscate", superficie_ha: 840000 },
                { especies: "Ahuejote / Sauce blanco, Tepozán, Maguey (Bioingeniería)", superficie_ha: 298000 }
            ];
        } else {
            const st = estados[selectedState];
            if (!st) {
                console.warn('[Dashboard] No hay datos para estado:', selectedState);
                return;
            }

            totalHa = st.total_ha;
            n1 = st.niveles_ha.nivel_1_critica;
            n2 = st.niveles_ha.nivel_2_urgente;
            n3 = st.niveles_ha.nivel_3_agroforestal;
            n4 = st.niveles_ha.nivel_4_preventiva;
            topMunis = st.top_municipios || [];
            topEspecies = st.top_especies || [];
        }

        // Actualizar badges y KPIs
        const bTotal = document.getElementById('sideTotalHaBadge');
        if (bTotal) bTotal.textContent = formatHa(totalHa);

        const elN1 = document.getElementById('sideKpiN1');
        const elN2 = document.getElementById('sideKpiN2');
        const elN3 = document.getElementById('sideKpiN3');
        const elN4 = document.getElementById('sideKpiN4');

        if (elN1) elN1.textContent = formatHa(n1);
        if (elN2) elN2.textContent = formatHa(n2);
        if (elN3) elN3.textContent = formatHa(n3);
        if (elN4) elN4.textContent = formatHa(n4);

        const subLbl = document.getElementById('donutSubLabel');
        if (subLbl) subLbl.textContent = isAll ? 'Megalópolis' : selectedState;

        // Donut Chart
        renderSideDonut(n1, n2, n3, n4);

        // Municipios
        const muniContainer = document.getElementById('sideMuniList');
        if (muniContainer) {
            muniContainer.innerHTML = topMunis.slice(0, 8).map((m, idx) => {
                const pct = totalHa > 0 ? ((m.superficie_ha / totalHa) * 100).toFixed(1) : 0;
                const extJson = m.extent ? JSON.stringify(m.extent) : 'null';
                return `
                <div class="muni-list-item d-flex align-items-center justify-content-between" data-muni="${escape(m.municipio)}" data-ext='${extJson}'>
                    <div>
                        <div class="fw-bold text-white" style="font-size:0.78rem;">${idx + 1}. ${escape(m.municipio)}</div>
                        <div class="text-muted" style="font-size:0.68rem;">${m.poligonos} polígonos • ${pct}% del estado</div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-dark border text-success fw-bold" style="font-size:0.75rem;">${formatHa(m.superficie_ha)}</span>
                    </div>
                </div>
                `;
            }).join('');

            muniContainer.querySelectorAll('.muni-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const muni = item.dataset.muni;
                    const ext = JSON.parse(item.dataset.ext || 'null');
                    zoomToMuni(muni, ext);
                });
            });
        }

        // Especies
        const specContainer = document.getElementById('sideSpeciesList');
        if (specContainer) {
            specContainer.innerHTML = topEspecies.slice(0, 3).map(esp => `
                <div class="p-1 px-2 mb-1 rounded d-flex justify-content-between align-items-center" style="background:#14242d; border:1px solid rgba(255,255,255,0.04); font-size:0.72rem;">
                    <span class="text-truncate text-white" style="max-width:70%;" title="${escape(esp.especies)}">🌲 ${escape(esp.especies)}</span>
                    <span class="badge bg-dark text-success" style="font-size:0.70rem;">${formatHa(esp.superficie_ha)}</span>
                </div>
            `).join('');
        }
    }

    function renderSideDonut(n1, n2, n3, n4) {
        const canvas = document.getElementById('sideDonutCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (sideDonutChart) sideDonutChart.destroy();

        sideDonutChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['N1 Crítica', 'N2 Urgente', 'N3 Agroforestal', 'N4 Preventiva'],
                datasets: [{
                    data: [n1, n2, n3, n4],
                    backgroundColor: ['#d90429', '#f77f00', '#fcbf49', '#2a9d8f'],
                    borderColor: '#0d171e',
                    borderWidth: 2,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const val = ctx.raw || 0;
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((val / total) * 100).toFixed(1);
                                return ` ${ctx.label}: ${formatHa(val)} (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '65%'
            }
        });
    }

    async function initSideDashboard() {
        try {
            const resp = await fetch('data/stats_por_estado.json?v=' + Date.now());
            dashboardStats = await resp.json();

            // 1. Selector de Estado
            const stateSel = document.getElementById('dashStateSelect');
            if (stateSel) {
                stateSel.addEventListener('change', (e) => {
                    const edo = e.target.value;
                    currentFilteredState = edo;
                    currentFilteredNivel = null;
                    currentFilteredMuni = null;
                    document.querySelectorAll('.dash-mini-kpi').forEach(k => k.classList.remove('active-kpi'));
                    applyMapFiltersAndZoom();
                    updateSideDashboardUI(edo);
                });
            }

            // 2. Tabs
            const btnDash = document.getElementById('tab-btn-dash');
            const btnFicha = document.getElementById('tab-btn-ficha');
            const viewDash = document.getElementById('view-dashboard');
            const viewFicha = document.getElementById('view-ficha');

            btnDash?.addEventListener('click', () => {
                btnDash.classList.add('active');
                btnFicha.classList.remove('active');
                viewDash.classList.remove('d-none');
                viewFicha.classList.add('d-none');
            });

            btnFicha?.addEventListener('click', () => {
                btnFicha.classList.add('active');
                btnDash.classList.remove('active');
                viewFicha.classList.remove('d-none');
                viewDash.classList.add('d-none');
                const badgeFicha = document.getElementById('ficha-badge');
                if (badgeFicha) badgeFicha.classList.add('d-none');
            });

            // 3. Toggle sidebar
            const sidebar = document.getElementById('dashboard-sidebar');
            const btnToggle = document.getElementById('btn-toggle-dash');
            const btnClose = document.getElementById('btn-close-dash');

            function toggleSidebar(open) {
                if (open === undefined) {
                    sidebar.classList.toggle('collapsed');
                } else if (open) {
                    sidebar.classList.remove('collapsed');
                } else {
                    sidebar.classList.add('collapsed');
                }
                const isOpen = !sidebar.classList.contains('collapsed');
                if (btnToggle) {
                    btnToggle.className = isOpen
                        ? 'btn btn-sm btn-success fw-bold shadow-sm d-flex align-items-center gap-1'
                        : 'btn btn-sm btn-outline-success fw-bold shadow-sm d-flex align-items-center gap-1';
                }
                setTimeout(() => map.updateSize(), 260);
            }

            btnToggle?.addEventListener('click', () => toggleSidebar());
            btnClose?.addEventListener('click', () => toggleSidebar(false));

            // 4. Click en Mini-KPIs
            document.querySelectorAll('.dash-mini-kpi').forEach(el => {
                el.addEventListener('click', () => {
                    const nivel = parseInt(el.dataset.nivel);
                    if (currentFilteredNivel === nivel) {
                        currentFilteredNivel = null;
                        el.classList.remove('active-kpi');
                    } else {
                        document.querySelectorAll('.dash-mini-kpi').forEach(k => k.classList.remove('active-kpi'));
                        currentFilteredNivel = nivel;
                        el.classList.add('active-kpi');
                    }
                    applyMapFilters();
                });
            });

            // 5. Botón limpiar filtro
            document.getElementById('btn-clear-filter')?.addEventListener('click', () => {
                currentFilteredNivel = null;
                currentFilteredMuni = null;
                document.querySelectorAll('.dash-mini-kpi').forEach(k => k.classList.remove('active-kpi'));
                applyMapFilters();
            });

            // Carga inicial
            updateSideDashboardUI('TODOS');

        } catch (e) {
            console.error('[Dashboard Lateral] Error:', e);
        }
    }

    // Inicializar dashboard lateral
    initSideDashboard();

    window.__visor = { map, baseLayers, overlays, toggleBase, setAllBases, openBottomPanel };
})();

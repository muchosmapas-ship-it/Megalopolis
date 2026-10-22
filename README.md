# Geoportal de Prioridades de Reforestación y Restauración Ecológica - Megalópolis

Sistema de Información Geográfica (SIG) web interactivo y analítico para la visualización, monitoreo y toma de decisiones territoriales en la **Megalópolis de México** (Ciudad de México, Estado de México, Hidalgo, Morelos, Puebla, Querétaro y Tlaxcala).

---

## 🌲 Características Principales
* **20,691 Polígonos de Intervención Prioritaria:** Identificación cartográfica precisa con prescripción técnica silvícola, especies nativas recomendadas, densidad por hectárea y método sugerido.
* **Cruce Multicriterio Espacial:**
  * **Erosión de Suelos (INEGI):** Identificación y ponderación de degradación hídrica y eólica severa y muy severa.
  * **Uso del Suelo y Vegetación (INEGI Serie VII):** Pastizales degradados y vegetación secundaria propensa a restauración.
  * **Topografía y Pendientes (Modelo Digital de Elevaciones Continuo):** Determinación de susceptibilidad morfométrica y obras mecánicas (zanjas trinchera, terrazas, tinajas).
  * **Aptitud Bioclimática (Isoyetas e Isotermas):** Intersección de balances hídricos y térmicos con los requerimientos ecológicos de especies nativas.
* **4 Niveles de Prioridad Territorial:**
  1. **Nivel 1 (Crítica):** Bioingeniería de suelos y obras mecánicas urgentes.
  2. **Nivel 2 (Urgente):** Reforestación activa de alta densidad.
  3. **Nivel 3 (Agroforestal):** Sistemas agroforestales / MIAF y terrazas de cultivo.
  4. **Nivel 4 (Preventiva):** Enriquecimiento y regeneración asistida.
* **Límites Político-Administrativos Integrados:** Coberturas vectoriales de los 7 Estados y 556 Municipios de la Megalópolis.
* **Dashboard Ejecutivo Dinámico Lateral:** Filtro reactivo por entidad federativa, KPIs dinámicos, gráfico Donut interactivo, ranking de municipios críticos y ficha técnica con zoom en tiempo real.
* **Herramientas SIG Avanzadas:** Carga de KML/Shapefile (.zip)/GeoJSON, medición y digitalización de geometrías, exportación de capas y GPS de alta precisión en tiempo real.

---

## 🛠️ Tecnologías y Optimización
* **Motor Cartográfico:** OpenLayers (acelerado con canvas offscreen `renderMode: 'image'`).
* **Visualización de Datos:** Chart.js, Bootstrap 5.
* **Optimización Vectorial:** Coordenadas redondeadas a 5 decimales (~1.1 m de resolución), reducción de peso del 61.3% (33 MB) para carga y renderizado instantáneos a 60 FPS en navegadores web.

---

## 🚀 Despliegue Local
Para ejecutar el geoportal localmente:
```bash
python server.py 8005
```
Luego abrir en el navegador:
```
http://127.0.0.1:8005/
```

---

## 👤 Autor y Contacto
* **Desarrollado por:** Edgar
* **Correo Electrónico:** [jhonson2490@gmail.com](mailto:jhonson2490@gmail.com)
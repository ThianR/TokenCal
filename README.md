# TokenCal / Context Visualizer

**TokenCal** es una herramienta de visualización y análisis de código estático (Context Visualizer) diseñada explícitamente para desarrolladores e ingenieros que trabajan con Modelos de Lenguaje Grandes (LLMs) y agentes de IA autónomos (como Gemini, Claude, OpenAI).

---

## ⚠️ La Problemática

Alimentar a un agente de IA con el código completo de un proyecto (práctica conocida como *"Codebase Dumping"*) presenta tres problemas críticos en la ingeniería moderna:

1. **Desbordamiento Crítico (Context Overflow):** Todos los modelos tienen un límite estricto de palabras ("ventana de contexto"). Pasarle repositorios monolíticos a una IA provoca que pierda coherencia de inmediato, limite sus razonamientos por "amnesia" o directamente rechace procesarlo.
2. **Costos Ocultos Exponenciales:** Las APIs de inteligencia artificial se facturan por cada "Token de Ingesta". Enviar un proyecto que carece de `.gitignore` con miles de archivos minificados, `node_modules`, builds o assets pesados dispara el costo en dólares de forma veloz e invisible.
3. **Mantenibilidad Rota:** Darle a un agente IA una estructura repleta de deuda técnica invisible (TODOs y FIXMEs huérfanos), altos grados de acoplamiento (carpetas extremadamente anidadas) y nula documentación incrementa de forma alarmante el riesgo de que la IA genere regresiones y *alucinaciones*.

---

## 💡 La Solución: TokenCal

**TokenCal** resuelve el problema ubicándose como el paso previo **obligatorio** antes de alimentar a cualquier flujo RAG (Retrieval-Augmented Generation) o de agente general. Se ejecuta **100% en local** en tu navegador usando la File System Access API de la web moderna, asegurando que ni una sola línea de tu código viaja a la nube.

Su UI/UX estilo *Bento Box Premium* condensa la salud del proyecto en tiempo real, mostrándote:

- **Tokens Reales Estimados**: Conoce el volumen verdadero de los tokens a procesar.
- **Top 10 Context Hogs**: Los "devoradores de contexto". Te enumera los archivos individuales más grandes que están asfixiando los límites de la IA, ordenados de mayor a menor gravedad.
- **Calculadora Dinámica de Inversión**: Una herramienta de simulación en pantalla para ver el coste financiero instantáneo de ese escaneo según tu proveedor de API.
- **Radar de Acoplamiento y Deuda**: Cuantifica cuántos niveles de profundidad estructural (Deep Nested Files) tiene tu sistema, la cantidad de tareas huérfanas pendientes en el código (`TODO`) y tu índice de salud en documentación (Doc Ratio).
- **Tooltips Asistidos e Informes PDF**: Todas las métricas vienen documentadas con su impacto real en los agentes, y pueden ser extraídas con un solo clic a un Informe formal (`.pdf`) repleto de consejos curados y divididos mediante niveles (CRÍTICO, MODERADO, ÓPTIMO).

---

## 🚀 Guía de Uso Rápido

1. Abre **TokenCal** en tu navegador.
2. Haz clic en el gran panel que indica **"Escanear Proyecto"** (o "Cambiar Carpeta" en su defecto).
3. Tu navegador lanzará por seguridad el cuadro de diálogo para ceder permisos de solo lectura al sistema. Selecciona la carpeta raíz de tu repositorio.
4. El motor *Core* en tiempo real asíncrono extraerá los archivos al momento y renderizará una barra progresiva veloz.
5. **Navega sobre cada dato**: Al pasar el ratón ("Hover") por los nombres y alertas descubrirás Tooltips de ayuda explicativos para entender la métrica.
6. Ve hasta abajo y pulsa **Exportar Informe PDF** para archivar o compartir esta radiografía.

---

## 💻 Manera de ejecutarlo (Instalación Local)

Al estar impulsado con las veloces características de **Vite, React y TypeScript**, correr el ecosistema completo internamente es cuestión de segundos, sin requerimientos de Bases de Datos, dockers ni variables oscuras de red.

### Requisitos del Sistema
- [Node.js](https://nodejs.org/) instalador oficial (Mínimo recomendado `v18.x`).
- NPM (viene con Node) o tu gestor favorito (Pnpm, Yarn).

### Paso a Paso

1. Clona el repositorio a tu máquina en tu terminal favorita:
```bash
git clone https://github.com/ThianR/TokenCal.git
cd TokenCal
```

2. Descarga e instala el árbol dependencias estáticas localmente:
```bash
npm install
```

3. Sirve el proyecto levantando el proceso en el entorno de desarrollo ultra-rápido de Vite:
```bash
npm run dev
```

4. Finalmente, observa la salida en consola, presiona sobre el enlace mostrado (normalmente será **`http://localhost:5173/`**) o ábrelo manual en la barra de URL del navegador Chrome/Edge.

---

## 📜 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](./LICENSE) para más detalles. ¡Siéntete libre de usarlo, mejorarlo y compartirlo con toda la comunidad!

¡La caja de herramientas está servida. El código está protegido de la red abierta!

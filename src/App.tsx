import { useState, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import {
  FolderOpen,
  Database,
  RefreshCw,
  Coins,
  ListTodo,
  FileText,
  Target,
  TrendingUp,
  AlertCircle,
  ArrowUpRight,
  ShieldCheck,
  Zap,
  HelpCircle,
  Download,
  CheckCircle,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { analyzeProject, formatBytes, formatNumber } from './logic/Analyzer';
import type { ProjectStats, AnalysisProgress } from './logic/Analyzer';
import jsPDF from 'jspdf';

// --- PortalTooltip: usa ReactDOM.createPortal para escapar de backdrop-filter ---
const Tooltip = ({ text, children }: { text: string; children: React.ReactNode }) => {
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((e: React.MouseEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: rect.left + rect.width / 2, y: rect.top, w: rect.width });
  }, []);

  const hide = useCallback(() => {
    timerRef.current = setTimeout(() => setPos(null), 120);
  }, []);

  const tooltipEl = pos ? ReactDOM.createPortal(
    <div
      style={{
        position: 'fixed',
        left: Math.min(pos.x, window.innerWidth - 280),
        top: pos.y - 10,
        transform: 'translate(-50%, -100%)',
        zIndex: 99999,
        maxWidth: 260,
      }}
      className="p-3 bg-[#0f0f13] border border-white/15 text-xs text-white/80 leading-relaxed rounded-2xl shadow-2xl pointer-events-none font-normal normal-case text-left"
    >
      {text}
      {/* Flecha decorativa */}
      <div className="absolute bottom-[-5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#0f0f13] border-r border-b border-white/15 rotate-45" />
    </div>,
    document.body
  ) : null;

  return (
    <span className="inline-flex items-center gap-1 cursor-help" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      <HelpCircle className="w-3.5 h-3.5 text-white/25 group-hover:text-white/60 transition-colors flex-shrink-0" />
      {tooltipEl}
    </span>
  );
};

// --- Lógica de recomendaciones dinámicas ---
interface Recommendation {
  level: 'ok' | 'warn' | 'critical';
  title: string;
  detail: string;
  tip: string;
}

function buildRecommendations(stats: ProjectStats, cost: number): Recommendation[] {
  const recs: Recommendation[] = [];
  const tokensK = stats.estimatedTokens / 1000;

  // Tokens de contexto
  if (tokensK > 1000) {
    recs.push({ level: 'critical', title: 'Contexto masivo (>1M tokens)', detail: `El proyecto supera 1M tokens (${formatNumber(Math.floor(tokensK))}K). Ningún modelo actual puede ingerirlo completo.`, tip: 'Implementa RAG: divide el código en chunks semánticos, indexa con embeddings y consulta solo los fragmentos relevantes.' });
  } else if (tokensK > 128) {
    recs.push({ level: 'warn', title: 'Contexto grande (>128K tokens)', detail: `El proyecto tiene ${formatNumber(Math.floor(tokensK))}K tokens, superando la ventana de muchos modelos.`, tip: 'Usa modelos con ventana extendida (Gemini 1.5, Claude 3.5) o provee archivos de resumen de arquitectura en lugar del código completo.' });
  } else {
    recs.push({ level: 'ok', title: 'Contexto manejable', detail: `${formatNumber(Math.floor(tokensK))}K tokens. Cabe dentro de la mayoría de ventanas de contexto modernas.`, tip: 'Mantén el crecimiento del proyecto bajo control eliminando archivos generados, logs y binarios.' });
  }

  // Deuda técnica
  if (stats.todoCount > 50) {
    recs.push({ level: 'critical', title: `Deuda técnica alta (${stats.todoCount} marcadores)`, detail: 'Más de 50 TODOs/FIXMEs indican lógica inconclusa. Un agente de IA introducirá errores al tocar esas zonas.', tip: 'Prioriza resolver los FIXMEs críticos primero. Crea issues en tu gestor de tareas y añade comentarios de contexto junto a cada TODO.' });
  } else if (stats.todoCount > 10) {
    recs.push({ level: 'warn', title: `Deuda técnica moderada (${stats.todoCount} marcadores)`, detail: 'Entre 10 y 50 TODOs. La IA operará con precaución en estas zonas.', tip: 'Documenta el estado actual de cada TODO junto a su etiqueta. Añade un archivo DEBT.md con el resumen de deuda técnica.' });
  } else {
    recs.push({ level: 'ok', title: `Deuda técnica baja (${stats.todoCount} marcadores)`, detail: 'Pocos o ningún marcador pendiente. El agente operará con mayor precisión.', tip: 'Mantén esta disciplina. Usa linters que impidan mergear código con TODOs no documentados.' });
  }

  // Profundidad estructural
  if (stats.maxDepth > 8) {
    recs.push({ level: 'critical', title: `Estructura muy profunda (${stats.maxDepth} niveles)`, detail: 'Una jerarquía de más de 8 niveles genera imports imposibles de rastrear para un agente de IA.', tip: 'Aplana la estructura: agrupa módulos relacionados, usa path aliases en tsconfig/vite, e introduce un barrel file (index.ts) por directorio.' });
  } else if (stats.maxDepth > 5) {
    recs.push({ level: 'warn', title: `Estructura profunda (${stats.maxDepth} niveles)`, detail: 'Entre 5 y 8 niveles dificultan que la IA deduzca la jerarquía funcional.', tip: 'Configura path aliases (@/components, @/utils) para simplificar los imports relativos y provee un árbol de directorios en el README.' });
  } else {
    recs.push({ level: 'ok', title: `Estructura plana (${stats.maxDepth} niveles)`, detail: 'La profundidad de carpetas es óptima. La IA puede navegar el proyecto con facilidad.', tip: 'Mantén un README actualizado con el árbol de directorios para que el agente tenga un mapa del proyecto.' });
  }

  // Doc ratio
  const docRatio = (stats.docFileCount / (stats.fileCount || 1)) * 100;
  if (docRatio < 2) {
    recs.push({ level: 'critical', title: `Documentación muy escasa (${docRatio.toFixed(1)}%)`, detail: 'Menos del 2% de archivos son documentación. La IA operará "a ciegas" deduciendo intención del código.', tip: 'Añade un README.md por módulo clave, documenta las decisiones de arquitectura en un fichero ARCHITECTURE.md y usa JSDoc/docstrings en funciones públicas.' });
  } else if (docRatio < 8) {
    recs.push({ level: 'warn', title: `Documentación mejorable (${docRatio.toFixed(1)}%)`, detail: 'La documentación existe pero podría ser más completa para guiar a los agentes.', tip: 'Crea archivos de contexto específicos para la IA: AGENTS.md con las convenciones del proyecto y guías de contribución.' });
  } else {
    recs.push({ level: 'ok', title: `Buena documentación (${docRatio.toFixed(1)}%)`, detail: 'El proyecto tiene una proporción saludable de documentación. Los agentes pueden entender el contexto con mayor precisión.', tip: 'Mantén la documentación sincronizada con el código. Considera generar documentación automática con herramientas como TypeDoc.' });
  }

  // Costo
  if (cost > 5) {
    recs.push({ level: 'critical', title: `Costo de ingesta alto ($${cost.toFixed(2)})`, detail: 'Ingerir el proyecto completo en cada llamada a la API es costoso.', tip: 'Usa estrategias de caché de embeddings, provee solo los archivos relevantes por tarea e implementa un sistema RAG para reducir el contexto enviado.' });
  } else if (cost > 1) {
    recs.push({ level: 'warn', title: `Costo de ingesta moderado ($${cost.toFixed(2)})`, detail: 'El costo por sesión es notable. Optimizar el contexto puede reducirlo significativamente.', tip: 'Filtra archivos binarios, generados (dist/, build/) y de dependencias antes de enviar el proyecto al agente.' });
  } else {
    recs.push({ level: 'ok', title: `Costo optimizado ($${cost.toFixed(2)})`, detail: 'El costo de ingesta es bajo y sostenible para la mayoría de flujos de trabajo.', tip: 'Continúa excluyendo node_modules y archivos de build en tu configuración de agentes.' });
  }

  return recs;
}

// --- Generación de PDF profesional (Times New Roman nativa de jsPDF) ---
const generatePDF = (stats: ProjectStats, projectName: string, cost: number, tokenUnit: number, price: number) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const marginL = 22;
  const marginR = 22;
  const contentW = W - marginL - marginR;
  let y = 0;
  let pageNum = 1;

  const setFont = (style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal', size = 10) => {
    doc.setFont('times', style);
    doc.setFontSize(size);
  };
  const setColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const write = (text: string, x: number) => doc.text(text, x, y);
  const nl = (gap = 6) => { y += gap; };

  const checkPage = (needed = 20) => {
    if (y + needed > H - 22) {
      addFooter();
      doc.addPage();
      pageNum++;
      doc.setFillColor(252, 251, 248);
      doc.rect(0, 0, W, H, 'F');
      addPageHeader();
      y = 38;
    }
  };

  const sectionBar = (h: number, r: number, g: number, b: number) => {
    doc.setFillColor(r, g, b);
    doc.rect(marginL, y - 1, 2.5, h + 2, 'F');
  };

  const addFooter = () => {
    const fy = H - 12;
    doc.setDrawColor(185, 175, 158);
    doc.setLineWidth(0.3);
    doc.line(marginL, fy - 3, W - marginR, fy - 3);
    setFont('italic', 7.5);
    setColor(148, 138, 120);
    write(`TokenCal — Informe generado el ${new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}`, marginL);
    setFont('normal', 7.5);
    setColor(148, 138, 120);
    doc.text(`Pag. ${pageNum}`, W - marginR, fy, { align: 'right' });
  };

  const addPageHeader = () => {
    setFont('italic', 8);
    setColor(160, 148, 128);
    write(`TokenCal / ${projectName || 'Proyecto'}`, marginL);
    doc.setDrawColor(200, 188, 168);
    doc.setLineWidth(0.25);
    doc.line(marginL, y + 2.5, W - marginR, y + 2.5);
  };

  // ── Fondo papel cálido ────────────────────────────────────────────────────
  doc.setFillColor(252, 251, 248);
  doc.rect(0, 0, W, H, 'F');

  // ── Banda de portada ──────────────────────────────────────────────────────
  doc.setFillColor(28, 22, 50);
  doc.rect(0, 0, W, 54, 'F');
  doc.setFillColor(120, 80, 220);
  doc.rect(0, 0, 5, 54, 'F');

  y = 22;
  setFont('bold', 23);
  setColor(245, 242, 255);
  write('TokenCal', marginL + 7);

  y = 33;
  setFont('normal', 11);
  setColor(185, 168, 235);
  write('Informe de Analisis de Contexto para Agentes de IA', marginL + 7);

  y = 43;
  setFont('italic', 8.5);
  setColor(142, 128, 188);
  write(
    `Proyecto: ${projectName || 'Sin nombre'}   *   ${new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' })}`,
    marginL + 7
  );

  y = 68;

  // ── Sección 1: Resumen ────────────────────────────────────────────────────
  sectionBar(6, 120, 80, 220);
  setFont('bold', 9.5);
  setColor(55, 40, 95);
  write('RESUMEN EJECUTIVO', marginL + 6);
  nl(8);
  doc.setDrawColor(192, 182, 162);
  doc.setLineWidth(0.3);
  doc.line(marginL, y, W - marginR, y);
  nl(7);

  const tokensK = Math.floor(stats.estimatedTokens / 1000);
  const docRatioVal = ((stats.docFileCount / (stats.fileCount || 1)) * 100);

  const summary: [string, string][] = [
    ['Tokens de Contexto Estimados',         `${formatNumber(tokensK)}K tokens`],
    ['Tamano Total del Proyecto',             formatBytes(stats.totalSizeBytes)],
    ['Tamano de Contexto (Codigo + Docs)',    formatBytes(stats.contextSizeBytes)],
    ['Total de Archivos Escaneados',          formatNumber(stats.fileCount)],
    ['Deuda Tecnica (TODO / FIXME)',          `${stats.todoCount} marcadores`],
    ['Profundidad Maxima de Estructura',      `${stats.maxDepth} niveles`],
    ['Ratio de Documentacion',               `${docRatioVal.toFixed(1)}%  (${stats.docFileCount} docs / ${stats.codeFileCount} codigo)`],
    ['Costo de Ingesta Estimado',             `$${cost.toFixed(5)}  ($${price} / ${formatNumber(tokenUnit)} tokens)`],
  ];

  for (let i = 0; i < summary.length; i++) {
    const [label, value] = summary[i];
    checkPage(9);
    if (i % 2 === 0) {
      doc.setFillColor(246, 243, 238);
      doc.rect(marginL, y - 4.5, contentW, 8, 'F');
    }
    setFont('normal', 9.5);
    setColor(72, 62, 95);
    write(label, marginL + 4);
    setFont('bold', 9.5);
    setColor(38, 28, 68);
    doc.text(value, W - marginR, y, { align: 'right' });
    nl(8.5);
  }

  nl(5);

  // ── Sección 2: Context Hogs ───────────────────────────────────────────────
  checkPage(40);
  sectionBar(6, 200, 118, 28);
  setFont('bold', 9.5);
  setColor(100, 52, 8);
  write('TOP 10 CONTEXT HOGS', marginL + 6);
  nl(9);
  doc.setDrawColor(192, 182, 162);
  doc.line(marginL, y, W - marginR, y);
  nl(3);

  // Encabezado tabla
  doc.setFillColor(232, 220, 202);
  doc.rect(marginL, y, contentW, 7.5, 'F');
  y += 5.5;
  setFont('bold', 8);
  setColor(75, 58, 28);
  write('#  Nombre del Archivo', marginL + 3);
  doc.text('Tokens', W - marginR - 28, y, { align: 'right' });
  doc.text('Tamano', W - marginR, y, { align: 'right' });
  nl(5);

  for (const [i, file] of stats.topFiles.entries()) {
    checkPage(10);
    if (i % 2 === 0) {
      doc.setFillColor(249, 246, 241);
      doc.rect(marginL, y - 4.5, contentW, 9, 'F');
    }
    setFont('bold', 8.5);
    setColor(48, 40, 72);
    write(`${i + 1}.  ${file.name}`, marginL + 3);

    setFont('normal', 8.5);
    setColor(105, 82, 160);
    doc.text(formatNumber(file.tokens), W - marginR - 28, y, { align: 'right' });

    setFont('bold', 8.5);
    setColor(38, 28, 68);
    doc.text(formatBytes(file.size), W - marginR, y, { align: 'right' });
    nl(5);

    if (file.path && file.path !== file.name) {
      setFont('italic', 7);
      setColor(158, 146, 128);
      const p = file.path.length > 72 ? '...' + file.path.slice(-69) : file.path;
      write(p, marginL + 8);
      nl(5);
    }
  }

  nl(6);

  // ── Sección 3: Recomendaciones ────────────────────────────────────────────
  checkPage(22);
  sectionBar(6, 48, 175, 115);
  setFont('bold', 9.5);
  setColor(14, 80, 52);
  write('RECOMENDACIONES DE MEJORA', marginL + 6);
  nl(9);
  doc.setDrawColor(192, 182, 162);
  doc.line(marginL, y, W - marginR, y);
  nl(8);

  const recs = buildRecommendations(stats, cost);

  for (const rec of recs) {
    checkPage(36);

    const badgeBg: [number, number, number] = rec.level === 'ok' ? [218, 248, 228] : rec.level === 'warn' ? [254, 242, 198] : [252, 218, 218];
    const badgeFg: [number, number, number] = rec.level === 'ok' ? [22, 130, 72] : rec.level === 'warn' ? [160, 108, 12] : [170, 38, 38];
    const accentRGB: [number, number, number] = rec.level === 'ok' ? [48, 175, 115] : rec.level === 'warn' ? [200, 148, 20] : [200, 60, 60];
    const badgeTxt = rec.level === 'ok' ? '  OPTIMO  ' : rec.level === 'warn' ? ' MODERADO ' : '  CRITICO ';

    // Badge
    doc.setFillColor(...badgeBg);
    doc.roundedRect(marginL, y - 4.5, 28, 6.5, 2, 2, 'F');
    doc.setFillColor(...accentRGB);
    doc.roundedRect(marginL, y - 4.5, 2, 6.5, 1, 1, 'F');
    setFont('bold', 6.5);
    setColor(...badgeFg);
    write(badgeTxt, marginL + 3);
    nl(7);

    // Título
    setFont('bold', 10.5);
    setColor(32, 25, 58);
    const titleL = doc.splitTextToSize(rec.title, contentW);
    doc.text(titleL, marginL, y);
    y += titleL.length * 6;
    nl(2);

    // Detalle
    setFont('normal', 8.5);
    setColor(88, 78, 108);
    const detailL = doc.splitTextToSize(rec.detail, contentW);
    doc.text(detailL, marginL, y);
    y += detailL.length * 5;
    nl(3);

    // Bloque consejo
    const tipL = doc.splitTextToSize(rec.tip, contentW - 10);
    const tipH = tipL.length * 5 + 8;
    doc.setFillColor(240, 236, 252);
    doc.roundedRect(marginL, y - 2, contentW, tipH, 2, 2, 'F');
    doc.setFillColor(...accentRGB);
    doc.rect(marginL, y - 2, 2.5, tipH, 'F');
    setFont('italic', 8);
    setColor(68, 52, 125);
    doc.text(tipL, marginL + 7, y + 4);
    y += tipH + 4;
    nl(3);

    // Separador
    doc.setDrawColor(212, 202, 185);
    doc.setLineWidth(0.2);
    doc.line(marginL + 8, y - 1, W - marginR - 8, y - 1);
    nl(7);
  }

  addFooter();
  doc.save(`TokenCal_${projectName || 'proyecto'}_${new Date().toISOString().slice(0, 10)}.pdf`);
};




const App = () => {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState<string>('');

  const [price, setPrice] = useState<number>(0.01);
  const [tokenUnit, setTokenUnit] = useState<number>(1000);
  const [progress, setProgress] = useState<AnalysisProgress | null>(null);

  const handleSelectFolder = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker();
      if (!handle) return;

      setLoading(true);
      setProgress(null);
      setProjectName(handle.name);
      const results = await analyzeProject(handle, (p) => setProgress(p));
      setStats(results);
    } catch (err) {
      console.error("Error al seleccionar carpeta:", err);
    } finally {
      setLoading(false);
    }
  };

  const cost = useMemo(() => {
    if (!stats) return 0;
    return (stats.estimatedTokens / tokenUnit) * price;
  }, [stats, price, tokenUnit]);

  const recommendations = useMemo(() => {
    if (!stats) return [];
    return buildRecommendations(stats, cost);
  }, [stats, cost]);

  const levelIcon = (level: Recommendation['level']) => {
    if (level === 'ok') return <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    if (level === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    return <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />;
  };

  const levelBg = (level: Recommendation['level']) => {
    if (level === 'ok') return 'bg-emerald-500/5 border-emerald-500/20';
    if (level === 'warn') return 'bg-amber-500/5 border-amber-500/20';
    return 'bg-red-500/5 border-red-500/20';
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary p-4 md:p-8 lg:p-12 font-sans selection:bg-accent-primary/30">
      {/* Glows de fondo */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent-secondary/15 blur-[120px] rounded-full" />
      </div>

      <div className="max-w-7xl mx-auto flex flex-col gap-8 md:gap-12">
        {/* Navbar */}
        <nav className="flex items-center justify-between glass px-6 py-4 rounded-3xl border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/20 shadow-lg">
              <img src="/logo.png" alt="TokenCal Logo" className="w-full h-full object-cover p-1" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight heading leading-tight">
                Token<span className="text-gradient">Cal</span>
              </h1>
              <span className="text-[10px] text-text-muted font-mono uppercase tracking-[0.2em]">Context Visualizer</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {projectName && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-xs text-text-secondary">
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="font-mono max-w-[150px] truncate">{projectName}</span>
              </div>
            )}
            {stats && (
              <button
                onClick={() => generatePDF(stats, projectName, cost, tokenUnit, price)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-accent-primary/10 border border-accent-primary/30 text-accent-primary text-sm font-semibold hover:bg-accent-primary/20 transition-all"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Informe PDF</span>
              </button>
            )}
            <button
              onClick={handleSelectFolder}
              disabled={loading}
              className="group relative flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-bg-primary font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-accent-primary to-accent-secondary opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative z-10 flex items-center gap-2 group-hover:text-white transition-colors">
                {loading ? <RefreshCw className="animate-spin w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                {projectName ? 'Cambiar Carpeta' : 'Escanear Proyecto'}
              </span>
            </button>
          </div>
        </nav>

        {/* Contenido principal */}
        <AnimatePresence mode="wait">
          {!stats ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="flex-1 flex flex-col items-center justify-center py-24 text-center"
            >
              {loading && progress ? (
                <div className="w-full max-w-md bg-white/5 border border-white/10 p-8 rounded-[2.5rem] backdrop-blur-xl mb-8">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-5xl font-black text-gradient">{progress.percentage}%</span>
                    <span className="text-xs text-text-muted font-mono uppercase tracking-widest">Analizando...</span>
                  </div>
                  <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden mb-6 border border-white/5">
                    <motion.div
                      className="h-full bg-gradient-to-r from-accent-primary to-accent-secondary"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress.percentage}%` }}
                      transition={{ type: "spring", stiffness: 50 }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 text-left">
                    <p className="text-[10px] text-text-muted uppercase font-bold tracking-tight">Archivo actual:</p>
                    <p className="text-xs text-text-secondary truncate font-mono bg-white/5 p-2 rounded-lg border border-white/5">
                      {progress.currentFile}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative mb-8">
                  <div className="absolute inset-0 bg-accent-primary blur-[60px] opacity-30 animate-pulse" />
                  <div className="w-32 h-32 rounded-[2.5rem] overflow-hidden border border-white/10 relative z-10 shadow-2xl bg-bg-secondary">
                    <img src="/logo.png" alt="TokenCal Logo" className="w-full h-full object-cover p-2" />
                  </div>
                </div>
              )}

              <h2 className="text-4xl md:text-5xl font-bold heading mb-4 max-w-2xl leading-tight">
                {loading ? 'Procesando tu estructura de código...' : <>Entiende la magnitud de tu <span className="text-gradient">contexto</span> de código.</>}
              </h2>
              <p className="text-text-secondary text-lg max-w-xl mb-10 leading-relaxed">
                {loading
                  ? `Analizando ${formatNumber(progress?.filesProcessed || 0)} archivos encontrados hasta ahora.`
                  : 'Calcula tokens, identifica archivos pesados y estima costos de IA. Análisis 100% local y privado.'}
              </p>
              {!loading && (
                <div className="flex gap-4 items-center">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" /> Seguro y Privado
                  </div>
                  <div className="w-1 h-1 rounded-full bg-white/20" />
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Zap className="w-4 h-4 text-amber-500" /> Instantáneo
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="bento"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 auto-rows-auto"
            >
              {/* Box 1: Tokens */}
              <div className="md:col-span-2 md:row-span-2 glass glass-card bg-gradient-to-br from-accent-primary/10 to-transparent flex flex-col justify-between group">
                <div className="flex justify-between items-start">
                  <div className="p-4 rounded-2xl bg-accent-primary/20 text-accent-primary">
                    <Target className="w-8 h-8" />
                  </div>
                  <Tooltip text="Tokens puros que consumen los archivos de código y documentación. Si supera el límite de tu modelo (ej. 128k, 1M), necesitarás RAG (Retrieval-Augmented Generation) porque el agente perderá foco o no podrá procesar el proyecto completo.">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-text-muted opacity-60 hidden md:inline">Total para IA</span>
                  </Tooltip>
                </div>
                <div className="mt-4">
                  <h3 className="text-6xl md:text-7xl font-black heading tracking-tighter mb-2 group-hover:scale-[1.02] transition-transform origin-left">
                    {formatNumber(Math.floor(stats.estimatedTokens / 1000))}K
                  </h3>
                  <p className="text-xl font-bold text-text-secondary">Tokens de Contexto</p>
                  <p className="text-[10px] text-text-muted mt-2 border-t border-white/5 pt-4 uppercase tracking-widest">
                    Métrica de IA Principal
                  </p>
                </div>
              </div>

              {/* Box 2: Espacio Físico */}
              <div className="md:col-span-2 md:row-span-2 glass glass-card flex flex-col justify-between border-blue-500/20">
                <div className="flex gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                    <Database className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <Tooltip text="El volumen bruto del proyecto en disco. Incluye todo: código, assets e imágenes. Útil para estimar tiempos de despliegue, compresión o carga en pipelines CI/CD. No equivale al contexto de IA.">
                      <span className="text-xs text-text-muted uppercase font-mono">Espacio Físico</span>
                    </Tooltip>
                    <h4 className="text-3xl font-bold mt-0.5">{formatBytes(stats.totalSizeBytes)}</h4>
                  </div>
                </div>
                <div className="flex items-end justify-between bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition-colors">
                  <div>
                    <Tooltip text="Las IAs no indexan todos los archivos simultáneamente. Con más de 1,000 archivos, es crítico proveer un mapa de arquitectura o un índice de código para guiar al agente de forma eficiente.">
                      <span className="text-[10px] text-text-muted">Total de Archivos</span>
                    </Tooltip>
                    <span className="text-xl font-bold leading-none block mt-1">{formatNumber(stats.fileCount)}</span>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-bg-secondary">
                    <ArrowUpRight className="w-4 h-4 text-text-muted" />
                  </div>
                </div>
              </div>

              {/* Box 3: Deuda Técnica */}
              <div className="md:col-span-1 md:row-span-2 glass glass-card flex flex-col justify-between bg-amber-500/5 hover:bg-amber-500/10 transition-colors border-amber-500/20">
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500 w-fit">
                  <ListTodo className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-4xl font-bold leading-none">{stats.todoCount}</h4>
                  <Tooltip text="Cuenta los marcadores TODO, FIXME y OPTIMIZE del código. – 0–10: ✅ Óptimo. – 11–50: ⚠️ Moderado (supervisar al refactorizar). – +50: 🔴 Crítico, el agente puede introducir efectos colaterales en zonas inconclusas.">
                    <span className="text-sm font-semibold text-text-secondary">Deuda Técnica</span>
                  </Tooltip>
                  <p className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">Marcadores pendientes</p>
                </div>
              </div>

              {/* Box 4: Niveles Profundos */}
              <div className="md:col-span-1 md:row-span-2 glass glass-card flex flex-col justify-between bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20">
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500 w-fit">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-4xl font-bold leading-none">{stats.maxDepth}</h4>
                  <Tooltip text="Profundidad máxima de carpetas anidadas. – 1–4: ✅ Óptimo, estructura plana y fácil de navegar. – 5–8: ⚠️ Moderado, los imports relativos se vuelven complejos. – +8: 🔴 Crítico, los agentes fallarán al deducir la jerarquía funcional.">
                    <span className="text-sm font-semibold text-text-secondary">Niveles Profundos</span>
                  </Tooltip>
                  <p className="text-[10px] text-text-muted mt-1 uppercase tracking-wider">Complejidad Estructural</p>
                </div>
              </div>

              {/* Box 5: Calculadora de costos */}
              <div className="md:col-span-2 md:row-span-2 glass glass-card bg-accent-secondary/5 border-accent-secondary/20 relative overflow-hidden">
                <div className="relative z-10 flex flex-col justify-between h-full">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                      <Coins className="w-6 h-6 text-accent-secondary" /> Calculadora de Inversión
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text-muted uppercase">Precio x Unidad</label>
                      <input
                        type="number"
                        value={price}
                        onChange={(e) => setPrice(Number(e.target.value))}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-lg font-bold outline-none focus:border-accent-secondary focus:ring-1 focus:ring-accent-secondary/50"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-text-muted uppercase">Base (Tokens)</label>
                      <select
                        value={tokenUnit}
                        onChange={(e) => setTokenUnit(Number(e.target.value))}
                        className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-lg font-bold outline-none focus:border-accent-secondary appearance-none cursor-pointer"
                      >
                        <option value={1000} className="bg-bg-tertiary">1K (GPT-4)</option>
                        <option value={1000000} className="bg-bg-tertiary">1M (Claude)</option>
                      </select>
                    </div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl flex justify-between items-end border border-white/5">
                    <div>
                      <span className="text-xs text-text-muted mb-1 block">Costo de Ingesta Total:</span>
                      <span className="text-[9px] text-text-muted uppercase tracking-tighter opacity-60">Estimado según precio de API</span>
                    </div>
                    <span className="text-4xl font-black text-accent-secondary block leading-none tracking-tighter">
                      ${cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 6: Context Hogs */}
              <div className="md:col-span-4 glass glass-card overflow-hidden flex flex-col min-h-[420px]">
                <div className="flex items-center justify-between mb-6 p-2">
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-amber-500 fill-amber-500/10" />
                    <Tooltip text='"Devoradores de contexto": los archivos más pesados del proyecto. Alimentar un agente con estos consume tokens masivamente. Considera ignorarlos, resumirlos o dividirlos (chunks) antes del envío al modelo.'>
                      <span>Context Hogs</span>
                    </Tooltip>
                  </h3>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] font-mono text-text-muted">Top 10 Archivos</span>
                </div>
                <div className="flex-1 overflow-auto pr-2">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-bg-secondary/80 backdrop-blur-md z-10">
                      <tr className="text-text-muted border-b border-white/5">
                        <th className="pb-3 font-semibold px-2 uppercase text-[10px]">Archivo</th>
                        <th className="pb-3 font-semibold px-2 uppercase text-[10px] hidden lg:table-cell">Ruta Relativa</th>
                        <th className="pb-3 font-semibold px-2 text-right uppercase text-[10px]">Tokens</th>
                        <th className="pb-3 font-semibold px-2 text-right uppercase text-[10px]">Tamaño</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {stats.topFiles.map((file, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-all group cursor-default">
                          <td className="py-3 px-2 flex items-center gap-3 font-bold group-hover:text-accent-primary">
                            <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center font-mono text-[10px] text-text-muted group-hover:bg-accent-primary group-hover:text-white transition-colors">
                              {i + 1}
                            </div>
                            {file.name}
                          </td>
                          <td className="py-3 px-2 text-xs text-text-muted truncate max-w-[200px] hidden lg:table-cell font-mono opacity-50">
                            {file.path}
                          </td>
                          <td className="py-3 px-2 text-right font-mono text-xs text-text-secondary">
                            {formatNumber(file.tokens)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <span className="px-2 py-1 rounded-md bg-white/5 font-bold text-accent-primary text-xs">
                              {formatBytes(file.size)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Box 7: Doc Ratio */}
              <div className="md:col-span-4 glass glass-card grid grid-cols-1 md:grid-cols-3 items-center gap-8 p-8 border-accent-primary/20">
                <div className="relative flex justify-center">
                  <svg className="w-32 h-32 transform -rotate-90">
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-white/5" />
                    <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="12" fill="transparent" className="text-accent-primary"
                      strokeDasharray={364}
                      strokeDashoffset={364 - (364 * (stats.docFileCount / (stats.fileCount || 1)))}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <FileText className="w-6 h-6 text-accent-primary mb-1" />
                    <span className="text-2xl font-black">
                      {(stats.docFileCount / (stats.fileCount || 1) * 100) < 1
                        ? (stats.docFileCount / (stats.fileCount || 1) * 100).toFixed(2)
                        : (stats.docFileCount / (stats.fileCount || 1) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div className="text-center md:text-left">
                  <h4 className="text-xl font-bold flex items-center justify-center md:justify-start gap-2">
                    <Tooltip text="Mide la salud de la documentación vs código. – <2%: 🔴 Crítico, la IA deducirá la lógica leyendo código en bruto (más tokens, más alucinaciones). – 2–8%: ⚠️ Moderado. – +8%: ✅ Óptimo para agentes.">
                      <span>Doc Ratio</span>
                    </Tooltip>
                  </h4>
                  <p className="text-sm text-text-muted mt-2">
                    {stats.docFileCount} archivos de documentación frente a {stats.codeFileCount} de código fuente.
                  </p>
                  <span className="mt-4 block text-[10px] text-text-muted uppercase tracking-[0.2em] opacity-40">Salud de Documentación</span>
                </div>

                <div className="w-full flex flex-col gap-2">
                  <div className="flex justify-between text-[10px] uppercase font-bold text-text-muted border-b border-white/5 pb-2">
                    <span>Principales Extensiones</span>
                    <span>Cant.</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {(Object.entries(stats.extensionCounts) as [string, number][])
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([ext, count]) => (
                        <div key={ext} className="flex justify-between text-[11px] font-mono border-b border-white/5 last:border-0 pb-0.5">
                          <span className="text-text-secondary italic">.{ext}</span>
                          <span className="font-bold text-accent-primary">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Box 8: Recomendaciones */}
              <div className="md:col-span-4 glass glass-card flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-accent-primary" />
                    Recomendaciones de Mejora
                  </h3>
                  <button
                    onClick={() => generatePDF(stats, projectName, cost, tokenUnit, price)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-primary/10 border border-accent-primary/30 text-accent-primary text-xs font-semibold hover:bg-accent-primary/20 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar Informe PDF
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recommendations.map((rec, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`rounded-2xl border p-4 flex flex-col gap-2 ${levelBg(rec.level)}`}
                    >
                      <div className="flex items-center gap-2">
                        {levelIcon(rec.level)}
                        <span className="text-xs font-bold uppercase tracking-wider text-text-muted">
                          {rec.level === 'ok' ? 'Óptimo' : rec.level === 'warn' ? 'Moderado' : 'Crítico'}
                        </span>
                      </div>
                      <p className="text-sm font-bold leading-tight">{rec.title}</p>
                      <p className="text-[11px] text-text-muted leading-relaxed">{rec.detail}</p>
                      <div className="mt-1 pt-2 border-t border-white/5 flex gap-2">
                        <Zap className="w-3.5 h-3.5 text-accent-primary flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] text-accent-primary/80 leading-relaxed">{rec.tip}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="text-center pb-8 border-t border-white/5 pt-12">
          <p className="text-text-muted text-sm font-medium flex items-center justify-center gap-2">
            Build with <Zap className="w-3.5 h-3.5 text-accent-secondary" /> by Thian Rolon
          </p>
          <div className="flex items-center justify-center gap-6 mt-4 text-[10px] text-text-muted/40 uppercase tracking-[0.3em]">
            <span>Privacy Guarded</span>
            <span>OS Agnostic</span>
            <span>Realtime Engine</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default App;

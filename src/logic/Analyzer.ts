// Definición de tipos para los resultados del análisis
export interface ProjectFile {
  name: string;
  path: string;
  size: number;
  tokens: number;
}

export interface ProjectStats {
  totalSizeBytes: number;
  metadataSizeBytes: number;
  contextSizeBytes: number;
  estimatedTokens: number;
  fileCount: number;
  extensionCounts: Record<string, number>;
  // Nuevas métricas
  topFiles: ProjectFile[];
  todoCount: number;
  maxDepth: number;
  docFileCount: number;
  codeFileCount: number;
}


// Lista de directorios que se consideran "Metadatos" o "Gestión"
const METADATA_PATHS = [
  '.git', 'node_modules', 'dist', 'build', '.next', 'out', 'coverage', 
  '.sass-cache', '.npm', '.v8', '.DS_Store', '.cache', '.gradle', 'target'
];

// Lista de extensiones que se consideran "Contexto de Código/Docs"
const CONTEXT_EXTENSIONS = [
  'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'go', 'rs', 
  'php', 'rb', 'md', 'css', 'scss', 'html', 'json', 'yml', 'yaml', 
  'xml', 'sql', 'env', 'example', 'proto', 'graphql', 'sh', 'txt'
];

// Extensiones a ignorar (binarios, imágenes, etc.) en el "Contexto"
const IGNORED_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'pdf', 'zip', 'tar', 'gz', 
  'exe', 'dll', 'so', 'dylib', 'wav', 'mp3', 'mp4', 'mkv'
];

export interface AnalysisProgress {
  percentage: number;
  filesProcessed: number;
  totalFiles: number;
  currentFile: string;
}

export async function analyzeProject(
  directoryHandle: FileSystemDirectoryHandle,
  onProgress?: (progress: AnalysisProgress) => void
): Promise<ProjectStats> {
  const stats: ProjectStats = {
    totalSizeBytes: 0,
    metadataSizeBytes: 0,
    contextSizeBytes: 0,
    estimatedTokens: 0,
    fileCount: 0,
    extensionCounts: {},
    topFiles: [],
    todoCount: 0,
    maxDepth: 0,
    docFileCount: 0,
    codeFileCount: 0
  };

  // Paso 1: Conteo rápido para el porcentaje
  let totalFilesEstimate = 0;
  const countFiles = async (handle: FileSystemDirectoryHandle) => {
    for await (const entry of (handle as any).values()) {
      if (entry.kind === 'file') {
        totalFilesEstimate++;
      } else if (entry.kind === 'directory' && !METADATA_PATHS.includes(entry.name)) {
        await countFiles(entry as FileSystemDirectoryHandle);
      }
    }
  };

  try {
     if (onProgress) onProgress({ percentage: 0, filesProcessed: 0, totalFiles: 0, currentFile: 'Contando archivos...' });
     await countFiles(directoryHandle);
  } catch (e) {
    totalFilesEstimate = 1000; // Fallback estimate
  }

  // Paso 2: Análisis real con progreso
  let processed = 0;
  const updateProgress = (fileName: string) => {
    processed++;
    if (onProgress) {
      const percentage = Math.min(Math.round((processed / totalFilesEstimate) * 100), 99);
      onProgress({ 
        percentage, 
        filesProcessed: processed, 
        totalFiles: totalFilesEstimate,
        currentFile: fileName 
      });
    }
  };

  await scanDirectory(directoryHandle, stats, false, '', 0, updateProgress);
  
  // Ordenar Top Files por tamaño y limitar a los 10 primeros
  stats.topFiles.sort((a, b) => b.size - a.size);
  stats.topFiles = stats.topFiles.slice(0, 10);

  // Estimación simple: 1 token ≈ 4 caracteres
  stats.estimatedTokens = Math.floor(stats.contextSizeBytes / 4);

  if (onProgress) onProgress({ percentage: 100, filesProcessed: processed, totalFiles: totalFilesEstimate, currentFile: '¡Análisis completado!' });

  return stats;
}

async function scanDirectory(
  handle: FileSystemDirectoryHandle, 
  stats: ProjectStats, 
  isMetadataSubdir: boolean,
  currentPath: string,
  depth: number,
  onFileProcessed?: (fileName: string) => void
) {
  if (depth > stats.maxDepth) stats.maxDepth = depth;

  try {
    for await (const entry of (handle as any).values()) {
      try {
        const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        if (entry.kind === 'directory') {
          const isMetadata = isMetadataSubdir || METADATA_PATHS.includes(entry.name);
          await scanDirectory(entry as FileSystemDirectoryHandle, stats, isMetadata, fullPath, depth + 1, onFileProcessed);
        } else {
          const fileHandle = entry as FileSystemFileHandle;
          if (onFileProcessed) onFileProcessed(entry.name);
          const file = await fileHandle.getFile();
          const size = file.size;
          const extension = entry.name.split('.').pop()?.toLowerCase() || 'no-ext';

          stats.totalSizeBytes += size;
          stats.fileCount += 1;
          stats.extensionCounts[extension] = (stats.extensionCounts[extension] || 0) + 1;

          const isMetadata = isMetadataSubdir || METADATA_PATHS.includes(entry.name);

          if (isMetadata) {
            stats.metadataSizeBytes += size;
          } else {
            const isContext = CONTEXT_EXTENSIONS.includes(extension) || !IGNORED_EXTENSIONS.includes(extension);
            
            if (isContext) {
              stats.contextSizeBytes += size;
              
              if (['md', 'txt'].includes(extension)) {
                stats.docFileCount += 1;
              } else {
                stats.codeFileCount += 1;
              }

              stats.topFiles.push({
                name: entry.name,
                path: fullPath,
                size: size,
                tokens: Math.floor(size / 4)
              });

              if (size < 500_000) { // Reducido a 500kb para mayor fluidez
                try {
                  const text = await file.text();
                  const todoMatches = text.match(/\b(TODO|FIXME|OPTIMIZE)\b/gi);
                  if (todoMatches) {
                    stats.todoCount += todoMatches.length;
                  }
                } catch (e) {
                  // Binarios o fallos de texto ignorados
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn(`TokenCal: Error procesando entrada de archivo: ${entry.name}`, err);
        // Continuamos con el siguiente archivo
      }
    }
  } catch (err) {
    console.error(`TokenCal: Fallo crítico en escaneo de directorio: ${handle.name}`, err);
  }
}



// Utilidad para formatear el tamaño
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Utilidad para formatear números grandes con separadores
export function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

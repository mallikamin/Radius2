import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
}

// Convert base64 to ArrayBuffer
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert ArrayBuffer to base64
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Load PDF from base64 string (high resolution)
export async function loadPDFFromBase64(base64, onProgress) {
  try {
    const bytes = base64ToArrayBuffer(base64);

    const pdf = await pdfjsLib.getDocument({
      data: bytes,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
    }).promise;

    const page = await pdf.getPage(1);

    // Get original page dimensions
    const origVp = page.getViewport({ scale: 1 });

    // Use higher scale for CAD drawings with small text
    // Allow up to 8000px for maximum detail (matching Vector)
    const maxDim = 8000;
    const pdfScale = Math.min(maxDim / origVp.width, maxDim / origVp.height, 3);

    console.log('PDF render scale:', pdfScale, 'Original:', origVp.width, 'x', origVp.height);

    const vp = page.getViewport({ scale: pdfScale });
    const mapW = vp.width;
    const mapH = vp.height;

    const canvas = document.createElement('canvas');
    canvas.width = mapW;
    canvas.height = mapH;
    const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, mapW, mapH);

    // For B&W CAD: disable smoothing for crisp lines
    ctx.imageSmoothingEnabled = false;

    // Render with print intent for maximum quality
    await page.render({
      canvasContext: ctx,
      viewport: vp,
      background: 'white',
      intent: 'print' // Print intent renders at higher quality
    }).promise;

    if (onProgress) {
      onProgress({ mapW, mapH, pdfScale, pdfImg: canvas });
    }

    return { mapW, mapH, pdfScale, pdfImg: canvas, page };
  } catch (error) {
    console.error('Error loading PDF from base64:', error);
    throw error;
  }
}

// Load PDF from file input (high resolution)
export async function loadPDFFromFile(file, onProgress) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    
    return await loadPDFFromBase64(base64, onProgress);
  } catch (error) {
    console.error('Error loading PDF from file:', error);
    throw error;
  }
}

// Extract plots from PDF text content
export function extractPlots(textContent, vp, pdfScale) {
  const plots = [];
  textContent.items.forEach(item => {
    let text = item.str.trim();
    if (!text) return;
    if (text.startsWith("'") || text.startsWith('"')) {
      text = text.split('').reverse().join('');
    }
    const t = item.transform;
    const fontSize = Math.sqrt(t[0] * t[0] + t[1] * t[1]);
    const x = t[4] * pdfScale;
    const y = (vp.height / pdfScale - t[5]) * pdfScale;
    if (/^\d{1,3}[A-Za-z]?$/.test(text)) {
      const num = parseInt(text.match(/\d+/)[0]);
      if (num > 0 && num <= 999) {
        plots.push({
          id: `${text}_${Math.round(x)}_${Math.round(y)}`,
          n: text,
          x,
          y,
          w: Math.max(text.length * fontSize * pdfScale * 0.6, 15),
          h: Math.max(fontSize * pdfScale, 10)
        });
      }
    }
  });
  return plots;
}


import React, { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { loadPDFFromBase64 } from '../utils/pdfLoader';

// Minimal, Apple-like map viewer for Inventory split view
const InventoryMapViewer = forwardRef(({
  vectorProject,
  highlightedUnitNumber,
  onPlotClick,
  inventoryData = []
}, ref) => {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Map state
  const [pdfImg, setPdfImg] = useState(null);
  const [mapW, setMapW] = useState(0);
  const [mapH, setMapH] = useState(0);
  const [plots, setPlots] = useState([]);
  const [annos, setAnnos] = useState([]);
  const [plotOffsets, setPlotOffsets] = useState({});
  const [inventory, setInventory] = useState({});

  // View state
  const [scale, setScale] = useState(1);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [hoveredPlot, setHoveredPlot] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load project data
  useEffect(() => {
    if (!vectorProject) {
      setPdfImg(null);
      setPlots([]);
      setAnnos([]);
      return;
    }

    const loadMap = async () => {
      setLoading(true);
      setError(null);

      try {
        // Load PDF
        if (vectorProject.map_pdf_base64) {
          const { img, width, height } = await loadPDFFromBase64(vectorProject.map_pdf_base64);
          setPdfImg(img);
          setMapW(width);
          setMapH(height);
        }

        // Load metadata
        const meta = vectorProject.vector_metadata || {};
        setPlots(meta.plots || []);
        setAnnos(meta.annos || []);
        setPlotOffsets(meta.plotOffsets || {});
        setInventory(meta.inventory || {});

      } catch (err) {
        console.error('Error loading map:', err);
        setError('Failed to load map');
      } finally {
        setLoading(false);
      }
    };

    loadMap();
  }, [vectorProject]);

  // Fit map on load
  const fit = useCallback(() => {
    if (!containerRef.current || !mapW || !mapH) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = rect.width / mapW;
    const scaleY = rect.height / mapH;
    const newScale = Math.min(scaleX, scaleY) * 0.95;
    setScale(newScale);
    setOffX((rect.width - mapW * newScale) / 2);
    setOffY((rect.height - mapH * newScale) / 2);
  }, [mapW, mapH]);

  useEffect(() => {
    if (pdfImg) {
      setTimeout(fit, 100);
    }
  }, [pdfImg, fit]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    zoomToPlot: (unitNumber) => {
      const plot = plots.find(p => String(p.n).toLowerCase() === String(unitNumber).toLowerCase());
      if (!plot || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const fitScale = Math.min(rect.width / mapW, rect.height / mapH) * 0.95;
      const targetScale = Math.max(fitScale * 3, scale * 2, 1.5);

      const offset = plotOffsets[plot.id] || { ox: 0, oy: 0 };
      const plotX = (plot.x + offset.ox) * targetScale;
      const plotY = (plot.y + offset.oy) * targetScale;

      // Animate zoom
      setScale(targetScale);
      setOffX(rect.width / 2 - plotX);
      setOffY(rect.height / 2 - plotY);
    },
    fit,
    zoomIn: () => setScale(s => Math.min(s * 1.3, 10)),
    zoomOut: () => setScale(s => Math.max(s / 1.3, 0.1))
  }), [plots, plotOffsets, mapW, mapH, scale, fit]);

  // Screen to map coordinates
  const screenToMap = useCallback((sx, sy) => {
    return [(sx - offX) / scale, (sy - offY) / scale];
  }, [offX, offY, scale]);

  // Find plot at position
  const findPlotAt = useCallback((mx, my) => {
    for (const p of plots) {
      const offset = plotOffsets[p.id] || { ox: 0, oy: 0 };
      const drawX = p.x + offset.ox;
      const drawY = p.y + offset.oy;
      const w = p.w || 20;
      const h = p.h || 14;

      if (mx >= drawX - w/2 && mx <= drawX + w/2 &&
          my >= drawY - h/2 && my <= drawY + h/2) {
        return p;
      }
    }
    return null;
  }, [plots, plotOffsets]);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const parent = containerRef.current;
    if (!ctx || !parent) return;

    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, rect.width, rect.height);

    if (!pdfImg) return;

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;

    // Draw PDF
    ctx.drawImage(pdfImg, 0, 0);

    // Build annotation map
    const annoMap = {};
    annos.forEach(a => {
      a.plotIds?.forEach(pid => {
        annoMap[String(pid)] = a;
      });
    });

    // Build inventory status map from inventoryData prop
    const statusMap = {};
    inventoryData.forEach(inv => {
      statusMap[String(inv.unit_number).toLowerCase()] = inv.status;
    });

    // Draw plots
    plots.forEach(plot => {
      const anno = annoMap[String(plot.id)];
      const offset = plotOffsets[plot.id] || { ox: 0, oy: 0 };
      const drawX = plot.x + offset.ox;
      const drawY = plot.y + offset.oy;

      const fontSize = anno?.fontSize || 10;
      const displayText = String(plot.n);
      const textW = fontSize * displayText.length * 0.6;
      const bw = Math.max(textW + 6, 16);
      const bh = Math.max(fontSize + 4, 12);
      const bx = drawX - bw / 2;
      const by = drawY - bh / 2;

      // Get color based on inventory status
      const unitStatus = statusMap[displayText.toLowerCase()];
      let bgColor = anno?.color || '#94a3b8'; // Default gray

      if (unitStatus === 'available') bgColor = '#22c55e'; // Green
      else if (unitStatus === 'sold') bgColor = '#3b82f6'; // Blue
      else if (unitStatus === 'reserved') bgColor = '#f59e0b'; // Yellow

      // Check if highlighted
      const isHighlighted = highlightedUnitNumber &&
        String(plot.n).toLowerCase() === String(highlightedUnitNumber).toLowerCase();
      const isHovered = hoveredPlot?.id === plot.id;

      // Draw box
      ctx.fillStyle = bgColor;
      ctx.fillRect(bx, by, bw, bh);

      // Highlight effect
      if (isHighlighted) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
      } else if (isHovered) {
        ctx.strokeStyle = '#0ea5e9';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
      }

      // Draw text
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayText, drawX, drawY);
    });

    ctx.restore();
  }, [pdfImg, scale, offX, offY, plots, annos, plotOffsets, highlightedUnitNumber, hoveredPlot, inventoryData]);

  useEffect(() => {
    render();
  }, [render]);

  // Resize observer
  useEffect(() => {
    const observer = new ResizeObserver(() => render());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [render]);

  // Mouse handlers
  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    setDragging(true);
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (dragging) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      setOffX(ox => ox + dx);
      setOffY(oy => oy + dy);
      setDragStart({ x, y });
    } else {
      const [mx, my] = screenToMap(x, y);
      setHoveredPlot(findPlotAt(mx, my));
    }
  };

  const handleMouseUp = () => setDragging(false);
  const handleMouseLeave = () => {
    setDragging(false);
    setHoveredPlot(null);
  };

  const handleClick = (e) => {
    if (!onPlotClick) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const [mx, my] = screenToMap(x, y);
    const plot = findPlotAt(mx, my);
    if (plot) onPlotClick(plot.n);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.1, Math.min(10, scale * zoomFactor));

    // Zoom toward mouse position
    const [mx, my] = screenToMap(x, y);
    setScale(newScale);
    setOffX(x - mx * newScale);
    setOffY(y - my * newScale);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-slate-500">Loading map...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (!vectorProject) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm text-slate-500 mb-2">No map linked to this project</p>
          <p className="text-xs text-slate-400">Link a Vector project to see the map</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-50 overflow-hidden">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${hoveredPlot ? 'cursor-pointer' : 'cursor-grab'} ${dragging ? 'cursor-grabbing' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onWheel={handleWheel}
      />

      {/* Minimal controls */}
      <div className="absolute bottom-4 right-4 flex gap-1 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 p-1">
        <button
          onClick={() => setScale(s => Math.min(s * 1.3, 10))}
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded transition-colors"
          title="Zoom in"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
        </button>
        <button
          onClick={() => setScale(s => Math.max(s / 1.3, 0.1))}
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded transition-colors"
          title="Zoom out"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
          </svg>
        </button>
        <div className="w-px bg-slate-200"></div>
        <button
          onClick={fit}
          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded transition-colors"
          title="Fit to view"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* Hover tooltip */}
      {hoveredPlot && (
        <div className="absolute top-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-slate-200 px-3 py-2">
          <div className="text-sm font-semibold text-slate-800">Plot {hoveredPlot.n}</div>
          {inventory[hoveredPlot.n] && (
            <div className="text-xs text-slate-500 mt-0.5">
              {inventory[hoveredPlot.n].marla} Marla
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-sm border border-slate-200 px-3 py-2">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-green-500"></div>
            <span className="text-slate-600">Available</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
            <span className="text-slate-600">Sold</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm bg-amber-500"></div>
            <span className="text-slate-600">Reserved</span>
          </div>
        </div>
      </div>
    </div>
  );
});

InventoryMapViewer.displayName = 'InventoryMapViewer';

export default InventoryMapViewer;

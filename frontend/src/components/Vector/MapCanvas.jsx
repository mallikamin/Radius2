import React, { useRef, useEffect, useState, useCallback } from 'react';
import AnnotationEditor from './AnnotationEditor';

export default function MapCanvas({ vectorState, tool = 'select', setTool, displayMode = 'plot' }) {
  const canvasRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const hoveredPlotIdRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [brushPainting, setBrushPainting] = useState(false);
  const [brushAnnotationId, setBrushAnnotationId] = useState(null);
  const [eraserActive, setEraserActive] = useState(false);
  const [movingPlots, setMovingPlots] = useState(false);
  const [moveStartPos, setMoveStartPos] = useState({ x: 0, y: 0 });
  const [initialPlotPositions, setInitialPlotPositions] = useState({});
  
  // Pan sensitivity and smoothing controls
  const [panSensitivity, setPanSensitivity] = useState(0.05); // 0.01 to 0.1, default 0.05
  const [panSmoothing, setPanSmoothing] = useState(0.05); // 0.01 to 0.1, default 0.05
  const smoothedDeltaRef = useRef({ x: 0, y: 0 });

  // requestAnimationFrame guard to prevent redundant redraws
  const drawRequestRef = useRef(null);

  // Screen to map coordinates conversion
  const screenToMap = useCallback((sx, sy) => {
    const mx = (sx - offX) / scale;
    const my = (sy - offY) / scale;
    return [mx, my];
  }, [offX, offY, scale]);

  // Find plot at coordinates (check both plot position and annotation position for hover)
  // When multiple plots overlap, prefer manual over auto-extracted
  const findPlotAt = useCallback((mx, my, checkAnnotation = false) => {
    let bestMatch = null;

    // First check annotation positions (where annotations are drawn)
    if (checkAnnotation) {
      for (const p of vectorState.plots) {
        const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
        const drawX = p.x + offset.ox;
        const drawY = p.y + offset.oy;
        const w = p.w || 20;
        const h = p.h || 14;

        if (mx >= drawX - w/2 && mx <= drawX + w/2 &&
            my >= drawY - h/2 && my <= drawY + h/2) {
          // Prefer manual plot over auto when both match
          if (!bestMatch || (p.manual && !bestMatch.manual)) {
            bestMatch = p;
          }
        }
      }
      if (bestMatch) return bestMatch;
    }

    // Then check actual plot positions — prefer manual over auto
    bestMatch = null;
    for (const p of vectorState.plots) {
      const w = p.w || 20;
      const h = p.h || 14;

      if (mx >= p.x - w/2 && mx <= p.x + w/2 &&
          my >= p.y - h/2 && my <= p.y + h/2) {
        if (!bestMatch || (p.manual && !bestMatch.manual)) {
          bestMatch = p;
        }
      }
    }
    return bestMatch;
  }, [vectorState.plots, vectorState.plotOffsets]);

  // Find annotation at coordinates (click on annotation box)
  const findAnnotationAt = useCallback((mx, my) => {
    // Build annotation map with string keys for type-flexible matching
    const annoMap = {};
    vectorState.annos.forEach(a => {
      a.plotIds.forEach(pid => {
        annoMap[String(pid)] = a;
      });
    });

    for (const p of vectorState.plots) {
      // Use string conversion for type-flexible lookup
      const anno = annoMap[String(p.id)];
      if (!anno) continue;

      const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
      const drawX = p.x + offset.ox;
      const drawY = p.y + offset.oy;
      
      const fontSize = anno.fontSize || 12;
      const displayText = p.n;
      const textW = fontSize * displayText.length * 0.6; // Approximate
      const bw = Math.max(textW + 6, 16);
      const bh = Math.max(fontSize + 4, 12);

      const bx = drawX - bw / 2;
      const by = drawY - bh / 2;

      // Check if click is on annotation box
      if (mx >= bx && mx <= bx + bw && my >= by && my <= by + bh) {
        return anno;
      }
    }
    return null;
  }, [vectorState.plots, vectorState.annos, vectorState.plotOffsets]);

  // Render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx || !vectorState.pdfImg) return;

    // Set canvas size with proper DPR handling
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    // Set actual canvas size (for rendering)
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Set display size (CSS)
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    
    // Scale context to handle DPR
    ctx.scale(dpr, dpr);

    // Clear canvas (use display dimensions after DPR scaling)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);

    // Disable smoothing for crisp rendering
    ctx.imageSmoothingEnabled = false;

    // Draw PDF image
    try {
      if (vectorState.pdfImg) {
        ctx.drawImage(vectorState.pdfImg, 0, 0);
      }
    } catch (err) {
      console.warn('Error drawing PDF image:', err);
      // Draw error placeholder
      ctx.fillStyle = '#f0f0f0';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = '#999';
      ctx.font = '14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Error loading map image', rect.width / 2, rect.height / 2);
    }

    // Build annotation map - PRESERVE ORDER FROM vectorState.annos
    // Order is critical and must match JSON source file order
    // Use string keys for type-flexible matching (handles number vs string IDs)
    const annoMap = {};
    vectorState.annos.forEach(a => {
      a.plotIds.forEach(pid => {
        annoMap[String(pid)] = a;
      });
    });

    // Check if we're in a specific annotation view mode
    const activeView = vectorState.activeView || 'all';
    const isFilteredView = activeView !== 'all';

    // Helper function to get display color based on view mode
    const getDisplayColor = (anno, originalColor) => {
      if (!isFilteredView || !anno) return originalColor;
      // If this annotation matches the active view, use full color
      if (anno.id === activeView) return originalColor;
      // Otherwise, return muted gray
      return '#e5e7eb'; // Light gray for muted plots
    };

    // Helper function to get opacity based on view mode
    const getDisplayOpacity = (anno, baseOpacity = 0.92) => {
      if (!isFilteredView || !anno) return baseOpacity;
      // If this annotation matches the active view, use full opacity
      if (anno.id === activeView) return baseOpacity;
      // Otherwise, use very low opacity
      return 0.3;
    };

    // Draw plots
    vectorState.plots.forEach(p => {
      try {
        // Use string conversion for type-flexible lookup
        const anno = annoMap[String(p.id)];
        const isSel = vectorState.selected.has(p.id);
        const isHovered = hoveredPlotIdRef.current === p.id;

        // Skip plots not in active annotation when filtered view is active
        if (isFilteredView) {
          if (anno && anno.id !== activeView) return;
          if (!anno) return;
        }

        // Skip non-annotated manual plots if hide setting is on
        if (vectorState.hideNonAnnotatedManualPlots && p.manual && !anno) {
          if (isSel || isHovered) {
            const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
            const drawX = p.x + offset.ox;
            const drawY = p.y + offset.oy;

            if (isHovered) {
              ctx.strokeStyle = '#0ea5e9';
              ctx.lineWidth = 2;
              ctx.setLineDash([4, 2]);
              ctx.strokeRect(drawX - 15, drawY - 10, 30, 20);
              ctx.setLineDash([]);
            }

            if (isSel) {
              ctx.strokeStyle = '#6366f1';
              ctx.lineWidth = 3;
              ctx.strokeRect(drawX - 17, drawY - 12, 34, 24);
            }
          }
          return;
        }

        // Removed: duplicate manual plot render path that drew unannotated manual plots twice
        // Manual unannotated plots are now only drawn in the single branch below (else if p.manual)

        if (anno || isSel || p.manual || isHovered) {
          const displayText = anno ? (displayMode === 'note' ? (anno.note || anno.cat || '•') : p.n) : p.n;
          const fontSize = anno ? (anno.fontSize || 12) : 10;
          ctx.font = `bold ${fontSize}px Arial`;

          const textW = ctx.measureText(displayText).width;
          const bw = Math.max(textW + 6, 16);
          const bh = Math.max(fontSize + 4, 12);

          const offset = vectorState.plotOffsets[p.id] || { ox: 0, oy: 0 };
          const drawX = p.x + offset.ox;
          const drawY = p.y + offset.oy;

          const bx = drawX - bw / 2;
          const by = drawY - bh / 2;

          // Connector line if offset
          if (anno && (offset.ox !== 0 || offset.oy !== 0)) {
            ctx.strokeStyle = getDisplayColor(anno, anno.color);
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = getDisplayOpacity(anno, 0.6);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(drawX, drawY);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = getDisplayColor(anno, anno.color);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }

          // Draw annotation box
          if (anno) {
            // Apply view mode filtering - mute non-active annotations
            ctx.fillStyle = getDisplayColor(anno, anno.color);
            ctx.globalAlpha = getDisplayOpacity(anno, 0.92);

            const plotRotation = vectorState.plotRotations[p.id] !== undefined 
              ? vectorState.plotRotations[p.id] 
              : (anno.rotation || 0);
            
            if (plotRotation !== 0) {
              ctx.save();
              ctx.translate(drawX, drawY);
              ctx.rotate(plotRotation * Math.PI / 180);
              ctx.translate(-drawX, -drawY);
            }

            ctx.fillRect(bx, by, bw, bh);

            if (plotRotation !== 0) {
              ctx.restore();
            }

            ctx.globalAlpha = 1;

            // Manual plot border
            if (p.manual) {
              ctx.strokeStyle = '#f59e0b';
              ctx.lineWidth = 2;
              ctx.setLineDash([4, 2]);
              if (plotRotation !== 0) {
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(plotRotation * Math.PI / 180);
                ctx.translate(-drawX, -drawY);
              }
              ctx.strokeRect(bx - 3, by - 3, bw + 6, bh + 6);
              if (plotRotation !== 0) {
                ctx.restore();
              }
              ctx.setLineDash([]);
            }

            // Highlight if selected or hovered
            if (isSel || isHovered) {
              ctx.strokeStyle = isHovered ? '#0ea5e9' : '#ffffff';
              ctx.lineWidth = isHovered ? 3 : 2;
              if (plotRotation !== 0) {
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(plotRotation * Math.PI / 180);
                ctx.translate(-drawX, -drawY);
              }
              ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
              if (plotRotation !== 0) {
                ctx.restore();
              }
            }

            // Draw text
            if (plotRotation !== 0) {
              ctx.save();
              ctx.translate(drawX, drawY);
              ctx.rotate(plotRotation * Math.PI / 180);
              ctx.translate(-drawX, -drawY);
            }
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayText, drawX, drawY);
            if (plotRotation !== 0) {
              ctx.restore();
            }
          } else if (isSel) {
            // Selected but not annotated
            ctx.fillStyle = '#6366f1';
            ctx.globalAlpha = 0.75;
            ctx.fillRect(bx, by, bw, bh);
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayText, drawX, drawY);
          } else if (p.manual) {
            // Manual plot - clean pill style with border
            ctx.fillStyle = '#f8f8f8';
            ctx.globalAlpha = 0.9;
            const mr = 3;
            ctx.beginPath();
            ctx.moveTo(bx + mr, by);
            ctx.lineTo(bx + bw - mr, by);
            ctx.arcTo(bx + bw, by, bx + bw, by + mr, mr);
            ctx.lineTo(bx + bw, by + bh - mr);
            ctx.arcTo(bx + bw, by + bh, bx + bw - mr, by + bh, mr);
            ctx.lineTo(bx + mr, by + bh);
            ctx.arcTo(bx, by + bh, bx, by + bh - mr, mr);
            ctx.lineTo(bx, by + mr);
            ctx.arcTo(bx, by, bx + mr, by, mr);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#374151';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(displayText, drawX, drawY);
          }

          // Inventory indicator
          if (vectorState.inventory[p.n]) {
            ctx.fillStyle = vectorState.inventory[p.n].totalValue ? '#10b981' : '#3b82f6';
            ctx.beginPath();
            ctx.arc(drawX + bw / 2 - 2, drawY - bh / 2 + 2, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } catch (err) {
        console.warn('Error rendering plot:', p.id, err);
      }
    });

    // Draw labels
    vectorState.labels.forEach(label => {
      try {
        ctx.save();
        ctx.font = `${label.size || 12}px Arial`;
        ctx.fillStyle = label.color || '#000000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(label.text, label.x, label.y);
        ctx.restore();
      } catch (err) {
        console.warn('Error rendering label:', label.id, err);
      }
    });

    // Draw shapes
    vectorState.shapes.forEach(shape => {
      try {
        ctx.save();
        ctx.strokeStyle = shape.color || '#6366f1';
        ctx.fillStyle = shape.color || '#6366f1';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.3;

        const x = shape.x;
        const y = shape.y;
        const w = shape.width || 50;
        const h = shape.height || 50;

        switch (shape.type) {
          case 'rectangle':
            ctx.fillRect(x - w/2, y - h/2, w, h);
            ctx.strokeRect(x - w/2, y - h/2, w, h);
            break;
          case 'circle':
            ctx.beginPath();
            ctx.arc(x, y, w/2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            break;
          case 'triangle':
            ctx.beginPath();
            ctx.moveTo(x, y - h/2);
            ctx.lineTo(x - w/2, y + h/2);
            ctx.lineTo(x + w/2, y + h/2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
          case 'cross':
            ctx.beginPath();
            ctx.moveTo(x - w/2, y);
            ctx.lineTo(x + w/2, y);
            ctx.moveTo(x, y - h/2);
            ctx.lineTo(x, y + h/2);
            ctx.stroke();
            break;
          case 'star':
            const points = 5;
            const outerRadius = w/2;
            const innerRadius = outerRadius * 0.5;
            ctx.beginPath();
            for (let i = 0; i < points * 2; i++) {
              const angle = (i * Math.PI) / points;
              const radius = i % 2 === 0 ? outerRadius : innerRadius;
              const px = x + Math.cos(angle) * radius;
              const py = y + Math.sin(angle) * radius;
              if (i === 0) {
                ctx.moveTo(px, py);
              } else {
                ctx.lineTo(px, py);
              }
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            break;
        }

        ctx.globalAlpha = 1;
        ctx.restore();
      } catch (err) {
        console.warn('Error rendering shape:', shape.id, err);
      }
    });

    ctx.restore();
  }, [vectorState, vectorState.annos, vectorState.plots, vectorState.plotOffsets, vectorState.activeView, scale, offX, offY, displayMode]);

  // Handle mouse move for hover
  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const [mx, my] = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
    const plot = findPlotAt(mx, my, true); // Check both plot and annotation positions for hover
    const newHoveredId = plot?.id || null;
    if (hoveredPlotIdRef.current !== newHoveredId) {
      hoveredPlotIdRef.current = newHoveredId;
      // Trigger redraw via rAF for hover highlight change
      if (drawRequestRef.current) cancelAnimationFrame(drawRequestRef.current);
      drawRequestRef.current = requestAnimationFrame(() => {
        drawRequestRef.current = null;
        render();
      });
    }

    // Show live hover details window
    if (plot && window.showHoverPlotDetails) {
      window.showHoverPlotDetails(plot.id, e.clientX, e.clientY);
    } else if (!plot && window.hideHoverPlotDetails) {
      window.hideHoverPlotDetails();
    }

    // Pan if dragging (works for both pan tool and middle mouse button)
    if (dragging && (tool === 'pan' || e.button === 1)) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      
      // Apply smoothing (exponential moving average)
      smoothedDeltaRef.current.x = dx * panSmoothing + smoothedDeltaRef.current.x * (1 - panSmoothing);
      smoothedDeltaRef.current.y = dy * panSmoothing + smoothedDeltaRef.current.y * (1 - panSmoothing);
      
      // Apply sensitivity multiplier
      const finalDx = smoothedDeltaRef.current.x * panSensitivity;
      const finalDy = smoothedDeltaRef.current.y * panSensitivity;
      
      setOffX(prev => prev + finalDx);
      setOffY(prev => prev + finalDy);
      return; // Don't do other things while panning
    }

    // Move selected plots
    if (movingPlots && tool === 'select' && vectorState.selected.size > 0) {
      const rect = canvasRef.current.getBoundingClientRect();
      const [mx, my] = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
      const [startMx, startMy] = screenToMap(moveStartPos.x - rect.left, moveStartPos.y - rect.top);
      
      const dx = mx - startMx;
      const dy = my - startMy;
      
      // Update all selected plots based on their initial positions
      vectorState.selected.forEach(plotId => {
        const initialPos = initialPlotPositions[plotId];
        if (initialPos) {
          vectorState.updatePlot(plotId, {
            x: initialPos.x + dx,
            y: initialPos.y + dy
          });
        }
      });
    }

    // Brush painting — uses atomic addPlotToAnnotation (stale-closure safe)
    if (brushPainting && tool === 'brush' && brushAnnotationId && plot) {
      vectorState.addPlotToAnnotation(brushAnnotationId, plot.id, plot.n);
    }

    // Eraser (on mouse move while dragging) — uses atomic removePlotFromAnnotation
    if (eraserActive && tool === 'eraser' && plot) {
      const plotIdStr = String(plot.id);
      const anno = vectorState.annos.find(a => a.plotIds.some(pid => String(pid) === plotIdStr));
      if (anno) {
        const processedKey = `eraser_${plot.id}_${anno.id}`;
        if (!window.eraserProcessed) window.eraserProcessed = new Set();
        if (!window.eraserProcessed.has(processedKey)) {
          window.eraserProcessed.add(processedKey);
          const eraserMode = window.eraserMode || 'removePlot';
          if (eraserMode === 'removePlot') {
            vectorState.removePlotFromAnnotation(anno.id, plot.id);
          } else if (eraserMode === 'removeAnnotation') {
            vectorState.removeAnnotation(anno.id);
          }
        }
      }
    }

    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, [screenToMap, findPlotAt, dragging, brushPainting, tool, brushAnnotationId, eraserActive, movingPlots, moveStartPos, vectorState, render]);

  // Handle click
  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const [mx, my] = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
    
    // Check if clicking on annotation box first
    const anno = findAnnotationAt(mx, my);
    if (anno && tool === 'select') {
      // Double click to edit annotation
      if (e.detail === 2 || e.ctrlKey) {
        setEditingAnnotation(anno);
        return;
      }
    }

    const plot = findPlotAt(mx, my, false); // Don't check annotation position for clicking
    
    // Handle add plot tool - works anywhere on map
    if (tool === 'add') {
      let suggestedPlotNum = '';
      try {
        // Strategy: Use last manually added plot number + 1 as primary suggestion.
        // Fall back to global max plot number + 1.
        const manualPlots = vectorState.plots.filter(p => p.manual);
        const allNums = vectorState.plots
          .map(p => { const m = String(p.n).match(/^(\d+)/); return m ? parseInt(m[1]) : null; })
          .filter(n => n !== null);

        if (manualPlots.length > 0) {
          // Use the last manual plot added (highest ID = most recent)
          const lastManual = manualPlots.reduce((a, b) => (a.id > b.id ? a : b));
          const lastMatch = String(lastManual.n).match(/^(\d+)/);
          if (lastMatch) {
            const nextNum = parseInt(lastMatch[1]) + 1;
            // Check if this number already exists
            const exists = vectorState.plots.some(p => String(p.n) === String(nextNum));
            suggestedPlotNum = exists ? '' : String(nextNum);
          }
        }

        // Fallback: global max + 1
        if (!suggestedPlotNum && allNums.length > 0) {
          suggestedPlotNum = String(Math.max(...allNums) + 1);
        }
      } catch (err) {
        console.warn('Error in plot number suggestion:', err);
      }

      const plotNum = prompt('Enter plot number:' + (suggestedPlotNum ? ` (suggested: ${suggestedPlotNum})` : ''), suggestedPlotNum);
      if (plotNum && plotNum.trim()) {
        if (vectorState.pushHistory) vectorState.pushHistory();
        const newPlot = {
          id: Date.now(),
          n: plotNum.trim(),
          x: mx,
          y: my,
          w: 20,
          h: 14,
          manual: true
        };
        vectorState.addPlot(newPlot);
        vectorState.addChangeLog('Manual plot added', `Added plot: ${plotNum.trim()}`);
        // Keep tool in 'add' mode for sticky behavior - user can add multiple plots
        // Tool will reset to 'select' when user clicks another tool button or presses ESC
      }
      return; // Don't process other clicks when adding plot
    }
    
    if (plot) {
      if (tool === 'select') {
        // Guard: select must never mutate plots array
        const plotCountBefore = vectorState.plots.length;
        if (e.shiftKey || e.ctrlKey) {
          vectorState.selectPlot(plot.id, true);
        } else {
          vectorState.selectPlot(plot.id, false);
        }
        if (vectorState.plots.length !== plotCountBefore) {
          console.error('[Vector] BUG: select click mutated plots!', plotCountBefore, '->', vectorState.plots.length);
        }
        // Show plot details
        if (window.showPlotDetails) {
          window.showPlotDetails(plot.id);
        }
      }
    } else {
      if (tool === 'select' && !e.shiftKey && !e.ctrlKey) {
        vectorState.clearSelection();
      } else if (tool === 'label') {
        // Add label at click position
        const text = prompt('Enter label text:');
        if (text && text.trim()) {
          const newLabel = {
            id: Date.now(),
            text: text.trim(),
            x: mx,
            y: my,
            size: 12,
            color: '#000000'
          };
          vectorState.setLabels([...vectorState.labels, newLabel]);
          vectorState.addChangeLog('Label added', `Added label: ${text.trim()}`);
        }
      } else if (tool === 'shape') {
        // Start shape creation (will be handled in mouse down/up for drag)
        // For now, create a simple shape at click position
        const shapeType = window.currentShapeType || 'rectangle';
        const shapeColor = window.currentShapeColor || '#6366f1';
        const newShape = {
          id: Date.now(),
          type: shapeType,
          x: mx,
          y: my,
          width: 50,
          height: 50,
          color: shapeColor
        };
        vectorState.setShapes([...vectorState.shapes, newShape]);
        vectorState.addChangeLog('Shape added', `Added ${shapeType} shape`);
      }
    }
  }, [screenToMap, findPlotAt, findAnnotationAt, tool, vectorState]);

  // Handle mouse down
  const handleMouseDown = useCallback((e) => {
    // Pan with middle mouse button or pan tool
    if (tool === 'pan' || e.button === 1) {
      if (e.button === 1) e.preventDefault();
      setDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    } else if (tool === 'brush') {
      // Start brush painting — uses atomic addPlotToAnnotation
      const currentBrushAnnoId = window.currentBrushAnnotationId || null;
      if (currentBrushAnnoId) {
        setBrushAnnotationId(currentBrushAnnoId);
        setBrushPainting(true);
        const rect = canvasRef.current.getBoundingClientRect();
        const [mx, my] = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
        const plot = findPlotAt(mx, my, false);
        if (plot) {
          vectorState.addPlotToAnnotation(currentBrushAnnoId, plot.id, plot.n);
        }
      } else {
        alert('Please select an annotation to paint in the Brush Settings panel');
      }
    } else if (tool === 'eraser') {
      // Start eraser — uses atomic removePlotFromAnnotation
      setEraserActive(true);
      const rect = canvasRef.current.getBoundingClientRect();
      const [mx, my] = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
      const plot = findPlotAt(mx, my, false);
      if (plot) {
        const plotIdStr = String(plot.id);
        const anno = vectorState.annos.find(a => a.plotIds.some(pid => String(pid) === plotIdStr));
        if (anno) {
          const eraserMode = window.eraserMode || 'removePlot';
          if (eraserMode === 'removePlot') {
            vectorState.removePlotFromAnnotation(anno.id, plot.id);
          } else if (eraserMode === 'removeAnnotation') {
            vectorState.removeAnnotation(anno.id);
          }
        }
      }
    } else if (tool === 'select') {
      // Check if clicking on a selected plot - if so, start moving
      const rect = canvasRef.current.getBoundingClientRect();
      const [mx, my] = screenToMap(e.clientX - rect.left, e.clientY - rect.top);
      const plot = findPlotAt(mx, my, false);
      
      if (plot && vectorState.selected.has(plot.id) && vectorState.selected.size > 0) {
        // Start moving selected plots - store initial positions
        const initialPositions = {};
        vectorState.selected.forEach(plotId => {
          const p = vectorState.plots.find(pl => pl.id === plotId);
          if (p) {
            initialPositions[plotId] = { x: p.x, y: p.y };
          }
        });
        setInitialPlotPositions(initialPositions);
        setMovingPlots(true);
        setMoveStartPos({ x: e.clientX, y: e.clientY });
        e.preventDefault();
      }
    }
  }, [tool, screenToMap, findPlotAt, vectorState]);

  // Handle mouse up
  const handleMouseUp = useCallback((e) => {
    if (dragging) {
      setDragging(false);
      // Reset smoothed delta when panning stops
      smoothedDeltaRef.current = { x: 0, y: 0 };
    }
    if (brushPainting) {
      setBrushPainting(false);
    }
    if (eraserActive) {
      setEraserActive(false);
      // Clear processed set
      if (window.eraserProcessed) {
        window.eraserProcessed.clear();
      }
    }
    if (movingPlots) {
      setMovingPlots(false);
      setInitialPlotPositions({});
      if (vectorState.selected.size > 0) {
        if (vectorState.pushHistory) vectorState.pushHistory();
        vectorState.addChangeLog('Plots moved', `Moved ${vectorState.selected.size} plot(s)`);
      }
    }
  }, [dragging, brushPainting, eraserActive, movingPlots, vectorState]);

  // Fit to screen
  const fit = useCallback(() => {
    if (!vectorState.pdfImg) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.parentElement.getBoundingClientRect();
    const scaleX = rect.width / vectorState.mapW;
    const scaleY = rect.height / vectorState.mapH;
    const newScale = Math.min(scaleX, scaleY, 1) * 0.95;
    
    setScale(newScale);
    setOffX((rect.width - vectorState.mapW * newScale) / 2);
    setOffY((rect.height - vectorState.mapH * newScale) / 2);
  }, [vectorState.pdfImg, vectorState.mapW, vectorState.mapH]);

  // Handle wheel zoom
  const handleWheel = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Zoom factor
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(5, scale * zoomFactor));

    // Zoom towards mouse position
    const [mapX, mapY] = screenToMap(mouseX, mouseY);
    const newOffX = mouseX - mapX * newScale;
    const newOffY = mouseY - mapY * newScale;

    setScale(newScale);
    setOffX(newOffX);
    setOffY(newOffY);
  }, [scale, screenToMap]);

  // Render on changes via requestAnimationFrame to prevent redundant redraws
  useEffect(() => {
    if (drawRequestRef.current) cancelAnimationFrame(drawRequestRef.current);
    drawRequestRef.current = requestAnimationFrame(() => {
      drawRequestRef.current = null;
      render();
    });
    return () => {
      if (drawRequestRef.current) cancelAnimationFrame(drawRequestRef.current);
    };
  }, [render]);

  // Add wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelHandler = (e) => {
      e.preventDefault();
      handleWheel(e);
    };

    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, [handleWheel]);

  // Zoom in/out functions
  const zoomIn = useCallback(() => {
    setScale(prev => Math.min(5, prev * 1.2));
  }, []);

  const zoomOut = useCallback(() => {
    setScale(prev => Math.max(0.1, prev / 1.2));
  }, []);

  // Expose zoom functions globally
  useEffect(() => {
    window.mapCanvasZoomIn = zoomIn;
    window.mapCanvasZoomOut = zoomOut;
    return () => {
      window.mapCanvasZoomIn = null;
      window.mapCanvasZoomOut = null;
    };
  }, [zoomIn, zoomOut]);

  // Expose zoom functions - FIXED: Now zooms IN properly
  useEffect(() => {
    window.zoomToPlot = (plotId) => {
      const plot = vectorState.plots.find(p => p.id === plotId);
      if (!plot) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      // Calculate a zoom level that shows the plot clearly (zoom IN, not out)
      // Use a scale that's larger than current fit-to-screen scale
      const fitScale = Math.min(rect.width / vectorState.mapW, rect.height / vectorState.mapH) * 0.95;
      const targetScale = Math.max(fitScale * 3, scale * 2, 1.5); // Zoom in to at least 3x fit scale or 2x current scale
      
      setScale(targetScale);

      const offset = vectorState.plotOffsets[plot.id] || { ox: 0, oy: 0 };
      const plotX = (plot.x + offset.ox) * targetScale;
      const plotY = (plot.y + offset.oy) * targetScale;

      // Center the plot on screen
      setOffX(rect.width / 2 - plotX);
      setOffY(rect.height / 2 - plotY);
    };
  }, [vectorState.plots, vectorState.plotOffsets, vectorState.mapW, vectorState.mapH, scale]);

  // Fit on mount
  useEffect(() => {
    if (vectorState.pdfImg) {
      setTimeout(fit, 100);
    }
  }, [vectorState.pdfImg, fit]);

  // Expose fit function
  useEffect(() => {
    window.fitMap = fit;
  }, [fit]);

  // Expose showPlotDetails
  useEffect(() => {
    window.showPlotDetails = (plotId) => {
      if (window.onShowPlotDetails) {
        window.onShowPlotDetails(plotId);
      }
    };
  }, []);

  // Expose annotation editor
  useEffect(() => {
    window.openAnnotationEditor = (annoId) => {
      const anno = vectorState.annos.find(a => a.id === annoId);
      if (anno) {
        setEditingAnnotation(anno);
      }
    };
    return () => {
      window.openAnnotationEditor = null;
    };
  }, [vectorState.annos]);

  // Expose pan controls
  useEffect(() => {
    window.setPanSensitivity = setPanSensitivity;
    window.setPanSmoothing = setPanSmoothing;
    window.getPanSensitivity = () => panSensitivity;
    window.getPanSmoothing = () => panSmoothing;
    return () => {
      window.setPanSensitivity = null;
      window.setPanSmoothing = null;
      window.getPanSensitivity = null;
      window.getPanSmoothing = null;
    };
  }, [panSensitivity, panSmoothing]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        style={{ 
          cursor: dragging ? 'grabbing' : (tool === 'pan' ? 'grab' : (tool === 'brush' ? 'crosshair' : (tool === 'eraser' ? 'cell' : (movingPlots ? 'grabbing' : (tool === 'select' && vectorState.selected.size > 0 ? 'move' : 'default'))))),
          display: 'block',
          touchAction: 'none'
        }}
        className="w-full h-full"
      />
      {/* Zoom Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 bg-white rounded-lg shadow-lg p-2 border border-gray-300">
        <button
          onClick={zoomIn}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={zoomOut}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={fit}
          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
          title="Fit to Screen"
        >
          ⌂
        </button>
      </div>

      {/* Annotation Editor */}
      {editingAnnotation && (
        <AnnotationEditor
          annotation={editingAnnotation}
          vectorState={vectorState}
          onClose={() => setEditingAnnotation(null)}
        />
      )}
    </div>
  );
}


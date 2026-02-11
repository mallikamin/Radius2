import { useEffect } from 'react';
import { downloadProjectJSON } from '../utils/projectLoader';

export function useKeyboardShortcuts(vectorState) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      // Save (Ctrl+S)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        downloadProjectJSON(vectorState);
        if (vectorState.addChangeLog) {
          vectorState.addChangeLog('Project saved', `Saved project: ${vectorState.projectName || 'Untitled'}`);
        }
        return;
      }

      // Select All (Ctrl+A)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        if (vectorState.selectAll) {
          vectorState.selectAll();
        } else {
          // Fallback: select all plots
          const allPlotIds = vectorState.plots.map(p => p.id);
          vectorState.setSelected(new Set(allPlotIds));
        }
        return;
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        e.preventDefault();
        vectorState.clearSelection();
        return;
      }

      // Arrow key movement for selected plots
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const moveAmount = e.shiftKey ? 10 : 1;
        let dx = 0, dy = 0;

        switch (e.key) {
          case 'ArrowLeft':  dx = -moveAmount; break;
          case 'ArrowRight': dx = moveAmount; break;
          case 'ArrowUp':    dy = -moveAmount; break;
          case 'ArrowDown':  dy = moveAmount; break;
        }

        // Move individually focused items (labels, shapes, manual plots)
        if (vectorState.selectedItem) {
          e.preventDefault();
          if (vectorState.selectedItem.type === 'manualPlot') {
            const plot = vectorState.plots.find(p => p.id === vectorState.selectedItem.id);
            if (plot) {
              vectorState.updatePlot(plot.id, { x: plot.x + dx, y: plot.y + dy });
            }
          } else if (vectorState.selectedItem.type === 'label') {
            const label = vectorState.labels.find(l => l.id === vectorState.selectedItem.id);
            if (label) {
              vectorState.setLabels(vectorState.labels.map(l =>
                l.id === label.id ? { ...l, x: l.x + dx, y: l.y + dy } : l
              ));
            }
          } else if (vectorState.selectedItem.type === 'shape') {
            const shape = vectorState.shapes.find(s => s.id === vectorState.selectedItem.id);
            if (shape) {
              vectorState.setShapes(vectorState.shapes.map(s =>
                s.id === shape.id ? { ...s, x: s.x + dx, y: s.y + dy } : s
              ));
            }
          } else if (vectorState.selectedItem.type === 'anno') {
            const plot = vectorState.plots.find(p => p.id === vectorState.selectedItem.id);
            if (plot) {
              const offset = vectorState.plotOffsets[plot.id] || { ox: 0, oy: 0 };
              vectorState.setPlotOffsets({
                ...vectorState.plotOffsets,
                [plot.id]: { ox: offset.ox + dx, oy: offset.oy + dy }
              });
            }
          }
          return;
        }

        // Move selected plots (single or multi-select) via plotOffsets
        if (vectorState.selected && vectorState.selected.size > 0) {
          e.preventDefault();
          const newOffsets = { ...vectorState.plotOffsets };
          vectorState.selected.forEach(plotId => {
            const current = newOffsets[plotId] || { ox: 0, oy: 0 };
            newOffsets[plotId] = { ox: current.ox + dx, oy: current.oy + dy };
          });
          vectorState.setPlotOffsets(newOffsets);
          return;
        }
      }

      // Undo/Redo (Ctrl+Z / Ctrl+Y)
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          // Undo functionality - to be implemented with undo stack
          console.log('Undo');
        } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          // Redo functionality - to be implemented
          console.log('Redo');
        }
      }

      // Search (Ctrl+F)
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const plotNum = prompt('Search plot number:');
        if (plotNum) {
          const plot = vectorState.plots.find(p => p.n === plotNum.trim());
          if (plot) {
            vectorState.selectPlot(plot.id, false);
            if (window.zoomToPlot) {
              window.zoomToPlot(plot.id);
            }
          } else {
            alert('Plot not found: ' + plotNum);
          }
        }
      }

      // Delete selected (Delete or Backspace)
      if ((e.key === 'Delete' || e.key === 'Backspace') && vectorState.selected.size > 0) {
        e.preventDefault();
        if (confirm(`Delete ${vectorState.selected.size} selected plot(s)?`)) {
          vectorState.selected.forEach(plotId => {
            vectorState.removePlot(plotId);
          });
          vectorState.clearSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [vectorState]);
}


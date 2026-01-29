import { useState, useCallback, useEffect } from 'react';

// Vector state management hook
export function useVectorState() {
  const [projectName, setProjectName] = useState('No Project');
  const [mapName, setMapName] = useState('Map');
  const [branches, setBranches] = useState([]);
  const [inventory, setInventory] = useState({});
  const [changeLog, setChangeLog] = useState([]);
  const [plotOffsets, setPlotOffsets] = useState({});
  const [plotRotations, setPlotRotations] = useState({});
  const [shapes, setShapes] = useState([]);
  const [annos, setAnnos] = useState([]);
  const [labels, setLabels] = useState([]);
  const [plots, setPlots] = useState([]);
  const [pdfBase64, setPdfBase64] = useState(null);
  const [pdfImg, setPdfImg] = useState(null);
  const [pdfScale, setPdfScale] = useState(1);
  const [mapW, setMapW] = useState(0);
  const [mapH, setMapH] = useState(0);
  const [creatorNotes, setCreatorNotes] = useState([]);
  const [projectMetadata, setProjectMetadata] = useState({
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    version: '8.2',
    createdBy: '',
    description: '',
    notes: []
  });
  const [legend, setLegend] = useState({
    visible: true,
    minimized: false,
    position: 'bottom-right',
    manualEntries: []
  });
  const [selected, setSelected] = useState(new Set());
  const [selectedItem, setSelectedItem] = useState(null);
  const [hideNonAnnotatedManualPlots, setHideNonAnnotatedManualPlots] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [databaseMode, setDatabaseMode] = useState(() => {
    // Load from localStorage, default to false (local mode)
    const saved = localStorage.getItem('vector_database_mode');
    return saved === 'true';
  });
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [systemBranches, setSystemBranches] = useState({ sales: {}, inventory: {} });
  const [linkedProjectId, setLinkedProjectId] = useState(null);
  const [linkedProjectName, setLinkedProjectName] = useState(null);
  const [branchVisibility, setBranchVisibility] = useState({
    master: true,
    orbit: true,
    sales: true,
    inventory: true,
    raw: true
  });

  // Active view mode: 'all' for all annotations, or annotation ID for single annotation view
  const [activeView, setActiveView] = useState('all');

  // Save database mode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('vector_database_mode', databaseMode.toString());
  }, [databaseMode]);

  // Load project data from JSON
  const loadProjectData = useCallback((data) => {
    setProjectName(data.projectName || 'No Project');
    setMapName(data.mapName || 'Map');
    // Store project ID if provided
    if (data.projectId) {
      setCurrentProjectId(data.projectId);
    }
    // Reset view mode to 'all' when loading a new project
    setActiveView('all');
    setBranches(data.branches || []);
    setInventory(data.inventory || {});
    setChangeLog(data.changeLog || []);
    // Ensure plotOffsets is an object with proper structure
    const offsets = data.plotOffsets || {};
    const normalizedOffsets = {};
    Object.keys(offsets).forEach(key => {
      const offset = offsets[key];
      if (offset && typeof offset === 'object') {
        normalizedOffsets[key] = {
          ox: parseFloat(offset.ox) || 0,
          oy: parseFloat(offset.oy) || 0
        };
      }
    });
    setPlotOffsets(normalizedOffsets);
    setPlotRotations(data.plotRotations || {});
    setShapes(data.shapes || []);
    setHasUnsavedChanges(false);
    
    // Load creator notes and metadata
    setCreatorNotes(data.creatorNotes || []);
    setProjectMetadata(data.projectMetadata || {
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      version: '8.2',
      createdBy: '',
      description: '',
      notes: []
    });
    
    // If no creator notes but there are notes in metadata
    if ((!data.creatorNotes || data.creatorNotes.length === 0) && 
        data.projectMetadata?.notes && data.projectMetadata.notes.length > 0) {
      setCreatorNotes(data.projectMetadata.notes);
    }

    // Restore legend
    if (data.legend) {
      setLegend({
        visible: data.legend.visible !== false,
        minimized: data.legend.minimized || false,
        position: data.legend.position || 'bottom-right',
        manualEntries: data.legend.manualEntries || []
      });
    }

    // Load plots FIRST so we can match annotations to them
    const loadedPlots = [];
    if (data.plots) {
      data.plots.forEach(plot => {
        loadedPlots.push({
          ...plot,
          w: plot.w || 20,
          h: plot.h || 14,
          manual: plot.manual || false,
          x: parseFloat(plot.x) || 0,
          y: parseFloat(plot.y) || 0
        });
      });
    }
    setPlots(loadedPlots);
    console.log('loadProjectData: Plots loaded:', loadedPlots.length, 'First plot ID:', loadedPlots[0]?.id);

    // Debug: Show what plot IDs exist for annotation matching
    console.log('loadProjectData: Plot IDs available:', loadedPlots.slice(0, 5).map(p => p.id));

    // Validate plot ID types for debugging type mismatches
    if (loadedPlots.length > 0) {
      const plotIdTypes = new Set(loadedPlots.map(p => typeof p.id));
      console.log('loadProjectData: Plot ID types:', [...plotIdTypes]);
      if (plotIdTypes.size > 1) {
        console.warn('loadProjectData: ⚠ Mixed plot ID types detected! This may cause matching issues.');
      }
    }

    // Process annotations - PRESERVE EXACT STRUCTURE AND ORDER
    // CRITICAL: Annotations must be preserved EXACTLY as saved - this is how Vector works
    // Vector preserves annotations exactly as they are, including all properties and plotIds
    const plotIdSet = new Set(loadedPlots.map(p => p.id));
    const rawAnnos = data.annos || [];

    console.log('loadProjectData: Processing annotations:', {
      count: rawAnnos.length,
      plotsCount: loadedPlots.length,
      sample: rawAnnos.slice(0, 1) // Show first annotation for debugging
    });

    // Helper function for type-flexible plot ID matching
    const plotIdMatches = (plotId, annoPlotId) => {
      return plotId === annoPlotId || String(plotId) === String(annoPlotId);
    };

    // Debug: Verify annotation plotIds match available plot IDs (with type-flexible matching)
    if (rawAnnos.length > 0 && rawAnnos[0]?.plotIds) {
      const firstAnnoPlotIds = rawAnnos[0].plotIds;
      // Try exact match first, then string conversion
      const matchingIds = firstAnnoPlotIds.filter(id =>
        plotIdSet.has(id) || [...plotIdSet].some(pid => String(pid) === String(id))
      );
      console.log('loadProjectData: First annotation plotIds:', firstAnnoPlotIds);
      console.log('loadProjectData: Matching plot IDs:', matchingIds.length, '/', firstAnnoPlotIds.length);
      if (matchingIds.length === 0 && firstAnnoPlotIds.length > 0) {
        console.warn('loadProjectData: ⚠ No plotIds match! Annotations may not render correctly.');
        console.warn('loadProjectData: Plot ID types:', typeof loadedPlots[0]?.id, '| Anno plotId types:', typeof firstAnnoPlotIds[0]);
      } else if (matchingIds.length > 0 && matchingIds.length < firstAnnoPlotIds.length) {
        console.warn('loadProjectData: ⚠ Some plotIds not matching:', firstAnnoPlotIds.length - matchingIds.length, 'missing');
      }
    }
    
    // PRESERVE ANNOTATIONS EXACTLY AS THEY ARE - don't filter or modify unnecessarily
    // Only update plotNums for display purposes, but keep original plotIds
    const processedAnnos = rawAnnos.map((a, index) => {
      // Preserve ALL original properties - spread first to keep everything
      const processedAnno = {
        ...a, // This preserves ALL properties including any custom ones
        _originalIndex: index // Preserve original order
      };
      
      // Ensure plotIds is an array (preserve original)
      if (!processedAnno.plotIds) processedAnno.plotIds = [];
      if (!Array.isArray(processedAnno.plotIds)) processedAnno.plotIds = [];
      
      // Update plotNums for display (but don't lose original if it exists)
      if (!processedAnno.plotNums || processedAnno.plotNums.length === 0) {
        // Generate plotNums from plotIds that exist (with type-flexible matching)
        processedAnno.plotNums = processedAnno.plotIds
          .map(id => {
            // Try exact match first, then string conversion
            let plot = loadedPlots.find(p => p.id === id);
            if (!plot) {
              plot = loadedPlots.find(p => String(p.id) === String(id));
            }
            return plot ? plot.n : null;
          })
          .filter(n => n !== null);
      }
      
      // Ensure required fields exist (but don't overwrite if they do)
      if (processedAnno.rotation === undefined) processedAnno.rotation = 0;
      if (!processedAnno.color) processedAnno.color = "#6366f1";
      if (processedAnno.fontSize === undefined) processedAnno.fontSize = 12;
      
      // Log if plotIds don't match any plots (with type-flexible matching)
      const validPlotIds = processedAnno.plotIds.filter(id =>
        plotIdSet.has(id) || [...plotIdSet].some(pid => String(pid) === String(id))
      );
      if (processedAnno.plotIds.length > 0 && validPlotIds.length === 0) {
        console.warn(`loadProjectData: Annotation "${processedAnno.note || processedAnno.cat}" has plotIds that don't match any plots:`, processedAnno.plotIds);
        console.warn('loadProjectData: This annotation will be preserved but may not display correctly until plots are loaded');
      }
      
      return processedAnno;
    });
    
    console.log('loadProjectData: Processed annotations:', {
      count: processedAnnos.length,
      preserved: processedAnnos.length === rawAnnos.length,
      sample: processedAnnos.slice(0, 1)
    });
    
    // CRITICAL: Preserve exact order and count - Vector does not filter annotations
    setAnnos(processedAnnos);
    
    // Verify annotations were set correctly
    if (processedAnnos.length !== rawAnnos.length) {
      console.error('loadProjectData: ✗ ANNOTATION COUNT CHANGED!', {
        original: rawAnnos.length,
        processed: processedAnnos.length
      });
    } else {
      console.log('loadProjectData: ✓ All annotations preserved, count:', processedAnnos.length);
    }
    setLabels(data.labels || []);

    // Load system branches (auto-generated from ORBIT data)
    if (data.systemBranches) {
      setSystemBranches({
        orbit: data.systemBranches.orbit || {},
        sales: data.systemBranches.sales || {},
        inventory: data.systemBranches.inventory || {},
        reconciliation: data.systemBranches.reconciliation || {},
        raw: data.systemBranches.raw || {}
      });
    } else {
      setSystemBranches({ orbit: {}, sales: {}, inventory: {}, reconciliation: {}, raw: {} });
    }

    // Load linked project info
    if (data.linkedProjectId) {
      setLinkedProjectId(data.linkedProjectId);
    } else {
      setLinkedProjectId(null);
    }
    if (data.linkedProjectName) {
      setLinkedProjectName(data.linkedProjectName);
    } else {
      setLinkedProjectName(null);
    }

    // Store PDF base64 for later loading
    if (data.pdfBase64) {
      console.log('loadProjectData: Setting pdfBase64, length:', data.pdfBase64.length);
      setPdfBase64(data.pdfBase64);
    } else {
      console.log('loadProjectData: No pdfBase64 in data');
    }
  }, []);

  // Add plot
  const addPlot = useCallback((plot) => {
    setPlots(prev => [...prev, plot]);
  }, []);

  // Update plot
  const updatePlot = useCallback((plotId, updates) => {
    setPlots(prev => prev.map(p => p.id === plotId ? { ...p, ...updates } : p));
  }, []);

  // Remove plot
  const removePlot = useCallback((plotId) => {
    setPlots(prev => prev.filter(p => p.id !== plotId));
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(plotId);
      return next;
    });
  }, []);

  // Add annotation
  const addAnnotation = useCallback((anno) => {
    setAnnos(prev => [...prev, anno]);
    setHasUnsavedChanges(true);
  }, []);

  // Update annotation - PRESERVE ORDER
  const updateAnnotation = useCallback((annoId, updates) => {
    setAnnos(prev => prev.map(a => a.id === annoId ? { ...a, ...updates } : a)); // map preserves order
  }, []);

  // Remove annotation
  const removeAnnotation = useCallback((annoId) => {
    setAnnos(prev => prev.filter(a => a.id !== annoId));
  }, []);

  // Update inventory
  const updateInventory = useCallback((plotNum, data) => {
    setInventory(prev => ({ ...prev, [plotNum]: { ...prev[plotNum], ...data } }));
  }, []);

  // Add to change log
  const addChangeLog = useCallback((action, details) => {
    setChangeLog(prev => [...prev, {
      timestamp: new Date().toISOString(),
      action,
      details
    }]);
  }, []);

  // Add creator note
  const addCreatorNote = useCallback((note) => {
    if (!note || !note.trim()) return;
    setCreatorNotes(prev => [...prev, {
      id: Date.now(),
      text: note.trim(),
      timestamp: new Date().toISOString()
    }]);
    addChangeLog('Creator note added', note.trim());
  }, [addChangeLog]);

  // Remove creator note
  const removeCreatorNote = useCallback((noteId) => {
    setCreatorNotes(prev => prev.filter(n => n.id !== noteId));
    addChangeLog('Creator note removed', `Note ID: ${noteId}`);
  }, [addChangeLog]);

  // Clear change log
  const clearChangeLog = useCallback(() => {
    setChangeLog([]);
  }, []);

  // Select plot
  const selectPlot = useCallback((plotId, multi = false) => {
    setSelected(prev => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(plotId)) {
          next.delete(plotId);
        } else {
          next.add(plotId);
        }
        return next;
      } else {
        return new Set([plotId]);
      }
    });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setSelectedItem(null);
  }, []);

  // Select all plots
  const selectAll = useCallback(() => {
    const allPlotIds = plots.map(p => p.id);
    setSelected(new Set(allPlotIds));
    addChangeLog('Select all', `Selected ${allPlotIds.length} plots`);
  }, [plots, addChangeLog]);

  // Select by range (e.g., "1-10")
  const selectByRange = useCallback((start, end) => {
    const plotNums = [];
    for (let i = start; i <= end; i++) {
      plotNums.push(String(i));
    }
    const matchingPlots = plots.filter(p => plotNums.includes(String(p.n)));
    const plotIds = matchingPlots.map(p => p.id);
    setSelected(new Set(plotIds));
    addChangeLog('Select by range', `Selected ${plotIds.length} plots (${start}-${end})`);
  }, [plots, addChangeLog]);

  // Select by list (e.g., "1,2,3,5-10")
  const selectByList = useCallback((listStr) => {
    // Parse the list string
    const parts = listStr.split(',');
    const plotNums = [];
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      
      if (trimmed.includes('-')) {
        // Range
        const [start, end] = trimmed.split('-').map(s => parseInt(s.trim(), 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            plotNums.push(String(i));
          }
        }
      } else {
        // Single number
        plotNums.push(trimmed);
      }
    }
    
    const matchingPlots = plots.filter(p => plotNums.includes(String(p.n)));
    const plotIds = matchingPlots.map(p => p.id);
    setSelected(new Set(plotIds));
    addChangeLog('Select by list', `Selected ${plotIds.length} plots`);
  }, [plots, addChangeLog]);

  // Add to selection
  const addToSelection = useCallback((plotIds) => {
    setSelected(prev => {
      const next = new Set(prev);
      plotIds.forEach(id => next.add(id));
      return next;
    });
    addChangeLog('Add to selection', `Added ${plotIds.length} plots to selection`);
  }, [addChangeLog]);

  // Remove from selection
  const removeFromSelection = useCallback((plotIds) => {
    setSelected(prev => {
      const next = new Set(prev);
      plotIds.forEach(id => next.delete(id));
      return next;
    });
    addChangeLog('Remove from selection', `Removed ${plotIds.length} plots from selection`);
  }, [addChangeLog]);

  // Mass rename plots
  const massRenamePlots = useCallback((renameMatches) => {
    // Create mapping of old names to new names
    const nameMap = {};
    renameMatches.forEach(match => {
      nameMap[match.oldName] = match.newName;
    });
    
    // Update plots
    setPlots(prev => prev.map(plot => {
      if (nameMap[plot.n]) {
        return { ...plot, n: nameMap[plot.n] };
      }
      return plot;
    }));
    
    // Update inventory keys
    setInventory(prev => {
      const updated = {};
      Object.keys(prev).forEach(key => {
        if (nameMap[key]) {
          updated[nameMap[key]] = prev[key];
        } else {
          updated[key] = prev[key];
        }
      });
      return updated;
    });
    
    // Update annotation plotNums
    setAnnos(prev => prev.map(anno => {
      const updatedPlotNums = (anno.plotNums || []).map(plotNum => {
        return nameMap[plotNum] || plotNum;
      });
      return { ...anno, plotNums: updatedPlotNums };
    }));
    
    addChangeLog('Mass rename', `Renamed ${renameMatches.length} plots`);
  }, [addChangeLog]);

  return {
    // State
    projectName,
    mapName,
    branches,
    inventory,
    changeLog,
    plotOffsets,
    plotRotations,
    shapes,
    annos,
    labels,
    plots,
    pdfBase64,
    pdfImg,
    pdfScale,
    mapW,
    mapH,
    creatorNotes,
    projectMetadata,
    legend,
    selected,
    selectedItem,
    hideNonAnnotatedManualPlots,
    hasUnsavedChanges,
    databaseMode,
    currentProjectId,
    systemBranches,
    linkedProjectId,
    linkedProjectName,
    branchVisibility,
    activeView,

    // Setters
    setProjectName,
    setMapName,
    setBranches,
    setInventory,
    setChangeLog,
    setPlotOffsets,
    setPlotRotations,
    setShapes,
    setAnnos,
    setLabels,
    setPlots,
    setPdfBase64,
    setPdfImg,
    setPdfScale,
    setMapW,
    setMapH,
    setCreatorNotes,
    setProjectMetadata,
    setLegend,
    setSelected,
    setSelectedItem,
    setHideNonAnnotatedManualPlots,
    setHasUnsavedChanges,
    setDatabaseMode,
    setCurrentProjectId,
    setSystemBranches,
    setLinkedProjectId,
    setLinkedProjectName,
    setBranchVisibility,
    setActiveView,

    // Actions
    loadProjectData,
    addPlot,
    updatePlot,
    removePlot,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    updateInventory,
    addChangeLog,
    clearChangeLog,
    addCreatorNote,
    removeCreatorNote,
    selectPlot,
    clearSelection,
    selectAll,
    selectByRange,
    selectByList,
    addToSelection,
    removeFromSelection,
    massRenamePlots
  };
}


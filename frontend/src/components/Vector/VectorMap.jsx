import React, { useRef, useEffect, useState } from 'react';
import { useVectorState } from '../../hooks/useVectorState';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { loadPDFFromBase64, loadPDFFromUrl, loadPDFFromFile, extractPlots, arrayBufferToBase64 } from '../../utils/pdfLoader';
import { loadProjectFile } from '../../utils/projectLoader';
import axios from 'axios';
import MapCanvas from './MapCanvas';
import PlotDetailsWindow from './PlotDetailsWindow';
import HoverPlotDetails from './HoverPlotDetails';
import LegendPanel from './LegendPanel';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';
import FilterBar from './FilterBar';
import KeyboardShortcutsOverlay from './KeyboardShortcutsOverlay';

export default function VectorMap() {
  const vectorState = useVectorState();
  const fileInputRef = useRef(null);
  const pdfBase64Ref = useRef(null); // Store pdfBase64 in ref to avoid React state async issues
  const annosRef = useRef([]); // Store annotations in ref to avoid React state async issues
  const plotsRef = useRef([]); // Store plots in ref to avoid React state async issues
  const inventoryRef = useRef({}); // Store inventory in ref to avoid React state async issues
  const currentProjectIdRef = useRef(null); // Track project ID for immediate access during save
  const projectNameRef = useRef('No Project'); // Track project name for immediate access during save
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tool, setTool] = useState('select');
  const [displayMode, setDisplayMode] = useState('plot'); // 'plot' or 'note'
  
  // Enable keyboard shortcuts
  useKeyboardShortcuts(vectorState);
  
  // Expose tool setter globally for MapCanvas
  useEffect(() => {
    window.setVectorTool = setTool;
    window.loadProjectFromDB = handleLoadProjectFromDB;
    window.saveProjectToDB = handleSaveToDatabase;
    window.exitVector = () => {
      // Go back to Radius main app - switch to projects tab
      if (window.setActiveTab) {
        window.setActiveTab('projects');
      } else if (window.location) {
        window.location.href = '/';
      }
    };
    return () => {
      window.setVectorTool = null;
      window.loadProjectFromDB = null;
      window.saveProjectToDB = null;
      window.exitVector = null;
    };
  }, []);

  // Expose zoom functions for Toolbar
  useEffect(() => {
    window.zoomIn = () => {
      if (window.mapCanvasZoomIn) window.mapCanvasZoomIn();
    };
    window.zoomOut = () => {
      if (window.mapCanvasZoomOut) window.mapCanvasZoomOut();
    };
    window.fitToScreen = () => {
      if (window.fitMap) window.fitMap();
    };
    return () => {
      window.zoomIn = null;
      window.zoomOut = null;
      window.fitToScreen = null;
    };
  }, []);

  // Sync annosRef with state to ensure annotations are available during async operations
  useEffect(() => {
    annosRef.current = vectorState.annos;
    console.log('VectorMap: annosRef updated, count:', annosRef.current?.length || 0);
  }, [vectorState.annos]);

  // Sync plotsRef with state to ensure plots are available during async operations
  useEffect(() => {
    plotsRef.current = vectorState.plots;
    console.log('VectorMap: plotsRef updated, count:', plotsRef.current?.length || 0);
  }, [vectorState.plots]);

  // Sync inventoryRef with state to ensure inventory is available during async operations
  useEffect(() => {
    inventoryRef.current = vectorState.inventory;
    console.log('VectorMap: inventoryRef updated, keys:', Object.keys(inventoryRef.current || {}).length);
  }, [vectorState.inventory]);

  // Sync currentProjectIdRef with state for immediate access during save operations
  useEffect(() => {
    currentProjectIdRef.current = vectorState.currentProjectId;
    console.log('VectorMap: currentProjectIdRef updated:', currentProjectIdRef.current);
  }, [vectorState.currentProjectId]);

  // Sync projectNameRef with state for immediate access during save operations
  useEffect(() => {
    projectNameRef.current = vectorState.projectName;
    console.log('VectorMap: projectNameRef updated:', projectNameRef.current);
  }, [vectorState.projectName]);

  // Handle new project
  const handleNewProject = () => {
    if (confirm('Create a new project? All unsaved changes will be lost.')) {
      // Ask for project name
      const projectName = prompt('Enter project name:', 'New Project');
      if (!projectName || projectName.trim() === '') {
        return; // User cancelled or entered empty name
      }

      // Reset all state and update refs immediately for sync access
      vectorState.setProjectName(projectName.trim());
      projectNameRef.current = projectName.trim(); // Immediate sync for save operations
      vectorState.setMapName('Map');
      vectorState.setCurrentProjectId(null); // Clear current project ID for new project
      currentProjectIdRef.current = null; // Immediate sync for save operations
      vectorState.setBranches([]);
      vectorState.setInventory({});
      vectorState.setChangeLog([]);
      vectorState.setPlotOffsets({});
      vectorState.setPlotRotations({});
      vectorState.setShapes([]);
      vectorState.setAnnos([]);
      vectorState.setLabels([]);
      vectorState.setPlots([]);
      vectorState.setPdfBase64(null);
      vectorState.setPdfImg(null);
      vectorState.setPdfScale(1);
      vectorState.setMapW(0);
      vectorState.setMapH(0);
      vectorState.setCreatorNotes([]);
      vectorState.setProjectMetadata({
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        version: '8.2',
        createdBy: '',
        description: '',
        notes: []
      });
      vectorState.setLegend({
        visible: true,
        minimized: false,
        position: 'bottom-right',
        manualEntries: []
      });
      vectorState.clearSelection();
      vectorState.setHasUnsavedChanges(false);
      setError(null);
      vectorState.addChangeLog('New project created', 'Started new project');
    }
  };

  // Save project to database
  const handleSaveToDatabase = async () => {
    if (!vectorState.databaseMode) {
      return; // Should not be called if database mode is off
    }

    setLoading(true);
    setError(null);

    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      // If project name is "No Project" or empty, prompt for a name
      // Use ref for immediate access (avoids React async state issues)
      let projectName = projectNameRef.current || vectorState.projectName;
      if (!projectName || projectName.trim() === '' || projectName === 'No Project') {
        const newName = prompt('Please enter a project name:', projectName === 'No Project' ? '' : 'New Project');
        if (!newName || newName.trim() === '') {
          alert('Project name is required. Save cancelled.');
          setLoading(false);
          return;
        }
        projectName = newName.trim();
        vectorState.setProjectName(projectName);
        projectNameRef.current = projectName; // Immediate sync
      }

      console.log('handleSaveToDatabase: Saving project with name:', projectName);

      // Prepare complete project data in vector_metadata (similar to JSON save)
      // Use refs as fallback to avoid React state async issues
      const annosToSave = vectorState.annos?.length > 0 ? vectorState.annos : annosRef.current || [];
      const plotsToSave = vectorState.plots?.length > 0 ? vectorState.plots : plotsRef.current || [];
      const inventoryToSave = Object.keys(vectorState.inventory || {}).length > 0
        ? vectorState.inventory
        : inventoryRef.current || {};

      const vectorMetadata = {
        plots: plotsToSave,
        plotOffsets: vectorState.plotOffsets || {},
        plotRotations: vectorState.plotRotations || {},
        inventory: inventoryToSave,
        annos: annosToSave,
        shapes: vectorState.shapes || [],
        labels: vectorState.labels || [],
        branches: vectorState.branches || [],
        creatorNotes: vectorState.creatorNotes || [],
        changeLog: vectorState.changeLog || [],
        legend: vectorState.legend || {
          visible: true,
          minimized: false,
          position: 'bottom-right',
          manualEntries: []
        },
        projectMetadata: {
          ...vectorState.projectMetadata,
          lastModified: new Date().toISOString()
        }
      };
      
      // Log what we're saving to verify all data is included
      console.log('handleSaveToDatabase: Metadata to save:', {
        plotsCount: vectorMetadata.plots.length,
        plotsSource: vectorState.plots?.length > 0 ? 'state' : 'ref',
        annosCount: vectorMetadata.annos.length,
        annosSource: vectorState.annos?.length > 0 ? 'state' : 'ref',
        inventoryKeys: Object.keys(vectorMetadata.inventory).length,
        inventorySource: Object.keys(vectorState.inventory || {}).length > 0 ? 'state' : 'ref',
        shapesCount: vectorMetadata.shapes.length,
        labelsCount: vectorMetadata.labels.length,
        branchesCount: vectorMetadata.branches.length,
        hasLegend: !!vectorMetadata.legend,
        legendEntries: vectorMetadata.legend.manualEntries?.length || 0
      });

      // CRITICAL DEBUG: Log actual plot IDs and annotation plotIds to verify they match
      const plotIdsBeingSaved = vectorMetadata.plots.slice(0, 5).map(p => p.id);
      const firstAnnoPlotIds = vectorMetadata.annos[0]?.plotIds?.slice(0, 5) || [];
      console.log('handleSaveToDatabase: PLOT ID CHECK:', {
        plotIdsSample: plotIdsBeingSaved,
        firstAnnoPlotIdsSample: firstAnnoPlotIds,
        doTheyMatch: firstAnnoPlotIds.some(id => plotIdsBeingSaved.includes(id))
      });
      
      // CRITICAL: Verify annotations are actually in state and being saved
      const stateAnnosCount = vectorState.annos?.length || 0;
      const metadataAnnosCount = vectorMetadata.annos.length;
      
      if (stateAnnosCount !== metadataAnnosCount) {
        console.error('handleSaveToDatabase: ✗ ANNOTATION COUNT MISMATCH!', {
          state: stateAnnosCount,
          metadata: metadataAnnosCount
        });
      } else if (metadataAnnosCount > 0) {
        console.log('handleSaveToDatabase: ✓ Annotations verified -', metadataAnnosCount, 'annotations will be saved');
        // Verify annotation structure
        const firstAnno = vectorMetadata.annos[0];
        console.log('handleSaveToDatabase: First annotation structure:', {
          id: firstAnno.id,
          note: firstAnno.note,
          plotIds: firstAnno.plotIds?.length || 0,
          hasAllProps: Object.keys(firstAnno)
        });
      } else {
        console.warn('handleSaveToDatabase: ⚠ No annotations to save');
      }

      // Ensure we have the PDF base64 - check both state and ref (ref is more reliable due to React async state)
      let pdfBase64FromState = vectorState.pdfBase64 || null;
      let pdfBase64FromRef = pdfBase64Ref.current || null;
      let pdfBase64ToSave = pdfBase64FromState || pdfBase64FromRef;

      console.log('handleSaveToDatabase: PDF base64 check - state:', !!pdfBase64FromState, 'ref:', !!pdfBase64FromRef, 'final:', !!pdfBase64ToSave);

      // If PDF is missing but we have a project ID, try to recover it from the server
      const existingProjectId = currentProjectIdRef.current || vectorState.currentProjectId;
      if (!pdfBase64ToSave && existingProjectId) {
        console.log('handleSaveToDatabase: Attempting to recover PDF from server for project:', existingProjectId);
        try {
          const recoveryResponse = await api.get(`/vector/projects/${existingProjectId}`);
          if (recoveryResponse.data?.pdfBase64) {
            pdfBase64ToSave = recoveryResponse.data.pdfBase64;
            // Store in ref and state for future use
            pdfBase64Ref.current = pdfBase64ToSave;
            vectorState.setPdfBase64(pdfBase64ToSave);
            console.log('handleSaveToDatabase: Recovered PDF from server, length:', pdfBase64ToSave.length);
          }
        } catch (recoveryError) {
          console.warn('handleSaveToDatabase: Could not recover PDF from server:', recoveryError.message);
        }
      }

      if (!pdfBase64ToSave) {
        console.warn('handleSaveToDatabase: No PDF base64 found in state, ref, or server. PDF will not be saved.');
        console.warn('handleSaveToDatabase: Current state - pdfImg:', !!vectorState.pdfImg, 'pdfBase64:', !!vectorState.pdfBase64);

        // Warn user but allow save - they might want to save without PDF
        const continueWithoutPdf = confirm('Warning: No PDF map found in this project. The project will be saved without the map PDF. You can load a PDF later using the "Open" button.\n\nDo you want to continue saving?');
        if (!continueWithoutPdf) {
          setLoading(false);
          return;
        }
      } else {
        console.log('handleSaveToDatabase: PDF base64 found, length:', pdfBase64ToSave.length);
        // Ensure both state and ref are synced
        if (!pdfBase64FromState) {
          console.log('handleSaveToDatabase: Updating state with pdfBase64');
          vectorState.setPdfBase64(pdfBase64ToSave);
        }
        if (!pdfBase64FromRef) {
          console.log('handleSaveToDatabase: Updating ref with pdfBase64');
          pdfBase64Ref.current = pdfBase64ToSave;
        }
      }

      const projectData = {
        name: projectName,
        map_name: vectorState.mapName || 'Map',
        map_pdf_base64: pdfBase64ToSave,
        map_size: vectorState.mapW && vectorState.mapH ? JSON.stringify({ width: vectorState.mapW, height: vectorState.mapH }) : null,
        vector_metadata: JSON.stringify(vectorMetadata)
      };

      console.log('handleSaveToDatabase: Project data to save:', { 
        name: projectData.name, 
        map_name: projectData.map_name,
        hasPdfBase64: !!projectData.map_pdf_base64,
        pdfBase64Length: projectData.map_pdf_base64 ? projectData.map_pdf_base64.length : 0,
        mapW: vectorState.mapW,
        mapH: vectorState.mapH
      });

      // Use ref for immediate access (avoids React async state issues)
      // Note: projectId was already defined earlier for PDF recovery
      const currentProjectId = currentProjectIdRef.current || vectorState.currentProjectId;

      console.log('handleSaveToDatabase: Current project ID:', currentProjectId);
      console.log('handleSaveToDatabase: Will', currentProjectId ? 'UPDATE existing project' : 'CREATE new project');

      // Create or update project
      const formData = new FormData();
      Object.keys(projectData).forEach(key => {
        if (projectData[key] !== null && projectData[key] !== undefined) {
          formData.append(key, projectData[key]);
        }
      });
      
      // Log what's being sent in formData
      console.log('handleSaveToDatabase: FormData keys:', Array.from(formData.keys()));
      const vectorMetadataStr = formData.get('vector_metadata');
      if (vectorMetadataStr) {
        try {
          const metadata = JSON.parse(vectorMetadataStr);
          console.log('handleSaveToDatabase: vector_metadata being saved:', {
            annosCount: metadata.annos?.length || 0,
            annosSample: metadata.annos?.slice(0, 2), // Show first 2 annotations
            plotsCount: metadata.plots?.length || 0,
            shapesCount: metadata.shapes?.length || 0,
            labelsCount: metadata.labels?.length || 0,
            hasLegend: !!metadata.legend,
            legendEntries: metadata.legend?.manualEntries?.length || 0
          });
          
          // Verify annotations are actually in the string
          if (metadata.annos && metadata.annos.length > 0) {
            console.log('handleSaveToDatabase: ✓ Annotations ARE in metadata, count:', metadata.annos.length);
          } else {
            console.error('handleSaveToDatabase: ✗ NO ANNOTATIONS in metadata!');
            console.error('handleSaveToDatabase: State annos at save time:', vectorState.annos?.length || 0);
          }
        } catch (e) {
          console.error('handleSaveToDatabase: Error parsing vector_metadata:', e);
        }
      } else {
        console.error('handleSaveToDatabase: ✗ vector_metadata is missing from FormData!');
      }

      let savedProjectId = currentProjectId;
      if (currentProjectId) {
        // Update existing project
        console.log('handleSaveToDatabase: Updating existing project', currentProjectId);
        const updateResponse = await api.put(`/vector/projects/${currentProjectId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        console.log('handleSaveToDatabase: Update response', updateResponse.data);
      } else {
        // Create new project
        console.log('handleSaveToDatabase: Creating new project (no existing currentProjectId)');
        const response = await api.post('/vector/projects', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        savedProjectId = response.data.id;
        console.log('handleSaveToDatabase: Created project with ID', savedProjectId);
        vectorState.setCurrentProjectId(savedProjectId);
        currentProjectIdRef.current = savedProjectId; // Immediate sync for subsequent saves
        console.log('handleSaveToDatabase: Set currentProjectId to', savedProjectId);
      }

      vectorState.setHasUnsavedChanges(false);
      vectorState.addChangeLog('Project saved to database', `Saved project: ${projectName}`);

      // Reload project list if modal is open
      if (window.refreshProjectList) {
        window.refreshProjectList();
      }

      // If this was a new project, reload it to ensure everything is synced
      // BUT: Don't reload if we just saved successfully - the data is already in state
      // Reloading can cause data loss if the backend hasn't fully committed yet
      // Only reload if explicitly needed (e.g., to sync with server-side changes)
      if (!currentProjectId || savedProjectId !== currentProjectId) {
        console.log('handleSaveToDatabase: New project created, skipping auto-reload to preserve current state');
        console.log('handleSaveToDatabase: Project saved with ID:', savedProjectId);
        console.log('handleSaveToDatabase: Current state preserved - annos:', vectorState.annos?.length || 0);
        // Don't auto-reload - the data is already in state and correct
        // User can manually reload if needed
      }
      
      alert('Project saved to database successfully!');

    } catch (err) {
      console.error('Error saving project to database:', err);
      setError('Failed to save project to database: ' + (err.response?.data?.detail || err.message));
      alert('Error saving project: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Load project from database
  const handleLoadProjectFromDB = async (projectId) => {
    if (!projectId) {
      console.error('handleLoadProjectFromDB: No project ID provided');
      setError('No project ID provided');
      alert('No project ID provided');
      return;
    }

    console.log('handleLoadProjectFromDB: Loading project', projectId);
    setLoading(true);
    setError(null);
    
    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      console.log('handleLoadProjectFromDB: Fetching project data...');
      const response = await api.get(`/vector/projects/${projectId}`);
      const data = response.data;
      
      // Validate that we have project data
      if (!data) {
        throw new Error('No project data received from server');
      }
      
      // Log what we received from backend
      console.log('handleLoadProjectFromDB: Backend response data:', {
        projectName: data.projectName,
        hasPdf: !!data.pdfBase64,
        plotsCount: data.plots?.length || 0,
        annosCount: data.annos?.length || 0,
        annosSample: data.annos?.slice(0, 2), // Show first 2 annotations
        shapesCount: data.shapes?.length || 0,
        labelsCount: data.labels?.length || 0,
        branchesCount: data.branches?.length || 0,
        hasLegend: !!data.legend,
        legendVisible: data.legend?.visible,
        legendEntries: data.legend?.manualEntries?.length || 0,
        hasInventory: !!data.inventory && Object.keys(data.inventory).length > 0,
        inventoryKeys: data.inventory ? Object.keys(data.inventory).length : 0
      });

      // CRITICAL DEBUG: Check if plot IDs from backend match annotation plotIds
      const backendPlotIds = data.plots?.slice(0, 5).map(p => p.id) || [];
      const backendFirstAnnoPlotIds = data.annos?.[0]?.plotIds?.slice(0, 5) || [];
      console.log('handleLoadProjectFromDB: BACKEND PLOT ID CHECK:', {
        plotIdsSample: backendPlotIds,
        firstAnnoPlotIdsSample: backendFirstAnnoPlotIds,
        doTheyMatch: backendFirstAnnoPlotIds.some(id => backendPlotIds.includes(id))
      });
      
      // CRITICAL: Store all data in refs BEFORE any async operations
      // This preserves data during React's async state updates

      // Store annotations in ref
      if (data.annos && data.annos.length > 0) {
        console.log('handleLoadProjectFromDB: ✓ Annotations ARE in backend response, count:', data.annos.length);
        annosRef.current = data.annos;
        console.log('handleLoadProjectFromDB: Stored', data.annos.length, 'annotations in annosRef');
      } else {
        console.error('handleLoadProjectFromDB: ✗ NO ANNOTATIONS in backend response!');
      }

      // Store plots in ref
      if (data.plots && data.plots.length > 0) {
        console.log('handleLoadProjectFromDB: ✓ Plots ARE in backend response, count:', data.plots.length);
        plotsRef.current = data.plots;
        console.log('handleLoadProjectFromDB: Stored', data.plots.length, 'plots in plotsRef');
      } else {
        console.warn('handleLoadProjectFromDB: ⚠ No plots in backend response');
      }

      // Store inventory in ref
      if (data.inventory && Object.keys(data.inventory).length > 0) {
        console.log('handleLoadProjectFromDB: ✓ Inventory IS in backend response, keys:', Object.keys(data.inventory).length);
        inventoryRef.current = data.inventory;
        console.log('handleLoadProjectFromDB: Stored inventory with', Object.keys(data.inventory).length, 'entries');
      } else {
        console.warn('handleLoadProjectFromDB: ⚠ No inventory in backend response');
      }

      // Log full data structure for debugging
      console.log('handleLoadProjectFromDB: Full data structure:', {
        annos: data.annos,
        plots: data.plots?.length,
        inventory: Object.keys(data.inventory || {}).length,
        legend: data.legend,
        shapes: data.shapes,
        labels: data.labels
      });

      // Set project ID first so it's available in loadProjectData
      vectorState.setCurrentProjectId(projectId);
      currentProjectIdRef.current = projectId; // Immediate sync for save operations
      
      // Load PDF: prefer file URL (lightweight) over base64 (legacy ~5MB inline)
      const hasPdfBase64 = !!data.pdfBase64;
      const hasMapFileUrl = !!data.mapFileUrl;

      if (hasPdfBase64 || hasMapFileUrl) {
        console.log('handleLoadProjectFromDB: Loading PDF...', { fromUrl: hasMapFileUrl, fromBase64: hasPdfBase64 });
        try {
          let result;
          const onPdfProgress = (progress) => {
            vectorState.setMapW(progress.mapW);
            vectorState.setMapH(progress.mapH);
            vectorState.setPdfScale(progress.pdfScale);
            vectorState.setPdfImg(progress.pdfImg);
          };

          if (hasMapFileUrl && !hasPdfBase64) {
            // Load from filesystem URL (no base64 in response - much lighter network payload)
            result = await loadPDFFromUrl(data.mapFileUrl, onPdfProgress);
          } else {
            // Load from base64 (legacy path or include_pdf=true was requested)
            result = await loadPDFFromBase64(data.pdfBase64, onPdfProgress);
          }

          if ((!data.plots || data.plots.length === 0) && result.page) {
            console.warn('handleLoadProjectFromDB: ⚠ NO SAVED PLOTS - extracting from PDF (this will create NEW IDs!)');
            try {
              const textContent = await result.page.getTextContent();
              const extractedPlots = extractPlots(
                textContent,
                { width: result.mapW, height: result.mapH },
                result.pdfScale
              );
              data.plots = extractedPlots;
              console.log('handleLoadProjectFromDB: Extracted', extractedPlots.length, 'plots from PDF');
            } catch (extractError) {
              console.warn('Could not extract plots from PDF:', extractError);
              data.plots = data.plots || [];
            }
          } else {
            console.log('handleLoadProjectFromDB: ✓ Using', data.plots?.length || 0, 'saved plots (not extracting from PDF)');
          }
          console.log('handleLoadProjectFromDB: PDF loaded successfully');

          // CRITICAL DEBUG: Check if plot IDs are still intact after PDF load
          console.log('handleLoadProjectFromDB: AFTER PDF LOAD - Plot IDs:', data.plots?.slice(0, 5).map(p => p.id));
        } catch (pdfError) {
          console.error('Error loading PDF:', pdfError);
          // Don't block project loading if PDF fails - continue with project data
          setError('PDF loaded but failed to render: ' + pdfError.message);
        }
      } else {
        console.log('handleLoadProjectFromDB: No PDF to load - project will load without map');
        // Even without PDF, we should still load the project data
        // Set default map dimensions if not present
        if (!data.mapW || !data.mapH) {
          vectorState.setMapW(1000);
          vectorState.setMapH(1000);
        }
      }
      
      // Add projectId to data so loadProjectData can use it
      const projectDataWithId = {
        ...data,
        projectId: projectId
      };
      
      console.log('handleLoadProjectFromDB: Loading project data...', projectDataWithId);
      
      // Load project data with error handling
      try {
        console.log('handleLoadProjectFromDB: Calling loadProjectData with:', {
          projectName: projectDataWithId.projectName,
          name: projectDataWithId.name,
          plots: projectDataWithId.plots?.length || 0,
          annos: projectDataWithId.annos?.length || 0,
          annosSample: projectDataWithId.annos?.slice(0, 1), // Show first annotation structure
          shapes: projectDataWithId.shapes?.length || 0,
          labels: projectDataWithId.labels?.length || 0,
          branches: projectDataWithId.branches?.length || 0,
          hasLegend: !!projectDataWithId.legend,
          legendEntries: projectDataWithId.legend?.manualEntries?.length || 0,
          hasInventory: !!projectDataWithId.inventory && Object.keys(projectDataWithId.inventory).length > 0,
          hasPdf: !!projectDataWithId.pdfBase64
        });
        
        // CRITICAL: Verify annotations structure before loading
        if (projectDataWithId.annos && projectDataWithId.annos.length > 0) {
          const firstAnno = projectDataWithId.annos[0];
          console.log('handleLoadProjectFromDB: First annotation structure:', {
            id: firstAnno.id,
            note: firstAnno.note,
            cat: firstAnno.cat,
            plotIds: firstAnno.plotIds,
            plotNums: firstAnno.plotNums,
            color: firstAnno.color,
            hasX: 'x' in firstAnno,
            hasY: 'y' in firstAnno,
            hasAllProps: Object.keys(firstAnno)
          });
        }
        vectorState.loadProjectData(projectDataWithId);
        console.log('handleLoadProjectFromDB: Project data loaded successfully');
      } catch (loadError) {
        console.error('Error in loadProjectData:', loadError);
        console.error('Load error stack:', loadError.stack);
        throw new Error('Failed to load project data: ' + loadError.message);
      }
      
      // Ensure project name is set correctly and update refs immediately
      if (data.projectName) {
        vectorState.setProjectName(data.projectName);
        projectNameRef.current = data.projectName; // Immediate sync
        console.log('handleLoadProjectFromDB: Set project name to', data.projectName);
      } else if (data.name) {
        // Fallback to name field if projectName not present
        vectorState.setProjectName(data.name);
        projectNameRef.current = data.name; // Immediate sync
        console.log('handleLoadProjectFromDB: Set project name to (from name field)', data.name);
      }

      // IMMEDIATE VERIFICATION & RECOVERY: Use refs for reliable data access
      // Refs were set from data before loadProjectData call

      // Verify and recover ANNOTATIONS
      const expectedAnnosCount = data.annos?.length || 0;
      const refAnnosCount = annosRef.current?.length || 0;
      console.log('handleLoadProjectFromDB: Annotation verification:', {
        expectedFromData: expectedAnnosCount,
        inRef: refAnnosCount
      });
      if (expectedAnnosCount > 0 && refAnnosCount !== expectedAnnosCount) {
        console.warn('handleLoadProjectFromDB: RECOVERING annotations from data');
        vectorState.setAnnos(data.annos);
        annosRef.current = data.annos;
      }

      // Verify and recover PLOTS
      const expectedPlotsCount = data.plots?.length || 0;
      const refPlotsCount = plotsRef.current?.length || 0;
      console.log('handleLoadProjectFromDB: Plot verification:', {
        expectedFromData: expectedPlotsCount,
        inRef: refPlotsCount
      });
      if (expectedPlotsCount > 0 && refPlotsCount !== expectedPlotsCount) {
        console.warn('handleLoadProjectFromDB: RECOVERING plots from data');
        vectorState.setPlots(data.plots);
        plotsRef.current = data.plots;
      }

      // Verify and recover INVENTORY
      const expectedInventoryCount = Object.keys(data.inventory || {}).length;
      const refInventoryCount = Object.keys(inventoryRef.current || {}).length;
      console.log('handleLoadProjectFromDB: Inventory verification:', {
        expectedFromData: expectedInventoryCount,
        inRef: refInventoryCount
      });
      if (expectedInventoryCount > 0 && refInventoryCount !== expectedInventoryCount) {
        console.warn('handleLoadProjectFromDB: RECOVERING inventory from data');
        vectorState.setInventory(data.inventory);
        inventoryRef.current = data.inventory;
      }

      // Force a re-render to ensure all data is displayed
      // This helps when React's batched updates don't trigger a re-render
      if (expectedAnnosCount > 0 || expectedPlotsCount > 0) {
        console.log('handleLoadProjectFromDB: Forcing state update to ensure render');
        // Directly set all critical data to trigger re-render
        vectorState.setAnnos(data.annos || []);
        vectorState.setPlots(data.plots || []);
        vectorState.setInventory(data.inventory || {});
      }

      vectorState.addChangeLog('Project loaded from database', `Loaded project: ${data.projectName || data.name || projectId}`);
      
      // Clear any previous errors if load was successful
      setError(null);
      console.log('handleLoadProjectFromDB: Project loaded successfully');
      
      // If no PDF was loaded, show a message to the user
      if (!data.pdfBase64) {
        alert('Project loaded successfully, but no map PDF was found. You can load a PDF map using the "Open" button.');
      }
      
    } catch (err) {
      console.error('Error loading project from database:', err);
      console.error('Error details:', err.response?.data);
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error';
      setError('Failed to load project from database: ' + errorMessage);
      alert('Error loading project: ' + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Load JSON project file
  const handleLoadProject = async (file) => {
    if (!file) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const data = await loadProjectFile(file);
      
      // CRITICAL: Preserve pdfBase64 BEFORE loading PDF (in case loadPDFFromBase64 modifies data)
      const pdfBase64ToPreserve = data.pdfBase64 || null;
      console.log('handleLoadProject: Preserving pdfBase64, length:', pdfBase64ToPreserve?.length || 0);
      
      // Store in ref for immediate access (avoids React state async issues)
      if (pdfBase64ToPreserve) {
        pdfBase64Ref.current = pdfBase64ToPreserve;
        console.log('handleLoadProject: Stored pdfBase64 in ref');
      }
      
      // If PDF base64 exists, load it FIRST to get map dimensions
      if (pdfBase64ToPreserve) {
        try {
          // Explicitly set pdfBase64 in state BEFORE loading PDF
          vectorState.setPdfBase64(pdfBase64ToPreserve);
          console.log('handleLoadProject: Set pdfBase64 in state before loading PDF');
          
          console.log('handleLoadProject: Calling loadPDFFromBase64, base64 length:', pdfBase64ToPreserve.length);
          const result = await loadPDFFromBase64(pdfBase64ToPreserve, (progress) => {
            console.log('handleLoadProject: PDF onProgress callback - mapW:', progress.mapW, 'mapH:', progress.mapH, 'pdfImg:', !!progress.pdfImg);
            vectorState.setMapW(progress.mapW);
            vectorState.setMapH(progress.mapH);
            vectorState.setPdfScale(progress.pdfScale);
            vectorState.setPdfImg(progress.pdfImg);
          });
          console.log('handleLoadProject: loadPDFFromBase64 completed, result.pdfImg:', !!result.pdfImg, 'mapW:', result.mapW, 'mapH:', result.mapH);

          // COORDINATE SCALING FIX: Scale imported coordinates to match re-rendered PDF dimensions
          // Old Vector used pdfScale cap of 4.0, Vector2 uses 3.0, causing coordinate misalignment
          const originalMapSize = data.mapSize;
          if (originalMapSize && (originalMapSize.w || originalMapSize.h)) {
            const scaleX = result.mapW / (originalMapSize.w || result.mapW);
            const scaleY = result.mapH / (originalMapSize.h || result.mapH);

            // Only scale if there's a significant difference (>0.1%)
            if (Math.abs(scaleX - 1) > 0.001 || Math.abs(scaleY - 1) > 0.001) {
              console.log('Coordinate scaling required for JSON import:', {
                originalMapSize,
                newMapSize: { w: result.mapW, h: result.mapH },
                scaleX,
                scaleY
              });

              // Scale plot coordinates
              if (data.plots && data.plots.length > 0) {
                data.plots = data.plots.map(p => ({
                  ...p,
                  x: p.x * scaleX,
                  y: p.y * scaleY,
                  w: (p.w || 20) * scaleX,
                  h: (p.h || 14) * scaleY
                }));
                console.log('Scaled', data.plots.length, 'plots');
              }

              // Scale plotOffsets (connector line offsets)
              if (data.plotOffsets && Object.keys(data.plotOffsets).length > 0) {
                const scaledOffsets = {};
                Object.keys(data.plotOffsets).forEach(key => {
                  const offset = data.plotOffsets[key];
                  scaledOffsets[key] = {
                    ox: (offset.ox || 0) * scaleX,
                    oy: (offset.oy || 0) * scaleY
                  };
                });
                data.plotOffsets = scaledOffsets;
                console.log('Scaled', Object.keys(scaledOffsets).length, 'plotOffsets');
              }

              // Scale shapes (rectangles, lines, arrows, etc.)
              if (data.shapes && data.shapes.length > 0) {
                data.shapes = data.shapes.map(shape => ({
                  ...shape,
                  x: shape.x !== undefined ? shape.x * scaleX : shape.x,
                  y: shape.y !== undefined ? shape.y * scaleY : shape.y,
                  width: shape.width !== undefined ? shape.width * scaleX : shape.width,
                  height: shape.height !== undefined ? shape.height * scaleY : shape.height,
                  points: shape.points ? shape.points.map(pt => ({
                    x: pt.x * scaleX,
                    y: pt.y * scaleY
                  })) : shape.points
                }));
                console.log('Scaled', data.shapes.length, 'shapes');
              }

              // Scale labels
              if (data.labels && data.labels.length > 0) {
                data.labels = data.labels.map(label => ({
                  ...label,
                  x: label.x !== undefined ? label.x * scaleX : label.x,
                  y: label.y !== undefined ? label.y * scaleY : label.y
                }));
                console.log('Scaled', data.labels.length, 'labels');
              }

              // Update mapSize in data to reflect new dimensions
              data.mapSize = { w: result.mapW, h: result.mapH };
              console.log('Updated mapSize to match new PDF dimensions');
            }
          }

          // Extract plots from PDF if not already in JSON
          // Allow empty plots array for blank PDFs
          if ((!data.plots || data.plots.length === 0) && result.page) {
            try {
              const textContent = await result.page.getTextContent();
              const extractedPlots = extractPlots(
                textContent,
                { width: result.mapW, height: result.mapH },
                result.pdfScale
              );
              // Add extracted plots to data so they're included when loading project data
              // If no plots found, use empty array (blank PDF is allowed)
              data.plots = extractedPlots;
            } catch (extractError) {
              console.warn('Could not extract plots from PDF (may be blank):', extractError);
              // Set empty plots array - blank PDF is allowed
              data.plots = [];
            }
          }
          
          // Ensure pdfBase64 is still set after PDF loading (both in state and ref)
          if (!vectorState.pdfBase64) {
            console.warn('handleLoadProject: pdfBase64 was lost after PDF load, restoring it');
            vectorState.setPdfBase64(pdfBase64ToPreserve);
          }
          // Always ensure ref is set
          pdfBase64Ref.current = pdfBase64ToPreserve;
        } catch (pdfError) {
          console.error('Error loading PDF:', pdfError);
          setError('PDF loaded but failed to render: ' + pdfError.message);
          // Still try to load project data even if PDF fails, but preserve pdfBase64
          if (pdfBase64ToPreserve) {
            vectorState.setPdfBase64(pdfBase64ToPreserve);
            pdfBase64Ref.current = pdfBase64ToPreserve;
          }
          try {
            vectorState.loadProjectData(data);
          } catch (loadError) {
            console.error('Error loading project data:', loadError);
            setError('Failed to load project: ' + loadError.message);
          }
        }
      }
      
      // Ensure pdfBase64 is in data object for loadProjectData
      if (pdfBase64ToPreserve && !data.pdfBase64) {
        data.pdfBase64 = pdfBase64ToPreserve;
        console.log('handleLoadProject: Restored pdfBase64 in data object');
      }
      
      // Ensure pdfBase64 is in data object for loadProjectData (in case it was lost)
      if (pdfBase64ToPreserve && !data.pdfBase64) {
        data.pdfBase64 = pdfBase64ToPreserve;
        console.log('handleLoadProject: Restored pdfBase64 in data object before loadProjectData');
      }
      
      // Load project data AFTER PDF is loaded (so we have map dimensions and plots)
      // This ensures annotations can match to plots correctly
      console.log('handleLoadProject: Loading project data, pdfBase64 present:', !!data.pdfBase64, 'Length:', data.pdfBase64?.length || 0);
      console.log('handleLoadProject: Data being loaded:', {
        projectName: data.projectName,
        annosCount: data.annos?.length || 0,
        plotsCount: data.plots?.length || 0,
        hasLegend: !!data.legend,
        currentProjectId: vectorState.currentProjectId
      });
      
      // IMPORTANT: When loading JSON into a new project, preserve the currentProjectId (null for new project)
      // Don't overwrite it with data.projectId from JSON (which would be from a different project)
      const currentProjectIdBeforeLoad = vectorState.currentProjectId;
      console.log('handleLoadProject: Preserving currentProjectId:', currentProjectIdBeforeLoad);
      
      vectorState.loadProjectData(data);
      
      // Restore the currentProjectId if it was null (new project mode)
      // Only set it if we're in new project mode (currentProjectId was null)
      if (currentProjectIdBeforeLoad === null) {
        vectorState.setCurrentProjectId(null);
        console.log('handleLoadProject: Restored currentProjectId to null (new project mode)');
      }
      
      // CRITICAL: Explicitly set pdfBase64 after loadProjectData to ensure it's preserved
      // This is a safety measure in case loadProjectData doesn't preserve it
      if (pdfBase64ToPreserve) {
        // Set it immediately in both state and ref
        vectorState.setPdfBase64(pdfBase64ToPreserve);
        pdfBase64Ref.current = pdfBase64ToPreserve;
        console.log('handleLoadProject: Explicitly set pdfBase64 after loadProjectData (state + ref)');
      }
      
      // Verify pdfBase64 was set (check ref immediately, state will update async)
      console.log('handleLoadProject: Final check - pdfBase64 in ref:', !!pdfBase64Ref.current, 'Length:', pdfBase64Ref.current?.length || 0);
      console.log('handleLoadProject: After load - currentProjectId:', vectorState.currentProjectId, 'annosCount:', vectorState.annos?.length || 0);
      
      // Add change log entry
      vectorState.addChangeLog('Project loaded', `Loaded project: ${data.projectName || file.name}`);
      
    } catch (err) {
      console.error('Error loading project:', err);
      setError('Failed to load project: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle PDF file import (blank PDF)
  const handleLoadPDF = async (file) => {
    if (!file || !file.name.endsWith('.pdf')) {
      setError('Please select a valid PDF file');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Load PDF directly
      const result = await loadPDFFromFile(file, (progress) => {
        vectorState.setMapW(progress.mapW);
        vectorState.setMapH(progress.mapH);
        vectorState.setPdfScale(progress.pdfScale);
        vectorState.setPdfImg(progress.pdfImg);
      });
      
      // Try to extract plots, but allow empty result
      let extractedPlots = [];
      if (result.page) {
        try {
          const textContent = await result.page.getTextContent();
          extractedPlots = extractPlots(
            textContent,
            { width: result.mapW, height: result.mapH },
            result.pdfScale
          );
        } catch (extractError) {
          console.warn('Could not extract plots from PDF (may be blank):', extractError);
          // Continue with empty plots array - this is allowed for blank PDFs
        }
      }
      
      // Convert PDF to base64 for saving
      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      
      // Create empty project structure
      const projectData = {
        projectName: file.name.replace('.pdf', ''),
        mapName: 'Map',
        pdfBase64: base64,
        plots: extractedPlots, // May be empty for blank PDFs
        annos: [],
        inventory: {},
        shapes: [],
        labels: [],
        branches: [],
        plotOffsets: {},
        plotRotations: {},
        creatorNotes: [],
        changeLog: [],
        legend: {
          visible: true,
          minimized: false,
          position: 'bottom-right',
          manualEntries: []
        },
        projectMetadata: {
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          version: '8.2',
          createdBy: '',
          description: '',
          notes: []
        }
      };
      
      // Load the project data
      vectorState.loadProjectData(projectData);
      
      // Add change log entry
      if (extractedPlots.length === 0) {
        vectorState.addChangeLog('Blank PDF loaded', `Loaded blank PDF: ${file.name}. You can now add plots manually.`);
      } else {
        vectorState.addChangeLog('PDF loaded', `Loaded PDF with ${extractedPlots.length} plots: ${file.name}`);
      }
      
    } catch (err) {
      console.error('Error loading PDF:', err);
      setError('Failed to load PDF: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.name.endsWith('.json')) {
      handleLoadProject(file);
    } else if (file.name.endsWith('.pdf')) {
      handleLoadPDF(file);
    } else {
      setError('Please select a valid JSON or PDF file');
    }
    // Reset input
    e.target.value = '';
  };

  // Open file dialog
  const openFileDialog = () => {
    fileInputRef.current?.click();
  };

  return (
    <div 
      className="relative bg-gray-100 overflow-hidden" 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw', 
        height: '100vh',
        zIndex: 999
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.pdf"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Toolbar */}
      <Toolbar
        onOpenProject={openFileDialog}
        onNewProject={handleNewProject}
        vectorState={vectorState}
        tool={tool}
        setTool={setTool}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        onZoomIn={() => window.zoomIn?.()}
        onZoomOut={() => window.zoomOut?.()}
        onFitToScreen={() => window.fitToScreen?.()}
      />

      {/* Sidebar */}
      <Sidebar vectorState={vectorState} />

      {/* Filter Bar */}
      <div style={{ position: 'fixed', top: '40px', left: '256px', right: 0, zIndex: 20 }}>
        <FilterBar vectorState={vectorState} />
      </div>

      {/* Main canvas area */}
      <div
        className="absolute"
        style={{
          top: '76px',
          left: '256px',
          right: 0,
          bottom: 0,
          width: 'calc(100vw - 256px)',
          height: 'calc(100vh - 76px)'
        }}
      >
        {vectorState.pdfImg ? (
          <MapCanvas
            vectorState={vectorState}
            tool={tool}
            setTool={setTool}
            displayMode={displayMode}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              {vectorState.projectName && vectorState.projectName !== 'No Project' ? (
                <>
                  <div className="text-2xl font-semibold text-gray-700 mb-2">
                    Project: {vectorState.projectName}
                  </div>
                  <div className="text-lg text-gray-600 mb-4">
                    No Map PDF Loaded
                  </div>
                  <div className="text-sm text-gray-500 mb-4">
                    {vectorState.plots?.length > 0 && `${vectorState.plots.length} plots • `}
                    {vectorState.annos?.length > 0 && `${vectorState.annos.length} annotations • `}
                    {vectorState.shapes?.length > 0 && `${vectorState.shapes.length} shapes`}
                  </div>
                </>
              ) : (
                <div className="text-2xl font-semibold text-gray-700 mb-4">
                  No Map Loaded
                </div>
              )}
              <button
                onClick={openFileDialog}
                className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium"
              >
                Load Project (JSON) or PDF Map
              </button>
              {error && (
                <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Plot Details Window */}
      <PlotDetailsWindow vectorState={vectorState} />
      
      {/* Hover Plot Details (Live) */}
      <HoverPlotDetails vectorState={vectorState} />

      {/* Legend Panel */}
      {vectorState.legend.visible && (
        <LegendPanel vectorState={vectorState} />
      )}

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcutsOverlay />

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <div className="text-lg font-semibold mb-2">Loading Project...</div>
            <div className="text-sm text-gray-600">Please wait</div>
          </div>
        </div>
      )}
    </div>
  );
}


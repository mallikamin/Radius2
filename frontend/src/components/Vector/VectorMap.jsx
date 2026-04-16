import React, { useRef, useEffect, useState } from 'react';
import { useVectorState } from '../../hooks/useVectorState';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { loadPDFFromBase64, loadPDFFromFile, extractPlots, arrayBufferToBase64 } from '../../utils/pdfLoader';
import { loadProjectFile } from '../../utils/projectLoader';
import axios from 'axios';
import MapCanvas from './MapCanvas';
import PlotDetailsWindow from './PlotDetailsWindow';
import HoverPlotDetails from './HoverPlotDetails';
import LegendPanel from './LegendPanel';
import Toolbar from './Toolbar';
import Sidebar from './Sidebar';

export default function VectorMap() {
  const vectorState = useVectorState();
  const fileInputRef = useRef(null);
  const replacePdfInputRef = useRef(null);
  const pdfBase64Ref = useRef(null); // Store pdfBase64 in ref to avoid React state async issues
  const annosRef = useRef([]); // Store annotations in ref to avoid React state async issues
  const plotsRef = useRef([]); // Store plots in ref to avoid React state async issues
  const inventoryRef = useRef({}); // Store inventory in ref to avoid React state async issues
  const currentProjectIdRef = useRef(null); // Track project ID for immediate access during save
  const projectNameRef = useRef('No Project'); // Track project name for immediate access during save
  const pdfChangedRef = useRef(false); // Track if PDF was replaced (skip sending on save if false)
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
    window.replacePDF = () => replacePdfInputRef.current?.click();
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
      window.replacePDF = null;
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

      // Prepare complete project data in vector_metadata
      // Use refs as fallback to avoid React state async issues
      const annosToSave = vectorState.annos?.length > 0 ? vectorState.annos : annosRef.current || [];
      const plotsToSave = vectorState.plots?.length > 0 ? vectorState.plots : plotsRef.current || [];
      const inventoryToSave = Object.keys(vectorState.inventory || {}).length > 0
        ? vectorState.inventory
        : inventoryRef.current || {};

      // DEBUG: Log rotation values before save
      console.log('SAVE DEBUG - Annotations with rotation:',
        annosToSave
          .filter(a => a.rotation && a.rotation !== 0)
          .map(a => ({ note: a.note, rotation: a.rotation, id: a.id }))
      );
      console.log('SAVE DEBUG - Total annotations:', annosToSave.length);

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
      
      // Quick save summary
      console.log('Save data:', vectorMetadata.plots.length, 'plots,', vectorMetadata.annos.length, 'annos,', vectorMetadata.shapes.length, 'shapes');

      // PDF handling: only include PDF in payload if it was changed/replaced
      const existingProjectId = currentProjectIdRef.current || vectorState.currentProjectId;
      let pdfBase64ToSave = null;

      if (!existingProjectId) {
        // New project — must include PDF
        pdfBase64ToSave = vectorState.pdfBase64 || pdfBase64Ref.current || null;
        if (!pdfBase64ToSave) {
          const continueWithoutPdf = confirm('No PDF map found. Save without the map?\nYou can load a PDF later.');
          if (!continueWithoutPdf) { setLoading(false); return; }
        }
      } else if (pdfChangedRef.current) {
        // Existing project, PDF was replaced — include new PDF
        pdfBase64ToSave = vectorState.pdfBase64 || pdfBase64Ref.current || null;
        console.log('Save: including replaced PDF, length:', pdfBase64ToSave?.length || 0);
      } else {
        // Existing project, PDF unchanged — skip PDF to save bandwidth
        console.log('Save: PDF unchanged, skipping from payload');
      }

      const projectData = {
        name: projectName,
        map_name: vectorState.mapName || 'Map',
        map_size: vectorState.mapW && vectorState.mapH ? JSON.stringify({ width: vectorState.mapW, height: vectorState.mapH }) : null,
        vector_metadata: JSON.stringify(vectorMetadata)
      };
      if (pdfBase64ToSave) {
        projectData.map_pdf_base64 = pdfBase64ToSave;
      }

      console.log('Save:', projectData.name, '| PDF included:', !!projectData.map_pdf_base64, '| metadata keys:', Object.keys(vectorMetadata).length);

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
      
      let savedProjectId = currentProjectId;
      if (currentProjectId) {
        await api.put(`/vector/projects/${currentProjectId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        const response = await api.post('/vector/projects', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        savedProjectId = response.data.id;
        vectorState.setCurrentProjectId(savedProjectId);
        currentProjectIdRef.current = savedProjectId;
      }

      vectorState.setHasUnsavedChanges(false);
      pdfChangedRef.current = false; // Reset after successful save
      vectorState.addChangeLog('Project saved to database', `Saved project: ${projectName}`);

      if (window.refreshProjectList) {
        window.refreshProjectList();
      }

      console.log('Saved:', savedProjectId, '| PDF sent:', !!projectData.map_pdf_base64);
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

    setLoading(true);
    setError(null);

    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const t0 = performance.now();
      const response = await api.get(`/vector/projects/${projectId}`);
      const data = response.data;
      console.log('Load: API fetch', Math.round(performance.now() - t0), 'ms');

      if (!data) throw new Error('No project data received from server');

      console.log('Load:', data.projectName, '|', data.plots?.length || 0, 'plots,', data.annos?.length || 0, 'annos, PDF:', !!data.pdfBase64);

      // DEBUG: Log rotation values after load
      if (data.annos && data.annos.length > 0) {
        const annosWithRotation = data.annos.filter(a => a.rotation && a.rotation !== 0);
        console.log('LOAD DEBUG - Annotations with rotation:',
          annosWithRotation.map(a => ({ note: a.note, rotation: a.rotation, id: a.id }))
        );
      }

      // Store all data in refs BEFORE any async operations (preserves during React batching)
      if (data.annos?.length > 0) annosRef.current = data.annos;
      if (data.plots?.length > 0) plotsRef.current = data.plots;
      if (data.inventory && Object.keys(data.inventory).length > 0) inventoryRef.current = data.inventory;

      // Set project ID first
      vectorState.setCurrentProjectId(projectId);
      currentProjectIdRef.current = projectId;
      pdfChangedRef.current = false; // Fresh load — PDF not changed

      // Load PDF if present
      if (data.pdfBase64) {
        const t1 = performance.now();
        try {
          const result = await loadPDFFromBase64(data.pdfBase64, (progress) => {
            vectorState.setMapW(progress.mapW);
            vectorState.setMapH(progress.mapH);
            vectorState.setPdfScale(progress.pdfScale);
            vectorState.setPdfImg(progress.pdfImg);
          });
          console.log('Load: PDF render', Math.round(performance.now() - t1), 'ms');

          if ((!data.plots || data.plots.length === 0) && result.page) {
            try {
              const textContent = await result.page.getTextContent();
              data.plots = extractPlots(textContent, { width: result.mapW, height: result.mapH }, result.pdfScale);
              console.log('Load: extracted', data.plots.length, 'plots from PDF');
            } catch (extractError) {
              console.warn('Could not extract plots from PDF:', extractError);
              data.plots = data.plots || [];
            }
          }
        } catch (pdfError) {
          console.error('Error loading PDF:', pdfError);
          setError('PDF failed to render: ' + pdfError.message);
        }
      } else {
        if (!data.mapW || !data.mapH) {
          vectorState.setMapW(1000);
          vectorState.setMapH(1000);
        }
      }

      // Load project data
      try {
        vectorState.loadProjectData({ ...data, projectId });
      } catch (loadError) {
        console.error('Error in loadProjectData:', loadError);
        throw new Error('Failed to load project data: ' + loadError.message);
      }

      // Set project name
      const name = data.projectName || data.name;
      if (name) {
        vectorState.setProjectName(name);
        projectNameRef.current = name;
      }

      // Verify and recover from refs if React batching lost data
      if (data.annos?.length > 0 && annosRef.current?.length !== data.annos.length) {
        vectorState.setAnnos(data.annos);
        annosRef.current = data.annos;
      }
      if (data.plots?.length > 0 && plotsRef.current?.length !== data.plots.length) {
        vectorState.setPlots(data.plots);
        plotsRef.current = data.plots;
      }
      const expectedInvCount = Object.keys(data.inventory || {}).length;
      if (expectedInvCount > 0 && Object.keys(inventoryRef.current || {}).length !== expectedInvCount) {
        vectorState.setInventory(data.inventory);
        inventoryRef.current = data.inventory;
      }

      // Force re-render for critical data
      if ((data.annos?.length || 0) > 0 || (data.plots?.length || 0) > 0) {
        vectorState.setAnnos(data.annos || []);
        vectorState.setPlots(data.plots || []);
        vectorState.setInventory(data.inventory || {});
      }

      vectorState.addChangeLog('Project loaded from database', `Loaded project: ${name || projectId}`);
      setError(null);
      console.log('Load: total', Math.round(performance.now() - t0), 'ms');

      if (!data.pdfBase64) {
        alert('Project loaded, but no map PDF found. Use "Open" to load a PDF.');
      }

    } catch (err) {
      console.error('Error loading project:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error';
      setError('Failed to load project: ' + errorMessage);
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
        pdfChangedRef.current = true; // New file load — mark PDF as changed for save
      }
      
      // If PDF base64 exists, load it FIRST to get map dimensions
      if (pdfBase64ToPreserve) {
        try {
          // Explicitly set pdfBase64 in state BEFORE loading PDF
          vectorState.setPdfBase64(pdfBase64ToPreserve);
          console.log('handleLoadProject: Set pdfBase64 in state before loading PDF');
          
          const result = await loadPDFFromBase64(pdfBase64ToPreserve, (progress) => {
            vectorState.setMapW(progress.mapW);
            vectorState.setMapH(progress.mapH);
            vectorState.setPdfScale(progress.pdfScale);
            vectorState.setPdfImg(progress.pdfImg);
          });

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
      pdfBase64Ref.current = base64;
      pdfChangedRef.current = true; // New PDF — mark as changed for save

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

  // Replace PDF for an existing project (keeps all vector metadata)
  const handleReplacePDF = async (file) => {
    if (!file || !file.name.endsWith('.pdf')) {
      alert('Please select a valid PDF file.');
      return;
    }

    if (!confirm('Replace the map PDF for this project?\nAll annotations, shapes, labels, and inventory will be kept.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await loadPDFFromFile(file, (progress) => {
        vectorState.setMapW(progress.mapW);
        vectorState.setMapH(progress.mapH);
        vectorState.setPdfScale(progress.pdfScale);
        vectorState.setPdfImg(progress.pdfImg);
      });

      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      vectorState.setPdfBase64(base64);
      pdfBase64Ref.current = base64;
      pdfChangedRef.current = true;

      vectorState.setHasUnsavedChanges(true);
      vectorState.addChangeLog('PDF replaced', `Replaced map PDF with: ${file.name}`);
      console.log('Replace PDF: done, new dimensions:', result.mapW, 'x', result.mapH);
      alert('PDF replaced. Save the project to persist changes.');
    } catch (err) {
      console.error('Error replacing PDF:', err);
      setError('Failed to replace PDF: ' + err.message);
      alert('Error replacing PDF: ' + err.message);
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
      {/* Hidden file input for PDF replacement */}
      <input
        ref={replacePdfInputRef}
        type="file"
        accept=".pdf"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) handleReplacePDF(file);
          e.target.value = '';
        }}
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
      <Sidebar vectorState={vectorState} displayMode={displayMode} />

      {/* Main canvas area */}
      <div 
        className="absolute" 
        style={{ 
          top: '40px', 
          left: '256px', 
          right: 0, 
          bottom: 0,
          width: 'calc(100vw - 256px)',
          height: 'calc(100vh - 40px)'
        }}
      >
        {/* Top Left: Tool Icons with Names */}
        {vectorState.pdfImg && (
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-2 border border-gray-200">
            <div className="flex flex-col gap-1">
              <div 
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                  tool === 'select' ? 'bg-blue-100' : 'hover:bg-gray-100'
                }`}
                onClick={() => setTool('select')}
                title="Select Tool"
              >
                <span className="text-base">👆</span>
                <span className="text-xs font-medium text-gray-700">Select</span>
              </div>
              <div 
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                  tool === 'pan' ? 'bg-blue-100' : 'hover:bg-gray-100'
                }`}
                onClick={() => setTool('pan')}
                title="Pan Tool"
              >
                <span className="text-base">✋</span>
                <span className="text-xs font-medium text-gray-700">Pan</span>
              </div>
              <div 
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors ${
                  tool === 'add' ? 'bg-blue-100' : 'hover:bg-gray-100'
                }`}
                onClick={() => setTool('add')}
                title="Add Plot"
              >
                <span className="text-base">➕</span>
                <span className="text-xs font-medium text-gray-700">Add Plot</span>
              </div>
            </div>
          </div>
        )}

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


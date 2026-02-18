import React, { useState, useEffect } from 'react';
import { downloadProjectJSON } from '../../utils/projectLoader';
import { rotateSelectedPlots } from '../../utils/plotUtils';
import axios from 'axios';

export default function Toolbar({ onOpenProject, onNewProject, vectorState, tool, setTool, displayMode, setDisplayMode, onZoomIn, onZoomOut, onFitToScreen }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectFilter, setProjectFilter] = useState('master'); // 'all', 'master', 'auto'
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  
  // Get user role for admin check
  const getUserRole = () => {
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return user.role || 'user';
      }
    } catch (e) {
      console.error('Error getting user role:', e);
    }
    return 'user';
  };
  
  const userRole = getUserRole();
  const isAdmin = userRole === 'admin';
  const canDelete = !['creator', 'viewer'].includes(userRole);

  const tools = [
    { id: 'select', label: 'Select', icon: '👆' },
    { id: 'pan', label: 'Pan', icon: '✋' },
    { id: 'add', label: '+Plot', icon: '+' },
    { id: 'label', label: '+Text', icon: 'T' },
    { id: 'shape', label: '+Shape', icon: '⬜' },
  ];

  const handleSave = () => {
    if (vectorState.databaseMode) {
      // Save to database
      if (window.saveProjectToDB) {
        window.saveProjectToDB();
      } else {
        alert('Database save not available. Please refresh the page.');
      }
    } else {
      // Save locally as JSON
      downloadProjectJSON(vectorState);
      vectorState.setHasUnsavedChanges(false);
      if (vectorState.addChangeLog) {
        vectorState.addChangeLog('Project saved', `Saved project: ${vectorState.projectName || 'Untitled'}`);
      }
    }
  };

  const handleNewProject = () => {
    if (confirm('Create a new project? All unsaved changes will be lost.')) {
      if (onNewProject) {
        onNewProject();
      }
    }
  };

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      } else if (document.documentElement.webkitRequestFullscreen) {
        document.documentElement.webkitRequestFullscreen();
      } else if (document.documentElement.msRequestFullscreen) {
        document.documentElement.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Load projects from database - only vector projects (filter out media files)
  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      const response = await api.get('/vector/projects');
      console.log('loadProjects: Received projects', response.data);
      // Filter to only show actual Vector projects (backend now sends lightweight flag)
      const vectorProjects = (response.data || []).filter(project => {
        return project.has_vector_data || project.vector_metadata;
      });
      console.log('loadProjects: Filtered projects', vectorProjects);
      setProjects(vectorProjects);
    } catch (err) {
      console.error('Error loading projects:', err);
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };
  
  // Delete project (admin = hard delete, non-admin = deletion request, creator = forbidden)
  const handleDeleteProject = async (projectId, projectName) => {
    if (!canDelete) {
      alert('Your role does not have permission to delete projects.');
      return;
    }

    const confirmMsg = isAdmin
      ? `Are you sure you want to permanently delete "${projectName || 'this project'}"? This action cannot be undone.`
      : `Request deletion of "${projectName || 'this project'}"? An admin will need to approve this.`;

    if (!confirm(confirmMsg)) {
      return;
    }

    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

      const response = await api.delete(`/vector/projects/${projectId}`);

      if (response.data?.pending) {
        alert('Deletion request submitted. An admin will review and approve it.');
      } else {
        alert('Project deleted successfully.');
        // If the deleted project was the current one, clear it
        if (vectorState.currentProjectId === projectId) {
          if (onNewProject) {
            onNewProject();
          }
        }
      }

      // Reload project list
      loadProjects();
    } catch (err) {
      console.error('Error deleting project:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error';
      alert('Error deleting project: ' + errorMessage);
    }
  };
  
  // Rename project
  const handleRenameProject = async (projectId, currentName) => {
    const newName = prompt('Enter new project name:', currentName || '');
    if (!newName || newName.trim() === '') {
      return; // User cancelled or entered empty name
    }
    
    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      const formData = new FormData();
      formData.append('name', newName.trim());
      
      await api.put(`/vector/projects/${projectId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      alert('Project renamed successfully');
      
      // Reload project list
      loadProjects();
      
      // If this is the current project, update the name in state
      if (vectorState.currentProjectId === projectId) {
        vectorState.setProjectName(newName.trim());
      }
    } catch (err) {
      console.error('Error renaming project:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Unknown error';
      alert('Error renaming project: ' + errorMessage);
    }
  };

  // Expose refresh function globally
  useEffect(() => {
    window.refreshProjectList = loadProjects;
    return () => {
      window.refreshProjectList = null;
    };
  }, []);

  // Load projects when modal opens
  useEffect(() => {
    if (showProjectModal && vectorState.databaseMode) {
      loadProjects();
    }
  }, [showProjectModal, vectorState.databaseMode]);

  // Listen for fullscreen changes
  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div 
      className="bg-gray-900 text-white flex items-center gap-1 px-2"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        zIndex: 1000
      }}
    >
      <button
        onClick={() => {
          // Go back to Radius main app
          if (window.exitVector) {
            window.exitVector();
          } else {
            // Fallback: try to navigate or show alert
            if (window.location) {
              window.location.href = '/';
            } else {
              alert('Click the ORBIT logo or navigate back to return to main app');
            }
          }
        }}
        className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded mr-2"
        style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
        title="Back to ORBIT"
      >
        ← Back
      </button>
      {/* Left: Brand and Project Info */}
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm" style={{ color: '#fff' }}>📐 Vector</span>
        <div className="w-px h-5 bg-gray-700" />
        <span className="text-xs font-medium" style={{ color: '#fff' }}>
          {vectorState.projectName || 'No Project'}
          {vectorState.hasUnsavedChanges && <span className="text-yellow-400 ml-1">●</span>}
        </span>
      </div>

      <div className="flex-1" />

      {/* Center: Main Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            if (vectorState.databaseMode) {
              setShowProjectModal(true);
            } else {
              onOpenProject();
            }
          }}
          className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded font-medium"
          style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
          title={vectorState.databaseMode ? "Open Project" : "Open File"}
        >
          📁 Open
        </button>
        
        <button
          onClick={handleSave}
          className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 rounded font-medium"
          style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
          title="Save Project"
        >
          💾 Save
        </button>

        {vectorState.pdfImg && (
          <button
            onClick={() => {
              if (window.replacePDF) {
                window.replacePDF();
              } else {
                alert('Replace PDF not available. Please refresh the page.');
              }
            }}
            className="px-3 py-1 text-xs bg-amber-600 hover:bg-amber-700 rounded font-medium"
            style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
            title="Replace map PDF (keeps annotations, shapes, inventory)"
          >
            🔄 Replace PDF
          </button>
        )}

        <button
          onClick={handleNewProject}
          className="px-3 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded font-medium"
          style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
          title="New Project"
        >
          ➕ New
        </button>
      </div>

      <div className="flex-1" />

      {/* Right: Tools and Settings */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => {
            vectorState.setDatabaseMode(!vectorState.databaseMode);
          }}
          className={`px-2 py-1 text-xs rounded font-medium ${
            vectorState.databaseMode ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-800 hover:bg-gray-700'
          }`}
          style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
          title={`Database: ${vectorState.databaseMode ? 'ON' : 'OFF'}`}
        >
          🗄️ {vectorState.databaseMode ? 'DB ON' : 'DB OFF'}
      </button>
        
        {/* Tools */}
        <div className="flex items-center gap-0.5">
          {tools.map(t => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={`px-2 py-1 text-xs rounded ${
                tool === t.id ? 'bg-indigo-600' : 'bg-gray-800 hover:bg-gray-700'
              }`}
              style={{
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                minWidth: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title={t.title || t.label}
            >
              {t.icon || t.label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => vectorState.undo?.()}
            disabled={!vectorState.canUndo}
            className={`px-2 py-1 text-xs rounded ${vectorState.canUndo ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-800 opacity-40 cursor-not-allowed'}`}
            style={{ color: '#fff', border: 'none', cursor: vectorState.canUndo ? 'pointer' : 'not-allowed' }}
            title="Undo (Ctrl+Z)"
          >
            ↶
          </button>
          <button
            onClick={() => vectorState.redo?.()}
            disabled={!vectorState.canRedo}
            className={`px-2 py-1 text-xs rounded ${vectorState.canRedo ? 'bg-gray-800 hover:bg-gray-700' : 'bg-gray-800 opacity-40 cursor-not-allowed'}`}
            style={{ color: '#fff', border: 'none', cursor: vectorState.canRedo ? 'pointer' : 'not-allowed' }}
            title="Redo (Ctrl+Y)"
          >
            ↷
          </button>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Rotation Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => {
              if (vectorState.selected && vectorState.selected.size > 0) {
                const newRotations = rotateSelectedPlots(vectorState.selected, vectorState.plotRotations, -15);
                vectorState.setPlotRotations(newRotations);
              }
            }}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
            style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
            title="Rotate selected -15°"
          >
            ↶
          </button>
          <button
            onClick={() => {
              if (vectorState.selected && vectorState.selected.size > 0) {
                const newRotations = rotateSelectedPlots(vectorState.selected, vectorState.plotRotations, 15);
                vectorState.setPlotRotations(newRotations);
              }
            }}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
            style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
            title="Rotate selected +15°"
          >
            ↷
          </button>
          <button
            onClick={() => {
              if (vectorState.selected && vectorState.selected.size > 0) {
                const newRotations = rotateSelectedPlots(vectorState.selected, vectorState.plotRotations, 0, true);
                vectorState.setPlotRotations(newRotations);
              }
            }}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
            style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
            title="Reset rotation"
          >
            ⟲
          </button>
        </div>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* View Mode Selector - Quick annotation view switching */}
        {vectorState.annos && vectorState.annos.length > 0 && (
          <div className="flex items-center">
            <select
              value={vectorState.activeView || 'all'}
              onChange={(e) => vectorState.setActiveView(e.target.value)}
              className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded border-none cursor-pointer appearance-none"
              style={{
                color: '#fff',
                minWidth: '100px',
                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                backgroundPosition: 'right 4px center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '16px',
                paddingRight: '20px'
              }}
              title="View Mode - Focus on specific annotations"
            >
              <option value="all">All Views</option>
              {vectorState.annos.map(anno => (
                <option key={anno.id} value={anno.id}>
                  {anno.note || anno.cat || 'Unnamed'}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Display Mode & Zoom - Compact */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setDisplayMode(displayMode === 'plot' ? 'note' : 'plot')}
            className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
            style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
            title={`Display: ${displayMode === 'plot' ? 'Plot Numbers' : 'Annotation Notes'}`}
          >
            {displayMode === 'plot' ? '🔢' : '📝'}
          </button>
          {onZoomIn && (
            <>
              <button
                onClick={onZoomIn}
                className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
                style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
                title="Zoom In"
              >
                ➕
              </button>
              <button
                onClick={onZoomOut}
                className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded"
                style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
                title="Zoom Out"
              >
                ➖
              </button>
            </>
          )}
        </div>
      </div>

      {/* Project Modal */}
      {showProjectModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowProjectModal(false)}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Projects</h2>
              <button
                onClick={() => setShowProjectModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Database Mode Toggle */}
            <div className="mb-4 p-3 bg-gray-50 rounded">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={vectorState.databaseMode}
                  onChange={(e) => vectorState.setDatabaseMode(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm font-medium">
                  Database Mode: {vectorState.databaseMode ? 'ON' : 'OFF'}
                </span>
              </label>
              <p className="text-xs text-gray-600 mt-1">
                {vectorState.databaseMode 
                  ? 'Projects will be saved to and loaded from the database.'
                  : 'Projects will be saved as JSON files and loaded from your computer.'}
              </p>
            </div>

            {vectorState.databaseMode ? (
              <>
                {/* Projects List with Filter */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-sm font-semibold">Saved Projects</h3>
                    <div className="flex items-center gap-2">
                      <select
                        value={projectFilter}
                        onChange={(e) => setProjectFilter(e.target.value)}
                        className="text-xs px-2 py-1 border rounded bg-white"
                      >
                        <option value="master">Master Projects</option>
                        <option value="all">All Projects</option>
                        <option value="auto">Auto-generated Only</option>
                      </select>
                      <button
                        onClick={loadProjects}
                        disabled={loadingProjects}
                        className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
                      >
                        {loadingProjects ? '...' : '↻'}
                      </button>
                    </div>
                  </div>

                  {/* Project counts summary */}
                  {!loadingProjects && projects.length > 0 && (
                    <div className="flex gap-3 text-xs text-gray-500 mb-2 px-1">
                      <span>{projects.filter(p => !p.vector_metadata?.isAutoGenerated).length} master</span>
                      <span>•</span>
                      <span>{projects.filter(p => p.vector_metadata?.isAutoGenerated).length} auto-generated</span>
                    </div>
                  )}

                  {loadingProjects ? (
                    <div className="text-center py-8 text-gray-500">Loading projects...</div>
                  ) : projects.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No projects found. Create a new project to get started.</div>
                  ) : (
                    <div className="border rounded max-h-72 overflow-y-auto">
                      {(() => {
                        // Group projects: master projects with their auto-generated children
                        const masterProjects = projects.filter(p => !p.vector_metadata?.isAutoGenerated);
                        const autoProjects = projects.filter(p => p.vector_metadata?.isAutoGenerated);

                        // Build grouped structure
                        const groups = masterProjects.map(master => ({
                          master,
                          autoMaps: autoProjects.filter(auto =>
                            auto.vector_metadata?.sourceProjectId === master.id ||
                            auto.linked_project_id === master.linked_project_id
                          )
                        }));

                        // Find orphaned auto-maps (no matching master)
                        const assignedAutoIds = new Set(groups.flatMap(g => g.autoMaps.map(a => a.id)));
                        const orphanedAuto = autoProjects.filter(a => !assignedAutoIds.has(a.id));

                        // Filter based on selection
                        let filteredGroups = groups;
                        if (projectFilter === 'auto') {
                          return autoProjects.map(project => renderProjectItem(project, true));
                        }

                        // Render function for project item
                        function renderProjectItem(project, isChild = false) {
                          const displayName = project.name || project.map_name || 'Unnamed Project';
                          const isAuto = project.vector_metadata?.isAutoGenerated;
                          const mapType = project.vector_metadata?.mapType;

                          return (
                            <div
                              key={project.id}
                              className={`p-2.5 hover:bg-gray-50 cursor-pointer flex justify-between items-center border-b border-gray-100 last:border-0 ${isChild ? 'pl-6 bg-gray-50/50' : ''}`}
                              onClick={() => {
                                if (window.loadProjectFromDB) {
                                  window.loadProjectFromDB(project.id);
                                  setShowProjectModal(false);
                                }
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate text-gray-900 flex items-center gap-1.5">
                                  {isChild && <span className="text-gray-400 text-xs">↳</span>}
                                  <span className="truncate">{displayName}</span>
                                  {/* Badges */}
                                  {isAuto && mapType === 'status' && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] bg-red-100 text-red-700 rounded font-semibold">
                                      Status
                                    </span>
                                  )}
                                  {isAuto && mapType === 'customer' && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] bg-orange-100 text-orange-700 rounded font-semibold">
                                      Customers
                                    </span>
                                  )}
                                  {isAuto && mapType === 'auto_master' && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] bg-purple-100 text-purple-700 rounded font-semibold">
                                      Master
                                    </span>
                                  )}
                                  {!isAuto && project.linked_project_id && (
                                    <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] bg-blue-100 text-blue-700 rounded font-semibold">
                                      Linked
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-400 mt-0.5">
                                  {project.linked_project_name && !isAuto && (
                                    <span className="text-blue-500">{project.linked_project_name} • </span>
                                  )}
                                  {new Date(project.updated_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.loadProjectFromDB) {
                                      window.loadProjectFromDB(project.id);
                                      setShowProjectModal(false);
                                    }
                                  }}
                                  className="px-2 py-1 text-[10px] bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  Open
                                </button>
                                {!isAuto && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRenameProject(project.id, displayName);
                                    }}
                                    className="p-1 text-gray-400 hover:text-gray-600"
                                    title="Rename"
                                  >
                                    ✏️
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteProject(project.id, displayName);
                                    }}
                                    className="p-1 text-gray-400 hover:text-red-600"
                                    title={isAdmin ? "Delete project" : "Request deletion"}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // Render grouped projects
                        return (
                          <>
                            {filteredGroups.map(({ master, autoMaps }) => {
                              const hasAutoMaps = autoMaps.length > 0;
                              const isExpanded = expandedGroups.has(master.id);

                              return (
                                <div key={master.id}>
                                  {/* Master project row */}
                                  <div className="flex items-center">
                                    {hasAutoMaps && projectFilter !== 'auto' && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newExpanded = new Set(expandedGroups);
                                          if (isExpanded) {
                                            newExpanded.delete(master.id);
                                          } else {
                                            newExpanded.add(master.id);
                                          }
                                          setExpandedGroups(newExpanded);
                                        }}
                                        className="p-2 text-gray-400 hover:text-gray-600 text-xs"
                                      >
                                        {isExpanded ? '▼' : '▶'}
                                      </button>
                                    )}
                                    <div className="flex-1">
                                      {renderProjectItem(master, false)}
                                    </div>
                                  </div>
                                  {/* Auto-generated children (collapsed by default) */}
                                  {hasAutoMaps && isExpanded && projectFilter !== 'auto' && (
                                    <div className="border-l-2 border-gray-200 ml-3">
                                      {autoMaps.map(auto => renderProjectItem(auto, true))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {/* Orphaned auto-maps */}
                            {projectFilter === 'all' && orphanedAuto.length > 0 && (
                              <div className="border-t border-gray-200 mt-2 pt-2">
                                <div className="text-[10px] text-gray-400 px-3 py-1">Unlinked Auto-maps</div>
                                {orphanedAuto.map(auto => renderProjectItem(auto, true))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* New Project Button */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (onNewProject) {
                        onNewProject();
                        setShowProjectModal(false);
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 text-sm font-medium"
                  >
                    New Project
                  </button>
                  <button
                    onClick={() => {
                      onOpenProject();
                      setShowProjectModal(false);
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm font-medium"
                  >
                    Load from File
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">Database mode is OFF. Enable it to see saved projects.</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      onOpenProject();
                      setShowProjectModal(false);
                    }}
                    className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 text-sm font-medium"
                  >
                    Open JSON File
                  </button>
                  <button
                    onClick={() => {
                      if (onNewProject) {
                        onNewProject();
                        setShowProjectModal(false);
                      }
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm font-medium"
                  >
                    New Project
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


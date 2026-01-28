import React, { useState, useEffect } from 'react';
import { downloadProjectJSON } from '../../utils/projectLoader';
import axios from 'axios';

export default function Toolbar({ onOpenProject, onNewProject, vectorState, tool, setTool, displayMode, setDisplayMode, onZoomIn, onZoomOut, onFitToScreen }) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  
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
  
  const isAdmin = getUserRole() === 'admin';

  const tools = [
    { id: 'select', label: 'Select', icon: '👆' },
    { id: 'pan', label: 'Pan', icon: '✋' },
    { id: 'add', label: '+Plot', icon: '+' },
    { id: 'brush', label: '🖌️', title: 'Paint annotation' },
    { id: 'eraser', label: '🧹', title: 'Erase annotation' },
    { id: 'label', label: '+Text', icon: 'T' },
    { id: 'shape', label: '+Shape', icon: '⬜' },
    { id: 'move', label: '✋', title: 'Move' }
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
      // Filter to only show actual Vector projects with Vector-specific data
      // Exclude any media files that might have been incorrectly saved
      const vectorProjects = (response.data || []).filter(project => {
        // Only show projects with actual Vector metadata (not just PDFs)
        if (!project.vector_metadata) return false;
        const metadata = project.vector_metadata;
        // Must have at least one of: plots, annotations, shapes, labels, branches, or projectMetadata
        // This ensures we only show projects that were created/edited through Vector system
        return !!(metadata.plots || metadata.annos || metadata.shapes || 
                 metadata.labels || metadata.branches || metadata.projectMetadata);
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
  
  // Delete project (admin only)
  const handleDeleteProject = async (projectId, projectName) => {
    if (!isAdmin) {
      alert('Only administrators can delete projects');
      return;
    }
    
    if (!confirm(`Are you sure you want to delete "${projectName || 'this project'}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      const api = axios.create({ baseURL: '/api' });
      const token = localStorage.getItem('token');
      if (token) {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }
      
      await api.delete(`/vector/projects/${projectId}`);
      alert('Project deleted successfully');
      
      // Reload project list
      loadProjects();
      
      // If the deleted project was the current one, clear it
      if (vectorState.currentProjectId === projectId) {
        if (onNewProject) {
          onNewProject();
        }
      }
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
              alert('Click the Radius logo or navigate back to return to main app');
            }
          }
        }}
        className="px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded mr-2"
        style={{ color: '#fff', border: 'none', cursor: 'pointer' }}
        title="Back to Radius"
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
        
        {/* Tools - Compact (only essential ones) */}
        <div className="flex items-center gap-0.5">
          {tools.slice(0, 4).map(t => (
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
                {/* Projects List */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-semibold">Saved Projects</h3>
                    <button
                      onClick={loadProjects}
                      disabled={loadingProjects}
                      className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-50"
                    >
                      {loadingProjects ? 'Loading...' : '🔄 Refresh'}
                    </button>
                  </div>
                  
                  {loadingProjects ? (
                    <div className="text-center py-8 text-gray-500">Loading projects...</div>
                  ) : projects.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No projects found. Create a new project to get started.</div>
                  ) : (
                    <div className="border rounded divide-y max-h-64 overflow-y-auto">
                      {projects.map((project) => {
                        // Determine display name - simple fallback chain
                        // Debug: log the project to see what fields are available
                        console.log('Project in list (full object):', JSON.stringify(project, null, 2));
                        console.log('Project name field:', project.name, 'Type:', typeof project.name);
                        console.log('Project map_name field:', project.map_name, 'Type:', typeof project.map_name);
                        const displayName = project.name || project.map_name || 'Unnamed Project';
                        console.log('Display name determined:', displayName);
                        
                        return (
                          <div
                            key={project.id}
                            className="p-3 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                            onClick={() => {
                              console.log('Loading project:', project.id, project.name);
                              if (window.loadProjectFromDB) {
                                window.loadProjectFromDB(project.id);
                                setShowProjectModal(false);
                              } else {
                                console.error('loadProjectFromDB function not available');
                                alert('Load function not available. Please refresh the page.');
                              }
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate text-gray-900">
                                {displayName}
                              </div>
                              <div className="text-xs text-gray-500">
                                {project.map_name && project.map_name !== displayName && `${project.map_name} • `}
                                Updated: {new Date(project.updated_at).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  console.log('Load button clicked for project:', project.id, project.name);
                                  if (window.loadProjectFromDB) {
                                    window.loadProjectFromDB(project.id);
                                    setShowProjectModal(false);
                                  } else {
                                    console.error('loadProjectFromDB function not available');
                                    alert('Load function not available. Please refresh the page.');
                                  }
                                }}
                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Load
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRenameProject(project.id, displayName);
                                }}
                                className="px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                                title="Rename project"
                              >
                                ✏️
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteProject(project.id, displayName);
                                  }}
                                  className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                  title="Delete project (Admin only)"
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
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


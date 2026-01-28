// Project JSON loading utilities

/**
 * Load project from JSON file
 * @param {File} file - The JSON file to load
 * @returns {Promise<Object>} Parsed project data
 */
export function loadProjectFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        resolve(data);
      } catch (err) {
        reject(new Error('Invalid JSON file: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Validate project data structure
 * @param {Object} data - Project data to validate
 * @returns {boolean} True if valid
 */
export function validateProjectData(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }
  // Basic validation - project should have at least a name or map
  return true;
}

/**
 * Get default project metadata
 */
export function getDefaultProjectMetadata() {
  return {
    created: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    version: '8.2',
    createdBy: '',
    description: '',
    notes: []
  };
}

/**
 * Save project to JSON file
 * @param {Object} vectorState - The complete vector state object
 * @returns {string} JSON string of the project data
 */
export function saveProjectToJSON(vectorState) {
  const projectData = {
    projectName: vectorState.projectName || 'Untitled Project',
    mapName: vectorState.mapName || 'Map',
    version: '8.2',
    pdfBase64: vectorState.pdfBase64 || null,
    plots: vectorState.plots || [],
    annos: vectorState.annos || [],
    inventory: vectorState.inventory || {},
    shapes: vectorState.shapes || [],
    labels: vectorState.labels || [],
    branches: vectorState.branches || [],
    plotOffsets: vectorState.plotOffsets || {},
    plotRotations: vectorState.plotRotations || {},
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

  return JSON.stringify(projectData, null, 2);
}

/**
 * Download project as JSON file
 * @param {Object} vectorState - The complete vector state object
 * @param {string} filename - Optional filename (defaults to project name)
 */
export function downloadProjectJSON(vectorState, filename = null) {
  const jsonString = saveProjectToJSON(vectorState);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `${vectorState.projectName || 'project'}_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


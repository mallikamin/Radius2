// Plot operations utilities

/**
 * Search for a plot by number
 */
export function searchPlot(plotNum, plots) {
  return plots.find(p => 
    p.n === plotNum.trim() || 
    p.n.toUpperCase() === plotNum.trim().toUpperCase()
  );
}

/**
 * Zoom to a specific plot
 */
export function zoomToPlot(plotId, plots, mapW, mapH, setScale, setOffX, setOffY, canvasWidth, canvasHeight) {
  const plot = plots.find(p => p.id === plotId);
  if (!plot) return;

  // Calculate zoom to fit plot in center
  const targetScale = Math.min(canvasWidth / mapW, canvasHeight / mapH) * 2;
  setScale(targetScale);
  
  // Center on plot
  const offset = plot.offset || { ox: 0, oy: 0 };
  const plotX = (plot.x + offset.ox) * targetScale;
  const plotY = (plot.y + offset.oy) * targetScale;
  
  setOffX(canvasWidth / 2 - plotX);
  setOffY(canvasHeight / 2 - plotY);
}

/**
 * Rotate selected plots
 */
export function rotateSelectedPlots(selected, plotRotations, angle, reset = false) {
  const newRotations = { ...plotRotations };
  
  selected.forEach(plotId => {
    if (reset) {
      delete newRotations[plotId];
    } else {
      const current = newRotations[plotId] || 0;
      newRotations[plotId] = (current + angle) % 360;
    }
  });
  
  return newRotations;
}

/**
 * Mass rename plots - preview changes
 * @param {Array} plots - Array of plot objects
 * @param {Object} inventory - Inventory object
 * @param {Array} annos - Array of annotation objects
 * @param {string} findPattern - Pattern to find (can be regex if useRegex is true)
 * @param {string} replacePattern - Replacement pattern
 * @param {boolean} useRegex - Whether to use regex
 * @returns {Array} Array of rename preview objects
 */
export function massRenamePlotsPreview(plots, inventory, annos, findPattern, replacePattern, useRegex = false) {
  if (!findPattern || !findPattern.trim()) return [];
  
  let regex;
  try {
    if (useRegex) {
      regex = new RegExp(findPattern, 'g');
    } else {
      // Escape special regex characters for literal search
      const escaped = findPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escaped, 'g');
    }
  } catch (err) {
    return []; // Invalid regex
  }
  
  const matches = [];
  
  plots.forEach(plot => {
    const oldName = String(plot.n || '');
    if (regex.test(oldName)) {
      const newName = oldName.replace(regex, replacePattern || '');
      if (newName !== oldName) {
        matches.push({
          plot,
          oldName,
          newName,
          plotId: plot.id
        });
      }
    }
  });
  
  return matches;
}

/**
 * Apply mass rename to plots, inventory, and annotations
 * @param {Array} renameMatches - Array of rename matches from preview
 * @param {Array} plots - Array of plot objects
 * @param {Object} inventory - Inventory object
 * @param {Array} annos - Array of annotation objects
 * @returns {Object} Updated plots, inventory, and annotations
 */
export function applyMassRename(renameMatches, plots, inventory, annos) {
  // Create mapping of old names to new names
  const nameMap = {};
  renameMatches.forEach(match => {
    nameMap[match.oldName] = match.newName;
  });
  
  // Update plots
  const updatedPlots = plots.map(plot => {
    if (nameMap[plot.n]) {
      return { ...plot, n: nameMap[plot.n] };
    }
    return plot;
  });
  
  // Update inventory keys
  const updatedInventory = {};
  Object.keys(inventory).forEach(key => {
    if (nameMap[key]) {
      updatedInventory[nameMap[key]] = inventory[key];
    } else {
      updatedInventory[key] = inventory[key];
    }
  });
  
  // Update annotation plotNums
  const updatedAnnos = annos.map(anno => {
    const updatedPlotNums = (anno.plotNums || []).map(plotNum => {
      return nameMap[plotNum] || plotNum;
    });
    return { ...anno, plotNums: updatedPlotNums };
  });
  
  return {
    plots: updatedPlots,
    inventory: updatedInventory,
    annos: updatedAnnos
  };
}


// Annotation management utilities

/**
 * Create a new annotation
 */
export function createAnnotation(note, category, color, plotIds) {
  return {
    id: Date.now(),
    note: note || '',
    cat: category || '',
    color: color || '#6366f1',
    plotIds: plotIds || [],
    plotNums: plotIds.map(id => {
      // Extract plot number from ID
      const match = id.match(/^(\d+[A-Za-z]?)_/) || id.match(/manual_\d+_(\d+[A-Za-z]?)$/);
      return match ? match[1] : '?';
    }),
    rotation: 0,
    fontSize: 12
  };
}

/**
 * Add plots to annotation
 */
export function addPlotsToAnnotation(annotation, plotIds) {
  const newPlotIds = [...new Set([...annotation.plotIds, ...plotIds])];
  return {
    ...annotation,
    plotIds: newPlotIds,
    plotNums: newPlotIds.map(id => {
      const match = id.match(/^(\d+[A-Za-z]?)_/) || id.match(/manual_\d+_(\d+[A-Za-z]?)$/);
      return match ? match[1] : '?';
    })
  };
}

/**
 * Remove plots from annotation
 */
export function removePlotsFromAnnotation(annotation, plotIds) {
  const newPlotIds = annotation.plotIds.filter(id => !plotIds.includes(id));
  return {
    ...annotation,
    plotIds: newPlotIds,
    plotNums: newPlotIds.map(id => {
      const match = id.match(/^(\d+[A-Za-z]?)_/) || id.match(/manual_\d+_(\d+[A-Za-z]?)$/);
      return match ? match[1] : '?';
    })
  };
}

/**
 * Move plots between annotations
 */
export function movePlotsBetweenAnnotations(sourceAnno, targetAnno, plotIds) {
  const updatedSource = removePlotsFromAnnotation(sourceAnno, plotIds);
  const updatedTarget = addPlotsToAnnotation(targetAnno, plotIds);
  return { updatedSource, updatedTarget };
}

/**
 * Delete annotation
 */
export function deleteAnnotation(annotationId, annos) {
  return annos.filter(a => a.id !== annotationId);
}

/**
 * Update annotation
 */
export function updateAnnotation(annotationId, updates, annos) {
  return annos.map(a => 
    a.id === annotationId ? { ...a, ...updates } : a
  );
}


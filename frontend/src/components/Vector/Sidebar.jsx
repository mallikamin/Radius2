import React, { useState } from 'react';
import { exportInventoryToExcel, exportManualPlotsToExcel } from '../../utils/inventoryUtils';
import { buildExportCanvasEnhanced, exportProposalPDF } from '../../utils/exportUtils';
import SelectionPanel from './SelectionPanel';
import MassRenamePanel from './MassRenamePanel';
import SearchPanel from './SearchPanel';
import LabelsPanel from './LabelsPanel';
import ShapesPanel from './ShapesPanel';
import CreatorNotesPanel from './CreatorNotesPanel';
import ChangeLogPanel from './ChangeLogPanel';
import PanSettingsPanel from './PanSettingsPanel';
import InventoryImportPanel from './InventoryImportPanel';
import SettingsPanel from './SettingsPanel';
import BranchesPanel from './BranchesPanel';

export default function Sidebar({ vectorState, displayMode = 'plot' }) {
  const [activeTab, setActiveTab] = useState('selection');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState('full');
  const [selectedAnnoIds, setSelectedAnnoIds] = useState(new Set());
  const [exportType, setExportType] = useState('map'); // 'map' or 'proposal'
  const [exportQuality, setExportQuality] = useState(2);
  const [fieldConfig, setFieldConfig] = useState({
    owner: true, value: true, area: true, status: true, notes: true,
    ratePerMarla: true, dimensions: true, coordinates: false, annotationInfo: true
  });
  const [zoomLevels, setZoomLevels] = useState({ full: true, p75: false, p50: false, p25: false, single: false });
  const [separateFiles, setSeparateFiles] = useState(false);

  // Expose tab switching for external access
  React.useEffect(() => {
    window.switchToSettingsTab = () => setActiveTab('settings');
    window.switchToInventoryTab = () => setActiveTab('inventory');
    return () => {
      window.switchToSettingsTab = null;
      window.switchToInventoryTab = null;
    };
  }, []);

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return 'PKR 0';
    return 'PKR ' + parseFloat(amount).toLocaleString('en-PK', { maximumFractionDigits: 0 });
  };

  // Export PDF
  const handleExportPDF = async () => {
    if (!vectorState.pdfImg) {
      alert('PDF map not loaded. Please load a project file first.');
      setShowExportModal(false);
      return;
    }

    const highlightItems = exportMode === 'single' 
      ? vectorState.annos.find(a => selectedAnnoIds.has(a.id))
      : exportMode === 'multi'
      ? vectorState.annos.filter(a => selectedAnnoIds.has(a.id))
      : null;

    if ((exportMode === 'single' || exportMode === 'multi') && !highlightItems) {
      alert('Please select at least one annotation to export.');
      return;
    }

    let canvas;
    try {
      // Get legend position from vectorState or default to bottom-right
      const legendPosition = vectorState.legend?.position || 'bottom-right';
      canvas = buildExportCanvasEnhanced(vectorState, exportMode, highlightItems, 2, true, legendPosition, displayMode);
    } catch (err) {
      alert('Export error: ' + err.message);
      return;
    }
    
    let jsPDF;
    if (window.jspdf && window.jspdf.jsPDF) {
      jsPDF = window.jspdf.jsPDF;
    } else {
      // Fallback: try importing directly
      try {
        const jspdfModule = await import('jspdf');
        jsPDF = jspdfModule.jsPDF;
      } catch (err) {
        alert('jsPDF not loaded. Please refresh the page.');
        return;
      }
    }
    
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    
    let w = pageWidth - 10;
    let h = w / ratio;
    if (h > pageHeight - 10) {
      h = pageHeight - 10;
      w = h * ratio;
    }

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 5, 5, w, h);
    pdf.save(`${vectorState.projectName || 'map'}_${new Date().toISOString().split('T')[0]}.pdf`);
    setShowExportModal(false);
  };

  // Export Excel
  const handleExportExcel = () => {
    exportInventoryToExcel(vectorState.inventory, vectorState.plots, vectorState.projectName || 'inventory');
  };

  // Export Manual Plots Excel
  const handleExportManualPlotsExcel = () => {
    exportManualPlotsToExcel(vectorState.plots, vectorState.inventory, vectorState.projectName || 'manual_plots');
  };

  return (
    <div 
      className="absolute bg-white border-r border-gray-300 flex flex-col z-20"
      style={{
        left: 0,
        top: '40px',
        bottom: 0,
        width: '256px',
        height: 'calc(100vh - 40px)'
      }}
    >
      {/* Tabs */}
      <div className="grid grid-cols-5 border-b border-gray-300">
        {[
          { id: 'selection',   icon: '👆', label: 'Select' },
          { id: 'annotations', icon: '📝', label: 'Annotate' },
          { id: 'plots',       icon: '📍', label: 'Plots' },
          { id: 'inventory',   icon: '📊', label: 'Inventory' },
          { id: 'massrename',  icon: '🔄', label: 'Rename' },
          { id: 'search',      icon: '🔍', label: 'Search' },
          { id: 'labels',      icon: '🏷️', label: 'Labels' },
          { id: 'shapes',      icon: '⬜', label: 'Shapes' },
          { id: 'notes',       icon: '📝', label: 'Notes' },
          { id: 'changelog',   icon: '📋', label: 'Log' },
          { id: 'branches',    icon: '🔀', label: 'Branches' },
          { id: 'pan',         icon: '✋', label: 'Pan' },
          { id: 'settings',    icon: '⚙️', label: 'Settings' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex flex-col items-center py-1.5 text-center ${
              activeTab === tab.id
                ? 'bg-gray-100 border-b-2 border-gray-900'
                : 'hover:bg-gray-50'
            }`}
          >
            <span className="text-sm leading-none">{tab.icon}</span>
            <span className="text-[9px] leading-tight mt-0.5 text-gray-600 font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'selection' && (
          <SelectionPanel vectorState={vectorState} />
        )}

        {activeTab === 'massrename' && (
          <MassRenamePanel vectorState={vectorState} />
        )}

        {activeTab === 'search' && (
          <SearchPanel vectorState={vectorState} />
        )}

        {activeTab === 'labels' && (
          <LabelsPanel vectorState={vectorState} />
        )}

        {activeTab === 'shapes' && (
          <ShapesPanel vectorState={vectorState} />
        )}

        {activeTab === 'notes' && (
          <CreatorNotesPanel vectorState={vectorState} />
        )}

        {activeTab === 'changelog' && (
          <ChangeLogPanel vectorState={vectorState} />
        )}

        {activeTab === 'branches' && (
          <BranchesPanel vectorState={vectorState} />
        )}

        {activeTab === 'pan' && (
          <PanSettingsPanel />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel vectorState={vectorState} />
        )}

        {activeTab === 'annotations' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">
                Annotations ({vectorState.annos.length})
                <span className="text-[10px] text-gray-400 font-normal ml-1">
                  {vectorState.annos.reduce((sum, a) => sum + (a.plotIds?.length || 0), 0)} plot refs
                </span>
              </h3>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    if (vectorState.pushHistory) vectorState.pushHistory();
                    // 1. Remove auto-extracted plots that have a manual counterpart (same name)
                    const { removed: autoRemoved, relinked } = vectorState.removeAutoPlotDuplicates();
                    // 2. Clean within-annotation dupes
                    const withinRemoved = vectorState.deduplicateAnnotations();
                    // 3. Clean cross-annotation dupes
                    const crossRemoved = vectorState.removeCrossAnnotationDuplicates();
                    const total = autoRemoved + withinRemoved + crossRemoved;
                    if (total > 0) {
                      const parts = [];
                      if (autoRemoved > 0) parts.push(`${autoRemoved} auto-extracted ghost plots removed`);
                      if (relinked > 0) parts.push(`${relinked} annotation refs relinked`);
                      if (withinRemoved > 0) parts.push(`${withinRemoved} within-annotation dupes`);
                      if (crossRemoved > 0) parts.push(`${crossRemoved} cross-annotation dupes`);
                      vectorState.addChangeLog('Clean duplicates', parts.join(', '));
                      alert(`Cleaned:\n${parts.join('\n')}\n\nSave to persist.`);
                    } else {
                      alert('No duplicates found.');
                    }
                  }}
                  className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded hover:bg-amber-200"
                  title="Remove duplicate plotIds within and across annotations"
                >
                  Clean Dupes
                </button>
              </div>
            </div>
            <div className="flex justify-end mb-1">
              <button
                onClick={() => {
                  const note = prompt('Annotation note:');
                  if (!note) return;
                  const color = prompt('Color (hex):', '#6366f1');
                  const plotInput = prompt('Plot numbers (comma-separated, e.g. 1,2,3,5-10)\nLeave empty to add plots later:');

                  // Parse plot numbers
                  let plotIds = [];
                  let plotNums = [];
                  if (plotInput && plotInput.trim()) {
                    const parts = plotInput.split(',').map(s => s.trim()).filter(Boolean);
                    const numSet = new Set();
                    for (const part of parts) {
                      if (part.includes('-') && /^\d+-\d+$/.test(part)) {
                        const [start, end] = part.split('-').map(Number);
                        for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
                          numSet.add(String(i));
                        }
                      } else {
                        numSet.add(part);
                      }
                    }
                    (vectorState.plots || []).forEach(p => {
                      if (numSet.has(String(p.n || '').trim())) {
                        plotIds.push(p.id);
                        plotNums.push(p.n);
                      }
                    });
                  }

                  vectorState.addAnnotation({
                    id: Date.now(),
                    note,
                    cat: '',
                    color: color || '#6366f1',
                    plotIds,
                    plotNums: [...new Set(plotNums)],
                    rotation: 0,
                    fontSize: 12
                  });
                }}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                + Add
              </button>
            </div>
            {vectorState.annos.map(anno => (
              <div key={anno.id} className="p-2 border border-gray-200 rounded text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: anno.color }}
                  />
                  <span className="font-semibold flex-1">{anno.note || anno.cat}</span>
                  <button
                    onClick={() => {
                      // Double click or edit button to open annotation editor
                      if (window.openAnnotationEditor) {
                        window.openAnnotationEditor(anno.id);
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800 text-xs"
                    title="Edit annotation (rotation, color, etc.)"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => vectorState.removeAnnotation(anno.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    ×
                  </button>
                </div>
                <div className="text-gray-600 mb-1">{anno.plotIds.length} plots</div>
                {anno.rotation !== 0 && (
                  <div className="text-gray-500 text-xs">Rotation: {anno.rotation}°</div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'plots' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">
                Manual Plots ({vectorState.plots.filter(p => p.manual).length})
              </h3>
              <label className="text-xs">
                <input
                  type="checkbox"
                  checked={vectorState.hideNonAnnotatedManualPlots}
                  onChange={(e) => vectorState.setHideNonAnnotatedManualPlots(e.target.checked)}
                />
                {' '}Hide non-annotated
              </label>
            </div>
            {vectorState.plots.filter(p => p.manual).map(plot => (
              <div key={plot.id} className="p-2 border border-gray-200 rounded text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Plot {plot.n}</div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete manual plot "${plot.n}"?`)) {
                        if (vectorState.pushHistory) vectorState.pushHistory();
                        vectorState.removePlot(plot.id);
                        vectorState.addChangeLog('Plot deleted', `Deleted manual plot: ${plot.n}`);
                      }
                    }}
                    className="text-red-500 hover:text-red-700 text-xs font-bold px-1"
                    title="Delete this manual plot"
                  >
                    x
                  </button>
                </div>
                <div className="text-gray-600">
                  X: {Math.round(plot.x)}, Y: {Math.round(plot.y)}
                </div>
                <button
                  onClick={() => {
                    if (window.zoomToPlot) window.zoomToPlot(plot.id);
                  }}
                  className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                >
                  Zoom to
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">
                Inventory ({Object.keys(vectorState.inventory).length})
              </h3>
            </div>
            
            <div className="mb-3 pb-3 border-b border-gray-200">
              <InventoryImportPanel vectorState={vectorState} />
            </div>
            {Object.entries(vectorState.inventory).slice(0, 20).map(([plotNum, inv]) => (
              <div key={plotNum} className="p-2 border border-gray-200 rounded text-xs">
                <div className="font-semibold">Plot {plotNum}</div>
                {inv.marla && <div>Marla: {inv.marla}</div>}
                {inv.totalValue && <div>Value: {formatCurrency(inv.totalValue)}</div>}
                {inv.owner && <div>Owner: {typeof inv.owner === 'object' ? inv.owner.name || '' : inv.owner}</div>}
              </div>
            ))}
            {Object.keys(vectorState.inventory).length > 20 && (
              <div className="text-xs text-gray-500 text-center">
                +{Object.keys(vectorState.inventory).length - 20} more
              </div>
            )}
          </div>
        )}
      </div>

      {/* Export Buttons */}
      <div className="border-t border-gray-300 p-3 space-y-2">
        <button
          onClick={() => setShowExportModal(true)}
          className="w-full px-3 py-2 text-xs bg-gray-900 text-white rounded hover:bg-gray-800"
        >
          📤 Export Options
        </button>
        <button
          onClick={handleExportExcel}
          className="w-full px-3 py-2 text-xs bg-green-600 text-white rounded hover:bg-green-700"
        >
          📊 Export Excel
        </button>
        <button
          onClick={handleExportManualPlotsExcel}
          className="w-full px-3 py-2 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          📋 Export Manual Plots
        </button>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-4 w-96 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold mb-3">Export Options</h3>

            {/* Export Type Toggle */}
            <div className="flex gap-1 mb-3 bg-gray-100 rounded p-1">
              <button onClick={() => setExportType('map')}
                className={`flex-1 px-2 py-1 text-xs rounded ${exportType === 'map' ? 'bg-white shadow font-semibold' : ''}`}>
                Map Only
              </button>
              <button onClick={() => setExportType('proposal')}
                className={`flex-1 px-2 py-1 text-xs rounded ${exportType === 'proposal' ? 'bg-white shadow font-semibold' : ''}`}>
                Proposal PDF
              </button>
            </div>

            {/* Map Mode Selection */}
            <div className="space-y-1 mb-3">
              <div className="text-xs font-medium text-gray-600 mb-1">Map Mode</div>
              {['full', 'single', 'multi'].map(m => (
                <label key={m} className="flex items-center">
                  <input type="radio" name="exportMode" value={m} checked={exportMode === m}
                    onChange={(e) => setExportMode(e.target.value)} />
                  <span className="ml-2 text-xs">{m === 'full' ? 'Full Map' : m === 'single' ? 'Single Annotation' : 'Multiple Annotations'}</span>
                </label>
              ))}
            </div>

            {/* Annotation Selection */}
            {(exportMode === 'single' || exportMode === 'multi') && (
              <div className="mb-3 max-h-32 overflow-y-auto border border-gray-200 rounded p-2">
                {vectorState.annos.map(anno => (
                  <label key={anno.id} className="flex items-center mb-1">
                    <input type="checkbox" checked={selectedAnnoIds.has(anno.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedAnnoIds);
                        if (e.target.checked) newSet.add(anno.id); else newSet.delete(anno.id);
                        setSelectedAnnoIds(newSet);
                      }} />
                    <span className="ml-2 text-xs flex items-center gap-1">
                      <div className="w-3 h-3 rounded" style={{ backgroundColor: anno.color }} />
                      {anno.note || anno.cat}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Quality Selector */}
            <div className="mb-3">
              <div className="text-xs font-medium text-gray-600 mb-1">Quality</div>
              <div className="flex gap-1">
                {[{v: 1.5, l: 'Standard'}, {v: 2, l: 'High'}, {v: 3, l: 'Ultra'}].map(q => (
                  <button key={q.v} onClick={() => setExportQuality(q.v)}
                    className={`flex-1 px-2 py-1 text-xs rounded border ${exportQuality === q.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 hover:bg-gray-50'}`}>
                    {q.l} ({q.v}x)
                  </button>
                ))}
              </div>
            </div>

            {/* Proposal-only Options */}
            {exportType === 'proposal' && (
              <>
                {/* Zoom Level Selection */}
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-600 mb-1">Map Views (pages in PDF)</div>
                  <div className="space-y-1">
                    {[{k: 'full', l: '100% - Full Map'}, {k: 'p75', l: '75% - Wider context'}, {k: 'p50', l: '50% - Focused'}, {k: 'p25', l: '25% - Close-up'}, {k: 'single', l: 'Single Plot Only'}].map(z => (
                      <label key={z.k} className="flex items-center">
                        <input type="checkbox" checked={zoomLevels[z.k]}
                          onChange={(e) => setZoomLevels(prev => ({...prev, [z.k]: e.target.checked}))} />
                        <span className="ml-2 text-xs">{z.l}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Field Configuration */}
                <div className="mb-3">
                  <div className="text-xs font-medium text-gray-600 mb-1">Detail Fields</div>
                  <div className="grid grid-cols-2 gap-1">
                    {[{k: 'owner', l: 'Owner'}, {k: 'value', l: 'Total Value'}, {k: 'area', l: 'Area (Marla)'},
                      {k: 'ratePerMarla', l: 'Rate/Marla'}, {k: 'dimensions', l: 'Dimensions'}, {k: 'status', l: 'Status'},
                      {k: 'notes', l: 'Notes'}, {k: 'coordinates', l: 'Coordinates'}, {k: 'annotationInfo', l: 'Annotation'}
                    ].map(f => (
                      <label key={f.k} className="flex items-center">
                        <input type="checkbox" checked={fieldConfig[f.k]}
                          onChange={(e) => setFieldConfig(prev => ({...prev, [f.k]: e.target.checked}))} />
                        <span className="ml-1 text-xs">{f.l}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Output Toggle */}
                <div className="mb-3">
                  <label className="flex items-center">
                    <input type="checkbox" checked={separateFiles} onChange={(e) => setSeparateFiles(e.target.checked)} />
                    <span className="ml-2 text-xs">Separate PDF per zoom level</span>
                  </label>
                </div>
              </>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button onClick={() => setShowExportModal(false)}
                className="flex-1 px-3 py-2 text-xs bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
              {exportType === 'map' ? (
                <button onClick={handleExportPDF}
                  className="flex-1 px-3 py-2 text-xs bg-gray-900 text-white rounded hover:bg-gray-800">Export Map PDF</button>
              ) : (
                <button onClick={() => {
                  // Get plots to export - selected plots or all annotated plots
                  const selectedPlots = vectorState.selected && vectorState.selected.size > 0
                    ? Array.from(vectorState.selected).map(id => vectorState.plots.find(p => p.id === id)).filter(Boolean)
                    : vectorState.plots.filter(p => vectorState.annos.some(a => a.plotIds.includes(p.id)));

                  if (selectedPlots.length === 0) { alert('No plots to export. Select plots or ensure annotations exist.'); return; }

                  // Build zoom levels array
                  const zooms = [];
                  if (zoomLevels.full) zooms.push(1.0);
                  if (zoomLevels.p75) zooms.push(0.75);
                  if (zoomLevels.p50) zooms.push(0.50);
                  if (zoomLevels.p25) zooms.push(0.25);
                  if (zoomLevels.single) zooms.push(0); // 0 = single plot only
                  if (zooms.length === 0) zooms.push(1.0);

                  exportProposalPDF(selectedPlots, vectorState, fieldConfig, {
                    zoomLevels: zooms, quality: exportQuality, includeLegend: true,
                    includeHeader: true, separateFiles
                  });
                  setShowExportModal(false);
                }}
                  className="flex-1 px-3 py-2 text-xs bg-orange-600 text-white rounded hover:bg-orange-700">Export Proposal</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


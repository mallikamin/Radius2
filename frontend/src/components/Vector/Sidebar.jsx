import React, { useState } from 'react';
import { exportInventoryToExcel, exportManualPlotsToExcel } from '../../utils/inventoryUtils';
import { buildExportCanvasEnhanced } from '../../utils/exportUtils';
import SelectionPanel from './SelectionPanel';
import BrushPanel from './BrushPanel';
import EraserPanel from './EraserPanel';
import MassRenamePanel from './MassRenamePanel';
import SearchPanel from './SearchPanel';
import LabelsPanel from './LabelsPanel';
import ShapesPanel from './ShapesPanel';
import CreatorNotesPanel from './CreatorNotesPanel';
import ChangeLogPanel from './ChangeLogPanel';
import PanSettingsPanel from './PanSettingsPanel';
import InventoryImportPanel from './InventoryImportPanel';
import SettingsPanel from './SettingsPanel';

export default function Sidebar({ vectorState }) {
  const [activeTab, setActiveTab] = useState('selection');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportMode, setExportMode] = useState('full');
  const [selectedAnnoIds, setSelectedAnnoIds] = useState(new Set());

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
      canvas = buildExportCanvasEnhanced(vectorState, exportMode, highlightItems, 2, true, legendPosition);
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
      <div className="flex flex-wrap border-b border-gray-300">
        <button
          onClick={() => setActiveTab('selection')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'selection' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Selection"
        >
          👆
        </button>
        <button
          onClick={() => setActiveTab('annotations')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'annotations' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Annotations"
        >
          📝
        </button>
        <button
          onClick={() => setActiveTab('plots')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'plots' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Manual Plots"
        >
          📍
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'inventory' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Inventory"
        >
          📊
        </button>
        <button
          onClick={() => setActiveTab('brush')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'brush' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Brush Settings"
        >
          🖌️
        </button>
        <button
          onClick={() => setActiveTab('eraser')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'eraser' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Eraser"
        >
          🧹
        </button>
        <button
          onClick={() => setActiveTab('massrename')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'massrename' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Mass Rename"
        >
          🔄
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'search' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Search Plot"
        >
          🔍
        </button>
        <button
          onClick={() => setActiveTab('labels')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'labels' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Labels"
        >
          🏷️
        </button>
        <button
          onClick={() => setActiveTab('shapes')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'shapes' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Shapes"
        >
          ⬜
        </button>
        <button
          onClick={() => setActiveTab('notes')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'notes' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Creator Notes"
        >
          📝
        </button>
        <button
          onClick={() => setActiveTab('changelog')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'changelog' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Change Log"
        >
          📋
        </button>
        <button
          onClick={() => setActiveTab('pan')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'pan' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Pan Settings"
        >
          ✋
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-2 py-2 text-xs font-medium ${
            activeTab === 'settings' ? 'bg-gray-100 border-b-2 border-gray-900' : 'hover:bg-gray-50'
          }`}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'selection' && (
          <SelectionPanel vectorState={vectorState} />
        )}

        {activeTab === 'brush' && (
          <BrushPanel vectorState={vectorState} />
        )}

        {activeTab === 'eraser' && (
          <EraserPanel vectorState={vectorState} />
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

        {activeTab === 'pan' && (
          <PanSettingsPanel />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel vectorState={vectorState} />
        )}

        {activeTab === 'annotations' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-semibold">Annotations ({vectorState.annos.length})</h3>
              <button
                onClick={() => {
                  const note = prompt('Annotation note:');
                  const color = prompt('Color (hex):', '#6366f1');
                  if (note) {
                    vectorState.addAnnotation({
                      id: Date.now(),
                      note,
                      cat: '',
                      color: color || '#6366f1',
                      plotIds: [],
                      plotNums: [],
                      rotation: 0,
                      fontSize: 12
                    });
                  }
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
                <div className="font-semibold">Plot {plot.n}</div>
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
                {inv.owner && <div>Owner: {inv.owner}</div>}
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
          <div className="bg-white rounded-lg p-4 w-80">
            <h3 className="font-semibold mb-3">Export PDF</h3>
            <div className="space-y-2 mb-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="exportMode"
                  value="full"
                  checked={exportMode === 'full'}
                  onChange={(e) => setExportMode(e.target.value)}
                />
                <span className="ml-2 text-sm">Full Map</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="exportMode"
                  value="single"
                  checked={exportMode === 'single'}
                  onChange={(e) => setExportMode(e.target.value)}
                />
                <span className="ml-2 text-sm">Single Annotation</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="exportMode"
                  value="multi"
                  checked={exportMode === 'multi'}
                  onChange={(e) => setExportMode(e.target.value)}
                />
                <span className="ml-2 text-sm">Multiple Annotations</span>
              </label>
            </div>
            {(exportMode === 'single' || exportMode === 'multi') && (
              <div className="mb-4 max-h-40 overflow-y-auto border border-gray-200 rounded p-2">
                {vectorState.annos.map(anno => (
                  <label key={anno.id} className="flex items-center mb-1">
                    <input
                      type="checkbox"
                      checked={selectedAnnoIds.has(anno.id)}
                      onChange={(e) => {
                        const newSet = new Set(selectedAnnoIds);
                        if (e.target.checked) {
                          newSet.add(anno.id);
                        } else {
                          newSet.delete(anno.id);
                        }
                        setSelectedAnnoIds(newSet);
                      }}
                    />
                    <span className="ml-2 text-sm flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: anno.color }}
                      />
                      {anno.note || anno.cat}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 px-3 py-2 text-xs bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleExportPDF}
                className="flex-1 px-3 py-2 text-xs bg-gray-900 text-white rounded hover:bg-gray-800"
              >
                Export PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


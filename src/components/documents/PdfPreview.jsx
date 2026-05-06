import { useState } from 'react';
import { Worker, Viewer, SpecialZoomLevel } from '@react-pdf-viewer/core';
import { zoomPlugin } from '@react-pdf-viewer/zoom';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/zoom/lib/styles/index.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faMagnifyingGlassMinus, 
  faMagnifyingGlassPlus 
} from '@fortawesome/free-solid-svg-icons';

/**
 * PDF Preview Component
 * Renders PDF documents with zoom and page navigation
 * Uses the zoom plugin for proper programmatic zoom control
 */
const PdfPreview = ({ blobUrl, fileName }) => {
  const [numPages, setNumPages] = useState(0);
  const [currentScale, setCurrentScale] = useState(1.0);

  // Create zoom plugin instance
  const zoomPluginInstance = zoomPlugin();
  const { zoomTo } = zoomPluginInstance;

  const handleDocumentLoad = (e) => {
    setNumPages(e.doc.numPages);
  };

  const handleZoomIn = () => {
    const newScale = Math.min(currentScale + 0.25, 3.0);
    zoomTo(newScale);
    setCurrentScale(newScale);
  };

  const handleZoomOut = () => {
    const newScale = Math.max(currentScale - 0.25, 0.5);
    zoomTo(newScale);
    setCurrentScale(newScale);
  };

  const handleZoomReset = () => {
    zoomTo(1.0);
    setCurrentScale(1.0);
  };

  const handleFitWidth = () => {
    zoomTo(SpecialZoomLevel.PageWidth);
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-b border-zinc-700">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <span className="font-medium text-white truncate max-w-xs">
            {fileName}
          </span>
          {numPages > 0 && (
            <span className="text-gray-400">
              ({numPages} {numPages === 1 ? 'page' : 'pages'})
            </span>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 text-gray-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
            title="Zoom out (Ctrl+-)"
          >
            <FontAwesomeIcon icon={faMagnifyingGlassMinus} className="w-5 h-5" />
          </button>

          <span className="text-sm text-gray-300 min-w-[4rem] text-center">
            {Math.round(currentScale * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            className="p-2 text-gray-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
            title="Zoom in (Ctrl++)"
          >
            <FontAwesomeIcon icon={faMagnifyingGlassPlus} className="w-5 h-5" />
          </button>

          <button
            onClick={handleFitWidth}
            className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
            title="Fit width"
          >
            Fit
          </button>

          <button
            onClick={handleZoomReset}
            className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-zinc-700 rounded transition-colors"
            title="Reset zoom (100%)"
          >
            Reset
          </button>
        </div>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-auto bg-zinc-900">
        <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`}>
          <Viewer
            fileUrl={blobUrl}
            onDocumentLoad={handleDocumentLoad}
            onZoom={(e) => setCurrentScale(e.scale)}
            defaultScale={SpecialZoomLevel.PageWidth}
            plugins={[zoomPluginInstance]}
            theme={{
              theme: 'dark',
            }}
          />
        </Worker>
      </div>
    </div>
  );
};

export default PdfPreview;

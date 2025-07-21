// src/components/PDFViewer.tsx - Draggable PDF window component
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getUrl } from 'aws-amplify/storage';

interface PDFViewerProps {
  pdfS3Key: string;
  fileName?: string;
  isVisible: boolean;
  onClose: () => void;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({ 
  pdfS3Key, 
  fileName, 
  isVisible, 
  onClose 
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const objectRef = useRef<HTMLObjectElement>(null);

  const loadPdfUrl = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPdfLoadError(false);
      console.log('📄 [DEBUG] Loading PDF preview for:', pdfS3Key);

      const downloadUrl = await getUrl({
        path: pdfS3Key,
        options: {
          expiresIn: 3600, // URL expires in 1 hour
        },
      });

      const urlString = downloadUrl.url.toString();
      setPdfUrl(urlString);
      console.log('✅ [DEBUG] PDF preview URL generated successfully:', urlString);
      
      // Test if the URL is accessible
      try {
        const response = await fetch(urlString, { method: 'HEAD' });
        console.log('📄 [DEBUG] PDF URL test response:', {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          ok: response.ok
        });
      } catch (fetchError) {
        console.warn('⚠️ [DEBUG] PDF URL test failed:', fetchError);
      }
      
    } catch (err) {
      console.error('💥 [DEBUG] Failed to load PDF preview:', err);
      setError('Failed to load PDF preview');
    } finally {
      setLoading(false);
    }
  }, [pdfS3Key]);

  // Handle PDF object load error
  const handlePdfLoadError = () => {
    console.warn('⚠️ [DEBUG] PDF object failed to load, trying fallback methods');
    setPdfLoadError(true);
  };

  // Handle opening PDF in new tab
  const handleOpenInNewTab = () => {
    if (pdfUrl) {
      console.log('📄 [DEBUG] Opening PDF in new tab:', pdfUrl);
      window.open(pdfUrl, '_blank');
    }
  };

  useEffect(() => {
    if (isVisible && pdfS3Key && !pdfUrl) {
      loadPdfUrl();
    }
  }, [isVisible, pdfS3Key, pdfUrl, loadPdfUrl]);

  // Dragging functionality
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!windowRef.current) return;
    
    const rect = windowRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    // Keep window within viewport bounds
    const maxX = window.innerWidth - 600; // window width
    const maxY = window.innerHeight - 500; // window height
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    });
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleDownloadClick = () => {
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    }
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Semi-transparent backdrop */}
      <div className="pdf-viewer-backdrop" />
      
      {/* Draggable PDF window */}
      <div 
        ref={windowRef}
        className={`pdf-viewer-window ${isDragging ? 'dragging' : ''}`}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`
        }}
      >
        {/* Draggable header */}
        <div 
          className="pdf-window-header"
          onMouseDown={handleMouseDown}
        >
          <h3 className="pdf-window-title">
            📄 {fileName || 'PDF Preview'}
          </h3>
          <button 
            className="pdf-window-close"
            onClick={onClose}
            title="Close PDF window"
          >
            ✕
          </button>
        </div>
        
        {/* PDF content area */}
        <div className="pdf-window-content">
          {loading ? (
            <div className="pdf-window-loading">
              <div className="pdf-window-spinner">🔄</div>
              <p>Loading PDF...</p>
            </div>
          ) : error ? (
            <div className="pdf-window-error">
              <div className="pdf-window-error-icon">❌</div>
              <p>{error}</p>
              <button 
                className="pdf-window-retry"
                onClick={loadPdfUrl}
              >
                🔄 Retry
              </button>
            </div>
          ) : pdfUrl ? (
            <div className="pdf-window-display">
              {/* Debug info */}
              <div className="pdf-debug-info">
                <small>PDF URL: {pdfUrl.substring(0, 100)}...</small>
                <button onClick={() => console.log('Full PDF URL:', pdfUrl)}>
                  Log Full URL
                </button>
              </div>
              
              {/* Try multiple PDF display methods */}
              {!pdfLoadError ? (
                <object
                  ref={objectRef}
                  data={pdfUrl}
                  type="application/pdf"
                  className="pdf-window-object"
                  title={fileName || 'PDF Preview'}
                  onError={handlePdfLoadError}
                >
                  {/* Fallback iframe */}
                  <iframe
                    src={pdfUrl}
                    className="pdf-window-iframe"
                    title={fileName || 'PDF Preview'}
                    onError={handlePdfLoadError}
                  >
                    Your browser cannot display this PDF.
                  </iframe>
                </object>
              ) : (
                /* Show fallback options when PDF won't embed */
                <div className="pdf-window-fallback">
                  <div className="pdf-fallback-icon">📄</div>
                  <h4>PDF Preview Not Available</h4>
                  <p>This PDF cannot be displayed in the preview window.</p>
                  <div className="pdf-fallback-buttons">
                    <button 
                      className="pdf-fallback-btn primary"
                      onClick={handleOpenInNewTab}
                    >
                      📱 Open in New Tab
                    </button>
                    <button 
                      className="pdf-fallback-btn secondary"
                      onClick={handleDownloadClick}
                    >
                      📥 Download PDF
                    </button>
                    <button 
                      className="pdf-fallback-btn retry"
                      onClick={() => setPdfLoadError(false)}
                    >
                      🔄 Try Again
                    </button>
                  </div>
                  
                  {/* Direct link as final fallback */}
                  <div className="pdf-direct-link">
                    <p><small>Or access directly:</small></p>
                    <a 
                      href={pdfUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="pdf-direct-url"
                    >
                      Click here to view PDF
                    </a>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
        
        {/* Window footer */}
        <div className="pdf-window-footer">
          <button 
            className="pdf-window-download"
            onClick={handleDownloadClick}
            disabled={!pdfUrl}
          >
            📥 Download
          </button>
          <button 
            className="pdf-window-newtab"
            onClick={handleOpenInNewTab}
            disabled={!pdfUrl}
          >
            📱 New Tab
          </button>
          <button 
            className="pdf-window-close-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        .pdf-viewer-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.3);
          z-index: 998;
          backdrop-filter: blur(2px);
        }

        .pdf-viewer-window {
          position: fixed;
          width: 600px;
          height: 500px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          z-index: 999;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 2px solid #32b3e7;
          animation: windowAppear 0.2s ease-out;
        }

        .pdf-viewer-window.dragging {
          cursor: grabbing;
          user-select: none;
        }

        @keyframes windowAppear {
          from { 
            opacity: 0;
            transform: scale(0.9);
          }
          to { 
            opacity: 1;
            transform: scale(1);
          }
        }

        .pdf-window-header {
          background: linear-gradient(135deg, #32b3e7 0%, #1a9bd8 100%);
          color: white;
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: grab;
          user-select: none;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .pdf-window-header:active {
          cursor: grabbing;
        }

        .pdf-window-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .pdf-window-close {
          background: rgba(255, 255, 255, 0.15);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }

        .pdf-window-close:hover {
          background: rgba(255, 255, 255, 0.25);
        }

        .pdf-window-content {
          flex: 1;
          display: flex;
          background: #f8fcff;
          overflow: hidden;
        }

        .pdf-window-display {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .pdf-debug-info {
          background: #f0f0f0;
          padding: 8px;
          font-size: 10px;
          border-bottom: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pdf-debug-info button {
          padding: 2px 6px;
          font-size: 10px;
          background: #32b3e7;
          color: white;
          border: none;
          border-radius: 2px;
          cursor: pointer;
        }

        .pdf-window-object,
        .pdf-window-iframe {
          width: 100%;
          flex: 1;
          border: none;
          background: white;
        }

        .pdf-window-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: #5e6e77;
          text-align: center;
          padding: 30px;
          height: 100%;
        }

        .pdf-fallback-icon {
          font-size: 48px;
          opacity: 0.7;
        }

        .pdf-window-fallback h4 {
          margin: 0;
          color: #002b4b;
          font-size: 18px;
        }

        .pdf-window-fallback p {
          margin: 0;
          font-size: 14px;
          max-width: 300px;
          line-height: 1.4;
        }

        .pdf-fallback-buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 250px;
        }

        .pdf-fallback-btn {
          padding: 12px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .pdf-fallback-btn.primary {
          background: #32b3e7;
          color: white;
        }

        .pdf-fallback-btn.primary:hover {
          background: #1a9bd8;
          transform: translateY(-1px);
        }

        .pdf-fallback-btn.secondary {
          background: #10b981;
          color: white;
        }

        .pdf-fallback-btn.secondary:hover {
          background: #059669;
        }

        .pdf-fallback-btn.retry {
          background: #f59e0b;
          color: white;
        }

        .pdf-fallback-btn.retry:hover {
          background: #d97706;
        }

        .pdf-direct-link {
          margin-top: 20px;
          padding-top: 20px;
          border-top: 1px solid #e6f7ff;
          text-align: center;
        }

        .pdf-direct-link p {
          margin: 0 0 8px 0;
          font-size: 12px;
          color: #9ca3af;
        }

        .pdf-direct-url {
          color: #32b3e7;
          text-decoration: underline;
          font-size: 13px;
          word-break: break-all;
        }

        .pdf-direct-url:hover {
          color: #1a9bd8;
        }

        .pdf-window-loading,
        .pdf-window-error {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #5e6e77;
          text-align: center;
          width: 100%;
          padding: 20px;
        }

        .pdf-window-spinner {
          font-size: 24px;
          animation: spin 2s linear infinite;
        }

        .pdf-window-error-icon {
          font-size: 24px;
        }

        .pdf-window-loading p,
        .pdf-window-error p {
          margin: 0;
          font-size: 14px;
        }

        .pdf-window-retry {
          padding: 8px 16px;
          background: #32b3e7;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.2s;
        }

        .pdf-window-retry:hover {
          background: #1a9bd8;
        }

        .pdf-window-fallback {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          color: #5e6e77;
          text-align: center;
          padding: 20px;
          height: 100%;
        }

        .pdf-window-footer {
          background: #f8fcff;
          padding: 12px 16px;
          border-top: 1px solid #e6f7ff;
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }

        .pdf-window-download,
        .pdf-window-newtab,
        .pdf-window-close-btn {
          padding: 8px 14px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
          flex: 1;
        }

        .pdf-window-download {
          background: #32b3e7;
          color: white;
        }

        .pdf-window-download:hover:not(:disabled) {
          background: #1a9bd8;
        }

        .pdf-window-newtab {
          background: #10b981;
          color: white;
        }

        .pdf-window-newtab:hover:not(:disabled) {
          background: #059669;
        }

        .pdf-window-download:disabled,
        .pdf-window-newtab:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pdf-window-close-btn {
          background: #e6f7ff;
          color: #32b3e7;
          border: 1px solid #32b3e7;
        }

        .pdf-window-close-btn:hover {
          background: #32b3e7;
          color: white;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Mobile responsive adjustments */
        @media (max-width: 768px) {
          .pdf-viewer-window {
            width: 90vw;
            height: 70vh;
            left: 5vw !important;
            top: 15vh !important;
          }

          .pdf-window-header {
            padding: 10px 12px;
          }

          .pdf-window-title {
            font-size: 13px;
          }

          .pdf-window-footer {
            padding: 10px 12px;
            flex-direction: column;
          }

          .pdf-window-download,
          .pdf-window-newtab,
          .pdf-window-close-btn {
            width: 100%;
            justify-content: center;
          }
        }

        @media (max-width: 480px) {
          .pdf-viewer-window {
            width: 95vw;
            height: 80vh;
            left: 2.5vw !important;
            top: 10vh !important;
          }
        }
      `}</style>
    </>
  );
};
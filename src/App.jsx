import React, { useState, useRef, useEffect } from 'react';
import jsyaml from 'js-yaml';
import Editor from '@monaco-editor/react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

// Helper functions
function isPrimitive(v) {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function typeOf(v) {
  if (v === null) return 'null';
  if (v === '') return 'empty string';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  if (t === 'object') return 'object';
  if (t === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (t === 'boolean') return 'bool';
  if (t === 'string') return 'string';
  return t;
}

function metaText(t, v) {
  if (v === null || v === undefined) return t;
  if (t === 'array') return `array • ${v.length}`;
  if (t === 'object') return `object • ${Object.keys(v).length}`;
  return t;
}

function formatPrimitive(v) {
  if (v === null) return `<span class="text-info">null</span>`;
  if (v === '') return `<span class="text-info">null</span>`;
  if (typeof v === 'boolean') return `<span class="text-warning">${v}</span>`;
  if (typeof v === 'number') return `<span class="text-primary">${v}</span>`;
  return escapeHtml(String(v)).replace(/\n/g, '<br/>');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function iconFor(t, isRoot) {
  if (isRoot) return `<i class="bi bi-file-earmark text-secondary"></i>`;
  if (t === 'object') return `<i class="bi bi-folder2-open text-info"></i>`;
  if (t === 'array') return `<i class="bi bi-braces-asterisk text-success"></i>`;
  return `<i class="bi bi-file-earmark text-secondary"></i>`;
}

const Node = ({ nodeKey, value, isRoot = false, expandAll, collapseAll }) => {
  const t = typeOf(value);
  const isEmptyArray = t === 'array' && value.length === 0;

  if (isPrimitive(value) || isEmptyArray) {
    const displayType = isEmptyArray ? 'empty array' : t;
    const displayValue = isEmptyArray ? `<span class="text-info">null</span>` : formatPrimitive(value);
    return (
      <div className="kv">
        <div className="d-flex align-items-center gap-2 mb-1">
          <span className="key">{escapeHtml(nodeKey)}</span>
          <span className="badge badge-soft text-uppercase">{displayType}</span>
        </div>
        <div className="val" dangerouslySetInnerHTML={{ __html: displayValue }}></div>
      </div>
    );
  }

  const toggleAllWithAnim = (root, expand) => {
    const allNodes = [root, ...Array.from(root.querySelectorAll('details.node'))];
    allNodes.forEach(node => {
      node.open = expand;
    });
  };

  const handleSummaryClick = (e) => {
    e.preventDefault();
    const detailsNode = e.currentTarget.parentElement;
    if (e.shiftKey) {
      const expand = !detailsNode.open;
      toggleAllWithAnim(detailsNode, expand);
      return;
    }
    
    if (detailsNode.open) {
        detailsNode.open = false;
    } else {
        detailsNode.open = true;
        const nodeBody = detailsNode.querySelector('.node-body');
        if (nodeBody) {
            nodeBody.classList.remove('node-body-fade-in');
            void nodeBody.offsetWidth; // Trigger reflow
            nodeBody.classList.add('node-body-fade-in');
        }
    }
  };

  return (
    <details className="node" open={isRoot}>
      <summary onClick={handleSummaryClick}>
        <i className="bi bi-caret-right-fill chev"></i>
        <span dangerouslySetInnerHTML={{ __html: iconFor(t, isRoot) }}></span>
        <span className="fw-bold">{escapeHtml(nodeKey)}</span>
        {isRoot && <span className="badge badge-soft text-uppercase ms-2">YAML</span>}
        {isRoot && (
            <div className="ms-auto btn-group btn-group-sm">
                <button className="btn btn-outline-secondary" onClick={expandAll} title="Expand All">
                    <i className="bi bi-arrows-expand"></i>
                </button>
                <button className="btn btn-outline-secondary" onClick={collapseAll} title="Collapse All">
                    <i className="bi bi-arrows-collapse"></i>
                </button>
            </div>
        )}
        <span className="node-meta ms-2">{metaText(t, value)}</span>
      </summary>
      <div className="node-body node-body-fade-in">
        <div>
          {Array.isArray(value)
            ? value.map((v, i) => <Node key={i} nodeKey={String(i)} value={v} expandAll={expandAll} collapseAll={collapseAll} />)
            : Object.entries(value).map(([k, v]) => <Node key={k} nodeKey={k} value={v} expandAll={expandAll} collapseAll={collapseAll} />)}
        </div>
      </div>
    </details>
  );
};

function App() {
  const [error, setError] = useState('');
  const [yamlData, setYamlData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [yamlText, setYamlText] = useState('');
  const [minPanelSize, setMinPanelSize] = useState(20);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const calculateMinSize = () => {
        const minPixels = 400;
        const windowWidth = window.innerWidth;
        const minPercentage = (minPixels / windowWidth) * 100;
        setMinPanelSize(minPercentage);
    };

    calculateMinSize();
    window.addEventListener('resize', calculateMinSize);

    return () => {
        window.removeEventListener('resize', calculateMinSize);
    };
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      renderStructure(yamlText);
    }, 100);

    return () => {
      clearTimeout(handler);
    };
  }, [yamlText]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      setYamlText(text);
      setFileName(file.name);
      renderStructure(text);
    } catch (e) {
      setError(`Failed to read file.\n${e.message}`);
    }
  };

  const renderStructure = (text) => {
    if (!text.trim()) {
      setYamlData(null);
      setError('');
      return;
    }

    try {
      const data = jsyaml.load(text);
      setYamlData(data);
      setError('');
    } catch (e) {
      setYamlData(null);
      setError(e.message);
    }
  };

  const handleEditorChange = (value) => {
    setYamlText(value);
  };

  const expandAll = (e) => {
    e.stopPropagation();
    document.querySelectorAll('details.node').forEach(det => {
        if (!det.open) {
            det.open = true;
            const nodeBody = det.querySelector('.node-body');
            if (nodeBody) {
                nodeBody.classList.remove('node-body-fade-in');
                void nodeBody.offsetWidth; // Trigger reflow
                nodeBody.classList.add('node-body-fade-in');
            }
        }
    });
  };

  const collapseAll = (e) => {
    e.stopPropagation();
    document.querySelectorAll('details.node').forEach(det => det.open = false);
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="panel-container">
        <div className="p-2 d-flex align-items-center justify-content-between border-bottom">
            <div className="d-flex align-items-center">
                <h1 className="h4 mb-0 me-3">YAML Cooker</h1>
                <button className="btn btn-primary me-2" onClick={triggerFileInput}>
                    <i className="bi bi-folder2-open me-1"></i> Open File
                </button>
                <input type="file" accept=".yml,.yaml,.txt" ref={fileInputRef} onChange={handleFileChange} className="d-none" />
            </div>
        </div>

      <PanelGroup direction="horizontal" className="panel-group">
        <Panel defaultSize={50} minSize={minPanelSize}>
          <Editor
            height="100%"
            language="yaml"
            theme="vs-dark"
            value={yamlText}
            onChange={handleEditorChange}
            options={{
                minimap: { enabled: false },
                cursorSmoothCaretAnimation: 'on',
            }}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={50} minSize={minPanelSize}>
          <div className="panel-content">
            {error ? (
                <div key="error" className="text-danger p-3 animated-fade-in">
                    <h4><i className="bi bi-exclamation-triangle-fill me-2"></i>YAML Parse Error</h4>
                    <pre className="mt-3">{error}</pre>
                </div>
            ) : yamlData ? (
              <div key="data" className="animated-fade-in">
                <Node nodeKey={fileName || '(root)'} value={yamlData} isRoot={true} expandAll={expandAll} collapseAll={collapseAll} />
              </div>
            ) : (
              <div key="initial" className="text-center text-secondary mt-5 animated-fade-in">
                <p>Open a YAML file or start typing in the editor to see the structure view.</p>
              </div>
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default App;

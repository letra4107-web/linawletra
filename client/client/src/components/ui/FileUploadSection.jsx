import { useEffect, useRef, useState } from 'react';
// File upload to be implemented via API

const fileIcon = (type) => {
  if (type?.includes('pdf')) return '📄';
  if (type?.includes('image')) return '🖼';
  if (type?.includes('word') || type?.includes('doc')) return '📝';
  return '📁';
};

export default function FileUploadSection({
  pageSource,
  linkedId,
  category,
  title = 'Files',
  accept = '.pdf,.doc,.docx,.png,.jpg,.jpeg',
  emptyText = 'No files uploaded yet',
}) {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [description, setDescription] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadFiles = async () => {
      if (!linkedId) {
        setFiles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const data = await getUploadedFiles({ pageSource, linkedId });
      if (isMounted) {
        setFiles(data);
        setLoading(false);
      }
    };

    loadFiles();
    return () => {
      isMounted = false;
    };
  }, [pageSource, linkedId]);

  const handleFileSelect = (event) => {
    const items = Array.from(event.target.files || []);
    setSelected((prev) => [...prev, ...items]);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const items = Array.from(event.dataTransfer.files || []);
    setSelected((prev) => [...prev, ...items]);
  };

  const handleUpload = async () => {
    if (!selected.length || !linkedId) return;
    setUploading(true);
    setProgress(0);

    try {
      for (const file of selected) {
        await uploadFile({
          file,
          category,
          pageSource,
          linkedId,
          description,
          onProgress: setProgress,
        });
      }
      const updated = await getUploadedFiles({ pageSource, linkedId });
      setFiles(updated);
      setSelected([]);
      setDescription('');
      setProgress(0);
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (fileId) => {
    await deleteUploadedFile(fileId);
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  return (
    <div className="detail-block" style={{ marginTop: 20 }}>
      <div className="detail-block-title">📎 {title}</div>

      <div
        className="detail-block"
        style={{ cursor: 'pointer' }}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="student-name">Click or drag files here</div>
        <div className="student-meta">Accepted: PDF, DOC, DOCX, PNG, JPG</div>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          hidden
          onChange={handleFileSelect}
        />
      </div>

      {selected.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          {selected.map((file, index) => (
            <div key={`${file.name}-${index}`} className="session-row">
              <div>
                <div className="session-title">{fileIcon(file.type)} {file.name}</div>
                <div className="session-meta">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </div>
              <button
                type="button"
                className="filter-pill"
                style={{ color: '#DC2626' }}
                onClick={() => setSelected((prev) => prev.filter((_, idx) => idx !== index))}
              >
                ✕ Remove
              </button>
            </div>
          ))}

          <div className="list-search">
            <span className="field-icon">📝</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a description (optional)"
              className="list-search"
              style={{ border: 'none', outline: 'none', background: 'transparent' }}
            />
          </div>

          {uploading && (
            <div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <div className="session-meta" style={{ marginTop: 6 }}>Uploading... {progress}%</div>
            </div>
          )}

          <button
            type="button"
            className="detail-action"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : '⬆ Upload Files'}
          </button>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        {loading ? (
          <div className="skeleton" style={{ height: 60 }} />
        ) : files.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-illustration">📭</div>
            <div className="empty-copy">{emptyText}</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {files.map((file) => (
              <div key={file.id} className="session-row">
                <div>
                  <div className="session-title">{fileIcon(file.fileType)} {file.fileName}</div>
                  <div className="session-meta">
                    {file.fileSize} · {file.description ? `${file.description} · ` : ''}
                    {file.uploadedAt?.toDate
                      ? file.uploadedAt.toDate().toLocaleDateString()
                      : new Date(file.uploadedAt).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a
                    href={file.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="detail-action"
                    style={{ padding: '8px 14px', fontSize: '0.82rem', textDecoration: 'none' }}
                  >
                    ⬇ Open
                  </a>
                  <button
                    type="button"
                    className="filter-pill"
                    style={{ color: '#DC2626' }}
                    onClick={() => handleDelete(file.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

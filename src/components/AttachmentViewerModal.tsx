'use client';

import { useEffect, useState } from 'react';

interface Props {
  url: string;
  fileName: string;
  mimeType: string | null;
  onClose: () => void;
}

export default function AttachmentViewerModal({ url, fileName, mimeType, onClose }: Props) {
  const isImage = mimeType?.startsWith('image/') ?? false;
  const isPdf   = mimeType === 'application/pdf';
  const isText  = mimeType === 'text/plain';
  const previewable = isImage || isPdf || isText;

  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError]     = useState('');

  useEffect(() => {
    if (!isText) return;
    let cancelled = false;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('Failed to load file.'); return r.text(); })
      .then(t => { if (!cancelled) setTextContent(t); })
      .catch(() => { if (!cancelled) setTextError('Failed to load file contents.'); });
    return () => { cancelled = true; };
  }, [isText, url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/60 flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden shadow-xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 shrink-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
          <div className="flex items-center gap-3 shrink-0">
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors">
              Open in new tab
            </a>
            <button onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none transition-colors">×</button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-gray-50">
          {isImage && (
            <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={fileName} className="max-w-full max-h-full object-contain rounded-lg" />
            </div>
          )}

          {isPdf && (
            <iframe src={url} title={fileName} className="w-full h-full border-0" />
          )}

          {isText && (
            <div className="w-full h-full overflow-auto p-4">
              {textError ? (
                <p className="text-sm text-red-600">{textError}</p>
              ) : textContent === null ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : (
                <pre className="text-xs font-mono text-gray-700 whitespace-pre-wrap break-words">{textContent}</pre>
              )}
            </div>
          )}

          {!previewable && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-center px-6">
              <p className="text-sm text-gray-500">Preview isn&apos;t available for this file type.</p>
              <a href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm font-semibold text-brand hover:text-brand-dark transition-colors">
                Open in new tab
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

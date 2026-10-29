import { useState } from 'react';
import { Icon } from './Icons.jsx';
import { useAuth } from '../auth.jsx';

const EXT = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
  video: ['mp4', 'webm', 'ogg', 'mov'],
  audio: ['mp3', 'wav', 'm4a'],
  pdf: ['pdf'],
  text: ['txt', 'log', 'csv'],
};
function kindOf(name = '', mime = '') {
  const ext = name.split('.').pop().toLowerCase();
  for (const [k, list] of Object.entries(EXT)) if (list.includes(ext)) return k;
  const m = (mime || '').toLowerCase();
  if (/^image\/(jpeg|png|gif|webp|bmp)/.test(m)) return 'image';
  if (/^video\/(mp4|webm|ogg)/.test(m)) return 'video';
  if (/^audio\//.test(m)) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('text/plain')) return 'text';
  return 'other';
}

// Opening the file is recorded in the custody history, so it only loads when the person asks for it.
export default function FileViewer({ evidence, onAccessed }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const kind = kindOf(evidence.file_name, evidence.mime_type);
  const url = `/api/evidence/${evidence.id}/file`;
  if (user.role === 'admin') return null;                       // administrators never open evidence files
  const canDownload = user.role !== 'viewer';                   // viewers are view-only
  const canPreview = kind !== 'other';

  async function show() {
    setError('');
    if (kind === 'text') {
      try {
        const r = await fetch(url, { credentials: 'same-origin' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Could not open the file (${r.status})`);
        const t = await r.text();
        setText(t.length > 20000 ? t.slice(0, 20000) + '\n\n… (showing the first 20,000 characters; download the file to see all of it)' : t);
      } catch (e) { setError(e.message); return; }
    }
    setOpen(true);
    if (onAccessed) setTimeout(onAccessed, 600);
  }

  return (
    <section className="panel stack" style={{ marginBottom: '1.2rem' }}>
      <h3>The file</h3>
      <p className="muted">
        {canDownload ? 'Opening or downloading' : 'Opening'} the file is written to the custody history. Open it only when you need to.
        The preview shows the stored copy, {user.role !== 'viewer' && <>so run <b>Verify integrity</b> if you need proof it is unchanged.</>}
      </p>
      <div className="row">
        {canPreview && !open && <button className="btn" onClick={show}><Icon name="eye" size={16} />View file</button>}
        {canPreview && open && <button className="btn btn--light" onClick={() => setOpen(false)}>Hide preview</button>}
        {canDownload && <a className="btn btn--light" href={`${url}?download=1`} onClick={() => onAccessed && setTimeout(onAccessed, 800)}>
          <Icon name="file" size={16} />Download
        </a>}
        {!canPreview && <span className="muted">{canDownload ? 'This file type cannot be previewed in the browser. Download it to open it.' : 'This file type cannot be previewed in the browser.'}</span>}
      </div>
      {error && <div className="notice notice--error">{error}</div>}
      {open && kind === 'image' && <img src={url} alt={evidence.description || evidence.file_name} style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }} />}
      {open && kind === 'video' && <video src={url} controls style={{ width: '100%', maxHeight: '70vh', borderRadius: 8, background: '#000' }} />}
      {open && kind === 'audio' && <audio src={url} controls style={{ width: '100%' }} />}
      {open && kind === 'pdf' && <iframe title="PDF preview" src={url} style={{ width: '100%', height: '75vh', border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />}
      {open && kind === 'text' && <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8, padding: '.9rem', maxHeight: '60vh', overflow: 'auto', margin: 0 }}>{text}</pre>}
    </section>
  );
}

// Chain-of-custody report (PDF). Mounted at /cases:  GET /cases/:id/report.pdf
const express = require('express');
const PDFDocument = require('pdfkit');
const dbModule = require('../db');
const pool = dbModule.pool || dbModule;
const { requireLogin } = require('../middleware/auth');
const { logAudit } = require('../audit');

const router = express.Router();
router.use(requireLogin);

// palette (matches the website)
const C = { ink: '#10233a', text: '#1d2733', muted: '#667085', line: '#d9dee5', paper: '#f3f5f8',
  manila: '#f3e9cf', manilaLine: '#d8c48a', blue: '#2f6fc4', amber: '#c57d12', grey: '#6b7685',
  good: '#177245', goodBg: '#e1f3ea', bad: '#b3261e', badBg: '#fbe6e3' };

const STATUS = { in_custody: ['In custody', C.blue], transferred: ['Awaiting receipt', C.amber], released: ['Released', C.grey] };
const EVENT = {
  registered: ['Registered', C.blue], accessed: ['Accessed', C.grey], transferred: ['Transferred', C.amber],
  received: ['Received', C.blue], released: ['Released', C.grey], verified: ['Integrity verified', C.good],
  verification_failed: ['Integrity check failed', C.bad],
};
const fmt = (d) => (d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }) : '');
const size = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);

router.get('/:id/report.pdf', async (req, res) => {
  const caseId = Number(req.params.id);
  if (!Number.isInteger(caseId)) return res.status(404).json({ error: 'Case not found.' });

  const cs = await pool.query('SELECT * FROM cases WHERE id = $1', [caseId]);
  if (!cs.rows.length) return res.status(404).json({ error: 'Case not found.' });
  if (req.user.role === 'viewer') {
    const a = await pool.query('SELECT 1 FROM case_assignments WHERE case_id = $1 AND user_id = $2', [caseId, req.user.id]);
    if (!a.rows.length) return res.status(403).json({ error: 'You do not have access to this case.' });
  }
  const c = cs.rows[0];
  const openerId = c.created_by ?? c.opened_by ?? c.owner_id ?? null;
  const opener = openerId ? (await pool.query('SELECT full_name, username FROM users WHERE id = $1', [openerId])).rows[0] : null;
  const me = (await pool.query('SELECT full_name, username, role FROM users WHERE id = $1', [req.user.id])).rows[0] || {};

  const ev = (await pool.query(
    `SELECT e.*, cu.full_name AS custodian_name, cu.username AS custodian_user, ru.full_name AS registrar_name
       FROM evidence e
       LEFT JOIN users cu ON cu.id = e.current_custodian_id
       LEFT JOIN users ru ON ru.id = e.registered_by
      WHERE e.case_id = $1 ORDER BY e.registered_at, e.id`, [caseId])).rows;
  const ids = ev.map((e) => e.id);
  const events = ids.length ? (await pool.query(
    `SELECT ce.*, fu.username AS from_name, tu.username AS to_name
       FROM custody_events ce
       LEFT JOIN users fu ON fu.id = ce.from_user
       LEFT JOIN users tu ON tu.id = ce.to_user
      WHERE ce.evidence_id = ANY($1::uuid[]) ORDER BY ce.created_at, ce.id`, [ids])).rows : [];
  const byEv = {};
  for (const e of events) (byEv[e.evidence_id] = byEv[e.evidence_id] || []).push(e);

  // latest integrity result for each item
  const latest = {};
  for (const e of ev) {
    const v = (byEv[e.id] || []).filter((x) => x.event_type === 'verified' || x.event_type === 'verification_failed').pop();
    latest[e.id] = v || null;
  }
  const flagged = ev.filter((e) => latest[e.id] && latest[e.id].event_type === 'verification_failed').length;
  const verifiedOk = ev.filter((e) => latest[e.id] && latest[e.id].event_type === 'verified').length;
  const never = ev.length - flagged - verifiedOk;

  logAudit({ userId: req.user.id, action: 'REPORT_DOWNLOADED', targetType: 'case', targetId: String(caseId),
    ip: req.ip, success: true, detail: c.case_number });

  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true,
    info: { Title: `Chain-of-custody report ${c.case_number}`, Author: 'DEMS' } });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${c.case_number}-custody-report.pdf"`);
  doc.pipe(res);

  const W = doc.page.width, H = doc.page.height, M = 44, CW = W - 2 * M, BOTTOM = H - 56;
  let y = 0;
  const need = (h) => { if (y + h > BOTTOM) { doc.addPage(); y = 48; } };
  const text = (s, x, yy, o = {}) => doc.font(o.font || 'Helvetica').fontSize(o.size || 9.5).fillColor(o.color || C.text)
    .text(String(s ?? ''), x, yy, { width: o.width, lineBreak: o.lineBreak ?? false, ellipsis: true, align: o.align });
  const pill = (label, color, x, yy) => {
    doc.font('Helvetica-Bold').fontSize(8);
    const w = doc.widthOfString(label) + 14;
    doc.roundedRect(x, yy, w, 15, 7.5).fill(color);
    doc.fillColor('#fff').text(label, x + 7, yy + 3.6, { lineBreak: false });
    return w;
  };

  // ---- header band ----
  doc.rect(0, 0, W, 118).fill(C.ink);
  doc.rect(0, 118, W, 4).fill('#c9372c');
  text('DEMS  ·  Digital Evidence Management System', M, 30, { size: 9, color: '#a9b8cc' });
  text('Chain-of-custody report', M, 48, { size: 24, font: 'Helvetica-Bold', color: '#ffffff' });
  const caseLabel = `Case ${c.case_number}`;
  text(caseLabel, M, 82, { size: 13, color: '#f3e9cf', font: 'Helvetica-Bold' });
  const lw = doc.font('Helvetica-Bold').fontSize(13).widthOfString(caseLabel) + 14;
  text(c.case_name, M + lw, 83.5, { size: 11, color: '#d6deea', width: CW - lw });
  y = 146;

  // ---- case facts ----
  const facts = [
    ['Case type', c.case_type], ['Case status', (c.status || '').replace(/^./, (s) => s.toUpperCase())],
    ['Opened by', opener ? opener.full_name : 'Not recorded'], ['Opened on', fmt(c.created_at)],
    ['Report prepared by', `${me.full_name || me.username || ''}`], ['Report generated', fmt(new Date())],
  ];
  const colW = CW / 3;
  facts.forEach((f, i) => {
    const x = M + (i % 3) * colW, yy = y + Math.floor(i / 3) * 38;
    text(f[0], x, yy, { size: 8, color: C.muted });
    text(f[1], x, yy + 12, { size: 10.5, font: 'Helvetica-Bold', width: colW - 10 });
  });
  y += 84;

  // ---- integrity summary ----
  const allGood = ev.length > 0 && flagged === 0 && never === 0;
  const sumColor = flagged ? C.bad : allGood ? C.good : C.muted;
  const sumBg = flagged ? C.badBg : allGood ? C.goodBg : C.paper;
  doc.roundedRect(M, y, CW, 50, 6).fill(sumBg);
  doc.rect(M, y, 5, 50).fill(sumColor);
  const headline = ev.length === 0 ? 'No evidence has been registered for this case yet.'
    : flagged ? `${flagged} of ${ev.length} item${ev.length === 1 ? '' : 's'} failed the latest integrity check.`
    : allGood ? `All ${ev.length} item${ev.length === 1 ? '' : 's'} passed the latest integrity check.`
    : `${verifiedOk} of ${ev.length} item${ev.length === 1 ? '' : 's'} verified. ${never} not yet checked.`;
  text(headline, M + 18, y + 11, { size: 11.5, font: 'Helvetica-Bold', color: sumColor, width: CW - 30 });
  text('An integrity check fingerprints the stored file again and compares it with the record on the blockchain.',
    M + 18, y + 29, { size: 8.5, color: C.muted, width: CW - 30 });
  y += 72;

  text(`Evidence items (${ev.length})`, M, y, { size: 13, font: 'Helvetica-Bold', color: C.ink });
  y += 24;

  // ---- one card per evidence item ----
  ev.forEach((e, idx) => {
    need(190);
    const st = STATUS[e.status] || [e.status, C.grey];
    // title row
    doc.roundedRect(M, y, CW, 44, 6).fill(C.manila);
    doc.roundedRect(M, y, CW, 44, 6).lineWidth(0.8).stroke(C.manilaLine);
    doc.circle(M + 17, y + 22, 5.5).lineWidth(2).stroke(C.manilaLine);
    text(`${idx + 1}.  ${e.description || e.file_name}`, M + 34, y + 8, { size: 12, font: 'Helvetica-Bold', color: '#2a2415', width: CW - 170 });
    text(e.file_name, M + 34, y + 26, { size: 8.5, color: '#6b5d38', width: CW - 170 });
    pill(st[0], st[1], M + CW - 12 - (doc.font('Helvetica-Bold').fontSize(8).widthOfString(st[0]) + 14), y + 8);
    const lv = latest[e.id];
    const vl = lv ? (lv.event_type === 'verified' ? 'Verified' : 'FAILED check') : 'Not yet checked';
    const vc = lv ? (lv.event_type === 'verified' ? C.good : C.bad) : C.grey;
    pill(vl, vc, M + CW - 12 - (doc.font('Helvetica-Bold').fontSize(8).widthOfString(vl) + 14), y + 25);
    y += 56;

    // details (two columns)
    const rows = [
      ['Evidence ID', e.id, true], ['File size', `${size(e.size_bytes)}  (${e.mime_type || 'unknown type'})`],
      ['Registered', `${fmt(e.registered_at)} by ${e.registrar_name || 'unknown'}`],
      ['Current custodian', e.custodian_name ? `${e.custodian_name} (${e.custodian_user})` : 'None'],
      ['Last integrity check', lv ? `${vl} on ${fmt(lv.created_at)}` : 'Never checked'],
    ];
    rows.forEach((r) => {
      text(r[0], M + 6, y, { size: 8.5, color: C.muted, width: 110 });
      text(r[1], M + 122, y, { size: r[2] ? 8 : 9.5, font: r[2] ? 'Courier' : 'Helvetica', width: CW - 128 });
      y += 15;
    });
    y += 4;
    // fingerprint box
    doc.roundedRect(M, y, CW, 36, 4).fill('#2a2415');
    text('SHA-256 FINGERPRINT', M + 10, y + 6, { size: 6.5, color: '#bda76a', font: 'Helvetica-Bold' });
    text(e.sha256, M + 10, y + 18, { size: 8.4, color: '#f4ead0', font: 'Courier', width: CW - 20 });
    y += 50;

    // custody timeline
    text('Custody history', M + 6, y, { size: 9.5, font: 'Helvetica-Bold', color: C.ink });
    y += 18;
    const list = byEv[e.id] || [];
    list.forEach((t, k) => {
      need(34);
      const ev2 = EVENT[t.event_type] || [t.event_type, C.grey];
      const who = [t.from_name && `from ${t.from_name}`, t.to_name && `to ${t.to_name}`, t.to_office && `to ${t.to_office}`].filter(Boolean).join('  ');
      const x0 = M + 14;
      if (k < list.length - 1) doc.moveTo(x0, y + 8).lineTo(x0, y + 34).lineWidth(1.2).stroke(C.line);
      doc.circle(x0, y + 6, 4.5).fill(ev2[1]);
      text(ev2[0], x0 + 14, y, { size: 9.5, font: 'Helvetica-Bold', color: ev2[1] === C.grey ? C.text : ev2[1], width: 150 });
      text(who, x0 + 150, y, { size: 9, width: CW - 170 });
      text(fmt(t.created_at), x0 + 14, y + 12, { size: 8, color: C.muted, width: 150 });
      if (t.note) text(t.note, x0 + 150, y + 12, { size: 8.5, color: C.muted, width: CW - 170 });
      y += 30;
    });
    if (!list.length) { text('No events recorded.', M + 20, y, { color: C.muted }); y += 18; }
    y += 14;
  });

  // ---- footer on every page ----
  const n = doc.bufferedPageRange().count;
  for (let i = 0; i < n; i++) {
    doc.switchToPage(i);
    doc.moveTo(M, H - 44).lineTo(W - M, H - 44).lineWidth(0.6).stroke(C.line);
    text(`${c.case_number}  ·  Chain-of-custody report  ·  Generated by DEMS`, M, H - 34, { size: 7.5, color: C.muted, width: CW - 70 });
    text(`Page ${i + 1} of ${n}`, W - M - 70, H - 34, { size: 7.5, color: C.muted, width: 70, align: 'right' });
    text('Academic prototype. Not an official record of the Philippine National Police.', M, H - 23, { size: 7, color: '#98a2b3', width: CW });
  }
  doc.end();
});

module.exports = router;

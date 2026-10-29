// Status words shown the same way everywhere.
const EVIDENCE = {
  in_custody: ['In custody', 'blue'],
  transferred: ['Awaiting receipt', 'amber'],
  released: ['Released', 'grey'],
};
const CASE = { open: ['Open', 'green'], closed: ['Closed', 'grey'] };

export default function Badge({ kind = 'evidence', value }) {
  const map = kind === 'case' ? CASE : EVIDENCE;
  const [label, tone] = map[value] || [value || 'Unknown', 'grey'];
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

export const EVENT_LABEL = {
  registered: 'Registered',
  accessed: 'Accessed',
  transferred: 'Transferred',
  received: 'Received',
  released: 'Released',
  verified: 'Integrity verified',
  verification_failed: 'Integrity check failed',
};
export const EVENT_ICON = {
  registered: 'file',
  accessed: 'eye',
  transferred: 'send',
  received: 'inbox',
  released: 'logout',
  verified: 'check',
  verification_failed: 'alert',
};

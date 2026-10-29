// Decorative evidence tag used on the home page. Sample data only.
export default function EvidenceTag() {
  return (
    <div className="tag" aria-hidden="true">
      <svg className="tag__string" viewBox="0 0 120 70" fill="none">
        <path d="M60 68C60 40 20 40 18 8M60 68C60 40 100 36 104 4" stroke="#b9a273" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="tag__body">
        <span className="tag__hole" />
        <div className="tag__head">
          <span>Case ACPO-2026-001</span>
          <span>Item 1 of 3</span>
        </div>
        <div className="tag__title">Photo of broken window</div>
        <dl className="tag__rows">
          <div><dt>File</dt><dd>window_01.jpg, 300.9 KB</dd></div>
          <div><dt>Registered</dt><dd>Investigator 1, 29 Oct 2026 16:08</dd></div>
          <div><dt>Holder</dt><dd>Evidence Custodian 1</dd></div>
        </dl>
        <div className="tag__hash">
          <span>9b1fe06fe0cd1530</span><span>9da1cbe21352e47b</span>
          <span>f89f362582484167</span><span>92002f8457471cb3</span>
        </div>
        <div className="tag__stamp">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          Verified
        </div>
      </div>
    </div>
  );
}

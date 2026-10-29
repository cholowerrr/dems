import { Link } from 'react-router-dom';
import EvidenceTag from '../components/EvidenceTag.jsx';
import { Logo } from '../components/Icons.jsx';

export default function Landing() {
  return (
    <div className="land">
      <header className="land-nav">
        <div className="land-nav__in">
          <Link to="/" className="brand">
            <Logo size={34} />
            <span><b>DEMS</b><span>Digital Evidence Management System</span></span>
          </Link>
          <div className="spacer" />
          <Link to="/login" className="btn btn--small">Sign in</Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero__in">
          <div>
            <h1>Prove the evidence hasn't been touched.</h1>
            <p className="lede">
              DEMS keeps a tamper-evident record of every piece of digital evidence in a municipal police station:
              who registered it, who held it, and whether the file still matches the fingerprint taken on day one.
            </p>
            <div className="hero__cta">
              <Link to="/login" className="btn">Sign in</Link>
              <a href="#how" className="btn btn--ghost">See how it works</a>
            </div>
          </div>
          <div className="hero__art"><EvidenceTag /></div>
        </div>
        <div className="tape" />
      </section>

      <section className="land-sec" id="how">
        <h2>From seized to verified</h2>
        <p className="intro">Every item follows the same four steps. Each step leaves a record that can't be quietly rewritten.</p>
        <ol className="route">
          <li>
            <div className="stop">1</div>
            <h3>Register</h3>
            <p>The investigator uploads the file. DEMS computes its SHA-256 fingerprint and keeps the file on the station's own server.</p>
          </li>
          <li>
            <div className="stop">2</div>
            <h3>Record</h3>
            <p>The fingerprint and the first custody entry are written to a Hyperledger Fabric blockchain. Nothing else leaves the station.</p>
          </li>
          <li>
            <div className="stop">3</div>
            <h3>Hand over</h3>
            <p>Every transfer, receipt and release is logged with who and when. A transfer is only complete once the receiving custodian confirms it.</p>
          </li>
          <li>
            <div className="stop">4</div>
            <h3>Verify</h3>
            <p>Check the file at any time. If even one byte changed, the result is TAMPERED, and the failed check is itself recorded.</p>
          </li>
        </ol>
      </section>

      <section className="band">
        <div className="band__in">
          <h2>Only the fingerprint goes on the blockchain.</h2>
          <div className="split">
            <div><b>On the blockchain</b><p>The SHA-256 hash, the item and case IDs, and each custody event. About 160 bytes per event.</p></div>
            <div><b>Stays at the station</b><p>The evidence file, its description, notes and any personal details.</p></div>
          </div>
        </div>
      </section>

      <section className="land-sec">
        <h2>Each person sees what their job needs</h2>
        <dl className="who">
          <div><dt>Administrator</dt><dd><p>Creates accounts, assigns roles and reviews the audit log. Does not register evidence.</p></dd></div>
          <div><dt>Investigator</dt><dd><p>Opens cases, registers evidence, transfers or releases it, verifies it and prints case reports.</p></dd></div>
          <div><dt>Evidence custodian</dt><dd><p>Confirms receipt, holds evidence, releases it to other offices and verifies what they hold.</p></dd></div>
          <div><dt>Viewer</dt><dd><p>Read-only access to the cases assigned to them, such as a prosecutor or a supervisor.</p></dd></div>
        </dl>
        <div className="feat">
          <div><h3>Custody timeline</h3><p>One page per item showing every event in order, with the person responsible.</p></div>
          <div><h3>Case reports</h3><p>A printable PDF with each item's hash, holder, verification status and custody history.</p></div>
          <div><h3>Audit log</h3><p>Sign-ins, refused actions and report downloads, kept separately from case history.</p></div>
          <div><h3>Built for small stations</h3><p>Runs on one server at the station. No evidence is uploaded to a cloud service.</p></div>
        </div>
      </section>

      <footer className="land-foot">
        <div className="tape" />
        <div className="land-foot__in">
          <p>
            DEMS is an academic prototype built by BS Cybersecurity students of the Holy Angel University School of Computing
            as a capstone project. It is not an official system of the Philippine National Police or any government office.
          </p>
          <Link to="/login" style={{ color: '#e6d3a3' }}>Sign in</Link>
        </div>
      </footer>
    </div>
  );
}

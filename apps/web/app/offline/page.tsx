'use client';

export default function OfflinePage() {
  return (
    <div className="card" style={{ maxWidth: 560, margin: '48px auto' }}>
      <b style={{ fontSize: 22 }}>You&apos;re offline.</b>
      <p className="muted">
        Remy AI needs a connection to reach your workspace. Check your network and try again —
        anything you had open is saved on this device.
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => window.location.reload()}>
          Retry
        </button>
        <a href="/today"><button className="btn">Back to Today</button></a>
      </div>
    </div>
  );
}

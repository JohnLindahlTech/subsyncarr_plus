import React from 'react';

const DocsView: React.FC = () => {
  return (
    <section id="view-docs" className="view">
      <div className="docs-container card">
        <div className="docs-header">
          <h2>Subsyncarr++ Documentation</h2>
          <p className="docs-subtitle">
            Understanding synchronization strategies, file naming, and the "Winner" system.
          </p>
        </div>

        <div className="docs-section">
          <h3>🏆 The "Winner" System</h3>
          <p>
            Subsyncarr++ runs multiple synchronization engines in parallel to find the perfect match for your subtitles.
            It does not just pick the first one that works; it picks the <strong>best</strong> one.
          </p>
          <ul className="docs-list">
            <li>
              <strong>Step 1: The Race</strong> - Engines (ffsubsync, alass) run simultaneously using different
              strategies.
            </li>
            <li>
              <strong>Step 2: The Score</strong> - Each result is scored (0-100%) based on how well the text matches the
              audio speech patterns.
            </li>
            <li>
              <strong>Step 3: The Primary File</strong> - The highest-scoring file is copied to a standardized name:{' '}
              <code>[Movie].synced.srt</code>. This is the file your media player (Plex/Jellyfin) should use.
            </li>
          </ul>
        </div>

        <div className="docs-section">
          <h3>📂 File Naming Convention</h3>
          <table className="docs-table">
            <thead>
              <tr>
                <th>File Type</th>
                <th>Example Name</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="badge success">Winner</span>
                </td>
                <td>
                  <code>Movie.synced.srt</code>
                </td>
                <td>
                  The final, best result. <strong>Use this one.</strong>
                </td>
              </tr>
              <tr>
                <td>
                  <span className="badge secondary">Trial</span>
                </td>
                <td>
                  <code>Movie.ffsubsync.srt</code>
                </td>
                <td>Result from the standard ffsubsync run.</td>
              </tr>
              <tr>
                <td>
                  <span className="badge secondary">Trial</span>
                </td>
                <td>
                  <code>Movie.alass.aggressive.srt</code>
                </td>
                <td>Result from the aggressive alass strategy.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="docs-section">
          <h3>🛠️ Engines & Strategies</h3>

          <div className="strategy-card">
            <h4>ffsubsync (Fourier Transform)</h4>
            <p>
              Uses advanced math to align speech patterns. It is very precise but can fail if the audio is noisy or the
              offset is huge.
            </p>
            <ul>
              <li>
                <strong>default:</strong> Standard linear sync. Best for most files.
              </li>
              <li>
                <strong>deep_search:</strong> Increases the search window from 60s to 300s. Use when the subtitle is
                "drifting" significantly.
              </li>
              <li>
                <strong>vlc_mode:</strong> "Greedy" mode. Finds the first clear speech match and shifts the whole file.
                Great for constant offsets, bad for drift.
              </li>
            </ul>
          </div>

          <div className="strategy-card">
            <h4>alass (Dynamic Time Warping)</h4>
            <p>
              Uses a flexible algorithm that can "stretch" and "compress" parts of the subtitle independently. Excellent
              for TV cuts or different framerates.
            </p>
            <ul>
              <li>
                <strong>default:</strong> Standard optimization.
              </li>
              <li>
                <strong>aggressive:</strong> Lowers the split penalty. It tries harder to force a match by splitting the
                subtitle into smaller chunks.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DocsView;

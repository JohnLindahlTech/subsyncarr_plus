import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import FileCard from '../components/FileCard';
import { API } from '../api/api';

const basename = (path: string) => path.split('/').pop() || '';

const LiveView: React.FC = () => {
  const { 
    currentRun, 
    files, 
    isRunning, 
    initMessage, 
    activeExtractions,
    updateState,
    openDetails
  } = useAppStore();

  useEffect(() => {
    const fetchData = async () => {
      // In Live View, we specifically want the files for the current run if it exists
      const runId = currentRun?.id;
      try {
        const data = await API.fetchStatus(1, 50, '', '', '', 'file_path', 'ASC', runId);
        updateState(data);
      } catch (err) {
        console.error('LiveView fetch failed', err);
      }
    };
    fetchData();
  }, [currentRun?.id, updateState]);

  const handleClearCompleted = async () => {
    await API.clearCompleted();
    updateState({ files: [] }, 'replace');
  };

  const processing = files.filter((f) => f.status === 'processing');
  const completed = files.filter((f) => ['completed', 'skipped', 'error'].includes(f.status)).slice(0, 10);

  // Progress calculation
  const progress = currentRun && currentRun.total_engines > 0 
    ? (currentRun.completed_engines / currentRun.total_engines) * 100 
    : 0;

  const showProgress = isRunning || (currentRun && currentRun.status === 'running');

  return (
    <section id="view-live" className="view">
      {showProgress && (
        <div id="currentRun" className="progress-section">
          <div className="progress-wrapper">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="progress-text">{Math.round(progress)}%</div>
          </div>
          <div className="progress-details">
            {currentRun ? (
              <>
                <div className="progress-stat">Movies: {currentRun.completed_videos} / {currentRun.total_videos}</div>
                <div className="progress-stat">
                  Subtitles: {currentRun.completed + currentRun.skipped + currentRun.failed} / {currentRun.total_files}
                </div>
              </>
            ) : (
              <>
                <div className="progress-stat">Movies: Scanning...</div>
                <div className="progress-stat">Subtitles: {initMessage || 'Searching files...'}</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="live-grid">
        <div className="live-active">
          <div className="section-header">
            <h3>Active Processing</h3>
          </div>
          <div className="file-list">
            {activeExtractions.map((path) => (
              <div key={path} className="file-card extraction-card">
                <div className="file-header">
                  <div className="file-name">🎬 {basename(path)}</div>
                  <span className="status-badge processing">Extracting Audio</span>
                </div>
                <div className="current-task-status">Preparing reference audio via FFmpeg...</div>
              </div>
            ))}
            
            {processing.map((f) => (
              <div key={f.file_path} onClick={() => openDetails(f)} style={{ cursor: 'pointer' }}>
                <FileCard file={f} />
              </div>
            ))}

            {activeExtractions.length === 0 && processing.length === 0 && (
              <p className="no-data-msg">No active tasks.</p>
            )}
          </div>
        </div>

        <div className="live-recent">
          <div className="section-header">
            <h3>Recently Completed</h3>
            <button onClick={handleClearCompleted} className="btn-link">Clear</button>
          </div>
          <div className="file-list">
            {completed.length > 0 ? (
              completed.map((f) => (
                <div key={f.file_path} onClick={() => openDetails(f)} style={{ cursor: 'pointer' }}>
                  <FileCard file={f} />
                </div>
              ))
            ) : (
              <p className="no-data-msg">No recently completed files.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LiveView;
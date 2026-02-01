import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import FileCard from '../components/FileCard';
import { API } from '../api/api';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

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

  const progress = currentRun && currentRun.total_engines > 0 
    ? (currentRun.completed_engines / currentRun.total_engines) * 100 
    : 0;

  const showProgress = isRunning || (currentRun && currentRun.status === 'running');

  return (
    <section className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {showProgress && (
        <div className="bg-surface border border-border shadow-sm rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <h3 className="font-bold text-lg">Active Run Progress</h3>
              <div className="flex gap-4 text-sm text-foreground-secondary font-medium">
                {currentRun ? (
                  <>
                    <span>Movies: {currentRun.completed_videos} / {currentRun.total_videos}</span>
                    <span>Subtitles: {currentRun.completed + currentRun.skipped + currentRun.failed} / {currentRun.total_files}</span>
                  </>
                ) : (
                  <span>{initMessage || 'Scanning Library...'}</span>
                )}
              </div>
            </div>
            <div className="text-2xl font-black text-primary">{Math.round(progress)}%</div>
          </div>
          <div className="h-3 w-full bg-secondary rounded-full overflow-hidden">
            <div 
              className="h-full bg-primary transition-all duration-500 ease-out" 
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">Active Processing</h3>
            <Badge variant="primary">{activeExtractions.length + processing.length}</Badge>
          </div>
          <div className="grid gap-3">
            {activeExtractions.map((path) => (
              <div key={path} className="p-4 bg-primary/5 border border-primary/10 rounded-lg animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-sm text-primary flex items-center gap-2">
                    <span>🎬</span> {basename(path)}
                  </div>
                  <Badge variant="processing">Extracting Audio</Badge>
                </div>
                <div className="text-xs text-primary/60 font-medium">Preparing reference audio via FFmpeg...</div>
              </div>
            ))}
            
            {processing.map((f) => (
              <div key={f.file_path} onClick={() => openDetails(f)} className="cursor-pointer">
                <FileCard file={f} />
              </div>
            ))}

            {activeExtractions.length === 0 && processing.length === 0 && (
              <div className="p-12 text-center border-2 border-dashed border-border rounded-xl">
                <p className="text-foreground-secondary font-medium italic">No active tasks.</p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground">Recently Completed</h3>
            <Button variant="link" size="sm" onClick={handleClearCompleted}>Clear</Button>
          </div>
          <div className="grid gap-3">
            {completed.length > 0 ? (
              completed.map((f) => (
                <div key={f.file_path} onClick={() => openDetails(f)} className="cursor-pointer">
                  <FileCard file={f} />
                </div>
              ))
            ) : (
              <div className="p-12 text-center border-2 border-dashed border-border rounded-xl text-foreground-secondary font-medium italic">
                No recently completed files.
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default LiveView;

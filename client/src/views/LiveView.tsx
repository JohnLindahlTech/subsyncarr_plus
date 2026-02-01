import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import FileCard from '../components/FileCard';
import { API } from '../api/api';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import ViewContainer from '../components/ui/ViewContainer';
import { Heading, Subheading } from '../components/ui/Typography';

const basename = (path: string) => path.split('/').pop() || '';

const LiveView: React.FC = () => {
  const {
    currentRun,
    files,
    isRunning,
    initMessage,
    activeExtractions,
    updateState,
    openDetails,
    searchQuery,
    agreementFilter,
    statusFilter,
  } = useAppStore();

  useEffect(() => {
    const fetchData = async () => {
      // In Live View, we specifically want the files for the current run if it exists
      const runId = currentRun?.id;
      try {
        const data = await API.fetchStatus(
          1,
          50,
          searchQuery,
          agreementFilter,
          statusFilter,
          'file_path',
          'ASC',
          runId,
        );
        updateState(data);
      } catch (err) {
        console.error('LiveView fetch failed', err);
      }
    };
    fetchData();
  }, [currentRun?.id, updateState, searchQuery, agreementFilter, statusFilter]);

  const handleClearCompleted = async () => {
    await API.clearCompleted();
    updateState({ files: [] }, 'replace');
  };

  // Only show processing files if a run is actually active
  const processing = isRunning ? files.filter((f) => f.status === 'processing') : [];
  const completed = files.filter((f) => ['completed', 'skipped', 'error'].includes(f.status)).slice(0, 10);

  const progress =
    currentRun && currentRun.total_engines > 0 ? (currentRun.completed_engines / currentRun.total_engines) * 100 : 0;

  const showProgress = isRunning || (currentRun && currentRun.status === 'running');

  return (
    <ViewContainer className="space-y-8">
      {/* Progress Section - Fixed at top */}
      {showProgress && (
        <div className="bg-surface border border-border shadow-sm rounded-xl p-6 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-1">
              <Heading>Active Run Progress</Heading>
              <div className="flex gap-4 text-sm text-foreground-secondary font-medium">
                {currentRun ? (
                  <>
                    <span>
                      Movies: {currentRun.completed_videos} / {currentRun.total_videos}
                    </span>
                    <span>
                      Subtitles: {currentRun.completed + currentRun.skipped + currentRun.failed} /{' '}
                      {currentRun.total_files}
                    </span>
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

      {/* Main Grid - Fills remaining height */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-0">
        {/* Left Column: Active Processing */}
        <div className="flex flex-col min-h-0 space-y-4">
          <div className="flex items-center justify-between px-1">
            <Subheading>Active Processing</Subheading>
            <Badge status="processing">{activeExtractions.length + processing.length}</Badge>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
            {activeExtractions.map((path) => (
              <div key={path} className="p-4 bg-primary/5 border border-primary/10 rounded-lg animate-pulse">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold text-sm text-primary flex items-center gap-2 truncate pr-2">
                    <span>🎬</span> {basename(path)}
                  </div>
                  <Badge status="processing" className="shrink-0">
                    Extracting Audio
                  </Badge>
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

        {/* Right Column: Recently Completed */}
        <div className="flex flex-col min-h-0 space-y-4">
          <div className="flex items-center justify-between px-1">
            <Subheading>Recently Completed</Subheading>
            <Button variant="link" size="sm" onClick={handleClearCompleted}>
              Clear
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
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
    </ViewContainer>
  );
};

export default LiveView;

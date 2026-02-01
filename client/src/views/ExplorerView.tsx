import React, { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { API } from '../api/api';
import { FileResult } from '@shared/types';
import clsx from 'clsx';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ViewContainer from '../components/ui/ViewContainer';
import { THead, TBody, TR, TH, TD } from '../components/ui/Table';

const basename = (path: string) => path.split('/').pop() || '';

const ExplorerView: React.FC = () => {
  const {
    explorerFiles,
    pagination,
    searchQuery,
    agreementFilter,
    statusFilter,
    sortColumn,
    sortOrder,
    updateState,
    setSearchQuery,
    setFilters,
    openDetails,
  } = useAppStore();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<number | null>(null);

  const fetchData = useCallback(
    async (page = 1, append = false) => {
      try {
        const data = await API.fetchStatus(page, 50, searchQuery, agreementFilter, statusFilter, sortColumn, sortOrder);

        if (append) {
          const currentFiles = useAppStore.getState().explorerFiles;
          updateState({
            explorerFiles: [...currentFiles, ...data.files],
            pagination: data.pagination,
          });
        } else {
          updateState(data);
        }
      } catch (err) {
        console.error('Failed to fetch explorer data', err);
      }
    },
    [searchQuery, agreementFilter, statusFilter, sortColumn, sortOrder, updateState],
  );

  const handleVerify = async (runId: string, filePath: string) => {
    await API.verifyFile(runId, filePath);
    fetchData(1, false);
  };

  useEffect(() => {
    fetchData(1, false);
  }, [fetchData]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && pagination.page < pagination.totalPages) {
          fetchData(pagination.page + 1, true);
        }
      },
      { threshold: 0.1 },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [pagination, fetchData]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeout.current) window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      fetchData(1, false);
    }, 300);
  };

  const handleFilterChange = (key: 'agreementFilter' | 'statusFilter', value: string) => {
    setFilters({ [key]: value });
  };

  const handleSort = (column: keyof FileResult) => {
    let newOrder: 'ASC' | 'DESC' = 'ASC';
    if (column === sortColumn) {
      newOrder = sortOrder === 'ASC' ? 'DESC' : 'ASC';
    }
    setFilters({ sortColumn: column, sortOrder: newOrder });
  };

  return (
    <ViewContainer className="space-y-6">
      <div className="flex flex-wrap gap-4 p-4 bg-surface border border-border rounded-xl shadow-sm shrink-0">
        <div className="flex-1 min-w-filter-search">
          <input
            type="text"
            placeholder="Search library by filename..."
            className="w-full h-10 px-4 rounded-lg bg-background border border-border focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        <select
          className="h-10 px-4 rounded-lg bg-background border border-border outline-none text-sm font-medium focus:ring-2 focus:ring-primary/20 min-w-filter-select"
          value={statusFilter}
          onChange={(e) => handleFilterChange('statusFilter', e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="completed">✅ Completed</option>
          <option value="processing">⚡ Processing</option>
          <option value="pending">⏳ Pending</option>
          <option value="error">❌ Error</option>
          <option value="skipped">⏭ Skipped</option>
        </select>
        <select
          className="h-10 px-4 rounded-lg bg-background border border-border outline-none text-sm font-medium focus:ring-2 focus:ring-primary/20 min-w-filter-select"
          value={agreementFilter}
          onChange={(e) => handleFilterChange('agreementFilter', e.target.value)}
        >
          <option value="">All Confidence Levels</option>
          <option value="verified">✅ Verified Only</option>
          <option value="suspicious">⚠️ Suspicious Only</option>
          <option value="low_confidence">🔘 Low Confidence</option>
        </select>
      </div>

      <div className="flex-1 min-h-0 bg-surface border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <THead className="sticky top-0 z-10 shadow-sm">
              <TR>
                {[
                  { key: 'file_path', label: 'File Name' },
                  { key: 'status', label: 'Status' },
                  { key: 'agreement_status', label: 'Confidence' },
                  { key: 'best_score', label: 'Score' },
                ].map((col) => (
                  <TH
                    key={col.key}
                    sortable
                    active={sortColumn === col.key}
                    order={sortOrder}
                    onClick={() => handleSort(col.key as keyof FileResult)}
                  >
                    {col.label}
                  </TH>
                ))}
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {explorerFiles.length > 0 ? (
                explorerFiles.map((f: FileResult) => (
                  <TR key={`${f.run_id}-${f.file_path}`}>
                    <TD className="truncate max-w-md" title={f.file_path}>
                      {basename(f.file_path)}
                    </TD>
                    <TD>
                      <Badge status={f.status} />
                    </TD>
                    <TD>
                      {f.agreement_status ? (
                        <Badge status={f.agreement_status} />
                      ) : (
                        <span className="text-xs text-foreground-secondary opacity-30 italic">Not Reconciled</span>
                      )}
                    </TD>
                    <TD>
                      {f.best_score !== null && f.best_score !== undefined ? (
                        <span className={clsx('font-bold', f.best_score < 50 ? 'text-danger' : 'text-success')}>
                          {f.best_score}%
                        </span>
                      ) : (
                        <span className="opacity-30">—</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {['completed', 'error', 'skipped'].includes(f.status) && (
                          <Button variant="ghost" size="sm" onClick={() => openDetails(f)} className="h-8">
                            🔍 Details
                          </Button>
                        )}
                        {f.status === 'completed' && f.agreement_status !== 'verified' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleVerify(f.run_id, f.file_path)}
                            className="h-8 text-success hover:bg-success/10"
                          >
                            ✅ Verify
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))
              ) : (
                <TR>
                  <TD colSpan={5} className="px-6 py-12 text-center text-foreground-secondary italic font-medium">
                    No files found matching your search.
                  </TD>
                </TR>
              )}
            </TBody>
          </table>
          <div ref={sentinelRef} className="h-10"></div>
        </div>
      </div>
    </ViewContainer>
  );
};

export default ExplorerView;
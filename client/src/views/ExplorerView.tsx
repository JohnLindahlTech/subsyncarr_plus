import React, { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { API } from '../api/api';
import { FileResult } from '@shared/types';
import clsx from 'clsx';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

const basename = (path: string) => path.split('/').pop() || '';

const ExplorerView: React.FC = () => {
  const {
    files,
    pagination,
    searchQuery,
    agreementFilter,
    statusFilter,
    sortColumn,
    sortOrder,
    currentRun,
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
          const currentFiles = useAppStore.getState().files;
          updateState({
            files: [...currentFiles, ...data.files],
            pagination: data.pagination,
          });
        } else {
          updateState({
            files: data.files,
            pagination: data.pagination,
          });
        }
      } catch (err) {
        console.error('Failed to fetch explorer data', err);
      }
    },
    [searchQuery, agreementFilter, statusFilter, sortColumn, sortOrder, updateState],
  );

  const handleVerify = async (filePath: string) => {
    if (!currentRun) return;
    await API.verifyFile(currentRun.id, filePath);
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

  const getStatusVariant = (status: string): 'success' | 'danger' | 'processing' | 'secondary' => {
    if (status === 'completed') return 'success';
    if (status === 'error') return 'danger';
    if (status === 'processing') return 'processing';
    return 'secondary';
  };

  return (
    <section className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap gap-4 p-4 bg-surface border border-border rounded-xl shadow-sm">
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

      <div className="bg-surface border border-border rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-background-alt/50 border-b border-border">
              {[
                { key: 'file_path', label: 'File Name' },
                { key: 'status', label: 'Status' },
                { key: 'best_engine', label: 'Best Engine' },
                { key: 'best_score', label: 'Score' }
              ].map((col) => (
                <th 
                  key={col.key}
                  className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary cursor-pointer hover:text-primary transition-colors group"
                  onClick={() => handleSort(col.key as keyof FileResult)}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    <span className={clsx(
                      "text-primary transition-opacity",
                      sortColumn === col.key ? "opacity-100" : "opacity-0 group-hover:opacity-40"
                    )}>
                      {sortColumn === col.key && sortOrder === 'DESC' ? '↓' : '↑'}
                    </span>
                  </div>
                </th>
              ))}
              <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-foreground-secondary">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {files.length > 0 ? (
              files.map((f) => (
                <tr key={`${f.run_id}-${f.file_path}`} className="hover:bg-primary/5 transition-colors group">
                  <td className="px-6 py-4 text-sm font-medium text-foreground truncate max-w-md" title={f.file_path}>
                    {basename(f.file_path)}
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={getStatusVariant(f.status)}>{f.status}</Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground-secondary font-medium">
                    {f.best_engine || <span className="opacity-30">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-foreground">
                    {f.best_score ? (
                      <span className={clsx(f.best_score < 50 ? "text-danger" : "text-success")}>
                        {f.best_score}%
                      </span>
                    ) : <span className="opacity-30">—</span>}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {['completed', 'error', 'skipped'].includes(f.status) && (
                        <Button variant="ghost" size="sm" onClick={() => openDetails(f)} className="h-8">🔍 Details</Button>
                      )}
                      {f.status === 'completed' && f.agreement_status !== 'verified' && (
                        <Button variant="ghost" size="sm" onClick={() => handleVerify(f.file_path)} className="h-8 text-success hover:bg-success/10">✅ Verify</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-foreground-secondary italic font-medium">
                  No files found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} className="h-10"></div>
      </div>
    </section>
  );
};

export default ExplorerView;
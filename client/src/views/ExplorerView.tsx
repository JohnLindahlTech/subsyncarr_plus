import React, { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { API } from '../api/api';
import { FileResult } from '@shared/types';
import clsx from 'clsx';

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

  // Initial fetch and fetch on filter change
  useEffect(() => {
    fetchData(1, false);
  }, [fetchData]);

  // Infinite Scroll
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

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) return null;
    return <span className="sort-icon">{sortOrder === 'ASC' ? ' ↑' : ' ↓'}</span>;
  };

  return (
    <section id="view-explorer" className="view">
      <div className="filter-bar">
        <input
          type="text"
          placeholder="Search library..."
          className="search-input"
          value={searchQuery}
          onChange={handleSearchChange}
        />
        <select
          className="search-input select-filter"
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
          className="search-input select-filter"
          value={agreementFilter}
          onChange={(e) => handleFilterChange('agreementFilter', e.target.value)}
        >
          <option value="">All Confidence Levels</option>
          <option value="verified">✅ Verified Only</option>
          <option value="suspicious">⚠️ Suspicious Only</option>
          <option value="low_confidence">🔘 Low Confidence</option>
        </select>
      </div>

      <div id="explorerResults" className="explorer-results">
        <table className="data-table">
          <thead>
            <tr>
              <th
                className={clsx('sortable', sortColumn === 'file_path' && 'active-sort')}
                onClick={() => handleSort('file_path')}
              >
                File Name {renderSortIcon('file_path')}
              </th>
              <th
                className={clsx('sortable', sortColumn === 'status' && 'active-sort')}
                onClick={() => handleSort('status')}
              >
                Status {renderSortIcon('status')}
              </th>
              <th
                className={clsx('sortable', sortColumn === 'best_engine' && 'active-sort')}
                onClick={() => handleSort('best_engine')}
              >
                Best Engine {renderSortIcon('best_engine')}
              </th>
              <th
                className={clsx('sortable', sortColumn === 'best_score' && 'active-sort')}
                onClick={() => handleSort('best_score')}
              >
                Score {renderSortIcon('best_score')}
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="explorerBody">
            {files.length > 0 ? (
              files.map((f) => (
                <tr key={`${f.run_id}-${f.file_path}`}>
                  <td>{basename(f.file_path)}</td>
                  <td>
                    <span className={clsx('status-badge', f.status)}>{f.status}</span>
                  </td>
                  <td>{f.best_engine || '-'}</td>
                  <td>{f.best_score ? `${f.best_score}%` : '-'}</td>
                  <td>
                    {['completed', 'error', 'skipped'].includes(f.status) && (
                      <button className="btn-link" onClick={() => openDetails(f)}>
                        🔍 Details
                      </button>
                    )}
                    {f.status === 'completed' && f.agreement_status !== 'verified' && (
                      <button className="btn-link" onClick={() => handleVerify(f.file_path)}>
                        ✅ Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="no-data">
                  No files found matching your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div ref={sentinelRef} className="sentinel"></div>
      </div>
    </section>
  );
};

export default ExplorerView;

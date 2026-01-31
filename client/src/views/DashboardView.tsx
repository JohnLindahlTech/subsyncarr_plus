import React, { useEffect, useState } from 'react';
import { API, DashboardResponse } from '../api/api';

type ErrorGroup = DashboardResponse['errors'][0];
type EngineStat = DashboardResponse['stats']['engines'][0];

const DashboardView: React.FC = () => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const dashboardData = await API.fetchDashboard();
        setData(dashboardData);
      } catch (err) {
        console.error('Failed to fetch dashboard', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <section className="view">
        <div className="dashboard-loading-placeholder">
          <span className="spinner-sm"></span>
          <span className="loading-text">Analyzing library statistics...</span>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { stats, errors } = data;

  return (
    <section id="view-dashboard" className="view">
      <div className="dashboard-grid">
        <div className="card">
          <h4>Library Statistics</h4>
          <div className="summary-grid">
            <div className="summary-card">
              <label>Total</label>
              <div className="summary-value">{stats.total_files}</div>
            </div>
            <div className="summary-card success">
              <label>Success</label>
              <div className="summary-value">{stats.success_count}</div>
            </div>
            <div className="summary-card danger">
              <label>Errors</label>
              <div className="summary-value">{stats.error_count}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h4>Engine Performance</h4>

          <div className="summary-grid">
            {stats.engines.map((e: EngineStat) => (
              <div key={e.engine} className="summary-card">
                <label>{e.engine}</label>

                <div className="summary-value">{e.total > 0 ? Math.round((e.success / e.total) * 100) : 0}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card full-width">
          <h4>Common Failure Patterns</h4>

          <div className="detail-list">
            {errors.map((g: ErrorGroup, i: number) => (
              <div key={i} className="error-group-item">
                <strong>{g.count} files:</strong> {g.message}
              </div>
            ))}

            {errors.length === 0 && <p className="no-data-msg">No common failure patterns detected.</p>}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardView;

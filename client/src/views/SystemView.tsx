import React, { useEffect, useState } from 'react';
import { API, ConfigResponse } from '../api/api';
import { useAppStore } from '../store/useAppStore';
import clsx from 'clsx';

const SystemView: React.FC = () => {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const health = useAppStore((state) => state.health);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await API.fetchConfig();
        setConfig(data);
      } catch (err) {
        console.error('Failed to fetch config', err);
      }
    };
    fetchConfig();
  }, []);

  return (
    <section id="view-system" className="view">
      <div className="system-grid">
        <div className="card">
          <h4>Environment Dependencies</h4>
          <div className="health-list">
            {health ? (
              health.dependencies.map((d) => (
                <div key={d.name} className={clsx('health-item', d.found ? 'ok' : 'error')}>
                  <span>
                    {d.name} {d.version || ''}
                  </span>
                  <span>{d.found ? '✅' : '❌'}</span>
                </div>
              ))
            ) : (
              <p className="no-data-msg">Loading health status...</p>
            )}
          </div>
        </div>

        <div className="card">
          <h4>Media Configuration</h4>
          <div className="detail-list">
            {config ? (
              <>
                <div className="config-line">
                  <strong>Scan Paths:</strong> {config.paths.join(', ')}
                </div>
                <div className="config-line">
                  <strong>Exclusions:</strong> {config.excludePaths.join(', ') || 'None'}
                </div>
                <div className="config-line">
                  <strong>Schedule:</strong> {config.schedule.cron} ({config.schedule.description})
                </div>
              </>
            ) : (
              <p className="no-data-msg">Loading configuration...</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SystemView;

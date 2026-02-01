import React, { useEffect, useState } from 'react';
import { API, DashboardResponse } from '../api/api';
import { Card, CardHeader, CardContent } from '../components/ui/Card';

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
      <section className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></span> 
          <span className="text-foreground-secondary font-medium animate-pulse">Analyzing library statistics...</span>
        </div>
      </section>
    );
  }

  if (!data) return null;

  const { stats, errors } = data;

  return (
    <section id="view-dashboard" className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <h4 className="font-bold text-foreground">Library Statistics</h4>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-background-alt rounded-lg border border-border space-y-1">
                <label className="text-xxs uppercase font-bold tracking-wider text-foreground-secondary">Total Files</label>
                <div className="text-2xl font-black text-foreground">{stats.total_files}</div>
              </div>
              <div className="p-4 bg-success/5 rounded-lg border border-success/10 space-y-1">
                <label className="text-xxs uppercase font-bold tracking-wider text-success/70">Success</label>
                <div className="text-2xl font-black text-success">{stats.success_count}</div>
              </div>
              <div className="p-4 bg-danger/5 rounded-lg border border-danger/10 space-y-1">
                <label className="text-xxs uppercase font-bold tracking-wider text-danger/70">Errors</label>
                <div className="text-2xl font-black text-danger">{stats.error_count}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h4 className="font-bold text-foreground">Engine Performance</h4>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {stats.engines.map((e: EngineStat) => (
                <div key={e.engine} className="p-4 bg-background-alt rounded-lg border border-border space-y-1">
                  <label className="text-xxs uppercase font-bold tracking-wider text-foreground-secondary truncate block" title={e.engine}>
                    {e.engine}
                  </label>
                  <div className="text-2xl font-black text-primary">
                    {e.total > 0 ? Math.round((e.success / e.total) * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="w-full">
        <CardHeader>
          <h4 className="font-bold text-foreground">Common Failure Patterns</h4>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border -mx-6 -my-4">
            {errors.map((g: ErrorGroup, i: number) => (
              <div key={i} className="p-6 hover:bg-background-alt transition-colors group">
                <div className="flex items-start gap-4">
                  <div className="px-2 py-1 bg-danger/10 text-danger rounded text-xs font-bold shrink-0">
                    {g.count} files
                  </div>
                  <div className="text-sm font-medium text-foreground-secondary group-hover:text-foreground transition-colors leading-relaxed">
                    {g.message}
                  </div>
                </div>
              </div>
            ))}
            {errors.length === 0 && (
              <div className="p-12 text-center text-foreground-secondary italic font-medium">
                No common failure patterns detected.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default DashboardView;
import React, { useEffect, useState } from 'react';
import { API, DashboardResponse } from '../api/api';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import StatItem from '../components/ui/StatItem';
import { Subheading } from '../components/ui/Typography';
import ViewContainer from '../components/ui/ViewContainer';

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
      <ViewContainer className="items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></span>
          <span className="text-foreground-secondary font-medium animate-pulse">Analyzing library statistics...</span>
        </div>
      </ViewContainer>
    );
  }

  if (!data) return null;

  const { stats, errors } = data;

  return (
    <ViewContainer className="overflow-y-auto custom-scrollbar pr-2 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 shrink-0">
        <Card>
          <CardHeader>
            <Subheading>Library Statistics</Subheading>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <StatItem label="Total Files" value={stats.total_files} />
              <StatItem label="Success" value={stats.success_count} variant="success" />
              <StatItem label="Errors" value={stats.error_count} variant="danger" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Subheading>Engine Performance</Subheading>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {stats.engines.map((e: EngineStat) => (
                <StatItem
                  key={e.engine}
                  label={e.engine}
                  value={`${e.total > 0 ? Math.round((e.success / e.total) * 100) : 0}%`}
                  variant="primary"
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="w-full shrink-0">
        <CardHeader>
          <Subheading>Common Failure Patterns</Subheading>
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
    </ViewContainer>
  );
};

export default DashboardView;

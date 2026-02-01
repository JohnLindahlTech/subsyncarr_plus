import React from 'react';
import { useAppStore } from '../store/useAppStore';
import clsx from 'clsx';
import { Card, CardHeader, CardContent } from '../components/ui/Card';

const SystemView: React.FC = () => {
  const { config, health } = useAppStore();

  return (
    <section id="view-system" className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-500">
      <Card>
        <CardHeader>
          <h4 className="font-bold text-foreground">Environment Dependencies</h4>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {health ? (
              health.dependencies.map((d) => (
                <div 
                  key={d.name} 
                  className={clsx(
                    'flex items-center justify-between p-4 rounded-lg border transition-colors',
                    d.found ? 'bg-success/5 border-success/10' : 'bg-danger/5 border-danger/10'
                  )}
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-foreground">{d.name}</span>
                    <span className="text-xs text-foreground-secondary font-medium uppercase tracking-tighter opacity-70">
                      {d.version || (d.found ? 'Detected' : 'Not Found')}
                    </span>
                  </div>
                  <span className="text-xl">{d.found ? '✅' : '❌'}</span>
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-foreground-secondary animate-pulse italic font-medium">
                Loading health status...
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h4 className="font-bold text-foreground">Media Configuration</h4>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {config ? (
              <>
                <div className="space-y-2">
                  <label className="text-xxs uppercase font-bold tracking-widest text-foreground-secondary">Scan Paths</label>
                  <div className="flex flex-wrap gap-2">
                    {config.paths.map(p => (
                      <code key={p} className="px-3 py-1.5 bg-background-alt border border-border rounded text-xs font-mono text-primary font-bold">
                        {p}
                      </code>
                    ))}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xxs uppercase font-bold tracking-widest text-foreground-secondary">Exclusions</label>
                  <div className="flex flex-wrap gap-2">
                    {config.excludePaths.length > 0 ? (
                      config.excludePaths.map(p => (
                        <code key={p} className="px-3 py-1.5 bg-background-alt border border-border rounded text-xs font-mono text-danger font-bold">
                          {p}
                        </code>
                      ))
                    ) : (
                      <span className="text-sm font-medium text-foreground-secondary italic opacity-50">None configured</span>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-foreground-secondary">Schedule</label>
                    <Badge variant={config.schedule.enabled ? 'success' : 'secondary'}>
                      {config.schedule.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="p-4 bg-background-alt rounded-lg border border-border flex items-center gap-4">
                    <span className="text-2xl grayscale brightness-125">⏰</span>
                    <div>
                      <div className="text-sm font-bold text-foreground">{config.schedule.description}</div>
                      <div className="text-xxs font-mono font-bold text-foreground-secondary opacity-60 tracking-widest">{config.schedule.cron}</div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-12 text-center text-foreground-secondary animate-pulse italic font-medium">
                Loading configuration...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

// Internal Helper for SystemView
const Badge: React.FC<{ children: React.ReactNode, variant?: 'success' | 'secondary' }> = ({ children, variant = 'secondary' }) => (
  <span className={clsx(
    'px-2 py-0.5 rounded text-xxs font-black uppercase tracking-widest',
    variant === 'success' ? 'bg-success/10 text-success' : 'bg-foreground-secondary/10 text-foreground-secondary'
  )}>
    {children}
  </span>
);

export default SystemView;
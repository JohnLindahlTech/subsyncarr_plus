import React from 'react';
import { Card, CardContent } from '../components/ui/Card';

const DocsView: React.FC = () => {
  return (
    <section id="view-docs" className="max-w-4xl mx-auto animate-in fade-in duration-500 pb-12">
      <Card>
        <CardContent className="p-12">
          <div className="mb-12">
            <h2 className="text-3xl font-black text-foreground mb-3">Subsyncarr++ Documentation</h2>
            <p className="text-foreground-secondary font-medium">Understanding synchronization strategies, file naming, and the "Winner" system.</p>
          </div>

          <div className="space-y-12">
            <section className="space-y-4">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-3">
                <span className="w-8 h-8 bg-primary/10 text-primary flex items-center justify-center rounded-lg text-sm">🏆</span>
                The "Winner" System
              </h3>
              <p className="text-foreground-secondary leading-relaxed pl-11">
                Subsyncarr++ runs multiple synchronization engines in parallel to find the perfect match for your subtitles. It does not just pick the first one that works; it picks the <strong>best</strong> one.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-11">
                {[
                  { step: '1', title: 'The Race', text: 'Engines run simultaneously using different strategies.' },
                  { step: '2', title: 'The Score', text: 'Results are scored based on speech pattern matching.' },
                  { step: '3', title: 'The Primary', text: 'The winner is copied to [Movie].synced.srt.' }
                ].map(s => (
                  <div key={s.step} className="p-4 bg-background-alt rounded-lg border border-border">
                    <div className="text-xs font-black text-primary mb-1 uppercase tracking-widest">Step {s.step}</div>
                    <div className="font-bold text-foreground mb-1">{s.title}</div>
                    <div className="text-xs text-foreground-secondary leading-normal font-medium">{s.text}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-3">
                <span className="w-8 h-8 bg-primary/10 text-primary flex items-center justify-center rounded-lg text-sm">📂</span>
                File Naming Convention
              </h3>
              <div className="pl-11 overflow-hidden">
                <table className="w-full text-left text-sm border-collapse border border-border rounded-lg">
                  <thead className="bg-background-alt/50 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-bold text-foreground-secondary uppercase tracking-widest text-[10px]">Type</th>
                      <th className="px-4 py-3 font-bold text-foreground-secondary uppercase tracking-widest text-[10px]">Example Name</th>
                      <th className="px-4 py-3 font-bold text-foreground-secondary uppercase tracking-widest text-[10px]">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-success/10 text-success text-[10px] font-black rounded uppercase">Winner</span></td>
                      <td className="px-4 py-3 font-mono text-primary font-bold">Movie.synced.srt</td>
                      <td className="px-4 py-3 text-foreground-secondary font-medium">The final, best result. <strong>Use this one.</strong></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-foreground-secondary/10 text-foreground-secondary text-[10px] font-black rounded uppercase">Trial</span></td>
                      <td className="px-4 py-3 font-mono opacity-70">Movie.ffsubsync.srt</td>
                      <td className="px-4 py-3 text-foreground-secondary font-medium">Result from standard ffsubsync run.</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-foreground-secondary/10 text-foreground-secondary text-[10px] font-black rounded uppercase">Trial</span></td>
                      <td className="px-4 py-3 font-mono opacity-70 text-[11px]">Movie.alass.aggressive.srt</td>
                      <td className="px-4 py-3 text-foreground-secondary font-medium">Result from aggressive alass strategy.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-6">
              <h3 className="text-xl font-bold text-foreground flex items-center gap-3">
                <span className="w-8 h-8 bg-primary/10 text-primary flex items-center justify-center rounded-lg text-sm">🛠️</span>
                Engines & Strategies
              </h3>
              
              <div className="pl-11 grid gap-6">
                <div className="p-6 bg-background-alt rounded-xl border border-border group hover:border-primary/30 transition-colors">
                  <h4 className="text-lg font-black text-foreground mb-2 flex items-center gap-3">
                    ffsubsync 
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black rounded uppercase tracking-[0.2em]">Fourier Transform</span>
                  </h4>
                  <p className="text-sm text-foreground-secondary font-medium mb-4 leading-relaxed">
                    Uses advanced math to align speech patterns. It is very precise but can fail if the audio is noisy or the offset is huge.
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { name: 'default', text: 'Standard linear sync. Best for most files.' },
                      { name: 'deep_search', text: 'Search window up to 300s. Use for major drift.' },
                      { name: 'vlc_mode', text: 'Greedy mode. Finds first clear match.' }
                    ].map(s => (
                      <li key={s.name} className="flex gap-3 text-xs">
                        <span className="font-bold text-primary font-mono">{s.name}:</span>
                        <span className="text-foreground-secondary font-medium">{s.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-6 bg-background-alt rounded-xl border border-border group hover:border-primary/30 transition-colors">
                  <h4 className="text-lg font-black text-foreground mb-2 flex items-center gap-3">
                    alass
                    <span className="px-2 py-0.5 bg-primary/10 text-primary text-[9px] font-black rounded uppercase tracking-[0.2em]">Dynamic Warping</span>
                  </h4>
                  <p className="text-sm text-foreground-secondary font-medium mb-4 leading-relaxed">
                    Uses a flexible algorithm that can "stretch" and "compress" parts of the subtitle independently. Excellent for TV cuts.
                  </p>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { name: 'default', text: 'Standard optimization. Reliable.' },
                      { name: 'aggressive', text: 'Lowers split penalty. Forces difficult matches.' }
                    ].map(s => (
                      <li key={s.name} className="flex gap-3 text-xs">
                        <span className="font-bold text-primary font-mono">{s.name}:</span>
                        <span className="text-foreground-secondary font-medium">{s.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default DocsView;
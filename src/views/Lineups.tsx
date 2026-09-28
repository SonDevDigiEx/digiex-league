import { useState } from 'react';
import { Crest, SecTitle } from '../components/bits';
import { Pitch, Token } from '../components/Pitch';
import { squadOf, useAccess, useLeague } from '../data/store';
import { FORMAT_LABEL, liveSlots, type Format, type Lineup } from '../lib/formation';
import { money } from '../lib/league';
import type { Player, Team } from '../lib/types';

/** One team's saved lineup on its own (vertical, own goal at the bottom). */
export function TeamLineupCard({ team, lineups }: { team: Team; lineups: Lineup[] }) {
  const { snap, openCard, openModal } = useLeague();
  const { canTeam } = useAccess();
  const has = (f: Format) => lineups.find((l) => l.format === f);
  const [fmt, setFmt] = useState<Format>(has('s7') || !has('s5') ? 's7' : 's5');
  const l = has(fmt);
  const squad = squadOf(snap!.players, team.id);
  const byId = new Map(squad.map((p) => [p.id, p]));
  const slots = l ? liveSlots(l, squad) : [];
  const starters = slots.map((s) => (s.pid ? byId.get(s.pid) : undefined)).filter(Boolean) as Player[];
  const value = starters.reduce((a, p) => a + p.value, 0);
  const avg = starters.length ? Math.round(starters.reduce((a, p) => a + p.ovr, 0) / starters.length) : 0;
  return (
    <div className="tl-card" style={{ ['--tc' as string]: team.color }}>
      <div className="tl-head">
        <Crest team={team} text={false} />
        <div><b>{team.name}</b><span>{l ? `${FORMAT_LABEL[fmt]} · ${l.formation}` : 'Chưa xếp đội hình'}</span></div>
        {l && starters.length > 0 && (
          <div className="tl-val" title="Tổng giá trị các cầu thủ trong đội hình chính">
            <b>{money(value)}</b><span>GIÁ TRỊ · OVR TB {avg}</span>
          </div>
        )}
        {lineups.length > 1 && <div className="seg sm">{(['s7', 's5'] as Format[]).filter(has).map((f) => <button key={f} className={fmt === f ? 'on' : ''} onClick={() => setFmt(f)}>{FORMAT_LABEL[f]}</button>)}</div>}
      </div>
      <Pitch className="tl-pitch" half>
        {slots.map((s, i) => {
          const p = s.pid ? byId.get(s.pid) : null;
          return <Token key={i} p={p} team={team} x={s.x} y={s.y} delay={i * 0.05} onClick={p ? () => openCard(p.id) : undefined} />;
        })}
        {!l && <div className="tl-empty">Chưa có đội hình chính</div>}
      </Pitch>
      {canTeam(team.id) && <button className="btn-upload" style={{ alignSelf: 'center' }} onClick={() => openModal({ kind: 'lineup', teamId: team.id, format: l ? fmt : undefined })}>⚙ Xếp đội hình</button>}
    </div>
  );
}

/** Home: every team's starting lineup. */
export function TeamLineups() {
  const { snap } = useLeague();
  const d = snap!;
  if (!d.teams.length) return null;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SecTitle>Đội hình chính</SecTitle>
      <div className="tl-grid">{d.teams.map((t) => <TeamLineupCard key={t.id} team={t} lineups={d.lineups.filter((l) => l.teamId === t.id)} />)}</div>
    </section>
  );
}

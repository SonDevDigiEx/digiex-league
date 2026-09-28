import { CONFIG_ERROR, hrefOf, useAccess, useLeague, type Route } from '../data/store';
import { ini, ROLE_LABEL } from '../lib/league';

export function Header() {
  const { route, go, snap, me: user, openModal, signOut } = useLeague();
  const { canAny, myT, tm, isAdmin, myPlayer } = useAccess();
  // Offers / invitations about the signed-in player.
  const mine = myPlayer && snap ? snap.offers.filter((o) => o.pid === myPlayer.id && o.status === 'pending').length : 0;
  const inCount = myT && snap ? snap.offers.filter((o) => o.to === myT && o.status === 'pending').length + snap.applications.filter((a) => a.teamId === myT && a.status === 'pending').length : 0;
  const waiting = isAdmin && snap ? snap.members.filter((m) => m.role === 'pending').length : 0;
  const items: [Route['view'], string][] = [['home', 'Trang chủ'], ['teams', 'Đội bóng'], ['matches', 'Trận đấu'], ['fame', 'Vinh danh'], ['market', 'Chuyển nhượng'], ...(canAny ? [['manage', 'Quản lý'] as [Route['view'], string]] : [])];

  return (
    <header className="hdr">
      <div className="hdr-in">
        <button className="brand" onClick={() => go({ view: 'home' })}>
          <div className="brand-mark">DX</div>
          <div>
            <div className="brand-name">DIGIEX LEAGUE</div>
            <div className="brand-sub">F8 · F9 DERBY · MÙA {new Date().getFullYear()}</div>
          </div>
        </button>
        <nav className="nav">
          {items.map(([k, l]) => {
            const on = route.view === k || (k === 'matches' && route.view === 'match');
            return (
              <a key={k} href={hrefOf({ view: k } as Route)} className={'nav-btn' + (on ? ' on' : '')} onClick={(e) => { e.preventDefault(); go({ view: k } as Route); }}>
                {l}
                {k === 'market' && inCount > 0 && <span className="nav-badge">{inCount}</span>}
                {k === 'manage' && waiting > 0 && <span className="nav-badge" title="Tài khoản chờ duyệt">{waiting}</span>}
              </a>
            );
          })}
        </nav>
        <div className="auth">
          {!user && !CONFIG_ERROR && <button className="btn-login" onClick={() => openModal({ kind: 'login' })}>Đăng nhập</button>}
          {user && (
            <div className="me">
              <button className="me-open" onClick={() => openModal({ kind: 'me' })} aria-label="Hồ sơ của tôi" title="Hồ sơ của tôi">
              <div className="me-ava" style={user.avatar ? { background: `center/cover url("${user.avatar}")` } : undefined}>{user.avatar ? '' : ini(user.name)}</div>
              <div>
                <div className="me-name">{user.name}</div>
                <div className="me-role">{ROLE_LABEL[user.role] + (user.team && snap ? ' · ' + tm(user.team)?.short : '')}</div>
              </div>
              </button>
              {myPlayer && (
                <button className="bell" onClick={() => openModal({ kind: 'inbox' })} aria-label="Thông báo" title="Thông báo chuyển nhượng">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
                  {mine > 0 && <span className="nav-badge">{mine}</span>}
                </button>
              )}
              <button className="btn-out" onClick={signOut}>Thoát</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

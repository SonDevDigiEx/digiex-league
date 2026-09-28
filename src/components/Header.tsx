import { CONFIG_ERROR, hrefOf, useAccess, useLeague, type Route } from '../data/store';
import { ini, ROLE_LABEL } from '../lib/league';

export function Header() {
  const { route, go, snap, user, openModal, signOut } = useLeague();
  const { canAny, myT, tm } = useAccess();
  const inCount = myT && snap ? snap.offers.filter((o) => o.to === myT && o.status === 'pending').length : 0;
  const items: [Route['view'], string][] = [['home', 'Trang chủ'], ['teams', 'Đội bóng'], ['matches', 'Trận đấu'], ['market', 'Chuyển nhượng'], ...(canAny ? [['manage', 'Quản lý'] as [Route['view'], string]] : [])];

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
              </a>
            );
          })}
        </nav>
        <div className="auth">
          {!user && !CONFIG_ERROR && <button className="btn-login" onClick={() => openModal({ kind: 'login' })}>Đăng nhập</button>}
          {user && (
            <div className="me">
              <div className="me-ava" style={user.avatar ? { background: `center/cover url("${user.avatar}")` } : undefined}>{user.avatar ? '' : ini(user.name)}</div>
              <div>
                <div className="me-name">{user.name}</div>
                <div className="me-role">{ROLE_LABEL[user.role] + (user.team && snap ? ' · ' + tm(user.team)?.short : '')}</div>
              </div>
              <button className="btn-out" onClick={signOut}>Thoát</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

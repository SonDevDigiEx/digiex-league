import { Header } from './components/Header';
import { CONFIG_ERROR, useLeague } from './data/store';
import { CardModal } from './modals/CardModal';
import { FormModal } from './modals/FormModal';
import { Home } from './views/Home';
import { Manage } from './views/Manage';
import { Market } from './views/Market';
import { MatchDetail, Matches } from './views/Matches';
import { Teams } from './views/Teams';

function Body() {
  const { snap, loadError, route, reload } = useLeague();
  if (CONFIG_ERROR) return <div className="boot">Chưa cấu hình máy chủ.<br />{CONFIG_ERROR}</div>;
  if (!snap) {
    return (
      <div className="boot">
        {loadError
          ? <div>Không tải được dữ liệu: {loadError}<br /><a onClick={() => reload()}>Thử lại</a></div>
          : 'Đang tải…'}
      </div>
    );
  }
  switch (route.view) {
    case 'teams': return <Teams teamId={route.teamId} />;
    case 'matches': return <Matches />;
    case 'match': return <MatchDetail key={route.matchId} matchId={route.matchId} />;
    case 'market': return <Market />;
    case 'manage': return <Manage teamId={route.teamId} />;
    default: return <Home />;
  }
}

export function App() {
  const { toast } = useLeague();
  return (
    <div className="app">
      <Header />
      <main className="main">
        <Body />
        <footer className="foot">
          <span>DigiEx League · Phòng Văn hóa – Thể thao</span>
        </footer>
      </main>
      <CardModal />
      <FormModal />
      {toast && <div key={toast.key} className={'toast' + (toast.err ? ' err' : '')} role="status">{toast.msg}</div>}
    </div>
  );
}

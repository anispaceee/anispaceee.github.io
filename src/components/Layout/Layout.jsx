import { Outlet, Link } from 'react-router-dom';
import Header from './Header';
import './Layout.css';

export default function Layout() {
  return (
    <div className="app-layout">
      <Header />
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <p>本站数据来源于 Bangumi 番组计划、Anibt 等优秀站点，详情请查阅 <Link to="/links">友情链接</Link></p>
      </footer>
    </div>
  );
}

import { Outlet, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Header from './Header';
import './Layout.css';

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
};

const pageTransition = {
  duration: 0.2,
  ease: 'easeOut',
};

export default function Layout() {
  const location = useLocation();

  return (
    <div className="app-layout">
      <Header />
      <main className="app-main">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={pageTransition}
            className="page-transition-wrapper"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="app-footer">
        <p>本站数据来源于 Bangumi 番组计划、Anibt 等优秀站点，详情请查阅 <Link to="/links">友情链接</Link></p>
      </footer>
    </div>
  );
}

import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="page page--centered">
      <div className="empty-state">
        <span className="page-head__eyebrow">Страница</span>
        <h1 className="page-head__title">404</h1>
        <p className="empty-state__text">Такой страницы нет.</p>
        <Link className="btn btn--primary" to="/d/new">
          К диаграмме
        </Link>
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="page page--centered">
      <h1 className="page__title">404</h1>
      <p className="page__subtitle">Такой страницы нет.</p>
      <Link className="ghost-button" to="/d/new">
        К диаграмме
      </Link>
    </section>
  );
}

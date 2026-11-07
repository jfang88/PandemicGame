import { createRoot } from 'react-dom/client';
import { LocalPlay } from './local-play';
import './style.css';

if (import.meta.env.DEV) {
  createRoot(document.getElementById('root')!).render(<LocalPlay />);
}

import { Link } from 'react-router-dom';
import { TurnSignalMark } from '../../components/TurnSignalLogo';

export function MarketingNav() {
  return (
    <nav className="sticky top-0 z-30 bg-ink/95 backdrop-blur border-b border-white/10">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <TurnSignalMark size={26} />
          <span className="font-display font-bold text-white text-lg tracking-tight">TurnSignal</span>
        </Link>
        <div className="flex items-center gap-5 sm:gap-7 text-sm">
          <Link to="/pricing" className="hidden sm:inline text-mist hover:text-white transition">
            Pricing
          </Link>
          <Link to="/faq" className="hidden sm:inline text-mist hover:text-white transition">
            FAQ
          </Link>
          <Link to="/login" className="text-mist hover:text-white transition">
            Log in
          </Link>
          <Link
            to="/pricing"
            className="bg-signal-amber text-ink font-display font-semibold text-sm px-4 py-2 rounded-lg hover:brightness-105 active:scale-95 transition"
          >
            Book a demo
          </Link>
        </div>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="bg-ink border-t border-white/10">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <TurnSignalMark size={20} glow={false} />
          <span className="font-display font-semibold text-white text-sm">TurnSignal</span>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist">
          <Link to="/pricing" className="hover:text-white transition">Pricing</Link>
          <Link to="/faq" className="hover:text-white transition">FAQ</Link>
          <Link to="/terms" className="hover:text-white transition">Terms of Service</Link>
          <Link to="/privacy" className="hover:text-white transition">Privacy Policy</Link>
          <Link to="/login" className="hover:text-white transition">Log in</Link>
        </div>
        <p className="text-xs text-steel">© {new Date().getFullYear()} TurnSignal</p>
      </div>
    </footer>
  );
}

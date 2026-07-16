import { Link } from 'react-router-dom';
import { MarketingNav, MarketingFooter } from './MarketingChrome';

const heroCards = [
  { stock: '4471', label: '2021 Civic', days: 1, cost: '$12', color: 'bg-signal-green', delay: '0s' },
  { stock: '4468', label: '2020 CR-V', days: 4, cost: '$61', color: 'bg-signal-amber', delay: '0.3s' },
  { stock: '4459', label: '2019 Malibu', days: 7, cost: '$118', color: 'bg-signal-amber', delay: '0.6s' },
  { stock: '4442', label: '2018 F-150', days: 12, cost: '$214', color: 'bg-signal-red', delay: '0.9s' },
];

const features = [
  {
    title: 'Scan a VIN, skip the typing',
    body: 'Point the camera at a windshield or door jamb. Year, make, model, and trim fill in themselves.',
  },
  {
    title: 'Every card shows the cost',
    body: "Aging isn't just a color — it's tied to a real dollar figure, so \"this one's been sitting\" becomes \"this one's cost us $214.\"",
  },
  {
    title: 'Built for how you actually work',
    body: 'Inbound, Service, Detail, Photos, Price for Lot — plus Loaners, Body Shop, and Waiting on Title, out of the way until you need them.',
  },
  {
    title: "Nobody's chasing anybody",
    body: 'Tag a teammate on a note and they get pinged. No more walking the lot to ask who has the keys.',
  },
];

export default function MarketingHome() {
  return (
    <div className="bg-white">
      <style>{`
        @keyframes ts-stripe-cycle {
          0%, 40% { background-color: #1FA463; }
          55%, 75% { background-color: #F5A623; }
          90%, 100% { background-color: #E5483D; }
        }
        .ts-animated-stripe { animation: ts-stripe-cycle 6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ts-animated-stripe { animation: none; }
        }
      `}</style>

      <MarketingNav />

      {/* Hero */}
      <section className="bg-ink">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28 grid sm:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-signal-amber text-xs font-display font-semibold tracking-widest uppercase mb-4">
              Built for independent dealers
            </p>
            <h1 className="font-display text-4xl sm:text-5xl font-bold text-white leading-[1.08] tracking-tight mb-5">
              Every day a car sits unfinished, it's costing you money.
            </h1>
            <p className="text-mist text-lg leading-relaxed mb-8">
              TurnSignal shows you exactly how much — right on the card, in real time. No DMS
              integration, no IT project. Live in about 20 minutes.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/pricing"
                className="bg-signal-amber text-ink font-display font-semibold px-6 py-3.5 rounded-lg hover:brightness-105 active:scale-95 transition"
              >
                Book a demo
              </Link>
              <Link
                to="/login"
                className="text-white font-display font-semibold px-6 py-3.5 rounded-lg border border-white/20 hover:bg-white/5 active:scale-95 transition"
              >
                Log in
              </Link>
            </div>
          </div>

          {/* Signature visual: the app's own aging-stripe system, animated */}
          <div className="space-y-2.5">
            {heroCards.map((card) => (
              <div
                key={card.stock}
                className="relative bg-white/[0.04] border border-white/10 rounded-xl pl-5 pr-4 py-3 overflow-hidden"
              >
                <div
                  className={`ts-animated-stripe absolute left-0 top-0 bottom-0 w-1.5 ${card.color}`}
                  style={{ animationDelay: card.delay }}
                />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-display font-semibold text-white text-sm">
                      {card.stock}-{card.label}
                    </p>
                    <p className="text-mist text-xs tabular">{card.days}d in stage</p>
                  </div>
                  <p className="font-display font-bold text-white tabular">{card.cost}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-2">
          The board your team already understands
        </h2>
        <p className="text-steel mb-10">Drag a card, and everything downstream updates itself.</p>
        <div className="grid sm:grid-cols-2 gap-5">
          {features.map((f) => (
            <div key={f.title} className="border border-gray-200 rounded-xl p-5">
              <h3 className="font-display font-semibold text-ink mb-1.5">{f.title}</h3>
              <p className="text-steel text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Positioning */}
      <section className="bg-asphalt">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20 grid sm:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink mb-4">
              Not built for a 40-store group. Built for yours.
            </h2>
            <p className="text-steel leading-relaxed mb-4">
              The enterprise recon tools were designed for franchise groups with an IT department
              and a DMS contract. If that's not you, you've mostly been stuck choosing between a
              whiteboard and a spreadsheet.
            </p>
            <p className="text-steel leading-relaxed">
              TurnSignal is the middle option: real tracking, real accountability, none of the
              integration overhead.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <p className="font-display font-semibold text-ink mb-4">What you don't need</p>
            <ul className="space-y-2.5 text-sm text-steel">
              {['A DMS integration', 'An IT team to set it up', 'A multi-week onboarding', 'A long-term contract'].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="text-signal-red font-bold">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-20 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-4">
            See it on your own inventory.
          </h2>
          <p className="text-mist mb-8">
            15 minutes, no pressure — bring a couple of stock numbers and we'll walk through it live.
          </p>
          <Link
            to="/pricing"
            className="inline-block bg-signal-amber text-ink font-display font-semibold px-7 py-3.5 rounded-lg hover:brightness-105 active:scale-95 transition"
          >
            Book a demo
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

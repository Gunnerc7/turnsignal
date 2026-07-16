import { MarketingNav, MarketingFooter } from './MarketingChrome';

export default function Pricing() {
  return (
    <div className="bg-white min-h-screen flex flex-col">
      <MarketingNav />

      <section className="flex-1 max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20 w-full">
        <div className="text-center max-w-lg mx-auto mb-14">
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-3">
            One plan. Everything included.
          </h1>
          <p className="text-steel">
            No tiers to compare, no add-ons to figure out. Every dealership gets the full board.
          </p>
        </div>

        <div className="max-w-sm mx-auto bg-ink rounded-2xl p-8 text-center">
          <p className="text-mist text-sm mb-1">Per store, per month</p>
          <p className="font-display text-5xl font-bold text-white mb-1">
            $249<span className="text-xl font-medium text-mist">/mo</span>
          </p>
          <p className="text-mist text-xs mb-6">No contract — cancel anytime.</p>
          <a
            href="mailto:gcummings731@gmail.com?subject=TurnSignal%20demo%20request"
            className="block w-full bg-signal-amber text-ink font-display font-semibold py-3 rounded-lg hover:brightness-105 active:scale-95 transition"
          >
            Book a demo
          </a>
        </div>

        <div className="max-w-lg mx-auto mt-14 space-y-4">
          {[
            'Real-time board with unlimited vehicles',
            'VIN scanning and decode',
            'Carrying cost & aging tracking',
            'Notes, tagging, and notifications',
            'Analytics and reporting',
            'Multi-store groups, if you have more than one lot',
          ].map((item) => (
            <div key={item} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-signal-green/10 text-signal-green flex items-center justify-center flex-shrink-0 text-xs font-bold">
                ✓
              </span>
              <p className="text-ink text-sm">{item}</p>
            </div>
          ))}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

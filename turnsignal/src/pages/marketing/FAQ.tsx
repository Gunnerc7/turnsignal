import { MarketingNav, MarketingFooter } from './MarketingChrome';

const faqs = [
  {
    q: 'Do I need to integrate this with my DMS?',
    a: "No. TurnSignal runs on its own — there's nothing to connect, nothing for an IT person to configure. You add vehicles directly, either by hand or by scanning a VIN.",
  },
  {
    q: 'How long does it take to get set up?',
    a: 'Most dealerships are moving real inventory within about 20 minutes of their first login. There\'s no onboarding project.',
  },
  {
    q: 'How does carrying cost actually get calculated?',
    a: "You set a daily holding-cost rate for new and used vehicles. From there, each card tracks its own time and shows what it's cost so far — no spreadsheet required.",
  },
  {
    q: 'Can I use this across more than one store?',
    a: "Yes. If you run multiple locations, they can be grouped together — managers can be given access across stores, and you can search and see activity across the whole group.",
  },
  {
    q: 'What happens to a vehicle once it\'s done?',
    a: "Mark it complete and it moves out of the active board, but its full history stays available if you ever need to look back at it.",
  },
  {
    q: 'Is there a contract?',
    a: 'No. Pricing is month to month — cancel any time.',
  },
  {
    q: "What if I'm not sure this is right for my lot?",
    a: 'Book a demo and bring a couple of real stock numbers. We\'ll walk through it live on your own inventory rather than a canned example.',
  },
];

export default function FAQ() {
  return (
    <div className="bg-white min-h-screen flex flex-col">
      <MarketingNav />

      <section className="flex-1 max-w-2xl mx-auto px-5 sm:px-8 py-16 sm:py-20 w-full">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink mb-10">
          Frequently asked questions
        </h1>
        <div className="space-y-8">
          {faqs.map((item) => (
            <div key={item.q}>
              <h2 className="font-display font-semibold text-ink mb-1.5">{item.q}</h2>
              <p className="text-steel text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

import { MarketingNav, MarketingFooter } from './MarketingChrome';

export default function Privacy() {
  return (
    <div className="bg-white min-h-screen flex flex-col">
      <MarketingNav />

      <section className="flex-1 max-w-2xl mx-auto px-5 sm:px-8 py-16 sm:py-20 w-full">
        <h1 className="font-display text-3xl font-bold text-ink mb-2">Privacy Policy</h1>
        <p className="text-steel text-sm mb-10">Last updated: [date]</p>

        <div className="bg-signal-amber/10 border border-signal-amber/30 rounded-lg p-4 mb-10">
          <p className="text-sm text-ink">
            <strong>Draft placeholder.</strong> This is a reasonable starting point, not reviewed by
            an attorney. Have it reviewed before relying on it.
          </p>
        </div>

        <div className="space-y-8 text-sm text-steel leading-relaxed">
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">1. What we collect</h2>
            <p>
              Account information (name, email), the vehicle and dealership operations data you
              enter into TurnSignal, and basic usage data needed to run and improve the Service.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">2. How we use it</h2>
            <p>
              To provide and operate the Service, respond to support requests, and send account or
              transactional emails (like password resets). We don't sell your data to third parties.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">3. Where it's stored</h2>
            <p>
              Data is stored with our infrastructure providers under industry-standard security
              practices. Access is limited to what's needed to operate the Service.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">4. Sharing</h2>
            <p>
              We share data only with service providers who help us run TurnSignal (such as hosting
              and email delivery), and only as needed for them to perform that function.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">5. Your choices</h2>
            <p>
              You can request a copy of your data or ask us to delete your account and associated
              data by contacting us directly.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">6. Changes to this policy</h2>
            <p>We may update this policy from time to time. We'll note the date at the top when we do.</p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">7. Contact</h2>
            <p>Questions about this policy: [contact email].</p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

import { MarketingNav, MarketingFooter } from './MarketingChrome';

export default function Terms() {
  return (
    <div className="bg-white min-h-screen flex flex-col">
      <MarketingNav />

      <section className="flex-1 max-w-2xl mx-auto px-5 sm:px-8 py-16 sm:py-20 w-full">
        <h1 className="font-display text-3xl font-bold text-ink mb-2">Terms of Service</h1>
        <p className="text-steel text-sm mb-10">Last updated: [date]</p>

        <div className="bg-signal-amber/10 border border-signal-amber/30 rounded-lg p-4 mb-10">
          <p className="text-sm text-ink">
            <strong>Draft placeholder.</strong> This is a reasonable starting point, not reviewed by
            an attorney. Have it reviewed before relying on it.
          </p>
        </div>

        <div className="space-y-8 text-sm text-steel leading-relaxed">
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">1. Agreement</h2>
            <p>
              By creating an account or using TurnSignal ("the Service"), you agree to these Terms.
              If you're agreeing on behalf of a dealership or company, you're confirming you have
              the authority to do so.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">2. The Service</h2>
            <p>
              TurnSignal is a vehicle reconditioning tracking tool provided on a month-to-month
              subscription basis. We may add, change, or remove features over time.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">3. Your account</h2>
            <p>
              You're responsible for keeping your login credentials secure and for activity that
              happens under your account. Tell us right away if you suspect unauthorized access.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">4. Your data</h2>
            <p>
              You retain ownership of the vehicle and dealership data you put into TurnSignal. We
              use it to provide the Service to you and don't sell it to third parties. See the{' '}
              <a href="/privacy" className="text-signal-blue">Privacy Policy</a> for details.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">5. Payment</h2>
            <p>
              Subscriptions are billed monthly in advance. You can cancel at any time; cancellation
              takes effect at the end of the current billing period.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">6. Termination</h2>
            <p>
              Either party may terminate this agreement at any time. We may suspend or terminate
              access for violation of these Terms or for non-payment.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">7. Disclaimer & limitation of liability</h2>
            <p>
              The Service is provided "as is" without warranties of any kind. To the fullest extent
              permitted by law, TurnSignal is not liable for indirect, incidental, or consequential
              damages arising from use of the Service.
            </p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">8. Changes to these Terms</h2>
            <p>We may update these Terms from time to time. Continued use of the Service means you accept the current version.</p>
          </div>
          <div>
            <h2 className="font-display font-semibold text-ink mb-2">9. Contact</h2>
            <p>Questions about these Terms: [contact email].</p>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

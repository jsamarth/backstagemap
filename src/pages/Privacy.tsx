import { Link } from "react-router-dom";
import { LogoMark } from "@/components/LogoMark";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to map
          </Link>
        </div>

        <h1 className="font-display text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 9, 2025</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <p className="text-muted-foreground">
              BackstageMap is a free tool for discovering live music events in NYC. This page explains
              what data is collected when you use the site and why.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-base mb-3">Analytics</h2>
            <p className="text-muted-foreground mb-3">
              We use analytics tools to understand how the site is used — things like which pages
              are visited, how long sessions last, and what devices people use. No personally
              identifiable information is collected through analytics.
            </p>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-1">Google Analytics 4</h3>
                <p className="text-muted-foreground">
                  We use Google Analytics 4 (GA4) to collect aggregated usage data. GA4 uses cookies
                  and may collect your IP address (anonymized), browser type, device type, and pages
                  visited. This data is processed by Google and subject to{" "}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors"
                  >
                    Google's Privacy Policy
                  </a>
                  . You can opt out using the{" "}
                  <a
                    href="https://tools.google.com/dlpage/gaoptout"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors"
                  >
                    Google Analytics Opt-out Browser Add-on
                  </a>
                  .
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-1">Vercel Analytics</h3>
                <p className="text-muted-foreground">
                  We use Vercel Web Analytics to track page views and visitor counts. Vercel Analytics
                  is privacy-friendly by design — it does not use cookies, does not fingerprint
                  browsers, and does not collect personally identifiable information. Data is aggregated
                  and processed by Vercel. See{" "}
                  <a
                    href="https://vercel.com/docs/analytics/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors"
                  >
                    Vercel's Analytics Privacy Policy
                  </a>
                  .
                </p>
              </div>

              <div>
                <h3 className="font-medium mb-1">Vercel Speed Insights</h3>
                <p className="text-muted-foreground">
                  We use Vercel Speed Insights to measure real-world page performance (Core Web Vitals
                  such as load time, layout shift, and input delay). This data helps us improve the
                  site experience. Speed Insights does not use cookies and does not collect personally
                  identifiable information. See{" "}
                  <a
                    href="https://vercel.com/docs/speed-insights/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors"
                  >
                    Vercel Speed Insights Privacy Policy
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display font-semibold text-base mb-3">Local Storage</h2>
            <p className="text-muted-foreground">
              We store a small amount of data in your browser's local storage to improve your
              experience:
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground list-disc list-inside">
              <li>Whether you've seen the welcome screen (so we don't show it every visit)</li>
              <li>Your bookmarked events (if you're not signed in)</li>
              <li>Which events you've viewed or rated (to avoid duplicate counts)</li>
            </ul>
            <p className="mt-2 text-muted-foreground">
              This data stays on your device and is never sent to our servers. You can clear it at
              any time by clearing your browser's site data.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-base mb-3">Account Data</h2>
            <p className="text-muted-foreground">
              If you create an account or sign in with Google, we store your email address and
              saved events using{" "}
              <a
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground transition-colors"
              >
                Supabase
              </a>
              . This data is used solely to sync your bookmarks across devices. We do not share
              it with third parties.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-base mb-3">Cookies</h2>
            <p className="text-muted-foreground">
              Google Analytics uses cookies to distinguish visitors and sessions. Vercel Analytics
              and Speed Insights do not use cookies. If you have an account, Supabase uses a
              session cookie to keep you signed in.
            </p>
          </section>

          <section>
            <h2 className="font-display font-semibold text-base mb-3">Contact</h2>
            <p className="text-muted-foreground">
              Questions about this policy? Use the feedback button on the map or reach out directly.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

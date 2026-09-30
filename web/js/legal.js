// Terms of Use and Privacy Policy. DRAFTS written in plain language to match what the site actually does; have a lawyer review before promoting the site.
const LEGAL_UPDATED = "September 30, 2026";
const contactLine = () => {
  const e = window.ANALYTIC && window.ANALYTIC.contactEmail;
  return e ? `<a href="mailto:${esc(e)}">${esc(e)}</a>` : `<i>contact address to be added</i>`;
};

function termsPage() {
  return `<div class="lesson legal"><h1>Terms of Use</h1><p class="small muted">Last updated ${LEGAL_UPDATED}</p>
  <div class="callout"><b>The short version:</b> The Analytic is for learning. Nothing here is investment advice, practice trading uses pretend money, and you use the site at your own risk.</div>
  <h2>1. What The Analytic is</h2><p>The Analytic ("we", "us", "the site") is an educational website about investing and financial markets. It offers lessons, market data and summaries, sector and stock charts, and a practice trading tool that uses pretend money.</p>
  <h2>2. Not advice, not a broker</h2>
  <p>We are <b>not</b> a broker, investment adviser, financial planner or tax adviser. Nothing on the site is a recommendation to buy, sell or hold any investment, or a suggestion that any investment is right for you. Scores, outlooks, "warning signs", summaries and charts are educational tools built from public data. They can be wrong, and past performance does not predict future results. Investing involves risk, including the loss of all the money you invest. Talk to a qualified professional before making real financial decisions.</p>
  <p>Practice trading is a simulation. It uses end-of-day prices, no fees and no bid-ask spread, so results will differ from real trading. No real money or securities are ever bought or sold.</p>
  <h2>3. Who can use the site</h2>
  <p>You must be <b>at least 16 years old</b>. If you are under the age of adulthood where you live (18 in many places), you confirm that a parent or guardian knows you are using the site and agrees to these terms and the Privacy Policy on your behalf.</p>
  <h2>4. Your account</h2>
  <p>You must give an accurate email address and keep your password private. You are responsible for activity on your account. One person per account. We may suspend or close accounts that break these terms or put the site at risk.</p>
  <h2>5. Using the site fairly</h2>
  <p>Please don't: use scripts, bots or scrapers to copy the site's data or content; try to break, overload or bypass the site's security; use the site for anything unlawful; or resell or republish our content or the market data shown here without permission.</p>
  <h2>6. Data and content from others</h2>
  <p>Prices, company information, filings, headlines and earnings data come from third-party sources and may be delayed, incomplete or inaccurate. Headlines link to their publishers, who own their content. Company names and logos belong to their owners, and their use here does not imply any affiliation. The lessons and site design belong to us; you may read and use them for personal learning, but not copy or redistribute them.</p>
  <h2>7. No warranties</h2>
  <p>The site is provided "as is" and "as available" without warranties of any kind, express or implied. We do not promise that it will be accurate, uninterrupted, secure or error-free.</p>
  <h2>8. Limit of liability</h2>
  <p>To the fullest extent the law allows, we are not liable for any losses or damages (including investment losses, lost profits, or data loss) arising from your use of, or inability to use, the site or from relying on anything in it. Nothing in these terms limits liability that cannot legally be limited.</p>
  <h2>9. Changes and ending</h2>
  <p>We may change the site or these terms at any time. If we make important changes we will update the date above. You may stop using the site, and delete your account, at any time (see the <a href="#/privacy">Privacy Policy</a>). Continuing to use the site after a change means you accept the updated terms.</p>
  <h2>10. Law and contact</h2>
  <p>These terms are governed by the laws of the United States and of the state in which the operator of the site is based, without regard to conflict-of-law rules. Questions about these terms: ${contactLine()}.</p>
  <p class="small muted">See also our <a href="#/privacy">Privacy Policy</a>.</p></div>`;
}

function privacyPage() {
  return `<div class="lesson legal"><h1>Privacy Policy</h1><p class="small muted">Last updated ${LEGAL_UPDATED}</p>
  <div class="callout"><b>The short version:</b> We collect only what we need to run your account: your email, a password (which we never see), and your practice progress. We don't show ads, sell your data, or use tracking or analytics tools.</div>
  <h2>1. What we collect</h2>
  <div class="tw"><table><tr><th>What</th><th>Why</th></tr>
   <tr><td><b>Email address</b></td><td>To create and secure your account, send confirmation and password-reset emails, and contact you about your account.</td></tr>
   <tr><td><b>Password</b></td><td>Stored only as a one-way encrypted hash by our sign-in provider. We can't read it.</td></tr>
   <tr><td><b>Age confirmation</b> (16+) and the time you accepted the terms</td><td>To show you agreed to the terms and meet the minimum age.</td></tr>
   <tr><td><b>Practice trading data</b>: your pretend holdings, trades, and any notes you write about why you made a trade</td><td>To run the practice tool and sync it across your devices. <i>Please don't put sensitive personal information in trade notes.</i></td></tr>
   <tr><td><b>Lesson progress</b> (which lessons you've completed)</td><td>To save your place across devices.</td></tr>
   <tr><td><b>Technical data</b> such as IP address, browser type and request times</td><td>Collected automatically in server logs by our hosting and sign-in providers, for security and to keep the service running.</td></tr></table></div>
  <p>If you use the site without signing in (only possible where accounts are not required), your progress stays in your own browser and is not sent to us.</p>
  <h2>2. What we don't do</h2>
  <p>We don't run advertising, we don't use analytics or tracking cookies, we don't sell or rent your personal information, and we don't ask for real financial account details, card numbers or government IDs. <b>Never enter those anywhere on this site.</b></p>
  <h2>3. Stored in your browser</h2>
  <p>The site saves small items in your browser's local storage: your sign-in session, your lesson progress, your practice portfolio and plan, and a few display preferences. These are needed for the site to work, and you can clear them any time in your browser settings (this will sign you out and remove un-synced local progress).</p>
  <h2>4. Who handles your data</h2>
  <p>We use a few service providers ("processors") who handle data only to provide their service to us:</p>
  <ul><li><b>Supabase</b>: provides sign-in and our database (your email, hashed password, practice data and progress).</li>
  <li><b>GitHub Pages</b>: hosts the website. Like any web host, it sees your IP address when you load pages.</li>
  <li><b>jsDelivr</b>: a content network that delivers a sign-in code library to your browser when accounts are enabled, so it also sees your IP address.</li>
  <li><b>Market data sources</b> (such as Yahoo Finance, Nasdaq, SEC EDGAR and news publishers): we fetch market data ourselves. When you search for a stock or open a live chart, our server asks these sources on your behalf, so they do not receive your email or account details. Clicking a headline takes you to the publisher's own site, which has its own privacy policy.</li></ul>
  <p>We may also disclose information if the law requires it, or to protect the site and its users. Your data may be processed in the United States or other countries where our providers operate.</p>
  <h2>5. How long we keep it</h2>
  <p>We keep your account data until you ask us to delete it. Server logs are kept by our providers for short periods under their own policies.</p>
  <h2>6. Your choices and rights</h2>
  <p>You can ask us to show you the data we hold about you, correct it, export it, or <b>delete your account and all its data</b>. Email us at ${contactLine()} from the address on your account and we will act on it within a reasonable time (aim: 30 days). Depending on where you live (for example the EU, UK or California) you may have additional legal rights, and you may also complain to your local data-protection authority.</p>
  <h2>7. Children</h2>
  <p>The site is for people aged <b>16 and over</b>. We do not knowingly collect information from anyone younger. If you believe a younger person has created an account, please contact us and we will delete it.</p>
  <h2>8. Security</h2>
  <p>Connections are encrypted (HTTPS), passwords are hashed, and our database is set up so each signed-in user can read and change only their own records. No system is perfectly secure, so please use a strong, unique password.</p>
  <h2>9. Changes and contact</h2>
  <p>If we change this policy we will update the date above and, for important changes, tell you on the site or by email. Questions: ${contactLine()}.</p>
  <p class="small muted">See also our <a href="#/terms">Terms of Use</a>.</p></div>`;
}

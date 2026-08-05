import { useDocumentTitle } from '../lib/use-document-title'
import { LegalLayout, Section } from './legal/LegalLayout'

export function PrivacyPolicyPage() {
  useDocumentTitle('Privacy Policy')
  return (
    <LegalLayout title="Privacy Policy" updated="August 2, 2026">
      <p>
        Sensorium connects you with a small, permanent group of people (a “cluster”). This policy
        explains what personal data we collect, why, and the choices you have. You must be at least
        18 years old to use Sensorium.
      </p>

      <Section title="1. What we collect">
        <p>
          When you create an account we collect your email, display name, date of birth, country,
          and any details you add to your profile. If you enable Local matching, we store a coarse
          location (city area) and the matching radius you choose, never your precise coordinates.
          We also record your activity on the service, such as messages, reactions, signals,
          votes, and notifications.
        </p>
        <p>
          Only your birth year is shown to other members. Month and day are used internally for
          matching and are never displayed.
        </p>
      </Section>

      <Section title="2. How we use your data">
        <p>We use the data we collect to provide, personalize, and protect our service, including:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>creating and matching clusters based on birth date or location;</li>
          <li>operating cluster chat, signals, votes, and notifications;</li>
          <li>moderating content and responding to reports of misconduct;</li>
          <li>improving the product and keeping it secure.</li>
        </ul>
      </Section>

      <Section title="3. Data sharing">
        <p>
          We do not sell your personal data. Within a cluster, your profile and answers to
          the introduction phase are visible only to that cluster. Reports you submit are shared
          only with our moderation team.
        </p>
      </Section>

      <Section title="4. Storage and deletion">
        <p>
          Data is stored by our hosted infrastructure provider and kept while you have an active
          account. You can delete your account at any time from Settings, which removes your
          profile, memberships, and the content you own. Some records may be retained where required
          by law or to investigate reported abuse.
        </p>
      </Section>

      <Section title="5. Age restriction">
        <p>
          Sensorium is not intended for anyone under 18. We require your date of birth and restrict
          accounts that do not meet the minimum age.
        </p>
      </Section>

      <Section title="6. Security & changes">
        <p>
          We use industry-standard safeguards and store data through a managed, verified platform.
          We may update this policy and will refresh the date at the top whenever we do.
        </p>
      </Section>

      <Section title="7. Contact">
        <p>
          Questions about this policy? Reach out at{' '}
          <a className="text-primary underline" href="mailto:privacy@sensorium.app">
            privacy@sensorium.app
          </a>
          .
        </p>
      </Section>
    </LegalLayout>
  )
}
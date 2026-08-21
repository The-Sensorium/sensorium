// Email templates for the moderation lifecycle. One render function per
// template, matched to the existing brand family (Sign Up Confirmation / Reset
// Password): #fff8f6 shell, "Sensorium" wordmark, the "Eight strangers. One
// cluster." tagline, and the #9d3d1c pill CTA.
//
// Rules: no mailto:, no "reply" or "email us" wording (outbound-only sender),
// no staff identity, no internal moderation notes or enforcement detail.

export type TemplateId =
  | 'message-hidden'
  | 'warning-issued'
  | 'account-suspended'
  | 'account-banned'
  | 'restriction-lifted'
  | 'report-received'
  | 'report-resolved'
  | 'appeal-received'
  | 'appeal-resolved'

export interface TemplateParams {
  display_name?: string
  reason?: string
  outcome?: 'actioned' | 'dismissed'
  expires_at?: string
  appeal_url?: string
  accepted?: boolean
  response?: string
}

export interface RenderedEmail {
  subject: string
  html: string
}

function shell(inner: string): string {
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0">
<div style="background:#fff8f6;padding:40px 16px;font-family:'Plus Jakarta Sans',Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto">
    <p style="font-size:18px;font-weight:700;color:#3a0b00;margin:0 0 8px">Sensorium</p>
    <p style="color:#802908;margin:0 0 24px;font-size:14px">Eight strangers. One cluster.</p>
    ${inner}
  </div>
</div></body></html>`
}

function heading(text: string): string {
  return `<h2 style="color:#3a0b00;font-size:24px;margin:0 0 12px">${text}</h2>`
}

function body(text: string): string {
  return `<p style="color:#5b403a;font-size:15px;line-height:1.6;margin:0 0 24px">${text}</p>`
}

function cta(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#9d3d1c;color:#ffffff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:600;font-size:15px">${label}</a>`
}

function footnote(lines: string[]): string {
  return `<p style="color:#8a746d;font-size:13px;line-height:1.5;margin:24px 0 0">${lines.join('<br>')}</p>`
}

function esc(value: string | undefined): string {
  if (value === undefined) return ''
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const greeting = (name?: string) => (name ? `Hi ${esc(name)},` : 'Hi,')

export function renderEmail(template: TemplateId, params: TemplateParams): RenderedEmail {
  switch (template) {
    case 'message-hidden':
      return {
        subject: 'Your message was hidden',
        html: shell(
          heading('Your message was hidden') +
            body(
              `${greeting(params.display_name)} A message you sent was hidden because it did not follow our community guidelines.`,
            ),
        ),
      }

    case 'warning-issued':
      return {
        subject: 'A warning was issued on your account',
        html: shell(
          heading('A warning was issued on your account') +
            body(
              `${greeting(params.display_name)} Please review the community guidelines to avoid further action.`,
            ),
        ),
      }

    case 'account-suspended': {
      const expiry = params.expires_at ? ` Your access resumes on ${formatDate(params.expires_at)}.` : ''
      return {
        subject: 'Your account has been temporarily suspended',
        html: shell(
          heading('Your account has been temporarily suspended') +
            body(`${greeting(params.display_name)} We're sorry, but your account can't be used for a while.${expiry}`) +
            (params.appeal_url ? cta(params.appeal_url, 'View your status and appeal') : '') +
            footnote(['If you think this is a mistake, you can appeal through the app.']),
        ),
      }
    }

    case 'account-banned':
      return {
        subject: 'Your account has been permanently banned',
        html: shell(
          heading('Your account has been permanently banned') +
            body(
              `${greeting(params.display_name)} Your account can no longer use Sensorium. If you think this is a mistake, you can appeal.`,
            ) +
            (params.appeal_url ? cta(params.appeal_url, 'Appeal this decision') : '') +
            footnote(['Appeals are reviewed by our team and we will email you once a decision is made.']),
        ),
      }

    case 'restriction-lifted':
      return {
        subject: 'Your account is active again',
        html: shell(
          heading('Your account is active again') +
            body(`${greeting(params.display_name)} Your account is no longer restricted. Thanks for your patience.`),
        ),
      }

    case 'report-received':
      return {
        subject: 'We received your report',
        html: shell(
          heading('We received your report') +
            body(
              `${greeting(params.display_name)} Thanks for letting us know. Your report is in our queue and will be reviewed by the team.`,
            ) +
            footnote(['We do not share the outcome of a report with you to protect everyone involved.']),
        ),
      }

    case 'report-resolved': {
      const outcome =
        params.outcome === 'actioned'
          ? 'The team reviewed your report and took action.'
          : 'The team reviewed your report and decided no action was needed.'
      return {
        subject: 'Update on your report',
        html: shell(
          heading('Update on your report') +
            body(`${greeting(params.display_name)} ${outcome}`) +
            footnote(['We keep the details of a decision private to protect everyone involved.']),
        ),
      }
    }

    case 'appeal-received':
      return {
        subject: 'We received your appeal',
        html: shell(
          heading('We received your appeal') +
            body(
              `${greeting(params.display_name)} Your appeal is in review. We will email you once a decision has been made.`,
            ) +
            (params.appeal_url ? cta(params.appeal_url, 'View your appeal') : ''),
        ),
      }

    case 'appeal-resolved': {
      const verdict = params.accepted
        ? 'Your appeal was accepted and your account is active again.'
        : 'Your appeal was reviewed, but the decision on your account stands.'
      return {
        subject: params.accepted ? 'Your appeal was accepted' : 'Update on your appeal',
        html: shell(
          heading('Update on your appeal') +
            body(`${greeting(params.display_name)} ${verdict}`) +
            (params.response ? body(`The team wrote: ${esc(params.response)}`) : '') +
            (params.appeal_url ? cta(params.appeal_url, 'View your appeal') : ''),
        ),
      }
    }

    default:
      throw new Error(`Unknown email template: ${template satisfies never}`)
  }
}
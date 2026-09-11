import { useModerationPolicies, type PolicyTemplateRow } from '../../../features/admin-moderation'

export interface PolicyChoice {
  categoryCode: string | null
  template: PolicyTemplateRow | null
}

export function PolicySelector({
  choice,
  onChange,
  onUseNotice,
}: {
  choice: PolicyChoice
  onChange: (choice: PolicyChoice) => void
  onUseNotice: (notice: string) => void
}) {
  const policies = useModerationPolicies()
  const rows = policies.data ?? []

  const categories = rows.filter(
    (row, index, all) => all.findIndex((r) => r.category_code === row.category_code) === index,
  )
  const templates = rows.filter((row) => row.category_code === choice.categoryCode)

  if (policies.isLoading) {
    return <p className="text-xs text-on-surface-variant">Loading policy guidance…</p>
  }

  if (policies.isError || rows.length === 0) {
    return null
  }

  const selectedCategory = categories.find((c) => c.category_code === choice.categoryCode) ?? null

  return (
    <div className="space-y-2 rounded-xl bg-surface-container/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-on-surface-variant">Policy</span>
          <select
            aria-label="Policy category"
            value={choice.categoryCode ?? ''}
            onChange={(e) => {
              const code = e.target.value || null
              onChange({ categoryCode: code, template: null })
            }}
            className="rounded-pill border border-outline-variant/60 bg-surface px-2.5 py-1.5 text-sm font-semibold text-on-surface"
          >
            <option value="">Custom / no policy</option>
            {categories.map((c) => (
              <option key={c.category_code} value={c.category_code}>
                {c.category_title}
              </option>
            ))}
          </select>
        </label>
        {templates.length > 0 && (
          <label className="flex items-center gap-1.5 text-sm">
            <span className="font-medium text-on-surface-variant">Template</span>
            <select
              aria-label="Notice template"
              value={choice.template?.template_code ?? ''}
              onChange={(e) => {
                const template = templates.find((t) => t.template_code === e.target.value) ?? null
                onChange({ categoryCode: choice.categoryCode, template })
              }}
              className="rounded-pill border border-outline-variant/60 bg-surface px-2.5 py-1.5 text-sm font-semibold text-on-surface"
            >
              <option value="">None</option>
              {templates.map((t) => (
                <option key={t.template_code} value={t.template_code}>
                  {t.template_title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {selectedCategory && (
        <p className="text-xs leading-5 text-on-surface-variant">
          Recommended: {selectedCategory.recommended_action}
        </p>
      )}
      {choice.template && (
        <div className="space-y-2 rounded-xl bg-surface p-3">
          <p className="text-xs leading-5 text-on-surface-variant">{choice.template.internal_guidance}</p>
          <p className="text-xs leading-5 text-on-surface">“{choice.template.user_notice}”</p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onUseNotice(choice.template?.user_notice ?? '')}
              className="rounded-pill border border-outline-variant/60 px-3 py-1.5 text-xs font-semibold text-on-surface transition-colors hover:bg-surface-container"
            >
              Use this notice
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

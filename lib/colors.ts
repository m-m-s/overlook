// Palette per CLAUDE.md visual design language. Sprint v1 = light theme only.

export const colors = {
  parchment: '#EFEEEA',
  parchmentDark: '#1F1E1B', // dark variant TBD per spec; placeholder
  ink: '#1F1E1B',
  inkMuted: '#6B6864',
  divider: '#C9C5BC',
} as const;

// Status colors — left side of top edge gradient
export const statusColors: Record<string, string> = {
  ready: '#7A8B5C', // olive
  supplies: '#B5704A', // terracotta
  in_progress: '#9B7A8B', // dusty mauve
  research: '#6B7C85', // faded slate
  done: 'transparent',
};

// Urgency colors — right side of top edge gradient (warm temperature scale)
export const urgencyColors: Record<string, string> = {
  today: '#C0392B', // warm red
  expires_soon: '#C0392B',
  this_week: '#D87538', // warm orange
  this_month: '#C9A14B', // warm gold
  this_season: '#C9A14B',
  this_year: '#B5A485', // faded warm
  someday: '#B5A485',
};

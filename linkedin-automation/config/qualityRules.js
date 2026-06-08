export const QUALITY_RULES = {
  hardRejections: [
    {
      id: 'starts_with_i',
      description: 'Post opens with "I" as the first word',
      test: (text) => text.trim().startsWith('I '),
      severity: 'REJECT',
    },
    {
      id: 'too_short',
      description: 'Post is under 150 characters',
      test: (text) => text.trim().length < 150,
      severity: 'REJECT',
    },
    {
      id: 'too_long',
      description: 'Post exceeds 1,300 characters',
      test: (text) => text.trim().length > 1300,
      severity: 'REJECT',
    },
    {
      id: 'weak_cta',
      description: 'Ends with generic "What do you think?" without context',
      test: (text) => /what do you think\??$/i.test(text.trim()),
      severity: 'REJECT',
    },
  ],

  buzzwordBan: [
    'synergy', 'leverage', 'game-changer', 'game changer',
    'hustle', 'crush it', 'circle back', 'bandwidth',
    'rockstar', 'ninja', 'thought leader', 'paradigm shift',
    'move the needle', 'deep dive', 'low-hanging fruit',
    'boil the ocean', 'disruption', 'disruptive',
    'value-add', 'value add', 'best-in-class',
  ],

  genericityCheck: {
    description: 'Post is generic enough to have been written by anyone',
    flags: [
      'every professional should',
      'in today\'s fast-paced world',
      'the pandemic taught us',
      'in this day and age',
      'at the end of the day',
      'it\'s not what you know',
    ],
  },

  requiredElements: [
    {
      id: 'has_specific_angle',
      description: 'Must contain a specific insight, data point, or personal angle',
      checkPrompt: 'Does this post contain at least one specific data point, personal anecdote, or unique professional insight that only Victor could write? Answer YES or NO.',
    },
    {
      id: 'has_audience_value',
      description: 'Must offer clear value to finance, NFP, or BI professionals',
      checkPrompt: 'Would a finance professional, NFP sector leader, or Power BI practitioner find this post useful or interesting? Answer YES or NO.',
    },
  ],

  minConfidenceToPass: 7,
};

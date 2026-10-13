// Made-up sample data, taken from templates/sample/ in the Job Search HQ repo (Alex Rivera).
// Dates are shown relative to "today" so the video never goes stale.

export type Job = {
  company: string;
  role: string;
  stage: string;
  next: string;
  due: string;
  priority: 'A' | 'B' | 'C';
  unclear?: boolean;
};

export const jobs: Job[] = [
  { company: 'Acme Corp', role: 'Senior Product Marketing Manager, Analytics', stage: 'Interviewing', next: 'Interview', due: 'tomorrow', priority: 'A' },
  { company: 'Initech', role: 'Product Marketing Lead', stage: 'Screening', next: 'Schedule interview', due: 'due today', priority: 'A' },
  { company: 'Hooli', role: 'Senior Product Marketing Manager', stage: 'Applied', next: 'Follow up with Rae Fox', due: 'due today', priority: 'B' },
  { company: 'Vandelay Industries', role: 'Senior Product Marketing Manager', stage: 'To apply', next: 'Review package and submit', due: 'due today', priority: 'B' },
  { company: 'Umbrella', role: 'Product Marketing Manager, Platform', stage: 'Offer', next: 'Respond to offer', due: 'in 3 days', priority: 'B' },
  { company: 'Umbrella', role: 'Senior PMM, Security', stage: 'To apply', next: 'Decide: apply or skip', due: 'date unclear', priority: 'C', unclear: true },
];

export const leads = [
  { company: 'Hooli', role: 'Product Marketing Lead, Analytics', where: 'Denver, CO · hybrid', pay: '$155,000 – $175,000', fit: 'A', why: 'Analytics launches, like Northwind Insights' },
  { company: 'Acme Corp', role: 'Senior PMM, Data Platform', where: 'Remote (US)', pay: 'No pay range posted', fit: 'B', why: 'Same team family as the Acme role in progress' },
  { company: 'Hooli', role: 'Associate Product Marketing Manager', where: 'Denver, CO · hybrid', pay: '$85,000 – $95,000', fit: 'C', why: "Junior for Alex's level" },
];

export const alerts = [
  'Acme Corp interview tomorrow. Your brief is ready.',
  'Follow up with Rae Fox at Hooli (due today).',
  'Umbrella offer: answer due in 5 days.',
];

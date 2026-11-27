import { Participant, RaffleSettings, ThemeId } from '../types/raffle';

export const DEFAULT_PARTICIPANTS: Participant[] = [
  { id: 'p-1', name: 'Aria Winterbourne', department: 'Vonotec Engineering', title: 'Senior Developer', weight: 1, active: true },
  { id: 'p-2', name: 'Lucas Vance', department: 'Vonotec Product', title: 'Product Manager', weight: 1, active: true },
  { id: 'p-3', name: 'Sophia Reyes', department: 'Vonotec Marketing', title: 'Brand Strategist', weight: 1, active: true },
  { id: 'p-4', name: 'Marcus Chen', department: 'Vonotec Operations', title: 'Operations Lead', weight: 1, active: true },
  { id: 'p-5', name: 'Elena Rostova', department: 'Vonotec Finance', title: 'Financial Analyst', weight: 1, active: true },
  { id: 'p-6', name: 'Gabriel Santos', department: 'Vonotec Engineering', title: 'Backend Engineer', weight: 1, active: true },
  { id: 'p-7', name: 'Hannah Kim', department: 'Vonotec People & Culture', title: 'HR Specialist', weight: 1, active: true },
  { id: 'p-8', name: 'Noah Patel', department: 'Vonotec Data Science', title: 'Data Analyst', weight: 1, active: true },
  { id: 'p-9', name: 'Chloe Laurent', department: 'Vonotec Creative Studio', title: 'UI/UX Designer', weight: 1, active: true },
  { id: 'p-10', name: 'Daniel Morales', department: 'Vonotec Customer Success', title: 'Account Manager', weight: 1, active: true },
  { id: 'p-11', name: 'Isabella Cruz', department: 'Vonotec Engineering', title: 'Frontend Engineer', weight: 1, active: true },
  { id: 'p-12', name: 'Liam OConnor', department: 'Vonotec IT & Security', title: 'Systems Admin', weight: 1, active: true },
  { id: 'p-13', name: 'Maya Lin', department: 'Vonotec Product', title: 'Product Designer', weight: 1, active: true },
  { id: 'p-14', name: 'Ethan Brooks', department: 'Vonotec Sales', title: 'Sales Executive', weight: 1, active: true },
  { id: 'p-15', name: 'Zara Al-Mansoor', department: 'Vonotec Strategy', title: 'Business Analyst', weight: 1, active: true },
  { id: 'p-16', name: 'Oliver Takahashi', department: 'Vonotec QA & Release', title: 'QA Engineer', weight: 1, active: true },
];

export const DEFAULT_SETTINGS: RaffleSettings = {
  eventTitle: 'Paskong Vonotec',
  eventSubtitle: 'STANDING TALL TOGETHER: A CHRISTMAS OF GRATITUDE',
  theme: 'christmas',
  removeWinnerOnDraw: true,
  dramaIntensity: 0.55,
  raceDurationSeconds: 20,
  soundEnabled: true,
  currentRoundLabel: '',
};

export const THEME_CONFIG: Record<
  ThemeId,
  {
    name: string;
    defaultTitle: string;
    defaultSubtitle: string;
  }
> = {
  christmas: {
    name: 'Paskong Vonotec Skyline',
    defaultTitle: 'Paskong Vonotec',
    defaultSubtitle: 'STANDING TALL TOGETHER: A CHRISTMAS OF GRATITUDE',
  },
  celestial: {
    name: 'Midnight Metro Skyline',
    defaultTitle: 'Vonotec Skyscraper Race',
    defaultSubtitle: 'STANDING TALL TOGETHER: A CHRISTMAS OF GRATITUDE',
  },
};

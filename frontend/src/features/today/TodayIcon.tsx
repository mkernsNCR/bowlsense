type IconName = 'chevron' | 'close' | 'league' | 'location' | 'play' | 'retry' | 'trendDown' | 'trendUp'

export function TodayIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <><path d="m7 7 10 10" /><path d="M17 7 7 17" /></>,
    league: <><path d="M8 3h8v4a4 4 0 0 1-8 0V3Z" /><path d="M8 5H4v1a4 4 0 0 0 4 4M16 5h4v1a4 4 0 0 1-4 4M12 11v5M8 21h8M9 16h6" /></>,
    location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    play: <><path d="M8 5v14l11-7Z" /><path d="M4 5v14" /></>,
    retry: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 0-2 5" /></>,
    trendDown: <><path d="m4 7 6 6 4-4 6 6" /><path d="M15 15h5v-5" /></>,
    trendUp: <><path d="m4 17 6-6 4 4 6-6" /><path d="M15 9h5v5" /></>,
  }

  return (
    <svg className="today-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

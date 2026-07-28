import { useState } from 'react'

type FAQItem = {
  question: string
  answer: string
}

type FAQSection = {
  title: string
  items: FAQItem[]
}

const sections: FAQSection[] = [
  {
    title: 'Getting Started',
    items: [
      {
        question: 'How do I log a bowling session?',
        answer:
          'Go to Sessions → New Session. Enter the date, location, and lane numbers. Then tap into the session to log individual games with your scores, strikes, spares, and splits.',
      },
      {
        question: 'How do I add my bowling balls?',
        answer:
          "Go to Balls (via the desktop nav or Settings → Balls). Use the search box to find your ball by name from the bowwwl.com database — it'll auto-fill all the specs. Or use Manual Entry if your ball isn't listed.",
      },
      {
        question: 'How do I set my name and default ball?',
        answer:
          'Go to Settings. You can set your bowler name (shows on the dashboard), your default ball (pre-selected when logging games), and your home lanes (pre-fills the location when creating sessions).',
      },
    ],
  },
  {
    title: 'Tracking Your Game',
    items: [
      {
        question: 'What do strikes, spares, and splits mean in the app?',
        answer:
          'When logging a game, enter the number of strikes (frames where you knocked all 10 on the first ball), spares (frames where you got the remaining pins on the second ball), and splits (difficult spare leaves). These feed into your strike rate and spare rate stats.',
      },
      {
        question: 'How is my average calculated?',
        answer:
          'Your average is the total of all game scores divided by the number of games logged across all open bowling sessions. League and tournament games are tracked separately.',
      },
      {
        question: 'What is the score trend chart?',
        answer:
          "The chart on the dashboard shows your last 20 games in order, with a dashed line at your overall average. It helps you see if you're improving over time.",
      },
    ],
  },
  {
    title: 'Leagues',
    items: [
      {
        question: 'How do I set up a league?',
        answer:
          'Go to Leagues → New League. Enter the league name, location, season, day of week, and how many games you bowl per week (usually 3). Once created, tap into the league each week to log your games and opponent result.',
      },
      {
        question: 'How do I log a league week?',
        answer:
          'Open your league, tap "+ Log This Week". Enter the date, opponent name, your scores for each game, and whether you won or lost that week.',
      },
      {
        question: 'How is my league average tracked separately?',
        answer:
          "League stats (average, W/L record, high game) are calculated only from games logged under that league. They don't affect your open bowling stats.",
      },
    ],
  },
  {
    title: 'Tournaments',
    items: [
      {
        question: 'How do I track a tournament?',
        answer:
          'Go to Tournaments → New Tournament. Enter the event name, date, format (Singles, Doubles, etc.), entry fee, and prize fund. Then log each game as you bowl. Your series total and placement are shown on the detail page.',
      },
      {
        question: 'What is the net gain/loss?',
        answer: 'If you enter both an entry fee and a prize fund (winnings), the app shows your net: prize minus entry fee. Positive = profit 🎉',
      },
    ],
  },
  {
    title: 'Data & Backup',
    items: [
      {
        question: 'How do I back up my data?',
        answer:
          'Go to Settings → scroll to the Data section → tap Export Backup. It downloads a JSON file with all your sessions, games, balls, leagues, and tournaments.',
      },
      {
        question: 'How do I restore from a backup?',
        answer:
          'Go to Settings → Data → Import Backup. Select your backup JSON file. This will replace ALL current data with the backup — use with caution.',
      },
    ],
  },
]

const tips = [
  '💡 Log your ball for every game — the app will track which balls perform best for you',
  '💡 Use the Stats page to see your score distribution and spot patterns',
  "💡 Set your Home Lanes in Settings so you don't have to type the location every time",
  '💡 Your perfect games (300s) are tracked automatically on the Stats page',
]

export default function HelpPage() {
  const [openIndexes, setOpenIndexes] = useState<number[]>([])

  function toggle(index: number) {
    setOpenIndexes((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]))
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ marginBottom: 18 }}>Help &amp; FAQ</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Quick answers and how-to steps for sessions, stats, leagues, tournaments, and backups.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sections.map((section, sectionIndex) => {
          const sectionStartIndex = sections
            .slice(0, sectionIndex)
            .reduce((count, previousSection) => count + previousSection.items.length, 0)

          return (
            <section key={section.title}>
              <h2 style={{ marginBottom: 10 }}>{section.title}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.items.map((item, itemIndex) => {
                  const index = sectionStartIndex + itemIndex
                  const isOpen = openIndexes.includes(index)

                  return (
                    <div className="card" key={item.question} style={{ padding: 0, overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => toggle(index)}
                        style={{
                          width: '100%',
                          minHeight: 48,
                          background: 'transparent',
                          border: 'none',
                          color: isOpen ? 'var(--accent)' : 'var(--muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          textAlign: 'left',
                          gap: 12,
                          cursor: 'pointer',
                          padding: '14px 16px',
                          fontWeight: 700,
                        }}
                        aria-expanded={isOpen}
                      >
                        <span>{item.question}</span>
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: 14,
                            flexShrink: 0,
                          }}
                        >
                          {isOpen ? 'Hide' : 'Show'}
                        </span>
                      </button>

                      {isOpen && (
                        <div
                          style={{
                            padding: '0 16px 16px',
                            color: 'var(--text)',
                            borderTop: '1px solid rgba(167, 139, 250, 0.2)',
                            lineHeight: 1.5,
                          }}
                        >
                          {item.answer}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        <section>
          <h2 style={{ marginBottom: 10 }}>Tips</h2>
          <div className="card">
            <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tips.map((tip) => (
                <li key={tip} style={{ color: 'var(--text)' }}>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import Dashboard from './pages/Dashboard.tsx'
import Sessions from './pages/Sessions.tsx'
import SessionDetail from './pages/SessionDetail.tsx'
import NewSession from './pages/NewSession.tsx'
import Balls from './pages/Balls.tsx'
import Stats from './pages/Stats.tsx'
import HelpPage from './pages/Help.tsx'
import SettingsPage from './pages/Settings.tsx'
import LeaguesPage from './pages/Leagues.tsx'
import PublicLeague from './pages/PublicLeague.tsx'
import PublicLeagueLeaderboard from './pages/PublicLeagueLeaderboard.tsx'
import TournamentsPage from './pages/Tournaments.tsx'
import ArsenalsPage from './pages/Arsenals.tsx'
import PerfectGames from './pages/PerfectGames.tsx'
import PerfectGameShare from './pages/PerfectGameShare.tsx'
import PinLeavesPage from './pages/PinLeaves.tsx'
import ScoreCalculatorPage from './pages/ScoreCalculator.tsx'
import QuickStart from './pages/QuickStart.tsx'
import PublicProfile from './pages/PublicProfile.tsx'
import ShareScore from './pages/ShareScore.tsx'
import SessionShare from './pages/SessionShare.tsx'
import LeagueShare from './pages/LeagueShare.tsx'
import LeagueRecap from './pages/LeagueRecap.tsx'
import LeagueRecapShare from './pages/LeagueRecapShare.tsx'
import LeagueWeekShare from './pages/LeagueWeekShare.tsx'
import TournamentShare from './pages/TournamentShare.tsx'
import TournamentStandings from './pages/TournamentStandings.tsx'
import TournamentStandingsShare from './pages/TournamentStandingsShare.tsx'

import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

export function SessionDetailWithKey() {
  const { id } = useParams()
  return <SessionDetail key={id} />
}

const queryClient = new QueryClient()

export function Root() {
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Service worker registration failed:', error)
      })
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <App>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/sessions" element={<Sessions />} />
              <Route path="/sessions/:id" element={<SessionDetailWithKey />} />
              <Route path="/sessions/new" element={<NewSession />} />
              <Route path="/balls" element={<Balls />} />
              <Route path="/leagues" element={<LeaguesPage />} />
              <Route path="/leagues/new" element={<LeaguesPage />} />
              <Route path="/leagues/:id" element={<LeaguesPage />} />
              <Route path="/leagues/:id/public" element={<PublicLeague />} />
              <Route path="/leagues/:id/leaderboard" element={<PublicLeagueLeaderboard />} />
              <Route path="/leagues/:id/share" element={<LeagueShare />} />
              <Route path="/leagues/:id/recap" element={<LeagueRecap />} />
              <Route path="/leagues/:id/recap/share" element={<LeagueRecapShare />} />
              <Route path="/leagues/:id/week/:weekId/share" element={<LeagueWeekShare />} />
              <Route path="/tournaments" element={<TournamentsPage />} />
              <Route path="/tournaments/new" element={<TournamentsPage />} />
              <Route path="/tournaments/:id" element={<TournamentsPage />} />
              <Route path="/tournaments/:id/edit" element={<TournamentsPage />} />
              <Route path="/arsenals" element={<ArsenalsPage />} />
              <Route path="/arsenals/new" element={<ArsenalsPage />} />
              <Route path="/arsenals/:id" element={<ArsenalsPage />} />
              <Route path="/perfect-games" element={<PerfectGames />} />
              <Route path="/perfect-games/:id" element={<PerfectGameShare />} />
              <Route path="/quick" element={<QuickStart />} />

              <Route path="/pin-leaves" element={<PinLeavesPage />} />
              <Route path="/score-calculator" element={<ScoreCalculatorPage />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/help" element={<HelpPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/bowl" element={<PublicProfile />} />
              <Route path="/score/:gameId" element={<ShareScore />} />
              <Route path="/sessions/:id/share" element={<SessionShare />} />
              <Route path="/tournaments/:id/share" element={<TournamentShare />} />
              <Route path="/tournaments/:id/standings" element={<TournamentStandings />} />
              <Route path="/tournaments/:id/standings/share" element={<TournamentStandingsShare />} />
            </Routes>
          </App>
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)

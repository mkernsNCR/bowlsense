import { useMutation, useQueryClient } from '@tanstack/react-query'

type CompetitionArea = 'leagues' | 'tournaments'

export async function competitionJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = init === undefined ? await fetch(input) : await fetch(input, init)
  if (!response.ok) throw new Error(`Competition request failed (${response.status})`)
  return response.json() as Promise<T>
}

export function useCompetitionArchive({
  area,
  id,
  onSuccess,
}: {
  area: CompetitionArea
  id: string
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const singular = area === 'leagues' ? 'league' : 'tournament'

  return useMutation({
    mutationFn: (restore: boolean) => competitionJson(
      `/api/${area}/${id}/${restore ? 'unarchive' : 'archive'}`,
      { method: 'POST' },
    ),
    onSuccess: () => {
      onSuccess()
      queryClient.invalidateQueries({ queryKey: [singular, id] })
      queryClient.invalidateQueries({ queryKey: [area] })
    },
  })
}

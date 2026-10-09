import { StickyNote } from 'lucide-react'
import { DetailCard } from './detail-card'

export function NotesCard({ notes }: { notes: string }) {
	return (
		<DetailCard icon={StickyNote} title="Notes">
			<p className="whitespace-pre-line wrap-break-word">{notes}</p>
		</DetailCard>
	)
}

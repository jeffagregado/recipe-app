import { StickyNote } from 'lucide-react'
import { DetailCard } from './detail-card'

/** A quieter aside after the steps. */
export function NotesCard({ notes }: { notes: string }) {
	return (
		<DetailCard icon={StickyNote} title="Notes" variant="plain">
			<p className="border-l-2 border-primary/40 pl-4 leading-relaxed text-muted-foreground whitespace-pre-line wrap-break-word">{notes}</p>
		</DetailCard>
	)
}

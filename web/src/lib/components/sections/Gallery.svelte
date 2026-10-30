<script lang="ts">
	type Shot = {
		src: string;
		alt: string;
		caption: string;
		width: number;
		height: number;
	};

	const shots: readonly Shot[] = [
		{
			src: '/screenshots/note-markdown.webp',
			alt: 'A Markdown note with tables, a checklist, and a rendered Mermaid diagram',
			caption: 'Markdown, rendered live',
			width: 1600,
			height: 1025
		},
		{
			src: '/screenshots/kanban.webp',
			alt: 'The Kanban task board with Backlog, To do, In progress, In review, and Done columns',
			caption: 'Tasks as a board',
			width: 1600,
			height: 1025
		},
		{
			src: '/screenshots/gantt.webp',
			alt: 'The Gantt view showing task bars and Blocked-by badges',
			caption: 'Gantt with dependencies',
			width: 1600,
			height: 1025
		},
		{
			src: '/screenshots/graph.webp',
			alt: 'The workspace graph showing notes, tasks, and the links between them',
			caption: 'The graph of your notes',
			width: 1600,
			height: 1025
		},
		{
			src: '/screenshots/journal.webp',
			alt: 'A daily journal entry with a Focus list and notes',
			caption: 'A daily journal page',
			width: 1600,
			height: 1025
		},
		{
			src: '/screenshots/command-palette.webp',
			alt: 'The command palette searching notes and tasks',
			caption: 'Command palette (Ctrl K)',
			width: 1600,
			height: 1025
		}
	];
</script>

<section id="tour" class="anchor-offset border-b border-border/60">
	<div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
		<div class="max-w-2xl">
			<h2 class="text-headline-lg text-foreground sm:text-headline-xl">A look around</h2>
			<p class="mt-3 text-body-lg text-on-surface-variant">
				Notes, tasks, and the graph between them — each view built for a different kind of
				attention.
			</p>
		</div>

		<ul class="mt-10 grid gap-x-5 gap-y-8 sm:grid-cols-2">
			{#each shots as shot (shot.src)}
				<li>
					<figure>
						<div class="overflow-hidden rounded-lg border border-border/70 bg-card">
							<!--
								Below-the-fold images are lazy and decoded off the main
								thread; explicit dimensions keep the grid from reflowing.
							-->
							<img
								src={shot.src}
								alt={shot.alt}
								width={shot.width}
								height={shot.height}
								loading="lazy"
								decoding="async"
								class="block h-auto w-full"
							/>
						</div>
						<figcaption class="mt-2.5 text-label-md text-on-surface-variant">
							{shot.caption}
						</figcaption>
					</figure>
				</li>
			{/each}
		</ul>
	</div>
</section>

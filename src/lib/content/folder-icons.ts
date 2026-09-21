import {
	Archive,
	BookOpen,
	Boxes,
	Briefcase,
	Camera,
	Code2,
	Coffee,
	Compass,
	Flame,
	FlaskConical,
	Folder,
	Gem,
	Globe,
	GraduationCap,
	Heart,
	LayoutGrid,
	Leaf,
	Lightbulb,
	Music,
	Palette,
	Rocket,
	Sparkles,
	Star,
	Target,
	User,
	Zap,
} from '@lucide/svelte';

export type FolderIconComponent = typeof Folder;

export const folderIcons: { id: string; icon: FolderIconComponent }[] = [
	{ id: 'folder', icon: Folder },
	{ id: 'briefcase', icon: Briefcase },
	{ id: 'lightbulb', icon: Lightbulb },
	{ id: 'code', icon: Code2 },
	{ id: 'user', icon: User },
	{ id: 'archive', icon: Archive },
	{ id: 'boxes', icon: Boxes },
	{ id: 'star', icon: Star },
	{ id: 'heart', icon: Heart },
	{ id: 'book-open', icon: BookOpen },
	{ id: 'music', icon: Music },
	{ id: 'flask', icon: FlaskConical },
	{ id: 'globe', icon: Globe },
	{ id: 'flame', icon: Flame },
	{ id: 'target', icon: Target },
	{ id: 'coffee', icon: Coffee },
	{ id: 'camera', icon: Camera },
	{ id: 'palette', icon: Palette },
	{ id: 'rocket', icon: Rocket },
	{ id: 'leaf', icon: Leaf },
	{ id: 'graduation-cap', icon: GraduationCap },
	{ id: 'sparkles', icon: Sparkles },
	{ id: 'compass', icon: Compass },
	{ id: 'gem', icon: Gem },
	{ id: 'zap', icon: Zap },
	{ id: 'grid', icon: LayoutGrid },
];

export const defaultFolderIcons: Record<string, FolderIconComponent> = {
	all: Boxes,
	work: Briefcase,
	ideas: Lightbulb,
	dev: Code2,
	personal: User,
	archive: Archive,
};

const iconMap = new Map(folderIcons.map((entry) => [entry.id, entry.icon]));

export function resolveFolderIcon(id?: string | null): FolderIconComponent | null {
	if (!id) return null;
	return iconMap.get(id) ?? null;
}